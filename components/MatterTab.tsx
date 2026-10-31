"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { BookConfig, MatterSection } from "@/lib/config";
import { fillVariables, MATTER_KINDS, VARIABLES } from "@/lib/matter";
import type { Update } from "./Book";
import { Area, Field, Select, Text, Toggle } from "./fields";

const STYLES: [MatterSection["style"], string][] = [
  ["plain", "Plain (title and text)"],
  ["centered", "Centered"],
  ["copyright", "Copyright (small, at the foot)"],
  ["dedication", "Dedication (centered, a third down)"],
  ["epigraph", "Epigraph (a quote alone on its page)"],
];

/**
 * The pages before and after the story. Each is markdown with {{variables}}
 * filled at export; its settings save with the book, its text with Save too.
 */
export default function MatterTab({
  id,
  config,
  update,
  bodies,
  setBody,
  onSectionsChanged,
}: {
  id: string;
  config: BookConfig;
  update: Update;
  bodies: Record<string, string>;
  setBody: (mid: string, body: string) => void;
  onSectionsChanged: (next: BookConfig) => void;
}) {
  const [kind, setKind] = useState("dedication");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setSection = (mid: string, patch: Partial<MatterSection>) =>
    update((c) => ({ ...c, matter: c.matter.map((m) => (m.id === mid ? { ...m, ...patch } : m)) }));

  /** Move within its own group (front or back); the groups keep their order around the story. */
  const move = (mid: string, by: -1 | 1) =>
    update((c) => {
      const all = [...c.matter];
      const i = all.findIndex((m) => m.id === mid);
      const group = all.filter((m) => m.placement === all[i].placement);
      const gi = group.findIndex((m) => m.id === mid);
      const swap = group[gi + by];
      if (!swap) return c;
      const j = all.findIndex((m) => m.id === swap.id);
      [all[i], all[j]] = [all[j], all[i]];
      return { ...c, matter: all };
    });

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.addMatter<BookConfig>(id, kind);
      const added = next.matter.find((m) => !config.matter.some((d) => d.id === m.id));
      onSectionsChanged(next);
      if (added) setOpen(added.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: MatterSection) {
    if (!confirm(`Delete “${m.title}”? Its text goes with it.`)) return;
    setBusy(true);
    try {
      onSectionsChanged(await api.deleteMatter<BookConfig>(id, m.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const group = (placement: "front" | "back") => config.matter.filter((m) => m.placement === placement);

  const card = (m: MatterSection, i: number, list: MatterSection[]) => {
    const isOpen = open === m.id;
    return (
      <li key={m.id} className={`matter-card${isOpen ? " open" : ""}`}>
        <div className="matter-head">
          <button type="button" className="matter-title" onClick={() => setOpen(isOpen ? null : m.id)}>
            <span className="chev">{isOpen ? "▾" : "▸"}</span> {fillVariables(m.title, config) || m.kind}
            <span className="muted"> · {STYLES.find(([s]) => s === m.style)?.[1].split(" (")[0]}</span>
            {!m.epub && <span className="badge">no EPUB</span>}
            {!m.pdf && <span className="badge">no PDF</span>}
          </button>
          <span className="row">
            <button type="button" className="icon" disabled={i === 0} onClick={() => move(m.id, -1)} aria-label="Move up">
              ↑
            </button>
            <button type="button" className="icon" disabled={i === list.length - 1} onClick={() => move(m.id, 1)} aria-label="Move down">
              ↓
            </button>
          </span>
        </div>
        {isOpen && (
          <div className="matter-body">
            <div className="grid">
              <Field label="Title">
                <Text value={m.title} onChange={(title) => setSection(m.id, { title })} />
              </Field>
              <Field label="Style">
                <Select value={m.style} options={STYLES} onChange={(style) => setSection(m.id, { style })} />
              </Field>
              <Field label="Place">
                <Select
                  value={m.placement}
                  options={[
                    ["front", "Before the story"],
                    ["back", "After the story"],
                  ]}
                  onChange={(placement) => setSection(m.id, { placement })}
                />
              </Field>
              <div className="toggles wide">
                <Toggle label="Show the title" checked={m.showTitle} onChange={(showTitle) => setSection(m.id, { showTitle })} />
                <Toggle label="In the contents" checked={m.inToc} onChange={(inToc) => setSection(m.id, { inToc })} />
                <Toggle label="EPUB" checked={m.epub} onChange={(epub) => setSection(m.id, { epub })} />
                <Toggle label="PDF" checked={m.pdf} onChange={(pdf) => setSection(m.id, { pdf })} />
              </div>
              <Field label="Text (markdown)" wide>
                <Area value={bodies[m.id] ?? ""} rows={10} onChange={(body) => setBody(m.id, body)} />
              </Field>
            </div>
            <details className="preview">
              <summary>With the variables filled</summary>
              <pre>{fillVariables(bodies[m.id] ?? "", config)}</pre>
            </details>
            <button type="button" className="link danger" disabled={busy} onClick={() => void remove(m)}>
              Delete this section
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="matter-tab">
      <section className="panel">
        <h2>Front and back matter</h2>
        <p className="intro">
          Pages before and after the story, in this order. Their text is markdown and may use{" "}
          {VARIABLES.map((v, i) => (
            <span key={v}>
              {i > 0 && ", "}
              <code>{`{{${v}}}`}</code>
            </span>
          ))}
          , filled at export (a line whose variable is empty is dropped).
        </p>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {MATTER_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          <button type="button" className="primary" disabled={busy} onClick={() => void add()}>
            Add section
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <h3 className="group-label">Before the story</h3>
      <ul className="matter-list">{group("front").map((m, i, list) => card(m, i, list))}</ul>
      {group("front").length === 0 && <p className="muted">Nothing (the title page and contents are set from Layout).</p>}
      <div className="story-marker">The story</div>
      <h3 className="group-label">After the story</h3>
      <ul className="matter-list">{group("back").map((m, i, list) => card(m, i, list))}</ul>
      {group("back").length === 0 && <p className="muted">Nothing yet.</p>}
    </div>
  );
}
