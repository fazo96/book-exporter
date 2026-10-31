import "server-only";
import { isValidId } from "./ids";
import { PenError } from "./pen";
import { isValidVersion } from "./store";

// What every API route does first, and the answers they share. There is no
// lock: book-exporter listens on localhost (docs/development.md).

type Params = Record<string, string>;

// Route segments that name something on disk; a bad one is a 404 before the handler runs.
const CHECKS: Record<string, (value: string) => boolean> = {
  id: isValidId,
  mid: isValidId,
  vid: isValidVersion,
  kind: (k) => k === "css" || k === "typ" || k === "lua",
  name: (n) => /^[a-z0-9][a-z0-9.-]{0,120}$/.test(n),
};

/** A route handler with its params awaited and checked. */
export function route<P extends Params = Params>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx?: { params: Promise<P> }): Promise<Response> => {
    const params = ctx?.params ? await ctx.params : ({} as P);
    for (const [key, value] of Object.entries(params)) {
      if (CHECKS[key] && !CHECKS[key](value)) return notFound();
    }
    try {
      return await fn(req, params);
    } catch (err) {
      if (err instanceof Error && err.message === "not found") return notFound();
      // pen refused us (401: sign in again) or couldn't be reached (502).
      if (err instanceof PenError) return fail(err.signedOut ? 401 : 502, err.message);
      throw err;
    }
  };
}

/** The request's JSON body, or undefined if it isn't JSON. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export const fail = (status: number, error: string) => Response.json({ error }, { status });
export const notFound = () => fail(404, "not found");
export const badRequest = (error: string) => fail(400, error);
export const noContent = () => new Response(null, { status: 204 });
/** JSON the browser must not cache. */
export const noStore = (data: unknown) => Response.json(data, { headers: { "Cache-Control": "no-store" } });
