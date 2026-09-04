"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { padIcon, SIZE } = require("./pad-icon");

test("pad icon is a PNG of the dock button size", () => {
  const png = padIcon({ color: 1 });
  assert.equal(png[0], 137);
  assert.equal(png.toString("ascii", 1, 4), "PNG");
  assert.equal(png.readUInt32BE(16), SIZE);
  assert.equal(png.readUInt32BE(20), SIZE);
});

test("filled, empty and playing icons differ", () => {
  const a = padIcon({ color: 3, empty: false });
  const b = padIcon({ color: 3, empty: true });
  const c = padIcon({ color: 3, playing: true });
  assert.notEqual(a.compare(b), 0);
  assert.notEqual(a.compare(c), 0);
});

test("website colors 1 and 2 are not the same image", () => {
  assert.notEqual(padIcon({ color: 1 }).compare(padIcon({ color: 2 })), 0);
});

test("sync icon is a distinct PNG, not a pad", () => {
  const { syncIcon } = require("./pad-icon");
  const png = syncIcon();
  assert.equal(png[0], 137);
  assert.notEqual(png.compare(padIcon({ color: 5, playing: true })), 0);
});
