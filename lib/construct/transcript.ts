import type { ContentBlock, SessionConfigOption, SessionNotification } from "@agentclientprotocol/sdk";
import { isNotice } from "../acp.ts";
import type { ChatItem, ContextUsage, Render } from "./types.ts";

// A Construct chat's transcript, and how the agent's session updates change
// it (from pen). The session (./session.ts) drives the agent and tells the panel; this
// only keeps the items. Imports nothing server-only, so tests load it with
// plain Node and feed it updates without an agent.

const MAX_ITEMS = 400;

type Update = SessionNotification["update"];
type Compaction = Extract<ChatItem, { type: "compaction" }>;

/** What an update changed, for the session to pass on. */
export type Change =
  | { t: "item"; item: ChatItem }
  | { t: "append"; id: string; text: string }
  | { t: "config"; config: SessionConfigOption[] }
  | { t: "title"; title: string | undefined }
  | { t: "usage"; context: ContextUsage };

/** Where the conversation is, as far as reading an update goes. */
export type TurnState = {
  /** A turn is running: between turns, the agent has nothing to say. */
  running: boolean;
  /** The turn is the writer's Compact. */
  compacting: boolean;
  /** pi-acp's hello, which comes as a message of its own. */
  startupInfo: string | null;
  /** The tool a call is to, by our name (`outline`) or else the agent's. */
  toolName: (call: { _meta?: { [k: string]: unknown } | null; title?: string | null }) => string | undefined;
};

export class Transcript {
  /** The message or thought streaming now, which chunks are added to. */
  private streaming: { id: string; type: "agent" | "thought" } | null = null;

  items: ChatItem[];
  /** The last item id's number. */
  seq: number;

  constructor(items: ChatItem[] = [], seq = 0) {
    this.items = items;
    this.seq = seq;
  }

  nextId(prefix: string) {
    return `${prefix}-${++this.seq}`;
  }

  /** The next message starts a new item, even if the agent's last one was a message too. */
  breakStream() {
    this.streaming = null;
  }

  /** Add the item, or replace the one with its id; the oldest go past 400. */
  upsert(item: ChatItem): Change {
    const i = this.items.findIndex((x) => x.id === item.id);
    if (i >= 0) this.items[i] = item;
    else {
      this.items.push(item);
      if (this.items.length > MAX_ITEMS) this.items.splice(0, this.items.length - MAX_ITEMS);
    }
    return { t: "item", item };
  }

  notice(text: string, tone: "info" | "error" = "info"): Change {
    this.streaming = null;
    return this.upsert({ id: this.nextId("n"), type: "notice", text, tone });
  }

  /** One of the agent's session updates. */
  apply(u: Update, turn: TurnState): Change[] {
    switch (u.sessionUpdate) {
      case "agent_message_chunk":
      case "agent_thought_chunk": {
        if (u.content.type !== "text") return [];
        // pi-acp's own notices and hello come as messages; and nothing's said between turns.
        if (!turn.running || isNotice(u._meta) || u.content.text === turn.startupInfo) return [];
        const type = u.sessionUpdate === "agent_message_chunk" ? "agent" : "thought";
        if (this.streaming?.type === type) {
          const item = this.items.find((x) => x.id === this.streaming!.id);
          if (item && (item.type === "agent" || item.type === "thought")) {
            item.text += u.content.text;
            return [{ t: "append", id: item.id, text: u.content.text }];
          }
        }
        const id = this.nextId(type === "agent" ? "a" : "th");
        this.streaming = { id, type };
        return [this.upsert({ id, type, text: u.content.text })];
      }
      case "tool_call":
      case "tool_call_update": {
        this.streaming = null;
        const prev = this.items.find((x) => x.id === u.toolCallId);
        const base = prev?.type === "tool" ? prev : null;
        const input = brief(u.rawInput) ?? base?.input;
        // The pages a render showed are only known from its result.
        const renders = rendersIn(u.rawOutput) ?? base?.renders;
        const name = turn.toolName(u) ?? base?.name;
        return [
          this.upsert({
            id: u.toolCallId,
            type: "tool",
            name,
            title: u.title ?? base?.title ?? name ?? "Tool",
            status: u.status ?? base?.status ?? "pending",
            input,
            ...(renders && { renders }),
          }),
        ];
      }
      case "plan":
        this.streaming = null;
        return [this.upsert({ id: "plan", type: "plan", entries: u.entries.map((e) => ({ content: e.content, status: e.status })) })];
      case "config_option_update":
        return [{ t: "config", config: visibleConfig(u.configOptions) }];
      case "session_info_update":
        // Claude Code names the session after its first exchange.
        return u.title === undefined ? [] : [{ t: "title", title: u.title?.trim() || undefined }];
      case "usage_update":
        return u.size > 0 ? [{ t: "usage", context: { used: u.used, size: u.size } }] : [];
      case "compaction_update":
      case "compaction_summary_chunk": {
        this.streaming = null;
        const id = `compact-${u.compactionId}`;
        const prev = this.items.find((x) => x.id === id);
        const item: Compaction =
          prev?.type === "compaction" ? { ...prev } : { id, type: "compaction", status: "in_progress", ...(turn.compacting && { manual: true }) };
        if (u.sessionUpdate === "compaction_summary_chunk") {
          if (u.content.type === "text") item.summary = (item.summary ?? "") + u.content.text;
        } else {
          const status = u.status;
          item.status = status === "completed" || status === "failed" || status === "cancelled" ? status : "in_progress";
          // Patches: left out keeps the old value, null clears it.
          if (u.summary !== undefined) item.summary = textOf(u.summary ?? []) || undefined;
          if (u.error !== undefined) item.error = u.error ?? undefined;
        }
        return [this.upsert(item)];
      }
      default:
        return []; // user_message_chunk (echo), commands, modes…
    }
  }
}

/** A stored transcript cut short by a restart: its running tools (and compaction) will never finish. */
export const settled = (items: ChatItem[]): ChatItem[] =>
  items.map((i) =>
    i.type === "tool" && (i.status === "pending" || i.status === "in_progress")
      ? { ...i, status: "failed" }
      : i.type === "compaction" && i.status === "in_progress"
        ? { ...i, status: "cancelled" }
        : i,
  );

/** The writer only picks the model and how hard it thinks; modes stay default. */
export function visibleConfig(options: SessionConfigOption[] | null | undefined) {
  return (options ?? []).filter((o) => o.type === "select" && (o.category === "model" || o.category === "thought_level"));
}

/**
 * How render_pages names each page it rendered (./tools/preview.ts); the panel
 * reads them back from its result with `rendersIn`. Keep the two together.
 */
export const renderedPage = ({ page, file }: Render) => `Page ${page} (rendered as ${file}):`;

/** The pages a render_pages result names, wherever the agent nested it; null when none. */
export function rendersIn(output: unknown): Render[] | null {
  if (output === undefined || output === null) return null;
  const text = JSON.stringify(output);
  const out: Render[] = [];
  for (const m of text.matchAll(/Page (\d+) \(rendered as ([a-z0-9][a-z0-9-]*\.png)\):/g)) {
    if (!out.some((r) => r.file === m[2])) out.push({ page: Number(m[1]), file: m[2] });
  }
  return out.length ? out : null;
}

/** Keep only the small, displayable bits of a tool call's input. */
function brief(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const k of ["id", "kind", "file", "heading", "query", "text", "pages", "formats", "offset", "limit", "path"]) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = String(v).slice(0, 120);
  }
  return Object.keys(out).length ? out : undefined;
}

const textOf = (blocks: ContentBlock[]) =>
  blocks
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
