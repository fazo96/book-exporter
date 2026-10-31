"use client";

// The form controls every settings tab uses: a label, the control, an optional
// hint. Controlled: each takes a value and calls `onChange` with the new one.

import type { ReactNode } from "react";

export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the child passed in
    <label className={`field${wide ? " wide" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Text({ value, onChange, placeholder, ...rest }: { value: string; onChange: (v: string) => void; placeholder?: string; spellCheck?: boolean }) {
  return <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Area({ value, onChange, rows = 4, mono, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; mono?: boolean; placeholder?: string }) {
  return (
    <textarea
      className={mono ? "mono" : undefined}
      value={value}
      rows={rows}
      placeholder={placeholder}
      spellCheck={!mono}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Tab indents in code; elsewhere it moves on as usual.
        if (!mono || e.key !== "Tab" || e.shiftKey) return;
        e.preventDefault();
        const t = e.currentTarget;
        const { selectionStart: s, selectionEnd: end } = t;
        onChange(`${t.value.slice(0, s)}  ${t.value.slice(end)}`);
        requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
      }}
    />
  );
}

export function Num({ value, onChange, step = 1, min, max, unit }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) {
  return (
    <span className="num">
      <input
        type="number"
        value={Number.isFinite(value) ? value : ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onChange(n);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

export function Select<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <select value={String(value)} onChange={(e) => onChange(options.find(([v]) => String(v) === e.target.value)![0])}>
      {options.map(([v, label]) => (
        <option key={String(v)} value={String(v)}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Section({ title, children, intro }: { title: string; children: ReactNode; intro?: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {intro && <p className="intro">{intro}</p>}
      <div className="grid">{children}</div>
    </section>
  );
}
