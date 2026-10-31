"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BookConfig } from "@/lib/config";
import type { ProjectView } from "@/lib/view";
import CustomTab from "./CustomTab";
import ExportTab from "./ExportTab";
import LayoutTab from "./LayoutTab";
import ManuscriptTab from "./ManuscriptTab";
import MatterTab from "./MatterTab";
import MetadataTab from "./MetadataTab";

// A book's page. The settings, the front and back matter and the custom files
// are drafts here until Save (or Export, which saves first); the manuscript
// and the cover are saved the moment they're replaced.

const TABS = [
  ["manuscript", "Manuscript"],
  ["book", "Book"],
  ["layout", "Layout"],
  ["matter", "Front & back"],
  ["custom", "Custom"],
  ["export", "Export"],
] as const;
type Tab = (typeof TABS)[number][0];

export type Custom = ProjectView["custom"];
export type Update = (fn: (c: BookConfig) => BookConfig) => void;

export default function Book({ initial }: { initial: ProjectView }) {
  const id = initial.id;
  const [view, setView] = useState(initial);
  const [config, setConfig] = useState(initial.config);
  const [matter, setMatter] = useState(initial.matter);
  const [custom, setCustom] = useState(initial.custom);
  const [tab, setTab] = useState<Tab>("manuscript");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The tab lives in the URL's hash, so a reload (or a link) opens it again.
  useEffect(() => {
    const fromHash = () => {
      const h = location.hash.slice(1);
      if (TABS.some(([t]) => t === h)) setTab(h as Tab);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const configDirty = JSON.stringify(config) !== JSON.stringify(view.config);
  const matterDirty = Object.keys(matter).filter((m) => matter[m] !== view.matter[m]);
  const customDirty = (Object.keys(custom) as (keyof Custom)[]).filter((k) => custom[k] !== view.custom[k]);
  const dirty = configDirty || matterDirty.length > 0 || customDirty.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Reload the book; drafts that match what was saved follow the new state, unsaved ones stay. */
  const refresh = useCallback(
    async (opts: { resetDrafts?: boolean } = {}) => {
      const next = await api.get<ProjectView>(id);
      setView(next);
      if (opts.resetDrafts) {
        setConfig(next.config);
        setMatter(next.matter);
        setCustom(next.custom);
      } else {
        // Keep edits in progress; pick up sections added or removed elsewhere.
        setMatter((m) => Object.fromEntries(Object.keys(next.matter).map((k) => [k, m[k] ?? next.matter[k]])));
      }
      return next;
    },
    [id],
  );

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      if (configDirty) await api.saveConfig(id, config);
      for (const m of matterDirty) await api.saveMatter(id, m, matter[m]);
      for (const k of customDirty) await api.saveCustom(id, k, custom[k]);
      await refresh({ resetDrafts: true });
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, config, matter, custom, configDirty, matterDirty, customDirty, refresh]);

  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !saving) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save]);

  async function duplicate() {
    if (dirty && !(await save())) return;
    if (!confirm("Make a copy of this book? It gets the settings, manuscript, front and back matter, custom files and cover, and a new identifier (a different edition); not the versions or exports.")) return;
    try {
      const { id: copy } = await api.clone(id);
      location.href = `/b/${copy}`;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const update: Update = (fn) => setConfig((c) => fn(c));

  /** Matter sections are added and removed on the server at once (they own files); the rest of the draft is kept. */
  const matterChanged = (next: BookConfig) => {
    setView((v) => ({ ...v, config: { ...v.config, matter: next.matter } }));
    setConfig((c) => ({ ...c, matter: next.matter.map((m) => c.matter.find((d) => d.id === m.id) ?? m) }));
    void refresh();
  };

  return (
    <div className="book">
      <header className="topbar">
        <a href="/" className="back" aria-label="Library">
          ←
        </a>
        <h1 title={config.metadata.title}>{config.metadata.title || "Untitled"}</h1>
        <button type="button" disabled={saving} onClick={() => void duplicate()}>
          Duplicate
        </button>
        <span className={`save-state${dirty ? " dirty" : ""}`}>{saving ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
        <button type="button" className="primary" disabled={!dirty || saving} onClick={() => void save()}>
          Save
        </button>
      </header>
      <nav className="tabs">
        {TABS.map(([t, label]) => (
          <a key={t} href={`#${t}`} className={t === tab ? "active" : undefined} onClick={() => setTab(t)}>
            {label}
            {t === "matter" && matterDirty.length > 0 && <span className="dot" />}
            {t === "custom" && customDirty.length > 0 && <span className="dot" />}
          </a>
        ))}
      </nav>
      {error && (
        <p className="error banner">
          {error}{" "}
          <button type="button" className="link" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      <main className="tab-body">
        {tab === "manuscript" && <ManuscriptTab view={view} structure={config.structure} onChanged={() => void refresh()} />}
        {tab === "book" && <MetadataTab view={view} config={config} update={update} onCoverChanged={() => void refresh()} />}
        {tab === "layout" && <LayoutTab config={config} update={update} />}
        {tab === "matter" && (
          <MatterTab
            id={id}
            config={config}
            update={update}
            bodies={matter}
            setBody={(m, body) => setMatter((all) => ({ ...all, [m]: body }))}
            onSectionsChanged={matterChanged}
          />
        )}
        {tab === "custom" && <CustomTab custom={custom} setCustom={(k, text) => setCustom((c) => ({ ...c, [k]: text }))} />}
        {tab === "export" && <ExportTab view={view} dirty={dirty} save={save} onBuilt={() => void refresh()} />}
      </main>
    </div>
  );
}
