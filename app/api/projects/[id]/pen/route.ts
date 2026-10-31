import { badRequest, noContent, noStore, notFound, readJson, route } from "@/lib/route";
import { readPenLink, writePenLink } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Change the link: `{ pullOnExport }`. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const link = await readPenLink(id);
  if (!link) return notFound();
  const body = (await readJson(req)) as { pullOnExport?: unknown } | undefined;
  if (typeof body?.pullOnExport !== "boolean") return badRequest("pullOnExport must be true or false");
  const next = { ...link, pullOnExport: body.pullOnExport };
  await writePenLink(id, next);
  return noStore(next);
});

/** Unlink from pen; the manuscript stays as last pulled. */
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  if (!(await readPenLink(id))) return notFound();
  await writePenLink(id, null);
  return noContent();
});
