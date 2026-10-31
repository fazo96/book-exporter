import { badRequest, fail, noContent, noStore, notFound, readJson, route } from "@/lib/route";
import { deleteMatter, MAX_CUSTOM, readConfig, writeMatter } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Save a section's text: `{ body }` (its settings are saved with the book's). */
export const PUT = route<{ id: string; mid: string }>(async (req, { id, mid }) => {
  const config = await readConfig(id);
  if (!config?.matter.some((m) => m.id === mid)) return notFound();
  const body = (await readJson(req)) as { body?: unknown } | undefined;
  if (typeof body?.body !== "string") return badRequest("body must be a string");
  if (Buffer.byteLength(body.body) > MAX_CUSTOM) return fail(413, "section too large");
  await writeMatter(id, mid, body.body);
  return noContent();
});

export const DELETE = route<{ id: string; mid: string }>(async (_req, { id, mid }) => {
  const config = await readConfig(id);
  if (!config?.matter.some((m) => m.id === mid)) return notFound();
  return noStore(await deleteMatter(id, mid));
});
