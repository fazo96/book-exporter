"use client";

import { useState } from "react";
import type { Custom } from "./Book";
import { Area } from "./fields";

const FILES: { key: keyof Custom; label: string; file: string; intro: React.ReactNode; placeholder: string }[] = [
  {
    key: "css",
    label: "EPUB stylesheet",
    file: "custom.css",
    intro: (
      <>
        Added after the stylesheet made from the Layout settings, so it wins ties. Style what the export emits: <code>h1.part</code>, <code>h1.chapter</code>/<code>h2.chapter</code>,{" "}
        <code>.chapter-number</code>, <code>.scene-break</code>, <code>.epigraph</code>, <code>.attribution</code>, <code>.matter-copyright</code>, <code>.titlepage</code>… and your own classes from
        fenced divs in the manuscript (<code>::: {"{.letter}"}</code>) or spans (<code>[text]{"{.sign}"}</code>).
      </>
    ),
    placeholder: "/* e.g. a drop cap on each chapter's first paragraph */\nh2.chapter + p::first-letter {\n  font-size: 3em;\n  float: left;\n  line-height: 0.9;\n  margin-right: 0.05em;\n}",
  },
  {
    key: "typ",
    label: "PDF (Typst)",
    file: "custom.typ",
    intro: (
      <>
        Typst code added after the PDF's setup, before the book: add <code>#set</code> and <code>#show</code> rules, or redefine the functions the filter calls (<code>part-page</code>,{" "}
        <code>chapter-opener</code>, <code>scene-title</code>, <code>scene-break</code>, <code>epigraph</code>, <code>matter-page</code>, <code>title-page</code>, <code>end-mark</code>). The settings
        are in <code>cfg</code> (<code>cfg.title</code>, <code>cfg.body-font</code>…). The source is in <code>assets/book.typ</code>.
      </>
    ),
    placeholder: '// e.g. ragged-right text in the PDF only\n#set par(justify: false)\n\n// or a different scene break\n#let scene-break() = align(center, block(above: 1.4em, below: 1.4em)[§])',
  },
  {
    key: "lua",
    label: "Pandoc filter (Lua)",
    file: "filter.lua",
    intro: (
      <>
        A pandoc Lua filter run after the built-in one (<code>assets/book.lua</code>), for both formats; <code>FORMAT</code> is <code>epub3</code> or <code>typst</code>. Use it for rules
        particular to this book: emit <code>pandoc.RawBlock(&quot;typst&quot;, …)</code> calls to functions you define in custom.typ, and divs with classes you style in custom.css. It runs
        with your user&apos;s permissions, like any script.
      </>
    ),
    placeholder:
      '-- e.g. set every paragraph that is only "THE END" as the end mark\nfunction Para(p)\n  if pandoc.utils.stringify(p) == "THE END" then\n    return pandoc.Div({ p }, { class = "the-end" })\n  end\nend',
  },
];

/** The project's own files: custom.css, custom.typ and filter.lua. */
export default function CustomTab({ custom, setCustom }: { custom: Custom; setCustom: (k: keyof Custom, text: string) => void }) {
  const [which, setWhich] = useState<keyof Custom>("css");
  const f = FILES.find((x) => x.key === which)!;
  return (
    <section className="panel custom-tab">
      <div className="subtabs">
        {FILES.map((x) => (
          <button key={x.key} type="button" className={x.key === which ? "active" : undefined} onClick={() => setWhich(x.key)}>
            {x.label}
            {custom[x.key].trim() && <span className="dot on" />}
          </button>
        ))}
      </div>
      <h2>
        <code>{f.file}</code>
      </h2>
      <p className="intro">{f.intro}</p>
      <Area mono rows={24} value={custom[which]} placeholder={f.placeholder} onChange={(text) => setCustom(which, text)} />
    </section>
  );
}
