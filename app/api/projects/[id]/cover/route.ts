import { readFile } from "node:fs/promises";
import { badRequest, fail, noContent, notFound, route } from "@/lib/route";
import { COVER_TYPES, deleteCover, MAX_COVER, projectExists, readCover, sniffCover, writeCover } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const cover = await readCover(id);
  if (!cover) return notFound();
  return new Response(new Uint8Array(await readFile(cover.file)), {
    // An SVG is served as an image to <img> only; the CSP keeps any script in it inert if opened directly.
    headers: { "Content-Type": COVER_TYPES[cover.ext], "Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
});

/** Upload the cover: the image itself as the body (PNG, JPEG, WebP or SVG). */
export const PUT = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > MAX_COVER) return fail(413, "image too large (max 20 MB)");
  const ext = sniffCover(data);
  if (!ext) return badRequest("not a PNG, JPEG, WebP or SVG image");
  await writeCover(id, data, ext);
  return noContent();
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  await deleteCover(id);
  return noContent();
});
