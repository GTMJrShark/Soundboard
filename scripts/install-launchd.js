#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const LABEL = "de.tanso.soundboard-sync";
const ROOT = path.resolve(__dirname, "..");
const HOME = process.env.HOME;
const plistPath = path.join(HOME, "Library/LaunchAgents", LABEL + ".plist");
const logPath = path.join(HOME, "Library/Logs/soundboard-sync.log");
const uninstall = process.argv.includes("--uninstall");

function run(cmd, args) {
  spawnSync(cmd, args, { stdio: "inherit" });
}

if (uninstall) {
  run("launchctl", ["bootout", "gui/" + process.getuid(), plistPath]);
  if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
  console.log("launchd-Job entfernt.");
  process.exit(0);
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${path.join(ROOT, "scripts/sync.js")}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`;

fs.mkdirSync(path.dirname(plistPath), { recursive: true });
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(plistPath, plist);
run("launchctl", ["bootout", "gui/" + process.getuid(), plistPath]);
run("launchctl", ["bootstrap", "gui/" + process.getuid(), plistPath]);
console.log("Stündlicher Sync aktiv:", plistPath);
console.log("Log:", logPath);
