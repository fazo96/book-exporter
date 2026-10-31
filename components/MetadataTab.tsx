"use client";

import { useRef, useState } from "react";
import { api, base } from "@/lib/api";
import { type BookConfig, rightsLine } from "@/lib/config";
import type { ProjectView } from "@/lib/view";
import type { Update } from "./Book";
import { Area, Field, Section, Select, Text } from "./fields";

const lines = (v: string[]) => v.join("\n");
// Kept as typed (blank lines included, or Enter would do nothing); blanks are dropped at export.
const unlines = (v: string) => v.split("\n");

/** The book's metadata (what the EPUB's package and the PDF's title page say) and its cover. */
export default function MetadataTab({ view, config, update, onCoverChanged }: { view: ProjectView; config: BookConfig; update: Update; onCoverChanged: () => void }) {
  const m = config.metadata;
  const set = (patch: Partial<BookConfig["metadata"]>) => update((c) => ({ ...c, metadata: { ...c.metadata, ...patch } }));
  const authors = m.authors.length ? m.authors : [{ name: "", fileAs: "" }];
  const setAuthor = (i: number, patch: Partial<BookConfig["metadata"]["authors"][number]>) =>
    set({ authors: authors.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <div>
      <Section title="Title and author">
        <Field label="Title" wide>
          <Text value={m.title} onChange={(title) => set({ title })} />
        </Field>
        <Field label="Subtitle" wide>
          <Text value={m.subtitle} onChange={(subtitle) => set({ subtitle })} />
        </Field>
        {authors.map((a, i) => (
          <div className="author-row wide" key={i}>
            <Field label={i === 0 ? "Author" : `Author ${i + 1}`}>
              <Text value={a.name} onChange={(name) => setAuthor(i, { name })} />
            </Field>
            <Field label="Sorted as" hint="How a library files the name">
              <Text value={a.fileAs} placeholder={a.name.includes(" ") ? `${a.name.split(" ").pop()}, ${a.name.split(" ").slice(0, -1).join(" ")}` : ""} onChange={(fileAs) => setAuthor(i, { fileAs })} />
            </Field>
            {authors.length > 1 && (
              <button type="button" className="link" onClick={() => set({ authors: authors.filter((_, j) => j !== i) })}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div className="wide">
          <button type="button" className="link" onClick={() => set({ authors: [...authors, { name: "", fileAs: "" }] })}>
            + Add an author
          </button>
        </div>
        <Field label="Series">
          <Text value={m.series.name} onChange={(name) => set({ series: { ...m.series, name } })} />
        </Field>
        <Field label="Number in series">
          <Text value={m.series.number} onChange={(number) => set({ series: { ...m.series, number } })} />
        </Field>
      </Section>

      <Section title="Publication">
        <Field label="Publisher">
          <Text value={m.publisher} onChange={(publisher) => set({ publisher })} />
        </Field>
        <Field label="Year">
          <Text value={m.year} onChange={(year) => set({ year })} />
        </Field>
        <Field label="Language" hint="A language tag: en-US, en-GB, it…">
          <Text value={m.language} onChange={(language) => set({ language })} />
        </Field>
        <Field label="Rights" wide hint="Empty: written from the year and the authors">
          <Text value={m.rights} placeholder={rightsLine({ ...config, metadata: { ...m, rights: "" } })} onChange={(rights) => set({ rights })} />
        </Field>
        <Field label="Identifier" hint="Keep it for the life of this edition: a new one makes e-readers shelve an update as a different book">
          <Select
            value={m.identifier.scheme}
            options={[
              ["UUID", "UUID"],
              ["ISBN", "ISBN"],
            ]}
            onChange={(scheme) => set({ identifier: { ...m.identifier, scheme } })}
          />
        </Field>
        <Field label={m.identifier.scheme === "ISBN" ? "ISBN" : "UUID"}>
          <Text value={m.identifier.value} spellCheck={false} onChange={(value) => set({ identifier: { ...m.identifier, value } })} />
        </Field>
      </Section>

      <Section title="Description and subjects" intro="What a store or a library shows. Blank lines separate the description's paragraphs.">
        <Field label="Description" wide>
          <Area value={m.description} rows={8} onChange={(description) => set({ description })} />
        </Field>
        <Field label="Subjects" hint="One per line. A BISAC code first (FIC028150 FICTION / Science Fiction / …) is kept as a code">
          <Area value={lines(m.subjects)} rows={4} onChange={(v) => set({ subjects: unlines(v) })} />
        </Field>
        <Field label="Keywords" hint="One per line">
          <Area value={lines(m.keywords)} rows={4} onChange={(v) => set({ keywords: unlines(v) })} />
        </Field>
      </Section>

      <Cover view={view} onChanged={onCoverChanged} />
    </div>
  );
}

function Cover({ view, onChanged }: { view: ProjectView; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      await api.uploadCover(view.id, file);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Cover" intro="PNG, JPEG, WebP or SVG. The EPUB gets a raster of it (1600 × 2560 is the store size); the PDF opens with it as a full page.">
      <div className="cover-edit wide">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target; the Upload button does the same by keyboard */}
        <div
          className="cover-preview"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) void upload(file);
          }}
        >
          {view.cover ? <img src={`${base(view.id)}/cover?v=${view.cover.mtime}`} alt="The cover" /> : <span className="muted">No cover. Drop an image here.</span>}
        </div>
        <div className="row">
          <button type="button" className="primary" disabled={busy} onClick={() => input.current?.click()}>
            {view.cover ? "Replace…" : "Upload…"}
          </button>
          {view.cover && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Remove the cover?")) return;
                await api.deleteCover(view.id);
                onChanged();
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
        {error && <p className="error">{error}</p>}
      </div>
    </Section>
  );
}
