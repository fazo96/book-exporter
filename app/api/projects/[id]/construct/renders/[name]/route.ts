import { readFile } from "node:fs/promises";
import { notFound, route } from "@/lib/route";
import { renderFile } from "@/lib/store";

export const dynamic = "force-dynamic";

/** A page Construct rendered (construct/renders/), shown in its panel. Never changes once written. */
export const GET = route<{ id: string; name: string }>(async (_req, { id, name }) => {
  const file = await renderFile(id, name);
  if (!file) return notFound();
  return new Response(new Uint8Array(await readFile(file)), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
  });
});
