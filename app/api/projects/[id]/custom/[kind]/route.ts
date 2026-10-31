import { badRequest, fail, noContent, notFound, readJson, route } from "@/lib/route";
import { type CustomKind, MAX_CUSTOM, projectExists, writeCustom } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Save custom.css, custom.typ or filter.lua: `{ text }` (empty removes the file). */
// `kind` is checked by route() (css, typ or lua).
export const PUT = route<{ id: string; kind: string }>(async (req, { id, kind }) => {
  if (!(await projectExists(id))) return notFound();
  const body = (await readJson(req)) as { text?: unknown } | undefined;
  if (typeof body?.text !== "string") return badRequest("text must be a string");
  if (Buffer.byteLength(body.text) > MAX_CUSTOM) return fail(413, "file too large (max 512 KB)");
  await writeCustom(id, kind as CustomKind, body.text);
  return noContent();
});
