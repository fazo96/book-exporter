// Reading a manuscript's markdown without pandoc: its title, outline and word
// count (for the app), and the text clean-up every export does before pandoc
// sees it. Line-based, and aware of fenced code so a `---` or a `%%` inside a
// code block is left alone. Imports nothing from the server.

import type { BookConfig } from "./config.ts";

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** Calls `fn` for each line outside fenced code (and passes fenced lines through). */
function mapProse(md: string, fn: (line: string) => string | string[]): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of md.split("\n")) {
    const f = line.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      out.push(line);
    } else if (f) {
      fence = f[1];
      out.push(line);
    } else {
      const r = fn(line);
      if (Array.isArray(r)) out.push(...r);
      else out.push(r);
    }
  }
  return out.join("\n");
}

/** Without Obsidian `%% comments %%` and `<!-- HTML comments -->`, which may span lines. Fenced code is kept. */
export function stripComments(md: string): string {
  // Hide fenced code behind placeholders so a comment marker inside one is not a comment.
  const blocks: string[] = [];
  const hidden = hideFences(md, blocks);
  const stripped = hidden.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");
  return stripped.replace(/\uE000FENCE(\d+)\uE000/g, (_, n) => blocks[Number(n)]);
}

function hideFences(md: string, blocks: string[]): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let current: string[] = [];
  for (const line of lines) {
    const f = line.match(FENCE);
    if (fence) {
      current.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) {
        blocks.push(current.join("\n"));
        out.push(`\uE000FENCE${blocks.length - 1}\uE000`);
        fence = null;
        current = [];
      }
    } else if (f) {
      fence = f[1];
      current = [line];
    } else {
      out.push(line);
    }
  }
  if (fence) out.push(...current); // an unclosed fence runs to the end, as in markdown
  return out.join("\n");
}

const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/**
 * Every thematic break (`---`, `***`) with a blank line on each side. A rule
 * flush against prose is read by pandoc as a setext heading underline (text
 * then `---`: silently a heading) or, at the top, as a YAML block. Extra blank
 * lines are harmless in markdown.
 */
export function padRules(md: string): string {
  return mapProse(md, (line) => (RULE.test(line) ? ["", line, ""] : line));
}

export interface OutlineItem {
  level: number;
  text: string;
  role: "title" | "part" | "chapter" | "scene" | "other";
  /** Words from this heading to the next heading of this level or shallower. */
  words: number;
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*(?:\{[^}]*\})?\s*#*\s*$/;

/** The ATX headings outside fenced code, with their line numbers. */
export function headings(md: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  let fence: string | null = null;
  md.split("\n").forEach((line, n) => {
    const f = line.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
    } else if (f) {
      fence = f[1];
    } else {
      const h = line.match(HEADING);
      if (h) out.push({ level: h[1].length, text: h[2], line: n });
    }
  });
  return out;
}

/** Words in prose: comments, markup and headings' `#` left out. */
export function countWords(md: string): number {
  const text = stripComments(md)
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_`~>#|[\]()]/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

/** The text of the first `#` heading, if any. */
export function titleOf(md: string): string | undefined {
  return headings(md).find((h) => h.level === 1)?.text.replace(/[*_`]/g, "");
}

export function roleOf(level: number, s: BookConfig["structure"]): OutlineItem["role"] {
  if (s.partLevel && level === s.partLevel) return "part";
  if (level === s.chapterLevel) return "chapter";
  if (s.sceneLevel && level === s.sceneLevel) return "scene";
  if (level < Math.min(s.partLevel || 7, s.chapterLevel)) return "title";
  return "other";
}

/** The manuscript's headings as the book will read them, with the words under each. */
export function outline(md: string, s: BookConfig["structure"]): OutlineItem[] {
  const clean = s.stripComments ? stripComments(md) : md;
  const lines = clean.split("\n");
  const hs = headings(clean);
  return hs.map((h, i) => {
    let end = lines.length;
    for (let j = i + 1; j < hs.length; j++) {
      if (hs[j].level <= h.level) {
        end = hs[j].line;
        break;
      }
    }
    return { level: h.level, text: h.text, role: roleOf(h.level, s), words: countWords(lines.slice(h.line + 1, end).join("\n")) };
  });
}

/** True when the manuscript has headings at the part level (the EPUB then splits at parts and chapters). */
export function hasParts(md: string, s: BookConfig["structure"]): boolean {
  return s.partLevel > 0 && headings(md).some((h) => h.level === s.partLevel);
}


/**
 * The line (1-based) of a `%%` that opens a comment never closed, or null.
 * Obsidian (and the export) hide everything after it, so an export warns.
 */
export function unclosedComment(md: string): number | null {
  // Fenced code blanked line for line, so positions still count the source's lines.
  let fence: string | null = null;
  const prose = md.split("\n").map((line) => {
    const f = line.match(FENCE);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return "";
    }
    if (f) {
      fence = f[1];
      return "";
    }
    return line;
  });
  const paired = prose.join("\n").replace(/%%[\s\S]*?%%/g, (m) => m.replace(/[^\n]/g, " "));
  const at = paired.indexOf("%%");
  return at < 0 ? null : paired.slice(0, at).split("\n").length;
}
