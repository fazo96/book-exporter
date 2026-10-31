import assert from "node:assert/strict";
import { test } from "node:test";
import { describeContext, notesText, notesUpdate, promptContextFrom, revertUpdate, systemPrompt } from "../lib/construct/prompts.ts";

// What Construct is told (lib/construct/prompts.ts).

test("a message's context is the tab the writer has open, checked", () => {
  assert.deepEqual(promptContextFrom({ tab: "layout" }), { tab: "layout" });
  assert.deepEqual(promptContextFrom({ tab: "../etc" }), {});
  assert.deepEqual(promptContextFrom(null), {});
  assert.equal(describeContext({ tab: "matter" }), "[The writer has the Front & back tab open.]");
  assert.equal(describeContext({}), "");
});

test("the Notes close the system prompt as the art direction", () => {
  assert.match(systemPrompt("Book"), /"Book"/);
  assert.match(systemPrompt("Book"), /Notes are empty/);
  assert.match(systemPrompt("Book", "  \n"), /Notes are empty/, "blank notes are no notes");
  assert.match(systemPrompt("Book", "Warm and quiet."), /theirs win:\n"""\nWarm and quiet\.\n"""$/);
  assert.match(systemPrompt("Book", "x".repeat(25_000)), /cut short: read_notes has the rest/);
  assert.equal(notesText("  a \n"), "a");
});

test("changes the agent hears of with the next message", () => {
  assert.match(notesUpdate("New."), /^\[The book's Notes changed\. They now read, replacing what you had before:\n"""\nNew\.\n"""\]$/);
  assert.equal(notesUpdate(null), "[The book's Notes are now empty.]");
  assert.match(revertUpdate("Make it bigger"), /before their message "Make it bigger"/);
  assert.match(revertUpdate("x".repeat(300)), /x{200}…"/);
});
