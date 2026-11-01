import { badRequest, fail, notFound, noStore, route } from "@/lib/route";
import { addAttachment, listAttachments, MAX_ATTACHMENT, projectExists, sniffAttachment } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  return noStore(await listAttachments(id));
});

/** Add an attachment: the file itself as the body, `?name=` the name it had (PNG, JPEG, WebP, GIF or PDF) → `{ name }`. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > MAX_ATTACHMENT) return fail(413, "file too large (max 20 MB)");
  const ext = sniffAttachment(data);
  if (!ext) return badRequest("not a PNG, JPEG, WebP or GIF image, or a PDF");
  const name = await addAttachment(id, data, ext, new URL(req.url).searchParams.get("name") ?? "");
  return Response.json({ name }, { status: 201 });
});
