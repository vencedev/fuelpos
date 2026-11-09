import assert from "node:assert/strict";
import test from "node:test";
import {
  isActiveStationOwner,
  parsePinChangePayload,
} from "./pinChange.ts";

test("accepts a new PIN only when it is different and confirmation matches", () => {
  const request = {
    currentPin: "1234",
    newPin: "567890",
    confirmPin: "567890",
  };

  assert.deepEqual(parsePinChangePayload(request), request);
});

test("rejects malformed or mismatched PIN change requests", () => {
  const valid = {
    currentPin: "1234",
    newPin: "5678",
    confirmPin: "5678",
  };

  for (const request of [
    { ...valid, currentPin: "12" },
    { ...valid, newPin: "123" },
    { ...valid, newPin: "12a4" },
    { ...valid, confirmPin: "5679" },
    { ...valid, newPin: "1234", confirmPin: "1234" },
    null,
  ]) {
    assert.equal(parsePinChangePayload(request), null);
  }
});

test("allows only an active owner to change their own station PIN", () => {
  const attendants = [
    { id: "owner", role: "owner", active: true },
    { id: "manager", role: "manager", active: true },
    { id: "suspended-owner", role: "owner", active: false },
  ];

  assert.equal(isActiveStationOwner(attendants, "owner"), true);
  assert.equal(isActiveStationOwner(attendants, "manager"), false);
  assert.equal(isActiveStationOwner(attendants, "suspended-owner"), false);
  assert.equal(isActiveStationOwner(attendants, "unknown"), false);
});
