<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# book-exporter

A web app that turns markdown books (as written in [pen](https://github.com/fazo96/pen)) into an EPUB and a PDF. Next.js 16 (App Router), plain CSS in `app/styles/` (one file per part of the app, imported in order from `app/layout.tsx`), no UI kit. The export is pandoc with a Lua filter (EPUB, and Typst source) plus Typst (PDF): the pipeline of mistaken-for-the-light's `build.sh`, driven by each book's settings.

## Before you change anything

- **Never write to a real library** (`./data`, or wherever `BOOKX_DIR` points): it holds the user's books. Test against a scratch one: `BOOKX_DIR=<scratch dir> next dev -p 3123` ([development](docs/development.md)).
- **Never write to a manuscript's source** (the user's Obsidian vault, pen's library): import copies the text; the app only ever writes inside `BOOKX_DIR`.
- Node, pandoc, Typst, epubcheck and the book fonts come from `nix develop`. Check your work with `npm test`, `npm run typecheck` and `npm run lint`.
- **Verify layout by looking at the pages**, not the markup: render them (`pdftoppm -f N -l N -r 70 -png book.pdf /tmp/pg`) and read them; unzip the EPUB and check its XHTML; epubcheck must stay clean. A rule that means "turn the page" in the PDF means nothing in the reflowing EPUB, so check both ([pipeline](docs/pipeline.md#verifying)).
- Keep these docs true: when you change how something works, update its page below.

## Docs

| Page | What's in it |
| --- | --- |
| [docs/development.md](docs/development.md) | Running it, the scratch library, Nix and the tools, fonts, the CLI, tests |
| [docs/pipeline.md](docs/pipeline.md) | The export: assembling the source, `assets/book.lua`, the EPUB (CSS, fonts, cover, OPF patches, epubcheck), the PDF (`assets/book.typ`, `cfg`), custom files, verifying |
| [docs/library.md](docs/library.md) | The library on disk (`lib/store.ts`), the settings (`lib/config.ts`), front and back matter, versions |
| [docs/api.md](docs/api.md) | `app/api/projects/`: every route |
