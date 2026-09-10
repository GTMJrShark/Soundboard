const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { playCommand } = require("./play-app");

describe("playCommand", () => {
  it("startet afplay mit nohup und quotet Leerzeichen", () => {
    const cmd = playCommand("/Users/x/Library/Application Support/HotSpot/audio/pad_02.wav");
    assert.match(cmd, /^nohup \/usr\/bin\/afplay "/);
    assert.match(cmd, /Application Support/);
    assert.match(cmd, /&$/);
  });
});
