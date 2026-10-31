# The API

`app/api/projects/`. Every handler is wrapped in `route()` (`lib/route.ts`): params awaited, and `id`, `mid`, `vid`, `kind` and `name` checked before it runs (404 otherwise); `not found` thrown by the store also answers 404, and a `PenError` from [pen](library.md#pen) answers 401 (sign in to pen again) or 502 (pen unreachable or refusing). No authentication (see [development](development.md#running-it)).

| Route | |
| --- | --- |
| `GET /api/projects` | The library: id, title, author, words, cover, last export, pen link |
| `POST /api/projects` `{ content, name }` | Import a manuscript as a new book → `{ id }` |
| `GET /api/projects/<id>` | Everything the book's page shows (`projectView`, `lib/view.ts`) |
| `PATCH /api/projects/<id>` | Save settings: any part of the BookConfig |
| `DELETE /api/projects/<id>` | Move the book to `.trash/` |
| `GET` / `PUT /api/projects/<id>/manuscript` | Download / replace the manuscript. The body is the markdown itself (`curl -T book.md …`) or `{ content }`; answers the counts before and after |
| `GET /api/projects/<id>/versions` | Earlier manuscripts |
| `GET` / `POST /api/projects/<id>/versions/<vid>` | Download / restore one |
| `POST /api/projects/<id>/matter` `{ kind }` | Add a section from a template |
| `PUT` / `DELETE /api/projects/<id>/matter/<mid>` | Save a section's text `{ body }` / delete it |
| `PUT /api/projects/<id>/custom/<css\|typ\|lua>` `{ text }` | Save a custom file (empty removes it) |
| `PUT /api/projects/<id>/notes` `{ text }` | Save the Notes (empty removes them) |
| `GET /api/projects/<id>/construct` | Construct's conversation, as server-sent events: a snapshot, then every change (`ConstructEvent`) ([Construct](construct.md)) |
| `POST /api/projects/<id>/construct` `{ action, … }` | Drive it (`ConstructAction`: start, prompt, cancel, compact, reset, chats, model, revert); answers 204, 409 while it's answering, 503 when Construct is off |
| `GET /api/projects/<id>/construct/renders/<file>` | A page Construct rendered |
| `GET` / `PUT` / `DELETE /api/projects/<id>/cover` | The cover; PUT takes the image as the body |
| `POST /api/projects/<id>/build` `{ formats }` | Export; streams `{ t: "step" \| "log" \| "done" \| "error" }` lines. 409 while one runs |
| `GET /api/projects/<id>/files/<name>` | A file of the last export (`?inline` to show it rather than download) |
| `POST /api/projects/<id>/clone` | Copy the book under a new id and identifier → `{ id }` ([copies](library.md#copies)) |
| `POST /api/projects/<id>/pen/pull` | Pull the linked pen book → `{ change, version }`, `change` null when the text was the same |
| `PATCH` / `DELETE /api/projects/<id>/pen` | Set `{ pullOnExport }` / unlink (the manuscript stays) |
| `GET` / `PUT` / `DELETE /api/pen` | The pen connection `{ url, signedIn, error? }` / connect with `{ url, password? }` / forget it |
| `GET /api/pen/books` | pen's books, as pen lists them |
| `POST /api/pen/import` `{ doc }` | A new book from pen, linked → `{ id }` |
| `GET /api/construct/models` | The agents Construct can run on, with their models |
| `POST /api/construct/mcp` | Construct's tools, for the agent process only: MCP over JSON-RPC, with the session's bearer token |

To update a book's manuscript from a script and export it:

```sh
curl -T book.md http://localhost:3000/api/projects/<id>/manuscript
curl -N -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:3000/api/projects/<id>/build
```
