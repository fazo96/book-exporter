import { importBook } from "@/lib/pen";
import { badRequest, readJson, route } from "@/lib/route";
import { isValidId } from "@/lib/ids";

export const dynamic = "force-dynamic";

/** A new book from pen's `{ doc }`, linked to it: `{ id }`. */
export const POST = route(async (req) => {
  const doc = ((await readJson(req)) as { doc?: unknown } | undefined)?.doc;
  if (!isValidId(doc)) return badRequest("doc must be a pen book id");
  return Response.json(await importBook(doc), { status: 201 });
});
