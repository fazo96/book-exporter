# book-exporter

*Markdown books to EPUB and PDF.*

A small self-hosted web app for the step after writing: import a manuscript written in markdown (in [pen](https://github.com/fazo96/pen), Obsidian or anything else), set up how the book should look, and export a store-ready EPUB and a typeset PDF. When the manuscript changes, drop the new version in and export again: the settings, front and back matter and cover stay.

## How it works

- **Import** a `.md` file (drop it on the library). The first `#` heading becomes the title.
- **Import from pen**: connect to your pen (its address, and its password if it's locked; only pen's session is kept) and pick a book. It stays linked: pull the newest text from the Manuscript tab, or automatically before every export.
- **Duplicate** a book to make another edition from it: everything but its versions and exports, with a new identifier.
- **Manuscript**: replace it with a newer version by dropping, choosing or pasting it (or `curl -T book.md …/api/projects/<id>/manuscript`). The previous one is kept as a version. The outline shows how the export will read the headings.
- **Book**: title, authors (with the name a library sorts by), publisher, language, rights, description, BISAC subjects and keywords, series, a fixed identifier, and the cover (PNG, JPEG, WebP or SVG).
- **Layout**:
  - Which headings are parts, chapters and scenes. The default is pen's: `#` title, `##` part, `###` chapter, `####` scene.
  - Chapter and part numbering, the scene break ornament, epigraphs, the end mark and the contents.
  - Fonts from a curated set, size, leading, indents, justification, hyphenation and the heading style.
  - The PDF's page size, margins, folios, running heads and right-hand openers.
- **Front & back**: a copyright page, dedication, epigraph, foreword, also-by, afterword, acknowledgments, about the author, thanks for reading. Each is markdown that may use `{{title}}`, `{{author}}`, `{{year}}`, `{{rights}}`… and can be put in either format or both.
- **Custom**: your own EPUB CSS, Typst for the PDF, and a pandoc Lua filter, for what the settings don't cover.
- **Export**: the EPUB is validated with epubcheck. Downloads include the cover as the JPEG stores take. The PDF can be previewed in the page.

Under the hood: pandoc with a Lua filter writes the EPUB and the Typst source, and Typst sets the PDF ([docs/pipeline.md](docs/pipeline.md)).

## Running it

It needs Node 24, pandoc, Typst, epubcheck, resvg, ImageMagick, zip/unzip, poppler and the fonts. With Nix, `nix develop` has them all.

```sh
nix develop
npm install
npm run dev -- -H 127.0.0.1     # http://localhost:3000
```

Books live in `./data`. Point `BOOKX_DIR` elsewhere to keep them somewhere else. There's no login, and a book's custom Lua filter and Typst run with the server's permissions, so keep it on your own machine.

From the command line, on the same library: `npm run cli -- import book.md`, `npm run cli -- update <id> book.md`, `npm run cli -- export <id> [epub|pdf]`.

## Developing

See [AGENTS.md](AGENTS.md) and [docs/](docs/). `npm test`, `npm run typecheck` and `npm run lint` check the work.
