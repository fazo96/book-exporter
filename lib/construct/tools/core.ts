import "server-only";
import { isValidId } from "../../ids";
import { headings } from "../../manuscript";
import { projectExists } from "../../store";
import type { BookPart, ToolName } from "../types";

// What every tool is made of (from pen): its JSON schema, which is both what
// the agent is shown and what its arguments are checked and typed against
// (readArgs), and the helpers the tools share.

export type ToolContext = {
  projectId: string;
  /** Called before each change to the book: the session snapshots it before a turn's first. */
  beforeChange: () => Promise<void>;
  /** Called after every change (and export), so the book's page can reload what it shows. */
  onChange: (parts: BookPart[]) => void;
};

/** What a tool answers: text, and the images it shows the agent (render_pages). */
export type ToolOutput = { text: string; images?: { data: string; mimeType: string }[] };

/** A failure the agent should see and can act on. */
export class ToolError extends Error {}

// ─── Arguments ───────────────────────────────────────────────

/** A string that may be empty (an empty one is otherwise taken as left out). */
const EMPTY_OK = Symbol("empty ok");

type StringProp = { type: "string"; description: string; enum?: readonly string[]; [EMPTY_OK]?: true };
type IntProp = { type: "integer"; minimum: 1; description: string };
type BoolProp = { type: "boolean"; description: string };
type ObjectProp = { type: "object"; description: string };
type ArrayProp = { type: "array"; items: { type: "string"; enum: readonly string[] }; description: string };
type Prop = StringProp | IntProp | BoolProp | ObjectProp | ArrayProp;
export type Props = Record<string, Prop>;

export const str = (description: string): StringProp => ({ type: "string", description });
export const text = (description: string): StringProp => ({ type: "string", description, [EMPTY_OK]: true });
export const oneOf = <const E extends readonly string[]>(values: E, description: string) =>
  ({ type: "string", enum: values, description }) as const;
export const int = (description: string): IntProp => ({ type: "integer", minimum: 1, description });
export const bool = (description: string): BoolProp => ({ type: "boolean", description });
export const obj = (description: string): ObjectProp => ({ type: "object", description });
export const someOf = <const E extends readonly string[]>(values: E, description: string) =>
  ({ type: "array", items: { type: "string", enum: values }, description }) as const;

type ValueOf<P> = P extends { type: "array"; items: { enum: readonly (infer E)[] } }
  ? E[]
  : P extends { enum: readonly (infer E)[] }
    ? E
    : P extends { type: "integer" }
      ? number
      : P extends { type: "boolean" }
        ? boolean
        : P extends { type: "object" }
          ? Record<string, unknown>
          : string;
export type Args<P extends Props, R extends keyof P> = { [K in R]: ValueOf<P[K]> } & { [K in Exclude<keyof P, R>]?: ValueOf<P[K]> };

/** The arguments the schema describes, checked: anything else is left out. */
export function readArgs<P extends Props, R extends keyof P>(properties: P, required: readonly R[], input: Record<string, unknown>): Args<P, R> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const v = readArg(key, prop, input[key]);
    if (v !== undefined) out[key] = v;
    else if ((required as readonly string[]).includes(key)) throw new ToolError(`Missing "${key}".`);
  }
  return out as Args<P, R>;
}

function readArg(key: string, prop: Prop, v: unknown): unknown {
  if (v === undefined || v === null) return undefined;
  if (prop.type === "integer") {
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isInteger(n) || n < prop.minimum) throw new ToolError(`"${key}" must be a positive integer.`);
    return n;
  }
  if (prop.type === "boolean") {
    if (v === true || v === "true") return true;
    if (v === false || v === "false") return false;
    throw new ToolError(`"${key}" must be true or false.`);
  }
  if (prop.type === "object") {
    // Some agents send an object argument as JSON text.
    let o = v;
    if (typeof o === "string") {
      try {
        o = JSON.parse(o);
      } catch {
        throw new ToolError(`"${key}" must be a JSON object.`);
      }
    }
    if (!o || typeof o !== "object" || Array.isArray(o)) throw new ToolError(`"${key}" must be a JSON object.`);
    return o;
  }
  if (prop.type === "array") {
    const list = typeof v === "string" ? v.split(/[\s,]+/).filter(Boolean) : v;
    if (!Array.isArray(list) || list.some((x) => typeof x !== "string" || !prop.items.enum.includes(x))) {
      throw new ToolError(`"${key}" must be a list of: ${prop.items.enum.join(", ")}.`);
    }
    return list.length ? [...new Set(list)] : undefined;
  }
  if (typeof v !== "string") throw new ToolError(`"${key}" must be a string.`);
  if (v === "" && !prop[EMPTY_OK]) return undefined;
  if (prop.enum && !prop.enum.includes(v)) throw new ToolError(`"${key}" must be one of: ${prop.enum.join(", ")}.`);
  return v;
}

// ─── Tools ───────────────────────────────────────────────────

export type Tool = {
  name: ToolName;
  description: string;
  inputSchema: { type: "object"; properties: Props; required?: string[] };
  readOnly: boolean;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string | ToolOutput>;
};

/** A tool whose `run` gets its arguments checked and typed from `properties` and `required`. */
export function tool<const P extends Props, const R extends keyof P & string = never>(t: {
  name: ToolName;
  description: string;
  properties: P;
  required?: readonly R[];
  readOnly: boolean;
  run: (args: Args<P, R>, ctx: ToolContext) => Promise<string | ToolOutput>;
}): Tool {
  const required = t.required ?? [];
  return {
    name: t.name,
    description: t.description,
    inputSchema: { type: "object", properties: t.properties, ...(required.length ? { required: [...required] } : {}) },
    readOnly: t.readOnly,
    run: (input, ctx) => t.run(readArgs(t.properties, required, input), ctx),
  };
}

// ─── Other books ─────────────────────────────────────────────

/** The argument of the tools that read: another book of the library instead of this one. */
export const bookProps = { book: str("Another book's id (list_books), to read it instead of this one.") };

/** The book a read is of: `book` if given (and in the library), else the chat's own. */
export async function bookOf(args: { book?: string }, ctx: ToolContext): Promise<string> {
  const { book } = args;
  if (!book || book === ctx.projectId) return ctx.projectId;
  if (!isValidId(book) || !(await projectExists(book))) throw new ToolError(`No book "${book}" in the library: list_books lists them.`);
  return book;
}

// ─── Reading text ────────────────────────────────────────────

export type Section = { level: number; text: string; line: number; end: number };

/** The headings of a markdown text, each with its lines (1-based, to the next heading of its level or shallower). */
export function sectionsOf(markdown: string): Section[] {
  const total = markdown.split("\n").length;
  const hs = headings(markdown);
  return hs.map((h, i) => {
    let end = total;
    for (let j = i + 1; j < hs.length; j++) {
      if (hs[j].level <= h.level) {
        end = hs[j].line;
        break;
      }
    }
    return { level: h.level, text: h.text, line: h.line + 1, end };
  });
}

/** Find a heading by (part of) its text. */
export function findSection(markdown: string, query: string) {
  const sections = sectionsOf(markdown);
  const q = query.trim().toLowerCase();
  const match = sections.find((s) => s.text.toLowerCase() === q) ?? sections.find((s) => s.text.toLowerCase().includes(q));
  if (!match) throw new ToolError(`No heading matches "${query}". Use outline to see them.`);
  return match;
}

/** The most one read returns; past it, the agent reads on with `offset`. */
const READ_LINES = 2000;
const READ_CHARS = 50_000;

/** The arguments of the tools that read part of a text. */
export const rangeProps = {
  offset: int("Line to start at (1-based, as numbered in the output)."),
  limit: int(`How many lines to read (at most ${READ_LINES}).`),
};

/**
 * Lines of a text, numbered, optionally limited to a section, from `offset`
 * for `limit` lines. A read stops at READ_LINES lines or about READ_CHARS
 * characters, at a whole line, and says where to go on from, so any text can
 * be read whole a page at a time.
 */
export function excerpt(markdown: string, range: { heading?: string; offset?: number; limit?: number }) {
  const lines = markdown.split("\n");
  let from = range.offset ?? 1;
  let end = lines.length;
  if (range.heading) {
    const s = findSection(markdown, range.heading);
    from = Math.max(from, s.line);
    end = s.end;
  }
  if (from > end) {
    return range.heading ? `(no lines: the section ends at line ${end})` : `(no lines: the text has ${lines.length})`;
  }
  const last = Math.min(end, from + Math.min(range.limit ?? READ_LINES, READ_LINES) - 1);
  const width = String(last).length;
  const out: string[] = [];
  let size = 0;
  let to = from - 1;
  for (let n = from; n <= last; n++) {
    let line = `${String(n).padStart(width)}\t${lines[n - 1]}`;
    if (size + line.length > READ_CHARS) {
      if (out.length) break;
      // A line longer than a whole read: only its start fits.
      line = `${line.slice(0, READ_CHARS)}… (line ${n} cut: it's over ${READ_CHARS.toLocaleString("en")} characters)`;
    }
    out.push(line);
    size += line.length + 1;
    to = n;
  }
  const body = `Lines ${from}–${to} of ${lines.length}:\n${out.join("\n")}`;
  if (to === end) return body;
  const more = end - to;
  return `${body}\n(${more.toLocaleString("en")} more line${more > 1 ? "s" : ""}${range.heading ? " in this section" : ""}: continue with offset ${to + 1}.)`;
}

/**
 * Replace `old` with `replacement` in `content`, exactly once: a missing or
 * repeated `old` is an error the agent can fix (more context, or the right text).
 */
export function replaceOnce(content: string, old: string, replacement: string, what: string) {
  if (!old) throw new ToolError("old_text is empty: to replace the whole text, use the write tool.");
  const at = content.indexOf(old);
  if (at < 0) throw new ToolError(`old_text isn't in ${what}: read it again and copy the text exactly.`);
  if (content.indexOf(old, at + 1) >= 0) throw new ToolError(`old_text appears more than once in ${what}: include more of the text around it.`);
  return content.slice(0, at) + replacement + content.slice(at + old.length);
}
