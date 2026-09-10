# Board — Team Soundboard

A lightweight soundboard (TV Total / Nippelboard style) with the **Sound Spark** UI.  
Hosts on **GitHub Pages**; the shared team board lives in **Supabase**.

**Open access:** anyone with the link can play **and** upload — no sign-up / login.

Plain HTML/CSS/JS — no build step.

## Features

- Grid of pads, record (mic, ~10s) or upload MP3/WAV
- Instant overlapping playback (Web Audio API)
- Keyboard shortcuts
- **Team cloud (Supabase):** shared pads + audio for everyone with the link
- Local IndexedDB cache + optional `board.json` fallback
- Export / Import backup

## Quick start (team cloud)

### 1. Create a Supabase project

1. Open [supabase.com](https://supabase.com) → new project.
2. SQL Editor → run [`supabase/schema.sql`](supabase/schema.sql).  
   If you already ran an older auth-only schema, run [`supabase/open-access.sql`](supabase/open-access.sql) instead/as well.
3. **Project Settings → API** → copy Project URL + `anon` `public` key into [`config.js`](config.js).

No Auth users needed.

### 2. Configure

```js
window.SOUNDBOARD_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
};
```

The anon key is public in the frontend by design. With open RLS, **anyone who has the site URL can change the board** — fine for a private team link, not for a fully public internet dump of secrets you’d regret.

### 3. Run / deploy

- Local: open `index.html`, or `python3 -m http.server 8080` (mic often needs localhost).
- GitHub Pages: push `main`.

### 4. Team workflow

1. Open the site → board loads from Supabase.
2. Record / upload / rename / clear → saved for everyone.
3. Others (also Incognito) see it after **Sync** or a short realtime refresh.

Free Supabase projects pause after ~7 days without enough DB traffic. A GitHub Action (`Keep Supabase awake`) hits `pads` once a day so the project stays up. Actions → **Keep Supabase awake** → Run workflow tests it immediately. Optional repo secrets `SUPABASE_URL` / `SUPABASE_ANON_KEY`; otherwise it reads `config.js`.

## How to use

| Action | How |
| --- | --- |
| Play | Click a filled pad or press its shortcut |
| Add / record | Empty pad or **New sound** → Record → save |
| Upload | Modal **Upload** tab, or drag a file onto a pad |
| Rename | Double-click label or ⋯ → Rename |
| Clear | ⋯ → Clear sound |
| Sync | Reload board from Supabase |
| Export / Import | Backup JSON (Import also pushes to cloud when configured) |

## Neuer Mac (Chefin / Team)

Einmalig: [Stream Controller](https://www.hotspotek.com.cn/) installieren, [Node](https://nodejs.org/) (LTS), Git-Zugang zu diesem Repo. Dock anschließen, Stream Controller einmal öffnen.

```bash
git clone https://github.com/GTMJrShark/Soundboard.git ~/Soundboard
cd ~/Soundboard
npm run setup
```

Danach Stream Controller mit **Cmd+Q** beenden und neu öffnen, Seite **Soundboard**. Sync auf dem Dock holt später neue Pads.

## Local Mac bridge (ohne Website)

Die Sounds aus Supabase liegen 1:1 als Dateien in `sounds/`, benannt wie die Pads.
`sounds/controller/` hat feste `pad_01.wav`–`pad_12.wav` für Hardware-Controller.

```bash
npm test          # Namens- und Spiegel-Logik
npm run sync:dry  # zeigt, was passieren würde
npm run sync      # lädt / benennt / löscht, schreibt board.json + Controller-WAVs
npm run sync:install    # stündlicher launchd-Job (Log: ~/Library/Logs/soundboard-sync.log)
npm run sync:uninstall
```

Der Job committet nichts. `sounds/controller/` und `.sync-state.json` sind gitignored.

### Stream Controller (HotSpot Stream Dock)

Die 12 Play-Tasten zeigen fest auf `sounds/controller/pad_01.wav`–`pad_12.wav`. Ein Sync überschreibt nur die WAVs — die Tasten bleiben.

Einmal einrichten (hängt Seite **Soundboard** an das gerade aktive Dock-Profil, z. B. Touchbar):

```bash
npm run streamdock:setup
```

Stream Controller danach neu starten und auf Seite 2 wechseln.

| Taste | Aktion |
| --- | --- |
| 4×3 links (wie Website) | Play `pad_01`–`pad_12` |
| rechts oben | **Sync** |
| darunter | **Stop** |

Ohne Hardware: `npm run sync:controller` (gleiche Notification).

## Without Supabase

Leave `config.js` empty. Falls back to local IndexedDB and optional [`board.json`](board.json) / [`sounds/`](sounds/).

## Project structure

```
  index.html
  style.css
  app.js
  config.js
  config.example.js
  supabase-sync.js
  supabase/schema.sql       # full setup (open access)
  supabase/open-access.sql  # migrate from auth-only policies
  board.json
  sounds/
  README.md
```
