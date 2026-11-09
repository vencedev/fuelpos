import assert from "node:assert/strict";
import test from "node:test";

const { isTopmostDialog } = await import("./modalStack.ts");

test("only the topmost open dialog handles keyboard events", () => {
  const parentDialog = {};
  const editDialog = {};
  const openDialogs = [parentDialog, editDialog];

  assert.equal(isTopmostDialog(parentDialog, openDialogs), false);
  assert.equal(isTopmostDialog(editDialog, openDialogs), true);
});
