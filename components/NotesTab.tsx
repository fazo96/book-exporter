"use client";

import { Area } from "./fields";

/** The book's Notes: free text, the art direction for its typesetting. Construct reads them with every chat, and keeps them. */
export default function NotesTab({ notes, setNotes, ai }: { notes: string; setNotes: (text: string) => void; ai: boolean }) {
  return (
    <section className="panel notes-tab">
      <h2>Notes</h2>
      <p className="intro">
        Free text about the book&apos;s typesetting: the art direction (the feel you&apos;re after, books whose pages you like, the type and the
        ornaments), decisions made and why, what&apos;s left to do. They go with the book: a copy takes them, an export doesn&apos;t.
        {ai && " Construct follows them in every chat, and notes here what the two of you settle."}
      </p>
      <Area
        rows={24}
        value={notes}
        placeholder={"e.g.\n- Feels like a 1960s Penguin: modest, warm, no flourishes.\n- Chapter openers: number only, small caps, a third of the way down the page.\n- Scene breaks: a single fleuron.\n- Never let a chapter end with a widow."}
        onChange={setNotes}
      />
    </section>
  );
}
