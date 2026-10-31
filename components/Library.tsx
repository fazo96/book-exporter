"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/store";
import PenImport from "./PenImport";

const MD = /\.(md|markdown|txt)$/i;

/** The library: every book, newest first. Drop or pick a .md file anywhere to start a new one. */
export default function Library({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromPen, setFromPen] = useState(false);
  // pen book → the books linked to it.
  const linked = new Map<string, string[]>();
  for (const p of projects) if (p.pen) linked.set(p.pen, [...(linked.get(p.pen) ?? []), p.id]);
  // Copies share their title: tell them apart by id.
  const shared = new Set(projects.filter((p, i) => projects.findIndex((q) => q.title === p.title) !== i).map((p) => p.title));

  async function importFile(file: File) {
    if (!MD.test(file.name)) {
      setError(`${file.name} isn't a markdown file`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.create(await file.text(), file.name);
      router.push(`/b/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main
      className={`library${dragging ? " dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void importFile(file);
      }}
    >
      <header className="library-head">
        <h1>book-exporter</h1>
        <span className="row">
          <button type="button" onClick={() => setFromPen((v) => !v)}>
            Import from pen
          </button>
          <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Importing…" : "Import manuscript"}
          </button>
        </span>
        <input
          ref={input}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </header>
      {error && <p className="error">{error}</p>}
      {fromPen && <PenImport linked={linked} onClose={() => setFromPen(false)} />}
      {projects.length === 0 ? (
        <div className="empty">
          <p>No books yet.</p>
          <p>Drop a markdown manuscript here, or import one. The first <code>#</code> heading becomes the title.</p>
        </div>
      ) : (
        <ul className="shelf">
          {projects.map((p) => (
            <li key={p.id}>
              <a href={`/b/${p.id}`} className="book-card">
                <span className="cover-thumb">
                  {p.cover ? <img src={`/api/projects/${p.id}/cover`} alt="" /> : <span className="cloth">{p.title}</span>}
                </span>
                <span className="card-text">
                  <strong>{p.title}</strong>
                  {p.author && <span>{p.author}</span>}
                  {shared.has(p.title) && <span className="muted">{p.id}</span>}
                  <span className="meta">
                    {p.words.toLocaleString("en")} words
                    {p.lastBuild && ` · exported ${new Date(p.lastBuild.at).toLocaleDateString()}`}
                    {p.pen && " · from pen"}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="drop-hint">Drop a .md file anywhere to add a book</p>
    </main>
  );
}
