import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { connect, importBook, listBooks, pull, readConnection, status } from "../lib/pen.ts";
import { listVersions, readCover, readManuscript, readPenLink } from "../lib/store.ts";

// lib/pen.ts against a stand-in for pen's API: a locked pen with one book.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
const book = { id: "the-book", content: "# The Book\n\n### One\n\nFirst draft.", version: "v1" };
let url = "";
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const authorized = req.headers.cookie === "pen_session=token123";
  if (req.url === "/api/auth" && req.method === "GET") return send(200, { locked: true, authorized });
  if (req.url === "/api/auth" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (JSON.parse(body).password !== "secret") return send(403, { error: "Wrong password." });
      res.setHeader("Set-Cookie", "pen_session=token123; Path=/; HttpOnly");
      send(200, { ok: true });
    });
    return;
  }
  if (!authorized) return send(401, { error: "locked" });
  if (req.url === "/api/docs") return send(200, [{ id: book.id, title: "The Book", words: 5, modified: 1, cover: 1 }]);
  if (req.url === `/api/docs/${book.id}`) return send(200, book);
  if (req.url === `/api/docs/${book.id}/cover`) {
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(PNG);
  }
  send(404, { error: "not found" });
});

before(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

test("connecting to a locked pen needs its password, and keeps only the session", async () => {
  await assert.rejects(connect(url), /locked/);
  await assert.rejects(connect(url, "wrong"), /Wrong password/);
  await connect(`${url}/`, "secret");
  assert.deepEqual(await readConnection(), { url, token: "token123" });
  assert.deepEqual(await status(), { url, signedIn: true });
  assert.deepEqual((await listBooks()).map((b) => b.id), ["the-book"]);
});

test("a book imported from pen is linked, and pulling it brings the new text in as a version", async () => {
  await connect(url, "secret");
  const { id } = await importBook("the-book");
  assert.equal(id, "the-book");
  assert.equal(await readManuscript(id), book.content);
  assert.equal((await readCover(id))?.ext, "png");
  assert.equal((await readPenLink(id))?.version, "v1");

  assert.equal((await pull(id)).change, null); // the same text: nothing to do
  book.content = "# The Book\n\n### One\n\nSecond draft, longer.";
  book.version = "v2";
  const { change } = await pull(id);
  assert.deepEqual([change?.before.words, change?.after.words], [5, 6]);
  assert.equal(await readManuscript(id), book.content);
  assert.equal((await readPenLink(id))?.version, "v2");
  assert.equal((await listVersions(id)).length, 1);
});
