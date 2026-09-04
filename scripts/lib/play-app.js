"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function compileApp(dest, lines) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const scpt = dest.replace(/\.app$/, ".applescript");
  fs.writeFileSync(scpt, lines.join("\n") + "\n");
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  execFileSync("osacompile", ["-o", dest, scpt], { stdio: "pipe" });
  return dest;
}

function playApp(wavPath, dest) {
  return compileApp(dest, [
    "do shell script \"/usr/bin/afplay \" & quoted form of " + JSON.stringify(wavPath) + " & \" > /dev/null 2>&1 &\"",
  ]);
}

function stopApp(dest) {
  return compileApp(dest, ['do shell script "killall afplay >/dev/null 2>&1 || true"']);
}

module.exports = { playApp, stopApp };
