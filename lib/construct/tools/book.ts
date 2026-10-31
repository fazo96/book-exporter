import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { epubCss } from "../../build/epubCss";
import { typstDocument } from "../../build/typst";
import { type BookConfig, TRIMS } from "../../config";
import { FONTS } from "../../fonts";
import { countWords, roleOf } from "../../manuscript";
import { MATTER_KINDS, VARIABLES } from "../../matter";
import { ASSETS_DIR } from "../../paths";
import {
  addMatter,
  type CustomKind,
  MAX_CUSTOM,
  MAX_NOTES,
  readConfig,
  readCustom,
  readManuscript,
  readMatter,
  readNotes,
  saveConfig,
  writeCustom,
  writeMatter,
  writeNotes,
} from "../../store";
import { bool, excerpt, obj, oneOf, rangeProps, replaceOnce, sectionsOf, str, type Tool, ToolError, text, tool } from "./core";

// The book: its manuscript (read-only), settings, front and back matter,
// custom files and Notes. Everything here writes through lib/store.ts, inside
// the book's folder, after the session's snapshot (ctx.beforeChange).

async function config(id: string) {
  const c = await readConfig(id);
  if (!c) throw new ToolError("The book is gone.");
  return c;
}

// ─── The manuscript ──────────────────────────────────────────

const outlineTool = tool({
  name: "outline",
  description:
    "The manuscript's headings, indented by level, each with what the book makes of it (title, part, chapter, scene, by the structure settings), its lines and words.",
  properties: {},
  readOnly: true,
  async run(_, ctx) {
    const md = await readManuscript(ctx.projectId);
    const { structure } = await config(ctx.projectId);
    const lines = md.split("\n");
    const sections = sectionsOf(md);
    if (!sections.length) return `No headings. The manuscript has ${lines.length} lines and ${countWords(md).toLocaleString("en")} words.`;
    return sections
      .map((s) => {
        const words = countWords(lines.slice(s.line, s.end).join("\n"));
        return `${"  ".repeat(s.level - 1)}${"#".repeat(s.level)} ${s.text}  [${roleOf(s.level, structure)}] (lines ${s.line}–${s.end}, ${words.toLocaleString("en")} words)`;
      })
      .join("\n");
  },
});

const readManuscriptTool = tool({
  name: "read_manuscript",
  description:
    "Read the manuscript (markdown), numbered by line: a section by its heading, and/or from `offset` for `limit` lines. Read-only: it comes from the writer's editor.",
  properties: { heading: str("A heading's text (or part of it), to read just that section."), ...rangeProps },
  readOnly: true,
  run: async (args, ctx) => excerpt(await readManuscript(ctx.projectId), args),
});

const searchTool = tool({
  name: "search_manuscript",
  description: "Find the manuscript's lines containing some text (case-insensitive): to find markup like `***`, `> `, HTML or a phrase.",
  properties: { query: str("The text to look for.") },
  required: ["query"],
  readOnly: true,
  async run({ query }, ctx) {
    const q = query.toLowerCase();
    const hits: string[] = [];
    let total = 0;
    (await readManuscript(ctx.projectId)).split("\n").forEach((line, i) => {
      if (!line.toLowerCase().includes(q)) return;
      total++;
      if (hits.length < 50) hits.push(`${i + 1}\t${line.length > 300 ? `${line.slice(0, 300)}…` : line}`);
    });
    if (!total) return `No line contains "${query}".`;
    return `${total} line${total > 1 ? "s" : ""}${total > hits.length ? ` (the first ${hits.length})` : ""}:\n${hits.join("\n")}`;
  },
});

// ─── Settings ────────────────────────────────────────────────

const SECTIONS = ["metadata", "structure", "typography", "pdf", "epub", "matter"] as const;

const SETTINGS_GUIDE = `What the settings mean (values outside a range are clamped, unknown values ignored):
- structure: partLevel, chapterLevel, sceneLevel are heading levels (1–6; 0 = not used for parts and scenes; shallower headings are the book's title and dropped). sceneHeadings: break (a scene heading becomes a scene break) | show (a small title) | hide. partNumbering, chapterNumbering: none | arabic | roman | words, with partLabel, chapterLabel ("Chapter" → "Chapter One"). sceneBreak: asterism ⁂ | asterisks * * * | ring ○ | fleuron ❧ | space | custom (sceneBreakCustom). epigraphs: a quote right after a part or chapter heading is its epigraph. endMark: none | ornament | text (endMarkText). stripComments, rawHtml. toc, tocDepth (1–3).
- typography: bodyFont, headingFont, monoFont (font ids, below). fontSize 7–18 pt, lineHeight 1–2.5, paragraphStyle indent | spaced, indent 0–5 em, justify, hyphenate, headingCase upper | as-written | small-caps, headingWeight 100–900, headingTracking 0–0.6 em, headingAlign center | left.
- pdf: trim ${Object.keys(TRIMS).join(" | ")} | custom (width 50–500, height 50–700 mm). margins top, bottom, inside, outside in mm (0–80). pageNumbers, runningHeads none | title-chapter | author-title, openRecto (chapters and parts open on a right-hand page), coverPage, titlePage.
- epub: titlePage, embedFonts, coverJpeg.
- matter: the front and back matter sections in order: id, kind, title, placement front | back, style plain | centered | copyright | dedication | epigraph, showTitle, inToc, epub, pdf (which formats it's in). Reorder or edit them here; add_matter adds one; only the writer removes one.
- metadata: the book's title, authors and the rest. The identifier never changes.

Fonts: ${FONTS.map((f) => `${f.id} (${f.name}, ${f.kind})`).join(", ")}.`;

const readSettingsTool = tool({
  name: "read_settings",
  description: "The book's settings (JSON), all or one section, with what each one means and the fonts available.",
  properties: { section: oneOf(SECTIONS, "Just this section.") },
  readOnly: true,
  async run({ section }, ctx) {
    const c = await config(ctx.projectId);
    const value = section ? { [section]: c[section] } : c;
    return `${JSON.stringify(value, null, 2)}\n\n${SETTINGS_GUIDE}`;
  },
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Where `patch` asked for something the saved settings don't have: clamped, ignored or unknown. */
export function settingsDiffs(patch: unknown, saved: unknown, at = ""): string[] {
  if (isObj(patch)) {
    if (!isObj(saved)) return [`${at || "settings"}: not a section`];
    return Object.entries(patch).flatMap(([k, v]) =>
      Object.hasOwn(saved, k) ? settingsDiffs(v, saved[k], at ? `${at}.${k}` : k) : [`${at ? `${at}.` : ""}${k}: no such setting, ignored`],
    );
  }
  if (JSON.stringify(patch) === JSON.stringify(saved)) return [];
  return [`${at}: asked for ${JSON.stringify(patch)}, saved ${JSON.stringify(saved)}`];
}

const updateSettingsTool = tool({
  name: "update_settings",
  description:
    'Change some settings: `patch` is the part of the settings JSON to change, e.g. {"typography": {"fontSize": 10.5}, "pdf": {"margins": {"inside": 22}}}. What you leave out stays. Lists (authors, subjects, matter) are replaced whole. Answers with anything clamped or ignored.',
  properties: { patch: obj("The settings to change, shaped like read_settings' JSON.") },
  required: ["patch"],
  readOnly: false,
  async run({ patch }, ctx) {
    const before = await config(ctx.projectId);
    const meta = patch.metadata;
    if (isObj(meta) && meta.identifier !== undefined && JSON.stringify(meta.identifier) !== JSON.stringify(before.metadata.identifier)) {
      throw new ToolError("The identifier never changes: a new one makes e-readers shelve the book as a different one.");
    }
    if (Array.isArray(patch.matter)) {
      const ids = new Set(before.matter.map((m) => m.id));
      const asked = patch.matter.map((m) => (isObj(m) ? m.id : undefined));
      if (asked.some((m) => typeof m !== "string" || !ids.has(m))) {
        throw new ToolError(`matter: give every section by its id (${[...ids].join(", ")}); add_matter adds one.`);
      }
      if (asked.length < ids.size) throw new ToolError("matter: list every section (only the writer removes one).");
    }
    await ctx.beforeChange();
    const saved = await saveConfig(ctx.projectId, patch);
    ctx.onChange(["settings"]);
    const diffs = settingsDiffs(patch, saved);
    return diffs.length ? `Saved, except:\n${diffs.map((d) => `- ${d}`).join("\n")}` : "Saved.";
  },
});

// ─── Front and back matter ───────────────────────────────────

function sectionOf(c: BookConfig, mid: string) {
  const m = c.matter.find((x) => x.id === mid);
  if (!m) throw new ToolError(`No section "${mid}". Sections: ${c.matter.map((x) => x.id).join(", ") || "none"}.`);
  return m;
}

const readMatterTool = tool({
  name: "read_matter",
  description:
    "The front and back matter: without `id`, the sections in order; with it, one section's settings and text (markdown; {{title}}, {{author}}… are filled at export).",
  properties: { id: str("The section's id.") },
  readOnly: true,
  async run({ id }, ctx) {
    const c = await config(ctx.projectId);
    if (!id) {
      if (!c.matter.length) return "No front or back matter.";
      return c.matter
        .map((m) => `${m.id}: "${m.title}" (${m.placement}, ${m.style}${m.showTitle ? "" : ", title hidden"}${!m.pdf ? ", EPUB only" : !m.epub ? ", PDF only" : ""})`)
        .join("\n");
    }
    const m = sectionOf(c, id);
    return `${JSON.stringify(m)}\n\nVariables: ${VARIABLES.map((v) => `{{${v}}}`).join(" ")}\n\n"""\n${await readMatter(ctx.projectId, id)}\n"""`;
  },
});

const editMatterTool = tool({
  name: "edit_matter",
  description: "Change a section's text: replace `old_text` (exactly as it is, once) with `new_text`, or without `old_text`, the whole text. Its settings change with update_settings.",
  properties: { id: str("The section's id."), old_text: str("The text to replace."), new_text: text("What replaces it.") },
  required: ["id", "new_text"],
  readOnly: false,
  async run({ id, old_text, new_text }, ctx) {
    sectionOf(await config(ctx.projectId), id);
    const current = await readMatter(ctx.projectId, id);
    const next = old_text === undefined ? new_text : replaceOnce(current, old_text, new_text, `section ${id}`);
    if (Buffer.byteLength(next) > MAX_CUSTOM) throw new ToolError("Too long.");
    await ctx.beforeChange();
    await writeMatter(ctx.projectId, id, next);
    ctx.onChange(["matter"]);
    return "Saved.";
  },
});

const addMatterTool = tool({
  name: "add_matter",
  description: `Add a front or back matter section from a template, with its text: ${MATTER_KINDS.map((k) => `${k.kind} (${k.label})`).join(", ")}. It goes after the other front sections, or at the end.`,
  properties: { kind: oneOf(MATTER_KINDS.map((k) => k.kind), "The template.") },
  required: ["kind"],
  readOnly: false,
  async run({ kind }, ctx) {
    await ctx.beforeChange();
    const before = new Set((await config(ctx.projectId)).matter.map((m) => m.id));
    const next = await addMatter(ctx.projectId, kind);
    ctx.onChange(["settings", "matter"]);
    const added = next.matter.find((m) => !before.has(m.id));
    return added ? `Added "${added.id}": ${JSON.stringify(added)}` : "Added.";
  },
});

// ─── Custom files ────────────────────────────────────────────

const CUSTOM = { "custom.typ": "typ", "custom.css": "css", "filter.lua": "lua" } as const satisfies Record<string, CustomKind>;
const CUSTOM_NAMES = Object.keys(CUSTOM) as (keyof typeof CUSTOM)[];

const readCustomTool = tool({
  name: "read_custom",
  description:
    "Read one of the book's custom files, numbered by line: custom.typ (after the PDF's setup: #set/#show rules, #let over book.typ's functions), custom.css (after the EPUB's stylesheet), filter.lua (a pandoc filter after the built-in one, both formats).",
  properties: { file: oneOf(CUSTOM_NAMES, "Which file."), ...rangeProps },
  required: ["file"],
  readOnly: true,
  async run({ file, ...range }, ctx) {
    const content = await readCustom(ctx.projectId, CUSTOM[file]);
    return content ? excerpt(content, range) : `${file} is empty.`;
  },
});

const editCustomTool = tool({
  name: "edit_custom",
  description: "Change a custom file: replace `old_text` (exactly as it is, once) with `new_text`, or without `old_text`, write the whole file (empty removes it).",
  properties: { file: oneOf(CUSTOM_NAMES, "Which file."), old_text: str("The text to replace."), new_text: text("What replaces it.") },
  required: ["file", "new_text"],
  readOnly: false,
  async run({ file, old_text, new_text }, ctx) {
    const current = await readCustom(ctx.projectId, CUSTOM[file]);
    const next = old_text === undefined ? new_text : replaceOnce(current, old_text, new_text, file);
    if (Buffer.byteLength(next) > MAX_CUSTOM) throw new ToolError("Too long (max 512 KB).");
    await ctx.beforeChange();
    await writeCustom(ctx.projectId, CUSTOM[file], next);
    ctx.onChange(["custom"]);
    return next.trim() ? "Saved." : `Removed ${file}.`;
  },
});

// ─── Built-in files ──────────────────────────────────────────

const BUILTIN = ["book.typ", "book.lua", "pdf-setup.typ", "epub.css"] as const;

async function builtin(id: string, file: (typeof BUILTIN)[number]) {
  if (file === "book.typ" || file === "book.lua") return readFile(path.join(ASSETS_DIR, file), "utf8");
  const c = await config(id);
  if (file === "epub.css") return epubCss(c, []);
  return typstDocument({
    config: c,
    library: "// ---------------------------------------------------------- assets/book.typ (read_builtin book.typ)",
    custom: "// (the book's custom.typ)",
    body: "// (the book)",
    cover: null,
  });
}

const readBuiltinTool = tool({
  name: "read_builtin",
  description:
    "Read the built-in files, numbered by line: book.typ (the PDF's Typst functions: openers, scene breaks, matter pages, page furniture), book.lua (the pandoc filter), pdf-setup.typ (the PDF document around the book, generated from the settings now: the cfg dictionary, the page and text setup), epub.css (the EPUB stylesheet generated from the settings now, without @font-face rules).",
  properties: { file: oneOf(BUILTIN, "Which file."), ...rangeProps },
  required: ["file"],
  readOnly: true,
  run: async ({ file, ...range }, ctx) => excerpt(await builtin(ctx.projectId, file), range),
});

// ─── Notes ───────────────────────────────────────────────────

const readNotesTool = tool({
  name: "read_notes",
  description: "Read the book's Notes, numbered by line: the writer's art direction for the typesetting, and what you've settled together.",
  properties: rangeProps,
  readOnly: true,
  async run(range, ctx) {
    const notes = await readNotes(ctx.projectId);
    return notes.trim() ? excerpt(notes, range) : "The Notes are empty.";
  },
});

const editNotesTool = tool({
  name: "edit_notes",
  description:
    "Change the Notes: replace `old_text` (exactly as it is, once) with `new_text`, or without `old_text`, write them whole. Keep them the writer's: add and update decisions, don't rewrite what they wrote.",
  properties: { old_text: str("The text to replace."), new_text: text("What replaces it."), append: bool("Add `new_text` at the end instead.") },
  required: ["new_text"],
  readOnly: false,
  async run({ old_text, new_text, append }, ctx) {
    const current = await readNotes(ctx.projectId);
    const next = append
      ? `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${new_text.trim()}\n`
      : old_text === undefined
        ? new_text
        : replaceOnce(current, old_text, new_text, "the Notes");
    if (Buffer.byteLength(next) > MAX_NOTES) throw new ToolError("Too long (max 512 KB).");
    await ctx.beforeChange();
    await writeNotes(ctx.projectId, next);
    ctx.onChange(["notes"]);
    return "Saved.";
  },
});

export const bookTools: Tool[] = [
  outlineTool,
  readManuscriptTool,
  searchTool,
  readSettingsTool,
  updateSettingsTool,
  readMatterTool,
  editMatterTool,
  addMatterTool,
  readCustomTool,
  editCustomTool,
  readBuiltinTool,
  readNotesTool,
  editNotesTool,
];

