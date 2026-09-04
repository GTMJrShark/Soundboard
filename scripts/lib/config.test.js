const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readConfig, publicAudioUrl } = require("./config");

describe("readConfig", () => {
  it("liest URL und Key", () => {
    const cfg = readConfig(`window.SOUNDBOARD_CONFIG = {
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "eyJtest",
};`);
    assert.equal(cfg.url, "https://abc.supabase.co");
    assert.equal(cfg.key, "eyJtest");
  });

  it("lehnt Platzhalter ab", () => {
    assert.throws(() => readConfig(`SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co"`));
  });
});

describe("publicAudioUrl", () => {
  it("zeigt auf den public-sounds-Bucket", () => {
    assert.equal(
      publicAudioUrl("https://abc.supabase.co", "pad_01/1.mp3"),
      "https://abc.supabase.co/storage/v1/object/public/sounds/pad_01/1.mp3"
    );
  });
});
