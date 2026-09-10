"use strict";

const SOUND_PAGE_ID = "R4SOUND12-7K2M-9P1Q-8N3W-SOUNDBOARDPG1.sdProfile";

// Website is 4 columns, left-to-right. Dock is 6×3 (col,row).
// Sounds occupy cols 0–3; Sync/Stop stack in col 4.
const SOUND_COLS = 4;
const SYNC_KEY = "4,0";
const STOP_KEY = "4,1";

function padKey(index) {
  const col = index % SOUND_COLS;
  const row = Math.floor(index / SOUND_COLS);
  return col + "," + row;
}

function parseDockConfig(plist) {
  const text = String(plist || "");
  const current = text.match(/\[StreamDockCurrentDevice\][\s\S]*?SerialNumber=(\S+)[\s\S]*?Device=(\S+)/);
  const serial = current ? current[1].trim() : "";
  const device = current ? current[2].trim() : "";
  let profilePath = "";
  if (device && serial) {
    const specific = text.match(new RegExp("\\[" + device + serial + "DeviceConfig\\][\\s\\S]*?sdProfilePath=([^\\n]+)"));
    if (specific) profilePath = specific[1].trim();
  }
  if (!profilePath && device) {
    const generic = text.match(new RegExp("\\[" + device + "DeviceConfig\\][\\s\\S]*?sdProfilePath=([^\\n]+)"));
    if (generic) profilePath = generic[1].trim();
  }
  if (!profilePath) {
    const any = text.match(/sdProfilePath=(\/\S+)/);
    if (any) profilePath = any[1].trim();
  }
  return { device, serial, profilePath };
}

module.exports = { parseDockConfig, SOUND_PAGE_ID, padKey, SYNC_KEY, STOP_KEY };
