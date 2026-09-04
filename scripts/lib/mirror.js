"use strict";

const { uniqueFilenames } = require("./names");

const RESERVED = new Set([".gitkeep", ".sync-state.json"]);

function planMirror({ pads, existing, state }) {
  const names = uniqueFilenames(pads);
  const existingSet = new Set(existing);
  const downloads = [];
  const renames = [];
  const unchanged = [];
  const desired = new Set();

  for (const pad of pads) {
    const file = names[pad.id];
    if (!file) continue;
    desired.add(file);
    const prev = (state && state[pad.id]) || {};
    const pathSame = prev.storage_path === pad.storage_path;
    if (pathSame && prev.file && prev.file !== file && existingSet.has(prev.file)) {
      renames.push({ from: prev.file, to: file });
      continue;
    }
    if (pathSame && existingSet.has(file)) {
      unchanged.push(file);
      continue;
    }
    downloads.push({
      id: pad.id,
      file,
      storage_path: pad.storage_path,
    });
  }

  const deletes = existing.filter((f) => !RESERVED.has(f) && !desired.has(f) && !renames.some((r) => r.from === f));

  const board = pads.map((pad, i) => ({
    id: pad.id,
    label: pad.label || `Pad ${i + 1}`,
    shortcut: pad.shortcut || "",
    color: pad.color || (i % 8) + 1,
    file: names[pad.id] ? "sounds/" + names[pad.id] : null,
  }));

  return { downloads, deletes, renames, unchanged, board, names };
}

module.exports = { planMirror };
