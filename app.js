/**
 * Board — Sound Spark UI + IndexedDB / Web Audio / MediaRecorder
 */
(() => {
  "use strict";

  const DB_NAME = "soundboard-db";
  const DB_VERSION = 1;
  const STORE = "pads";
  const META_STORE = "meta";
  const DEFAULT_PAD_COUNT = 12;
  const MAX_RECORD_SECONDS = 10;
  const DEFAULT_SHORTCUTS = ["q", "w", "e", "r", "t", "y", "u", "i", "a", "s", "d", "f"];

  const speakerIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  const moreIcon = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`;

  // DOM
  const boardEl = document.getElementById("board");
  const boardCountEl = document.getElementById("boardCount");
  const kbdToggle = document.getElementById("kbdToggle");
  const importBtn = document.getElementById("importBtn");
  const exportBtn = document.getElementById("exportBtn");
  const newSoundBtn = document.getElementById("newSoundBtn");
  const importInput = document.getElementById("importInput");
  const uploadInput = document.getElementById("uploadInput");

  const modal = document.getElementById("modal");
  const modalClose = document.getElementById("modalClose");
  const modalCancel = document.getElementById("modalCancel");
  const modalSave = document.getElementById("modalSave");
  const modalTitle = document.getElementById("modalTitle");

  const recBtn = document.getElementById("recBtn");
  const recDot = document.getElementById("recDot");
  const recTime = document.getElementById("recTime");
  const levelMeter = document.getElementById("levelMeter");
  const recPreview = document.getElementById("recPreview");
  const recPreviewWrap = document.getElementById("recPreviewWrap");
  const recName = document.getElementById("recName");
  const recShortcut = document.getElementById("recShortcut");

  const dropzone = document.getElementById("dropzone");
  const fileCard = document.getElementById("fileCard");
  const fileExt = document.getElementById("fileExt");
  const fileName = document.getElementById("fileName");
  const fileMeta = document.getElementById("fileMeta");
  const fileClear = document.getElementById("fileClear");
  const upName = document.getElementById("upName");
  const upShortcut = document.getElementById("upShortcut");

  /** @type {{ id: string, label: string, shortcut: string, mimeType: string|null, blob: Blob|null, duration: number, color: number }[]} */
  let pads = [];
  let shortcutsEnabled = true;
  let audioCtx = null;
  /** @type {Map<string, AudioBuffer>} */
  const bufferCache = new Map();

  /** Pad currently being edited in the modal */
  let editingPadId = null;
  /** Pending audio for modal save */
  let pendingBlob = null;
  let pendingMime = null;
  let pendingSource = null; // "record" | "upload"

  // Recording
  let mediaRecorder = null;
  let mediaStream = null;
  let recordChunks = [];
  let recordTimerId = null;
  let recordAutoStopId = null;
  let recordStartTime = 0;
  let analyser = null;
  let meterRaf = null;
  let isRecording = false;

  // Level meter bars
  for (let i = 0; i < 48; i++) {
    const s = document.createElement("span");
    s.style.height = "20%";
    levelMeter.appendChild(s);
  }

  // ---------------------------------------------------------------------------
  // IndexedDB
  // ---------------------------------------------------------------------------
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
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
        duration: pad.duration || 0,
        color: pad.color,
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
  // Helpers
  // ---------------------------------------------------------------------------
  function newPadId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return "pad_" + crypto.randomUUID();
    return "pad_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function createEmptyPad(index) {
    return {
      id: newPadId(),
      label: `Pad ${index + 1}`,
      shortcut: DEFAULT_SHORTCUTS[index] || "",
      mimeType: null,
      blob: null,
      duration: 0,
      color: (index % 8) + 1,
    };
  }

  function getPad(id) {
    return pads.find((p) => p.id === id);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDur(seconds) {
    if (!seconds || !isFinite(seconds)) return "0:00";
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function waveHtml(seed, bars = 14) {
    let out = "";
    for (let i = 0; i < bars; i++) {
      const h = 30 + (((seed * 17 + i * 53) % 70));
      out += `<span style="height:${h}%"></span>`;
    }
    return `<div class="wave">${out}</div>`;
  }

  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  // ---------------------------------------------------------------------------
  // Web Audio
  // ---------------------------------------------------------------------------
  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  async function decodePad(pad) {
    if (!pad.blob) {
      bufferCache.delete(pad.id);
      pad.duration = 0;
      return;
    }
    const ctx = ensureAudioCtx();
    const ab = await pad.blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(ab.slice(0));
    bufferCache.set(pad.id, buffer);
    pad.duration = buffer.duration;
  }

  function playPad(pad) {
    if (!pad || !pad.blob) return;
    const ctx = ensureAudioCtx();
    const buffer = bufferCache.get(pad.id);
    if (!buffer) {
      decodePad(pad)
        .then(() => playPad(pad))
        .catch(() => toast("Could not play this sound"));
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    const el = boardEl.querySelector(`[data-pad-id="${pad.id}"]`);
    if (el) {
      el.classList.remove("playing");
      void el.offsetWidth;
      el.classList.add("playing");
      clearTimeout(el._playT);
      el._playT = setTimeout(() => el.classList.remove("playing"), Math.min(1600, (pad.duration || 1) * 1000 + 200));
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function updateBoardCount() {
    const filled = pads.filter((p) => p.blob).length;
    boardCountEl.textContent = `${pads.length} slots · ${filled} filled`;
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    pads.forEach((pad, i) => boardEl.appendChild(buildPadEl(pad, i)));
    updateBoardCount();
  }

  function buildPadEl(pad, index) {
    const el = document.createElement("div");
    el.dataset.padId = pad.id;

    if (!pad.blob) {
      el.className = "pad empty";
      el.innerHTML = `
        <span class="shortcut-hint">${escapeHtml((pad.shortcut || "").toUpperCase())}</span>
        <div>
          <div class="plus">+</div>
          <div class="empty-label">Add sound</div>
        </div>`;
      el.addEventListener("click", () => openModal(pad.id));
      bindDrop(el, pad);
    } else {
      el.className = "pad filled";
      el.style.setProperty("--c", `var(--pad-${pad.color || ((index % 8) + 1)})`);
      el.style.setProperty("--glow", `var(--pad-${pad.color || ((index % 8) + 1)}-glow)`);
      const seed = pad.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      el.innerHTML = `
        <div class="top-row">
          <span class="badge">${escapeHtml((pad.shortcut || "·").toUpperCase())}</span>
          <button type="button" class="more" aria-label="Options">${moreIcon}</button>
        </div>
        <div>
          <div class="icon-bubble">${speakerIcon}</div>
          <div class="label">${escapeHtml(pad.label)}</div>
          <div class="meta"><span>${formatDur(pad.duration)}</span><span class="dot"></span><span>Clip</span></div>
          ${waveHtml(seed)}
        </div>
        <div class="menu">
          <button type="button" data-action="rename">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            Rename
          </button>
          <button type="button" data-action="edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            Replace sound
          </button>
          <button type="button" data-action="shortcut">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>
            Reassign shortcut <span class="kbd-hint">${escapeHtml((pad.shortcut || "—").toUpperCase())}</span>
          </button>
          <div class="sep"></div>
          <button type="button" class="danger" data-action="clear">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Clear sound
          </button>
        </div>`;

      const moreBtn = el.querySelector(".more");
      const menu = el.querySelector(".menu");
      moreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".menu.open").forEach((m) => {
          if (m !== menu) m.classList.remove("open");
        });
        menu.classList.toggle("open");
      });

      menu.addEventListener("click", async (e) => {
        e.stopPropagation();
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        menu.classList.remove("open");
        const action = btn.dataset.action;
        if (action === "rename") startRename(pad, el.querySelector(".label"));
        else if (action === "edit") openModal(pad.id);
        else if (action === "shortcut") promptShortcut(pad);
        else if (action === "clear") {
          await clearPad(pad);
          toast("Sound cleared");
        }
      });

      el.addEventListener("click", (e) => {
        if (e.target.closest(".more") || e.target.closest(".menu")) return;
        if (el.querySelector(".label[contenteditable='true']")) return;
        playPad(pad);
      });

      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
        menu.classList.add("open");
      });

      el.querySelector(".label").addEventListener("dblclick", (e) => {
        e.stopPropagation();
        startRename(pad, e.currentTarget);
      });

      bindDrop(el, pad);
    }

    return el;
  }

  function bindDrop(el, pad) {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("is-dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("is-dragover"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("is-dragover");
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file || !isAudioFile(file)) {
        toast("Please drop an audio file");
        return;
      }
      await assignFileToPad(pad, file);
      toast("Sound uploaded");
    });
  }

  function startRename(pad, labelEl) {
    labelEl.contentEditable = "true";
    labelEl.focus();
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

  async function clearPad(pad) {
    pad.blob = null;
    pad.mimeType = null;
    pad.duration = 0;
    bufferCache.delete(pad.id);
    await dbPutPad(pad);
    renderBoard();
  }

  async function assignFileToPad(pad, file) {
    pad.blob = file;
    pad.mimeType = file.type || "audio/mpeg";
    if (!pad.label || /^Pad \d+$/.test(pad.label) || pad.label === "New sound") {
      pad.label = file.name.replace(/\.[^.]+$/, "") || pad.label;
    }
    try {
      await decodePad(pad);
    } catch {
      toast("Could not decode audio");
      return;
    }
    await dbPutPad(pad);
    renderBoard();
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------
  function openModal(padId, tab) {
    const pad = getPad(padId);
    if (!pad) return;
    editingPadId = padId;
    resetModalMedia();
    modalTitle.textContent = pad.blob ? "Replace sound" : "Add a sound";
    recName.value = pad.label || "New sound";
    upName.value = pad.label || "New sound";
    setShortcutDisplay(recShortcut, pad.shortcut);
    setShortcutDisplay(upShortcut, pad.shortcut);
    switchTab(tab || "record");
    updateSaveEnabled();
    modal.classList.add("open");
  }

  function closeModal() {
    stopRecording(false);
    resetModalMedia();
    editingPadId = null;
    modal.classList.remove("open");
  }

  function resetModalMedia() {
    pendingBlob = null;
    pendingMime = null;
    pendingSource = null;
    if (recPreview.src) URL.revokeObjectURL(recPreview.src);
    recPreview.removeAttribute("src");
    recPreviewWrap.classList.remove("visible");
    fileCard.classList.remove("visible");
    uploadInput.value = "";
    recTime.textContent = "00:00";
    recBtn.classList.remove("recording");
    recDot.style.opacity = ".3";
    idleMeter();
    updateSaveEnabled();
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === name));
  }

  function setShortcutDisplay(el, key) {
    el.textContent = key ? key.toUpperCase() : "—";
    el.dataset.key = key || "";
  }

  function updateSaveEnabled() {
    modalSave.disabled = !pendingBlob;
  }

  function setPending(blob, mime, source) {
    pendingBlob = blob;
    pendingMime = mime || blob.type || "audio/webm";
    pendingSource = source;
    updateSaveEnabled();
  }

  // Tabs
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => switchTab(t.dataset.tab));
  });

  modalClose.addEventListener("click", closeModal);
  modalCancel.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  newSoundBtn.addEventListener("click", async () => {
    let pad = pads.find((p) => !p.blob);
    if (!pad) {
      pad = createEmptyPad(pads.length);
      pads.push(pad);
      await dbPutPad(pad);
      renderBoard();
    }
    openModal(pad.id);
  });

  modalSave.addEventListener("click", async () => {
    const pad = getPad(editingPadId);
    if (!pad || !pendingBlob) return;

    const activeTab = document.querySelector(".tab.active")?.dataset.tab;
    const nameInput = activeTab === "upload" ? upName : recName;
    const shortcutEl = activeTab === "upload" ? upShortcut : recShortcut;

    pad.label = (nameInput.value || "").trim() || pad.label || "Sound";
    const key = (shortcutEl.dataset.key || "").toLowerCase();
    if (key) {
      const clash = pads.find((p) => p.id !== pad.id && p.shortcut === key);
      if (clash) {
        clash.shortcut = "";
        await dbPutPad(clash);
      }
      pad.shortcut = key;
    }

    pad.blob = pendingBlob;
    pad.mimeType = pendingMime;
    try {
      await decodePad(pad);
    } catch {
      toast("Could not decode audio");
      return;
    }
    await dbPutPad(pad);
    closeModal();
    renderBoard();
    toast("Saved to board");
  });

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------
  function pickMime() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  function idleMeter() {
    cancelAnimationFrame(meterRaf);
    meterRaf = null;
    levelMeter.querySelectorAll("span").forEach((s) => {
      s.style.height = "20%";
      s.style.opacity = ".5";
    });
  }

  function tickMeter() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const bars = levelMeter.querySelectorAll("span");
    const step = Math.floor(data.length / bars.length) || 1;
    bars.forEach((s, i) => {
      const v = data[i * step] || 0;
      const h = 12 + (v / 255) * 88;
      s.style.height = h + "%";
      s.style.opacity = String(0.35 + (v / 255) * 0.65);
    });
    meterRaf = requestAnimationFrame(tickMeter);
  }

  function updateRecClock() {
    const elapsed = (performance.now() - recordStartTime) / 1000;
    const total = Math.min(MAX_RECORD_SECONDS, Math.floor(elapsed));
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    recTime.textContent = `${m}:${s}`;
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast("Microphone not available");
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Microphone permission denied");
      return;
    }

    const ctx = ensureAudioCtx();
    const source = ctx.createMediaStreamSource(mediaStream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    tickMeter();

    const mime = pickMime();
    try {
      mediaRecorder = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime })
        : new MediaRecorder(mediaStream);
    } catch {
      toast("Could not start recorder");
      stopMediaStream();
      idleMeter();
      return;
    }

    recordChunks = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size) recordChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const type = mediaRecorder.mimeType || mime || "audio/webm";
      const blob = new Blob(recordChunks, { type });
      stopMediaStream();
      clearRecordTimers();
      idleMeter();
      isRecording = false;
      recBtn.classList.remove("recording");
      recDot.style.opacity = ".3";

      if (blob.size < 100) {
        toast("Recording too short");
        return;
      }
      setPending(blob, type, "record");
      if (recPreview.src) URL.revokeObjectURL(recPreview.src);
      recPreview.src = URL.createObjectURL(blob);
      recPreviewWrap.classList.add("visible");
    };

    mediaRecorder.start(100);
    isRecording = true;
    recordStartTime = performance.now();
    recBtn.classList.add("recording");
    recDot.style.opacity = "1";
    recordTimerId = setInterval(updateRecClock, 100);
    recordAutoStopId = setTimeout(() => {
      if (isRecording) {
        stopRecording(true);
        toast(`Stopped at ${MAX_RECORD_SECONDS}s max`);
      }
    }, MAX_RECORD_SECONDS * 1000);
  }

  function stopRecording(keep) {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    } else if (!keep) {
      stopMediaStream();
      clearRecordTimers();
      idleMeter();
      isRecording = false;
      recBtn.classList.remove("recording");
    }
  }

  function clearRecordTimers() {
    if (recordTimerId) clearInterval(recordTimerId);
    if (recordAutoStopId) clearTimeout(recordAutoStopId);
    recordTimerId = null;
    recordAutoStopId = null;
  }

  function stopMediaStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    analyser = null;
  }

  recBtn.addEventListener("click", () => {
    if (isRecording) stopRecording(true);
    else startRecording();
  });

  // ---------------------------------------------------------------------------
  // Upload tab
  // ---------------------------------------------------------------------------
  function isAudioFile(file) {
    return file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|webm|aac)$/i.test(file.name);
  }

  function showUploadFile(file) {
    const ext = (file.name.split(".").pop() || "AUD").toUpperCase().slice(0, 4);
    fileExt.textContent = ext;
    fileName.textContent = file.name;
    fileMeta.textContent = formatBytes(file.size);
    fileCard.classList.add("visible");
    if (!upName.value || upName.value === "New sound" || /^Pad \d+$/.test(upName.value)) {
      upName.value = file.name.replace(/\.[^.]+$/, "");
    }
    setPending(file, file.type || "audio/mpeg", "upload");
  }

  dropzone.addEventListener("click", () => uploadInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      uploadInput.click();
    }
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "var(--accent)";
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "";
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.style.borderColor = "";
    const file = e.dataTransfer.files?.[0];
    if (!file || !isAudioFile(file)) {
      toast("Please drop an audio file");
      return;
    }
    showUploadFile(file);
  });

  uploadInput.addEventListener("change", () => {
    const file = uploadInput.files?.[0];
    if (file) showUploadFile(file);
  });

  fileClear.addEventListener("click", () => {
    fileCard.classList.remove("visible");
    uploadInput.value = "";
    if (pendingSource === "upload") {
      pendingBlob = null;
      pendingMime = null;
      pendingSource = null;
      updateSaveEnabled();
    }
  });

  // Shortcut capture in modal
  function bindShortcutCapture(btn) {
    btn.addEventListener("click", () => {
      btn.textContent = "…";
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        document.removeEventListener("keydown", onKey, true);
        if (e.key === "Escape") {
          setShortcutDisplay(btn, btn.dataset.key || "");
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          setShortcutDisplay(btn, "");
          return;
        }
        if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
          document.addEventListener("keydown", onKey, true);
          return;
        }
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
        setShortcutDisplay(btn, key);
      };
      document.addEventListener("keydown", onKey, true);
    });
  }
  bindShortcutCapture(recShortcut);
  bindShortcutCapture(upShortcut);

  function promptShortcut(pad) {
    const overlay = document.createElement("div");
    overlay.className = "prompt-overlay";
    overlay.innerHTML = `
      <div class="prompt-box" role="dialog" aria-modal="true">
        <h3>Set shortcut</h3>
        <p>Press a key for “${escapeHtml(pad.label)}”. Escape cancels · Backspace clears.</p>
        <div class="prompt-box__key">${pad.shortcut ? escapeHtml(pad.shortcut.toUpperCase()) : "Waiting…"}</div>
        <div class="prompt-box__actions">
          <button type="button" class="btn ghost" data-cancel>Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const keyEl = overlay.querySelector(".prompt-box__key");
    const cleanup = () => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
    };
    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return cleanup();
      if (e.key === "Backspace" || e.key === "Delete") {
        pad.shortcut = "";
        await dbPutPad(pad);
        renderBoard();
        toast("Shortcut cleared");
        return cleanup();
      }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      const clash = pads.find((p) => p.id !== pad.id && p.shortcut === key);
      if (clash) {
        clash.shortcut = "";
        await dbPutPad(clash);
      }
      pad.shortcut = key;
      keyEl.textContent = key.toUpperCase();
      await dbPutPad(pad);
      renderBoard();
      toast("Shortcut: " + key.toUpperCase());
      cleanup();
    };
    overlay.querySelector("[data-cancel]").addEventListener("click", cleanup);
    document.addEventListener("keydown", onKey, true);
  }

  // ---------------------------------------------------------------------------
  // Keyboard play + toggle
  // ---------------------------------------------------------------------------
  document.addEventListener("click", () => {
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
  });

  kbdToggle.addEventListener("click", async () => {
    kbdToggle.classList.toggle("on");
    shortcutsEnabled = kbdToggle.classList.contains("on");
    await dbSaveMeta("shortcutsEnabled", shortcutsEnabled);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closeModal();
      return;
    }
    if (!shortcutsEnabled) return;
    if (modal.classList.contains("open")) return;
    if (document.querySelector(".prompt-overlay")) return;
    const tag = e.target?.tagName || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    const pad = pads.find((p) => p.shortcut === key);
    if (pad?.blob) {
      e.preventDefault();
      playPad(pad);
    }
  });

  // ---------------------------------------------------------------------------
  // Export / Import
  // ---------------------------------------------------------------------------
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
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
      const exported = [];
      for (const pad of pads) {
        exported.push({
          id: pad.id,
          label: pad.label,
          shortcut: pad.shortcut,
          mimeType: pad.mimeType,
          duration: pad.duration,
          color: pad.color,
          audioBase64: pad.blob ? await blobToBase64(pad.blob) : null,
        });
      }
      const payload = { version: 1, exportedAt: new Date().toISOString(), pads: exported };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soundboard-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
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
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data?.pads || !Array.isArray(data.pads)) {
        toast("Invalid board file");
        return;
      }
      if (!confirm(`Import ${data.pads.length} pads? This replaces your current board.`)) return;

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
          duration: raw.duration || 0,
          color: raw.color || (i % 8) + 1,
        };
        if (raw.audioBase64) {
          pad.blob = base64ToBlob(raw.audioBase64, raw.mimeType || "audio/webm");
          pad.mimeType = raw.mimeType || pad.blob.type;
          try {
            await decodePad(pad);
          } catch { /* skip */ }
        }
        pads.push(pad);
        await dbPutPad(pad);
      }
      renderBoard();
      toast("Board imported");
    } catch (err) {
      console.error(err);
      toast("Import failed");
    }
  });

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  async function init() {
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
      kbdToggle.classList.toggle("on", shortcutsEnabled);
    }

    if (!stored.length) {
      pads = Array.from({ length: DEFAULT_PAD_COUNT }, (_, i) => createEmptyPad(i));
      for (const pad of pads) await dbPutPad(pad);
    } else {
      stored.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      pads = stored.map((row, i) => ({
        id: row.id,
        label: row.label,
        shortcut: row.shortcut || "",
        mimeType: row.mimeType || null,
        blob: row.blob || null,
        duration: row.duration || 0,
        color: row.color || (i % 8) + 1,
      }));
      for (const pad of pads) {
        if (pad.blob) {
          try {
            await decodePad(pad);
          } catch { /* leave */ }
        }
      }
    }

    renderBoard();
  }

  init().catch((err) => {
    console.error(err);
    toast("Failed to load board");
  });
})();
