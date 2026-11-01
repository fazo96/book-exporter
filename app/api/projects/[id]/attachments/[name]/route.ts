import { readFile } from "node:fs/promises";
import { badRequest, noContent, notFound, readJson, route } from "@/lib/route";
import { ATTACHMENT_TYPES, type AttachmentExt, attachmentFile, deleteAttachment, MAX_CAPTION, setAttachmentCaption } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string; name: string }>(async (_req, { id, name }) => {
  const file = await attachmentFile(id, name);
  if (!file) return notFound();
  return new Response(new Uint8Array(await readFile(file)), {
    headers: {
      "Content-Type": ATTACHMENT_TYPES[name.split(".").pop() as AttachmentExt],
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "no-cache",
      // No SVG: the bytes are an image or a PDF, so the browser mustn't guess otherwise.
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** Set the caption `{ caption }` (empty removes it). */
export const PATCH = route<{ id: string; name: string }>(async (req, { id, name }) => {
  const body = (await readJson(req)) as { caption?: unknown } | undefined;
  if (typeof body?.caption !== "string") return badRequest("caption must be a string");
  if (body.caption.length > MAX_CAPTION) return badRequest(`caption too long (max ${MAX_CAPTION} characters)`);
  await setAttachmentCaption(id, name, body.caption);
  return noContent();
});

export const DELETE = route<{ id: string; name: string }>(async (_req, { id, name }) => {
  if (!(await attachmentFile(id, name))) return notFound();
  await deleteAttachment(id, name);
  return noContent();
});
