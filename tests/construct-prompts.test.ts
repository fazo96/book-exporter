import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentsText, attachmentsUpdate, describeContext, notesText, notesUpdate, promptContextFrom, revertUpdate, systemPrompt } from "../lib/construct/prompts.ts";

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

test("the attachments are listed ahead of the Notes, with their captions, and changes to them heard of", () => {
  const list = attachmentsText([
    { name: "spread.jpg", caption: "The margins." },
    { name: "guide.pdf", caption: "" },
  ]);
  assert.equal(list, "- spread.jpg: The margins.\n- guide.pdf");
  assert.equal(attachmentsText([]), null);
  const prompt = systemPrompt("Book", "Warm.", list);
  assert.match(prompt, /for you to look at \(view_attachment\):\n- spread\.jpg: The margins\.\n- guide\.pdf\n\nThe book's Notes/);
  assert.match(prompt, /"""\nWarm\.\n"""$/, "the Notes still close it");
  assert.doesNotMatch(systemPrompt("Book"), /attached these/);
  assert.equal(attachmentsUpdate(list), "[The book's attachments changed. They are now:\n- spread.jpg: The margins.\n- guide.pdf]");
  assert.equal(attachmentsUpdate(null), "[The book has no attachments now.]");
});
