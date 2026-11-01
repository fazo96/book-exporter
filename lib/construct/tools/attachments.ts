import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type Attachment, attachmentFile, listAttachments } from "../../store";
import { bookOf, bookProps, excerpt, int, rangeProps, str, type Tool, ToolError, type ToolOutput, tool } from "./core";
import { DPI, exec, parsePages } from "./preview";

// The images and PDFs the writer attached to a book (the Notes tab) to show
// Construct what they're after: a style, pages they like, a style guide.
// Read-only: only the writer adds, captions and removes them. An image comes
// back scaled to fit what the model takes (ImageMagick), a PDF's pages as
// images (pdftoppm) or as text (pdftotext).

/** The longest side an image is shown to the agent at: the most the model looks at without scaling it again. */
const MAX_SIDE = 1568;

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const pdfPages = async (file: string) => Number((await exec("pdfinfo", [file])).match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);

/** The attachment called `name` in book `id`, with its file. */
async function attachment(id: string, name: string): Promise<Attachment & { file: string }> {
  const list = await listAttachments(id);
  const a = list.find((x) => x.name === name);
  const file = a && (await attachmentFile(id, name));
  if (!a || !file) throw new ToolError(`No attachment "${name}". ${list.length ? `There are: ${list.map((x) => x.name).join(", ")}.` : "There are none."}`);
  return { ...a, file };
}

/** Run `fn` with a temporary folder, removed after. */
async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bookx-attachment-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const listTool = tool({
  name: "list_attachments",
  description:
    "The images and PDFs the writer attached to the book to show you what they're after (pages they like, a style guide, another book's spread), each with their caption: what to look at in it.",
  properties: bookProps,
  readOnly: true,
  async run(args, ctx) {
    const id = await bookOf(args, ctx);
    const list = await listAttachments(id);
    if (!list.length) return "No attachments.";
    const lines: string[] = [];
    for (const a of list) {
      const file = a.ext === "pdf" ? await attachmentFile(id, a.name) : null;
      const pages = file ? await pdfPages(file).catch(() => 0) : 0;
      const what = a.ext === "pdf" ? `PDF${pages ? `, ${pages} page${pages > 1 ? "s" : ""}` : ""}` : `${a.ext.toUpperCase()} image`;
      lines.push(`${a.name} (${what}, ${size(a.size)})${a.caption ? `: ${a.caption}` : ""}`);
    }
    return lines.join("\n");
  },
});

const viewTool = tool({
  name: "view_attachment",
  description: `Look at an attachment: an image comes back as one (at most ${MAX_SIDE} px on its longest side); a PDF's pages as images, a few at a time like render_pages (dpi ${DPI.default} by default, up to ${DPI.max} for a detail).`,
  properties: {
    name: str("The attachment's name, as list_attachments gives it."),
    pages: str('For a PDF: which pages ("1", "2-4"); the first by default.'),
    dpi: int(`For a PDF: resolution (default ${DPI.default}, at most ${DPI.max}).`),
    ...bookProps,
  },
  required: ["name"],
  readOnly: true,
  async run({ name, pages, dpi = DPI.default, book }, ctx): Promise<ToolOutput> {
    const a = await attachment(await bookOf({ book }, ctx), name);
    const caption = a.caption ? `\nThe writer's caption: ${a.caption}` : "";
    if (a.ext !== "pdf") {
      const data = await inTemp(async (dir) => {
        const out = path.join(dir, "view.jpg");
        // [0]: a GIF's first frame. ">" only ever shrinks.
        await exec("magick", [`${a.file}[0]`, "-auto-orient", "-resize", `${MAX_SIDE}x${MAX_SIDE}>`, "-strip", "-quality", "85", out]);
        return readFile(out);
      });
      return { text: `${a.name}:${caption}`, images: [{ data: data.toString("base64"), mimeType: "image/jpeg" }] };
    }
    const count = await pdfPages(a.file);
    const list = parsePages(pages ?? "1", count);
    const r = Math.min(Math.max(dpi, 20), DPI.max);
    const images = await inTemp(async (dir) => {
      const out: NonNullable<ToolOutput["images"]> = [];
      for (const page of list) {
        const stem = path.join(dir, `p${page}`);
        await exec("pdftoppm", ["-f", String(page), "-l", String(page), "-r", String(r), "-jpeg", "-jpegopt", "quality=85", "-singlefile", a.file, stem]);
        out.push({ data: (await readFile(`${stem}.jpg`)).toString("base64"), mimeType: "image/jpeg" });
      }
      return out;
    });
    return { text: `${a.name}, page${list.length > 1 ? "s" : ""} ${list.join(", ")} of ${count}:${caption}`, images };
  },
});

const readTool = tool({
  name: "read_attachment",
  description: "Read the text of a PDF attachment (a style guide, a spec), numbered by line, with a line marking where each page starts.",
  properties: { name: str("The attachment's name, as list_attachments gives it."), ...rangeProps, ...bookProps },
  required: ["name"],
  readOnly: true,
  async run({ name, book, ...range }, ctx) {
    const a = await attachment(await bookOf({ book }, ctx), name);
    if (a.ext !== "pdf") throw new ToolError(`${a.name} is an image: view_attachment shows it.`);
    const pages = (await exec("pdftotext", ["-layout", a.file, "-"])).split("\f");
    if (pages.at(-1)?.trim() === "") pages.pop();
    if (!pages.some((p) => p.trim())) return `${a.name} has no text (it may be scanned): view_attachment shows its pages.`;
    return excerpt(pages.map((p, i) => `--- Page ${i + 1} ---\n${p.trimEnd()}`).join("\n"), range);
  },
});

export const attachmentTools: Tool[] = [listTool, viewTool, readTool];
