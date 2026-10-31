import "server-only";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BookConfig } from "../config";
import { type BookFont, fontById } from "../fonts";
import { slugify } from "../ids";
import { countWords, hasParts, unclosedComment } from "../manuscript";
import { ASSETS_DIR, FONT_PATHS } from "../paths";
import { pull } from "../pen";
import {
  type BuildInfo,
  buildDir,
  distDir,
  readConfig,
  readCover,
  readCustom,
  readBuildInfo,
  readManuscript,
  readMatter,
  readPenLink,
} from "../store";
import { assemble, type Format, readerFormat } from "./assemble";
import { epubCss } from "./epubCss";
import { filterConfig, pandocMetadata } from "./metadata";
import { fontFiles, type Log, tool } from "./run";
import { typstDocument } from "./typst";

// One export of a book (docs/pipeline.md): the steps of mistaken-for-the-light's
// build.sh, driven by the book's settings. Works in <project>/build/, which
// it clears first, and moves what it made into <project>/dist/ at the end.

export type BuildEvent =
  | { t: "step"; name: string }
  | { t: "log"; line: string; level: "info" | "warn" | "error" }
  | { t: "done"; info: BuildInfo };

const g = globalThis as typeof globalThis & { __bookxBuilding?: Set<string> };
const building = (g.__bookxBuilding ??= new Set());

export const isBuilding = (id: string) => building.has(id);

/** `pull: false` skips the pull from pen even when the book asks for one (Construct's exports: the text stays put while it iterates). */
export async function buildProject(id: string, formats: Format[], send: (e: BuildEvent) => void, { pull = true }: { pull?: boolean } = {}): Promise<BuildInfo> {
  if (building.has(id)) throw new Error("an export of this book is already running");
  building.add(id);
  const logLines: string[] = [];
  const log: Log = (line, level = "info") => {
    logLines.push(level === "info" ? line : `[${level}] ${line}`);
    send({ t: "log", line, level });
  };
  const step = (name: string) => {
    logLines.push(`→ ${name}`);
    send({ t: "step", name });
  };
  try {
    return await run(id, formats, { log, step, logLines, pull });
  } finally {
    building.delete(id);
  }
}

interface Ctx {
  log: Log;
  step: (name: string) => void;
  logLines: string[];
  pull: boolean;
}

async function run(id: string, formats: Format[], { log, step, logLines, pull: canPull }: Ctx): Promise<BuildInfo> {
  const link = await readPenLink(id);
  if (link?.pullOnExport && canPull) {
    step("Pull from pen");
    try {
      const { change } = await pull(id);
      log(change ? `the manuscript changed: ${change.before.words.toLocaleString("en")} → ${change.after.words.toLocaleString("en")} words (the previous one is kept as a version)` : "the manuscript is up to date");
    } catch (err) {
      log(`${(err as Error).message} Exporting the manuscript as last pulled.`, "warn");
    }
  }
  const config = await readConfig(id);
  if (!config) throw new Error("not found");
  const manuscript = await readManuscript(id);
  const matter = await Promise.all(config.matter.map(async (section) => ({ section, body: await readMatter(id, section.id) })));
  const [customCss, customTyp, customLua] = await Promise.all([readCustom(id, "css"), readCustom(id, "typ"), readCustom(id, "lua")]);
  const slug = slugify(config.metadata.title, id);

  const work = buildDir(id);
  const out = path.join(work, "out");
  await rm(work, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const filterCfg = path.join(work, "filter-config.json");
  await writeFile(filterCfg, JSON.stringify(filterConfig(config)));
  const env = { BOOKX_FILTER_CONFIG: filterCfg, TYPST_FONT_PATHS: FONT_PATHS.join(":") };
  const filters = ["--lua-filter", path.join(ASSETS_DIR, "book.lua")];
  if (customLua.trim()) {
    await writeFile(path.join(work, "filter.lua"), customLua);
    filters.push("--lua-filter", path.join(work, "filter.lua"));
  }

  log(`${config.metadata.title}: ${countWords(manuscript).toLocaleString("en")} words`);
  const open = config.structure.stripComments ? unclosedComment(manuscript) : null;
  if (open) log(`line ${open}: a %% comment is never closed, so everything after it is left out (as Obsidian hides it)`, "warn");
  let ok = true;
  const info: Omit<BuildInfo, "files" | "at" | "ok"> = { words: countWords(manuscript) };

  // ------------------------------------------------------------- cover
  const cover = await readCover(id);
  let epubCover: string | null = null;
  let pdfCover: string | null = null;
  if (cover) {
    step("cover");
    try {
      pdfCover = `cover.${cover.ext}`;
      await copyFile(cover.file, path.join(/*turbopackIgnore: true*/ work, pdfCover));
      // EPUB readers want a raster cover in PNG or JPEG.
      if (cover.ext === "svg") {
        await tool("resvg", [pdfCover, "cover.png"], { cwd: work, log });
        epubCover = "cover.png";
        log("rasterized the SVG cover");
      } else if (cover.ext === "webp") {
        await tool("magick", [pdfCover, "cover.png"], { cwd: work, log });
        epubCover = "cover.png";
        pdfCover = "cover.png";
      } else {
        epubCover = pdfCover;
      }
      if (formats.includes("epub") && config.epub.coverJpeg) {
        // The store JPEG (KDP takes JPEG or TIFF, never PNG): opaque, sRGB,
        // no chroma subsampling so lettering keeps its edges, metadata stripped.
        const jpg = `${slug}-cover.jpg`;
        await tool(
          "magick",
          [epubCover, "-background", "white", "-alpha", "remove", "-alpha", "off", "-colorspace", "sRGB", "-strip", "-density", "300", "-units", "PixelsPerInch", "-quality", "92", "-sampling-factor", "1x1", path.join("out", jpg)],
          { cwd: work, log },
        );
        const size = (await tool("magick", ["identify", "-format", "%wx%h", path.join("out", jpg)], { cwd: work, log, quiet: true })).trim();
        log(`wrote ${jpg} (${size})`);
      }
    } catch (err) {
      ok = false;
      log(`cover: ${(err as Error).message}`, "error");
    }
  }

  // -------------------------------------------------------------- EPUB
  if (formats.includes("epub")) {
    step("EPUB");
    try {
      const epub = await buildEpub({ config, manuscript, matter, customCss, work, slug, env, filters, cover: epubCover, log });
      Object.assign(info, epub);
      if (epub.epubcheck && epub.epubcheck.errors + epub.epubcheck.fatals > 0) log("epubcheck reported errors (see above)", "warn");
    } catch (err) {
      ok = false;
      log(`EPUB: ${(err as Error).message}`, "error");
    }
  }

  // --------------------------------------------------------------- PDF
  if (formats.includes("pdf")) {
    step("PDF");
    try {
      Object.assign(info, await buildPdf({ config, manuscript, matter, customTyp, work, slug, env, filters, cover: pdfCover, log }));
    } catch (err) {
      ok = false;
      log(`PDF: ${(err as Error).message}`, "error");
    }
  }

  // -------------------------------------------------------- deliver
  step("done");
  const dist = distDir(id);
  await mkdir(dist, { recursive: true });
  const made = await readdir(out);
  // Replace the formats rebuilt (a renamed book leaves no stale file behind); keep the others.
  const stale = (name: string) =>
    (formats.includes("epub") && (name.endsWith(".epub") || name.endsWith("-cover.jpg"))) || (formats.includes("pdf") && name.endsWith(".pdf"));
  for (const name of await readdir(dist)) if (stale(name)) await unlink(path.join(dist, name)).catch(() => {});
  for (const name of made) await rename(path.join(out, name), path.join(dist, name));
  const files = [];
  for (const name of (await readdir(dist)).sort()) {
    if (name === "build.json" || name === "build.log") continue;
    const s = await stat(path.join(dist, name));
    if (s.isFile()) files.push({ name, size: s.size });
  }
  // A format not rebuilt keeps what the last export found about it (its files are still in dist/).
  const previous = await readBuildInfo(id);
  const kept: Partial<BuildInfo> = {
    ...(!formats.includes("epub") && previous?.epubcheck ? { epubcheck: previous.epubcheck } : {}),
    ...(!formats.includes("pdf") && previous?.pdfPages ? { pdfPages: previous.pdfPages } : {}),
  };
  const result: BuildInfo = { at: Date.now(), ok, files, ...kept, ...info };
  log(ok ? `finished: ${made.join(", ") || "nothing"}` : "finished with errors", ok ? "info" : "error");
  await writeFile(path.join(dist, "build.json"), JSON.stringify(result, null, 2));
  await writeFile(path.join(dist, "build.log"), `${logLines.join("\n")}\n`);
  return result;
}

interface FormatInput {
  config: BookConfig;
  manuscript: string;
  matter: { section: BookConfig["matter"][number]; body: string }[];
  work: string;
  slug: string;
  env: Record<string, string>;
  filters: string[];
  cover: string | null;
  log: Log;
}

async function buildEpub(input: FormatInput & { customCss: string }): Promise<Partial<BuildInfo>> {
  const { config, work, slug, log } = input;
  const src = path.join(work, "book-epub.md");
  await writeFile(src, assemble({ config, manuscript: input.manuscript, matter: input.matter, format: "epub" }));
  await writeFile(path.join(work, "metadata.json"), JSON.stringify(pandocMetadata(config), null, 2));

  // The faces the book is set in, embedded (the mono one only when there's code to set).
  const t = config.typography;
  const wanted = [t.bodyFont, t.headingFont, ...(/`/.test(input.manuscript) ? [t.monoFont] : [])];
  const embedded: BookFont[] = [];
  const fontArgs: string[] = [];
  if (config.epub.embedFonts) {
    const files = await fontFiles();
    for (const fid of new Set(wanted)) {
      const f = fontById(fid);
      if (!f) continue;
      const paths = f.faces.map((face) => files.get(face.file));
      if (paths.some((p) => !p)) {
        log(`font ${f.name}: files not found under BOOKX_FONT_PATHS, not embedded`, "warn");
        continue;
      }
      embedded.push(f);
      for (const p of paths) fontArgs.push("--epub-embed-font", p!);
    }
  }
  const css = epubCss(config, embedded) + (input.customCss.trim() ? `\n/* ---- custom.css ---- */\n${input.customCss}\n` : "");
  await writeFile(path.join(work, "epub.css"), css);

  const file = `${slug}.epub`;
  const outFile = path.join("out", file);
  await tool(
    "pandoc",
    [
      src,
      "--from",
      readerFormat(config),
      "--to",
      "epub3",
      "--metadata-file",
      "metadata.json",
      ...input.filters,
      // Parts and chapters each get a file (and a contents entry); without parts, chapters do.
      `--split-level=${hasParts(input.manuscript, config.structure) ? 2 : 1}`,
      ...(config.structure.toc ? ["--toc"] : []),
      `--toc-depth=${config.structure.tocDepth}`,
      "--css",
      "epub.css",
      `--epub-title-page=${config.epub.titlePage}`,
      ...(input.cover ? ["--epub-cover-image", input.cover] : []),
      ...fontArgs,
      "-o",
      outFile,
    ],
    { cwd: work, env: input.env, log },
  );
  log(`wrote ${file}`);
  await patchEpub(work, outFile, config, log);

  const epubcheck = await runEpubcheck(work, outFile, log);
  return epubcheck ? { epubcheck } : {};
}

/**
 * Validate with epubcheck and log its findings. It exits non-zero when it
 * finds errors, so its output is read either way; null when it isn't installed.
 */
async function runEpubcheck(work: string, file: string, log: Log): Promise<BuildInfo["epubcheck"] | null> {
  const text = await tool("sh", ["-c", 'command -v epubcheck >/dev/null || { echo "MISSING"; exit 0; }; epubcheck "$0" 2>&1; true', file], {
    cwd: work,
    log,
    quiet: true,
  });
  if (text.trim() === "MISSING") {
    log("epubcheck not found: the EPUB was not validated", "warn");
    return null;
  }
  for (const line of text.split("\n").map((l) => l.trim())) {
    if (/^(FATAL|ERROR)/.test(line)) log(line, "error");
    else if (/^WARNING/.test(line)) log(line, "warn");
    else if (/^(Messages:|No errors)/.test(line)) log(`epubcheck: ${line}`);
  }
  const m = text.match(/Messages:\s*(\d+)\s*fatals?\s*\/\s*(\d+)\s*errors?\s*\/\s*(\d+)\s*warnings?/);
  return m ? { fatals: Number(m[1]), errors: Number(m[2]), warnings: Number(m[3]) } : { fatals: 0, errors: 0, warnings: 0 };
}

/**
 * Fixes to the packaged EPUB that pandoc offers no option for:
 *  - the legacy <meta name="cover"> (pandoc declares the cover only the EPUB 3
 *    way; Calibre and EPUB 2-era readers look for this one), and
 *  - the publisher line on pandoc's title page when it repeats the author
 *    (the OPF keeps dc:publisher, which is the copy stores read).
 */
async function patchEpub(work: string, outFile: string, config: BookConfig, log: Log) {
  const dir = path.join(work, "epub-patch");
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, "EPUB", "text"), { recursive: true });
  const opfPath = path.join(dir, "EPUB", "content.opf");
  const opf = await tool("unzip", ["-p", outFile, "EPUB/content.opf"], { cwd: work, log, quiet: true });
  const changed: string[] = [];
  const coverId = opf.match(/<item[^>]*properties="cover-image"[^>]*id="([^"]+)"/)?.[1] ?? opf.match(/<item[^>]*id="([^"]+)"[^>]*properties="cover-image"/)?.[1];
  if (coverId && !opf.includes('name="cover"')) {
    await writeFile(opfPath, opf.replace("</metadata>", `  <meta name="cover" content="${coverId}" />\n  </metadata>`));
    changed.push("EPUB/content.opf");
    log(`added the legacy cover meta (${coverId}) for Calibre and older readers`);
  }
  const authors = config.metadata.authors.map((a) => a.name.trim()).filter(Boolean);
  if (config.epub.titlePage && config.metadata.publisher && authors.includes(config.metadata.publisher.trim())) {
    const tp = await tool("unzip", ["-p", outFile, "EPUB/text/title_page.xhtml"], { cwd: work, log, quiet: true }).catch(() => "");
    if (tp.includes('<p class="publisher">')) {
      await writeFile(path.join(dir, "EPUB", "text", "title_page.xhtml"), tp.replace(/\s*<p class="publisher">[\s\S]*?<\/p>/, ""));
      changed.push("EPUB/text/title_page.xhtml");
      log("dropped the title page's publisher line (it repeats the author)");
    }
  }
  if (changed.length) await tool("zip", ["-X", "-q", path.relative(dir, path.join(work, outFile)), ...changed], { cwd: dir, log });
}

async function buildPdf(input: FormatInput & { customTyp: string }): Promise<Partial<BuildInfo>> {
  const { config, work, slug, log } = input;
  const src = path.join(work, "book-pdf.md");
  await writeFile(src, assemble({ config, manuscript: input.manuscript, matter: input.matter, format: "pdf" }));
  await writeFile(path.join(work, "body-template.typ"), "$body$\n");
  await tool(
    "pandoc",
    [src, "--from", readerFormat(config), "--to", "typst", ...input.filters, "--template", "body-template.typ", "-o", "body.typ"],
    { cwd: work, env: input.env, log },
  );
  const library = await readFile(path.join(ASSETS_DIR, "book.typ"), "utf8");
  const body = await readFile(path.join(work, "body.typ"), "utf8");
  await writeFile(path.join(work, "book.typ"), typstDocument({ config, library, custom: input.customTyp, body, cover: input.cover }));
  const file = `${slug}.pdf`;
  await tool("typst", ["compile", "--root", work, ...FONT_PATHS.flatMap((p) => ["--font-path", p]), "book.typ", path.join("out", file)], {
    cwd: work,
    env: input.env,
    log,
  });
  const pdfinfo = await tool("pdfinfo", [path.join("out", file)], { cwd: work, log, quiet: true }).catch(() => "");
  const pages = Number(pdfinfo.match(/^Pages:\s+(\d+)/m)?.[1]) || undefined;
  log(`wrote ${file}${pages ? ` (${pages} pages)` : ""}`);
  return { pdfPages: pages };
}

