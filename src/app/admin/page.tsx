"use client";

/* Admin panel — Art Direction, behind login (/api/admin/*).
   Edits the server-persisted config that every client generation uses.
   The prompt-preview logic mirrors buildPrompt() in
   8k-labels-package/src/image-gen.js — keep in sync if the package changes. */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Config {
  preset: string;
  extra: string;
  negative: string;
  template: string;
}

const PRESETS: Record<string, { label: string; medium: string; composition: string; mood: string }> = {
  engraving: {
    label: "Vintage engraving",
    medium: "a fine, detailed vintage engraving and etching illustration with cross-hatching and delicate line work",
    composition: "a single centred subject with clean negative space around it, designed as a wine-label illustration, no lettering and no border",
    mood: "elegant, heritage, timeless; monochrome ink on cream paper",
  },
  botanical: {
    label: "Botanical line art",
    medium: "a delicate botanical line-art illustration with thin, even strokes in a herbarium style",
    composition: "a centred plant, vine or leaf motif with airy negative space, no lettering and no border",
    mood: "organic, natural and refined",
  },
  watercolor: {
    label: "Soft watercolor",
    medium: "a soft watercolour illustration with gentle washes and subtle paper texture",
    composition: "a centred scene with light, airy margins, no lettering",
    mood: "romantic and artisanal, in a muted natural palette",
  },
  minimal: {
    label: "Minimal line icon",
    medium: "a minimal single-line icon illustration, geometric and made of just a few strokes",
    composition: "one simple centred mark with generous negative space, no lettering",
    mood: "modern, understated and clean",
  },
  bold: {
    label: "Bold graphic",
    medium: "a bold, high-contrast graphic illustration in a screen-print poster style with a limited palette",
    composition: "a strong centred composition with confident shapes, no lettering",
    mood: "expressive, contemporary and punchy",
  },
};

const SAMPLE_STORY = "A vineyard beneath the Caucasus Mountains at golden hour";
const SAMPLE_DATA = { wineColorName: "Red", region: "Kakheti", country: "Georgia", grape: "Saperavi" };

function buildPreviewPrompt(cfg: Config): string {
  const P = PRESETS[cfg.preset] || PRESETS.engraving;
  const ctx = [
    SAMPLE_DATA.wineColorName.toLowerCase() + " wine",
    "from " + SAMPLE_DATA.region + ", " + SAMPLE_DATA.country,
    "grape: " + SAMPLE_DATA.grape,
  ];
  const context = "Context: " + ctx.join("; ") + ". ";
  const rules = cfg.extra.trim() ? " House rules: " + cfg.extra.trim() + "." : "";
  return cfg.template
    .replace("{medium}", P.medium)
    .replace("{subject}", SAMPLE_STORY)
    .replace("{context}", context)
    .replace("{composition}", P.composition)
    .replace("{mood}", P.mood)
    .replace("{reference}", "")
    .replace("{rules}", rules)
    .replace(/\s+/g, " ")
    .trim();
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Config | null>(null);
  const [status, setStatus] = useState("");
  const [testImg, setTestImg] = useState("");
  const [testing, setTesting] = useState(false);
  const [gens, setGens] = useState<GenerationRow[]>([]);

  const loadGenerations = useCallback(async () => {
    const r = await fetch("/api/admin/generations");
    if (r.ok) setGens((await r.json()).generations || []);
  }, []);

  const loadConfig = useCallback(async () => {
    const cfg = await fetch("/api/admin/config").then((r) => r.json());
    setConfig(cfg);
    setSaved(cfg);
  }, []);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then(async (m) => {
        setAuthed(m.authenticated);
        if (m.authenticated) await Promise.all([loadConfig(), loadGenerations()]);
      });
  }, [loadConfig, loadGenerations]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) {
      setLoginError((await r.json()).error || "login failed");
      return;
    }
    setAuthed(true);
    await Promise.all([loadConfig(), loadGenerations()]);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setConfig(null);
    setPassword("");
  }

  async function save() {
    if (!config) return;
    setStatus("saving…");
    const r = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (r.ok) {
      const cfg = await r.json();
      setConfig(cfg);
      setSaved(cfg);
      setStatus("saved ✓ — active for all new client generations");
    } else {
      setStatus("save failed: " + ((await r.json()).error || r.status));
      if (r.status === 401) setAuthed(false);
    }
  }

  async function testGenerate() {
    if (!config) return;
    setTesting(true);
    setTestImg("");
    setStatus("generating test image (uses the LIVE provider — may cost money)…");
    try {
      const r = await fetch("/api/generate-label-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: buildPreviewPrompt(config),
          negative: config.negative,
          size: { w: 1024, h: 640 },
          vision: SAMPLE_STORY,
          data: SAMPLE_DATA,
          art: config,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || String(r.status));
      setTestImg(body.imageDataUrl);
      setStatus(`test image generated (provider: ${body.provider})`);
      loadGenerations();
    } catch (e) {
      setStatus("test generate failed: " + (e instanceof Error ? e.message : String(e)));
    }
    setTesting(false);
  }

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(saved), [config, saved]);
  const preview = useMemo(() => (config ? buildPreviewPrompt(config) : ""), [config]);

  const S = styles;

  if (authed === null) return <main style={S.page}>Checking session…</main>;

  if (!authed) {
    return (
      <main style={S.page}>
        <form onSubmit={login} style={{ ...S.card, maxWidth: 380, margin: "10vh auto" }}>
          <h1 style={S.h1}>8K Labels — Admin</h1>
          <label style={S.label}>Username</label>
          <input style={S.input} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {loginError && <div style={{ color: "#a33", marginTop: 8 }}>{loginError}</div>}
          <button type="submit" style={{ ...S.btn, marginTop: 16, width: "100%" }}>Sign in</button>
        </form>
      </main>
    );
  }

  if (!config) return <main style={S.page}>Loading config…</main>;

  return (
    <main style={S.page}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={S.h1}>Art Direction</h1>
          <button onClick={logout} style={S.btnGhost}>Log out</button>
        </div>
        <p style={{ color: "#6b6a60", marginTop: 0 }}>
          These settings shape every artwork the generator produces. Clients only contribute their story;
          everything below is yours. Changes apply to all new generations after <b>Save</b>.
        </p>

        <div style={S.card}>
          <label style={S.label}>Image style preset</label>
          <select
            style={S.input}
            value={config.preset}
            onChange={(e) => setConfig({ ...config, preset: e.target.value })}
          >
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>{p.label}</option>
            ))}
          </select>

          <label style={S.label}>House rules / art direction (plain English)</label>
          <textarea
            style={{ ...S.input, minHeight: 70 }}
            placeholder="e.g. always monochrome; classical composition; subtle Georgian motifs welcome"
            value={config.extra}
            onChange={(e) => setConfig({ ...config, extra: e.target.value })}
          />

          <label style={S.label}>Negative prompt (what to avoid)</label>
          <textarea
            style={{ ...S.input, minHeight: 70 }}
            value={config.negative}
            onChange={(e) => setConfig({ ...config, negative: e.target.value })}
          />

          <label style={S.label}>
            Prompt template — placeholders: {"{medium} {subject} {context} {composition} {mood} {reference} {rules}"}
          </label>
          <textarea
            style={{ ...S.input, minHeight: 70 }}
            value={config.template}
            onChange={(e) => setConfig({ ...config, template: e.target.value })}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button style={S.btn} onClick={save} disabled={!dirty}>
              {dirty ? "Save" : "Saved"}
            </button>
            <button style={S.btnGhost} onClick={loadConfig}>Discard changes</button>
            <button style={S.btnGhost} onClick={testGenerate} disabled={testing}>
              {testing ? "Generating…" : "Test generate"}
            </button>
          </div>
          {status && <div style={{ marginTop: 10, color: "#4a5a2e" }}>{status}</div>}
        </div>

        <div style={S.card}>
          <label style={S.label}>Assembled prompt preview (with a sample client story)</label>
          <div style={S.mono}>{preview}</div>
          <label style={S.label}>Stored config JSON</label>
          <div style={S.mono}>{JSON.stringify(config, null, 2)}</div>
        </div>

        {testImg && (
          <div style={S.card}>
            <label style={S.label}>Test result</label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={testImg} alt="test generation" style={{ width: "100%", borderRadius: 6 }} />
          </div>
        )}

        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ ...S.label, margin: 0 }}>Recent generations (last 20)</label>
            <button style={S.btnGhost} onClick={loadGenerations}>Refresh</button>
          </div>
          {gens.length === 0 ? (
            <p style={{ color: "#6b6a60" }}>No generations logged yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 10 }}>
                <thead>
                  <tr>
                    {["When", "Provider", "Preset", "OK", "Time", "Image", "Vision / prompt"].map((h) => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gens.map((g, i) => (
                    <tr key={i}>
                      <td style={S.td}>{new Date(g.createdAt).toLocaleString()}</td>
                      <td style={S.td}>{g.provider}</td>
                      <td style={S.td}>{g.preset || "—"}</td>
                      <td style={{ ...S.td, color: g.ok ? "#4a5a2e" : "#a33" }}>{g.ok ? "✓" : "✗"}</td>
                      <td style={S.td}>{(g.durationMs / 1000).toFixed(1)}s</td>
                      <td style={S.td}>
                        {g.imageUrl ? (
                          <a href={g.imageUrl} target="_blank" rel="noreferrer" style={{ color: "#5a6b3b" }}>
                            view
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ ...S.td, maxWidth: 340 }}>
                        {g.vision || g.prompt.slice(0, 120)}
                        {g.error && <div style={{ color: "#a33" }}>{g.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

interface GenerationRow {
  createdAt: string;
  provider: string;
  ok: boolean;
  durationMs: number;
  prompt: string;
  vision: string;
  preset: string;
  error?: string;
  imageUrl?: string;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f0ee", padding: "32px 20px", fontFamily: "'Hepta Slab', Georgia, serif", color: "#1e1e1e" },
  h1: { fontSize: 26, fontWeight: 700 },
  card: { background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: 22, marginTop: 18 },
  label: { display: "block", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "#5a5a52", margin: "14px 0 6px" },
  input: { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 14, padding: "9px 11px", border: "1px solid #ccc", borderRadius: 6, background: "#fdfdfb" },
  btn: { font: "inherit", fontWeight: 700, background: "#5a6b3b", color: "#fff", border: "none", borderRadius: 6, padding: "10px 22px", cursor: "pointer" },
  btnGhost: { font: "inherit", background: "transparent", color: "#5a6b3b", border: "1px solid #5a6b3b", borderRadius: 6, padding: "10px 18px", cursor: "pointer" },
  mono: { font: "12px/1.5 Menlo, Consolas, monospace", background: "#f4f3ee", border: "1px solid #e2e1da", borderRadius: 6, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  th: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "6px 8px", fontSize: 11, textTransform: "uppercase", color: "#5a5a52" },
  td: { borderBottom: "1px solid #eee", padding: "6px 8px", verticalAlign: "top" },
};
