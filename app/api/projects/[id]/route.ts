import { dropSession } from "@/lib/construct/session";
import { badRequest, noContent, noStore, notFound, readJson, route } from "@/lib/route";
import { deleteProject, projectExists, saveConfig } from "@/lib/store";
import { projectView } from "@/lib/view";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const view = await projectView(id);
  return view ? noStore(view) : notFound();
});

/** Save settings: any part of the BookConfig; what's left out keeps its value. */
export const PATCH = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  const body = await readJson(req);
  if (typeof body !== "object" || body === null) return badRequest("invalid json");
  return noStore(await saveConfig(id, body));
});

/** Move the book to the trash (BOOKX_DIR/.trash). */
export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  dropSession(id);
  await deleteProject(id);
  return noContent();
});
