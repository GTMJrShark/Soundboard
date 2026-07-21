/**
 * Soundboard — vanilla JS sound pad app
 * Uses IndexedDB for persistence and the Web Audio API for low-latency playback.
 */

(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const DB_NAME = "soundboard-db";
  const DB_VERSION = 1;
  const STORE = "pads";
  const META_STORE = "meta";
  const DEFAULT_PAD_COUNT = 12;
  const MAX_RECORD_SECONDS = 10;
  // Default shortcut keys in row order (like a stream deck / number row + QWERTY)
  const DEFAULT_SHORTCUTS = [
    "1", "2", "3", "4",
    "q", "w", "e", "r",
    "a", "s", "d", "f",
  ];

  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------
  const gridEl = document.getElementById("grid");
  const addBtn = document.getElementById("addBtn");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importInput = document.getElementById("importInput");
  const uploadInput = document.getElementById("uploadInput");
  const shortcutsToggle = document.getElementById("shortcutsToggle");

  const recordModal = document.getElementById("recordModal");
  const recordPadName = document.getElementById("recordPadName");
  const recordStatus = document.getElementById("recordStatus");
  const recordTimer = document.getElementById("recordTimer");
  const recStartBtn = document.getElementById("recStartBtn");
  const recStopBtn = document.getElementById("recStopBtn");
  const recSaveBtn = document.getElementById("recSaveBtn");
  const recCancelBtn = document.getElementById("recCancelBtn");
  const recPreview = document.getElementById("recPreview");

  const padMenu = document.getElementById("padMenu");

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  /** @type {{ id: string, label: string, shortcut: string, mimeType: string|null, blob: Blob|null }[]} */
  let pads = [];
  /** pad id currently targeted by the context menu / upload picker */
  let activePadId = null;
  /** pad id being recorded into */
  let recordingPadId = null;

  let mediaRecorder = null;
  let mediaStream = null;
  let recordChunks = [];
  /** @type {Blob|null} */
  let recordedBlob = null;
  let recordStartTime = 0;
  let recordTimerId = null;
  let recordAutoStopId = null;

  /** AudioContext + decoded buffers keyed by pad id */
  let audioCtx = null;
  /** @type {Map<string, AudioBuffer>} */
  const bufferCache = new Map();

  let shortcutsEnabled = true;

  // ---------------------------------------------------------------------------
  // IndexedDB helpers
  // ---------------------------------------------------------------------------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGetAllPads() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPutPad(pad) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        id: pad.id,
        label: pad.label,
        shortcut: pad.shortcut,
        mimeType: pad.mimeType,
        blob: pad.blob,
        order: pads.findIndex((p) => p.id === pad.id),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDeletePad(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbClearPads() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbSaveMeta(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.objectStore(META_STORE).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbGetMeta(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readonly");
      const req = tx.objectStore(META_STORE).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------------------------------------------------------------------
  // Audio (Web Audio API — overlapping, low-latency)
  // ---------------------------------------------------------------------------
  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  async function decodePad(pad) {
    if (!pad.blob) {
      bufferCache.delete(pad.id);
      return;
    }
    const ctx = ensureAudioCtx();
    const arrayBuffer = await pad.blob.arrayBuffer();
    // clone for decodeAudioData which may detach the buffer
    const copy = arrayBuffer.slice(0);
    try {
      const buffer = await ctx.decodeAudioData(copy);
      bufferCache.set(pad.id, buffer);
    } catch (err) {
      console.warn("Failed to decode audio for pad", pad.id, err);
      bufferCache.delete(pad.id);
      throw err;
    }
  }

  function playPad(pad) {
    if (!pad || !pad.blob) return;
    const ctx = ensureAudioCtx();
    const buffer = bufferCache.get(pad.id);
    if (!buffer) {
      // Decode on the fly if cache missed (e.g. just assigned)
      decodePad(pad).then(() => playPad(pad)).catch(() => {
        toast("Could not play this sound");
      });
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    // Visual flash
    const el = gridEl.querySelector(`[data-pad-id="${pad.id}"]`);
    if (el) {
      el.classList.add("is-playing");
      setTimeout(() => el.classList.remove("is-playing"), 120);
    }
  }

  // ---------------------------------------------------------------------------
  // Pad model helpers
  // ---------------------------------------------------------------------------
  function newPadId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return "pad_" + crypto.randomUUID();
    }
    return "pad_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function createEmptyPad(index) {
    return {
      id: newPadId(),
      label: `Pad ${index + 1}`,
      shortcut: DEFAULT_SHORTCUTS[index] || "",
      mimeType: null,
      blob: null,
    };
  }

  function getPad(id) {
    return pads.find((p) => p.id === id);
  }

  async function assignSound(pad, blob, mimeType) {
    pad.blob = blob;
    pad.mimeType = mimeType || blob.type || "audio/webm";
    await decodePad(pad);
    await dbPutPad(pad);
    renderPad(pad);
  }

  async function clearPadSound(pad) {
    pad.blob = null;
    pad.mimeType = null;
    bufferCache.delete(pad.id);
    await dbPutPad(pad);
    renderPad(pad);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderAll() {
    gridEl.innerHTML = "";
    pads.forEach((pad) => {
      gridEl.appendChild(buildPadElement(pad));
    });
  }

  function buildPadElement(pad) {
    const el = document.createElement("div");
    el.className = "pad" + (pad.blob ? " has-sound" : "");
    el.dataset.padId = pad.id;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", pad.label);

    el.innerHTML = `
      <span class="pad__shortcut">${escapeHtml(pad.shortcut ? pad.shortcut.toUpperCase() : "")}</span>
      <button type="button" class="pad__clear" title="Clear sound" aria-label="Clear sound">×</button>
      <span class="pad__empty">+</span>
      <span class="pad__icon" aria-hidden="true">▶</span>
      <span class="pad__label">${escapeHtml(pad.label)}</span>
    `;

    bindPadEvents(el, pad);
    return el;
  }

  function renderPad(pad) {
    const existing = gridEl.querySelector(`[data-pad-id="${pad.id}"]`);
    const fresh = buildPadElement(pad);
    if (existing) {
      existing.replaceWith(fresh);
    } else {
      gridEl.appendChild(fresh);
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------------
  // Pad interactions
  // ---------------------------------------------------------------------------
  function bindPadEvents(el, pad) {
    const labelEl = el.querySelector(".pad__label");
    const clearBtn = el.querySelector(".pad__clear");

    // Play on click (ignore clicks on clear / while editing label)
    el.addEventListener("click", (e) => {
      if (e.target === clearBtn || clearBtn.contains(e.target)) return;
      if (labelEl.isContentEditable) return;
      if (pad.blob) {
        playPad(pad);
      } else {
        // Empty pad: open menu near the pad
        showPadMenu(pad.id, e.clientX, e.clientY);
      }
    });

    el.addEventListener("keydown", (e) => {
      if (labelEl.isContentEditable) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (pad.blob) playPad(pad);
        else showPadMenu(pad.id, el.getBoundingClientRect().left, el.getBoundingClientRect().bottom);
      }
    });

    // Right-click → context menu (or clear if they prefer — menu includes clear)
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showPadMenu(pad.id, e.clientX, e.clientY);
    });

    clearBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!pad.blob) return;
      await clearPadSound(pad);
      toast("Sound cleared");
    });

    // Double-click label to rename
    labelEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startRename(pad, labelEl);
    });

    // Drag & drop audio files
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("is-dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("is-dragover"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("is-dragover");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!file.type.startsWith("audio/")) {
        toast("Please drop an audio file (MP3, WAV, …)");
        return;
      }
      try {
        await assignSound(pad, file, file.type);
        if (!pad.label || /^Pad \d+$/.test(pad.label)) {
          pad.label = file.name.replace(/\.[^.]+$/, "");
          await dbPutPad(pad);
          renderPad(pad);
        }
        toast("Sound uploaded");
      } catch {
        toast("Could not load that audio file");
      }
    });
  }

  function startRename(pad, labelEl) {
    labelEl.contentEditable = "true";
    labelEl.focus();
    // Select all text
    const range = document.createRange();
    range.selectNodeContents(labelEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = async () => {
      labelEl.contentEditable = "false";
      const next = labelEl.textContent.trim() || pad.label;
      labelEl.textContent = next;
      if (next !== pad.label) {
        pad.label = next;
        await dbPutPad(pad);
      }
    };

    labelEl.addEventListener("blur", finish, { once: true });
    labelEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        labelEl.blur();
      }
      if (e.key === "Escape") {
        labelEl.textContent = pad.label;
        labelEl.blur();
      }
      e.stopPropagation();
    });
  }

  // ---------------------------------------------------------------------------
  // Context menu
  // ---------------------------------------------------------------------------
  function showPadMenu(padId, x, y) {
    activePadId = padId;
    padMenu.hidden = false;
    // Position within viewport
    const menuW = 200;
    const menuH = 260;
    const left = Math.min(x, window.innerWidth - menuW - 8);
    const top = Math.min(y, window.innerHeight - menuH - 8);
    padMenu.style.left = `${Math.max(8, left)}px`;
    padMenu.style.top = `${Math.max(8, top)}px`;
  }

  function hidePadMenu() {
    padMenu.hidden = true;
  }

  padMenu.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const pad = getPad(activePadId);
    hidePadMenu();
    if (!pad) return;

    if (action === "record") {
      openRecordModal(pad);
    } else if (action === "upload") {
      activePadId = pad.id;
      uploadInput.value = "";
      uploadInput.click();
    } else if (action === "rename") {
      const el = gridEl.querySelector(`[data-pad-id="${pad.id}"] .pad__label`);
      if (el) startRename(pad, el);
    } else if (action === "shortcut") {
      promptShortcut(pad);
    } else if (action === "clear") {
      await clearPadSound(pad);
      toast("Sound cleared");
    } else if (action === "delete") {
      if (pads.length <= 1) {
        toast("Keep at least one pad");
        return;
      }
      bufferCache.delete(pad.id);
      pads = pads.filter((p) => p.id !== pad.id);
      await dbDeletePad(pad.id);
      renderAll();
      toast("Pad deleted");
    }
  });

  document.addEventListener("click", (e) => {
    if (!padMenu.hidden && !padMenu.contains(e.target)) {
      hidePadMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !padMenu.hidden) hidePadMenu();
  });

  // ---------------------------------------------------------------------------
  // Upload via file picker
  // ---------------------------------------------------------------------------
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files && uploadInput.files[0];
    const pad = getPad(activePadId);
    if (!file || !pad) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(file.name)) {
      toast("Please choose an audio file");
      return;
    }
    try {
      await assignSound(pad, file, file.type || "audio/mpeg");
      if (!pad.label || /^Pad \d+$/.test(pad.label)) {
        pad.label = file.name.replace(/\.[^.]+$/, "");
        await dbPutPad(pad);
        renderPad(pad);
      }
      toast("Sound uploaded");
    } catch {
      toast("Could not load that audio file");
    }
  });

  // ---------------------------------------------------------------------------
  // Recording (MediaRecorder)
  // ---------------------------------------------------------------------------
  function openRecordModal(pad) {
    recordingPadId = pad.id;
    recordedBlob = null;
    recordChunks = [];
    recordPadName.textContent = `Pad: ${pad.label}`;
    setRecordUI("ready");
    recPreview.hidden = true;
    recPreview.removeAttribute("src");
    recPreview.load();
    recSaveBtn.disabled = true;
    recStartBtn.disabled = false;
    recStopBtn.disabled = true;
    recordTimer.textContent = "0.0s";
    recordModal.hidden = false;
  }

  function setRecordUI(state) {
    recordStatus.classList.remove("is-recording", "is-ready-preview");
    if (state === "recording") {
      recordStatus.textContent = "Recording…";
      recordStatus.classList.add("is-recording");
    } else if (state === "preview") {
      recordStatus.textContent = "Preview — listen, then save";
      recordStatus.classList.add("is-ready-preview");
    } else {
      recordStatus.textContent = "Ready";
    }
  }

  function pickRecorderMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Microphone access is not available in this browser");
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Microphone permission denied");
      return;
    }

    const mime = pickRecorderMime();
    try {
      mediaRecorder = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime })
        : new MediaRecorder(mediaStream);
    } catch {
      toast("Could not start MediaRecorder");
      stopMediaStream();
      return;
    }

    recordChunks = [];
    recordedBlob = null;
    recSaveBtn.disabled = true;
    recPreview.hidden = true;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const type = mediaRecorder.mimeType || mime || "audio/webm";
      recordedBlob = new Blob(recordChunks, { type });
      stopMediaStream();
      clearRecordTimers();

      const url = URL.createObjectURL(recordedBlob);
      recPreview.src = url;
      recPreview.hidden = false;
      recSaveBtn.disabled = false;
      recStartBtn.disabled = false;
      recStopBtn.disabled = true;
      setRecordUI("preview");
    };

    mediaRecorder.start(100);
    recordStartTime = performance.now();
    setRecordUI("recording");
    recStartBtn.disabled = true;
    recStopBtn.disabled = false;

    recordTimerId = setInterval(() => {
      const elapsed = (performance.now() - recordStartTime) / 1000;
      recordTimer.textContent = elapsed.toFixed(1) + "s";
    }, 50);

    // Auto-stop at max duration
    recordAutoStopId = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        toast(`Stopped at ${MAX_RECORD_SECONDS}s max`);
      }
    }, MAX_RECORD_SECONDS * 1000);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }

  function clearRecordTimers() {
    if (recordTimerId) {
      clearInterval(recordTimerId);
      recordTimerId = null;
    }
    if (recordAutoStopId) {
      clearTimeout(recordAutoStopId);
      recordAutoStopId = null;
    }
  }

  function stopMediaStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  async function closeRecordModal(save) {
    // Ensure recorder is stopped
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    clearRecordTimers();
    stopMediaStream();

    if (save && recordedBlob && recordingPadId) {
      const pad = getPad(recordingPadId);
      if (pad) {
        try {
          await assignSound(pad, recordedBlob, recordedBlob.type);
          toast("Recording saved");
        } catch {
          toast("Could not save recording");
        }
      }
    }

    if (recPreview.src) {
      URL.revokeObjectURL(recPreview.src);
    }
    recPreview.removeAttribute("src");
    recordedBlob = null;
    recordingPadId = null;
    recordModal.hidden = true;
  }

  recStartBtn.addEventListener("click", startRecording);
  recStopBtn.addEventListener("click", stopRecording);
  recSaveBtn.addEventListener("click", () => closeRecordModal(true));
  recCancelBtn.addEventListener("click", () => closeRecordModal(false));

  // Close modal on backdrop click
  recordModal.addEventListener("click", (e) => {
    if (e.target === recordModal) closeRecordModal(false);
  });

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------
  function promptShortcut(pad) {
    const overlay = document.createElement("div");
    overlay.className = "prompt-overlay";
    overlay.innerHTML = `
      <div class="prompt-box" role="dialog" aria-modal="true">
        <h3>Set shortcut</h3>
        <p>Press a key for “${escapeHtml(pad.label)}”. Escape to cancel. Backspace to clear.</p>
        <div class="prompt-box__key" id="shortcutPreview">${pad.shortcut ? escapeHtml(pad.shortcut.toUpperCase()) : "Waiting…"}</div>
        <div class="prompt-box__actions">
          <button type="button" class="btn" data-cancel>Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const preview = overlay.querySelector("#shortcutPreview");

    const cleanup = () => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
    };

    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        cleanup();
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        pad.shortcut = "";
        await dbPutPad(pad);
        renderPad(pad);
        toast("Shortcut cleared");
        cleanup();
        return;
      }
      // Ignore modifiers alone
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      // Warn if duplicate
      const clash = pads.find((p) => p.id !== pad.id && p.shortcut === key);
      pad.shortcut = key;
      await dbPutPad(pad);
      renderPad(pad);
      preview.textContent = key.toUpperCase();
      toast(clash ? `Shortcut moved (was on “${clash.label}”)` : `Shortcut: ${key.toUpperCase()}`);
      if (clash) {
        clash.shortcut = "";
        await dbPutPad(clash);
        renderPad(clash);
      }
      cleanup();
    };

    overlay.querySelector("[data-cancel]").addEventListener("click", cleanup);
    document.addEventListener("keydown", onKey, true);
  }

  document.addEventListener("keydown", (e) => {
    if (!shortcutsEnabled) return;
    // Ignore when typing in editable fields / modals
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
    if (!recordModal.hidden) return;
    if (document.querySelector(".prompt-overlay")) return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    const pad = pads.find((p) => p.shortcut === key);
    if (pad && pad.blob) {
      e.preventDefault();
      playPad(pad);
    }
  });

  shortcutsToggle.addEventListener("change", async () => {
    shortcutsEnabled = shortcutsToggle.checked;
    await dbSaveMeta("shortcutsEnabled", shortcutsEnabled);
  });

  // ---------------------------------------------------------------------------
  // Add pad
  // ---------------------------------------------------------------------------
  addBtn.addEventListener("click", async () => {
    const pad = createEmptyPad(pads.length);
    pads.push(pad);
    await dbPutPad(pad);
    renderPad(pad);
  });

  // ---------------------------------------------------------------------------
  // Export / Import (JSON with base64 audio)
  // ---------------------------------------------------------------------------
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        // strip "data:...;base64,"
        const base64 = String(dataUrl).split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBlob(base64, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || "application/octet-stream" });
  }

  exportBtn.addEventListener("click", async () => {
    try {
      const exportedPads = [];
      for (const pad of pads) {
        let audioBase64 = null;
        if (pad.blob) {
          audioBase64 = await blobToBase64(pad.blob);
        }
        exportedPads.push({
          id: pad.id,
          label: pad.label,
          shortcut: pad.shortcut,
          mimeType: pad.mimeType,
          audioBase64,
        });
      }
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        pads: exportedPads,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soundboard-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Board exported");
    } catch (err) {
      console.error(err);
      toast("Export failed");
    }
  });

  importBtn.addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.pads)) {
        toast("Invalid board file");
        return;
      }
      if (!confirm(`Import ${data.pads.length} pads? This replaces your current board.`)) {
        return;
      }

      bufferCache.clear();
      await dbClearPads();
      pads = [];

      for (let i = 0; i < data.pads.length; i++) {
        const raw = data.pads[i];
        const pad = {
          id: raw.id || newPadId(),
          label: raw.label || `Pad ${i + 1}`,
          shortcut: raw.shortcut || "",
          mimeType: raw.mimeType || null,
          blob: null,
        };
        if (raw.audioBase64) {
          pad.blob = base64ToBlob(raw.audioBase64, raw.mimeType || "audio/webm");
          pad.mimeType = raw.mimeType || pad.blob.type;
        }
        pads.push(pad);
        await dbPutPad(pad);
        if (pad.blob) {
          try {
            await decodePad(pad);
          } catch {
            /* skip bad clips */
          }
        }
      }

      renderAll();
      toast("Board imported");
    } catch (err) {
      console.error(err);
      toast("Import failed — check the JSON file");
    }
  });

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  let toastEl = null;
  let toastTimer = null;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  async function init() {
    // Unlock audio on first user gesture
    const unlock = () => {
      ensureAudioCtx();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);

    const stored = await dbGetAllPads();
    const shortcutsMeta = await dbGetMeta("shortcutsEnabled");
    if (typeof shortcutsMeta === "boolean") {
      shortcutsEnabled = shortcutsMeta;
      shortcutsToggle.checked = shortcutsEnabled;
    }

    if (stored.length === 0) {
      pads = Array.from({ length: DEFAULT_PAD_COUNT }, (_, i) => createEmptyPad(i));
      for (const pad of pads) await dbPutPad(pad);
    } else {
      // Restore order if saved
      stored.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      pads = stored.map((row) => ({
        id: row.id,
        label: row.label,
        shortcut: row.shortcut || "",
        mimeType: row.mimeType || null,
        blob: row.blob || null,
      }));
      // Pre-decode for snappy first play
      for (const pad of pads) {
        if (pad.blob) {
          try {
            await decodePad(pad);
          } catch {
            /* leave undecoded; play will retry */
          }
        }
      }
    }

    renderAll();
  }

  init().catch((err) => {
    console.error(err);
    toast("Failed to load soundboard");
  });
})();
