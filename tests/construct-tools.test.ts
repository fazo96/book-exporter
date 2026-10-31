import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { handleMcp } from "../lib/construct/mcp.ts";
import { settingsDiffs } from "../lib/construct/tools/book.ts";
import { callTool, listTools } from "../lib/construct/tools/index.ts";
import { parsePages } from "../lib/construct/tools/preview.ts";
import type { BookPart } from "../lib/construct/types.ts";
import {
  createProject,
  readConfig,
  readCustom,
  readMatter,
  readNotes,
  restoreSnapshot,
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
});
