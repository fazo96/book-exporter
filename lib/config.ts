// A book's settings (project.json): its metadata, how the manuscript's
// markdown maps to the book's structure, typography, the PDF page, the EPUB's
// options, and the front and back matter. Everything read from disk or from a
// request goes through `sanitizeConfig`, which fills what's missing from the
// defaults and drops what's malformed, so the rest of the app can trust the
// shape. Imports nothing from the server, so client components share it.

import { fontById } from "./fonts.ts";

export type Numbering = "none" | "arabic" | "roman" | "words";
export type SceneHeadings = "break" | "show" | "hide";
export type SceneBreakStyle = "asterism" | "asterisks" | "ring" | "fleuron" | "space" | "custom";
export type MatterStyle = "plain" | "copyright" | "dedication" | "epigraph" | "centered";
export type Trim = "a5" | "5x8" | "5.5x8.5" | "6x9" | "a4" | "letter" | "custom";

export interface Author {
  name: string;
  /** How a library sorts the name ("Fasoli, Enrico"). */
  fileAs: string;
}

export interface MatterSection {
  id: string;
  /** The template it started from (matter.ts); styling comes from `style`. */
  kind: string;
  title: string;
  placement: "front" | "back";
  style: MatterStyle;
  showTitle: boolean;
  /** Listed in the table of contents (when its title is shown). */
  inToc: boolean;
  epub: boolean;
  pdf: boolean;
}

export interface BookConfig {
  metadata: {
    title: string;
    subtitle: string;
    authors: Author[];
    publisher: string;
    language: string;
    year: string;
    /** Empty: "© <year> <authors>. All rights reserved." */
    rights: string;
    description: string;
    /** BISAC subjects, "FIC028150 FICTION / Science Fiction / …" or plain text. */
    subjects: string[];
    keywords: string[];
    /**
     * Fixed for the life of the edition: a new identifier makes every rebuild
     * a different book to a reader's library (a duplicate on the shelf, the
     * reading position lost). Minted once when the project is created.
     */
    identifier: { scheme: "UUID" | "ISBN"; value: string };
    series: { name: string; number: string };
  };
  structure: {
    /** Heading level (1–6) of a part, a chapter and a scene; 0 = not used. Shallower headings are the book's title and are dropped. */
    partLevel: number;
    chapterLevel: number;
    sceneLevel: number;
    sceneHeadings: SceneHeadings;
    partNumbering: Numbering;
    partLabel: string;
    chapterNumbering: Numbering;
    chapterLabel: string;
    sceneBreak: SceneBreakStyle;
    sceneBreakCustom: string;
    /** A block quote right after a part or chapter heading is set as its epigraph. */
    epigraphs: boolean;
    endMark: "none" | "ornament" | "text";
    endMarkText: string;
    /** Strip Obsidian %% comments %% and <!-- HTML comments --> (pen's comments). */
    stripComments: boolean;
    /** Let raw HTML through. Off: `<ERROR>` in prose stays text. */
    rawHtml: boolean;
    toc: boolean;
    tocDepth: number;
  };
  typography: {
    bodyFont: string;
    headingFont: string;
    monoFont: string;
    /** Body size in points (the PDF; the EPUB scales headings relative to the reader's size). */
    fontSize: number;
    lineHeight: number;
    paragraphStyle: "indent" | "spaced";
    /** First-line indent in em. */
    indent: number;
    justify: boolean;
    hyphenate: boolean;
    headingCase: "upper" | "as-written" | "small-caps";
    headingWeight: number;
    /** Letter spacing of headings in em. */
    headingTracking: number;
    headingAlign: "center" | "left";
  };
  pdf: {
    trim: Trim;
    /** Page size in mm when trim is "custom". */
    width: number;
    height: number;
    margins: { top: number; bottom: number; inside: number; outside: number };
    pageNumbers: boolean;
    runningHeads: "none" | "title-chapter" | "author-title";
    /** Chapters and parts open on a right-hand page (print), leaving a blank page behind when needed. */
    openRecto: boolean;
    coverPage: boolean;
    titlePage: boolean;
  };
  epub: {
    titlePage: boolean;
    embedFonts: boolean;
    /** Also write the cover as the store JPEG (sRGB, no chroma subsampling) KDP takes. */
    coverJpeg: boolean;
  };
  matter: MatterSection[];
}

export const TRIMS: Record<Exclude<Trim, "custom">, { label: string; width: number; height: number }> = {
  a5: { label: "A5 (148 × 210 mm)", width: 148, height: 210 },
  "5x8": { label: '5 × 8"', width: 127, height: 203.2 },
  "5.5x8.5": { label: '5.5 × 8.5"', width: 139.7, height: 215.9 },
  "6x9": { label: '6 × 9"', width: 152.4, height: 228.6 },
  a4: { label: "A4 (210 × 297 mm)", width: 210, height: 297 },
  letter: { label: 'US Letter (8.5 × 11")', width: 215.9, height: 279.4 },
};

export const SCENE_BREAKS: Record<Exclude<SceneBreakStyle, "custom" | "space">, string> = {
  asterism: "⁂",
  asterisks: "* * *",
  ring: "○",
  fleuron: "❧",
};

/** pen's headings: `#` the book's title, `##` a part, `###` a chapter, `####` a scene. */
export function defaultConfig(title = "Untitled", identifier = ""): BookConfig {
  return {
    metadata: {
      title,
      subtitle: "",
      authors: [],
      publisher: "",
      language: "en-US",
      year: String(new Date().getFullYear()),
      rights: "",
      description: "",
      subjects: [],
      keywords: [],
      identifier: { scheme: "UUID", value: identifier },
      series: { name: "", number: "" },
    },
    structure: {
      partLevel: 2,
      chapterLevel: 3,
      sceneLevel: 4,
      sceneHeadings: "break",
      partNumbering: "none",
      partLabel: "Part",
      chapterNumbering: "none",
      chapterLabel: "Chapter",
      sceneBreak: "asterism",
      sceneBreakCustom: "",
      epigraphs: true,
      endMark: "none",
      endMarkText: "The End",
      stripComments: true,
      rawHtml: false,
      toc: true,
      tocDepth: 2,
    },
    typography: {
      bodyFont: "eb-garamond",
      headingFont: "jost",
      monoFont: "ibm-plex-mono",
      fontSize: 11.5,
      lineHeight: 1.45,
      paragraphStyle: "indent",
      indent: 1.5,
      justify: true,
      hyphenate: true,
      headingCase: "upper",
      headingWeight: 300,
      headingTracking: 0.2,
      headingAlign: "center",
    },
    pdf: {
      trim: "a5",
      width: 148,
      height: 210,
      margins: { top: 18, bottom: 18, inside: 18, outside: 16 },
      pageNumbers: true,
      runningHeads: "none",
      openRecto: false,
      coverPage: true,
      titlePage: true,
    },
    epub: { titlePage: true, embedFonts: true, coverJpeg: true },
    matter: [],
  };
}

// ------------------------------------------------------------------ sanitizing

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d: string, max = 20_000) => (typeof v === "string" ? v.slice(0, max) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const num = (v: unknown, d: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const int = (v: unknown, d: number, min: number, max: number) => Math.round(num(v, d, min, max));
const oneOf = <T extends string>(v: unknown, options: readonly T[], d: T): T => (options.includes(v as T) ? (v as T) : d);
const strings = (v: unknown, d: string[]) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 500)) : d);
const font = (v: unknown, d: string) => (typeof v === "string" && fontById(v) ? v : d);

const NUMBERINGS = ["none", "arabic", "roman", "words"] as const;
const MATTER_STYLES = ["plain", "copyright", "dedication", "epigraph", "centered"] as const;
const MATTER_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

function sanitizeMatter(v: unknown): MatterSection[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: MatterSection[] = [];
  for (const m of v) {
    if (!isObj(m) || typeof m.id !== "string" || !MATTER_ID.test(m.id) || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({
      id: m.id,
      kind: str(m.kind, "custom", 40),
      title: str(m.title, "", 300),
      placement: oneOf(m.placement, ["front", "back"] as const, "back"),
      style: oneOf(m.style, MATTER_STYLES, "plain"),
      showTitle: bool(m.showTitle, true),
      inToc: bool(m.inToc, true),
      epub: bool(m.epub, true),
      pdf: bool(m.pdf, true),
    });
  }
  return out;
}

/** `raw` (project.json, a request) as a whole, valid config; anything missing or malformed takes `base`'s value. */
export function sanitizeConfig(raw: unknown, base: BookConfig = defaultConfig()): BookConfig {
  const r = isObj(raw) ? raw : {};
  const m = isObj(r.metadata) ? r.metadata : {};
  const s = isObj(r.structure) ? r.structure : {};
  const t = isObj(r.typography) ? r.typography : {};
  const p = isObj(r.pdf) ? r.pdf : {};
  const e = isObj(r.epub) ? r.epub : {};
  const bm = base.metadata;
  const bs = base.structure;
  const bt = base.typography;
  const bp = base.pdf;
  const id = isObj(m.identifier) ? m.identifier : {};
  const series = isObj(m.series) ? m.series : {};
  const margins = isObj(p.margins) ? p.margins : {};
  const authors = Array.isArray(m.authors)
    ? m.authors.filter(isObj).map((a) => ({ name: str(a.name, "", 200), fileAs: str(a.fileAs, "", 200) }))
    : bm.authors;
  const level = (v: unknown, d: number) => int(v, d, 0, 6);
  return {
    metadata: {
      title: str(m.title, bm.title, 300),
      subtitle: str(m.subtitle, bm.subtitle, 300),
      authors,
      publisher: str(m.publisher, bm.publisher, 200),
      language: str(m.language, bm.language, 35),
      year: str(m.year, bm.year, 20),
      rights: str(m.rights, bm.rights, 1000),
      description: str(m.description, bm.description),
      subjects: strings(m.subjects, bm.subjects),
      keywords: strings(m.keywords, bm.keywords),
      identifier: {
        scheme: oneOf(id.scheme, ["UUID", "ISBN"] as const, bm.identifier.scheme),
        value: str(id.value, bm.identifier.value, 200),
      },
      series: { name: str(series.name, bm.series.name, 300), number: str(series.number, bm.series.number, 20) },
    },
    structure: {
      partLevel: level(s.partLevel, bs.partLevel),
      chapterLevel: int(s.chapterLevel, bs.chapterLevel, 1, 6),
      sceneLevel: level(s.sceneLevel, bs.sceneLevel),
      sceneHeadings: oneOf(s.sceneHeadings, ["break", "show", "hide"] as const, bs.sceneHeadings),
      partNumbering: oneOf(s.partNumbering, NUMBERINGS, bs.partNumbering),
      partLabel: str(s.partLabel, bs.partLabel, 60),
      chapterNumbering: oneOf(s.chapterNumbering, NUMBERINGS, bs.chapterNumbering),
      chapterLabel: str(s.chapterLabel, bs.chapterLabel, 60),
      sceneBreak: oneOf(s.sceneBreak, ["asterism", "asterisks", "ring", "fleuron", "space", "custom"] as const, bs.sceneBreak),
      sceneBreakCustom: str(s.sceneBreakCustom, bs.sceneBreakCustom, 40),
      epigraphs: bool(s.epigraphs, bs.epigraphs),
      endMark: oneOf(s.endMark, ["none", "ornament", "text"] as const, bs.endMark),
      endMarkText: str(s.endMarkText, bs.endMarkText, 100),
      stripComments: bool(s.stripComments, bs.stripComments),
      rawHtml: bool(s.rawHtml, bs.rawHtml),
      toc: bool(s.toc, bs.toc),
      tocDepth: int(s.tocDepth, bs.tocDepth, 1, 3),
    },
    typography: {
      bodyFont: font(t.bodyFont, bt.bodyFont),
      headingFont: font(t.headingFont, bt.headingFont),
      monoFont: font(t.monoFont, bt.monoFont),
      fontSize: num(t.fontSize, bt.fontSize, 7, 18),
      lineHeight: num(t.lineHeight, bt.lineHeight, 1, 2.5),
      paragraphStyle: oneOf(t.paragraphStyle, ["indent", "spaced"] as const, bt.paragraphStyle),
      indent: num(t.indent, bt.indent, 0, 5),
      justify: bool(t.justify, bt.justify),
      hyphenate: bool(t.hyphenate, bt.hyphenate),
      headingCase: oneOf(t.headingCase, ["upper", "as-written", "small-caps"] as const, bt.headingCase),
      headingWeight: int(t.headingWeight, bt.headingWeight, 100, 900),
      headingTracking: num(t.headingTracking, bt.headingTracking, 0, 0.6),
      headingAlign: oneOf(t.headingAlign, ["center", "left"] as const, bt.headingAlign),
    },
    pdf: {
      trim: oneOf(p.trim, ["a5", "5x8", "5.5x8.5", "6x9", "a4", "letter", "custom"] as const, bp.trim),
      width: num(p.width, bp.width, 50, 500),
      height: num(p.height, bp.height, 50, 700),
      margins: {
        top: num(margins.top, bp.margins.top, 0, 80),
        bottom: num(margins.bottom, bp.margins.bottom, 0, 80),
        inside: num(margins.inside, bp.margins.inside, 0, 80),
        outside: num(margins.outside, bp.margins.outside, 0, 80),
      },
      pageNumbers: bool(p.pageNumbers, bp.pageNumbers),
      runningHeads: oneOf(p.runningHeads, ["none", "title-chapter", "author-title"] as const, bp.runningHeads),
      openRecto: bool(p.openRecto, bp.openRecto),
      coverPage: bool(p.coverPage, bp.coverPage),
      titlePage: bool(p.titlePage, bp.titlePage),
    },
    epub: {
      titlePage: bool(e.titlePage, base.epub.titlePage),
      embedFonts: bool(e.embedFonts, base.epub.embedFonts),
      coverJpeg: bool(e.coverJpeg, base.epub.coverJpeg),
    },
    matter: r.matter === undefined ? base.matter : sanitizeMatter(r.matter),
  };
}

/** The page size in mm. */
export function pageSize(pdf: BookConfig["pdf"]): { width: number; height: number } {
  return pdf.trim === "custom" ? { width: pdf.width, height: pdf.height } : TRIMS[pdf.trim];
}

export const authorLine = (c: BookConfig) => c.metadata.authors.map((a) => a.name).filter(Boolean).join(", ");

export const rightsLine = (c: BookConfig) =>
  c.metadata.rights || `© ${c.metadata.year} ${authorLine(c) || c.metadata.publisher}. All rights reserved.`.replace(/\s+\./, ".");
