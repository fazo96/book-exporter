import { pull } from "@/lib/pen";
import { route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** Fetch the linked pen book; `{ change, version }`, change null when the text was the same. */
export const POST = route<{ id: string }>(async (_req, { id }) => Response.json(await pull(id)));
