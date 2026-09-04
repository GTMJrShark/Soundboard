const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { planMirror } = require("./mirror");

const pads = [
  { id: "pad_01", label: "Upsell", shortcut: "q", color: 1, storage_path: "pad_01/1.mp3", mime_type: "audio/mpeg" },
  { id: "pad_02", label: "Churn", shortcut: "w", color: 2, storage_path: "pad_02/2.mp3", mime_type: "audio/mpeg" },
  { id: "pad_03", label: "Leer", shortcut: "e", color: 3, storage_path: null },
];

describe("planMirror", () => {
  it("lädt alles beim ersten Sync", () => {
    const plan = planMirror({ pads, existing: [], state: {} });
    assert.deepEqual(plan.downloads.map((d) => d.file).sort(), ["Churn.mp3", "Upsell.mp3"]);
    assert.deepEqual(plan.deletes, []);
    assert.equal(plan.renames.length, 0);
  });

  it("lädt nur geänderte Storage-Pfade", () => {
    const plan = planMirror({
      pads,
      existing: ["Upsell.mp3", "Churn.mp3"],
      state: {
        pad_01: { storage_path: "pad_01/1.mp3", file: "Upsell.mp3" },
        pad_02: { storage_path: "pad_02/ALT.mp3", file: "Churn.mp3" },
      },
    });
    assert.deepEqual(plan.downloads.map((d) => d.id), ["pad_02"]);
    assert.deepEqual(plan.unchanged, ["Upsell.mp3"]);
  });

  it("benennt um, wenn nur das Label wechselt", () => {
    const renamed = [
      { ...pads[0], label: "Upsell Neu" },
      pads[1],
      pads[2],
    ];
    const plan = planMirror({
      pads: renamed,
      existing: ["Upsell.mp3", "Churn.mp3"],
      state: {
        pad_01: { storage_path: "pad_01/1.mp3", file: "Upsell.mp3" },
        pad_02: { storage_path: "pad_02/2.mp3", file: "Churn.mp3" },
      },
    });
    assert.deepEqual(plan.renames, [{ from: "Upsell.mp3", to: "Upsell Neu.mp3" }]);
    assert.equal(plan.downloads.length, 0);
  });

  it("löscht Dateien, die zu keinem Pad mehr gehören", () => {
    const plan = planMirror({
      pads,
      existing: ["Upsell.mp3", "Churn.mp3", "Alt.mp3"],
      state: {
        pad_01: { storage_path: "pad_01/1.mp3", file: "Upsell.mp3" },
        pad_02: { storage_path: "pad_02/2.mp3", file: "Churn.mp3" },
      },
    });
    assert.deepEqual(plan.deletes, ["Alt.mp3"]);
  });

  it("schreibt board.json-Pads mit file-Verweis", () => {
    const plan = planMirror({ pads, existing: [], state: {} });
    assert.equal(plan.board[0].file, "sounds/Upsell.mp3");
    assert.equal(plan.board[2].file, null);
  });
});
