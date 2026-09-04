"use strict";

const zlib = require("zlib");

const COLORS = {
  1: [255, 107, 154],
  2: [255, 181, 71],
  3: [74, 222, 128],
  4: [56, 189, 248],
  5: [167, 139, 250],
  6: [244, 114, 182],
  7: [251, 113, 133],
  8: [34, 211, 238],
};
const BG = [20, 20, 28];
const SIZE = 144;
const WAVE = [8, 14, 22, 18, 26, 16, 12, 20];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function crc(buf) {
  return zlib.crc32(buf) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

function encodePng(pixels) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function padIcon({ color = 1, empty = false, playing = false }) {
  const c = COLORS[((Number(color) - 1) % 8) + 1] || COLORS[1];
  const wash = empty ? 0.12 : playing ? 0.55 : 0.32;
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = wash * (1 - y / SIZE) * (1 - x / (SIZE * 2.2));
      const [r, g, b] = mix(BG, c, t);
      const i = (y * SIZE + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  const barW = 8;
  const gap = 5;
  const total = WAVE.length * barW + (WAVE.length - 1) * gap;
  const left = Math.round((SIZE - total) / 2);
  const base = SIZE - 28;
  const alpha = empty ? 0.28 : 1;
  WAVE.forEach((h, n) => {
    const hh = playing ? Math.round(h * 1.35) : empty ? Math.round(h * 0.55) : h;
    const x0 = left + n * (barW + gap);
    const [r, g, b] = mix(c, [255, 255, 255], empty ? 0 : 0.08);
    for (let y = base - hh; y < base; y++) {
      for (let x = x0; x < x0 + barW; x++) {
        const i = (y * SIZE + x) * 4;
        pixels[i] = Math.round(pixels[i] * (1 - alpha) + r * alpha);
        pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + g * alpha);
        pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + b * alpha);
      }
    }
  });
  return encodePng(pixels);
}

function set(pixels, x, y, rgb) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  pixels[i] = rgb[0];
  pixels[i + 1] = rgb[1];
  pixels[i + 2] = rgb[2];
  pixels[i + 3] = 255;
}

function disk(pixels, x, y, r, rgb) {
  const r2 = r * r;
  for (let yy = -r; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      if (xx * xx + yy * yy <= r2) set(pixels, x + xx, y + yy, rgb);
    }
  }
}

const GLYPH = {
  S: ["1111", "1000", "1111", "0001", "1111"],
  Y: ["1001", "1001", "0110", "0100", "0100"],
  N: ["1001", "1101", "1011", "1001", "1001"],
  C: ["1111", "1000", "1000", "1000", "1111"],
};

function glyph(pixels, ch, ox, oy, scale, rgb) {
  const rows = GLYPH[ch];
  if (!rows) return;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] !== "1") continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) set(pixels, ox + x * scale + dx, oy + y * scale + dy, rgb);
      }
    }
  }
}

function syncIcon() {
  const bg = [88, 56, 196];
  const fg = [255, 255, 255];
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    pixels[i * 4] = bg[0];
    pixels[i * 4 + 1] = bg[1];
    pixels[i * 4 + 2] = bg[2];
    pixels[i * 4 + 3] = 255;
  }
  const cx = 72;
  const cy = 54;
  const r = 30;
  const thick = 7;
  for (let a = 0; a < 360; a += 0.4) {
    const rad = (a * Math.PI) / 180;
    const onArc = (a >= 20 && a <= 150) || (a >= 200 && a <= 330);
    if (!onArc) continue;
    const x = Math.round(cx + Math.cos(rad) * r);
    const y = Math.round(cy + Math.sin(rad) * r);
    disk(pixels, x, y, thick, fg);
  }
  disk(pixels, Math.round(cx + Math.cos(2.62) * r), Math.round(cy + Math.sin(2.62) * r), 11, fg);
  disk(pixels, Math.round(cx + Math.cos(2.62) * (r - 10)), Math.round(cy + Math.sin(2.62) * (r - 10)), 6, bg);
  disk(pixels, Math.round(cx + Math.cos(-0.52) * r), Math.round(cy + Math.sin(-0.52) * r), 11, fg);
  disk(pixels, Math.round(cx + Math.cos(-0.52) * (r + 10)), Math.round(cy + Math.sin(-0.52) * (r + 10)), 6, bg);
  const scale = 6;
  const word = "SYNC";
  const gw = 4 * scale;
  const gap = 4;
  const total = word.length * gw + (word.length - 1) * gap;
  const left = Math.round((SIZE - total) / 2);
  const top = 108;
  word.split("").forEach((ch, n) => glyph(pixels, ch, left + n * (gw + gap), top, scale, fg));
  return encodePng(pixels);
}

module.exports = { padIcon, syncIcon, COLORS, SIZE };
