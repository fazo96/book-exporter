// The single markdown source pandoc reads for one format: front matter, the
// manuscript (cleaned), the end mark and the back matter, with fenced divs
// marking where each starts for assets/book.lua. Pure, so tests run it.

import type { BookConfig, MatterSection } from "../config.ts";
import { padRules, stripComments } from "../manuscript.ts";
import { fillVariables } from "../matter.ts";

export type Format = "epub" | "pdf";

export interface MatterInput {
  section: MatterSection;
  body: string;
}

/** A section's title or body as markdown that can't escape its div: a stray `:::` line would close it early. */
const fenceSafe = (md: string) => md.replace(/^(\s*):::+\s*$/gm, "$1\\:::");

function attr(value: string): string {
  return `"${value.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

function matterDiv(m: MatterInput, config: BookConfig): string {
  const s = m.section;
  const title = fillVariables(s.title, config).replace(/\n+/g, " ").trim() || s.kind;
  const body = fillVariables(m.body, config);
  const attrs = [
    ".bookx-matter",
    `kind=${attr(s.kind)}`,
    `style=${attr(s.style)}`,
    `placement=${attr(s.placement)}`,
    `show-title=${attr(String(s.showTitle))}`,
    `in-toc=${attr(String(s.inToc))}`,
  ].join(" ");
  return `:::::: {${attrs}}\n# ${title}\n\n${fenceSafe(padRules(body.trim()))}\n\n::::::\n`;
}

export function assemble(input: { config: BookConfig; manuscript: string; matter: MatterInput[]; format: Format }): string {
  const { config, format } = input;
  const s = config.structure;
  const wanted = input.matter.filter((m) => m.section[format]);
  let story = input.manuscript.replace(/\r\n?/g, "\n");
  if (s.stripComments) story = stripComments(story);
  story = padRules(story);

  const parts: string[] = [];
  for (const m of wanted.filter((m) => m.section.placement === "front")) parts.push(matterDiv(m, config));
  parts.push("::: {.bookx-main}\n:::\n");
  parts.push(story.trim(), "");
  parts.push("::: {.bookx-end}\n:::\n");
  parts.push("::: {.bookx-back}\n:::\n");
  for (const m of wanted.filter((m) => m.section.placement === "back")) parts.push(matterDiv(m, config));
  return `${parts.join("\n\n")}\n`;
}

/** pandoc's markdown reader for the book: smart punctuation; raw HTML only when asked; never a YAML block (a manuscript's `---` is a scene break). */
export function readerFormat(config: BookConfig): string {
  return `markdown+smart${config.structure.rawHtml ? "" : "-raw_html"}-yaml_metadata_block`;
}
