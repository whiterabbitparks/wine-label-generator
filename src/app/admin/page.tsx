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
  perStyle: Record<string, { rules: string; negative: string }>;
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

const TABS = ["Image · Refs", "Image · Rules", "Image · Playground", "Layout · Refs & Rules", "Layout · Playground", "Layout · Fonts", "Layout · My Fonts", "Generations", "Users"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("Image · Refs");

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

        {tab === "Image · Refs" && <StylesTab />}
        {tab === "Image · Playground" && <PlaygroundTab />}
        {tab === "Image · Rules" && <ArtDirectionTab />}
        {tab === "Layout · Refs & Rules" && <LayoutTab />}
        {tab === "Layout · Playground" && <LayoutPlaygroundTab />}
        {tab === "Layout · Fonts" && <FontsTab />}
        {tab === "Layout · My Fonts" && <MyFontsTab />}
        {tab === "Generations" && <GenerationsTab />}
        {tab === "Users" && <UsersTab onSessionLost={() => setAuthed(false)} />}
      </div>
    </main>
  );
}

/* ---------------- Login ---------------- */


/* ---------- Styles: reference boards per style + derived variety ---------- */
const STYLE_DEFS = [
  ["traditional", "Traditional"], ["contemporary", "Contemporary"], ["punk", "Punk"],
] as const;

interface RefRow { id: string; style: string; name: string; url: string; bytes: number }
interface ProfileRow { style: string; summary: string; charter?: string; refCount: number; analyzedAt: string;
  variants: { key: string; label: string; medium: string; composition: string; mood: string; palette: string }[];
  layout?: { palettes: { bg: string; ink: string; acc: string }[];
    type?: { display: string; case: string } | null;
    composition?: { alignment: string } | null } | null }

function StylesTab() {
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/style-refs");
    if (r.ok) {
      const b = await r.json();
      setRefs(b.refs || []);
      setProfiles(b.profiles || {});
    } else setErr((await r.json().catch(() => ({}))).error || `load failed (${r.status})`);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(style: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(`upload-${style}`); setErr("");
    for (const f of Array.from(files)) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const rd = new FileReader();
        rd.onload = () => res(String(rd.result));
        rd.onerror = () => rej(new Error("read failed"));
        rd.readAsDataURL(f);
      });
      const r = await fetch("/api/admin/style-refs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, name: f.name, imageDataUrl: dataUrl }),
      });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || `upload failed (${r.status})`); break; }
    }
    setBusy(""); load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/style-refs?id=${id}`, { method: "DELETE" });
    load();
  }

  async function analyze(style: string) {
    setBusy(`analyze-${style}`); setErr("");
    const r = await fetch("/api/admin/style-refs/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || `analysis failed (${r.status})`);
    setBusy(""); load();
  }

  return (
    <div>
      <div style={S.card}>
        <label style={{ ...S.label, margin: 0 }}>Style reference boards</label>
        <p style={{ fontSize: 13, color: "#6b6a60", margin: "6px 0 0" }}>
          Upload reference images per style — they define the artistic language. &ldquo;Derive
          variety&rdquo; studies the board and produces the variation recipes generation rotates
          through; the reference images themselves are also sent to the image model with every
          generation of that style.
        </p>
        {err && <p style={{ color: "#a33", fontSize: 13 }}>{err}</p>}
      </div>
      {STYLE_DEFS.map(([key, name]) => {
        const mine = refs.filter((r) => r.style === key);
        const prof = profiles[key];
        return (
          <div key={key} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={{ ...S.label, margin: 0 }}>{name} <span style={{ color: "#8a887e" }}>({mine.length} refs)</span></label>
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ ...S.btnGhost, display: "inline-block" }}>
                  {busy === `upload-${key}` ? "Uploading…" : "Upload references"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden
                    onChange={(e) => upload(key, e.target.files)} />
                </label>
                <button style={S.btn} disabled={!mine.length || busy === `analyze-${key}`}
                  onClick={() => analyze(key)}>
                  {busy === `analyze-${key}` ? "Analyzing…" : "Derive variety"}
                </button>
              </div>
            </div>
            {mine.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                {mine.map((r) => (
                  <div key={r.id} style={{ position: "relative", width: 110 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={r.name} style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd" }} />
                    <button title="Remove" onClick={() => remove(r.id)}
                      style={{ position: "absolute", top: 2, right: 2, background: "#fff", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", fontSize: 11, lineHeight: "14px" }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {prof && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 13, color: "#4a4a42", margin: 0 }}><b>Derived language:</b> {prof.summary}</p>
                {prof.charter && (
                  <p style={{ fontSize: 13, color: "#4a4a42", margin: "8px 0 0" }}>
                    <b>Style charter</b> (leads every prompt): {prof.charter}
                  </p>
                )}
                {prof.layout?.palettes?.length ? (
                  <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, letterSpacing: ".06em" }}>LAYOUT PALETTES:</span>
                    {prof.layout.palettes.map((p, i) => (
                      <span key={i} title={`bg ${p.bg} · ink ${p.ink} · accent ${p.acc}`}
                        style={{ display: "inline-flex", border: "1px solid #000" }}>
                        {[p.bg, p.ink, p.acc].map((c) => (
                          <span key={c} style={{ width: 18, height: 18, background: c, display: "inline-block" }} />
                        ))}
                      </span>
                    ))}
                    {prof.layout.type || prof.layout.composition ? (
                      <span style={{ fontSize: 11, letterSpacing: ".06em" }}>
                        {prof.layout.type ? `TYPE: ${prof.layout.type.display} (${prof.layout.type.case})` : ""}
                        {prof.layout.composition ? ` · COMPOSITION: ${prof.layout.composition.alignment}` : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10, marginTop: 10 }}>
                  {prof.variants.map((v) => (
                    <div key={v.key} style={{ ...S.mono, fontSize: 12 }}>
                      <b>{v.label}</b>{v.palette ? ` — ${v.palette}` : ""}
{v.medium}
{v.composition}
{v.mood}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
      const msg = await r
        .json()
        .then((b) => b.error)
        .catch(() => null);
      setError(msg || `login failed (${r.status})`);
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

  const load = useCallback(async () => {
    const cfg = await fetch("/api/admin/config").then((r) => r.json());
    cfg.perStyle = cfg.perStyle || {};
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
      cfg.perStyle = cfg.perStyle || {};
      setConfig(cfg);
      setSaved(cfg);
      setStatus("saved ✓ — active for all new generations");
    } else {
      setStatus("save failed: " + ((await r.json()).error || r.status));
    }
  }

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(saved), [config, saved]);

  if (!config) return <div style={S.card}>Loading config…</div>;

  const tuning = (k: string) => config.perStyle[k] || { rules: "", negative: "" };
  const setTuning = (k: string, field: "rules" | "negative", v: string) =>
    setConfig({
      ...config,
      perStyle: { ...config.perStyle, [k]: { ...tuning(k), [field]: v } },
    });

  return (
    <>
      <p style={{ color: "#6b6a60", marginTop: 14 }}>
        Direction is layered: <b>global</b> rules apply to every artwork, then each style adds its
        own. The reference boards (Styles tab) define each style’s visual language automatically —
        use these fields for corrections and taste the boards can’t express: “more negative space”,
        “never depict people”, “always a hint of terracotta”. Judge results in the Playground.
      </p>

      <div style={S.card}>
        <h3 style={{ margin: "0 0 4px" }}>Global — every style</h3>
        <label style={S.label}>Rules (plain English — what to aim for)</label>
        <textarea
          style={{ ...S.input, minHeight: 60 }}
          placeholder="e.g. classical composition; subtle Georgian motifs welcome"
          value={config.extra}
          onChange={(e) => setConfig({ ...config, extra: e.target.value })}
        />
        <label style={S.label}>Avoid (negative prompt — what must never appear)</label>
        <textarea
          style={{ ...S.input, minHeight: 60 }}
          value={config.negative}
          onChange={(e) => setConfig({ ...config, negative: e.target.value })}
        />
      </div>

      {STYLE_DEFS.map(([k, name]) => (
        <div key={k} style={S.card}>
          <h3 style={{ margin: "0 0 4px" }}>{name}</h3>
          <label style={S.label}>Rules for this style only</label>
          <textarea
            style={{ ...S.input, minHeight: 48 }}
            placeholder="e.g. denser ink coverage; motifs may bleed off one edge"
            value={tuning(k).rules}
            onChange={(e) => setTuning(k, "rules", e.target.value)}
          />
          <label style={S.label}>Avoid for this style only</label>
          <textarea
            style={{ ...S.input, minHeight: 48 }}
            placeholder="e.g. no gradients; no soft washes"
            value={tuning(k).negative}
            onChange={(e) => setTuning(k, "negative", e.target.value)}
          />
        </div>
      ))}

      <div style={S.card}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Advanced: prompt template</summary>
          <p style={{ color: "#6b6a60", fontSize: 13 }}>
            The skeleton every prompt is assembled from. Placeholders are filled per generation:
            {" {medium} "} = the art direction’s technique, {" {subject} "} = the winemaker’s story
            (or wine facts), {" {context} "} = wine colour/region/grape, {" {composition} "} and
            {" {mood} "} = from the art direction, {" {reference} "} = sketch note,
            {" {rules} "} = the rules above. Reorder or reword the connective text if you want a
            different prompt structure — leave it alone otherwise.
          </p>
          <textarea
            style={{ ...S.input, minHeight: 60 }}
            value={config.template}
            onChange={(e) => setConfig({ ...config, template: e.target.value })}
          />
        </details>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button style={S.btn} onClick={save} disabled={!dirty}>
            {dirty ? "Save" : "Saved"}
          </button>
          <button style={S.btnGhost} onClick={load}>Discard changes</button>
        </div>
        {status && <div style={{ marginTop: 10, color: "#4a5a2e" }}>{status}</div>}
      </div>
    </>
  );
}

/* ---------------- Playground: generate, judge, refine ---------------- */

interface PlayResult {
  variantKey: string;
  variantLabel: string;
  weight?: number;
  url?: string;
  imageUrl?: string | null;
  prompt?: string;
  error?: string;
}

/** Learned status of a direction/composition from its feedback weight. */
function weightBadge(w: number | undefined) {
  const v = w ?? 1;
  const [label, color] =
    v >= 1.8 ? ["favourite", "#5a6b3b"] :
    v > 1.05 ? ["boosted", "#5a6b3b"] :
    v <= 0.1 ? ["retired", "#a03030"] :
    v < 0.95 ? ["fading", "#a06a30"] : ["neutral", "#8a887e"];
  return (
    <span style={{ fontSize: 11, border: `1px solid ${color}`, color, borderRadius: 4, padding: "1px 7px" }}>
      {label} ×{v.toFixed(2)}
    </span>
  );
}
interface FeedbackRow {
  id: string;
  style: string;
  variantLabel: string;
  verdict: "up" | "down";
  comment: string;
  imageUrl: string | null;
  createdAt: string;
}

function PlaygroundTab() {
  const [style, setStyle] = useState<string>("traditional");
  const [story, setStory] = useState("");
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<PlayResult[]>([]);
  const [judged, setJudged] = useState<Record<number, "up" | "down">>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<FeedbackRow[]>([]);

  const loadHistory = useCallback(async (st: string) => {
    const r = await fetch("/api/admin/feedback?style=" + st).then((r) => r.json());
    setHistory(r.feedback || []);
  }, []);

  useEffect(() => {
    loadHistory(style);
  }, [style, loadHistory]);

  async function generate() {
    setBusy(true);
    setResults([]);
    setJudged({});
    setComments({});
    setStatus("generating " + count + " test images (LIVE provider — costs money)…");
    try {
      const r = await fetch("/api/admin/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, vision: story, count }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || String(r.status));
      setResults(body.results || []);
      setStatus("done — judge each result below; verdicts refine future generations");
    } catch (e) {
      setStatus("failed: " + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }

  async function judge(i: number, verdict: "up" | "down") {
    const res = results[i];
    if (!res || res.error) return;
    const r = await fetch("/api/admin/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style,
        variantKey: res.variantKey,
        variantLabel: res.variantLabel,
        verdict,
        comment: comments[i] || "",
        imageUrl: res.imageUrl,
        prompt: res.prompt,
        story,
      }),
    });
    if (r.ok) {
      setJudged({ ...judged, [i]: verdict });
      loadHistory(style);
    }
  }

  return (
    <>
      <p style={{ color: "#6b6a60", marginTop: 14 }}>
        Generate a test batch for one style — one image per art direction — then approve or reject
        each. Approved directions appear more often in client generations; rejection comments become
        avoid-rules, approval comments become favour-rules. All automatic from the next generation.
      </p>

      <div style={S.card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={S.label}>Style</label>
            <select style={S.input} value={style} onChange={(e) => setStyle(e.target.value)}>
              {STYLE_DEFS.map(([k, name]) => (
                <option key={k} value={k}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={S.label}>Images</label>
            <select style={S.input} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[2, 4, 6, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button style={S.btn} onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate test batch"}
          </button>
        </div>
        <label style={S.label}>Test story (optional — a default vineyard scene is used when empty)</label>
        <textarea
          style={{ ...S.input, minHeight: 48 }}
          placeholder="e.g. an old vine on a stone terrace above the river"
          value={story}
          onChange={(e) => setStory(e.target.value)}
        />
        {status && <div style={{ marginTop: 10, color: "#4a5a2e" }}>{status}</div>}
      </div>

      {results.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
          {results.map((res, i) => (
            <div key={i} style={S.card}>
              <div style={{ fontSize: 12, letterSpacing: ".04em", marginBottom: 6 }}>
                <b>{res.variantLabel}</b> {weightBadge(res.weight)}
              </div>
              {res.error ? (
                <div style={{ color: "#a33", fontSize: 13 }}>{res.error}</div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={res.url} alt={res.variantLabel} style={{ width: "100%" }} />
                  <input
                    style={{ ...S.input, marginTop: 8 }}
                    placeholder="optional comment (why good / why bad)"
                    value={comments[i] || ""}
                    onChange={(e) => setComments({ ...comments, [i]: e.target.value })}
                    disabled={!!judged[i]}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      style={{ ...S.btn, opacity: judged[i] && judged[i] !== "up" ? 0.4 : 1 }}
                      onClick={() => judge(i, "up")}
                      disabled={!!judged[i]}
                    >
                      {judged[i] === "up" ? "Approved ✓" : "👍 Approve"}
                    </button>
                    <button
                      style={{ ...S.btnGhost, opacity: judged[i] && judged[i] !== "down" ? 0.4 : 1 }}
                      onClick={() => judge(i, "down")}
                      disabled={!!judged[i]}
                    >
                      {judged[i] === "down" ? "Rejected ✕" : "👎 Reject"}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div style={S.card}>
          <h3 style={{ margin: "0 0 8px" }}>Feedback so far — {style}</h3>
          {history.map((f) => (
            <div key={f.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid #ddd" }}>
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.imageUrl} alt="" style={{ width: 56, height: 35, objectFit: "cover" }} />
              ) : (
                <span style={{ width: 56 }} />
              )}
              <span style={{ fontSize: 16 }}>{f.verdict === "up" ? "👍" : "👎"}</span>
              <span style={{ fontSize: 12, flex: 1 }}>
                <b>{f.variantLabel}</b>
                {f.comment ? " — " + f.comment : ""}
              </span>
              <button
                style={{ ...S.btnGhost, padding: "2px 8px" }}
                onClick={async () => {
                  await fetch("/api/admin/feedback?id=" + f.id, { method: "DELETE" });
                  loadHistory(style);
                }}
              >
                ✕
              </button>
            </div>
          ))}
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
            placeholder="username or email"
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
          Username: a handle (letters, digits, . _ % + -) or an email address. Password: at least 4 characters.
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
  tab: { font: "inherit", fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", background: "transparent", border: "none", borderBottomWidth: 3, borderBottomStyle: "solid", borderBottomColor: "transparent", padding: "10px 18px", cursor: "pointer", color: "#8a887e", marginBottom: -2 },
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

/* ================= LAYOUT SECTION (owner, 2026-08-14 restart) =================
   Fully separate from images: layout references + rules feed a vision pass
   that derives the CONCRETE levers the engine consumes (palettes, hero-font
   pool); the playground's approve/reject weights which compositions appear.
   Everything reaches the client via /api/layout-hints — nothing else touches
   layout rendering. */

interface LayoutRefRow { id: string; style: string; name: string; url: string }
interface LayoutProfileRow {
  style: string; notes: string; refCount: number; analyzedAt: string;
  palettes: { bg: string; ink: string; acc: string }[];
  heroFonts: [string, number][];
}
interface LayoutRulesRow { global: string; perStyle: Record<string, string> }

function LayoutTab() {
  const [refs, setRefs] = useState<LayoutRefRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, LayoutProfileRow>>({});
  const [rules, setRules] = useState<LayoutRulesRow>({ global: "", perStyle: {} });
  const [busy, setBusy] = useState(""); const [err, setErr] = useState(""); const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/layout-refs");
    if (r.ok) { const b = await r.json(); setRefs(b.refs || []); setProfiles(b.profiles || {}); setRules(b.rules || { global: "", perStyle: {} }); }
    else setErr((await r.json().catch(() => ({}))).error || `load failed (${r.status})`);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(style: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(`upload-${style}`); setErr("");
    for (const f of Array.from(files)) {
      const dataUrl = await new Promise<string>((res, rej) => {
        const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.onerror = () => rej(new Error("read failed")); rd.readAsDataURL(f);
      });
      const r = await fetch("/api/admin/layout-refs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, name: f.name, imageDataUrl: dataUrl }),
      });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).error || `upload failed (${r.status})`); break; }
    }
    setBusy(""); load();
  }
  async function remove(id: string) { await fetch(`/api/admin/layout-refs?id=${id}`, { method: "DELETE" }); load(); }
  async function analyze(style: string) {
    setBusy(`analyze-${style}`); setErr("");
    const r = await fetch("/api/admin/layout-refs/analyze", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style }),
    });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || `analysis failed (${r.status})`);
    setBusy(""); load();
  }
  async function saveRules() {
    setBusy("rules"); setSaved(false);
    const r = await fetch("/api/admin/layout-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    setBusy(""); if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: "#4a4a42" }}>
        Upload <b>layout</b> references per style (full labels whose layout you like — typography and
        colour are what gets analysed). &ldquo;Derive layout language&rdquo; extracts the palettes and
        hero-font pool the engine will actually use. Rules below are handed to the analysis.
      </p>
      {err && <p style={{ color: "#a03030" }}>{err}</p>}
      {STYLE_DEFS.map(([key, name]) => {
        const mine = refs.filter((r) => r.style === key);
        const prof = profiles[key];
        return (
          <section key={key} style={{ margin: "26px 0", borderTop: "2px solid #111", paddingTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{name} <span style={{ color: "#8a887e", fontSize: 13 }}>({mine.length} layout refs)</span></h2>
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ ...S.btnGhost, display: "inline-block" }}>
                  {busy === `upload-${key}` ? "Uploading…" : "Upload layout refs"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: "none" }}
                    onChange={(e) => upload(key, e.target.files)} />
                </label>
                <button style={S.btn} disabled={!mine.length || busy === `analyze-${key}`} onClick={() => analyze(key)}>
                  {busy === `analyze-${key}` ? "Analysing…" : "Derive layout language"}
                </button>
              </div>
            </div>
            {mine.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                {mine.map((r) => (
                  <div key={r.id} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={r.name} style={{ width: 110, height: 110, objectFit: "cover", border: "1px solid #999" }} />
                    <button title="Delete" onClick={() => remove(r.id)}
                      style={{ position: "absolute", top: 2, right: 2, border: "none", background: "#fff", cursor: "pointer", lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {prof && (
              <div style={{ marginTop: 12, fontSize: 13, color: "#4a4a42" }}>
                <p style={{ margin: 0 }}><b>Derived:</b> {prof.notes}</p>
                {prof.palettes?.length ? (
                  <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, letterSpacing: ".06em" }}>PALETTES:</span>
                    {prof.palettes.map((p, i) => (
                      <span key={i} title={`bg ${p.bg} · ink ${p.ink} · accent ${p.acc}`} style={{ display: "inline-flex", border: "1px solid #000" }}>
                        {[p.bg, p.ink, p.acc].map((c) => (
                          <span key={c} style={{ width: 18, height: 18, background: c, display: "inline-block" }} />
                        ))}
                      </span>
                    ))}
                  </div>
                ) : null}
                {prof.heroFonts?.length ? (
                  <p style={{ margin: "8px 0 0" }}><b>Hero fonts:</b> {prof.heroFonts.map((f) => String(f[0]).split(",")[0].replace(/'/g, "")).join(" · ")}</p>
                ) : null}
              </div>
            )}
            <textarea
              placeholder={`${name} layout rules (plain words — e.g. "always centered", "huge margins", "wine name never smaller than producer")`}
              value={rules.perStyle?.[key] || ""}
              onChange={(e) => setRules({ ...rules, perStyle: { ...rules.perStyle, [key]: e.target.value } })}
              style={{ ...S.input, marginTop: 12, minHeight: 60 }} />
          </section>
        );
      })}
      <section style={{ margin: "26px 0", borderTop: "2px solid #111", paddingTop: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Global layout rules</h2>
        <textarea
          placeholder='Rules that apply to every style (e.g. "generous margins", "never cramped")'
          value={rules.global}
          onChange={(e) => setRules({ ...rules, global: e.target.value })}
          style={{ ...S.input, marginTop: 10, minHeight: 70 }} />
        <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
          <button style={S.btn} disabled={busy === "rules"} onClick={saveRules}>{busy === "rules" ? "Saving…" : "Save rules"}</button>
          {saved && <span style={{ color: "#5a6b3b" }}>Saved ✓</span>}
        </div>
      </section>
    </div>
  );
}

/* Layout playground: renders REAL label layouts with the engine (free — no
   image generation) under the CURRENT curated hints; approve/reject writes
   weights that immediately bias what customers see. */
const PLAY_DATA = {
  producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC",
  grape: "Cabernet Sauvignon", region: "Bordeaux", country: "France", special: "Vieilles Vignes",
  vintage: "2018", classification: "Grand Cru Classé", sweetness: "Dry",
  wineColorName: "Red", wineType: "Still Wine", alcohol: "12.5", volume: "750",
};

interface LayoutCard { seed: number; variant: number; svg: string; done?: "approve" | "reject" }

function LayoutPlaygroundTab() {
  const [style, setStyle] = useState("traditional");
  const [cards, setCards] = useState<LayoutCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [reviewAll, setReviewAll] = useState(false);
  const [weights, setWeights] = useState<Record<string, number[]>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    const w = window as unknown as { LabelEngine?: { ensureFonts: () => Promise<void> } };
    if (w.LabelEngine) { setEngineReady(true); return; }
    const sc = document.createElement("script");
    sc.src = "/engine/label-engine.js";
    sc.onload = () => { w.LabelEngine?.ensureFonts().then(() => setEngineReady(true)); };
    document.body.appendChild(sc);
  }, []);

  async function roll() {
    setBusy(true);
    const w = window as unknown as {
      LabelEngine: {
        ensureFonts: () => Promise<void>;
        setStyleHints: (h: unknown) => void;
        variantFor: (k: string, seed: number) => number;
        renderStyleOptions: (d: unknown, o: null, opts: { widthMM: number; heightMM: number; seed: number }) => { style: string; svg: string }[];
      };
    };
    // render under the SAME hints customers get — including your feedback
    // weights, so rejected comps genuinely stop appearing here too
    try {
      const [h, fw] = await Promise.all([
        fetch("/api/layout-hints").then((r) => r.json()),
        fetch("/api/admin/layout-feedback").then((r) => r.json()),
      ]);
      w.LabelEngine.setStyleHints(h.hints || {});
      setWeights(fw.weights || {});
    } catch {}
    await w.LabelEngine.ensureFonts();
    const seen = new Set<number>(); const next: LayoutCard[] = [];
    let guard = 0;
    while (next.length < 8 && guard++ < 300) {
      const seed = 1 + Math.floor(Math.random() * 100000);
      const variant = w.LabelEngine.variantFor(style, seed);
      // "Review every composition" forces distinct comps (weights ignored, for
      // auditing); the default samples exactly like customer traffic, so a
      // rejected comp shows up about as rarely as customers would see it
      if (reviewAll && seen.has(variant) && guard < 250) continue;
      if (!reviewAll && seen.has(variant) && guard < 40) continue; // light dedupe only
      seen.add(variant);
      const opts = w.LabelEngine.renderStyleOptions(PLAY_DATA, null, { widthMM: 110, heightMM: 80, seed });
      const entry = opts.find((o) => o.style === style);
      if (entry) next.push({ seed, variant, svg: entry.svg });
    }
    setCards(next); setBusy(false);
  }

  async function verdict(i: number, v: "approve" | "reject") {
    const c = cards[i];
    const r = await fetch("/api/admin/layout-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, variant: c.variant, verdict: v, comment: notes[i] || "" }),
    });
    if (r.ok) setWeights((await r.json()).weights || {});
    setCards(cards.map((x, j) => (j === i ? { ...x, done: v } : x)));
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: "#4a4a42" }}>
        Renders real layouts (free — no image generation) with your current layout language applied.
        Approve what looks right, reject what doesn&apos;t — approved compositions appear more often
        for customers, rejected ones fade out. Takes effect immediately.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "14px 0" }}>
        <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ ...S.input, width: 220 }}>
          {STYLE_DEFS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <button style={S.btn} disabled={!engineReady || busy} onClick={roll}>
          {busy ? "Rendering…" : engineReady ? "Render 8 layouts" : "Loading engine…"}
        </button>
        <label style={{ fontSize: 13, color: "#4a4a42", display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={reviewAll} onChange={(e) => setReviewAll(e.target.checked)} />
          Review every composition (ignore my feedback)
        </label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {cards.map((c, i) => (
          <div key={c.seed} style={{ border: "1px solid #bbb", background: "#fff", padding: 8 }}>
            <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: c.svg.replace(/width="110mm" height="80mm"/, 'width="100%" height="auto"') }} />
            {!c.done && (
              <input
                style={{ ...S.input, marginTop: 8, fontSize: 13 }}
                placeholder="optional comment — plain words steer the next derivation"
                value={notes[i] || ""}
                onChange={(e) => setNotes({ ...notes, [i]: e.target.value })}
              />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#8a887e" }}>comp #{c.variant + 1}</span>
              {weightBadge(weights[style]?.[c.variant])}
              {c.done ? (
                <b style={{ color: c.done === "approve" ? "#5a6b3b" : "#a03030" }}>{c.done === "approve" ? "Approved ✓" : "Rejected ✕"}</b>
              ) : (
                <>
                  <button style={{ ...S.btnGhost, padding: "5px 14px" }} onClick={() => verdict(i, "approve")}>Approve</button>
                  <button style={{ ...S.btnGhost, padding: "5px 14px", color: "#a03030", borderColor: "#a03030" }} onClick={() => verdict(i, "reject")}>Reject</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ FONTS (owner, 2026-08-15) ============
   Two tabs share this section:
   - "Layout · Fonts": BROWSE — style-relevant candidate deck + add-by-name.
   - "Layout · My Fonts": the approved pool per style, grouped by role, with
     the Aa/AA case switch and Remove. Keeps the browser uncluttered as the
     pool grows. */

interface FontRow { family: string; weight: number; label: string; styles: string[]; custom?: boolean }
type FontRole = "hero" | "secondary" | "small";
const ROLE_DEFS: { key: FontRole; name: string; hint: string; size: number }[] = [
  { key: "hero", name: "Main text", hint: "the wine name — the biggest word on the label", size: 30 },
  { key: "secondary", name: "Secondary", hint: "appellation and grape variety", size: 22 },
  { key: "small", name: "Small print", hint: "region, vintage, classification, alcohol…", size: 15 },
];
const DECK = 12;
const fontKey = (f: FontRow) => `${f.family}@${f.weight}`;
const gfName = (f: FontRow) => (f.family.match(/'([^']+)'/) || [])[1] || "";

/** Keep a <link> loaded with every Google family currently on screen. */
function useFontLink(visible: FontRow[]) {
  useEffect(() => {
    if (!visible.length) return;
    const fams: Record<string, Set<number>> = {};
    visible.forEach((f) => { const n = gfName(f); if (n) (fams[n] ||= new Set()).add(f.weight); });
    const url = "https://fonts.googleapis.com/css2?" + Object.entries(fams).map(([n, ws]) => {
      const list = [...ws].sort((a, b) => a - b);
      const one400 = list.length === 1 && list[0] === 400;
      return "family=" + n.replace(/ /g, "+") + (one400 ? "" : ":wght@" + list.join(";"));
    }).join("&") + "&display=swap";
    let l = document.getElementById("__adminFontsDyn") as HTMLLinkElement | null;
    if (!l) { l = document.createElement("link"); l.id = "__adminFontsDyn"; l.rel = "stylesheet"; document.head.appendChild(l); }
    if (l.href !== url) l.href = url;
  }, [visible.map(fontKey).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}

function FontPreview({ f, size, upper }: { f: FontRow; size: number; upper: boolean }) {
  return (
    <div style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: size, lineHeight: 1.25, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
      {upper ? "CHÂTEAU MARGAUX" : "Château Margaux"}
    </div>
  );
}

/* ---------------- Browse tab ---------------- */
function FontsTab() {
  const [style, setStyle] = useState("traditional");
  const [role, setRole] = useState<FontRole>("hero");
  const [sample, setSample] = useState("Château Margaux");
  const [pool, setPool] = useState<FontRow[]>([]);
  const [scores, setScores] = useState<Record<string, Record<FontRole, Record<string, number>>>>({});
  const [deckStart, setDeckStart] = useState(0);
  const [addName, setAddName] = useState("");
  const [addMsg, setAddMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/font-feedback").then((r) => r.json()).then((b) => {
      setPool(b.pool || []); setScores(b.scores || {});
    });
  }, []);
  useEffect(() => { setDeckStart(0); }, [style, role]);

  const per = scores[style]?.[role] || {};
  const score = (f: FontRow) => per[fontKey(f)] ?? 0;
  const approvedCount = pool.filter((f) => score(f) > 0).length;
  const relevant = pool.filter((f) => f.styles.includes(style));
  const candidates = relevant.filter((f) => score(f) === 0);
  const bannedCount = relevant.filter((f) => score(f) < 0).length;
  const deck = candidates.slice(deckStart, deckStart + DECK);
  useFontLink(deck);

  async function verdict(f: FontRow, v: "approve" | "reject") {
    const r = await fetch("/api/admin/font-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, role, family: f.family, weight: f.weight, verdict: v }),
    });
    if (r.ok) setScores((await r.json()).scores || {});
  }

  async function addByName() {
    if (!addName.trim()) return;
    setAddMsg("Checking Google Fonts…");
    const r = await fetch("/api/admin/custom-font", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, role, name: addName.trim() }),
    });
    const b = await r.json();
    if (r.ok) {
      setPool(b.pool || []); setScores(b.scores || {});
      setAddMsg(`Added ✓ — "${addName.trim()}" is now in your ${style} ${ROLE_DEFS.find((x) => x.key === role)!.name} pool`);
      setAddName("");
    } else setAddMsg(b.error || "failed");
  }

  const roleDef = ROLE_DEFS.find((r) => r.key === role)!;
  const base = sample || "Château Margaux";

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "0 0 6px", flexWrap: "wrap" }}>
        <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ ...S.input, width: 180 }}>
          {STYLE_DEFS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <div style={{ display: "flex", border: "1px solid #5a6b3b", borderRadius: 6, overflow: "hidden" }}>
          {ROLE_DEFS.map((r) => (
            <button key={r.key} onClick={() => setRole(r.key)} title={r.hint}
              style={{ font: "inherit", fontSize: 13, padding: "8px 14px", border: "none", cursor: "pointer",
                background: role === r.key ? "#5a6b3b" : "transparent", color: role === r.key ? "#fff" : "#5a6b3b" }}>
              {r.name}
            </button>
          ))}
        </div>
        <input style={{ ...S.input, width: 220 }} value={sample} placeholder="sample text"
          onChange={(e) => setSample(e.target.value)} />
      </div>
      <p style={{ fontSize: 13, color: "#4a4a42", margin: "0 0 14px" }}>
        Browsing candidates for <b>{style}</b> · <b>{roleDef.name}</b> ({roleDef.hint}).
        Approved fonts move to the <b>My Fonts</b> tab ({approvedCount} there now).
      </p>

      <div style={{ border: "1px dashed #5a6b3b", padding: "12px 14px", marginBottom: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Add a specific font:</b>
        <input style={{ ...S.input, width: 220 }} value={addName} placeholder='exact Google Fonts name, e.g. "Lobster Two"'
          onChange={(e) => { setAddName(e.target.value); setAddMsg(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") addByName(); }} />
        <button style={{ ...S.btn, padding: "7px 16px" }} onClick={addByName}>Add to my pool</button>
        {addMsg && <span style={{ fontSize: 12, color: addMsg.startsWith("Added") ? "#5a6b3b" : "#a03030" }}>{addMsg}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, margin: "0 0 8px", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 15, letterSpacing: ".04em", margin: 0 }}>New candidates</h2>
        <span style={{ fontSize: 12, color: "#8a887e" }}>
          {candidates.length} unrated · {bannedCount} rejected (never shown again)
        </span>
        <button style={{ ...S.btnGhost, padding: "5px 14px", fontSize: 13 }}
          disabled={candidates.length <= DECK}
          onClick={() => setDeckStart((deckStart + DECK) % Math.max(1, candidates.length))}>
          Show new fonts →
        </button>
      </div>
      {deck.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {deck.map((f) => (
            <div key={fontKey(f)} style={{ border: "1px solid #bbb", background: "#fff", padding: "10px 14px" }}>
              <div style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: roleDef.size * 1.15, lineHeight: 1.25, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {base.toUpperCase()}
              </div>
              <div style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: roleDef.size, lineHeight: 1.25, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: "#333" }}>
                {base}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#8a887e", flex: 1 }}>{f.label}</span>
                <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 12 }} onClick={() => verdict(f, "approve")}>Approve</button>
                <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 12, color: "#a03030", borderColor: "#a03030" }} onClick={() => verdict(f, "reject")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "#8a887e" }}>
          You&rsquo;ve rated every candidate for this style and role — add fonts by name above, or
          tell Claude which direction to extend the catalog.
        </p>
      )}
    </div>
  );
}

/* ---------------- My Fonts tab: the approved pool ---------------- */
function MyFontsTab() {
  const [style, setStyle] = useState("traditional");
  const [pool, setPool] = useState<FontRow[]>([]);
  const [scores, setScores] = useState<Record<string, Record<FontRole, Record<string, number>>>>({});
  const [casePrefs, setCasePrefs] = useState<Record<string, Partial<Record<FontRole, Record<string, string | null>>>>>({});

  useEffect(() => {
    fetch("/api/admin/font-feedback").then((r) => r.json()).then((b) => {
      setPool(b.pool || []); setScores(b.scores || {}); setCasePrefs(b.casePrefs || {});
    });
  }, []);

  const approvedFor = (role: FontRole) => {
    const per = scores[style]?.[role] || {};
    return pool.filter((f) => (per[fontKey(f)] ?? 0) > 0);
  };
  const allApproved = ROLE_DEFS.flatMap((r) => approvedFor(r.key));
  useFontLink(allApproved);

  async function remove(role: FontRole, f: FontRow) {
    const r = await fetch("/api/admin/font-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, role, family: f.family, weight: f.weight, verdict: "reject" }),
    });
    if (r.ok) setScores((await r.json()).scores || {});
  }
  async function setCase(role: FontRole, f: FontRow, pref: "upper" | null) {
    const r = await fetch("/api/admin/font-case", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, role, family: f.family, weight: f.weight, pref }),
    });
    if (r.ok) setCasePrefs((await r.json()).casePrefs || {});
  }
  const caseOf = (role: FontRole, f: FontRow) =>
    (casePrefs[style]?.[role] || {})[fontKey(f).replace(/\./g, "·")] ?? null;

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "0 0 8px" }}>
        <select value={style} onChange={(e) => setStyle(e.target.value)} style={{ ...S.input, width: 180 }}>
          {STYLE_DEFS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#4a4a42" }}>
          These fonts are live on <b>{style}</b> labels. <b>Aa</b> standard grammar · <b>AA</b> always uppercase · Remove bans it.
        </span>
      </div>
      {ROLE_DEFS.map((r) => {
        const list = approvedFor(r.key);
        return (
          <section key={r.key} style={{ margin: "20px 0", borderTop: "2px solid #111", paddingTop: 10 }}>
            <h2 style={{ fontSize: 15, letterSpacing: ".04em", margin: "0 0 8px" }}>
              {r.name} <span style={{ color: "#8a887e", fontWeight: 400, fontSize: 12 }}>({r.hint}) — {list.length} approved</span>
            </h2>
            {list.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {list.map((f) => (
                  <div key={fontKey(f)} style={{ border: "2px solid #5a6b3b", background: "#fff", padding: "10px 14px" }}>
                    <div style={{ opacity: caseOf(r.key, f) === "upper" ? 1 : 0.35 }}>
                      <FontPreview f={f} size={r.size * 1.1} upper={true} />
                    </div>
                    <div style={{ opacity: caseOf(r.key, f) === "upper" ? 0.35 : 1, color: "#333" }}>
                      <FontPreview f={f} size={r.size} upper={false} />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "#8a887e", flex: 1 }}>{f.label}</span>
                      <span style={{ display: "inline-flex", border: "1px solid #888", borderRadius: 5, overflow: "hidden" }} title="Case for this font on final labels">
                        <button onClick={() => setCase(r.key, f, null)}
                          style={{ font: "inherit", fontSize: 12, padding: "2px 8px", border: "none", cursor: "pointer",
                            background: caseOf(r.key, f) !== "upper" ? "#5a6b3b" : "#fff", color: caseOf(r.key, f) !== "upper" ? "#fff" : "#4a4a42" }}>Aa</button>
                        <button onClick={() => setCase(r.key, f, "upper")}
                          style={{ font: "inherit", fontSize: 12, padding: "2px 8px", border: "none", cursor: "pointer",
                            background: caseOf(r.key, f) === "upper" ? "#5a6b3b" : "#fff", color: caseOf(r.key, f) === "upper" ? "#fff" : "#4a4a42" }}>AA</button>
                      </span>
                      <button style={{ ...S.btnGhost, padding: "3px 10px", fontSize: 12, color: "#a03030", borderColor: "#a03030" }}
                        onClick={() => remove(r.key, f)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "#8a887e" }}>Nothing approved yet — pick fonts in the Layout · Fonts tab.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
