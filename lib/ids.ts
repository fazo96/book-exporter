// What a project or matter-section id may be: it names a folder or file under
// BOOKX_DIR, so this is also what keeps paths inside it. Imports nothing, so
// client components and plain-Node tests can use it.

const ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

/** A valid id made from a title ("Mistaken for the Light" → "mistaken-for-the-light"), or `fallback`. */
export function slugify(text: string, fallback = "book"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || fallback;
}
