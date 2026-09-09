const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("./keepalive");

describe("loadConfig", () => {
  it("nimmt Env vor config.js", () => {
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_ANON_KEY;
    process.env.SUPABASE_URL = "https://env.supabase.co/";
    process.env.SUPABASE_ANON_KEY = "env-key";
    try {
      const cfg = loadConfig();
      assert.equal(cfg.url, "https://env.supabase.co");
      assert.equal(cfg.key, "env-key");
    } finally {
      if (prevUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = prevUrl;
      if (prevKey === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = prevKey;
    }
  });
});
