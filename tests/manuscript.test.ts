import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../lib/config.ts";
import { countWords, hasParts, outline, padRules, stripComments, titleOf, unclosedComment } from "../lib/manuscript.ts";

// Reading a manuscript without pandoc (lib/manuscript.ts).

const S = defaultConfig().structure;

test("strips %% and HTML comments, across lines, but not inside fenced code", () => {
  const md = "Before %% a note %% after.\n\n%%\nmulti\nline\n%%\n\n<!-- html -->Kept.\n\n```\nkeep %% this %%\n```\n";
  const out = stripComments(md);
  assert.equal(out.includes("a note"), false);
  assert.equal(out.includes("multi"), false);
  assert.equal(out.includes("html"), false);
  assert.match(out, /Before\s+after\./);
  assert.match(out, /Kept\./);
  assert.match(out, /keep %% this %%/);
});

test("finds a %% comment that is never closed, by source line", () => {
  assert.equal(unclosedComment("a %% b %%\n\nc"), null);
  assert.equal(unclosedComment("one\n\n```\n%% in code\n```\n\nfour %% open\nmore"), 7);
});

test("pads thematic breaks so pandoc can't read them as setext underlines", () => {
  assert.equal(padRules("Text\n---\nMore"), "Text\n\n---\n\nMore");
  assert.equal(padRules("```\n---\n```"), "```\n---\n```");
  assert.equal(padRules("* * *"), "\n* * *\n");
});

test("reads the outline the way pen writes headings", () => {
  const md = "# Book\n\n## Part One\n\n### Birth\n\nOne two three.\n\n#### A scene\n\nFour five.\n\n```\n## not a heading\n```\n\n### Faith\n\nSix.\n";
  const items = outline(md, S);
  assert.deepEqual(
    items.map((h) => [h.role, h.text]),
    [
      ["title", "Book"],
      ["part", "Part One"],
      ["chapter", "Birth"],
      ["scene", "A scene"],
      ["chapter", "Faith"],
    ],
  );
  assert.equal(items[2].words, 10); // its prose, the scene (heading and prose) and the code block in it
  assert.equal(titleOf(md), "Book");
  assert.equal(hasParts(md, S), true);
  assert.equal(hasParts("### Only chapters", S), false);
});

test("counts words in prose, not markup or comments", () => {
  assert.equal(countWords("# Title\n\nIt's a *small* world. %% not counted %%"), 5);
  assert.equal(countWords(""), 0);
});
