/**
 * Supabase cloud layer for the team soundboard.
 * Exposes window.SoundboardCloud
 */
(() => {
  "use strict";

  const BUCKET = "sounds";
  const DEFAULT_SHORTCUTS = ["q", "w", "e", "r", "t", "y", "u", "i", "a", "s", "d", "f"];
  const DEFAULT_PAD_COUNT = 12;

  let client = null;
  let session = null;
  let realtimeChannel = null;

  function getConfig() {
    const cfg = window.SOUNDBOARD_CONFIG || {};
    return {
      url: (cfg.SUPABASE_URL || "").trim(),
      key: (cfg.SUPABASE_ANON_KEY || "").trim(),
    };
  }

  function isConfigured() {
    const { url, key } = getConfig();
    return Boolean(url && key && window.supabase);
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (!client) {
      const { url, key } = getConfig();
      client = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
    return client;
  }

  function isSignedIn() {
    return Boolean(session?.user);
  }

  function currentUser() {
    return session?.user || null;
  }

  function extForMime(mime) {
    if (!mime) return "webm";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    if (mime.includes("wav")) return "wav";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
    if (mime.includes("webm")) return "webm";
    return "webm";
  }

  function publicUrl(path) {
    const sb = getClient();
    if (!sb || !path) return null;
    const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function initAuth(onChange) {
    const sb = getClient();
    if (!sb) {
      onChange?.(null);
      return null;
    }
    const { data } = await sb.auth.getSession();
    session = data.session || null;
    onChange?.(session);
    sb.auth.onAuthStateChange((_event, next) => {
      session = next;
      onChange?.(session);
    });
    return session;
  }

  async function signIn(email, password) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase is not configured");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = data.session;
    return session;
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) return;
    await sb.auth.signOut();
    session = null;
  }

  async function ensureSeedPads() {
    const sb = getClient();
    if (!sb) return [];
    const { data, error } = await sb.from("pads").select("id").limit(1);
    if (error) throw error;
    if (data && data.length) return;

    const rows = Array.from({ length: DEFAULT_PAD_COUNT }, (_, i) => ({
      id: "pad_" + String(i + 1).padStart(2, "0"),
      label: `Pad ${i + 1}`,
      shortcut: DEFAULT_SHORTCUTS[i] || "",
      color: (i % 8) + 1,
      mime_type: null,
      duration: 0,
      storage_path: null,
      sort_order: i,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await sb.from("pads").upsert(rows);
    if (upsertErr) throw upsertErr;
  }

  async function fetchPadRows() {
    const sb = getClient();
    if (!sb) return null;
    const { data, error } = await sb
      .from("pads")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function fetchAudioBlob(storagePath) {
    if (!storagePath) return null;
    const url = publicUrl(storagePath);
    if (!url) return null;
    const res = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Date.now(), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to fetch " + storagePath);
    return await res.blob();
  }

  /**
   * Load pads from Supabase into app-shaped objects (with blobs).
   * Returns null if cloud is unavailable.
   */
  async function loadBoard() {
    if (!isConfigured()) return null;
    const rows = await fetchPadRows();
    if (!rows) return null;

    if (!rows.length) {
      await ensureSeedPads();
      const again = await fetchPadRows();
      if (!again?.length) return [];
      return hydrateRows(again);
    }
    return hydrateRows(rows);
  }

  async function hydrateRows(rows) {
    const pads = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let blob = null;
      if (row.storage_path) {
        try {
          blob = await fetchAudioBlob(row.storage_path);
        } catch (err) {
          console.warn("Audio missing for", row.id, err);
        }
      }
      pads.push({
        id: row.id,
        label: row.label || `Pad ${i + 1}`,
        shortcut: row.shortcut || "",
        mimeType: row.mime_type || (blob ? blob.type : null),
        blob,
        duration: row.duration || 0,
        color: row.color || (i % 8) + 1,
        storagePath: row.storage_path || null,
        sortOrder: row.sort_order ?? i,
      });
    }
    return pads;
  }

  async function upsertPadMeta(pad, sortOrder) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase is not configured");

    const row = {
      id: pad.id,
      label: pad.label,
      shortcut: pad.shortcut || "",
      color: pad.color || 1,
      mime_type: pad.mimeType || null,
      duration: pad.duration || 0,
      storage_path: pad.storagePath || null,
      sort_order: typeof sortOrder === "number" ? sortOrder : pad.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from("pads").upsert(row);
    if (error) throw error;
  }

  async function uploadPadAudio(pad, blob, mimeType) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase is not configured");

    const ext = extForMime(mimeType || blob.type);
    const path = `${pad.id}/${Date.now()}.${ext}`;

    // Remove previous object if present
    if (pad.storagePath) {
      await sb.storage.from(BUCKET).remove([pad.storagePath]);
    }

    const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
      contentType: mimeType || blob.type || "audio/webm",
      upsert: true,
    });
    if (error) throw error;

    pad.storagePath = path;
    pad.mimeType = mimeType || blob.type || "audio/webm";
    pad.blob = blob;
  }

  async function clearPadAudio(pad) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase is not configured");

    if (pad.storagePath) {
      await sb.storage.from(BUCKET).remove([pad.storagePath]);
    }
    pad.storagePath = null;
    pad.blob = null;
    pad.mimeType = null;
    pad.duration = 0;
    await upsertPadMeta(pad);
  }

  async function deletePadRow(pad) {
    const sb = getClient();
    if (!sb) throw new Error("Supabase is not configured");
    if (pad.storagePath) {
      await sb.storage.from(BUCKET).remove([pad.storagePath]);
    }
    const { error } = await sb.from("pads").delete().eq("id", pad.id);
    if (error) throw error;
  }

  async function savePadFully(pad, sortOrder) {
    if (pad.blob && !pad.storagePath) {
      // Should have been uploaded already; no-op
    }
    await upsertPadMeta(pad, sortOrder);
  }

  /**
   * Persist pad after a local edit.
   * Pass { uploadAudio: true } when the blob changed (record/upload/replace).
   */
  async function publishPad(pad, sortOrder, { uploadAudio = false } = {}) {
    if (!isConfigured()) return;
    if (uploadAudio && pad.blob) {
      await uploadPadAudio(pad, pad.blob, pad.mimeType);
    } else if (!pad.blob && pad.storagePath) {
      await clearPadAudio(pad);
      return;
    }
    await upsertPadMeta(pad, sortOrder);
  }

  /**
   * Update metadata only (rename / shortcut) without re-uploading audio.
   */
  async function publishPadMeta(pad, sortOrder) {
    if (!isConfigured()) return;
    await upsertPadMeta(pad, sortOrder);
  }

  function subscribePads(onChange) {
    const sb = getClient();
    if (!sb) return () => {};
    if (realtimeChannel) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeChannel = sb
      .channel("pads-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pads" },
        () => {
          onChange?.();
        }
      )
      .subscribe();
    return () => {
      if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    };
  }

  window.SoundboardCloud = {
    isConfigured,
    isSignedIn,
    currentUser,
    initAuth,
    signIn,
    signOut,
    loadBoard,
    publishPad,
    publishPadMeta,
    clearPadAudio,
    deletePadRow,
    subscribePads,
    publicUrl,
  };
})();
