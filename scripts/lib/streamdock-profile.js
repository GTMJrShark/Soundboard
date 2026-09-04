"use strict";

const SOUND_PAGE_ID = "R4SOUND12-7K2M-9P1Q-8N3W-SOUNDBOARDPG1.sdProfile";

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

module.exports = { parseDockConfig, SOUND_PAGE_ID };
