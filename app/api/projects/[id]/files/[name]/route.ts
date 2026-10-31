import { readFile } from "node:fs/promises";
import { notFound, route } from "@/lib/route";
import { distFile } from "@/lib/store";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  jpg: "image/jpeg",
  log: "text/plain; charset=utf-8",
};

/** A file of the last export. `?inline` shows a PDF in the page instead of downloading it. */
export const GET = route<{ id: string; name: string }>(async (req, { id, name }) => {
  const file = await distFile(id, name);
  if (!file) return notFound();
  const ext = name.split(".").pop() ?? "";
  const inline = new URL(req.url).searchParams.has("inline");
  return new Response(new Uint8Array(await readFile(file)), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "no-cache",
    },
  });
});
