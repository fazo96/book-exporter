import { badRequest, fail, readJson, route } from "@/lib/route";
import { createProject, listProjects, MAX_MANUSCRIPT } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route(async () => Response.json(await listProjects(), { headers: { "Cache-Control": "no-store" } }));

/** Import a manuscript as a new book: `{ content, name }` (name: the file's, used when it has no `#` title). */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { content?: unknown; name?: unknown } | undefined;
  if (!body || typeof body.content !== "string") return badRequest("content must be a string");
  if (Buffer.byteLength(body.content) > MAX_MANUSCRIPT) return fail(413, "manuscript too large (max 10 MB)");
  const name = typeof body.name === "string" ? body.name : undefined;
  return Response.json(await createProject(body.content, name), { status: 201 });
});
