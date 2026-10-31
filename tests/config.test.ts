import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig, rightsLine, sanitizeConfig } from "../lib/config.ts";

// project.json is always read through sanitizeConfig (lib/config.ts).

test("fills what's missing from the defaults", () => {
  const c = sanitizeConfig({ metadata: { title: "T" } });
  assert.equal(c.metadata.title, "T");
  assert.deepEqual(c.structure, defaultConfig().structure);
});

test("drops what's malformed and clamps numbers", () => {
  const c = sanitizeConfig({
    typography: { bodyFont: "comic-sans", fontSize: 99, headingCase: "shouting" },
    structure: { chapterLevel: 0, partLevel: 9 },
    pdf: { margins: { top: -5 } },
  });
  assert.equal(c.typography.bodyFont, "eb-garamond");
  assert.equal(c.typography.fontSize, 18);
  assert.equal(c.typography.headingCase, "upper");
  assert.equal(c.structure.chapterLevel, 1);
  assert.equal(c.structure.partLevel, 6);
  assert.equal(c.pdf.margins.top, 0);
});

test("keeps the base's values for what a patch leaves out", () => {
  const base = sanitizeConfig({ metadata: { title: "Kept", identifier: { scheme: "UUID", value: "urn:uuid:x" } } });
  const c = sanitizeConfig({ structure: { toc: false } }, base);
  assert.equal(c.metadata.title, "Kept");
  assert.equal(c.metadata.identifier.value, "urn:uuid:x");
  assert.equal(c.structure.toc, false);
});

test("matter sections need a valid, unique id", () => {
  const c = sanitizeConfig({ matter: [{ id: "a" }, { id: "a" }, { id: "../x" }, { id: "b", style: "nope" }] });
  assert.deepEqual(
    c.matter.map((m) => [m.id, m.style]),
    [
      ["a", "plain"],
      ["b", "plain"],
    ],
  );
});

test("writes the rights line from the year and the authors when left empty", () => {
  const c = sanitizeConfig({ metadata: { year: "2026", authors: [{ name: "A. Writer", fileAs: "" }] } });
  assert.equal(rightsLine(c), "© 2026 A. Writer. All rights reserved.");
  assert.equal(rightsLine(sanitizeConfig({ metadata: { year: "2026" } })), "© 2026. All rights reserved.");
});
