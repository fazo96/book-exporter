# Construct

The AI side panel, ported from [pen](https://github.com/fazo96/pen)'s (its `docs/construct.md` has the history of the shared parts). Here it's a typesetter: it exports the book, looks at the pages, and changes the settings, the front and back matter, the custom files and the Notes with the writer. The manuscript and the attachments are read-only to it. So are the library's other books: it reads them, but only changes the one whose page it's on.

## Pieces

- `lib/acp.ts`: starting an ACP agent over stdio, the handshake, stopping it (as pen's).
- `lib/construct/`:
  - `agents.ts`: the presets. Claude Code runs through `@agentclientprotocol/claude-agent-acp` (via `npx`); pi runs through `pi-acp`, `scripts/pi-construct` and `pi-mcp-adapter`.
  - `agentInfo.ts`: the agents' names, for the browser.
  - `detect.ts`: whether an agent can run here.
  - `session.ts`: one conversation per book, streamed to the panel over SSE.
  - `transcript.ts`: how the agent's session updates change the chat's items.
  - `chats.ts`: the stored chat's shape and title.
  - `prompts.ts`: what the agent is told.
  - `types.ts`: what goes over the wire.
  - `models.ts`, `probe.ts`: the models on offer, and the one new chats start on.
  - `mcp.ts` and `tools/`: the tools.
- `components/Construct.tsx`, with `ConstructItem` (one transcript item, and what each tool did, by `ToolName`), `ConstructChats`, `ConstructModelMenu` and `ConstructMarkdown`. `lib/useConstruct.ts` follows the event stream. Styles are in `app/styles/construct.css`.
- Routes: `app/api/projects/[id]/construct/` (the panel; `renders/<file>` serves the rendered pages), `app/api/construct/mcp` (the tools, for the agent process) and `app/api/construct/models`.

## When it's on

Construct is off unless an agent is found when the server starts:

- Claude Code, by its command (`BOOKX_CLAUDE`, else `claude`) or by a credential it can use (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `.credentials.json` in `CLAUDE_CONFIG_DIR` or `~/.claude`).
- pi, by its command (`BOOKX_PI`, else `pi`).

`BOOKX_AI=off` keeps it off. `projectView` says so (`ai`): the book's page then hides the Construct button, and the routes answer 503. `BOOKX_CONSTRUCT_CLAUDE` and `BOOKX_CONSTRUCT_PI` override the commands that start the ACP agents. The agent reaches the MCP endpoint on loopback, at the port the request came in on; set `BOOKX_INTERNAL_URL` when that's wrong (behind a proxy).

## Tools

All of the agent's built-in tools are off: it gets only these, from `/api/construct/mcp`, authenticated by a per-session bearer token (one book's). Each tool is made with `tool()` in `tools/core.ts`; its JSON schema is both what the agent sees and what `readArgs` checks the arguments against.

| | |
| --- | --- |
| `list_books` | The library: each book's id, title, author, words and last export, this one marked |
| `outline`, `read_manuscript`, `search_manuscript` | The manuscript, read-only. Reads are numbered lines of a section (`heading`) and/or from `offset` for `limit` lines, at most 2,000 lines or about 50,000 characters, ending with where to go on from (`excerpt`) |
| `read_settings`, `update_settings` | The BookConfig, with a guide to its fields and the fonts. `update_settings` takes a partial `patch` through `saveConfig`, and answers with what `sanitizeConfig` clamped or ignored (`settingsDiffs`). It refuses to change the identifier, or to drop matter sections |
| `read_matter`, `edit_matter`, `add_matter` | Front and back matter. Only the writer deletes a section |
| `read_custom`, `edit_custom` | `custom.typ`, `custom.css`, `filter.lua` |
| `read_builtin` | `assets/book.typ`, `assets/book.lua`, and the PDF setup and EPUB stylesheet generated from the settings now |
| `read_notes`, `edit_notes` | The Notes |
| `export_book` | `buildProject` with `pull: false`, so the text doesn't change under it. The PDF by default. Answers with the page count, the warnings and errors, and epubcheck's counts |
| `read_build_log` | The last export's log, or just its problems |
| `render_pages` | At most 8 pages of the last PDF through `pdftoppm` (60 dpi by default, at most 150), returned as MCP image content |
| `find_in_pdf` | Which pages a phrase is on (`pdftotext`, whitespace folded) |
| `read_epub` | The files in the last EPUB, or one of them (`unzip`) |
| `list_attachments` | The [attachments](#attachments), with their type, size, PDF page count and caption |
| `view_attachment` | An image, scaled to at most 1,568 px on its longest side (`magick`, as JPEG), or at most 8 pages of a PDF (`pdftoppm`, 60 dpi by default, at most 150), returned as MCP image content with the caption |
| `read_attachment` | A PDF's text (`pdftotext`), numbered by line, with a `--- Page N ---` line where each page starts |

### Other books

Every tool that only reads takes `book`, another book's id (`bookProps` and `bookOf` in `tools/core.ts`): `bookOf` checks it's an id in the library (else the agent is pointed to `list_books`) and answers the chat's own book without it. The tools that write don't take it, so `readArgs` drops a `book` sent to one: the session's book is the only one that changes, and only it is snapshotted. To carry a style over, Construct reads it from the other book and makes it here.

`render_pages` of another book keeps the pages with this book's renders, named `<export time>-p<page>-r<dpi>-<book>.png` (`renderName`); `rendersIn` reads the book back from the name (`Render.book`), and the panel's bigger view says whose page it is and links to that book instead of to this PDF.

The edit tools replace `old_text` found exactly once (`replaceOnce`), or write the whole text without it. Every write calls `ctx.beforeChange()` first and `ctx.onChange(parts)` after. The session sends the parts to the page as a `changed` event, and the page reloads the book: drafts the writer hasn't touched since the last save take the new state; edited ones stay, with a banner (`constructChanged` in `Book.tsx`). Sending a message saves the page's drafts first.

The rendered pages are kept in `<id>/construct/renders/<export time>-p<page>-r<dpi>.png`, for the last 20 exports. `render_pages` names each one in its text (`renderedPage`), and `rendersIn` reads them back from the tool's result into the tool item (`renders`). The panel shows them as thumbnails, which open bigger, with a link to the PDF at that page.

## Undoing

Before a turn's first change, the session copies `project.json`, the matter, the custom files and `notes.md` to `<id>/construct/snapshots/<chat>-<message>/` (`snapshotBook`), and marks the message (`snapshot`). That message then offers "Undo Construct's changes from here on". `restoreSnapshot` puts those files back, and removes the ones that weren't there. The agent hears of it ahead of the next message (`revertUpdate`). Nothing prunes snapshots yet.

## The Notes

`notes.md`, the Notes tab: free text, the art direction. They close the system prompt, cut at 20,000 characters. When the writer changes them, the new text goes ahead of the next message (`notesUpdate`). Construct's own edits don't count as news, and a compaction resets what the agent has seen to the system prompt's version. A copy of the book takes them.

## Attachments

Images and PDFs the writer adds below the Notes (`<id>/attachments/`, [library](library.md)) to show Construct what they're after: pages they like, another book's spread, a style guide. Each can have a caption saying what to look at. The system prompt lists them, with their captions, ahead of the Notes (`attachmentsText`); when the writer adds, captions or removes one, the new list goes ahead of the next message (`attachmentsUpdate`), and a compaction resets what the agent has seen, as for the Notes. Construct can't change them; its tools only look (`tools/attachments.ts`), working in a temporary folder that's removed after.

## Chats and models

Chats are stored in `<id>/construct/<chat>.json` and resumed after a restart. Deleted ones go to `construct/trash/`. Titles, compaction, the context meter, the model and effort pickers, and pi's quirks all work as in pen.

The model picker lists every agent's models (`/api/construct/models`, kept 10 min). Another agent's model starts a new chat. The last model picked is the one new chats start on, kept in `BOOKX_DIR/.bookx-construct.json`.

## Verifying

The tools are tested in `tests/construct-tools.test.ts`, including a real export and render when Typst, pandoc and poppler are on `PATH`, and viewing and reading attachments when ImageMagick, poppler and Typst are. To try the panel, run a scratch library ([development](development.md)). The agent needs network access: `npx` fetches the ACP adapter on first use.
