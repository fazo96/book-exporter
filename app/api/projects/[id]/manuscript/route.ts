import { badRequest, fail, noStore, notFound, route } from "@/lib/route";
import { MAX_MANUSCRIPT, projectExists, readManuscript, replaceManuscript } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  return new Response(await readManuscript(id), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${id}.md"`, "Cache-Control": "no-store" },
  });
});

/**
 * Replace the manuscript; the old one is kept in versions/. The body is the
 * markdown itself (so `curl -T book.md …/manuscript` works) or `{ content }` as JSON.
 */
export const PUT = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_MANUSCRIPT) return fail(413, "manuscript too large (max 10 MB)");
  let content = text;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const body = JSON.parse(text) as { content?: unknown };
      if (typeof body.content !== "string") return badRequest("content must be a string");
      content = body.content;
    } catch {
      return badRequest("invalid json");
    }
  }
  if (!content.trim()) return badRequest("the manuscript is empty");
  return noStore(await replaceManuscript(id, content));
});
