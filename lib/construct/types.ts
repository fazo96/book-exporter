// Construct's wire format between the server session and the panel (from pen).

import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import type { AgentId } from "./agentInfo.ts";

/** Construct's tools, as its agent calls them (served by ./tools/, described in the panel by ConstructItem.tsx). */
export type ToolName =
  | "outline"
  | "read_manuscript"
  | "search_manuscript"
  | "read_settings"
  | "update_settings"
  | "read_matter"
  | "edit_matter"
  | "add_matter"
  | "read_custom"
  | "edit_custom"
  | "read_builtin"
  | "read_notes"
  | "edit_notes"
  | "export_book"
  | "read_build_log"
  | "render_pages"
  | "find_in_pdf"
  | "read_epub";

/** What a tool changed, so the book's page can reload it. */
export type BookPart = "settings" | "matter" | "custom" | "notes" | "export";

export type PromptContext = {
  /** The tab the writer has open. */
  tab?: string;
};

/** A page Construct rendered: its number and the PNG's name in construct/renders/. */
export type Render = { page: number; file: string };

export type ChatItem =
  | {
      id: string;
      type: "user";
      text: string;
      context?: PromptContext;
      /** The book as it was before Construct's first change in this turn (construct/snapshots/<snapshot>/). */
      snapshot?: string;
    }
  | { id: string; type: "agent" | "thought"; text: string }
  | {
      id: string;
      type: "tool";
      /** The tool's name without the MCP prefix (e.g. "render_pages"), or the agent's own. */
      name?: string;
      title: string;
      status: "pending" | "in_progress" | "completed" | "failed";
      input?: Record<string, string>;
      /** The pages render_pages showed the agent. */
      renders?: Render[];
    }
  | { id: string; type: "plan"; entries: { content: string; status: string }[] }
  | { id: string; type: "notice"; text: string; tone: "info" | "error" }
  | {
      id: string;
      /** The agent summarized the conversation so far to make room in its context. */
      type: "compaction";
      status: "in_progress" | "completed" | "failed" | "cancelled";
      /** What it kept, as markdown. */
      summary?: string;
      error?: string;
      /** The writer asked for it; otherwise the agent did it on its own. */
      manual?: boolean;
    };

/** How full the agent's context window is, in tokens. */
export type ContextUsage = { used: number; size: number };

export type ChatMeta = { id: string; title: string; created: number; updated: number };

export type ConstructState = {
  agent: AgentId;
  /** The conversation shown, and the stored ones (newest first). */
  chatId: string;
  chats: ChatMeta[];
  status: "idle" | "starting" | "ready" | "busy" | "error";
  error?: string;
  /** Model / effort pickers the agent offers. */
  config: SessionConfigOption[];
  /** The agent's latest reading for the chat shown, once there is one. */
  context?: ContextUsage;
};

export type ConstructEvent =
  | { t: "snapshot"; items: ChatItem[]; state: ConstructState }
  | { t: "item"; item: ChatItem }
  | { t: "append"; id: string; text: string }
  | { t: "state"; state: ConstructState }
  /** Construct changed the book (or exported it): the page reloads what it shows. */
  | { t: "changed"; parts: BookPart[] };

/** What the panel asks of the session (POST /api/projects/<id>/construct); replies come over the event stream. */
export type ConstructAction =
  | { action: "start" }
  | { action: "switch"; agent: string; model?: string }
  | { action: "prompt"; text: string; context?: PromptContext }
  | { action: "compact" }
  | { action: "cancel" }
  | { action: "reset" }
  | { action: "open-chat"; chatId: string }
  | { action: "delete-chat"; chatId: string }
  | { action: "rename-chat"; chatId: string; title: string }
  | { action: "config"; configId: string; value: string }
  /** Put the book back as it was before the message `itemId` (its snapshot). */
  | { action: "revert"; itemId: string };
