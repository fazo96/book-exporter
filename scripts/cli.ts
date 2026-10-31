// The library from the command line, for scripts (an editor's export hook, a
// Makefile). Uses BOOKX_DIR like the app; run inside `nix develop`:
//
//   npm run cli -- import <file.md>             create a book, print its id
//   npm run cli -- update <id> <file.md>        replace its manuscript
//   npm run cli -- export <id> [epub|pdf]       export it (both formats by default)
//   npm run cli -- pull <id>                    pull a pen-linked book's manuscript
//   npm run cli -- list

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Format } from "../lib/build/assemble.ts";
import { buildProject } from "../lib/build/index.ts";
import { pull } from "../lib/pen.ts";
import { createProject, listProjects, projectExists, replaceManuscript } from "../lib/store.ts";

const [cmd, ...args] = process.argv.slice(2);

async function main() {
  if (cmd === "import" && args[0]) {
    const { id } = await createProject(await readFile(args[0], "utf8"), path.basename(args[0]));
    console.log(id);
  } else if (cmd === "update" && args[0] && args[1]) {
    if (!(await projectExists(args[0]))) throw new Error(`no book ${args[0]}`);
    const c = await replaceManuscript(args[0], await readFile(args[1], "utf8"));
    console.log(`words ${c.before.words} → ${c.after.words}, chapters ${c.before.chapters} → ${c.after.chapters}`);
  } else if (cmd === "export" && args[0]) {
    if (!(await projectExists(args[0]))) throw new Error(`no book ${args[0]}`);
    const formats: Format[] = args[1] === "epub" || args[1] === "pdf" ? [args[1]] : ["epub", "pdf"];
    const info = await buildProject(args[0], formats, (e) => {
      if (e.t === "step") console.log(`→ ${e.name}`);
      else if (e.t === "log") console.log(`  ${e.level === "info" ? "" : `[${e.level}] `}${e.line}`);
    });
    process.exitCode = info.ok ? 0 : 1;
  } else if (cmd === "pull" && args[0]) {
    if (!(await projectExists(args[0]))) throw new Error(`no book ${args[0]}`);
    const { change } = await pull(args[0]);
    console.log(change ? `words ${change.before.words} → ${change.after.words}, chapters ${change.before.chapters} → ${change.after.chapters}` : "up to date");
  } else if (cmd === "list") {
    for (const p of await listProjects()) console.log(`${p.id}\t${p.title}\t${p.words} words`);
  } else {
    console.error("usage: cli import <file.md> | update <id> <file.md> | export <id> [epub|pdf] | pull <id> | list");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
