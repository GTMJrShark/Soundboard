#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { readConfig } = require("./lib/config");

function loadConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    return {
      url: process.env.SUPABASE_URL.replace(/\/$/, ""),
      key: process.env.SUPABASE_ANON_KEY,
    };
  }
  return readConfig(fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8"));
}

async function ping(cfg) {
  const url = cfg.url + "/rest/v1/pads?select=id&limit=1";
  const res = await fetch(url, {
    headers: {
      apikey: cfg.key,
      Authorization: "Bearer " + cfg.key,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("keepalive " + res.status + " " + text.slice(0, 200));
  }
  return res.status;
}

async function main() {
  const status = await ping(loadConfig());
  console.log("ok", status, "pads ping");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { loadConfig, ping };
