import assert from "node:assert/strict";
import test from "node:test";

const { createUuid } = await import("./id.ts").catch(() => ({}));

test("uses randomUUID when the browser provides it", () => {
  const expected = "123e4567-e89b-42d3-a456-426614174000";
  const value = createUuid?.({
    randomUUID: () => expected,
    getRandomValues: (bytes) => bytes,
  });

  assert.equal(value, expected);
});

test("creates a valid UUID when randomUUID is unavailable", () => {
  const value = createUuid?.({
    getRandomValues: (bytes) => {
      bytes.fill(0);
      return bytes;
    },
  });

  assert.equal(value, "00000000-0000-4000-8000-000000000000");
});
