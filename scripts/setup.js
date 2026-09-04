#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SUPPORT = path.join(process.env.HOME, "Library/Application Support/HotSpot/StreamDock");
const APP = "/Applications/Stream Controller.app";

function run(script) {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", script)], {
    stdio: "inherit",
    cwd: ROOT,
  });
}

function main() {
  console.log("Soundboard-Setup — Sounds laden und Dock-Seite bauen\n");
  run("sync.js");

  if (!fs.existsSync(APP) && !fs.existsSync(SUPPORT)) {
    console.log("\nStream Controller fehlt noch.");
    console.log("1. Stream Controller installieren (HotSpot Stream Dock)");
    console.log("2. Dock anschließen und die App einmal öffnen");
    console.log("3. Hier erneut: npm run setup");
    process.exit(0);
  }

  run("install-streamdock-page.js");
  console.log("\nFertig.");
  console.log("Stream Controller mit Cmd+Q beenden und neu öffnen.");
  console.log("Seite „Soundboard“ wählen — dann einfach die Tasten drücken.");
  console.log("Sync auf dem Dock holt später neue Pads aus dem Team-Board.");
}

main();
