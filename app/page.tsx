import Library from "@/components/Library";
import { listProjects } from "@/lib/store";

// Always read the folder fresh: a book may have been added from the CLI.
export const dynamic = "force-dynamic";

export default async function Page() {
  return <Library projects={await listProjects()} />;
}
