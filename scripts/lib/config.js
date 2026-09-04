"use strict";

function readConfig(source) {
  const url = String(source || "").match(/SUPABASE_URL:\s*"([^"]+)"/);
  const key = String(source || "").match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/);
  const out = {
    url: (url && url[1] && !url[1].includes("YOUR_PROJECT")) ? url[1].replace(/\/$/, "") : "",
    key: (key && key[1] && !key[1].includes("YOUR_ANON")) ? key[1] : "",
  };
  if (!out.url || !out.key) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY fehlen in config.js");
  }
  return out;
}

function publicAudioUrl(url, storagePath) {
  return url + "/storage/v1/object/public/sounds/" + encodeURI(storagePath);
}

module.exports = { readConfig, publicAudioUrl };
