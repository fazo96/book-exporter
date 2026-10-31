"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, base } from "@/lib/api";
import type { BookConfig } from "@/lib/config";
import type { BookPart } from "@/lib/construct/types";
import type { ProjectView } from "@/lib/view";
import Construct from "./Construct";
import CustomTab from "./CustomTab";
import ExportTab from "./ExportTab";
import LayoutTab from "./LayoutTab";
import ManuscriptTab from "./ManuscriptTab";
import MatterTab from "./MatterTab";
import MetadataTab from "./MetadataTab";
import NotesTab from "./NotesTab";
import { IconConstruct } from "./icons";

// A book's page. The settings, the front and back matter, the custom files
// and the notes are drafts here until Save (or Export, or a message to
// Construct, which save first); the manuscript and the cover are saved the
// moment they're replaced. Construct changes the book on the server: the
// drafts follow its changes, except where the writer has unsaved edits.

const TABS = [
  ["manuscript", "Manuscript"],
  ["book", "Book"],
  ["layout", "Layout"],
  ["matter", "Front & back"],
  ["custom", "Custom"],
  ["notes", "Notes"],
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
  const [notes, setNotes] = useState(initial.notes);
  const [tab, setTab] = useState<Tab>("manuscript");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [constructOpen, setConstructOpen] = useState(false);

  // Construct stays open (or closed) across reloads.
  useEffect(() => {
    try {
      if (initial.ai && localStorage.getItem("bookx-construct") === "open") setConstructOpen(true);
    } catch {}
  }, [initial.ai]);
  const toggleConstruct = useCallback((open: boolean) => {
    setConstructOpen(open);
    try {
      localStorage.setItem("bookx-construct", open ? "open" : "closed");
    } catch {}
  }, []);

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
  const notesDirty = notes !== view.notes;
  const dirty = configDirty || matterDirty.length > 0 || customDirty.length > 0 || notesDirty;

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
        setNotes(next.notes);
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
      if (notesDirty) await api.saveNotes(id, notes);
      await refresh({ resetDrafts: true });
      setNotice(null);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [id, config, matter, custom, notes, configDirty, matterDirty, customDirty, notesDirty, refresh]);

  // What Construct changed, the drafts take, unless the writer has edited them since the last save.
  const latest = useRef({ view, config, matter, custom, notes });
  latest.current = { view, config, matter, custom, notes };
  const constructChanged = useCallback(
    async (parts: BookPart[]) => {
      const next = await api.get<ProjectView>(id).catch(() => null);
      if (!next) return;
      const { view: prev, ...d } = latest.current;
      const kept: string[] = [];
      setView(next);
      if (JSON.stringify(d.config) === JSON.stringify(prev.config)) setConfig(next.config);
      else if (parts.includes("settings")) kept.push("settings");
      const keep = <T extends Record<string, string>>(draft: T, was: T, now: T, what: string) => {
        const out = { ...now };
        for (const k of Object.keys(now) as (keyof T)[]) {
          if (draft[k] !== undefined && draft[k] !== was[k]) {
            out[k] = draft[k];
            if (now[k] !== was[k]) kept.push(what);
          }
        }
        return out;
      };
      setMatter(keep(d.matter, prev.matter, next.matter, "front & back matter"));
      setCustom(keep(d.custom, prev.custom, next.custom, "custom files"));
      if (d.notes === prev.notes) setNotes(next.notes);
      else if (next.notes !== prev.notes) kept.push("notes");
      if (kept.length) {
        setNotice(`Construct changed the ${[...new Set(kept)].join(", ")} while you had unsaved edits there: yours are kept, and Save puts them over Construct's.`);
      }
    },
    [id],
  );

  // Ctrl+Shift+A opens and closes Construct.
  useEffect(() => {
    if (!view.ai) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        toggleConstruct(!constructOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.ai, constructOpen, toggleConstruct]);

  const pdf = view.build?.files.find((f) => f.name.endsWith(".pdf"));

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
    <div className={`book${constructOpen ? " construct-open" : ""}`}>
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
        {view.ai && (
          <button
            type="button"
            className={`construct-toggle${constructOpen ? " is-on" : ""}`}
            onClick={() => toggleConstruct(!constructOpen)}
            aria-pressed={constructOpen}
            title="Construct: typeset the book with an AI agent (Ctrl+Shift+A)"
          >
            <IconConstruct /> Construct
          </button>
        )}
      </header>
      <nav className="tabs">
        {TABS.map(([t, label]) => (
          <a key={t} href={`#${t}`} className={t === tab ? "active" : undefined} onClick={() => setTab(t)}>
            {label}
            {t === "matter" && matterDirty.length > 0 && <span className="dot" />}
            {t === "custom" && customDirty.length > 0 && <span className="dot" />}
            {t === "notes" && notesDirty && <span className="dot" />}
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
      {notice && (
        <p className="notice banner">
          {notice}{" "}
          <button type="button" className="link" onClick={() => setNotice(null)}>
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
        {tab === "notes" && <NotesTab notes={notes} setNotes={setNotes} ai={view.ai} />}
        {tab === "export" && <ExportTab view={view} dirty={dirty} save={save} onBuilt={() => void refresh()} />}
      </main>
      {view.ai && (
        <Construct
          projectId={id}
          open={constructOpen}
          onClose={() => toggleConstruct(false)}
          getContext={() => ({ tab })}
          beforeSend={async () => !dirty || (await save())}
          onChanged={(parts) => void constructChanged(parts)}
          pdf={pdf && view.build ? { url: `${base(id)}/files/${pdf.name}?inline`, at: view.build.at } : null}
        />
      )}
    </div>
  );
}
