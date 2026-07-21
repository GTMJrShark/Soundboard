# Board — Soundboard

A lightweight, offline-first soundboard inspired by the TV Total **Nippelboard**. UI based on the **Sound Spark** design: colorful pads, record/upload modal, keyboard shortcuts, export/import.

Plain HTML, CSS, and vanilla JavaScript — no build step, no frameworks.

## Features

- **12 pads by default** (grows when you add more via **New sound**)
- **Record** from the mic (max ~10s) with live level meter and preview before save
- **Upload** MP3/WAV via the modal dropzone, or drag a file onto any pad
- **Instant overlapping playback** via the Web Audio API
- **Editable labels** — double-click a name, or use the ⋯ menu → Rename
- **Clear / replace** from the pad menu or right-click
- **Keyboard shortcuts** — default `Q–I` / `A–F`; customize per pad
- **IndexedDB** persistence (survives reload)
- **Export / Import** a single `.json` board (base64 audio)

## How to use

| Action | How |
| --- | --- |
| Play | Click a filled pad, or press its shortcut |
| Add / record | Click an empty pad or **New sound** → Record → tap the red button → preview → **Save to board** |
| Upload | Modal → **Upload** tab, or drag a file onto a pad |
| Rename | Double-click the label, or ⋯ → Rename |
| Shortcut | ⋯ → Reassign shortcut, or set it in the modal |
| Clear | ⋯ → Clear sound |
| Export / Import | Top bar buttons |

## Run locally

Open `index.html` in a browser.

Recording needs a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). If the mic is blocked on `file://`, serve locally:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Deploy on GitHub Pages

1. Push this folder to a GitHub repo (`main` branch).
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. Live at `https://<user>.github.io/<repo>/`.

Boards live in each visitor’s browser (IndexedDB). Use **Export** to back up or share.

## Project structure

```
  index.html
  style.css
  app.js
  favicon.ico
  README.md
```
