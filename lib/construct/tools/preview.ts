import "server-only";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { type BuildEvent, buildProject, isBuilding } from "../../build";
import type { Format } from "../../build/assemble";
import { buildLogFile, distFile, readBuildInfo, rendersDir } from "../../store";
import { renderedPage } from "../transcript";
import type { Render } from "../types";
import { bool, excerpt, int, rangeProps, someOf, str, type Tool, ToolError, type ToolOutput, tool } from "./core";

// Exporting the book and looking at what came out: the PDF's pages as images
// (pdftoppm), where text landed (pdftotext), the EPUB's files (unzip). The
// pages are kept in construct/renders/, so the panel shows the writer the
// same pages the agent saw.

const run = promisify(execFile);

/** Run `cmd` and answer its output; failing, a ToolError with what it said. */
async function exec(cmd: string, args: string[]): Promise<string> {
  try {
    return (await run(cmd, args, { maxBuffer: 64 * 1024 * 1024, encoding: "utf8", timeout: 120_000 })).stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string | Buffer };
    if (e.code === "ENOENT") throw new ToolError(`${cmd} isn't installed on the server.`);
    throw new ToolError(`${cmd} failed: ${String(e.stderr ?? e.message).trim().slice(0, 500)}`);
  }
}

/** The last export's file of `format`, and when it was made. */
async function output(id: string, format: Format) {
  const info = await readBuildInfo(id);
  const name = info?.files.find((f) => f.name.endsWith(`.${format}`))?.name;
  const file = name && (await distFile(id, name));
  if (!info || !file) throw new ToolError(`There's no ${format.toUpperCase()} yet: export_book${format === "epub" ? ' with formats ["epub"]' : ""} first.`);
  return { file, info };
}

// ─── Export ──────────────────────────────────────────────────

const exportTool = tool({
  name: "export_book",
  description:
    "Export the book with its settings and files as they are now (the manuscript as last pulled), and answer with how it went: the PDF's page count, the warnings and errors, epubcheck's counts. The PDF by default; add epub when you're working on it.",
  properties: { formats: someOf(["pdf", "epub"], 'What to export (default ["pdf"]).') },
  readOnly: false,
  async run(args, ctx) {
    const formats: Format[] = args.formats ?? ["pdf"];
    if (isBuilding(ctx.projectId)) throw new ToolError("An export of this book is running already: wait a moment and try again.");
    const problems: string[] = [];
    const started = Date.now();
    let info: Awaited<ReturnType<typeof buildProject>>;
    try {
      info = await buildProject(
        ctx.projectId,
        formats,
        (e: BuildEvent) => {
          if (e.t === "log" && e.level !== "info") problems.push(`[${e.level}] ${e.line}`);
        },
        { pull: false },
      );
    } catch (err) {
      ctx.onChange(["export"]);
      const shown = problems.slice(-40);
      throw new ToolError(`The export failed: ${(err as Error).message}${shown.length ? `\n${shown.join("\n")}` : ""}\n(read_build_log has the whole log.)`);
    }
    ctx.onChange(["export"]);
    const lines = [`Exported ${formats.join(" and ").toUpperCase()} in ${((Date.now() - started) / 1000).toFixed(1)} s.`];
    if (formats.includes("pdf") && info.pdfPages) lines.push(`PDF: ${info.pdfPages} pages.`);
    if (formats.includes("epub") && info.epubcheck) {
      const c = info.epubcheck;
      lines.push(`epubcheck: ${c.fatals} fatal, ${c.errors} errors, ${c.warnings} warnings.`);
    }
    if (problems.length) {
      lines.push(`${problems.length} warning${problems.length > 1 ? "s" : ""} and errors${problems.length > 40 ? " (the first 40)" : ""}:`, ...problems.slice(0, 40));
    } else lines.push("No warnings.");
    return lines.join("\n");
  },
});

const buildLogTool = tool({
  name: "read_build_log",
  description: "Read the last export's log, numbered by line; `problems` for just its warnings and errors.",
  properties: { problems: bool("Only the warnings and errors."), ...rangeProps },
  readOnly: true,
  async run({ problems, ...range }, ctx) {
    const log = await readFile(buildLogFile(ctx.projectId), "utf8").catch(() => null);
    if (log === null) throw new ToolError("There's no export yet.");
    const text = problems ? log.split("\n").filter((l) => /^\[(warn|error)\]/.test(l)).join("\n") : log;
    return text.trim() ? excerpt(text, range) : "No warnings or errors.";
  },
});

// ─── The PDF's pages ─────────────────────────────────────────

const MAX_PAGES = 8;
const DPI = { default: 60, max: 150 };

/** "1-3, 8" → [1, 2, 3, 8], within the PDF's `count` pages, at most MAX_PAGES. */
export function parsePages(spec: string, count: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(/[\s,]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:[-–](\d+))?$/);
    if (!m) throw new ToolError(`"${part}" isn't a page or a range like 4-7.`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from) throw new ToolError(`"${part}" isn't a page range.`);
    if (from > count) throw new ToolError(`The PDF has ${count} pages.`);
    for (let p = from; p <= Math.min(to, count); p++) if (!out.includes(p)) out.push(p);
  }
  if (!out.length) throw new ToolError("Which pages? e.g. \"1-4\" or \"7, 12\".");
  if (out.length > MAX_PAGES) throw new ToolError(`At most ${MAX_PAGES} pages at a time: look at a few, then the next few.`);
  return out;
}

/** Keep the renders of the last few exports; older ones go. */
async function prune(dir: string, keep: Set<string>) {
  const stamps = new Set<string>();
  const names = await readdir(dir).catch(() => [] as string[]);
  for (const n of names) stamps.add(n.split("-")[0]);
  const old = [...stamps].sort().slice(0, -20).filter((s) => !keep.has(s));
  for (const n of names) if (old.includes(n.split("-")[0])) await unlink(path.join(dir, n)).catch(() => {});
}

const renderTool = tool({
  name: "render_pages",
  description: `Look at pages of the last exported PDF: they come back as images. Pages are numbered from the PDF's first (its cover or title page), not by folio. At most ${MAX_PAGES} at a time; dpi ${DPI.default} by default (enough to judge a layout), up to ${DPI.max} for a detail. A spread is an even page and the odd one after it.`,
  properties: { pages: str('Pages: "5", "1-4", "10, 11, 24".'), dpi: int(`Resolution (default ${DPI.default}, at most ${DPI.max}).`) },
  required: ["pages"],
  readOnly: true,
  async run({ pages, dpi = DPI.default }, ctx): Promise<ToolOutput> {
    const { file, info } = await output(ctx.projectId, "pdf");
    const count = info.pdfPages ?? Number((await exec("pdfinfo", [file])).match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    const list = parsePages(pages, count);
    const r = Math.min(Math.max(dpi, 20), DPI.max);
    const dir = rendersDir(ctx.projectId);
    await mkdir(dir, { recursive: true });
    const stamp = info.at.toString(36);
    const renders: Render[] = [];
    const images: ToolOutput["images"] = [];
    for (const page of list) {
      const name = `${stamp}-p${page}-r${r}`;
      const png = path.join(dir, `${name}.png`);
      let data = await readFile(png).catch(() => null);
      if (!data) {
        await exec("pdftoppm", ["-f", String(page), "-l", String(page), "-r", String(r), "-png", "-singlefile", file, path.join(dir, name)]);
        data = await readFile(png);
      }
      renders.push({ page, file: `${name}.png` });
      images.push({ data: data.toString("base64"), mimeType: "image/png" });
    }
    await prune(dir, new Set([stamp]));
    return {
      text: `${count} pages in the PDF exported ${new Date(info.at).toISOString()}.\n${renders.map(renderedPage).join("\n")}`,
      images,
    };
  },
});

/** Text with its whitespace (line breaks, hyphenation aside) folded, for matching what pdftotext gives back. */
const fold = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const findTool = tool({
  name: "find_in_pdf",
  description: "Which pages of the last exported PDF some text is on (case-insensitive; a phrase broken across lines still matches, one broken across pages doesn't).",
  properties: { text: str("The text to look for.") },
  required: ["text"],
  readOnly: true,
  async run({ text }, ctx) {
    const { file } = await output(ctx.projectId, "pdf");
    const pages = (await exec("pdftotext", ["-layout", file, "-"])).split("\f");
    const q = fold(text);
    const hits: string[] = [];
    pages.forEach((p, i) => {
      const page = fold(p);
      const at = page.indexOf(q);
      if (at < 0 || hits.length >= 30) return;
      const from = Math.max(0, at - 60);
      hits.push(`Page ${i + 1}: …${page.slice(from, at + q.length + 60)}…`);
    });
    return hits.length ? hits.join("\n") : `"${text}" isn't in the PDF's text.`;
  },
});

// ─── The EPUB ────────────────────────────────────────────────

const readEpubTool = tool({
  name: "read_epub",
  description: "The last exported EPUB: without `path`, the files in it; with it, one text file (XHTML, CSS, OPF, nav), numbered by line.",
  properties: { path: str("A file in the EPUB, as listed (e.g. EPUB/text/ch001.xhtml)."), ...rangeProps },
  readOnly: true,
  async run({ path: inside, ...range }, ctx) {
    const { file } = await output(ctx.projectId, "epub");
    const names = (await exec("unzip", ["-Z1", file])).split("\n").filter(Boolean);
    if (!inside) return names.join("\n");
    if (!names.includes(inside)) throw new ToolError(`No "${inside}" in the EPUB: call read_epub without a path to list them.`);
    if (!/\.(x?html|css|opf|ncx|xml|txt)$/i.test(inside)) throw new ToolError("Only text files (XHTML, CSS, OPF, NCX, XML).");
    // unzip takes wildcards in names: escape them so it reads just this file.
    const text = await exec("unzip", ["-p", file, inside.replace(/[[\]*?\\]/g, "\\$&")]);
    return excerpt(text, range);
  },
});

export const previewTools: Tool[] = [exportTool, buildLogTool, renderTool, findTool, readEpubTool];
