import { notFound } from "next/navigation";
import Book from "@/components/Book";
import { isValidId } from "@/lib/ids";
import { projectView } from "@/lib/view";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) notFound();
  const view = await projectView(id);
  if (!view) notFound();
  return <Book key={id} initial={view} />;
}
