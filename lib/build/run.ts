import "server-only";
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { FONT_PATHS } from "../paths";

// Running the export's tools, and finding the font files they embed.

export type Log = (line: string, level?: "info" | "warn" | "error") => void;

export class ToolError extends Error {}

/** Run `cmd`, passing each output line to `log`; resolves with stdout, rejects with a ToolError on failure. */
export function tool(cmd: string, args: string[], opts: { cwd: string; env?: Record<string, string>; log: Log; quiet?: boolean }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    const lines = (level: "info" | "warn") => {
      let buf = "";
      return (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trimEnd();
          buf = buf.slice(nl + 1);
          if (line && !opts.quiet) opts.log(line, level);
        }
      };
    };
    const out = lines("info");
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      out(chunk);
    });
    child.stderr.on("data", lines("warn"));
    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(new ToolError(err.code === "ENOENT" ? `${cmd} is not installed (run inside \`nix develop\`)` : err.message));
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new ToolError(`${cmd} failed (exit ${code})`));
    });
  });
}

const g = globalThis as typeof globalThis & { __bookxFonts?: Promise<Map<string, string>> };

/** Every font file under BOOKX_FONT_PATHS by file name (symlinks followed: nix font folders are made of them). */
export function fontFiles(): Promise<Map<string, string>> {
  g.__bookxFonts ??= (async () => {
    const found = new Map<string, string>();
    const walk = async (dir: string, depth: number) => {
      if (depth > 6) return;
      const names = await readdir(dir).catch(() => [] as string[]);
      for (const name of names) {
        const full = path.join(dir, name);
        const s = await stat(full).catch(() => null);
        if (s?.isDirectory()) await walk(full, depth + 1);
        else if (s?.isFile() && /\.(ttf|otf)$/i.test(name) && !found.has(name)) found.set(name, full);
      }
    };
    for (const dir of FONT_PATHS) await walk(dir, 0);
    return found;
  })();
  return g.__bookxFonts;
}
