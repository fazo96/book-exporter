// The browser's side of app/api/projects: fetch wrappers that throw the
// server's error message. Imports nothing from the server.

async function check(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {}
  throw new Error(message);
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const base = (id: string) => `/api/projects/${id}`;

export const api = {
  create: async (content: string, name: string) => (await (await check(await fetch("/api/projects", json("POST", { content, name })))).json()) as { id: string },
  get: async <T,>(id: string) => (await (await check(await fetch(base(id), { cache: "no-store" }))).json()) as T,
  saveConfig: async <T,>(id: string, config: unknown) => (await (await check(await fetch(base(id), json("PATCH", config)))).json()) as T,
  remove: async (id: string) => void (await check(await fetch(base(id), { method: "DELETE" }))),
  replaceManuscript: async <T,>(id: string, content: string) =>
    (await (await check(await fetch(`${base(id)}/manuscript`, json("PUT", { content })))).json()) as T,
  restoreVersion: async <T,>(id: string, vid: string) => (await (await check(await fetch(`${base(id)}/versions/${vid}`, { method: "POST" }))).json()) as T,
  addMatter: async <T,>(id: string, kind: string) => (await (await check(await fetch(`${base(id)}/matter`, json("POST", { kind })))).json()) as T,
  saveMatter: async (id: string, mid: string, body: string) => void (await check(await fetch(`${base(id)}/matter/${mid}`, json("PUT", { body })))),
  deleteMatter: async <T,>(id: string, mid: string) => (await (await check(await fetch(`${base(id)}/matter/${mid}`, { method: "DELETE" }))).json()) as T,
  saveCustom: async (id: string, kind: string, text: string) => void (await check(await fetch(`${base(id)}/custom/${kind}`, json("PUT", { text })))),
  saveNotes: async (id: string, text: string) => void (await check(await fetch(`${base(id)}/notes`, json("PUT", { text })))),
  uploadCover: async (id: string, file: Blob) => void (await check(await fetch(`${base(id)}/cover`, { method: "PUT", body: file }))),
  deleteCover: async (id: string) => void (await check(await fetch(`${base(id)}/cover`, { method: "DELETE" }))),
  build: async (id: string, formats: string[]) => check(await fetch(`${base(id)}/build`, json("POST", { formats }))),
  clone: async (id: string) => (await (await check(await fetch(`${base(id)}/clone`, { method: "POST" }))).json()) as { id: string },
  pull: async <T,>(id: string) => (await (await check(await fetch(`${base(id)}/pen/pull`, { method: "POST" }))).json()) as T,
  setPullOnExport: async (id: string, pullOnExport: boolean) => void (await check(await fetch(`${base(id)}/pen`, json("PATCH", { pullOnExport })))),
  unlink: async (id: string) => void (await check(await fetch(`${base(id)}/pen`, { method: "DELETE" }))),
};

/** The library's pen connection (app/api/pen). */
export const pen = {
  status: async () => (await (await check(await fetch("/api/pen", { cache: "no-store" }))).json()) as { url: string | null; signedIn: boolean; error?: string },
  connect: async (url: string, password: string) => void (await check(await fetch("/api/pen", json("PUT", { url, password })))),
  forget: async () => void (await check(await fetch("/api/pen", { method: "DELETE" }))),
  books: async <T,>() => (await (await check(await fetch("/api/pen/books", { cache: "no-store" }))).json()) as T,
  import: async (doc: string) => (await (await check(await fetch("/api/pen/import", json("POST", { doc })))).json()) as { id: string },
};
