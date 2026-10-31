import "server-only";

import { isBuilding } from "@/lib/build";
import { countWords, outline } from "@/lib/manuscript";
import { listVersions, readBuildInfo, readConfig, readCover, readCustom, readManuscript, readMatter, readPenLink } from "@/lib/store";

/** Everything the book's page shows, in one answer. */
export async function projectView(id: string) {
  const config = await readConfig(id);
  if (!config) return null;
  const manuscript = await readManuscript(id);
  const cover = await readCover(id);
  const matter: Record<string, string> = {};
  for (const m of config.matter) matter[m.id] = await readMatter(id, m.id);
  return {
    id,
    config,
    words: countWords(manuscript),
    outline: outline(manuscript, config.structure),
    cover: cover ? { ext: cover.ext, mtime: Math.round(cover.mtime) } : null,
    build: await readBuildInfo(id),
    building: isBuilding(id),
    versions: await listVersions(id),
    pen: await readPenLink(id),
    matter,
    custom: { css: await readCustom(id, "css"), typ: await readCustom(id, "typ"), lua: await readCustom(id, "lua") },
  };
}

export type ProjectView = NonNullable<Awaited<ReturnType<typeof projectView>>>;
