"use client";

import { useEffect, useRef, useState } from "react";
import { api, base } from "@/lib/api";
import type { ProjectView } from "@/lib/view";
import { Area } from "./fields";

type Attachment = ProjectView["attachments"][number];

/** The book's Notes: free text, the art direction for its typesetting. Construct reads them with every chat, and keeps them. Then its attachments. */
export default function NotesTab({
  view,
  notes,
  setNotes,
  onAttachmentsChanged,
}: {
  view: ProjectView;
  notes: string;
  setNotes: (text: string) => void;
  onAttachmentsChanged: () => void;
}) {
  return (
    <>
      <section className="panel notes-tab">
        <h2>Notes</h2>
        <p className="intro">
          Free text about the book&apos;s typesetting: the art direction (the feel you&apos;re after, books whose pages you like, the type and the
          ornaments), decisions made and why, what&apos;s left to do. They go with the book: a copy takes them, an export doesn&apos;t.
          {view.ai && " Construct follows them in every chat, and notes here what the two of you settle."}
        </p>
        <Area
          rows={24}
          value={notes}
          placeholder={"e.g.\n- Feels like a 1960s Penguin: modest, warm, no flourishes.\n- Chapter openers: number only, small caps, a third of the way down the page.\n- Scene breaks: a single fleuron.\n- Never let a chapter end with a widow."}
          onChange={setNotes}
        />
      </section>
      <Attachments id={view.id} attachments={view.attachments} ai={view.ai} onChanged={onAttachmentsChanged} />
    </>
  );
}

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Images and PDFs that show Construct what the writer is after, each with a caption. Saved as soon as they're added, captioned or removed. */
function Attachments({ id, attachments, ai, onChanged }: { id: string; attachments: Attachment[]; ai: boolean; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    for (const file of files) {
      try {
        await api.addAttachment(id, file);
      } catch (err) {
        failed.push(`${file.name}: ${(err as Error).message}`);
      }
    }
    if (failed.length) setError(failed.join("\n"));
    setBusy(false);
    onChanged();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the Add button does the same by keyboard
    <section
      className="panel attachments"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload([...e.dataTransfer.files]);
      }}
    >
      <h2>Attachments</h2>
      <p className="intro">
        Images and PDFs that show what you&apos;re after: pages you like, a spread from another book, a style guide. Say in the caption what to look at.
        {ai && " Construct is told of them in every chat, and looks at them when it needs to."} PNG, JPEG, WebP, GIF or PDF, up to 20 MB each; a copy of the
        book takes them.
      </p>
      {attachments.length > 0 && (
        <ul className="attachment-list">
          {attachments.map((a) => (
            <AttachmentItem key={a.name} id={id} attachment={a} onChanged={onChanged} />
          ))}
        </ul>
      )}
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Adding…" : "Add…"}
        </button>
        <span className="muted">or drop files here</span>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          void upload(files);
        }}
      />
      {error && <p className="error attachment-error">{error}</p>}
    </section>
  );
}

function AttachmentItem({ id, attachment: a, onChanged }: { id: string; attachment: Attachment; onChanged: () => void }) {
  const url = `${base(id)}/attachments/${a.name}`;
  const [caption, setCaption] = useState(a.caption);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setCaption(a.caption), [a.caption]);

  async function save() {
    if (caption.trim() === a.caption) return;
    setError(null);
    try {
      await api.captionAttachment(id, a.name, caption);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <li className="attachment">
      <a className="attachment-thumb" href={url} target="_blank" rel="noreferrer" title={`Open ${a.name}`}>
        {a.ext === "pdf" ? <span>PDF</span> : <img src={`${url}?v=${a.addedAt}`} alt={a.name} loading="lazy" />}
      </a>
      <div className="attachment-body">
        <div className="attachment-name">
          <a href={url} target="_blank" rel="noreferrer">
            {a.name}
          </a>
          <span className="muted">{size(a.size)}</span>
          <button
            type="button"
            className="link danger"
            onClick={async () => {
              if (!confirm(`Remove ${a.name}?`)) return;
              try {
                await api.deleteAttachment(id, a.name);
                onChanged();
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Remove
          </button>
        </div>
        <textarea
          rows={2}
          maxLength={2000}
          value={caption}
          aria-label={`Caption for ${a.name}`}
          placeholder="What to look at: e.g. the chapter opener's spacing, the small caps in the running heads"
          onChange={(e) => setCaption(e.target.value)}
          onBlur={() => void save()}
        />
        {error && <p className="error">{error}</p>}
      </div>
    </li>
  );
}
