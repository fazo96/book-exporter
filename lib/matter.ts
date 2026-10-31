// Front and back matter: the templates a new section starts from, and the
// {{variables}} its text may use. Variables are filled at export, not when the
// section is made, so changing the year or the author reaches every page that
// names them. Imports nothing from the server, so the editor can preview them.

import { authorLine, type BookConfig, type MatterSection, type MatterStyle, rightsLine } from "./config.ts";

export interface MatterKind {
  kind: string;
  label: string;
  title: string;
  placement: "front" | "back";
  style: MatterStyle;
  showTitle: boolean;
  inToc: boolean;
  body: string;
}

export const MATTER_KINDS: MatterKind[] = [
  {
    kind: "copyright",
    label: "Copyright",
    title: "Copyright",
    placement: "front",
    style: "copyright",
    showTitle: false,
    inToc: false,
    body: "*{{title}}*\n\n{{rights}}\n\nThis is a work of fiction. Names, characters, places and events are the product of the author's imagination.\n\n{{isbn}}\n",
  },
  {
    kind: "dedication",
    label: "Dedication",
    title: "Dedication",
    placement: "front",
    style: "dedication",
    showTitle: false,
    inToc: false,
    body: "*For …*\n",
  },
  {
    kind: "epigraph",
    label: "Epigraph",
    title: "Epigraph",
    placement: "front",
    style: "epigraph",
    showTitle: false,
    inToc: false,
    body: "> The quote.\n\n— Its source\n",
  },
  {
    kind: "foreword",
    label: "Foreword",
    title: "Foreword",
    placement: "front",
    style: "plain",
    showTitle: true,
    inToc: true,
    body: "",
  },
  {
    kind: "also-by",
    label: "Also by",
    title: "Also by {{author}}",
    placement: "front",
    style: "centered",
    showTitle: true,
    inToc: false,
    body: "*The Next Book*\n\n*The One Before*\n",
  },
  {
    kind: "afterword",
    label: "Afterword",
    title: "Afterword",
    placement: "back",
    style: "plain",
    showTitle: true,
    inToc: true,
    body: "",
  },
  {
    kind: "acknowledgments",
    label: "Acknowledgments",
    title: "Acknowledgments",
    placement: "back",
    style: "plain",
    showTitle: true,
    inToc: true,
    body: "",
  },
  {
    kind: "about-author",
    label: "About the author",
    title: "About the Author",
    placement: "back",
    style: "plain",
    showTitle: true,
    inToc: true,
    body: "{{author}} writes …\n",
  },
  {
    kind: "thanks",
    label: "Thanks for reading",
    title: "Thanks for reading {{title}}",
    placement: "back",
    style: "centered",
    showTitle: true,
    inToc: true,
    body: "If you enjoyed it, a review helps other readers find it.\n",
  },
  {
    kind: "custom",
    label: "Blank page",
    title: "Untitled",
    placement: "back",
    style: "plain",
    showTitle: true,
    inToc: true,
    body: "",
  },
];

export const matterKind = (kind: string) => MATTER_KINDS.find((k) => k.kind === kind) ?? MATTER_KINDS[MATTER_KINDS.length - 1];

export const VARIABLES = ["title", "subtitle", "author", "year", "publisher", "rights", "isbn", "identifier", "series"] as const;

export function variables(c: BookConfig): Record<(typeof VARIABLES)[number], string> {
  const m = c.metadata;
  const isbn = m.identifier.scheme === "ISBN" && m.identifier.value ? `ISBN ${m.identifier.value}` : "";
  return {
    title: m.title,
    subtitle: m.subtitle,
    author: authorLine(c),
    year: m.year,
    publisher: m.publisher,
    rights: rightsLine(c),
    isbn,
    identifier: m.identifier.value,
    series: m.series.name ? `${m.series.name}${m.series.number ? ` ${m.series.number}` : ""}` : "",
  };
}

/** `text` with its {{variables}} filled; unknown names are left as written. A line left empty by a blank variable goes with it. */
export function fillVariables(text: string, c: BookConfig): string {
  const vars = variables(c) as Record<string, string>;
  return text
    .split("\n")
    .flatMap((line) => {
      let blanked = false;
      const filled = line.replace(/\{\{\s*([a-z]+)\s*\}\}/g, (all, name: string) => {
        if (!(name in vars)) return all;
        if (!vars[name]) blanked = true;
        return vars[name];
      });
      return blanked && !filled.trim() ? [] : [filled];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** A new section from a template, with an id not yet used in `taken`. */
export function newSection(kind: string, taken: string[]): MatterSection {
  const k = matterKind(kind);
  let id = k.kind;
  for (let n = 2; taken.includes(id); n++) id = `${k.kind}-${n}`;
  return {
    id,
    kind: k.kind,
    title: k.title,
    placement: k.placement,
    style: k.style,
    showTitle: k.showTitle,
    inToc: k.inToc,
    epub: true,
    pdf: true,
  };
}
