import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { handleMcp } from "../lib/construct/mcp.ts";
import { settingsDiffs } from "../lib/construct/tools/book.ts";
import { callTool, listTools } from "../lib/construct/tools/index.ts";
import { parsePages } from "../lib/construct/tools/preview.ts";
import type { BookPart } from "../lib/construct/types.ts";
import {
  addAttachment,
  createProject,
  readConfig,
  readCustom,
  readMatter,
  readNotes,
  restoreSnapshot,
  setAttachmentCaption,
  snapshotBook,
  writeCustom,
  writeNotes,
} from "../lib/store.ts";

// Construct's tools (lib/construct/tools/) and the MCP endpoint that serves
// them (lib/construct/mcp.ts), on the scratch library.

const changes: BookPart[][] = [];
let snapshots = 0;
const ctx = (projectId: string) => ({
  projectId,
  beforeChange: async () => void snapshots++,
  onChange: (parts: BookPart[]) => void changes.push(parts),
});

test("the MCP endpoint speaks JSON-RPC: handshake, tool list, calls, batches and notifications", async () => {
  const { id } = await createProject("# Mcp Book\n\nOne line.");
  const init = (await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, ctx(id))) as {
    result: { protocolVersion: string };
  };
  assert.equal(init.result.protocolVersion, "2025-06-18");
  const list = (await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx(id))) as { result: { tools: { name: string }[] } };
  assert.deepEqual(
    list.result.tools.map((t) => t.name),
    listTools().map((t) => t.name),
  );
  assert.ok(list.result.tools.some((t) => t.name === "render_pages"));
  const call = (await handleMcp(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_manuscript", arguments: {} } },
    ctx(id),
  )) as { result: { content: { text: string }[]; isError: boolean } };
  assert.equal(call.result.isError, false);
  assert.match(call.result.content[0].text, /One line\./);
  assert.equal(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx(id)), null);
  const batch = (await handleMcp(
    [
      { jsonrpc: "2.0", id: 4, method: "ping" },
      { jsonrpc: "2.0", id: 5, method: "nope" },
    ],
    ctx(id),
  )) as { id: number; error?: { code: number } }[];
  assert.deepEqual(
    batch.map((r) => [r.id, r.error?.code]),
    [
      [4, undefined],
      [5, -32601],
    ],
  );
});

test("the manuscript reads by section and line, and nothing writes it", async () => {
  const { id } = await createProject("# Read Book\n\n## Part One\n\n### The Harbour\n\nShips.\n\n### The Hill\n\nGrass.");
  const call = (name: string, args: Record<string, unknown> = {}) => callTool(name, args, ctx(id));
  const outline = (await call("outline")).text;
  assert.match(outline, /^# Read Book {2}\[title\] \(lines 1–11/);
  assert.match(outline, /### The Harbour {2}\[chapter\] \(lines 5–8, 1 words\)/);
  assert.equal((await call("read_manuscript", { heading: "hill" })).text, "Lines 9–11 of 11:\n 9\t### The Hill\n10\t\n11\tGrass.");
  assert.equal((await call("search_manuscript", { query: "SHIPS" })).text, "1 line:\n7\tShips.");
  assert.ok(listTools().every((t) => !/manuscript/.test(t.name) || t.annotations.readOnlyHint));
});

test("update_settings saves a partial patch, says what it clamped, and guards the identifier and the matter", async () => {
  const { id } = await createProject("# Settings Book\n\nText.");
  const before = (await readConfig(id))!;
  const call = (patch: unknown) => callTool("update_settings", { patch }, ctx(id));
  const n = changes.length;

  assert.deepEqual(await call({ typography: { fontSize: 10.5 }, pdf: { margins: { inside: 22 } } }), { text: "Saved.", isError: false });
  const c = (await readConfig(id))!;
  assert.equal(c.typography.fontSize, 10.5);
  assert.equal(c.pdf.margins.inside, 22);
  assert.equal(c.pdf.margins.top, before.pdf.margins.top);
  assert.deepEqual(changes.slice(n), [["settings"]]);

  const clamped = await call({ typography: { fontSize: 40, bogus: 1 }, pdf: { trim: "scroll" } });
  assert.match(clamped.text, /typography\.fontSize: asked for 40, saved 18/);
  assert.match(clamped.text, /typography\.bogus: no such setting, ignored/);
  assert.match(clamped.text, /pdf\.trim: asked for "scroll", saved "a5"/);
  // Some agents send the patch as JSON text.
  assert.equal((await callTool("update_settings", { patch: '{"typography":{"justify":false}}' }, ctx(id))).text, "Saved.");
  assert.equal((await readConfig(id))!.typography.justify, false);

  assert.match((await call({ metadata: { identifier: { scheme: "UUID", value: "urn:uuid:other" } } })).text, /identifier never changes/);
  assert.match((await call({ matter: [] })).text, /list every section/);
  assert.match((await call({ matter: [{ id: "nope" }] })).text, /give every section by its id/);
  assert.equal((await call({ matter: [{ ...before.matter[0], title: "Rights" }] })).text, "Saved.");
  assert.equal((await readConfig(id))!.matter[0].title, "Rights");
  assert.deepEqual(settingsDiffs({ a: { b: 1 } }, { a: { b: 1 } }), []);
});

test("custom files, matter and notes are edited by exact text, or written whole", async () => {
  const { id } = await createProject("# Edit Book\n\nText.");
  const call = (name: string, args: Record<string, unknown>) => callTool(name, args, ctx(id));
  const n = snapshots;

  assert.equal((await call("edit_custom", { file: "custom.typ", new_text: "#set par(justify: true)\n#set par(justify: true)\n" })).text, "Saved.");
  assert.match((await call("edit_custom", { file: "custom.typ", old_text: "justify: true", new_text: "x" })).text, /more than once/);
  assert.match((await call("edit_custom", { file: "custom.typ", old_text: "nowhere", new_text: "x" })).text, /isn't in custom\.typ/);
  assert.equal((await call("edit_custom", { file: "custom.css", new_text: "p { color: red; }" })).text, "Saved.");
  assert.equal((await call("edit_custom", { file: "custom.css", old_text: "red", new_text: "blue" })).text, "Saved.");
  assert.equal(await readCustom(id, "css"), "p { color: blue; }");
  assert.equal((await call("edit_custom", { file: "custom.css", new_text: "" })).text, "Removed custom.css.");
  assert.equal(await readCustom(id, "css"), "");
  assert.match((await call("read_custom", { file: "custom.typ" })).text, /^Lines 1–3 of 3:\n1\t#set par/);
  assert.equal((await call("edit_custom", { file: "style.css", new_text: "" })).isError, true);

  assert.match((await call("edit_matter", { id: "copyright", old_text: "{{rights}}", new_text: "{{rights}} Printed in Italy." })).text, /Saved/);
  assert.match(await readMatter(id, "copyright"), /\{\{rights\}\} Printed in Italy\./);
  assert.match((await call("edit_matter", { id: "nope", new_text: "x" })).text, /No section "nope"/);
  const added = await call("add_matter", { kind: "dedication" });
  assert.match(added.text, /^Added "dedication"/);

  assert.equal((await call("read_notes", {})).text, "The Notes are empty.");
  await call("edit_notes", { new_text: "Warm, quiet pages.", append: true });
  await call("edit_notes", { new_text: "Scene breaks: a fleuron.", append: true });
  assert.equal(await readNotes(id), "Warm, quiet pages.\n\nScene breaks: a fleuron.\n");
  assert.ok(snapshots > n, "every change asks for the snapshot first");
  assert.deepEqual(changes.at(-1), ["notes"]);
});

test("a snapshot puts the settings, matter, custom files and notes back as they were", async () => {
  const { id } = await createProject("# Snapshot Book\n\nText.");
  await writeCustom(id, "typ", "#set page(fill: red)");
  await snapshotBook(id, "chat-1-u-1");
  await callTool("update_settings", { patch: { typography: { fontSize: 14 } } }, ctx(id));
  await callTool("add_matter", { kind: "dedication" }, ctx(id));
  await callTool("edit_custom", { file: "custom.typ", new_text: "" }, ctx(id));
  await callTool("edit_custom", { file: "custom.css", new_text: "p {}" }, ctx(id));
  await writeNotes(id, "New notes.");

  await restoreSnapshot(id, "chat-1-u-1");
  const c = (await readConfig(id))!;
  assert.notEqual(c.typography.fontSize, 14);
  assert.deepEqual(c.matter.map((m) => m.id), ["copyright"]);
  assert.equal(await readCustom(id, "typ"), "#set page(fill: red)");
  assert.equal(await readCustom(id, "css"), "");
  assert.equal(await readNotes(id), "");
  assert.equal(await readMatter(id, "dedication"), "", "the added section's file is gone");
  await assert.rejects(restoreSnapshot(id, "chat-2-u-1"), /gone/);
  await assert.rejects(snapshotBook(id, "../x"), /invalid/);
});

test("pages are asked for as numbers and ranges, a few at a time", () => {
  assert.deepEqual(parsePages("1-3, 8", 10), [1, 2, 3, 8]);
  assert.deepEqual(parsePages("9-12", 10), [9, 10]);
  assert.deepEqual(parsePages("4 4", 10), [4]);
  assert.throws(() => parsePages("11", 10), /has 10 pages/);
  assert.throws(() => parsePages("1-9", 10), /At most 8/);
  assert.throws(() => parsePages("two", 10), /isn't a page/);
  assert.throws(() => parsePages("", 10), /Which pages/);
});

const has = (cmd: string, flag = "--version") => spawnSync(cmd, [flag], { stdio: "ignore" }).status === 0;

test("export_book exports the PDF, render_pages shows its pages, find_in_pdf finds text", { skip: !(has("typst") && has("pandoc") && has("pdftoppm", "-v")) }, async () => {
  const { id } = await createProject("# Render Book\n\n### One\n\nThe harbour was quiet.\n\n### Two\n\nThe hill was green.");
  const call = (name: string, args: Record<string, unknown> = {}) => callTool(name, args, ctx(id));
  assert.match((await call("render_pages", { pages: "1" })).text, /no PDF yet/);

  const exported = await call("export_book");
  assert.equal(exported.isError, false, exported.text);
  assert.match(exported.text, /^Exported PDF in [\d.]+ s\.\nPDF: \d+ pages\./);
  assert.deepEqual(changes.at(-1), ["export"]);

  const found = await call("find_in_pdf", { text: "hill was  GREEN" });
  const page = Number(found.text.match(/^Page (\d+):/)?.[1]);
  assert.ok(page > 1, found.text);
  const shown = await call("render_pages", { pages: String(page) });
  assert.equal(shown.isError, false, shown.text);
  assert.match(shown.text, new RegExp(`Page ${page} \\(rendered as [a-z0-9]+-p${page}-r60\\.png\\):`));
  assert.equal(shown.images?.length, 1);
  assert.equal(shown.images?.[0].mimeType, "image/png");
  assert.ok(Buffer.from(shown.images![0].data, "base64").subarray(1, 4).toString() === "PNG");
  assert.match((await call("read_build_log", { problems: true })).text, /./);
  assert.match((await call("read_epub")).text, /no EPUB yet/);

  // Another book's chat looks at this book's pages: kept with its own renders, named after this one.
  const { id: elsewhere } = await createProject("# Elsewhere Book\n\nText.");
  const theirs = await callTool("render_pages", { pages: "1", book: id }, ctx(elsewhere));
  assert.equal(theirs.isError, false, theirs.text);
  assert.match(theirs.text, new RegExp(`in the PDF of ${id} exported`));
  assert.match(theirs.text, new RegExp(`Page 1 \\(rendered as [a-z0-9]+-p1-r60-${id}\\.png\\):`));
  assert.match((await callTool("find_in_pdf", { text: "harbour", book: id }, ctx(elsewhere))).text, /^Page \d+:/);
});

test("the reading tools read another book with `book`; the writing tools only ever this one", async () => {
  const { id } = await createProject("# Here Book\n\nHere.");
  const { id: other } = await createProject("# There Book\n\n### Only Chapter\n\nThere.");
  await writeNotes(other, "Small caps everywhere.");
  await writeCustom(other, "typ", "#set text(tracking: 0.02em)");
  const call = (name: string, args: Record<string, unknown> = {}) => callTool(name, args, ctx(id));

  const books = (await call("list_books")).text;
  assert.match(books, new RegExp(`^${id} \\(this book\\): "Here Book"`, "m"));
  assert.match(books, new RegExp(`^${other}: "There Book", \\d+ words, never exported$`, "m"));
  assert.match((await call("outline", { book: other })).text, /### Only Chapter/);
  assert.match((await call("read_manuscript", { book: other })).text, /There\./);
  assert.match((await call("read_notes", { book: other })).text, /Small caps everywhere\./);
  assert.match((await call("read_custom", { file: "custom.typ", book: other })).text, /tracking: 0\.02em/);
  assert.match((await call("read_settings", { section: "metadata", book: other })).text, /"There Book"/);
  assert.match((await call("read_notes")).text, /Notes are empty/, "without `book`, this one");
  assert.match((await call("read_notes", { book: id })).text, /Notes are empty/);
  for (const bad of ["no-such-book", "../data"]) {
    const r = await call("read_notes", { book: bad });
    assert.equal(r.isError, true);
    assert.match(r.text, /list_books lists them/);
  }

  for (const t of listTools()) {
    if (!t.annotations.readOnlyHint) assert.equal(Object.hasOwn(t.inputSchema.properties, "book"), false, `${t.name} writes, so it can't take book`);
  }
  // A `book` given to a write is ignored: it isn't in the schema, so readArgs drops it.
  await call("edit_notes", { new_text: "Mine.", book: other });
  assert.equal(await readNotes(id), "Mine.");
  assert.equal(await readNotes(other), "Small caps everywhere.");
});

test("attachments are listed with their captions, looked at as images and read as text", { skip: !(has("magick") && has("pdftoppm", "-v") && has("typst")) }, async () => {
  const { id } = await createProject("# Attach Book\n\nText.");
  const { id: other } = await createProject("# Attach Other\n\nText.");
  const call = (name: string, args: Record<string, unknown> = {}) => callTool(name, args, ctx(id));
  assert.equal((await call("list_attachments")).text, "No attachments.");

  const dir = mkdtempSync(path.join(tmpdir(), "bookx-attach-"));
  try {
    // A big image, which comes back scaled down, and a two-page PDF with text.
    spawnSync("magick", ["-size", "3000x2000", "xc:#c0a080", path.join(dir, "spread.png")]);
    writeFileSync(path.join(dir, "guide.typ"), "#set page(width: 100mm, height: 140mm)\nChapter openers sit low.\n#pagebreak()\nScene breaks are a fleuron.");
    assert.equal(spawnSync("typst", ["compile", path.join(dir, "guide.typ")]).status, 0);
    const spread = await addAttachment(id, new Uint8Array(readFileSync(path.join(dir, "spread.png"))), "png", "spread.png");
    await setAttachmentCaption(id, spread, "The margins.");
    const guide = await addAttachment(other, new Uint8Array(readFileSync(path.join(dir, "guide.pdf"))), "pdf", "Style Guide.pdf");
    assert.equal(guide, "style-guide.pdf");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  assert.match((await call("list_attachments")).text, /^spread\.png \(PNG image, \d+ KB\): The margins\.$/);
  assert.match((await call("list_attachments", { book: other })).text, /^style-guide\.pdf \(PDF, 2 pages, \d+ KB\)$/);

  const image = await call("view_attachment", { name: "spread.png" });
  assert.equal(image.isError, false, image.text);
  assert.match(image.text, /The writer's caption: The margins\./);
  assert.equal(image.images?.[0].mimeType, "image/jpeg");
  const jpeg = Buffer.from(image.images![0].data, "base64");
  assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const dims = spawnSync("magick", ["identify", "-format", "%wx%h", "-"], { input: jpeg }).stdout.toString();
  assert.equal(dims, "1568x1045");

  const pages = await call("view_attachment", { name: "style-guide.pdf", pages: "1-2", book: other });
  assert.equal(pages.isError, false, pages.text);
  assert.match(pages.text, /^style-guide\.pdf, pages 1, 2 of 2:$/);
  assert.equal(pages.images?.length, 2);
  assert.match((await call("view_attachment", { name: "style-guide.pdf", pages: "3", book: other })).text, /has 2 pages/);

  const text = (await call("read_attachment", { name: "style-guide.pdf", book: other })).text;
  assert.match(text, /--- Page 1 ---\n.*Chapter openers sit low\.[\s\S]*--- Page 2 ---\n.*Scene breaks are a fleuron\./);
  assert.match((await call("read_attachment", { name: "spread.png" })).text, /is an image: view_attachment shows it/);
  assert.match((await call("view_attachment", { name: "gone.png" })).text, /No attachment "gone\.png"\. There are: spread\.png\./);
});
