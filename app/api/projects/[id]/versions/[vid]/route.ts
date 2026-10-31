import { noStore, notFound, route } from "@/lib/route";
import { readVersion, replaceManuscript } from "@/lib/store";

export const dynamic = "force-dynamic";

/** An earlier manuscript, as a download. */
export const GET = route<{ id: string; vid: string }>(async (_req, { id, vid }) => {
  const text = await readVersion(id, vid);
  if (text === null) return notFound();
  return new Response(text, {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${id}-${vid}.md"` },
  });
});

/** Make an earlier manuscript current again (the current one becomes a version in turn). */
export const POST = route<{ id: string; vid: string }>(async (_req, { id, vid }) => {
  const text = await readVersion(id, vid);
  if (text === null) return notFound();
  return noStore(await replaceManuscript(id, text));
});
