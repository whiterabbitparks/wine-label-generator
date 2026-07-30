"use client";

/* Admin panel, behind login (/api/admin/*), organized in tabs:
   Art Direction — the server-persisted config every client generation uses
   Generations   — audit trail of artwork generations
   Users         — admin account management
   The prompt-preview logic mirrors buildPrompt() in
   8k-labels-package/src/image-gen.js — keep in sync if the package changes. */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Config {
  preset: string;
  extra: string;
  negative: string;
  template: string;
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

interface UserRow {
  username: string;
  createdAt: string;
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

const TABS = ["Art Direction", "Generations", "Users"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("Art Direction");

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((m) => setAuthed(m.authenticated));
  }, []);

  if (authed === null) return <main style={S.page}>Checking session…</main>;
  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />;

  return (
    <main style={S.page}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={S.h1}>8K Labels — Admin</h1>
          <button
            style={S.btnGhost}
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              setAuthed(false);
            }}
          >
            Log out
          </button>
        </div>

        <nav style={S.tabbar}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "Art Direction" && <ArtDirectionTab />}
        {tab === "Generations" && <GenerationsTab />}
        {tab === "Users" && <UsersTab onSessionLost={() => setAuthed(false)} />}
      </div>
    </main>
  );
}

/* ---------------- Login ---------------- */

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) {
      setError((await r.json()).error || "login failed");
      return;
    }
    onSuccess();
  }

  return (
    <main style={S.page}>
      <form onSubmit={login} style={{ ...S.card, maxWidth: 380, margin: "10vh auto" }}>
        <h1 style={S.h1}>8K Labels — Admin</h1>
        <label style={S.label}>Username</label>
        <input style={S.input} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <label style={S.label}>Password</label>
        <input style={S.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div style={{ color: "#a33", marginTop: 8 }}>{error}</div>}
        <button type="submit" style={{ ...S.btn, marginTop: 16, width: "100%" }}>Sign in</button>
      </form>
    </main>
  );
}

/* ---------------- Art Direction ---------------- */

function ArtDirectionTab() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Config | null>(null);
  const [status, setStatus] = useState("");
  const [testImg, setTestImg] = useState("");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const cfg = await fetch("/api/admin/config").then((r) => r.json());
    setConfig(cfg);
    setSaved(cfg);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (e) {
      setStatus("test generate failed: " + (e instanceof Error ? e.message : String(e)));
    }
    setTesting(false);
  }

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(saved), [config, saved]);
  const preview = useMemo(() => (config ? buildPreviewPrompt(config) : ""), [config]);

  if (!config) return <div style={S.card}>Loading config…</div>;

  return (
    <>
      <p style={{ color: "#6b6a60", marginTop: 14 }}>
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
          <button style={S.btnGhost} onClick={load}>Discard changes</button>
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
    </>
  );
}

/* ---------------- Generations ---------------- */

function GenerationsTab() {
  const [gens, setGens] = useState<GenerationRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/generations");
    if (r.ok) setGens((await r.json()).generations || []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ ...S.label, margin: 0 }}>Recent generations (last 20)</label>
        <button style={S.btnGhost} onClick={load}>Refresh</button>
      </div>
      {!loaded ? (
        <p style={{ color: "#6b6a60" }}>Loading…</p>
      ) : gens.length === 0 ? (
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
  );
}

/* ---------------- Users ---------------- */

function UsersTab({ onSessionLost }: { onSessionLost: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [status, setStatus] = useState("");
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/users");
    if (r.status === 401) {
      onSessionLost();
      return;
    }
    if (r.ok) setUsers((await r.json()).users || []);
  }, [onSessionLost]);

  useEffect(() => {
    load();
  }, [load]);

  async function call(method: string, body: Record<string, string>, okMsg: string) {
    setStatus("");
    const r = await fetch("/api/admin/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const resBody = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStatus("✗ " + (resBody.error || r.status));
      return false;
    }
    setStatus("✓ " + okMsg);
    await load();
    return true;
  }

  return (
    <>
      <div style={S.card}>
        <label style={{ ...S.label, marginTop: 0 }}>Admin users</label>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Username", "Created", "Actions"].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.username}>
                <td style={{ ...S.td, fontWeight: 700 }}>{u.username}</td>
                <td style={S.td}>{new Date(u.createdAt).toLocaleString()}</td>
                <td style={S.td}>
                  <button
                    style={S.linkBtn}
                    onClick={() => {
                      setPwFor(pwFor === u.username ? null : u.username);
                      setPwValue("");
                    }}
                  >
                    change password
                  </button>
                  {" · "}
                  <button
                    style={{ ...S.linkBtn, color: users.length <= 1 ? "#bbb" : "#a33" }}
                    disabled={users.length <= 1}
                    title={users.length <= 1 ? "cannot delete the last admin" : ""}
                    onClick={() => {
                      if (confirm(`Delete admin "${u.username}"?`))
                        call("DELETE", { username: u.username }, `deleted ${u.username}`);
                    }}
                  >
                    delete
                  </button>
                  {pwFor === u.username && (
                    <span style={{ marginLeft: 10 }}>
                      <input
                        style={{ ...S.input, width: 180, display: "inline-block", padding: "5px 8px" }}
                        type="password"
                        placeholder="new password"
                        value={pwValue}
                        onChange={(e) => setPwValue(e.target.value)}
                      />
                      <button
                        style={{ ...S.linkBtn, marginLeft: 6 }}
                        onClick={async () => {
                          if (await call("PATCH", { username: u.username, password: pwValue }, `password changed for ${u.username}`)) {
                            setPwFor(null);
                          }
                        }}
                      >
                        set
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={S.card}>
        <label style={{ ...S.label, marginTop: 0 }}>Create admin user</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ ...S.input, width: 220 }}
            placeholder="username"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
          />
          <input
            style={{ ...S.input, width: 220 }}
            type="password"
            placeholder="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
          />
          <button
            style={S.btn}
            onClick={async () => {
              if (await call("POST", { username: newUser, password: newPass }, `created ${newUser}`)) {
                setNewUser("");
                setNewPass("");
              }
            }}
          >
            Create
          </button>
        </div>
        <p style={{ color: "#6b6a60", fontSize: 12, marginBottom: 0 }}>
          Username: 3–40 chars (letters, digits, . _ -). Password: at least 4 characters.
          New admins can sign in immediately.
        </p>
      </div>

      {status && <div style={{ marginTop: 12, color: status.startsWith("✓") ? "#4a5a2e" : "#a33" }}>{status}</div>}
    </>
  );
}

/* ---------------- styles ---------------- */

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f0f0ee", padding: "32px 20px", fontFamily: "'Hepta Slab', Georgia, serif", color: "#1e1e1e" },
  h1: { fontSize: 26, fontWeight: 700 },
  tabbar: { display: "flex", gap: 4, borderBottom: "2px solid #d8d7cf", marginTop: 10 },
  tab: { font: "inherit", fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", background: "transparent", border: "none", borderBottom: "3px solid transparent", padding: "10px 18px", cursor: "pointer", color: "#8a887e", marginBottom: -2 },
  tabActive: { color: "#3f4d2a", borderBottomColor: "#5a6b3b" },
  card: { background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: 22, marginTop: 18 },
  label: { display: "block", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: "#5a5a52", margin: "14px 0 6px" },
  input: { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 14, padding: "9px 11px", border: "1px solid #ccc", borderRadius: 6, background: "#fdfdfb" },
  btn: { font: "inherit", fontWeight: 700, background: "#5a6b3b", color: "#fff", border: "none", borderRadius: 6, padding: "10px 22px", cursor: "pointer" },
  btnGhost: { font: "inherit", background: "transparent", color: "#5a6b3b", border: "1px solid #5a6b3b", borderRadius: 6, padding: "10px 18px", cursor: "pointer" },
  linkBtn: { font: "inherit", fontSize: 13, background: "none", border: "none", padding: 0, color: "#5a6b3b", textDecoration: "underline", cursor: "pointer" },
  mono: { font: "12px/1.5 Menlo, Consolas, monospace", background: "#f4f3ee", border: "1px solid #e2e1da", borderRadius: 6, padding: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  th: { textAlign: "left", borderBottom: "2px solid #ddd", padding: "6px 8px", fontSize: 11, textTransform: "uppercase", color: "#5a5a52" },
  td: { borderBottom: "1px solid #eee", padding: "6px 8px", verticalAlign: "top" },
};
