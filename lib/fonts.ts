// The faces a book can be set in: each comes from a nixpkgs font package
// (flake.nix lists them) and is found by file name under BOOKX_FONT_PATHS.
// `typst` is the family name Typst sees (`typst fonts`), which is not always
// the CSS one: EB Garamond ships per optical size, Jost as "Jost*". `faces`
// are the static files the EPUB embeds (no variable fonts: older readers
// render them at one weight). Imports nothing, so client components can list
// them.

export interface FontFile {
  file: string;
  weight: number;
  italic: boolean;
}

export interface BookFont {
  id: string;
  /** The CSS family name, and the name shown in the app. */
  name: string;
  typst: string;
  kind: "serif" | "sans" | "mono";
  faces: FontFile[];
}

const rib = (prefix: string, ext = "ttf", names = { r: "Regular", i: "Italic", b: "Bold", bi: "BoldItalic" }): FontFile[] => [
  { file: `${prefix}-${names.r}.${ext}`, weight: 400, italic: false },
  { file: `${prefix}-${names.i}.${ext}`, weight: 400, italic: true },
  { file: `${prefix}-${names.b}.${ext}`, weight: 700, italic: false },
  { file: `${prefix}-${names.bi}.${ext}`, weight: 700, italic: true },
];

export const FONTS: BookFont[] = [
  {
    id: "eb-garamond",
    name: "EB Garamond",
    typst: "EB Garamond 12",
    kind: "serif",
    faces: [
      { file: "EBGaramond12-Regular.ttf", weight: 400, italic: false },
      { file: "EBGaramond12-Italic.ttf", weight: 400, italic: true },
    ],
  },
  { id: "crimson-pro", name: "Crimson Pro", typst: "Crimson Pro", kind: "serif", faces: rib("CrimsonPro") },
  {
    id: "libre-baskerville",
    name: "Libre Baskerville",
    typst: "Libre Baskerville",
    kind: "serif",
    faces: rib("LibreBaskerville").slice(0, 3),
  },
  {
    id: "libre-caslon",
    name: "Libre Caslon Text",
    typst: "Libre Caslon Text",
    kind: "serif",
    faces: rib("LibreCaslonText", "otf").slice(0, 3),
  },
  { id: "lora", name: "Lora", typst: "Lora", kind: "serif", faces: rib("Lora") },
  { id: "literata", name: "Literata", typst: "Literata", kind: "serif", faces: rib("Literata") },
  {
    id: "source-serif",
    name: "Source Serif 4",
    typst: "Source Serif 4",
    kind: "serif",
    faces: rib("SourceSerif4", "ttf", { r: "Regular", i: "It", b: "Bold", bi: "BoldIt" }),
  },
  { id: "alegreya", name: "Alegreya", typst: "Alegreya", kind: "serif", faces: rib("Alegreya") },
  { id: "cormorant-garamond", name: "Cormorant Garamond", typst: "Cormorant Garamond", kind: "serif", faces: rib("CormorantGaramond") },
  { id: "spectral", name: "Spectral", typst: "Spectral", kind: "serif", faces: rib("Spectral") },
  { id: "vollkorn", name: "Vollkorn", typst: "Vollkorn", kind: "serif", faces: rib("Vollkorn") },
  { id: "gentium-book", name: "Gentium Book Plus", typst: "Gentium Book Plus", kind: "serif", faces: rib("GentiumBookPlus") },
  { id: "merriweather", name: "Merriweather", typst: "Merriweather", kind: "serif", faces: rib("Merriweather") },
  {
    id: "jost",
    name: "Jost",
    typst: "Jost*",
    kind: "sans",
    faces: [
      { file: "Jost-300-Light.ttf", weight: 300, italic: false },
      { file: "Jost-300-LightItalic.ttf", weight: 300, italic: true },
      { file: "Jost-400-Book.ttf", weight: 400, italic: false },
      { file: "Jost-400-BookItalic.ttf", weight: 400, italic: true },
      { file: "Jost-700-Bold.ttf", weight: 700, italic: false },
    ],
  },
  {
    id: "source-sans",
    name: "Source Sans 3",
    typst: "Source Sans 3",
    kind: "sans",
    faces: [
      { file: "SourceSans3-Light.ttf", weight: 300, italic: false },
      ...rib("SourceSans3", "ttf", { r: "Regular", i: "It", b: "Bold", bi: "BoldIt" }),
    ],
  },
  {
    id: "ibm-plex-sans",
    name: "IBM Plex Sans",
    typst: "IBM Plex Sans",
    kind: "sans",
    faces: [{ file: "IBMPlexSans-Light.otf", weight: 300, italic: false }, ...rib("IBMPlexSans", "otf")],
  },
  {
    id: "ibm-plex-mono",
    name: "IBM Plex Mono",
    typst: "IBM Plex Mono",
    kind: "mono",
    faces: rib("IBMPlexMono", "otf").slice(0, 2),
  },
];

export const fontById = (id: string): BookFont | undefined => FONTS.find((f) => f.id === id);
