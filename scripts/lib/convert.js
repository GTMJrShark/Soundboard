"use strict";

const { spawnSync } = require("child_process");

function convertToWav(src, dest) {
  const af = spawnSync("afconvert", ["-f", "WAVE", "-d", "LEI16@44100", "-c", "1", src, dest], {
    encoding: "utf8",
  });
  if (af.status === 0) return { ok: true, tool: "afconvert" };

  const ff = spawnSync("ffmpeg", ["-y", "-i", src, "-ac", "1", "-ar", "44100", dest], {
    encoding: "utf8",
  });
  if (ff.status === 0) return { ok: true, tool: "ffmpeg" };

  return {
    ok: false,
    error: (af.stderr || af.stdout || ff.stderr || ff.stdout || "afconvert/ffmpeg fehlgeschlagen").trim(),
  };
}

module.exports = { convertToWav };
