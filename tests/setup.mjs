// Loaded before every test file (`npm test` passes `--import`). Lets Node's
// runner load the app's server modules, and points them at a throwaway
// library: without BOOKX_DIR, lib/paths.ts would use ./data, the real books.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import "../scripts/register.mjs";

const scratch = mkdtempSync(path.join(tmpdir(), "bookx-test-"));
process.env.BOOKX_DIR = path.join(scratch, "data");
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
