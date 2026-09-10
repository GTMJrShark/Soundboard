"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function playCommand(wavPath) {
  return "nohup /usr/bin/afplay " + JSON.stringify(wavPath) + " >/dev/null 2>&1 &";
}

function hideFromDock(appPath) {
  const plist = path.join(appPath, "Contents/Info.plist");
  try {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", "Add :LSUIElement bool true", plist], { stdio: "pipe" });
  } catch {
    execFileSync("/usr/libexec/PlistBuddy", ["-c", "Set :LSUIElement true", plist], { stdio: "pipe" });
  }
}

function compileApp(dest, lines) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const scpt = dest.replace(/\.app$/, ".applescript");
  fs.writeFileSync(scpt, lines.join("\n") + "\n");
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  execFileSync("osacompile", ["-o", dest, scpt], { stdio: "pipe" });
  hideFromDock(dest);
  return dest;
}

function playApp(wavPath, dest) {
  return compileApp(dest, ["do shell script " + JSON.stringify(playCommand(wavPath))]);
}

function stopApp(dest) {
  return compileApp(dest, ['do shell script "killall afplay >/dev/null 2>&1 || true"']);
}

module.exports = { playApp, stopApp, playCommand };
