// What pandoc is told about the book (--metadata-file, as JSON, which is YAML),
// and the settings assets/book.lua reads. Pure, so tests run it.

import { authorLine, type BookConfig, rightsLine, SCENE_BREAKS } from "../config.ts";

/**
 * Metadata strings are read as markdown, so a title like "1984. A Novel"
 * would become a list: escape what markdown would act on.
 */
export function mdText(s: string): string {
  return s.replace(/[\\`*_{}[\]<>#+!|~^$]/g, (c) => `\\${c}`).replace(/^(\s*)(\d+)([.)])/, "$1$2\\$3").replace(/^(\s*)-/, "$1\\-");
}

/**
 * dc:description is plain text and pandoc joins paragraphs with no separator
 * at all ("…theirs.Kit has spent"), so paragraph breaks go in as numeric
 * character references, which reach the OPF as real newlines.
 */
export function descriptionText(s: string): string {
  return s
    .trim()
    .split(/\n\s*\n/)
    .map((p) => mdText(p.replace(/\s*\n\s*/g, " ")))
    .join("&#10;&#10;");
}

const clean = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export function pandocMetadata(c: BookConfig): Record<string, unknown> {
  const m = c.metadata;
  const meta: Record<string, unknown> = {
    title: mdText(m.title),
    // `creator`, not `author`: only it carries file-as (the name a library
    // sorts by), and declaring both gives the EPUB every author twice.
    creator: m.authors
      .filter((a) => a.name)
      .map((a) => ({ role: "author", text: mdText(a.name), ...(a.fileAs ? { "file-as": mdText(a.fileAs) } : {}) })),
    lang: m.language || "en",
    date: m.year,
    rights: mdText(rightsLine(c)),
    // Fixed per edition: without one, pandoc mints a new UUID each build and
    // every update lands as a duplicate in the reader's library.
    identifier: [{ scheme: m.identifier.scheme, text: m.identifier.value }],
    // The visible contents page's heading (pandoc uses the book's title otherwise).
    "toc-title": "Contents",
  };
  if (m.subtitle) meta.subtitle = mdText(m.subtitle);
  if (m.publisher) meta.publisher = mdText(m.publisher);
  if (m.description.trim()) meta.description = descriptionText(m.description);
  const subjects = [
    ...clean(m.subjects).map((s) => {
      const bisac = s.match(/^([A-Z]{3}\d{6})\s+(.+)$/);
      return bisac ? { text: mdText(bisac[2]), authority: "BISAC", term: bisac[1] } : mdText(s);
    }),
    ...clean(m.keywords).map(mdText),
  ];
  if (subjects.length) meta.subject = subjects;
  if (m.series.name) {
    meta["belongs-to-collection"] = mdText(m.series.name);
    if (m.series.number) meta["group-position"] = m.series.number;
  }
  return meta;
}

export function sceneBreakGlyph(s: BookConfig["structure"]): string {
  if (s.sceneBreak === "space") return "";
  if (s.sceneBreak === "custom") return s.sceneBreakCustom.trim() || SCENE_BREAKS.asterism;
  return SCENE_BREAKS[s.sceneBreak];
}

/** What assets/book.lua reads (BOOKX_FILTER_CONFIG). */
export function filterConfig(c: BookConfig): Record<string, unknown> {
  return {
    structure: c.structure,
    sceneBreakGlyph: sceneBreakGlyph(c.structure),
    endMark: c.structure.endMark,
    endMarkText: c.structure.endMarkText,
    author: authorLine(c),
  };
}
