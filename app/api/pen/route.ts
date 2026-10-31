import { connect, forget, status } from "@/lib/pen";
import { badRequest, noContent, noStore, readJson, route } from "@/lib/route";

export const dynamic = "force-dynamic";

/** The pen connection: `{ url, signedIn, error? }` (url null when there is none). */
export const GET = route(async () => noStore(await status()));

/** Connect: `{ url, password? }`. The password signs in once; only pen's session is kept. */
export const PUT = route(async (req) => {
  const body = (await readJson(req)) as { url?: unknown; password?: unknown } | undefined;
  if (typeof body?.url !== "string") return badRequest("url must be a string");
  const password = typeof body.password === "string" && body.password ? body.password : undefined;
  const conn = await connect(body.url, password);
  return noStore({ url: conn.url, signedIn: true });
});

/** Forget the connection. Linked books keep their links. */
export const DELETE = route(async () => {
  await forget();
  return noContent();
});
