# Working on book-exporter

## The user's data

**Never write to a real library.** `./data` (the default `BOOKX_DIR`) holds the user's books, settings and exports. Test against a scratch one:

```sh
nix develop -c bash -c 'BOOKX_DIR=/tmp/bookx-scratch npx next dev -p 3123 -H 127.0.0.1'
```

Manuscripts come from elsewhere (the Obsidian vault, pen's library): import reads a copy, and nothing here writes back to them.

## Running it

```sh
nix develop          # Node 24, pandoc, typst, epubcheck, resvg, imagemagick, zip/unzip, poppler, the fonts
npm install
npm run dev          # http://localhost:3000
# or: npm run build && npm start
```

There's no lock or login: it listens where `next` is told to (`-H 127.0.0.1` keeps it on this machine). Don't expose it as is: a project's `filter.lua` and `custom.typ` run with the server's permissions.

| Variable | Default | What it does |
| --- | --- | --- |
| `BOOKX_DIR` | `./data` | The library |
| `BOOKX_FONT_PATHS` | `TYPST_FONT_PATHS` | Colon-separated font folders: Typst sets the PDF from them and the EPUB embeds files from them. `nix develop` sets both |
| `BOOKX_DEV_ORIGINS` | | Comma-separated hostnames or addresses other machines use to reach `next dev` (`allowedDevOrigins`): without them it refuses its live-reload socket to them |
| `BOOKX_AI` | | `off` turns Construct off even with an agent installed ([Construct](construct.md#when-its-on), which has its other variables) |

To try it from another machine on the network: `BOOKX_DEV_ORIGINS=<this machine's LAN IP>,<hostname> npx next dev -p 3100 -H 0.0.0.0`.

Next 16 allows one `next dev` per checkout. To try something on a scratch library while another dev server runs from this folder, stop that one first.

`tests/pen.test.ts` tests `lib/pen.ts` against a stand-in pen on a random port. Never test pulls against a real pen with a real library: connect a scratch one instead.

## Nix and the tools

`flake.nix` has the dev shell only, for now (a package and a NixOS module like pen's are future work). The export runs `pandoc`, `typst`, `epubcheck`, `resvg` (SVG covers), `magick` (the store JPEG, WebP covers), `zip`/`unzip` (EPUB patches) and `pdfinfo` from `PATH`; a missing one fails its step with "not installed (run inside `nix develop`)".

## Fonts

The faces are nixpkgs font packages listed in `flake.nix` (`fontsFor`) and in `lib/fonts.ts`, which names each one's Typst family (`typst fonts` shows them: EB Garamond is "EB Garamond 12", Jost is "Jost*") and the static files the EPUB embeds (no variable fonts). To add one: add the package to the flake, its entry to `FONTS`, and check every file resolves (`lib/build/run.ts`'s `fontFiles()` follows symlinks: nix font folders are made of them, and `find -type f` misses those).

## The CLI

`npm run cli --` works on the same library (`BOOKX_DIR`) without the server: `import <file.md>`, `update <id> <file.md>`, `export <id> [epub|pdf]`, `pull <id>` (a pen-linked book, through the library's pen connection), `list`. Handy for scripts and for testing the pipeline alone.

## Tests

`npm test` runs `tests/*.test.ts` with Node's runner. `tests/setup.mjs` points `BOOKX_DIR` at a throwaway folder and `scripts/register.mjs` resolves `@/` and `server-only` the way Next does. `tests/build.test.ts` also runs `assets/book.lua` through pandoc when it's on `PATH` (inside `nix develop`), and skips those tests otherwise.

The pages themselves have no automated browser suite yet; check UI changes in a browser against a scratch library.

## Stopping servers you started

`next dev` started in the background keeps running; stop yours by PID (`pgrep -f "next dev"`, check `readlink /proc/<pid>/cwd`) rather than a broad `pkill`.
