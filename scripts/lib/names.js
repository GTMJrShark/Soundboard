"use strict";

const MIME_EXT = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/webm": "webm",
  "audio/aac": "aac",
};

function extFrom(storagePath, mime) {
  const fromPath = String(storagePath || "").split(".").pop();
  if (fromPath && fromPath !== storagePath && /^[a-z0-9]{2,5}$/i.test(fromPath)) {
    return fromPath.toLowerCase();
  }
  return MIME_EXT[String(mime || "").toLowerCase()] || "mp3";
}

function sanitizeLabel(label) {
  const s = String(label || "")
    .replace(/[\/\\]/g, "-")
    .replace(/[:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return s || "Pad";
}

function uniqueFilenames(pads) {
  const used = new Map();
  const out = {};
  for (const pad of pads) {
    if (!pad.storage_path) continue;
    const base = sanitizeLabel(pad.label);
    const ext = extFrom(pad.storage_path, pad.mime_type);
    let n = used.get(base) || 0;
    n += 1;
    used.set(base, n);
    out[pad.id] = n === 1 ? `${base}.${ext}` : `${base} ${n}.${ext}`;
  }
  return out;
}

function controllerName(padId) {
  const m = String(padId || "").match(/(\d+)/);
  const n = m ? Number(m[1]) : 0;
  return "pad_" + String(n).padStart(2, "0") + ".wav";
}

module.exports = { extFrom, sanitizeLabel, uniqueFilenames, controllerName };
