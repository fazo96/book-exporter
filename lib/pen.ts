import "server-only";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "./files";
import { DATA_DIR } from "./paths";
import {
  createProject,
  type ManuscriptChange,
  readManuscript,
  readPenLink,
  replaceManuscript,
  sniffCover,
  writeCover,
  writePenLink,
} from "./store";

// pen (github.com/fazo96/pen) over its HTTP API, read only: list its books,
// import one, and pull a linked book's manuscript again (docs/library.md#pen).
// The library keeps one connection, in BOOKX_DIR/.bookx-pen.json: pen's
// address and, when pen is locked, the session cookie its "unlock" answered
// with (a signed token good for 90 days). Never the password. Nothing here
// writes to pen.

const CONNECTION = () => path.join(DATA_DIR, ".bookx-pen.json");
const SESSION_COOKIE = "pen_session";
const TIMEOUT_MS = 20_000;

export interface PenConnection {
  url: string;
  token: string | null;
}

/** A book as pen lists it. */
export interface PenBook {
  id: string;
  title: string;
  words: number;
  modified: number;
  cover: number | null;
}

/** pen couldn't answer; `signedOut` when it wants the password again. */
export class PenError extends Error {
  readonly signedOut: boolean;
  constructor(message: string, signedOut = false) {
    super(message);
    this.signedOut = signedOut;
  }
}

/** pen's address without a trailing slash, or null if it isn't an http(s) URL. */
export function penUrl(input: string): string | null {
  try {
    const u = new URL(input.trim().includes("://") ? input.trim() : `https://${input.trim()}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export async function readConnection(): Promise<PenConnection | null> {
  try {
    const c = JSON.parse(await readFile(CONNECTION(), "utf8")) as Partial<PenConnection>;
    return typeof c.url === "string" ? { url: c.url, token: typeof c.token === "string" ? c.token : null } : null;
  } catch {
    return null;
  }
}

export const forget = () => unlink(CONNECTION()).catch(() => {});

async function call(url: string, token: string | null, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}), ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    throw new PenError(`Can't reach pen at ${new URL(url).origin}${cause ? ` (${cause})` : ""}.`);
  }
  if (res.status === 401) throw new PenError("Signed out of pen: sign in again.", true);
  return res;
}

async function errorOf(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: string }).error ?? `${res.status}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/** Connect to pen at `input`, signing in with `password` if it's locked; saves the connection. */
export async function connect(input: string, password?: string): Promise<PenConnection> {
  const url = penUrl(input);
  if (!url) throw new PenError("That isn't a web address.");
  const res = await call(`${url}/api/auth`, null);
  const auth = res.ok ? ((await res.json().catch(() => null)) as { locked?: unknown } | null) : null;
  if (!auth || typeof auth.locked !== "boolean") throw new PenError(`${url} doesn't answer like pen.`);
  let token: string | null = null;
  if (auth.locked) {
    if (!password) throw new PenError("pen is locked: enter its password.", true);
    const unlock = await call(`${url}/api/auth`, null, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock", password }),
    });
    if (!unlock.ok) throw new PenError(await errorOf(unlock), true);
    for (const c of unlock.headers.getSetCookie()) {
      const m = c.match(new RegExp(`^${SESSION_COOKIE}=([^;]+)`));
      if (m) token = m[1];
    }
    if (!token) throw new PenError("pen let us in but gave no session.");
  }
  const conn = { url, token };
  await writeAtomic(CONNECTION(), JSON.stringify(conn, null, 2), { mode: 0o600 });
  return conn;
}

/** The connection, and whether pen still takes it. */
export async function status(): Promise<{ url: string | null; signedIn: boolean; error?: string }> {
  const conn = await readConnection();
  if (!conn) return { url: null, signedIn: false };
  try {
    const res = await call(`${conn.url}/api/auth`, conn.token);
    const auth = (await res.json()) as { locked?: boolean; authorized?: boolean };
    return { url: conn.url, signedIn: !auth.locked || auth.authorized === true };
  } catch (err) {
    return { url: conn.url, signedIn: false, error: (err as Error).message };
  }
}

async function connection(): Promise<PenConnection> {
  const conn = await readConnection();
  if (!conn) throw new PenError("Connect to pen first.", true);
  return conn;
}

/** The connection's token when it's for `url`; a link to another pen goes without one. */
async function tokenFor(url: string): Promise<string | null> {
  const conn = await readConnection();
  return conn?.url === url ? conn.token : null;
}

export async function listBooks(): Promise<PenBook[]> {
  const conn = await connection();
  const res = await call(`${conn.url}/api/docs`, conn.token);
  if (!res.ok) throw new PenError(`pen: ${await errorOf(res)}`);
  return (await res.json()) as PenBook[];
}

async function fetchBook(url: string, token: string | null, doc: string): Promise<{ content: string; version: string }> {
  const res = await call(`${url}/api/docs/${encodeURIComponent(doc)}`, token);
  if (res.status === 404) throw new PenError(`pen has no book “${doc}” (renamed or deleted?).`);
  if (!res.ok) throw new PenError(`pen: ${await errorOf(res)}`);
  const body = (await res.json()) as { content?: unknown; version?: unknown };
  if (typeof body.content !== "string") throw new PenError("pen sent no manuscript.");
  return { content: body.content, version: String(body.version ?? "") };
}

/** A new book from pen's `doc`, linked to it, with pen's cover if it has one. */
export async function importBook(doc: string): Promise<{ id: string }> {
  const conn = await connection();
  const { content, version } = await fetchBook(conn.url, conn.token, doc);
  const { id } = await createProject(content, doc);
  await writePenLink(id, { url: conn.url, doc, version, pulledAt: Date.now(), pullOnExport: true });
  // pen keeps a downscaled cover; good enough to start from, until the real one is uploaded.
  const cover = await call(`${conn.url}/api/docs/${encodeURIComponent(doc)}/cover`, conn.token).catch(() => null);
  if (cover?.ok) {
    const data = new Uint8Array(await cover.arrayBuffer());
    const ext = sniffCover(data);
    if (ext) await writeCover(id, data, ext);
  }
  return { id };
}

export interface PullResult {
  /** null when pen's text was the same as the book's. */
  change: ManuscriptChange | null;
  version: string;
}

/** Fetch the linked pen book and make it the manuscript if it differs (the old one kept as a version). */
export async function pull(id: string): Promise<PullResult> {
  const link = await readPenLink(id);
  if (!link) throw new PenError("This book isn't linked to pen.");
  const { content, version } = await fetchBook(link.url, await tokenFor(link.url), link.doc);
  const change = content === (await readManuscript(id)) ? null : await replaceManuscript(id, content);
  await writePenLink(id, { ...link, version, pulledAt: Date.now() });
  return { change, version };
}
