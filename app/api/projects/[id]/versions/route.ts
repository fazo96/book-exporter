import { noStore, notFound, route } from "@/lib/route";
import { listVersions, projectExists } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  if (!(await projectExists(id))) return notFound();
  return noStore(await listVersions(id));
});
