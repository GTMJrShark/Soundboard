"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseDockConfig, SOUND_PAGE_ID } = require("./streamdock-profile");

const SAMPLE = [
  "[CN001V3Device8730DB783849DeviceConfig]",
  "DeviceUUID=CN001V3Device",
  "sdProfilePath=/Users/boss/Library/Application Support/HotSpot/StreamDock/profiles/ABC.sdProfile",
  "",
  "[CN001V3DeviceDeviceConfig]",
  "sdProfilePath=/Users/boss/Library/Application Support/HotSpot/StreamDock/profiles/FALLBACK.sdProfile",
  "",
  "[StreamDockCurrentDevice]",
  "CN001V3Device\\SerialNumber=8730DB783849",
  "Device=CN001V3Device",
  "",
].join("\n");

test("nimmt das Profil des angesteckten Dock-Serials", () => {
  const cfg = parseDockConfig(SAMPLE);
  assert.equal(cfg.serial, "8730DB783849");
  assert.equal(cfg.device, "CN001V3Device");
  assert.match(cfg.profilePath, /ABC\.sdProfile$/);
});

test("fällt ohne Serial-Block auf DeviceConfig zurück", () => {
  const cfg = parseDockConfig("[CN001V3DeviceDeviceConfig]\nsdProfilePath=/tmp/X.sdProfile\n[StreamDockCurrentDevice]\nDevice=CN001V3Device\n");
  assert.match(cfg.profilePath, /X\.sdProfile$/);
});

test("Soundboard-Seite hat eine feste ID", () => {
  assert.match(SOUND_PAGE_ID, /\.sdProfile$/);
});

test("Pads liegen wie auf der Website: 4er-Reihen, Sync/Stop rechts", () => {
  const { padKey, SYNC_KEY, STOP_KEY } = require("./streamdock-profile");
  assert.equal(padKey(0), "0,0");
  assert.equal(padKey(3), "3,0");
  assert.equal(padKey(4), "0,1");
  assert.equal(padKey(5), "1,1");
  assert.equal(padKey(11), "3,2");
  assert.equal(SYNC_KEY, "4,0");
  assert.equal(STOP_KEY, "4,1");
});
