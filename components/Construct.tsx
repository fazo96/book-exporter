"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { agentName, DEFAULT_AGENT } from "@/lib/construct/agentInfo";
import type { BookPart, PromptContext, Render } from "@/lib/construct/types";
import { useConstruct } from "@/lib/useConstruct";
import { useModels } from "@/lib/useModels";
import ConstructChats from "./ConstructChats";
import ConstructItem from "./ConstructItem";
import ConstructModelMenu from "./ConstructModelMenu";
import { IconChats, IconClose, IconCompact, IconPlus, IconSend, IconStop } from "./icons";

// Construct's side panel (from pen): a conversation with the agent that
// typesets the book with the writer. It changes the book on the server; the
// page reloads what it changed (onChanged).

type Props = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Where the writer is, sent along with each message. */
  getContext: () => PromptContext;
  /** Save the page's drafts first, so Construct reads what the writer sees. */
  beforeSend: () => Promise<boolean>;
  /** Construct changed the book, or exported it. */
  onChanged: (parts: BookPart[]) => void;
  /** The last exported PDF, to open at a rendered page of it, and when it was made. */
  pdf: { url: string; at: number } | null;
};

/** 460, 12k, 1.2M: token counts at a glance. */
function tokens(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${n < 10_000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") : Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

const isTouch = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

export default function Construct({ projectId, open, onClose, getContext, beforeSend, onChanged, pdf }: Props) {
  const c = useConstruct(projectId, open, onChanged);
  const models = useModels(open);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showChats, setShowChats] = useState(false);
  const [viewing, setViewing] = useState<Render | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const status = c.state?.status ?? "idle";
  const busy = status === "busy" || sending;

  // Wake the agent the first time the panel opens.
  useEffect(() => {
    if (open && c.state?.status === "idle") void c.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, c.state?.status]);

  useEffect(() => {
    if (open && !isTouch()) input.current?.focus();
  }, [open]);

  // Follow the conversation unless the writer has scrolled up to reread.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [c.items]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setViewing(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setSending(true);
    const context = getContext();
    const saved = await beforeSend();
    const ok = saved && (await c.send(text, context));
    setSending(false);
    if (ok) {
      setDraft("");
      stick.current = true;
    }
  };

  const config = c.state?.config ?? [];
  // A chat is listed once it has a message; until then the header says "Construct".
  const chatTitle = c.state?.chats.find((x) => x.id === c.state?.chatId)?.title;
  const context = c.state?.context;
  const filled = context ? Math.min(1, context.used / context.size) : 0;
  const renderUrl = (file: string) => `/api/projects/${projectId}/construct/renders/${file}`;

  return (
    <>
      <div className={`construct-scrim ${open ? "is-open" : ""}`} onClick={onClose} aria-hidden />
      <aside className={`construct ${open ? "is-open" : ""}`} aria-label="Construct" aria-hidden={!open}>
        <div className="construct-head">
          <div className="construct-title">
            {chatTitle ? (
              <span className="construct-name is-chat" title={chatTitle}>
                {chatTitle}
              </span>
            ) : (
              <>
                <span className="construct-name">Construct</span>
                <span className="label">{agentName(c.state?.agent ?? DEFAULT_AGENT)}</span>
              </>
            )}
          </div>
          <div className="construct-head-actions">
            <button
              type="button"
              className={`icon-btn ${showChats ? "is-on" : ""}`}
              onClick={() => setShowChats((s) => !s)}
              disabled={!c.state?.chats?.length}
              aria-label="Chats"
              aria-pressed={showChats}
              title="Chats"
            >
              <IconChats />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setShowChats(false);
                void c.reset();
              }}
              disabled={!c.items.length}
              aria-label="New chat"
              title="New chat"
            >
              <IconPlus />
            </button>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close Construct" title="Close (Ctrl+Shift+A)">
              <IconClose />
            </button>
          </div>
        </div>

        {(config.length > 0 || context) && (
          <div className="construct-config">
            {config.length > 0 && (
              <ConstructModelMenu
                config={config}
                agent={c.state?.agent ?? DEFAULT_AGENT}
                agents={models.agents}
                disabled={busy}
                onChange={(id, v) => void c.setConfig(id, v)}
                onSwitch={(agent, model) => {
                  setShowChats(false);
                  void c.switchAgent(agent, model);
                }}
              />
            )}
            {context && (
              <div className={`construct-context ${filled >= 0.8 ? "is-full" : ""}`}>
                {/* biome-ignore lint/a11y/useSemanticElements: a drawn bar; a <meter> can't be styled like it everywhere */}
                <span
                  className="construct-context-meter"
                  role="meter"
                  aria-label="Context used"
                  aria-valuemin={0}
                  aria-valuemax={context.size}
                  aria-valuenow={context.used}
                  title={`Context: ${context.used.toLocaleString()} of ${context.size.toLocaleString()} tokens`}
                >
                  <span style={{ width: `${filled * 100}%` }} />
                </span>
                <span className="construct-context-text">
                  {Math.round(filled * 100)}%
                  <span className="construct-context-tokens">
                    {" "}
                    · {tokens(context.used)}/{tokens(context.size)}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-btn construct-context-compact"
                  onClick={() => {
                    stick.current = true;
                    void c.compact();
                  }}
                  disabled={busy || !c.items.length}
                  aria-label="Compact the conversation"
                  title="Compact: summarize the conversation so far, to free up context"
                >
                  <IconCompact />
                </button>
              </div>
            )}
          </div>
        )}

        {showChats && (
          <ConstructChats
            chats={c.state?.chats ?? []}
            current={c.state?.chatId}
            busy={busy}
            onOpen={(id) => {
              setShowChats(false);
              stick.current = true;
              void c.openChat(id);
            }}
            onRename={(id, name) => void c.renameChat(id, name)}
            onDelete={(id) => void c.deleteChat(id)}
          />
        )}

        <div
          className="construct-log"
          hidden={showChats}
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          aria-live="polite"
        >
          {c.items.length === 0 && (
            <div className="construct-empty">
              <p>
                Construct typesets the book with you: it exports it, looks at the pages, and changes the settings, the front
                and back matter and the custom files until they look the way you want.
              </p>
              <p>
                It follows the art direction in the Notes tab. The manuscript is yours: it reads it, and never changes it. Each
                message you send can be undone, with everything Construct changed after it.
              </p>
            </div>
          )}
          {c.items.map((item) => (
            <ConstructItem
              key={item.id}
              item={item}
              renderUrl={renderUrl}
              onOpenRender={setViewing}
              onRevert={
                busy
                  ? undefined
                  : (itemId) => {
                      if (confirm("Put the settings, front and back matter, custom files and Notes back as they were before this message? What Construct changed since is undone (as are your own changes to them since).")) {
                        void c.revert(itemId);
                      }
                    }
              }
            />
          ))}
          {status === "busy" && <div className="construct-working" role="img" aria-label="Working" />}
        </div>

        {(c.error || status === "error") && (
          <p className="construct-error" role="alert">
            {c.error ?? c.state?.error}{" "}
            {status === "error" && (
              <button type="button" onClick={() => void c.start()}>
                Retry
              </button>
            )}
          </p>
        )}

        <form
          className="construct-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={input}
            value={draft}
            rows={1}
            placeholder={status === "starting" ? "Waking Construct…" : "Ask Construct"}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey && !isTouch()) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {status === "busy" ? (
            <button type="button" className="construct-send" onClick={() => void c.cancel()} aria-label="Stop" title="Stop">
              <IconStop />
            </button>
          ) : (
            <button type="submit" className="construct-send" disabled={!draft.trim() || busy} aria-label="Send">
              <IconSend />
            </button>
          )}
        </form>
      </aside>

      {viewing && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes it too (above)
        // biome-ignore lint/a11y/noStaticElementInteractions: a click on the backdrop closes it
        <div className="render-view" onClick={(e) => e.target === e.currentTarget && setViewing(null)}>
          <img src={renderUrl(viewing.file)} alt={`Page ${viewing.page}`} />
          <p>
            <span>Page {viewing.page}, as Construct saw it{pdf && !viewing.file.startsWith(`${pdf.at.toString(36)}-`) && " (an earlier export)"}</span>
            {/* Renders are named by their export's time: an older one's page may be elsewhere in today's PDF. */}
            {pdf && viewing.file.startsWith(`${pdf.at.toString(36)}-`) && (
              <a href={`${pdf.url}#page=${viewing.page}`} target="_blank" rel="noreferrer">
                Open the PDF at this page
              </a>
            )}
            <button type="button" className="link" onClick={() => setViewing(null)}>
              Close
            </button>
          </p>
        </div>
      )}
    </>
  );
}
