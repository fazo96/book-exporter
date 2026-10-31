"use client";

import type { ChatItem, Render, ToolName } from "@/lib/construct/types";
import { Markdown } from "./ConstructMarkdown";

// One item of Construct's transcript (from pen): a message, the agent's
// thinking, a tool it used (in the writer's terms, with the pages it looked
// at), its plan, a compaction, a notice.

const FILES: Record<string, string> = { "custom.typ": "custom.typ", "custom.css": "custom.css", "filter.lua": "filter.lua" };

/** " (lines 40–80)": the lines a read asked for, as an offset and limit. */
function linesOf(i: Record<string, string>) {
  if (!i.offset) return i.limit ? ` (first ${i.limit} lines)` : "";
  return i.limit ? ` (lines ${i.offset}–${Number(i.offset) + Number(i.limit) - 1})` : ` (from line ${i.offset})`;
}

/** What each tool did, from the bits of its input the session keeps (`brief`). */
const TOOL_TEXT: Record<ToolName, (i: Record<string, string>, lines: string) => string> = {
  outline: () => "Read the outline",
  read_manuscript: (i, lines) => `Read ${i.heading ?? "the manuscript"}${lines}`,
  search_manuscript: (i) => (i.query ? `Searched the manuscript for “${i.query}”` : "Searched the manuscript"),
  read_settings: () => "Read the settings",
  update_settings: () => "Changed the settings",
  read_matter: (i) => (i.id ? `Read the ${i.id} page` : "Looked through the front and back matter"),
  edit_matter: (i) => `Edited the ${i.id ?? ""} page`,
  add_matter: (i) => `Added a ${i.kind ?? ""} page`,
  read_custom: (i, lines) => `Read ${FILES[i.file] ?? "a custom file"}${lines}`,
  edit_custom: (i) => `Edited ${FILES[i.file] ?? "a custom file"}`,
  read_builtin: (i, lines) => `Read the built-in ${i.file ?? "files"}${lines}`,
  read_notes: () => "Read the Notes",
  edit_notes: () => "Edited the Notes",
  export_book: () => "Exported the book",
  read_build_log: () => "Read the export’s log",
  render_pages: (i) => (i.pages ? `Looked at page${/[-,\s]/.test(i.pages) ? "s" : ""} ${i.pages}` : "Looked at the PDF"),
  find_in_pdf: (i) => (i.text ? `Looked for “${i.text}” in the PDF` : "Searched the PDF"),
  read_epub: (i, lines) => (i.path ? `Read ${i.path.split("/").pop()} in the EPUB${lines}` : "Looked through the EPUB"),
};

function describeTool(item: Extract<ChatItem, { type: "tool" }>): string {
  const i = item.input ?? {};
  const describe = item.name && Object.hasOwn(TOOL_TEXT, item.name) ? TOOL_TEXT[item.name as ToolName] : null;
  return describe ? describe(i, linesOf(i)) : item.title;
}

type Props = {
  item: ChatItem;
  /** Where a rendered page's image is. */
  renderUrl: (file: string) => string;
  /** Show a rendered page bigger. */
  onOpenRender: (render: Render) => void;
  /** Put the book back as it was before this message; absent while Construct is answering. */
  onRevert?: (itemId: string) => void;
};

export default function ConstructItem({ item, renderUrl, onOpenRender, onRevert }: Props) {
  switch (item.type) {
    case "user":
      return (
        <div className="construct-msg is-user">
          <p>{item.text}</p>
          {item.snapshot && (
            <button
              type="button"
              className="link construct-revert"
              disabled={!onRevert}
              onClick={() => onRevert?.(item.id)}
              title="Put the settings, front and back matter, custom files and Notes back as they were before this message"
            >
              Undo Construct’s changes from here on
            </button>
          )}
        </div>
      );
    case "agent":
      return (
        <div className="construct-msg is-agent">
          <Markdown text={item.text} />
        </div>
      );
    case "thought":
      return (
        <details className="construct-thought">
          <summary className="label">Thinking</summary>
          <p>{item.text}</p>
        </details>
      );
    case "tool":
      return (
        <div className={`construct-tool is-${item.status}`}>
          <div className="construct-tool-line">
            <span className="construct-tool-dot" aria-hidden />
            <span>{describeTool(item)}</span>
          </div>
          {item.renders && (
            <div className="construct-renders">
              {item.renders.map((r) => (
                <button key={r.file} type="button" onClick={() => onOpenRender(r)} title={`Page ${r.page}`}>
                  <img src={renderUrl(r.file)} alt={`Page ${r.page}`} loading="lazy" />
                  <span>{r.page}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case "plan":
      return (
        <ol className="construct-plan">
          {item.entries.map((e, i) => (
            <li key={i} className={`is-${e.status}`}>
              {e.content}
            </li>
          ))}
        </ol>
      );
    case "compaction":
      return (
        <div className={`construct-compaction is-${item.status}`}>
          <p className="label">
            {item.status === "in_progress"
              ? "Compacting the conversation…"
              : item.status === "failed"
                ? "Compacting failed"
                : item.status === "cancelled"
                  ? "Compacting stopped"
                  : item.manual
                    ? "Conversation compacted"
                    : "Compacted to make room"}
          </p>
          {item.error && <p className="construct-notice is-error">{item.error}</p>}
          {item.status === "completed" && <p className="construct-notice">Construct now remembers what’s above only as a summary.</p>}
          {item.summary && (
            <details className="construct-thought construct-compaction-summary">
              <summary className="label">Summary</summary>
              <Markdown text={item.summary} />
            </details>
          )}
        </div>
      );
    case "notice":
      return <p className={`construct-notice is-${item.tone}`}>{item.text}</p>;
  }
}
