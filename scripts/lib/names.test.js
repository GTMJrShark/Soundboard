const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { extFrom, sanitizeLabel, uniqueFilenames, controllerName } = require("./names");

describe("extFrom", () => {
  it("nimmt die Endung aus dem Storage-Pfad", () => {
    assert.equal(extFrom("pad_01/1710000000.mp3"), "mp3");
    assert.equal(extFrom("pad_05/x.m4a"), "m4a");
  });

  it("fällt auf mime zurück", () => {
    assert.equal(extFrom(null, "audio/mpeg"), "mp3");
    assert.equal(extFrom("", "audio/wav"), "wav");
  });
});

describe("sanitizeLabel", () => {
  it("lässt Leerzeichen und Umlaute", () => {
    assert.equal(sanitizeLabel("New Customer"), "New Customer");
    assert.equal(sanitizeLabel("Türöffner"), "Türöffner");
  });

  it("ersetzt Schrägstriche und verbotene Zeichen", () => {
    assert.equal(sanitizeLabel("Turned Churn / Winback"), "Turned Churn - Winback");
    assert.equal(sanitizeLabel("a:b*c?"), "a-b-c-");
  });

  it("fällt ohne Label auf Pad zurück", () => {
    assert.equal(sanitizeLabel(""), "Pad");
    assert.equal(sanitizeLabel("   "), "Pad");
  });
});

describe("uniqueFilenames", () => {
  it("hängt bei Doppel-Labels eine Nummer an", () => {
    const map = uniqueFilenames([
      { id: "pad_01", label: "Churn", storage_path: "a.mp3" },
      { id: "pad_02", label: "Churn", storage_path: "b.mp3" },
    ]);
    assert.equal(map.pad_01, "Churn.mp3");
    assert.equal(map.pad_02, "Churn 2.mp3");
  });

  it("überspringt Pads ohne Datei", () => {
    const map = uniqueFilenames([
      { id: "pad_01", label: "Leer", storage_path: null },
    ]);
    assert.equal(map.pad_01, undefined);
  });
});

describe("controllerName", () => {
  it("ist immer pad_NN.wav", () => {
    assert.equal(controllerName("pad_01"), "pad_01.wav");
    assert.equal(controllerName("pad_12"), "pad_12.wav");
  });
});
