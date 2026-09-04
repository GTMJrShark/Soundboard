#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { readConfig, publicAudioUrl } = require("./lib/config");
const { planMirror } = require("./lib/mirror");
const { controllerName } = require("./lib/names");
const { convertToWav } = require("./lib/convert");
const { silenceWav } = require("./lib/wav");

const ROOT = path.resolve(__dirname, "..");
const SOUNDS = path.join(ROOT, "sounds");
const CONTROLLER = path.join(SOUNDS, "controller");
const STATE_FILE = path.join(SOUNDS, ".sync-state.json");
const DRY = process.argv.includes("--dry-run");

async function fetchPads(cfg) {
  const res = await fetch(cfg.url + "/rest/v1/pads?select=*&order=sort_order.asc", {
    headers: {
      apikey: cfg.key,
      Authorization: "Bearer " + cfg.key,
    },
  });
  if (!res.ok) throw new Error("pads fetch " + res.status + " " + (await res.text()));
  return res.json();
}

async function download(cfg, storagePath, dest) {
  const url = publicAudioUrl(cfg.url, storagePath);
  const res = await fetch(url);
  if (!res.ok) throw new Error("audio " + storagePath + " → " + res.status);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function listSounds() {
  if (!fs.existsSync(SOUNDS)) return [];
  return fs.readdirSync(SOUNDS).filter((n) => {
    const p = path.join(SOUNDS, n);
    return fs.statSync(p).isFile() && n !== ".gitkeep" && n !== ".sync-state.json";
  });
}

function writeBelegung(pads, names) {
  const lines = [
    "Soundboard — Controller-Belegung",
    "Datei          Taste   Label",
    "----------------------------------------",
  ];
  for (const pad of pads) {
    const wav = controllerName(pad.id).padEnd(14);
    const key = String(pad.shortcut || "-").padEnd(7);
    const src = names[pad.id] || "(leer)";
    lines.push(wav + key + (pad.label || "") + "  ←  " + src);
  }
  fs.writeFileSync(path.join(CONTROLLER, "BELEGUNG.txt"), lines.join("\n") + "\n");
}

async function main() {
  const cfg = readConfig(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"));
  const pads = await fetchPads(cfg);
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
  const plan = planMirror({ pads, existing: listSounds(), state });

  console.log(
    DRY ? "Dry-run" : "Sync",
    "—",
    plan.downloads.length,
    "laden,",
    plan.renames.length,
    "umbenennen,",
    plan.deletes.length,
    "löschen,",
    plan.unchanged.length,
    "unverändert"
  );

  if (DRY) {
    plan.downloads.forEach((d) => console.log("  +", d.file));
    plan.renames.forEach((r) => console.log("  ~", r.from, "→", r.to));
    plan.deletes.forEach((f) => console.log("  -", f));
    return;
  }

  fs.mkdirSync(SOUNDS, { recursive: true });
  fs.mkdirSync(CONTROLLER, { recursive: true });

  for (const r of plan.renames) {
    fs.renameSync(path.join(SOUNDS, r.from), path.join(SOUNDS, r.to));
    console.log("  ~", r.from, "→", r.to);
  }
  for (const d of plan.downloads) {
    await download(cfg, d.storage_path, path.join(SOUNDS, d.file));
    console.log("  +", d.file);
  }
  for (const f of plan.deletes) {
    fs.unlinkSync(path.join(SOUNDS, f));
    console.log("  -", f);
  }

  const nextState = {};
  const skipped = [];
  for (const pad of pads) {
    const file = plan.names[pad.id];
    const wav = path.join(CONTROLLER, controllerName(pad.id));
    if (file) {
      nextState[pad.id] = { storage_path: pad.storage_path, file };
      const conv = convertToWav(path.join(SOUNDS, file), wav);
      if (!conv.ok) {
        skipped.push(pad.label + " (" + conv.error.split("\n")[0] + ")");
        fs.writeFileSync(wav, silenceWav(0.25));
      }
    } else {
      fs.writeFileSync(wav, silenceWav(0.25));
    }
  }

  const dockAudio = path.join(process.env.HOME, "Library/Application Support/HotSpot/StreamDock/audio");
  if (fs.existsSync(CONTROLLER)) {
    fs.mkdirSync(dockAudio, { recursive: true });
    for (const pad of pads) {
      const name = controllerName(pad.id);
      const wav = path.join(CONTROLLER, name);
      if (fs.existsSync(wav)) fs.copyFileSync(wav, path.join(dockAudio, name));
    }
  }

  writeBelegung(pads, plan.names);
  fs.writeFileSync(STATE_FILE, JSON.stringify(nextState, null, 2) + "\n");
  fs.writeFileSync(
    path.join(ROOT, "board.json"),
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), pads: plan.board }, null, 2) + "\n"
  );

  console.log("board.json und sounds/controller/ aktualisiert.");
  if (skipped.length) {
    console.log("Nicht controller-tauglich (Stille geschrieben):");
    skipped.forEach((s) => console.log("  !", s));
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
