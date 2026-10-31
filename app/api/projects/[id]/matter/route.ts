import { matterKind } from "@/lib/matter";
import { badRequest, noStore, notFound, readJson, route } from "@/lib/route";
import { addMatter, projectExists } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Add a front or back matter section from a template: `{ kind }`. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  const body = (await readJson(req)) as { kind?: unknown } | undefined;
  if (typeof body?.kind !== "string" || matterKind(body.kind).kind !== body.kind) return badRequest("unknown kind");
  return noStore(await addMatter(id, body.kind));
});
