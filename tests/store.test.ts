import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addMatter,
  cloneProject,
  createProject,
  listVersions,
  readConfig,
  readCustom,
  readManuscript,
  readMatter,
  replaceManuscript,
  saveConfig,
  sniffCover,
  writeCustom,
  writeMatter,
} from "../lib/store.ts";

// The library on disk (lib/store.ts), in tests/setup.mjs's scratch BOOKX_DIR.

test("a new book takes its title and id from the first # heading, with a fixed UUID and a copyright page", async () => {
  const { id } = await createProject("# Store Test\n\n### One\n\nText.");
  assert.equal(id, "store-test");
  const again = await createProject("# Store Test\n\nOther.");
  assert.equal(again.id, "store-test-2");
  const c = (await readConfig(id))!;
  assert.equal(c.metadata.title, "Store Test");
  assert.match(c.metadata.identifier.value, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.deepEqual(c.matter.map((m) => m.id), ["copyright"]);
  assert.match(await readMatter(id, "copyright"), /\{\{rights\}\}/);
});

test("replacing the manuscript keeps the old one as a version, unless it's the same text", async () => {
  const { id } = await createProject("# Versions\n\n### One\n\nOne two.");
  const change = await replaceManuscript(id, "# Versions\n\n### One\n\nOne two three.\n\n### Two\n\nFour.");
  assert.deepEqual([change.before, change.after], [
    { words: 4, chapters: 1 }, // headings are printed, so they count
    { words: 7, chapters: 2 },
  ]);
  assert.ok(change.version);
  assert.equal((await replaceManuscript(id, "# Versions\n\n### One\n\nOne two three.\n\n### Two\n\nFour.")).version, null);
  assert.equal((await listVersions(id)).length, 1);
});

test("saving settings can reorder matter but not invent sections", async () => {
  const { id } = await createProject("# Matter Test");
  await addMatter(id, "dedication");
  const saved = await saveConfig(id, { matter: [{ id: "dedication" }, { id: "made-up" }] });
  assert.deepEqual(saved.matter.map((m) => m.id), ["dedication", "copyright"]);
});

test("covers are recognized by their bytes", () => {
  assert.equal(sniffCover(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), "png");
  assert.equal(sniffCover(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "jpg");
  assert.equal(sniffCover(new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')), "svg");
  assert.equal(sniffCover(new TextEncoder().encode("<html><script>")), null);
});

test("a clone copies the book under -copy with a new identifier, but not its versions", async () => {
  const { id } = await createProject("# Clone Me\n\nOne.");
  await addMatter(id, "dedication");
  await writeMatter(id, "dedication", "For you.");
  await writeCustom(id, "css", "p { color: red }");
  await replaceManuscript(id, "# Clone Me\n\nTwo.");
  const { id: copy } = await cloneProject(id);
  assert.equal(copy, "clone-me-copy");
  assert.equal((await cloneProject(id)).id, "clone-me-copy-2");
  const [a, b] = [(await readConfig(id))!, (await readConfig(copy))!];
  assert.notEqual(b.metadata.identifier.value, a.metadata.identifier.value);
  assert.deepEqual({ ...b, metadata: { ...b.metadata, identifier: a.metadata.identifier } }, a);
  assert.equal(await readManuscript(copy), "# Clone Me\n\nTwo.");
  assert.equal(await readMatter(copy, "dedication"), "For you.");
  assert.equal(await readCustom(copy, "css"), "p { color: red }");
  assert.equal((await listVersions(copy)).length, 0);
});
