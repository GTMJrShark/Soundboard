# Soundboard

A lightweight, offline-first soundboard inspired by the TV Total **Nippelboard**: a grid of pads that instantly play short sound clips. Record from your mic, upload MP3/WAV files, trigger sounds with the keyboard, and export/import the whole board as a single JSON file.

Built with plain HTML, CSS, and vanilla JavaScript — no build step, no frameworks, no external dependencies.

## Features

- **12 pads by default** (add more with “+ Add pad”)
- **Record** via the microphone (`MediaRecorder`, max ~10 seconds) with a live timer, visible recording state, and playback preview before saving
- **Upload** audio (MP3, WAV, etc.) via drag-and-drop onto a pad or the pad menu’s file picker
- **Instant playback** with the Web Audio API — overlapping sounds allowed (mash several pads quickly)
- **Editable labels** — double-click a pad’s name to rename
- **Clear / remove** — right-click a pad for the menu, or click the × on a pad with a sound
- **Keyboard shortcuts** — default layout uses `1–4`, `Q–R`, `A–F`; customize per pad from the menu
- **Persistence** — sounds and labels stored in **IndexedDB** (survives reload)
- **Export / Import board** — download or restore a `.json` file with base64-encoded audio

## How to use

| Action | How |
| --- | --- |
| Play | Click a pad that has a sound, or press its keyboard shortcut |
| Record | Right-click (or click an empty pad) → **Record…** → ● Record → ■ Stop → listen → **Save to pad** |
| Upload | Drag an audio file onto a pad, or menu → **Upload file…** |
| Rename | Double-click the label, or menu → **Rename** |
| Shortcut | Menu → **Set shortcut** → press a key (Backspace clears) |
| Clear sound | Click × on the pad, or menu → **Clear sound**, or right-click flow |
| Delete pad | Menu → **Delete pad** |
| Export | **Export board** — downloads a `.json` backup |
| Import | **Import board** — replaces the current board from a `.json` file |

Toggle **Keyboard shortcuts** in the top bar if you want to type without triggering pads.

## Run locally

No install required:

1. Open `index.html` in your browser (double-click it, or File → Open).
2. Start assigning sounds to pads.

**Microphone note:** Recording needs a [secure context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts). Opening the file directly (`file://`) works for playback, upload, and IndexedDB in most browsers, but **recording may be blocked**. If the mic doesn’t work, serve the folder over localhost:

```bash
# From this directory — any static server works, e.g.:
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Deploy free on GitHub Pages

1. Create a new GitHub repository and push this project (the folder that contains `index.html`).
2. On GitHub: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose the `main` branch and the folder `/ (root)`, then save.
5. After a minute or two, your board is live at  
   `https://<your-username>.github.io/<repo-name>/`.

GitHub Pages is HTTPS, so microphone recording works there. Boards are stored **in each visitor’s browser** (IndexedDB), not on the server — use **Export board** to back up or share a layout.

## Project structure

```
soundboard/
  index.html   # UI shell
  style.css    # Layout and theme
  app.js       # Pads, audio, IndexedDB, export/import
  README.md
```

## Browser support

Modern Chromium, Firefox, and Safari. Relies on IndexedDB, Web Audio API, `MediaRecorder`, and `getUserMedia`.
