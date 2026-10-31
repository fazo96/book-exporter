# The export

`lib/build/index.ts` (`buildProject`) runs one export, the steps of mistaken-for-the-light's `build.sh` driven by the book's settings. It works in `<id>/build/` (cleared first) and moves what it made into `<id>/dist/`, replacing only the formats it rebuilt; `build.json` records the files, the PDF's page count and epubcheck's counts (a format not rebuilt keeps its last ones). The log streams to the browser as JSON lines (`lib/ndjson.ts`) and is saved as `dist/build.log`. One export per book at a time. A book linked to pen with "Pull before every export" on first pulls its manuscript ([pen](library.md#pen)); when pen can't be reached, that's a warning and the export goes on with the text as last pulled.

## 1. The source

`lib/build/assemble.ts` writes one markdown file per format:

```
:::::: {.bookx-matter kind=… style=… placement=front show-title=… in-toc=…}
# <title>
<text, variables filled>
::::::
::: {.bookx-main}        ← the story starts
<the manuscript>
::: {.bookx-end}         ← the end mark
::: {.bookx-back}        ← back matter starts
:::::: {.bookx-matter … placement=back …}
```

The manuscript is cleaned first: `%% comments %%` and `<!-- comments -->` stripped (not inside fenced code; an unclosed `%%` hides the rest, as in Obsidian, and the log warns with its line), and every `---`/`***` padded with blank lines, since pandoc reads one flush against text as a setext heading underline. pandoc reads it as `markdown+smart-raw_html-yaml_metadata_block`: no YAML block (a `---` is a scene break), and raw HTML only when the book allows it (prose like `<ERROR>` stays text).

## 2. `assets/book.lua`

The built-in filter, for both formats. Its settings come from the JSON file named by `BOOKX_FILTER_CONFIG` (`filterConfig` in `lib/build/metadata.ts`).

- Headings shallower than the part and chapter levels are the book's title: dropped.
- Parts become level-1 headings (EPUB) or `#part-page(...)`; chapters level 2 (level 1 when the book has no parts) or `#chapter-opener(...)`; numbers ("Chapter One", "IV") are added inside the EPUB heading as `span.part-number`/`span.chapter-number` and passed to Typst as `number:`.
- Scene headings become a scene break, a small title (`#scene-title`, `h2/h3.scene`), or nothing.
- `---`, `***` and ornament-only paragraphs (`⁂`, `* * *`, `❧`…) are scene breaks, kept only between prose: one next to a heading, or at a chapter's start or end, goes with the page turn.
- A `>` quote right after a part or chapter heading is its epigraph (consecutive quotes are one), and a `— Source` paragraph after it its attribution. The EPUB gets italics in the markup and a dash hidden by CSS, so readers that ignore publisher styles still read it right (from mftl).
- Matter sections become `#matter-page(style: …)[…]` or a level-1 heading (hidden when its title isn't shown, `unlisted` when not in the contents, with an `epub:type` such as `copyright-page`) and a `div.matter.matter-<style>`.

Typst calls take headings and attributions as content (`[...]`, written with `pandoc.write(..., "typst")`), so their inline markup survives. A project's `filter.lua` runs after this one and sees its output.

## 3. EPUB

- Metadata (`pandocMetadata`, as a JSON `--metadata-file`): `creator` with `file-as` (never `author` too, or every author appears twice), the fixed `identifier`, BISAC subjects as authority/term pairs, the description with paragraph breaks as `&#10;` (pandoc joins paragraphs with nothing), every string escaped since pandoc reads them as markdown.
- The stylesheet (`lib/build/epubCss.ts`) is written from the typography settings, without custom properties or flexbox (old reader engines ignore them), with `@font-face` for the embedded faces (`--epub-embed-font`, files found under `BOOKX_FONT_PATHS`); `custom.css` follows it.
- `--split-level` is 2 with parts, 1 without, so every chapter is its own file and the contents never nest chapters under the front matter.
- The cover: SVG is rasterized with resvg (WebP converted with magick); with "store cover JPEG", magick writes the sRGB, 4:4:4, metadata-free JPEG KDP takes.
- Patches to the packaged file: the legacy `<meta name="cover">` (Calibre, EPUB 2 readers), and the title page's publisher line removed when it repeats the author.
- epubcheck runs on it; its findings go to the log and its counts to `build.json`.

## 4. PDF

pandoc writes the body as Typst (`--template` is just `$body$`), and `lib/build/typst.ts` wraps it: a `cfg` dictionary with the settings, `assets/book.typ` (the functions), the page and text setup, `custom.typ`, the cover and title pages, the body. `typst compile --root build/`.

`assets/book.typ` holds `part-page`, `chapter-opener`, `scene-title`, `scene-break`, `end-mark`, `epigraph`, `matter-page`, `title-page`, `contents-page`, `main-matter` (the contents, then page 1) and the page furniture: folios start at the story, running heads skip opener pages and go by the folio's parity (even on the left), and with "open on the right" the blank page a parity break leaves carries neither. Headings are real `heading`s (for the outline and PDF bookmarks), styled by the openers: Typst's own bold and size are reset in the setup.

## Custom files

| File | Where it goes |
| --- | --- |
| `custom.css` | After the generated EPUB stylesheet |
| `custom.typ` | After the PDF's setup, before the book: `#set`/`#show` rules, or `#let` over any function above (later calls use the new one; functions defined earlier keep calling the originals) |
| `filter.lua` | A second `--lua-filter` after `book.lua`, both formats (`FORMAT` is `epub3` or `typst`) |

Together they can carry a book's own rules: mistaken-for-the-light's light-speech (all-caps one-word lines) works as a `filter.lua` emitting `#light-speech(...)` and `div.light-speech`, a `custom.typ` defining it, and a `custom.css` styling it.

## Verifying

Layout isn't verifiable from the markup. Render pages and look at them:

```sh
pdftoppm -f 4 -l 8 -r 50 -png dist/book.pdf /tmp/pg   # then view /tmp/pg-*.png
pdftotext -f N -l N dist/book.pdf -                    # which page something landed on
pdfinfo dist/book.pdf                                  # page count: a jump usually means something broke
```

For the EPUB, unzip it and read `EPUB/nav.xhtml` and `EPUB/text/*.xhtml`; epubcheck must stay clean. Both formats come from one filter pass, so check both.
