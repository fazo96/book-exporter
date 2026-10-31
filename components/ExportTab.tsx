"use client";

import { useEffect, useRef, useState } from "react";
import { api, base } from "@/lib/api";
import type { BuildEvent } from "@/lib/build";
import { readNdjson } from "@/lib/ndjson";
import type { ProjectView } from "@/lib/view";

type Line = { text: string; level: "info" | "warn" | "error" | "step" };

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Export: save, run the pipeline with its log streaming in, then download or preview what it made. */
export default function ExportTab({ view, dirty, save, onBuilt }: { view: ProjectView; dirty: boolean; save: () => Promise<boolean>; onBuilt: () => void }) {
  const [epub, setEpub] = useState(true);
  const [pdf, setPdf] = useState(true);
  const [running, setRunning] = useState(view.building);
  const [lines, setLines] = useState<Line[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [preview, setPreview] = useState(false);
  const logEnd = useRef<HTMLDivElement>(null);

  // Braces: scrollIntoView returns a Promise in recent browsers, and an effect may only return its cleanup.
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  async function run() {
    if (dirty && !(await save())) return;
    setRunning(true);
    setShowLog(true);
    setPreview(false);
    setLines([]);
    const add = (l: Line) => setLines((all) => [...all, l]);
    try {
      const res = await api.build(view.id, [...(epub ? ["epub"] : []), ...(pdf ? ["pdf"] : [])]);
      await readNdjson<BuildEvent | { t: "error"; error: string }>(res, (e) => {
        if (e.t === "step") add({ text: e.name, level: "step" });
        else if (e.t === "log") add({ text: e.line, level: e.level });
        else if (e.t === "error") add({ text: e.error, level: "error" });
      });
    } catch (err) {
      add({ text: (err as Error).message, level: "error" });
    } finally {
      setRunning(false);
      onBuilt();
    }
  }

  const b = view.build;
  const pdfFile = b?.files.find((f) => f.name.endsWith(".pdf"));
  const problems = lines.filter((l) => l.level === "error" || l.level === "warn").length;

  return (
    <div className="export-tab">
      <section className="panel">
        <h2>Export</h2>
        <div className="row">
          <label className="toggle inline">
            <input type="checkbox" checked={epub} onChange={(e) => setEpub(e.target.checked)} /> EPUB
          </label>
          <label className="toggle inline">
            <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} /> PDF
          </label>
          <button type="button" className="primary big" disabled={running || (!epub && !pdf)} onClick={() => void run()}>
            {running ? "Exporting…" : dirty ? "Save and export" : "Export"}
          </button>
        </div>
        {(lines.length > 0 || running) && (
          <div className="log-wrap">
            <button type="button" className="link" onClick={() => setShowLog((s) => !s)}>
              {showLog ? "Hide" : "Show"} the log{problems > 0 && ` (${problems} warnings or errors)`}
            </button>
            {showLog && (
              <div className="log">
                {lines.map((l, i) => (
                  <div key={i} className={`log-${l.level}`}>
                    {l.level === "step" ? `→ ${l.text}` : l.text}
                  </div>
                ))}
                {running && <div className="log-step">…</div>}
                <div ref={logEnd} />
              </div>
            )}
          </div>
        )}
      </section>

      {b && (
        <section className="panel">
          <h2>Last export</h2>
          <p className={b.ok ? "notice" : "error"}>
            {b.ok ? "Finished" : "Finished with errors"} {new Date(b.at).toLocaleString()} · {b.words.toLocaleString("en")} words
            {b.pdfPages ? ` · PDF ${b.pdfPages} pages` : ""}
            {b.epubcheck &&
              ` · epubcheck: ${b.epubcheck.fatals + b.epubcheck.errors === 0 ? "valid" : `${b.epubcheck.fatals + b.epubcheck.errors} errors`}${b.epubcheck.warnings ? `, ${b.epubcheck.warnings} warnings` : ""}`}
          </p>
          <ul className="files">
            {b.files.map((f) => (
              <li key={f.name}>
                <a href={`${base(view.id)}/files/${f.name}`} download>
                  {f.name}
                </a>
                <span className="muted">{size(f.size)}</span>
              </li>
            ))}
            <li>
              <a href={`${base(view.id)}/files/build.log?inline`} target="_blank" rel="noreferrer">
                build.log
              </a>
            </li>
          </ul>
          {pdfFile && (
            <>
              <button type="button" className="link" onClick={() => setPreview((p) => !p)}>
                {preview ? "Hide" : "Preview"} the PDF
              </button>
              {preview && <iframe className="pdf-preview" title="PDF preview" src={`${base(view.id)}/files/${pdfFile.name}?inline&v=${b.at}`} />}
            </>
          )}
        </section>
      )}
    </div>
  );
}
