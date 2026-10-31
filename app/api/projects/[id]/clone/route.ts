import { notFound, route } from "@/lib/route";
import { cloneProject, projectExists } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Copy the book (not its versions or exports) under a new id and identifier: `{ id }`. */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  return Response.json(await cloneProject(id), { status: 201 });
});
