"use client";

import { useEffect, useRef, useState } from "react";
import { api, base } from "@/lib/api";
import type { BookConfig } from "@/lib/config";
import { roleOf } from "@/lib/manuscript";
import type { PullResult } from "@/lib/pen";
import type { ManuscriptChange } from "@/lib/store";
import type { ProjectView } from "@/lib/view";

const ROLE_LABEL = { title: "title", part: "part", chapter: "chapter", scene: "scene", other: "heading" } as const;

/**
 * The manuscript: replace it (drop, pick or paste a newer .md: the old one is
 * kept as a version), see what changed, and check the outline as the export
 * will read it with the current Layout settings.
 */
export default function ManuscriptTab({ view, structure, onChanged }: { view: ProjectView; structure: BookConfig["structure"]; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [change, setChange] = useState<ManuscriptChange | "same" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Known only in the browser; read after mount so the server render matches.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(location.origin);
  }, []);

  async function replace(content: string) {
    setBusy(true);
    setError(null);
    try {
      setChange(await api.replaceManuscript<ManuscriptChange>(view.id, content));
      setPasting(false);
      setPasted("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pullFromPen() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.pull<PullResult>(view.id);
      setChange(r.change ?? "same");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setPullOnExport(on: boolean) {
    try {
      await api.setPullOnExport(view.id, on);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function unlink() {
    if (!confirm("Unlink this book from pen? The manuscript stays as last pulled.")) return;
    try {
      await api.unlink(view.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function restore(vid: string) {
    if (!confirm("Make this version the manuscript again? The current one is kept as a version.")) return;
    setBusy(true);
    try {
      setChange(await api.restoreVersion<ManuscriptChange>(view.id, vid));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The outline as the export reads it, with the draft's heading levels (not the saved ones).
  const items = view.outline.map((h) => ({ ...h, role: roleOf(h.level, structure) }));
  const count = (role: string) => items.filter((h) => h.role === role).length;
  const delta = (a: number, b: number) => (b === a ? "unchanged" : `${a.toLocaleString("en")} → ${b.toLocaleString("en")} (${b > a ? "+" : ""}${(b - a).toLocaleString("en")})`);

  return (
    <div className="manuscript-tab">
      <section className="panel">
        <h2>Manuscript</h2>
        <p className="stats">
          <strong>{view.words.toLocaleString("en")}</strong> words · {count("part")} parts · {count("chapter")} chapters
          {structure.sceneLevel > 0 && ` · ${count("scene")} scene headings`}
        </p>
        {view.pen && (
          <div className="pen-link">
            <p>
              Linked to <strong>{view.pen.doc}</strong> in <a href={`${view.pen.url}/d/${view.pen.doc}`}>pen</a>, last pulled {new Date(view.pen.pulledAt).toLocaleString()}.
            </p>
            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={() => void pullFromPen()}>
                {busy ? "Pulling…" : "Pull from pen"}
              </button>
              <label className="toggle inline">
                <input type="checkbox" checked={view.pen.pullOnExport} onChange={(e) => void setPullOnExport(e.target.checked)} /> Pull before every export
              </label>
              <button type="button" className="link" onClick={() => void unlink()}>
                Unlink
              </button>
            </div>
          </div>
        )}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the buttons inside do the same by keyboard */}
        <div
          className={`dropzone${dragging ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) await replace(await file.text());
          }}
        >
          <p>Drop a newer version of the manuscript here to replace it.</p>
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
              Choose file…
            </button>
            <button type="button" disabled={busy} onClick={() => setPasting((p) => !p)}>
              {pasting ? "Cancel paste" : "Paste text"}
            </button>
            <a className="button" href={`${base(view.id)}/manuscript`}>
              Download current
            </a>
          </div>
          <input
            ref={input}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) await replace(await file.text());
            }}
          />
          {pasting && (
            <div className="paste">
              <textarea rows={10} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the whole manuscript as markdown" />
              <button type="button" className="primary" disabled={busy || !pasted.trim()} onClick={() => void replace(pasted)}>
                Replace manuscript
              </button>
            </div>
          )}
          <p className="field-hint">
            From a script: <code>curl -T book.md {origin}/api/projects/{view.id}/manuscript</code>
          </p>
        </div>
        {error && <p className="error">{error}</p>}
        {change === "same" && <p className="notice">pen has the same text: nothing changed.</p>}
        {change && change !== "same" && (
          <p className="notice">
            {change.version ? "Replaced (the previous manuscript is kept below)." : "The new text was identical: nothing changed."} Words:{" "}
            {delta(change.before.words, change.after.words)}. Chapters: {delta(change.before.chapters, change.after.chapters)}.
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Outline</h2>
        <p className="intro">How the export reads the headings with the current Layout settings. Title headings are dropped; scene headings become {structure.sceneHeadings === "break" ? "scene breaks" : structure.sceneHeadings === "show" ? "small titles" : "nothing"}.</p>
        {items.length === 0 ? (
          <p className="muted">No headings: the whole manuscript will be one chapter without a title.</p>
        ) : (
          <ol className="outline">
            {items.map((h, i) => (
              <li key={i} className={`role-${h.role}`} style={{ paddingLeft: `${(h.level - 1) * 1.1}em` }}>
                <span className="badge">{ROLE_LABEL[h.role]}</span>
                <span className="text">{h.text}</span>
                <span className="muted">{h.words.toLocaleString("en")}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>Versions</h2>
        {view.versions.length === 0 ? (
          <p className="muted">Each time the manuscript is replaced, the previous one is kept here.</p>
        ) : (
          <ul className="versions">
            {view.versions.map((v) => (
              <li key={v.id}>
                <span>{new Date(v.at).toLocaleString()}</span>
                <span className="muted">{v.words.toLocaleString("en")} words</span>
                <a href={`${base(view.id)}/versions/${v.id}`}>Download</a>
                <button type="button" className="link" disabled={busy} onClick={() => void restore(v.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
