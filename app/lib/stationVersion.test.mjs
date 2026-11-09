import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStationVersion } from "./stationState.ts";

test("normalizes a database bigint string into a safe integer version", () => {
  assert.equal(normalizeStationVersion("111111111111"), 111111111111);
  assert.equal(normalizeStationVersion(4), 4);
});

test("rejects missing, non-positive, and unsafe station versions", () => {
  for (const value of [undefined, "0", "1.5", "not-a-version", "9007199254740992"]) {
    assert.throws(() => normalizeStationVersion(value), /station version/i);
  }
});
