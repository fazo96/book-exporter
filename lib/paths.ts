import path from "node:path";

// The library: one folder per book. Kept free of "server-only" so plain-Node
// tests can import it.
export const DATA_DIR = path.resolve(
  /*turbopackIgnore: true*/
  process.env.BOOKX_DIR ?? path.join(process.cwd(), "data"),
);

// Where the faces a book can be set in live (colon-separated, like
// TYPST_FONT_PATHS): `nix develop` sets it from flake.nix.
export const FONT_PATHS = (process.env.BOOKX_FONT_PATHS ?? process.env.TYPST_FONT_PATHS ?? "").split(":").filter(Boolean);

// The built-in filter and Typst library that every export uses.
export const ASSETS_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "assets");
