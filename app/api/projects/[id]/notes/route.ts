import { badRequest, fail, noContent, notFound, readJson, route } from "@/lib/route";
import { MAX_NOTES, projectExists, writeNotes } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Save the book's Notes: `{ text }` (empty removes the file). */
export const PUT = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  const body = (await readJson(req)) as { text?: unknown } | undefined;
  if (typeof body?.text !== "string") return badRequest("text must be a string");
  if (Buffer.byteLength(body.text) > MAX_NOTES) return fail(413, "notes too long (max 512 KB)");
  await writeNotes(id, body.text);
  return noContent();
});
