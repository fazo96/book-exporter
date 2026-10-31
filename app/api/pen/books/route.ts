import { listBooks } from "@/lib/pen";
import { noStore, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** pen's books, as pen lists them. */
export const GET = route(async () => noStore(await listBooks()));
