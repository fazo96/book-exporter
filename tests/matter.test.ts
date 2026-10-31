import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeConfig } from "../lib/config.ts";
import { fillVariables, newSection } from "../lib/matter.ts";

// Front and back matter templates and {{variables}} (lib/matter.ts).

const config = sanitizeConfig({ metadata: { title: "The Book", year: "2026", authors: [{ name: "A. Writer", fileAs: "" }] } });

test("fills variables, leaves unknown ones, and drops lines left empty", () => {
  assert.equal(fillVariables("*{{title}}* by {{ author }}\n\n{{isbn}}\n\n{{nope}}", config), "*The Book* by A. Writer\n\n{{nope}}");
});

test("an ISBN identifier fills {{isbn}}", () => {
  const isbn = sanitizeConfig({ metadata: { identifier: { scheme: "ISBN", value: "978-0-00-000000-0" } } });
  assert.equal(fillVariables("{{isbn}}", isbn), "ISBN 978-0-00-000000-0");
});

test("a new section gets an id not already taken", () => {
  assert.equal(newSection("dedication", []).id, "dedication");
  assert.equal(newSection("dedication", ["dedication", "dedication-2"]).id, "dedication-3");
  assert.equal(newSection("unknown-kind", []).kind, "custom");
});
