import { type BuildEvent, buildProject, isBuilding } from "@/lib/build";
import type { Format } from "@/lib/build/assemble";
import { ndjsonResponse } from "@/lib/ndjson";
import { fail, notFound, readJson, route } from "@/lib/route";
import { projectExists } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Export the book: `{ formats: ["epub", "pdf"] }`. Streams the log as JSON lines, ending with `{ t: "done", info }`. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  if (isBuilding(id)) return fail(409, "an export of this book is already running");
  const body = (await readJson(req)) as { formats?: unknown } | undefined;
  const asked = Array.isArray(body?.formats) ? body.formats.filter((f): f is Format => f === "epub" || f === "pdf") : [];
  const formats: Format[] = asked.length ? asked : ["epub", "pdf"];
  return ndjsonResponse<BuildEvent>(async (send) => {
    const info = await buildProject(id, formats, send);
    send({ t: "done", info });
  });
});
