"use client";

import { Marked } from "marked";
import { useMemo } from "react";

// Construct's replies as markdown (from pen).

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Agent replies are markdown. Raw HTML is shown as text; only web links link.
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }) => escapeHtml(text),
    image: ({ text }) => escapeHtml(text),
    link({ href, tokens }) {
      const inner = this.parser.parseInline(tokens);
      return /^https?:\/\//i.test(href)
        ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>`
        : inner;
    },
  },
});

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => md.parse(text, { async: false }), [text]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: md escapes raw HTML and images and only links http(s) URLs (above)
  return <div className="construct-md" dangerouslySetInnerHTML={{ __html: html }} />;
}
