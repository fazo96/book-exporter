# The library on disk

`lib/store.ts`: one folder per book in `BOOKX_DIR` (default `./data`).

```
<id>/project.json     the book's settings (BookConfig, lib/config.ts)
<id>/manuscript.md    the manuscript as last imported or replaced
<id>/versions/        earlier manuscripts, one file each, named by time
<id>/matter/<m>.md    front and back matter text, ordered by project.json
<id>/custom.css       added after the generated EPUB stylesheet
<id>/custom.typ       added after the PDF's Typst setup
<id>/filter.lua       run after the built-in pandoc filter
<id>/cover.<ext>      png, jpg, webp or svg (sniffed from its bytes)
<id>/build/           the last export's working folder (rebuildable)
<id>/dist/            the last export: the files, build.json, build.log
<id>/pen.json         the pen book its manuscript is pulled from (lib/pen.ts)
<id>/notes.md         the Notes: the art direction Construct follows
<id>/attachments/     images and PDFs for Construct to look at (below the Notes)
<id>/attachments.json their captions: { "<name>": { "caption": "…" } }
<id>/construct/       Construct's chats, snapshots/ and renders/ (docs/construct.md)
.trash/<id>--<time>/  deleted books
.bookx-pen.json       the pen connection: pen's address and session (mode 600)
.bookx-construct.json the model Construct's new chats start on
```

Ids match `^[a-z0-9][a-z0-9-]{0,79}$` (`lib/ids.ts`), which also keeps paths inside the library. A new book's id is its title slugified, with `-2`, `-3`… when taken; `project.json` is created with `createExclusive`, so two imports can't claim one folder.

Whole files are written with `writeAtomic` (`lib/files.ts`, from pen): a temporary file beside it, renamed over. Every read-modify-write of a project goes through its queue (`lib/queue.ts`, `project:<id>`).

## Settings

`lib/config.ts` defines `BookConfig`: `metadata`, `structure` (which heading levels are parts, chapters and scenes; numbering; scene breaks; epigraphs; the end mark; comments; raw HTML; contents), `typography`, `pdf`, `epub` and `matter`. Everything read from disk or a request goes through `sanitizeConfig(raw, base)`: missing or malformed values take `base`'s (on a save, the current settings; on a read, the defaults), numbers are clamped, fonts must be in `lib/fonts.ts`. The defaults follow pen's headings: `#` title, `##` part, `###` chapter, `####` scene.

The identifier is minted once (`urn:uuid:…`) when a book is created and never regenerated: a new one makes an e-reader shelve an update as a different book.

## Front and back matter

`config.matter` lists the sections in order, each with its `placement` (front or back), `style` (plain, centered, copyright, dedication, epigraph), whether its title shows and is in the contents, and the formats it goes in. The text is `matter/<id>.md`. Templates (`MATTER_KINDS` in `lib/matter.ts`) seed a new section's settings and text. `{{title}}`, `{{author}}`, `{{year}}`, `{{rights}}`, `{{isbn}}`… are filled at export (`fillVariables`), so a changed year reaches every page; a line left empty by a blank variable is dropped.

Sections are added and removed only through `addMatter`/`deleteMatter` (they own a file); `saveConfig` can reorder and edit them but drops ids it doesn't know. A new book starts with a copyright page.

## Attachments

Images and PDFs the writer adds in the Notes tab for [Construct](construct.md#attachments) to look at. The type comes from the bytes (`sniffAttachment`): PNG, JPEG, WebP, GIF or PDF, up to 20 MB, never SVG. The name is the uploaded file's, slugified, with the type's extension, and `-2`, `-3`… when taken (`addAttachment`, which claims it with `createExclusive`); names match `^[a-z0-9][a-z0-9-]{0,79}\.(png|jpg|webp|gif|pdf)$` (`isValidAttachment`). A caption is up to 2,000 characters; an empty one is removed. They're listed oldest first. Nothing writes an attachment once it's added: the writer adds, captions and removes them, and Construct only looks.

## Versions

Replacing the manuscript (`replaceManuscript`) moves the old text to `versions/<ISO time>.md` unless the new text is identical, and answers the word and chapter counts before and after. Restoring a version is a replace with its text, so the current one becomes a version in turn. Nothing prunes versions yet.

## Copies

`cloneProject` copies a book to `<id>-copy` (`-copy-2`, `-copy-3`… when taken): its settings, manuscript, matter, custom files, Notes, attachments, cover and pen link, but not its versions, exports or Construct's chats. The copy gets a new identifier, since a copy is usually another edition (a paperback, an advance copy) and stores and e-readers tell editions apart by it. The title stays, so the library shows the id on cards whose titles are shared.

## pen

`lib/pen.ts` reads [pen](https://github.com/fazo96/pen) over its HTTP API and never writes to it: `GET /api/auth`, `POST /api/auth` `{ action: "unlock" }`, `GET /api/docs`, `GET /api/docs/<doc>` (`{ content, version }`, the version a hash of the text) and `GET /api/docs/<doc>/cover`.

- **The connection** is one per library, in `.bookx-pen.json`: pen's address and, when pen is locked, the `pen_session` cookie its unlock answered with. That's a signed token good for 90 days. The password is sent once and never stored. When pen answers 401 (the session expired, or pen's password changed), the API answers 401 and the Library's "Import from pen" panel asks for the password again.
- **Importing** (`importBook`) makes a book from pen's text (titled by its `#` heading, else pen's id), writes `pen.json`, and takes pen's cover if it has one. pen keeps covers downscaled (WebP), so upload the full one before publishing.
- **Pulling** (`pull`) fetches the linked book and, when its text differs, replaces the manuscript through `replaceManuscript`, so the old text becomes a version. Then it records pen's version and the time.
- **Before an export:** with `pullOnExport` (on by default), the export pulls first. If pen can't be reached it logs a warning and exports the text as last pulled.
- **Which session a link uses:** a link remembers pen's address. It uses the connection's session only while the connection is to that same address.
