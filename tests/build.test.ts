import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assemble, readerFormat } from "../lib/build/assemble.ts";
import { epubCss } from "../lib/build/epubCss.ts";
import { descriptionText, filterConfig, mdText, pandocMetadata } from "../lib/build/metadata.ts";
import { langRegion, typstConfig, typstStr } from "../lib/build/typst.ts";
import { type BookConfig, sanitizeConfig } from "../lib/config.ts";
import { fontById } from "../lib/fonts.ts";
import { newSection } from "../lib/matter.ts";

// The export's pure parts (lib/build/), and the built-in filter through pandoc when it's installed.

const config = (patch: unknown = {}) => sanitizeConfig(patch, sanitizeConfig({ metadata: { title: "The Book", year: "2026", authors: [{ name: "A. Writer", fileAs: "Writer, A." }] } }));

test("assembles front matter, the story, the end and back matter in order, per format", () => {
  const c = config();
  const front = { ...newSection("dedication", []), pdf: false };
  const back = newSection("about-author", []);
  const md = assemble({
    config: c,
    manuscript: "# The Book\n\nText %% note %%\n---\nMore",
    matter: [
      { section: front, body: "*For you*" },
      { section: back, body: "{{author}} writes.\n:::" },
    ],
    format: "epub",
  });
  const order = ["kind=\"dedication\"", ".bookx-main", "Text", ".bookx-end", ".bookx-back", "kind=\"about-author\""].map((s) => md.indexOf(s));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(md.includes("note"), false);
  assert.match(md, /Text\s*\n\n---\n\nMore/);
  assert.match(md, /A\. Writer writes\.\n\\:::/); // a stray ::: can't close the section's div
  assert.equal(assemble({ config: c, manuscript: "x", matter: [{ section: front, body: "*For you*" }], format: "pdf" }).includes("dedication"), false);
});

test("never reads a YAML block, and raw HTML only when asked", () => {
  assert.equal(readerFormat(config()), "markdown+smart-raw_html-yaml_metadata_block");
  assert.equal(readerFormat(config({ structure: { rawHtml: true } })), "markdown+smart-yaml_metadata_block");
});

test("metadata: creator with file-as, BISAC subjects, a fixed identifier, escaped text", () => {
  const meta = pandocMetadata(config({ metadata: { title: "1984. A *Novel*", subjects: ["FIC028150 FICTION / Science Fiction", "robots", " "], identifier: { scheme: "UUID", value: "urn:uuid:1" } } }));
  assert.deepEqual(meta.creator, [{ role: "author", text: "A. Writer", "file-as": "Writer, A." }]);
  assert.equal(meta.author, undefined);
  assert.equal(meta.title, "1984\\. A \\*Novel\\*");
  assert.deepEqual(meta.subject, [{ text: "FICTION / Science Fiction", authority: "BISAC", term: "FIC028150" }, "robots"]);
  assert.deepEqual(meta.identifier, [{ scheme: "UUID", text: "urn:uuid:1" }]);
  assert.equal(mdText("- dash"), "\\- dash");
  assert.equal(descriptionText("One\nline.\n\nTwo."), "One line.&#10;&#10;Two.");
});

test("Typst: strings escaped, settings as a dictionary, language split", () => {
  assert.equal(typstStr('say "hi" \\ now'), '"say \\"hi\\" \\\\ now"');
  assert.deepEqual(langRegion("en-US"), { lang: "en", region: "us" });
  assert.deepEqual(langRegion("it"), { lang: "it", region: null });
  const cfg = typstConfig(config({ structure: { sceneBreak: "space" } }), "cover.png");
  assert.match(cfg, /scene-break: none,/);
  assert.match(cfg, /cover: "cover.png",/);
  assert.match(cfg, /body-font: "EB Garamond 12",/);
});

test("the EPUB stylesheet declares the embedded faces and the settings", () => {
  const css = epubCss(config({ typography: { justify: false, paragraphStyle: "spaced" } }), [fontById("jost")!]);
  assert.match(css, /@font-face \{\n {2}font-family: "Jost";\n {2}font-weight: 300;/);
  assert.match(css, /src: url\("..\/fonts\/Jost-400-Book.ttf"\)/);
  assert.match(css, /text-align: left;/);
  assert.match(css, /text-indent: 0;/);
});

// ------------------------------------------------------------------ the filter

const hasPandoc = spawnSync("pandoc", ["--version"]).status === 0;
const work = mkdtempSync(path.join(tmpdir(), "bookx-filter-"));

function filter(md: string, c: BookConfig, to: "html" | "typst"): string {
  const cfgFile = path.join(work, "cfg.json");
  writeFileSync(cfgFile, JSON.stringify(filterConfig(c)));
  const r = spawnSync("pandoc", ["--from", readerFormat(c), "--to", to, "--wrap=none", "--lua-filter", path.resolve("assets/book.lua")], {
    input: md,
    env: { ...process.env, BOOKX_FILTER_CONFIG: cfgFile },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

const BOOK = `::: {.bookx-main}
:::

# The Book

## Part One

> An epigraph.

— Its Source

### Birth

---

First.

---

Second.

#### A scene

Third.

---

### Faith

Fourth.

* * *

Fifth.

::: {.bookx-end}
:::
`;

test("filter (EPUB): title dropped, parts and chapters numbered, breaks only between prose", { skip: !hasPandoc && "pandoc not installed" }, () => {
  const html = filter(BOOK, config({ structure: { chapterNumbering: "words", partNumbering: "roman", partLabel: "Part", endMark: "ornament" } }), "html");
  assert.equal(html.includes("The Book"), false);
  assert.match(html, /<h1 class="part"[^>]*><span class="part-number">Part I<\/span><br \/>\s*Part One<\/h1>/);
  assert.match(html, /<h2 class="chapter"[^>]*><span class="chapter-number">Chapter One<\/span><br \/>\s*Birth<\/h2>/);
  assert.match(html, /class="epigraph epigraph-part"/);
  assert.match(html, /<span class="attribution"><span class="dash-fallback">—\u00A0<\/span>Its Source<\/span>/);
  // Birth: the rule before "First" is dropped (next to the heading); "Second" and the
  // scene heading each make one break; the one before "Faith" goes with the page turn.
  const birth = html.slice(html.indexOf("Birth"), html.indexOf("Faith"));
  assert.equal(birth.match(/class="scene-break"/g)?.length, 2);
  assert.equal(html.slice(html.indexOf("Faith")).match(/class="scene-break"/g)?.length, 1); // * * * between Fourth and Fifth
  assert.match(html, /class="end-mark"/);
});

test("filter (Typst): calls the template's functions with content arguments", { skip: !hasPandoc && "pandoc not installed" }, () => {
  const typ = filter(BOOK, config({ structure: { chapterNumbering: "arabic", sceneHeadings: "show" } }), "typst");
  assert.match(typ, /#main-matter\(\)/);
  assert.match(typ, /#part-page\(number: none, title: \[Part One\]\)/);
  assert.match(typ, /#epigraph\(where: "part", attribution: \[Its Source\]\)\[/);
  assert.match(typ, /#chapter-opener\(level: 2, number: "Chapter 1", title: \[Birth\]\)/);
  assert.match(typ, /#scene-title\(level: 3, outlined: false, \[A scene\]\)/);
  assert.equal(typ.match(/#scene-break\(\)/g)?.length, 2); // "Second", and between Fourth and Fifth
});

test("filter: matter sections become pages with their style", { skip: !hasPandoc && "pandoc not installed" }, () => {
  const md = ':::::: {.bookx-matter kind="copyright" style="copyright" placement="front" show-title="false" in-toc="false"}\n# Copyright\n\n© 2026\n\n::::::\n';
  const c = config();
  assert.match(filter(md, c, "typst"), /#matter-page\(style: "copyright", front: true\)\[\n© 2026\n+\]/);
  const html = filter(md, c, "html");
  // pandoc moves the heading's epub:type onto its section, which is where reading systems look.
  assert.match(html, /<section[^>]*epub:type="copyright-page">\s*<h1 class="matter-title unnumbered hidden unlisted">Copyright<\/h1>/);
  assert.match(html, /<div class="matter matter-copyright">/);
});
