import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addAttachment,
  addMatter,
  cloneProject,
  createProject,
  deleteAttachment,
  isValidAttachment,
  listAttachments,
  listVersions,
  readConfig,
  readCustom,
  readManuscript,
  readMatter,
  replaceManuscript,
  saveConfig,
  setAttachmentCaption,
  sniffAttachment,
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

test("attachments are typed by their bytes, named after their file, captioned, removed, and go with a copy", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniffAttachment(png), "png");
  assert.equal(sniffAttachment(new TextEncoder().encode("GIF89a……")), "gif");
  assert.equal(sniffAttachment(new TextEncoder().encode("%PDF-1.7\n")), "pdf");
  assert.equal(sniffAttachment(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null, "no SVG: it can carry script");
  assert.equal(isValidAttachment("../project.json"), false);

  const { id } = await createProject("# Attach Me\n\nOne.");
  assert.equal(await addAttachment(id, png, "png", "My Spread (Penguin).PNG"), "my-spread-penguin.png");
  assert.equal(await addAttachment(id, png, "png", "my spread penguin.png"), "my-spread-penguin-2.png");
  assert.equal(await addAttachment(id, png, "pdf", ""), "attachment.pdf");
  await setAttachmentCaption(id, "my-spread-penguin.png", "  The chapter opener.  ");
  await assert.rejects(setAttachmentCaption(id, "nope.png", "x"), /not found/);
  const list = await listAttachments(id);
  assert.deepEqual(
    list.map((a) => [a.name, a.ext, a.caption]).sort(),
    [
      ["attachment.pdf", "pdf", ""],
      ["my-spread-penguin-2.png", "png", ""],
      ["my-spread-penguin.png", "png", "The chapter opener."],
    ],
  );
  await deleteAttachment(id, "my-spread-penguin-2.png");
  const { id: copy } = await cloneProject(id);
  assert.deepEqual(
    (await listAttachments(copy)).map((a) => [a.name, a.caption]).sort(),
    [
      ["attachment.pdf", ""],
      ["my-spread-penguin.png", "The chapter opener."],
    ],
  );
  await setAttachmentCaption(id, "my-spread-penguin.png", "");
  assert.equal((await listAttachments(id)).find((a) => a.name === "my-spread-penguin.png")?.caption, "");
});
