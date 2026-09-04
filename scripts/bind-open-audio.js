#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { controllerName } = require("./lib/names");
const { playApp, stopApp } = require("./lib/play-app");

const ROOT = path.resolve(__dirname, "..");
const SUPPORT = path.join(process.env.HOME, "Library/Application Support/HotSpot/StreamDock");
const DOCK_AUDIO = path.join(SUPPORT, "audio");
const PLAYERS = path.join(ROOT, "scripts/players");
const PAGE = path.join(
  SUPPORT,
  "profiles/YY2O73QY-S3KV-1221-S526-U639QEBWIMDP.sdProfile/profiles",
  "R4SOUND12-7K2M-9P1Q-8N3W-SOUNDBOARDPG1.sdProfile/manifest.json"
);

function main() {
  fs.mkdirSync(PLAYERS, { recursive: true });
  const stop = stopApp(path.join(PLAYERS, "Stop.app"));
  const page = JSON.parse(fs.readFileSync(PAGE, "utf8"));

  for (const action of Object.values(page.Actions)) {
    if (action.UUID === "com.hotspot.streamdock.soundboard.stopaudioplay") {
      action.Name = "Open";
      action.UUID = "com.hotspot.streamdock.system.open";
      action.Settings = { path: stop };
      continue;
    }
    if (action.UUID !== "com.hotspot.streamdock.soundboard.playaudio") continue;
    const wav = action.Settings && action.Settings.filePath;
    const base = wav ? path.basename(wav, ".wav") : null;
    const id = base && /^pad_\d+$/.test(base) ? base : null;
    if (!id) continue;
    const src = path.join(DOCK_AUDIO, controllerName(id));
    const app = playApp(src, path.join(PLAYERS, id + ".app"));
    action.Name = "Open";
    action.UUID = "com.hotspot.streamdock.system.open";
    action.Settings = { path: app };
  }

  fs.writeFileSync(PAGE, JSON.stringify(page, null, 4) + "\n");
  console.log("Play-Audio-Tasten zeigen jetzt auf afplay-Apps in", PLAYERS);
}

main();
