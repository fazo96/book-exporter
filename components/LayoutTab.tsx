"use client";

import { type BookConfig, type Numbering, SCENE_BREAKS, TRIMS, type Trim } from "@/lib/config";
import { FONTS } from "@/lib/fonts";
import type { Update } from "./Book";
import { Field, Num, Section, Select, Text, Toggle } from "./fields";

const LEVELS: [number, string][] = [1, 2, 3, 4, 5, 6].map((n) => [n, `${"#".repeat(n)} (level ${n})`]);
const NUMBERINGS: [Numbering, string][] = [
  ["none", "Not numbered"],
  ["arabic", "1, 2, 3"],
  ["roman", "I, II, III"],
  ["words", "One, Two, Three"],
];

const fontOptions = (kinds: string[]): [string, string][] => FONTS.filter((f) => kinds.includes(f.kind)).map((f) => [f.id, `${f.name}${f.kind === "sans" ? " (sans)" : ""}`]);

/** How the manuscript's markdown becomes a book: structure, type, the PDF's page and the EPUB's options. */
export default function LayoutTab({ config, update }: { config: BookConfig; update: Update }) {
  const s = config.structure;
  const t = config.typography;
  const p = config.pdf;
  const e = config.epub;
  const setS = (patch: Partial<typeof s>) => update((c) => ({ ...c, structure: { ...c.structure, ...patch } }));
  const setT = (patch: Partial<typeof t>) => update((c) => ({ ...c, typography: { ...c.typography, ...patch } }));
  const setP = (patch: Partial<typeof p>) => update((c) => ({ ...c, pdf: { ...c.pdf, ...patch } }));
  const setE = (patch: Partial<typeof e>) => update((c) => ({ ...c, epub: { ...c.epub, ...patch } }));
  const setMargin = (k: keyof typeof p.margins, v: number) => setP({ margins: { ...p.margins, [k]: v } });

  return (
    <div>
      <Section
        title="Structure"
        intro={
          <>
            Which headings are parts, chapters and scenes. pen writes <code>#</code> for the title, <code>##</code> parts, <code>###</code> chapters and <code>####</code> scenes; headings above the
            part and chapter levels are taken as the title and dropped.
          </>
        }
      >
        <Field label="Parts">
          <Select value={s.partLevel} options={[[0, "No parts"], ...LEVELS]} onChange={(partLevel) => setS({ partLevel })} />
        </Field>
        <Field label="Chapters">
          <Select value={s.chapterLevel} options={LEVELS} onChange={(chapterLevel) => setS({ chapterLevel })} />
        </Field>
        <Field label="Scenes">
          <Select value={s.sceneLevel} options={[[0, "No scene headings"], ...LEVELS]} onChange={(sceneLevel) => setS({ sceneLevel })} />
        </Field>
        <Field label="Scene headings become">
          <Select
            value={s.sceneHeadings}
            options={[
              ["break", "A scene break"],
              ["show", "A small title"],
              ["hide", "Nothing"],
            ]}
            onChange={(sceneHeadings) => setS({ sceneHeadings })}
          />
        </Field>
        <Field label="Part numbers">
          <Select value={s.partNumbering} options={NUMBERINGS} onChange={(partNumbering) => setS({ partNumbering })} />
        </Field>
        <Field label="Part label" hint={'Before the number ("Part One"); empty for the number alone'}>
          <Text value={s.partLabel} onChange={(partLabel) => setS({ partLabel })} />
        </Field>
        <Field label="Chapter numbers">
          <Select value={s.chapterNumbering} options={NUMBERINGS} onChange={(chapterNumbering) => setS({ chapterNumbering })} />
        </Field>
        <Field label="Chapter label">
          <Text value={s.chapterLabel} onChange={(chapterLabel) => setS({ chapterLabel })} />
        </Field>
        <Field label="Scene break" hint="For ---, *** or ⁂ in the manuscript (and scene headings set to become one)">
          <Select
            value={s.sceneBreak}
            options={[...(Object.entries(SCENE_BREAKS) as [BookConfig["structure"]["sceneBreak"], string][]).map(([k, g]): [typeof k, string] => [k, g]), ["space", "Blank space"], ["custom", "Custom…"]]}
            onChange={(sceneBreak) => setS({ sceneBreak })}
          />
        </Field>
        {s.sceneBreak === "custom" && (
          <Field label="Custom break">
            <Text value={s.sceneBreakCustom} onChange={(sceneBreakCustom) => setS({ sceneBreakCustom })} />
          </Field>
        )}
        <Field label="After the story">
          <Select
            value={s.endMark}
            options={[
              ["none", "Nothing"],
              ["ornament", "The scene-break ornament"],
              ["text", "Text…"],
            ]}
            onChange={(endMark) => setS({ endMark })}
          />
        </Field>
        {s.endMark === "text" && (
          <Field label="End text">
            <Text value={s.endMarkText} onChange={(endMarkText) => setS({ endMarkText })} />
          </Field>
        )}
        <Field label="Contents depth">
          <Select
            value={s.tocDepth}
            options={[
              [1, "Top level only"],
              [2, "Parts and chapters"],
              [3, "With scene titles"],
            ]}
            onChange={(tocDepth) => setS({ tocDepth })}
          />
        </Field>
        <div className="toggles wide">
          <Toggle label="Table of contents page" checked={s.toc} onChange={(toc) => setS({ toc })} hint="The EPUB always has its navigation; this adds a visible page" />
          <Toggle label="Epigraphs" checked={s.epigraphs} onChange={(epigraphs) => setS({ epigraphs })} hint="A > quote right after a part or chapter heading is set as its epigraph; a — Source line after it is its attribution" />
          <Toggle label="Strip comments" checked={s.stripComments} onChange={(stripComments) => setS({ stripComments })} hint="%% Obsidian comments %% and <!-- HTML comments -->" />
          <Toggle label="Allow raw HTML" checked={s.rawHtml} onChange={(rawHtml) => setS({ rawHtml })} hint="Off: <ERROR> in prose stays text" />
        </div>
      </Section>

      <Section title="Typography">
        <Field label="Body face">
          <Select value={t.bodyFont} options={fontOptions(["serif", "sans"])} onChange={(bodyFont) => setT({ bodyFont })} />
        </Field>
        <Field label="Heading face">
          <Select value={t.headingFont} options={fontOptions(["serif", "sans"])} onChange={(headingFont) => setT({ headingFont })} />
        </Field>
        <Field label="Code face">
          <Select value={t.monoFont} options={fontOptions(["mono"])} onChange={(monoFont) => setT({ monoFont })} />
        </Field>
        <Field label="Body size" hint="The PDF; e-readers let the reader choose">
          <Num value={t.fontSize} step={0.5} min={7} max={18} unit="pt" onChange={(fontSize) => setT({ fontSize })} />
        </Field>
        <Field label="Line height">
          <Num value={t.lineHeight} step={0.05} min={1} max={2.5} onChange={(lineHeight) => setT({ lineHeight })} />
        </Field>
        <Field label="Paragraphs">
          <Select
            value={t.paragraphStyle}
            options={[
              ["indent", "Indented"],
              ["spaced", "Spaced (no indent)"],
            ]}
            onChange={(paragraphStyle) => setT({ paragraphStyle })}
          />
        </Field>
        {t.paragraphStyle === "indent" && (
          <Field label="Indent">
            <Num value={t.indent} step={0.1} min={0} max={5} unit="em" onChange={(indent) => setT({ indent })} />
          </Field>
        )}
        <Field label="Headings">
          <Select
            value={t.headingCase}
            options={[
              ["upper", "Capitals"],
              ["small-caps", "Small capitals"],
              ["as-written", "As written"],
            ]}
            onChange={(headingCase) => setT({ headingCase })}
          />
        </Field>
        <Field label="Heading weight">
          <Select
            value={t.headingWeight}
            options={[
              [300, "Light"],
              [400, "Regular"],
              [700, "Bold"],
            ]}
            onChange={(headingWeight) => setT({ headingWeight })}
          />
        </Field>
        <Field label="Heading letter spacing">
          <Num value={t.headingTracking} step={0.02} min={0} max={0.6} unit="em" onChange={(headingTracking) => setT({ headingTracking })} />
        </Field>
        <Field label="Heading alignment">
          <Select
            value={t.headingAlign}
            options={[
              ["center", "Centered"],
              ["left", "Left"],
            ]}
            onChange={(headingAlign) => setT({ headingAlign })}
          />
        </Field>
        <div className="toggles wide">
          <Toggle label="Justify" checked={t.justify} onChange={(justify) => setT({ justify })} />
          <Toggle label="Hyphenate" checked={t.hyphenate} onChange={(hyphenate) => setT({ hyphenate })} />
        </div>
      </Section>

      <Section title="PDF page">
        <Field label="Page size">
          <Select value={p.trim} options={[...(Object.entries(TRIMS) as [Trim, { label: string }][]).map(([k, v]): [Trim, string] => [k, v.label]), ["custom", "Custom…"]]} onChange={(trim) => setP({ trim })} />
        </Field>
        {p.trim === "custom" && (
          <>
            <Field label="Width">
              <Num value={p.width} min={50} max={500} unit="mm" onChange={(width) => setP({ width })} />
            </Field>
            <Field label="Height">
              <Num value={p.height} min={50} max={700} unit="mm" onChange={(height) => setP({ height })} />
            </Field>
          </>
        )}
        <Field label="Running heads">
          <Select
            value={p.runningHeads}
            options={[
              ["none", "None"],
              ["title-chapter", "Title / chapter"],
              ["author-title", "Author / title"],
            ]}
            onChange={(runningHeads) => setP({ runningHeads })}
          />
        </Field>
        <Field label="Top margin">
          <Num value={p.margins.top} min={0} max={80} unit="mm" onChange={(v) => setMargin("top", v)} />
        </Field>
        <Field label="Bottom margin">
          <Num value={p.margins.bottom} min={0} max={80} unit="mm" onChange={(v) => setMargin("bottom", v)} />
        </Field>
        <Field label="Inside margin" hint="The spine side">
          <Num value={p.margins.inside} min={0} max={80} unit="mm" onChange={(v) => setMargin("inside", v)} />
        </Field>
        <Field label="Outside margin">
          <Num value={p.margins.outside} min={0} max={80} unit="mm" onChange={(v) => setMargin("outside", v)} />
        </Field>
        <div className="toggles wide">
          <Toggle label="Page numbers" checked={p.pageNumbers} onChange={(pageNumbers) => setP({ pageNumbers })} hint="From the first page of the story" />
          <Toggle label="Cover page" checked={p.coverPage} onChange={(coverPage) => setP({ coverPage })} hint="When the book has a cover" />
          <Toggle label="Title page" checked={p.titlePage} onChange={(titlePage) => setP({ titlePage })} />
          <Toggle label="Open chapters on a right-hand page" checked={p.openRecto} onChange={(openRecto) => setP({ openRecto })} hint="For print: leaves a blank page where needed" />
        </div>
      </Section>

      <Section title="EPUB">
        <div className="toggles wide">
          <Toggle label="Title page" checked={e.titlePage} onChange={(titlePage) => setE({ titlePage })} />
          <Toggle label="Embed the fonts" checked={e.embedFonts} onChange={(embedFonts) => setE({ embedFonts })} hint="Readers that allow publisher fonts show the book in its faces" />
          <Toggle label="Store cover JPEG" checked={e.coverJpeg} onChange={(coverJpeg) => setE({ coverJpeg })} hint="Also export the cover as the sRGB JPEG that KDP and other stores take" />
        </div>
      </Section>
    </div>
  );
}
