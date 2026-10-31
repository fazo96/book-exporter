import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { type BookConfig, defaultConfig, sanitizeConfig } from "./config";
import { createExclusive, writeAtomic } from "./files";
import { isValidId, slugify } from "./ids";
import { countWords, outline, titleOf } from "./manuscript";
import { matterKind, newSection } from "./matter";
import { DATA_DIR } from "./paths";
import { queue } from "./queue";

// The library on disk: one folder per book in BOOKX_DIR (docs/library.md).
//
//   <id>/project.json     the BookConfig
//   <id>/manuscript.md    the manuscript as last imported
//   <id>/versions/        earlier manuscripts, one file each, named by time
//   <id>/matter/<m>.md    front and back matter, in project.json's order
//   <id>/custom.css       added after the generated EPUB stylesheet
//   <id>/custom.typ       added after the PDF's Typst setup
//   <id>/filter.lua       run after the built-in pandoc filter
//   <id>/cover.<ext>      png, jpg, webp or svg
//   <id>/dist/            the last export, and build.json about it
//   <id>/pen.json         the pen book it pulls its manuscript from (lib/pen.ts)
//
// Deletes move a folder to .trash/. Every read-modify-write of a project goes
// through its queue.

export const MAX_MANUSCRIPT = 10 * 1024 * 1024;
export const MAX_COVER = 20 * 1024 * 1024;
export const MAX_CUSTOM = 512 * 1024;

export type CustomKind = "css" | "typ" | "lua";
const CUSTOM_FILES: Record<CustomKind, string> = { css: "custom.css", typ: "custom.typ", lua: "filter.lua" };
export const COVER_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" } as const;
export type CoverExt = keyof typeof COVER_TYPES;

export const dirOf = (id: string) => {
  if (!isValidId(id)) throw new Error(`invalid id: ${id}`);
  return path.join(DATA_DIR, id);
};
const fileOf = (id: string, ...parts: string[]) => path.join(dirOf(id), ...parts);
const run = (id: string) => queue(`project:${id}`);

const readText = (file: string) => readFile(file, "utf8").catch((err: NodeJS.ErrnoException) => {
  if (err.code === "ENOENT") return null;
  throw err;
});

export interface ProjectSummary {
  id: string;
  title: string;
  author: string;
  words: number;
  updatedAt: number;
  cover: CoverExt | null;
  lastBuild: BuildInfo | null;
  /** The pen book it pulls from. */
  pen: string | null;
}

export interface BuildInfo {
  at: number;
  ok: boolean;
  files: { name: string; size: number }[];
  pdfPages?: number;
  epubcheck?: { errors: number; warnings: number; fatals: number };
  /** Words in the manuscript the build read. */
  words: number;
}

export async function projectExists(id: string): Promise<boolean> {
  if (!isValidId(id)) return false;
  return stat(fileOf(id, "project.json")).then(
    () => true,
    () => false,
  );
}

export async function readConfig(id: string): Promise<BookConfig | null> {
  const raw = await readText(fileOf(id, "project.json"));
  if (raw === null) return null;
  try {
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return sanitizeConfig({});
  }
}

export const readManuscript = (id: string) => readText(fileOf(id, "manuscript.md")).then((t) => t ?? "");

export async function readCover(id: string): Promise<{ ext: CoverExt; file: string; mtime: number } | null> {
  for (const ext of Object.keys(COVER_TYPES) as CoverExt[]) {
    const file = fileOf(id, `cover.${ext}`);
    const s = await stat(file).catch(() => null);
    if (s) return { ext, file, mtime: s.mtimeMs };
  }
  return null;
}

export async function readBuildInfo(id: string): Promise<BuildInfo | null> {
  const raw = await readText(fileOf(id, "dist", "build.json"));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BuildInfo;
  } catch {
    return null;
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const entries = await readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  const out: ProjectSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !isValidId(e.name)) continue;
    const config = await readConfig(e.name);
    if (!config) continue;
    const s = await stat(fileOf(e.name, "project.json"));
    const cover = await readCover(e.name);
    out.push({
      id: e.name,
      title: config.metadata.title,
      author: config.metadata.authors.map((a) => a.name).join(", "),
      words: countWords(await readManuscript(e.name)),
      updatedAt: s.mtimeMs,
      cover: cover?.ext ?? null,
      lastBuild: await readBuildInfo(e.name),
      pen: (await readPenLink(e.name))?.doc ?? null,
    });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A new book from a manuscript: its title from the first `#` heading, else `name` (a file name). */
export async function createProject(content: string, name?: string): Promise<{ id: string }> {
  const title = titleOf(content) ?? (name?.replace(/\.(md|markdown|txt)$/i, "").trim() || "Untitled");
  const config = defaultConfig(title, `urn:uuid:${randomUUID()}`);
  // A copyright page to start from: most books want one, and it shows how {{variables}} work.
  const copyright = newSection("copyright", []);
  config.matter.push(copyright);
  const id = await claimId(slugify(title), config, (n) => `-${n}`);
  await writeAtomic(fileOf(id, "manuscript.md"), content);
  await writeAtomic(fileOf(id, "matter", `${copyright.id}.md`), matterKind("copyright").body);
  return { id };
}

/** A new folder for `config`, named `base`, else `base` + suffix(2), suffix(3)… */
async function claimId(base: string, config: BookConfig, suffix: (n: number) => string): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}${suffix(n)}`;
    if (!isValidId(id)) throw new Error(`invalid id: ${id}`);
    // project.json is the claim: whoever creates it owns the folder.
    if (await createExclusive(path.join(DATA_DIR, id, "project.json"), JSON.stringify(config, null, 2))) return id;
  }
}

/**
 * A copy of a book to take elsewhere (another edition, an experiment): its
 * settings, manuscript, matter, custom files, cover and pen link, with a new
 * identifier (stores and readers tell editions apart by it). Not its versions
 * or exports.
 */
export async function cloneProject(id: string): Promise<{ id: string }> {
  return run(id)(async () => {
    const config = await readConfig(id);
    if (!config) throw new Error("not found");
    config.metadata.identifier = { scheme: "UUID", value: `urn:uuid:${randomUUID()}` };
    const to = await claimId(`${id.slice(0, 70)}-copy`, config, (n) => `-${n}`);
    await writeAtomic(fileOf(to, "manuscript.md"), await readManuscript(id));
    for (const m of config.matter) await writeAtomic(fileOf(to, "matter", `${m.id}.md`), await readMatter(id, m.id));
    for (const name of [...Object.values(CUSTOM_FILES), "pen.json"]) {
      const text = await readText(fileOf(id, name));
      if (text !== null) await writeAtomic(fileOf(to, name), text);
    }
    const cover = await readCover(id);
    if (cover) await writeAtomic(fileOf(to, `cover.${cover.ext}`), await readFile(cover.file));
    return { id: to };
  });
}

// ------------------------------------------------------------------ pen link

/** The pen book a project pulls its manuscript from (lib/pen.ts). */
export interface PenLink {
  /** pen's address, as the connection had it when linked. */
  url: string;
  /** The book's id in pen. */
  doc: string;
  /** pen's version (a hash of the text) last pulled, and when. */
  version: string;
  pulledAt: number;
  /** Pull before every export. */
  pullOnExport: boolean;
}

export async function readPenLink(id: string): Promise<PenLink | null> {
  const raw = await readText(fileOf(id, "pen.json"));
  if (!raw) return null;
  try {
    const l = JSON.parse(raw) as Partial<PenLink>;
    if (typeof l.url !== "string" || typeof l.doc !== "string") return null;
    return { url: l.url, doc: l.doc, version: String(l.version ?? ""), pulledAt: Number(l.pulledAt) || 0, pullOnExport: l.pullOnExport !== false };
  } catch {
    return null;
  }
}

export function writePenLink(id: string, link: PenLink | null): Promise<void> {
  return run(id)(async () => {
    if (!(await projectExists(id))) throw new Error("not found");
    if (link) await writeAtomic(fileOf(id, "pen.json"), JSON.stringify(link, null, 2));
    else await unlink(fileOf(id, "pen.json")).catch(() => {});
  });
}

/** Merge `patch` into the config. Matter sections can be reordered and edited here, but only added or removed through addMatter/deleteMatter. */
export function saveConfig(id: string, patch: unknown): Promise<BookConfig> {
  return run(id)(async () => {
    const current = await readConfig(id);
    if (!current) throw new Error("not found");
    const next = sanitizeConfig(patch, current);
    const known = new Map(current.matter.map((m) => [m.id, m]));
    const kept = next.matter.filter((m) => known.has(m.id));
    // A section the patch left out keeps its place at the end rather than vanishing.
    for (const m of current.matter) if (!kept.some((k) => k.id === m.id)) kept.push(m);
    next.matter = kept;
    await writeAtomic(fileOf(id, "project.json"), JSON.stringify(next, null, 2));
    return next;
  });
}

export interface ManuscriptChange {
  before: { words: number; chapters: number };
  after: { words: number; chapters: number };
  version: string | null;
}

/** Replace the manuscript, keeping the old one in versions/ (unless it was the same text). */
export function replaceManuscript(id: string, content: string): Promise<ManuscriptChange> {
  return run(id)(async () => {
    const config = await readConfig(id);
    if (!config) throw new Error("not found");
    const old = await readManuscript(id);
    const chapters = (md: string) => outline(md, config.structure).filter((h) => h.role === "chapter").length;
    let version: string | null = null;
    if (old && old !== content) {
      version = versionName(Date.now());
      await writeAtomic(fileOf(id, "versions", `${version}.md`), old);
    }
    await writeAtomic(fileOf(id, "manuscript.md"), content);
    return {
      before: { words: countWords(old), chapters: chapters(old) },
      after: { words: countWords(content), chapters: chapters(content) },
      version,
    };
  });
}

const versionName = (ms: number) => new Date(ms).toISOString().replace(/[:.]/g, "-");
const VERSION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
export const isValidVersion = (v: unknown): v is string => typeof v === "string" && VERSION_RE.test(v);

export async function listVersions(id: string): Promise<{ id: string; at: number; words: number }[]> {
  const files = await readdir(fileOf(id, "versions")).catch(() => [] as string[]);
  const out = [];
  for (const f of files) {
    const v = f.replace(/\.md$/, "");
    if (!f.endsWith(".md") || !isValidVersion(v)) continue;
    const text = (await readText(fileOf(id, "versions", f))) ?? "";
    const at = Date.parse(v.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z"));
    out.push({ id: v, at, words: countWords(text) });
  }
  return out.sort((a, b) => b.at - a.at);
}

export const readVersion = (id: string, v: string) => readText(fileOf(id, "versions", `${v}.md`));

// ------------------------------------------------------------------- matter

export const readMatter = (id: string, mid: string) => readText(fileOf(id, "matter", `${mid}.md`)).then((t) => t ?? "");

export function writeMatter(id: string, mid: string, body: string): Promise<void> {
  return run(id)(() => writeAtomic(fileOf(id, "matter", `${mid}.md`), body));
}

export function addMatter(id: string, kind: string): Promise<BookConfig> {
  return run(id)(async () => {
    const config = await readConfig(id);
    if (!config) throw new Error("not found");
    const section = newSection(kind, config.matter.map((m) => m.id));
    // Front matter goes after the other front sections, back matter at the end.
    const at = section.placement === "front" ? config.matter.filter((m) => m.placement === "front").length : config.matter.length;
    const matter = [...config.matter];
    matter.splice(at, 0, section);
    await writeAtomic(fileOf(id, "matter", `${section.id}.md`), matterKind(kind).body);
    const next = { ...config, matter };
    await writeAtomic(fileOf(id, "project.json"), JSON.stringify(next, null, 2));
    return next;
  });
}

export function deleteMatter(id: string, mid: string): Promise<BookConfig> {
  return run(id)(async () => {
    const config = await readConfig(id);
    if (!config) throw new Error("not found");
    const next = { ...config, matter: config.matter.filter((m) => m.id !== mid) };
    await writeAtomic(fileOf(id, "project.json"), JSON.stringify(next, null, 2));
    await unlink(fileOf(id, "matter", `${mid}.md`)).catch(() => {});
    return next;
  });
}

// ------------------------------------------------------------- custom files

export const readCustom = (id: string, kind: CustomKind) => readText(fileOf(id, CUSTOM_FILES[kind])).then((t) => t ?? "");

export function writeCustom(id: string, kind: CustomKind, text: string): Promise<void> {
  return run(id)(async () => {
    const file = fileOf(id, CUSTOM_FILES[kind]);
    if (text.trim()) await writeAtomic(file, text);
    else await unlink(file).catch(() => {});
  });
}

// --------------------------------------------------------------------- cover

/** The image's type from its first bytes, or null when it isn't one a cover can be. */
export function sniffCover(data: Uint8Array): CoverExt | null {
  const b = data;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  const head = new TextDecoder().decode(b.slice(0, 1024)).trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "svg";
  return null;
}

export function writeCover(id: string, data: Uint8Array, ext: CoverExt): Promise<void> {
  return run(id)(async () => {
    for (const other of Object.keys(COVER_TYPES)) if (other !== ext) await unlink(fileOf(id, `cover.${other}`)).catch(() => {});
    await writeAtomic(fileOf(id, `cover.${ext}`), data);
  });
}

export function deleteCover(id: string): Promise<void> {
  return run(id)(async () => {
    for (const ext of Object.keys(COVER_TYPES)) await unlink(fileOf(id, `cover.${ext}`)).catch(() => {});
  });
}

// ------------------------------------------------------------------- delete

export function deleteProject(id: string): Promise<void> {
  return run(id)(async () => {
    const trash = path.join(DATA_DIR, ".trash");
    await mkdir(trash, { recursive: true });
    await rename(dirOf(id), path.join(trash, `${id}--${versionName(Date.now())}`));
  });
}

/** The files of the last export, for download. */
export async function distFile(id: string, name: string): Promise<string | null> {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(name) || name === "build.json") return null;
  const file = fileOf(id, "dist", name);
  return (await stat(file).catch(() => null))?.isFile() ? file : null;
}

export const buildLogFile = (id: string) => fileOf(id, "dist", "build.log");
export const distDir = (id: string) => fileOf(id, "dist");
export const buildDir = (id: string) => fileOf(id, "build");
export const projectFile = fileOf;
export const removeDir = (dir: string) => rm(dir, { recursive: true, force: true });
