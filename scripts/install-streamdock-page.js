#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { controllerName } = require("./lib/names");
const { padIcon, syncIcon } = require("./lib/pad-icon");
const { playApp, stopApp } = require("./lib/play-app");
const { parseDockConfig, SOUND_PAGE_ID } = require("./lib/streamdock-profile");

const ROOT = path.resolve(__dirname, "..");
const SUPPORT = path.join(process.env.HOME, "Library/Application Support/HotSpot/StreamDock");
const SYNC_APP = path.join(ROOT, "scripts/Soundboard Sync.app");
const CONTROLLER = path.join(ROOT, "sounds/controller");
const DOCK_AUDIO = path.join(SUPPORT, "audio");
const PLUGIN_IMG = "/Applications/Stream Controller.app/Contents/Resources/plugins";

function activeProfileDir() {
  const plistFile = path.join(SUPPORT, "config/StreamDockConfig.plist");
  if (!fs.existsSync(plistFile)) {
    throw new Error("Stream Controller war noch nie geöffnet. App starten, Dock anschließen, dann setup erneut.");
  }
  const cfg = parseDockConfig(fs.readFileSync(plistFile, "utf8"));
  if (!cfg.profilePath || !fs.existsSync(cfg.profilePath)) {
    throw new Error("Kein Dock-Profil gefunden. Stream Controller öffnen, Dock anschließen, dann setup erneut.");
  }
  return cfg;
}

function rid() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const part = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return part(8) + "-" + part(4) + "-" + part(4) + "-" + part(4) + "-" + part(12);
}

function keepId(prev, ...keys) {
  for (const key of keys) {
    if (prev.Actions && prev.Actions[key] && prev.Actions[key].ActionID) return prev.Actions[key].ActionID;
  }
  return rid();
}

function titled(image, title) {
  return {
    Image: image,
    Title: title,
    TitleAlignment: "bottom",
    TitleColor: "#ffffff",
  };
}

function buildSyncApp() {
  const nodeBin = process.execPath;
  const syncJs = path.join(ROOT, "scripts/sync.js");
  const src = [
    "try",
    "  do shell script " + JSON.stringify(nodeBin) + " & \" \" & quoted form of " + JSON.stringify(syncJs),
    '  display notification "Pads aktualisiert" with title "Soundboard"',
    "on error",
    '  display notification "Sync fehlgeschlagen" with title "Soundboard"',
    "end try",
    "",
  ].join("\n");
  const scpt = path.join(ROOT, "scripts/sync-app.applescript");
  fs.writeFileSync(scpt, src);
  if (fs.existsSync(SYNC_APP)) fs.rmSync(SYNC_APP, { recursive: true, force: true });
  execFileSync("osacompile", ["-o", SYNC_APP, scpt], { stdio: "inherit" });
}

function copyWav(padId, destDir) {
  const name = controllerName(padId);
  const src = path.join(CONTROLLER, name);
  const dest = path.join(destDir, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  return dest;
}

function writePadImages(imgDir, pad) {
  const empty = !pad.file;
  const idle = pad.id + ".png";
  const play = pad.id + "_play.png";
  fs.writeFileSync(path.join(imgDir, idle), padIcon({ color: pad.color, empty }));
  fs.writeFileSync(path.join(imgDir, play), padIcon({ color: pad.color, empty, playing: true }));
  return { idle, play };
}

function buildActions(prev, pads, pageDir) {
  const imgDir = path.join(pageDir, "Images");
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(DOCK_AUDIO, { recursive: true });
  const actions = {};
  for (let i = 0; i < 12; i++) {
    const key = Math.floor(i / 3) + "," + (i % 3);
    const pad = pads[i] || { id: "pad_" + String(i + 1).padStart(2, "0"), label: "Pad " + (i + 1), color: (i % 8) + 1 };
    const title = pad.file ? pad.label || pad.id : "";
    const imgs = writePadImages(imgDir, pad);
    const wav = copyWav(pad.id, DOCK_AUDIO);
    copyWav(pad.id, pageDir);
    const player = playApp(wav, path.join(ROOT, "scripts/players", pad.id + ".app"));
    actions[key] = {
      ActionID: keepId(prev, key),
      Controller: "Keypad",
      Name: "Open",
      Settings: { path: player },
      State: 0,
      States: [titled(imgs.idle, title), titled(imgs.play, title)],
      UUID: "com.hotspot.streamdock.system.open",
    };
  }
  const stopPlugin = path.join(PLUGIN_IMG, "com.hotspot.streamdock.soundboard.sdPlugin/Images/btn_stop_play.png");
  fs.writeFileSync(path.join(imgDir, "sync.png"), syncIcon());
  if (fs.existsSync(stopPlugin)) fs.copyFileSync(stopPlugin, path.join(imgDir, "stop.png"));
  else fs.writeFileSync(path.join(imgDir, "stop.png"), padIcon({ color: 7, playing: true }));

  actions["4,0"] = {
    ActionID: keepId(prev, "4,0", "5,0"),
    Controller: "Keypad",
    Name: "Open",
    Settings: { path: SYNC_APP },
    State: 0,
    States: [titled("sync.png", "Sync")],
    UUID: "com.hotspot.streamdock.system.open",
  };
  actions["4,1"] = {
    ActionID: keepId(prev, "5,1"),
    Controller: "Keypad",
    Name: "Open",
    Settings: { path: stopApp(path.join(ROOT, "scripts/players/Stop.app")) },
    State: 0,
    States: [titled("stop.png", "Stop")],
    UUID: "com.hotspot.streamdock.system.open",
  };
  return actions;
}

function main() {
  buildSyncApp();

  const dock = activeProfileDir();
  const parentDir = dock.profilePath;
  const parentFile = path.join(parentDir, "manifest.json");
  const parent = JSON.parse(fs.readFileSync(parentFile, "utf8"));
  const pageId = SOUND_PAGE_ID;
  const pageFile = path.join(parentDir, "profiles", pageId, "manifest.json");
  const board = JSON.parse(fs.readFileSync(path.join(ROOT, "board.json"), "utf8"));
  const prev = fs.existsSync(pageFile) ? JSON.parse(fs.readFileSync(pageFile, "utf8")) : { Actions: {} };

  const page = {
    Actions: buildActions(prev, board.pads || [], path.dirname(pageFile)),
    AppIdentifier: "",
    DeviceModel: parent.DeviceModel || "20GBA9901",
    DeviceSerialNumber: parent.DeviceSerialNumber || dock.serial,
    DeviceUUID: parent.DeviceUUID || dock.device,
    Name: "Soundboard",
    Version: "1.0",
  };

  const parentId = path.basename(parentDir);
  const pages = (parent.Pages && parent.Pages.Pages) || [parentId];
  if (!pages.includes(pageId)) pages.push(pageId);
  parent.Pages = {
    Current: pageId,
    Pages: pages,
  };

  fs.mkdirSync(path.dirname(pageFile), { recursive: true });
  fs.writeFileSync(pageFile, JSON.stringify(page, null, 4) + "\n");
  fs.writeFileSync(parentFile, JSON.stringify(parent, null, 4) + "\n");

  console.log("Aktives Profil:", parent.Name, parentDir);
  console.log("Seite 2:", pageFile);
}

main();
