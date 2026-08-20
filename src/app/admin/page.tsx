"use client";

/* Admin panel, behind login (/api/admin/*), organized in tabs:
   Art Direction — the server-persisted config every client generation uses
   Generations   — audit trail of artwork generations
   Users         — admin account management
   The prompt-preview logic mirrors buildPrompt() in
   8k-labels-package/src/image-gen.js — keep in sync if the package changes. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const TABS = ["Image Refs", "Image Rules", "Image Play", "Layout Refs", "Layout Play", "Proof Bench", "Fonts", "Hard Rules", "Generations", "Users"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("Image Refs");

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

        {tab === "Image Refs" && <StylesTab />}
        {tab === "Image Play" && <PlaygroundTab />}
        {tab === "Image Rules" && <ArtDirectionTab />}
        {tab === "Layout Refs" && <LayoutTab />}
        {tab === "Layout Play" && <LayoutPlaygroundTab />}
        {tab === "Proof Bench" && <ProofBenchTab />}
        {tab === "Fonts" && <FontsTab />}
        {tab === "Hard Rules" && <HardRulesTab />}
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
  const [recraft, setRecraft] = useState<{ styles: Record<string, { id: string; refCount: number; syncedAt: string }>; keySet: boolean } | null>(null);

  const [falLoras, setFalLoras] = useState<{ loras: Record<string, { url: string; refCount: number; trainedAt: string }>; keySet: boolean } | null>(null);
  const loadRecraft = useCallback(async () => {
    const r = await fetch("/api/admin/recraft-styles");
    if (r.ok) setRecraft(await r.json());
    const f = await fetch("/api/admin/fal-lora");
    if (f.ok) setFalLoras(await f.json());
  }, []);
  useEffect(() => { loadRecraft(); }, [loadRecraft]);

  async function trainLora(style: string) {
    setBusy(`lora-${style}`); setErr("");
    const r = await fetch("/api/admin/fal-lora", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style }),
    });
    const bo = await r.json().catch(() => ({}));
    if (!r.ok) setErr(bo.error || `LoRA training failed (${r.status})`);
    setBusy(""); loadRecraft();
  }

  async function syncRecraft() {
    setBusy("recraft"); setErr("");
    const r = await fetch("/api/admin/recraft-styles", { method: "POST" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) setErr(b.error || `Recraft sync failed (${r.status})`);
    else {
      const bad = Object.entries((b.results || {}) as Record<string, { ok: boolean; error?: string }>)
        .filter(([, v]) => !v.ok).map(([k, v]) => `${k}: ${v.error}`).join(" · ");
      if (bad) setErr("Recraft sync partial — " + bad);
    }
    setBusy(""); loadRecraft();
  }

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
          Every reference image becomes ONE style card: its technique is described and remembered
          under that exact reference, and generation mimics it (style only, never the subject).
          &ldquo;Analyze references&rdquo; processes new uploads; deleting a reference removes its
          style card. Approve/reject in Image Play sticks to the reference permanently.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button style={S.btn} disabled={busy === "recraft" || recraft?.keySet === false} onClick={syncRecraft}>
            {busy === "recraft" ? "Syncing boards to Recraft…" : "Sync boards to Recraft"}
          </button>
          <span style={{ fontSize: 12, color: "#8a887e" }}>
            {recraft === null ? "" : !recraft.keySet
              ? "RECRAFT_API_KEY not set — add it to .env.local to enable the style-conditioning trial"
              : Object.keys(recraft.styles || {}).length
                ? "Recraft styles: " + Object.entries(recraft.styles).map(([k, v]) => `${k} (${v.refCount} refs)`).join(" · ")
                : "key set — press Sync to turn each board into a Recraft style the model can SEE"}
          </span>
        </div>
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
                  {busy === `analyze-${key}` ? "Analyzing…" : "Analyze references"}
                </button>
                <button style={S.btnGhost} disabled={!mine.length || busy === `lora-${key}` || falLoras?.keySet === false}
                  title={falLoras?.keySet === false ? "FAL_KEY not set in .env.local" : "Train a real FLUX LoRA on this board (~$2, a few minutes)"}
                  onClick={() => trainLora(key)}>
                  {busy === `lora-${key}` ? "Training LoRA (minutes)…"
                    : falLoras?.loras?.[key] ? `Retrain FLUX LoRA (done ${new Date(falLoras.loras[key].trainedAt).toLocaleDateString()})`
                    : "Train FLUX LoRA"}
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

/* Verified image rules: plain-English, one per line — every generated image
   is CHECKED against them by a vision model and regenerated on violation. */
function VerifiedRulesSection() {
  const [rules, setRules] = useState<{ global: string; perStyle: Record<string, string> }>({ global: "", perStyle: {} });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/admin/image-rules").then((r) => r.json()).then((b) => { if (b.rules) setRules(b.rules); });
  }, []);
  async function save() {
    setBusy(true); setSaved(false);
    const r = await fetch("/api/admin/image-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    setBusy(false); if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }
  return (
    <div style={S.card}>
      <label style={{ ...S.label, margin: 0 }}>Verified image rules</label>
      <p style={{ fontSize: 12, color: "#6b6a60", margin: "6px 0 10px" }}>
        One rule per line, plain English (e.g. &ldquo;never show people&rdquo;, &ldquo;no text or
        letters inside the artwork&rdquo;, &ldquo;single ink colour only&rdquo;). These actually work:
        every generated image is <b>inspected against them</b> by a vision model — a violator is
        regenerated once with the broken rules made strict, and the playground shows the result of
        the check on every card.
      </p>
      <textarea value={rules.global} placeholder="Rules for ALL styles — one per line"
        onChange={(e) => setRules({ ...rules, global: e.target.value })}
        style={{ ...S.input, minHeight: 70 }} />
      {STYLE_DEFS.map(([k, n]) => (
        <textarea key={k} value={rules.perStyle?.[k] || ""} placeholder={n + " rules — one per line"}
          onChange={(e) => setRules({ ...rules, perStyle: { ...rules.perStyle, [k]: e.target.value } })}
          style={{ ...S.input, minHeight: 46, marginTop: 8 }} />
      ))}
      <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
        <button style={S.btn} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save verified rules"}</button>
        {saved && <span style={{ color: "#5a6b3b", fontSize: 12 }}>Saved ✓ — applies to every next generation</span>}
      </div>
    </div>
  );
}

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
  refUrl?: string | null;
  check?: { ok: boolean; violations: string[] };
  url?: string;
  imageUrl?: string | null;
  prompt?: string;
  error?: string;
}

/** Layout comp status — selection is a STATE (last verdict wins). */
function layoutBadge(w: number | undefined) {
  const v = w ?? 1;
  const [label, color] =
    v > 1 ? ["selected", "#5a6b3b"] : v < 1 ? ["rejected", "#a03030"] : ["unrated", "#8a887e"];
  return (
    <span style={{ fontSize: 11, border: `1px solid ${color}`, color, borderRadius: 4, padding: "1px 7px" }}>
      {label}
    </span>
  );
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
  const [provider, setProvider] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<PlayResult[]>([]);
  const [judged, setJudged] = useState<Record<number, "up" | "down">>({});
  const [keeps, setKeeps] = useState<Record<number, string>>({});
  const [fixes, setFixes] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<FeedbackRow[]>([]);
  const [benchStats, setBenchStats] = useState<{ total: number; approved: number; unrated: number } | null>(null);

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
    setKeeps({}); setFixes({});
    setStatus("generating " + count + " test images (LIVE provider — costs money)…");
    try {
      const r = await fetch("/api/admin/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style, vision: story, count, ...(provider !== "default" ? { provider } : {}) }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || String(r.status));
      setResults(body.results || []);
      setBenchStats(body.benchStats || null);
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
        keep: keeps[i] || "",
        fix: fixes[i] || "",
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
        each. Approving makes a reference style appear more often. Rejecting never demotes the
        reference — it tells the next generation with that reference to try a clearly different
        interpretation. To remove a reference, delete it in Image Refs.
      </p>

      <div style={S.card}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
      <VerifiedRulesSection />
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
          <div>
            <label style={S.label}>Provider (A/B)</label>
            <select style={S.input} value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="default">server default</option>
              <option value="openai">gpt-image</option>
              <option value="recraft">Recraft (sees your boards)</option>
              <option value="flux">FLUX (trained LoRA)</option>
              <option value="hybrid">GPT→FLUX hybrid (story + craft)</option>
            </select>
          </div>
          <button style={S.btn} onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate test batch"}
          </button>
        </div>
        {benchStats && (
          <p style={{ fontSize: 12, color: benchStats.total <= 3 ? "#a06a30" : "#6b6a60", margin: "8px 0 0" }}>
            {benchStats.total} style cards in rotation · {benchStats.approved} boosted by approvals · {benchStats.unrated} not yet judged.
            {benchStats.total <= 3 && " Few cards for this style — upload more references to widen the variety."}
          </p>
        )}
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
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    {res.refUrl && (
                      <figure style={{ margin: 0, width: 110, flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={res.refUrl} alt="reference" style={{ width: "100%", border: "1px solid #999" }} />
                        <figcaption style={{ fontSize: 10, color: "#8a887e", textAlign: "center" }}>the reference it mimics</figcaption>
                      </figure>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={res.url} alt={res.variantLabel} style={{ flex: 1, minWidth: 0, width: "100%" }} />
                  </div>
                  {res.check && !res.check.ok && (
                    <p style={{ fontSize: 11, color: "#a03030", margin: "6px 0 0" }}>⚠ rule check failed even after retry: {res.check.violations.join("; ")}</p>
                  )}
                  {res.check && res.check.ok && (
                    <p style={{ fontSize: 11, color: "#5a6b3b", margin: "6px 0 0" }}>✓ passed your image rules</p>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input
                      style={{ ...S.input, fontSize: 12 }}
                      placeholder="👍 keep: what works (counted even if you reject)"
                      value={keeps[i] || ""}
                      onChange={(e) => setKeeps({ ...keeps, [i]: e.target.value })}
                      disabled={!!judged[i]}
                    />
                    <input
                      style={{ ...S.input, fontSize: 12 }}
                      placeholder="👎 fix: what to correct (counted even if you approve)"
                      value={fixes[i] || ""}
                      onChange={(e) => setFixes({ ...fixes, [i]: e.target.value })}
                      disabled={!!judged[i]}
                    />
                  </div>
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
  h1: { fontSize: 19, fontWeight: 700 },
  tabbar: { display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "2px solid #d8d7cf", marginTop: 8 },
  tab: { font: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 0.2, whiteSpace: "nowrap", background: "transparent", border: "none", borderBottomWidth: 3, borderBottomStyle: "solid", borderBottomColor: "transparent", padding: "7px 9px", cursor: "pointer", color: "#8a887e", marginBottom: -2 },
  tabActive: { color: "#3f4d2a", borderBottomColor: "#5a6b3b" },
  card: { background: "#fff", border: "1px solid #ddd", borderRadius: 8, padding: 14, marginTop: 12 },
  label: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#5a5a52", margin: "10px 0 5px" },
  input: { width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13, padding: "6px 9px", border: "1px solid #ccc", borderRadius: 6, background: "#fdfdfb" },
  btn: { font: "inherit", fontSize: 13, fontWeight: 700, background: "#5a6b3b", color: "#fff", border: "none", borderRadius: 6, padding: "7px 15px", cursor: "pointer" },
  btnGhost: { font: "inherit", fontSize: 13, background: "transparent", color: "#5a6b3b", border: "1px solid #5a6b3b", borderRadius: 6, padding: "6px 12px", cursor: "pointer" },
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

interface LayoutRefRow { id: string; style: string; name: string; url: string; buildRequest?: boolean }
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
  async function toggleBuild(r: LayoutRefRow) {
    await fetch("/api/admin/layout-refs", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, buildRequest: !r.buildRequest }),
    });
    load();
  }
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
        Upload <b>layout</b> references per style. Two separate powers here:
        the 🔨 button on a thumbnail marks that label&apos;s <b>arrangement</b> for Claude to build
        as a real composition; &ldquo;Derive layout language&rdquo; analyses the board for <b>colours
        and font character only</b> — it never creates or moves layouts.
        <br /><span style={{ color: "#8a887e" }}>Honest note on the Rules box: those lines steer ONLY
        the colour/typography analysis. Geometry wishes written there (font sizes, margins, spacing,
        overlaps) have no effect — the engine already enforces geometry mechanically (7pt floor, 5mm
        margins, 1mm gaps, no overlaps), and NEW geometry rules must be told to Claude to become
        code + a verifier. Also: once looks are approved, new derivations only affect future
        playground rolls — approved looks keep their frozen colours and fonts.</span>
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
            {mine.some((r) => r.buildRequest) && (
              <p style={{ fontSize: 13, color: "#5a6b3b", margin: "10px 0 0" }}>
                🔨 {mine.filter((r) => r.buildRequest).length} label(s) marked &ldquo;build as composition&rdquo; —
                tell Claude to build them and they become real layouts in the playground.
              </p>
            )}
            {mine.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                {mine.map((r) => (
                  <div key={r.id} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={r.name} style={{ width: 110, height: 110, objectFit: "cover", border: r.buildRequest ? "3px solid #5a6b3b" : "1px solid #999" }} />
                    <button title={r.buildRequest ? "Unmark — don't build this layout" : "Mark: build this label's layout as a composition"}
                      onClick={() => toggleBuild(r)}
                      style={{ position: "absolute", bottom: 2, left: 2, border: "none", background: r.buildRequest ? "#5a6b3b" : "#fff", color: r.buildRequest ? "#fff" : "#111", cursor: "pointer", lineHeight: 1.2, fontSize: 11, padding: "1px 4px" }}>🔨</button>
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

interface LookArrays { palettes?: unknown[]; heroFonts?: unknown[]; secondaryFonts?: unknown[]; smallFonts?: unknown[] }
interface LayoutCard { seed: number; variant: number; svg: string; st?: string; look?: LookArrays; legacy?: boolean; dead?: number; done?: "approve" | "reject" }

/* the "★ Selected" pseudo-style in the Layout Play dropdown (like Fonts) */
const SEL_STYLE = "__selected";

/* Dead-space flag (owner 2026-08-16): the biggest empty horizontal band on a
   110x80 label rendered WITH artwork (stub injected off-screen), as % of the
   height — the same 20% rule the hard-rules verifier reports. Approximate
   (DOM boxes, not ink) and advisory only. 0 when the comp has no artwork. */
function deadBandPct(svgWithArt: string): number {
  const im = svgWithArt.match(/<image x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  if (!im) return 0;
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:1100px";
  host.innerHTML = svgWithArt;
  document.body.appendChild(host);
  try {
    const svg = host.querySelector("svg");
    if (!svg) return 0;
    const sr = svg.getBoundingClientRect();
    if (!sr.height) return 0;
    const H = 800, SM = 50;
    const spans: [number, number][] = [[+im[2] + +im[4] * 0.15, +im[2] + +im[4] * 0.85]];
    svg.querySelectorAll("text").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height) spans.push([((r.top - sr.top) / sr.height) * H, ((r.bottom - sr.top) / sr.height) * H]);
    });
    const cl = spans.map(([a, b]) => [Math.max(a, SM), Math.min(b, H - SM)] as [number, number])
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let cur = SM, gap = 0;
    for (const [a, b] of cl) { if (a > cur) gap = Math.max(gap, a - cur); cur = Math.max(cur, b); }
    gap = Math.max(gap, H - SM - cur);
    return Math.round((gap / H) * 100);
  } finally { host.remove(); }
}

function LayoutPlaygroundTab() {
  const [style, setStyle] = useState("traditional");
  const [cards, setCards] = useState<LayoutCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [weights, setWeights] = useState<Record<string, number[]>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [approved, setApproved] = useState<LayoutCard[] | null>(null);

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
    // EXPLORATION MODE, always (owner 2026-08-16): rolls strip the weights
    // and looks so every composition and fresh font/colour combination can
    // appear — otherwise approvals lock the playground into re-showing only
    // already-approved material (the loop that hid new comps). What
    // customers actually see lives in "★ Selected layouts".
    let lookArrays: LookArrays = {};
    try {
      const [h, fw] = await Promise.all([
        fetch("/api/layout-hints").then((r) => r.json()),
        fetch("/api/admin/layout-feedback").then((r) => r.json()),
      ]);
      const hints = (h.hints || {}) as Record<string, LookArrays & { weights?: number[]; looks?: unknown[] }>;
      delete (hints as Record<string, unknown>).__looksOnly; // the playground may see everything
      for (const k of Object.keys(hints)) { delete hints[k]?.weights; delete hints[k]?.looks; }
      const hs = hints[style] || {};
      lookArrays = { palettes: hs.palettes, heroFonts: hs.heroFonts, secondaryFonts: hs.secondaryFonts, smallFonts: hs.smallFonts };
      w.LabelEngine.setStyleHints(hints);
      setWeights(fw.weights || {});
    } catch {}
    await w.LabelEngine.ensureFonts();
    // stub artwork for the dead-space measurement render (display stays clean)
    const wImgs = window as unknown as { __LABEL_IMGS__?: Record<string, string> };
    const prevImgs = wImgs.__LABEL_IMGS__;
    const cvs = document.createElement("canvas"); cvs.width = 16; cvs.height = 10;
    const g = cvs.getContext("2d"); if (g) { g.fillStyle = "#888"; g.fillRect(0, 0, 16, 10); }
    const PX = cvs.toDataURL("image/png");
    const seen = new Set<number>(); const next: LayoutCard[] = [];
    let guard = 0;
    while (next.length < 8 && guard++ < 300) {
      const seed = 1 + Math.floor(Math.random() * 100000);
      const variant = w.LabelEngine.variantFor(style, seed);
      if (seen.has(variant) && guard < 250) continue; // distinct comps per roll
      seen.add(variant);
      wImgs.__LABEL_IMGS__ = { traditional: PX, contemporary: PX, punk: PX };
      const artOpts = w.LabelEngine.renderStyleOptions(PLAY_DATA, null, { widthMM: 110, heightMM: 80, seed });
      if (prevImgs) wImgs.__LABEL_IMGS__ = prevImgs; else delete wImgs.__LABEL_IMGS__;
      const opts = w.LabelEngine.renderStyleOptions(PLAY_DATA, null, { widthMM: 110, heightMM: 80, seed });
      const entry = opts.find((o) => o.style === style);
      const artEntry = artOpts.find((o) => o.style === style);
      if (entry) next.push({ seed, variant, svg: entry.svg, look: lookArrays, dead: artEntry ? deadBandPct(artEntry.svg) : 0 });
    }
    setCards(next); setBusy(false);
  }

  /* "★ Selected layouts" gallery (owner 2026-08-16): every approved LOOK of
     every style, reproduced EXACTLY (the engine renders each under its
     frozen hints + seed). Legacy comp-level approvals (made before looks
     existed) still show, labelled — they pin the arrangement only. */
  async function showApproved() {
    setBusy(true); setApproved(null);
    const w = window as unknown as {
      LabelEngine: {
        ensureFonts: () => Promise<void>;
        setStyleHints: (h: unknown) => void;
        variantFor: (k: string, seed: number) => number;
        renderStyleOptions: (d: unknown, o: null, opts: { widthMM: number; heightMM: number; seed: number }) => { style: string; svg: string }[];
      };
    };
    try {
      const [h, fw] = await Promise.all([
        fetch("/api/layout-hints").then((r) => r.json()),
        fetch("/api/admin/layout-feedback").then((r) => r.json()),
      ]);
      setWeights(fw.weights || {});
      await w.LabelEngine.ensureFonts();
      const all: LayoutCard[] = [];
      const looksMap = (fw.looks || {}) as Record<string, { variant: number; seed: number; hints?: LookArrays }[]>;
      for (const [st] of STYLE_DEFS) {
        // exact approved looks: render one at a time under pinned hints
        for (const L of looksMap[st] || []) {
          w.LabelEngine.setStyleHints({ [st]: { looks: [{ variant: L.variant, seed: L.seed, ...(L.hints || {}) }] } });
          const opts = w.LabelEngine.renderStyleOptions(PLAY_DATA, null, { widthMM: 110, heightMM: 80, seed: 1 });
          const entry = opts.find((o) => o.style === st);
          if (entry) all.push({ seed: L.seed, variant: L.variant, svg: entry.svg, st });
        }
        // legacy comp-level approvals (no seed stored): arrangement only
        const wts: number[] = (fw.weights?.[st] || []) as number[];
        const wanted = wts.map((v, i) => (v > 1 ? i : -1)).filter((i) => i >= 0)
          .filter((i) => !(looksMap[st] || []).some((L) => L.variant === i));
        if (wanted.length) {
          const hints = JSON.parse(JSON.stringify(h.hints || {})) as Record<string, { weights?: number[]; looks?: unknown[] }>;
          delete (hints as Record<string, unknown>).__looksOnly;
          for (const k of Object.keys(hints)) { delete hints[k]?.weights; delete hints[k]?.looks; }
          w.LabelEngine.setStyleHints(hints);
          const found = new Map<number, LayoutCard>();
          for (let seed = 1; seed <= 4000 && found.size < wanted.length; seed++) {
            const v = w.LabelEngine.variantFor(st, seed);
            if (!wanted.includes(v) || found.has(v)) continue;
            const opts = w.LabelEngine.renderStyleOptions(PLAY_DATA, null, { widthMM: 110, heightMM: 80, seed });
            const entry = opts.find((o) => o.style === st);
            if (entry) found.set(v, { seed, variant: v, svg: entry.svg, st, legacy: true });
          }
          all.push(...[...found.values()].sort((a, b) => a.variant - b.variant));
        }
      }
      setApproved(all);
    } catch { setApproved([]); }
    setBusy(false);
  }

  /* the gallery loads itself when "★ Selected layouts" is chosen */
  useEffect(() => {
    if (engineReady && style === SEL_STYLE) showApproved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineReady, style]);

  /* Remove = clear that LOOK's history (or the whole comp for legacy cards)
     — out of the selected set without counting as a rejection. */
  async function removeApproved(st: string, variant: number, seed?: number) {
    const r = await fetch("/api/admin/layout-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: st, variant, verdict: "clear", ...(seed !== undefined ? { seed } : {}) }),
    });
    if (r.ok) {
      setWeights((await r.json()).weights || {});
      setApproved((a) => (a ? a.filter((c) => !(c.st === st && c.variant === variant && (seed === undefined || c.seed === seed))) : a));
    }
  }

  /* a verdict judges the complete LOOK: seed + the hint arrays it rendered
     under ride along and are frozen server-side (owner 2026-08-16) */
  async function verdict(i: number, v: "approve" | "reject") {
    const c = cards[i];
    const r = await fetch("/api/admin/layout-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, variant: c.variant, seed: c.seed, hints: c.look || {}, verdict: v, comment: notes[i] || "" }),
    });
    if (r.ok) setWeights((await r.json()).weights || {});
    setCards(cards.map((x, j) => (j === i ? { ...x, done: v } : x)));
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: "#4a4a42" }}>
        Renders real layouts (free — no image generation). Every card is a complete LOOK —
        arrangement + fonts + colours together — and approving it saves exactly that look.
        Once a style has any selected look, customers get ONLY the selected looks (see
        &quot;★ Selected layouts&quot; in the dropdown). Rolls here always explore fresh
        combinations, so there is always something new to approve. Rejecting a card only
        rejects that look, not the arrangement. To move elements inside a composition,
        write the change as a comment and ask Claude to apply it in the engine.
      </p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "14px 0" }}>
        <select value={style} onChange={(e) => { setStyle(e.target.value); setApproved(null); }} style={{ ...S.input, width: 220 }}>
          {STYLE_DEFS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          <option value={SEL_STYLE}>★ Selected layouts</option>
        </select>
        {style !== SEL_STYLE && (
          <button style={S.btn} disabled={!engineReady || busy} onClick={roll}>
            {busy ? "Rendering…" : engineReady ? "Render 8 layouts" : "Loading engine…"}
          </button>
        )}
        {style === SEL_STYLE && (
          <button style={S.btnGhost} disabled={!engineReady || busy} onClick={showApproved}>
            {busy ? "Loading…" : "Refresh"}
          </button>
        )}
      </div>
      {style === SEL_STYLE && approved && approved.length === 0 && !busy && (
        <p style={{ fontSize: 13, color: "#8a887e" }}>
          No layouts selected yet. Pick a style, render layouts and Approve the ones you want —
          they collect here, and customers get ONLY these.
        </p>
      )}
      {style === SEL_STYLE && approved && approved.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, margin: "6px 0 10px" }}>
            Selected layouts — customers see ONLY these {approved.length}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {approved.map((c) => (
              <div key={"ap" + c.st + c.variant + "s" + c.seed} style={{ border: "2px solid #5a6b3b", background: "#fff", padding: 8 }}>
                <div style={{ width: "100%" }} dangerouslySetInnerHTML={{ __html: c.svg.replace(/width="110mm" height="80mm"/, 'width="100%" height="auto"') }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <b style={{ fontSize: 12 }}>{(STYLE_DEFS.find(([k]) => k === c.st) || [, c.st])[1]}</b>
                  <span style={{ fontSize: 11, color: "#8a887e" }}>comp #{c.variant + 1}</span>
                  <b style={{ color: "#5a6b3b", fontSize: 12 }}>Selected ✓</b>
                  {c.legacy && (
                    <span title="Approved before looks existed — pins the arrangement only; fonts and colours still rotate."
                      style={{ fontSize: 11, color: "#a06010", border: "1px solid #a06010", padding: "1px 6px" }}>
                      arrangement only
                    </span>
                  )}
                  <button
                    style={{ ...S.btnGhost, padding: "4px 12px", marginLeft: "auto", color: "#a03030", borderColor: "#a03030" }}
                    title="Take this look out of the selected set (history cleared — not counted as a rejection)"
                    onClick={() => removeApproved(c.st!, c.variant, c.legacy ? undefined : c.seed)}>
                    Remove ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {style !== SEL_STYLE && cards.map((c, i) => (
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
              {layoutBadge(weights[style]?.[c.variant])}
              {(c.dead ?? 0) > 20 && (
                <span title="With artwork, this layout keeps an empty band this tall — consider a comment asking Claude to rebalance it."
                  style={{ fontSize: 11, color: "#a06010", border: "1px solid #a06010", padding: "1px 6px" }}>
                  dead space {c.dead}%
                </span>
              )}
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
   One tab. The style dropdown carries Traditional / Contemporary / Punk plus
   "★ Selected" — the approved pool, grouped per style for the active role.
   Compact cards: both cases previewed, active one highlighted. */

interface FontRow { family: string; weight: number; label: string; styles: string[]; custom?: boolean }
type FontRole = "hero" | "secondary" | "small";
const ROLE_DEFS: { key: FontRole; name: string; hint: string; size: number }[] = [
  { key: "hero", name: "Main text", hint: "the wine name — the biggest word on the label", size: 21 },
  { key: "secondary", name: "Secondary", hint: "appellation and grape variety", size: 16 },
  { key: "small", name: "Small print", hint: "region, vintage, classification, alcohol…", size: 12.5 },
];
const DECK = 15;
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

function FontsTab() {
  const [view, setView] = useState("traditional"); // style key or "selected"
  const [role, setRole] = useState<FontRole>("hero");
  const [sample, setSample] = useState("Château Margaux");
  const [pool, setPool] = useState<FontRow[]>([]);
  const [scores, setScores] = useState<Record<string, Record<FontRole, Record<string, number>>>>({});
  const [casePrefs, setCasePrefs] = useState<Record<string, Partial<Record<FontRole, Record<string, string | null>>>>>({});
  const [deckStart, setDeckStart] = useState(0);
  const [addName, setAddName] = useState("");
  const [addMsg, setAddMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/font-feedback").then((r) => r.json()).then((b) => {
      setPool(b.pool || []); setScores(b.scores || {}); setCasePrefs(b.casePrefs || {});
    });
  }, []);
  useEffect(() => { setDeckStart(0); }, [view, role]);

  const roleDef = ROLE_DEFS.find((r) => r.key === role)!;
  const base = sample || "Château Margaux";
  const scoreIn = (style: string, f: FontRow) => scores[style]?.[role]?.[fontKey(f)] ?? 0;
  const caseIn = (style: string, f: FontRow) =>
    (casePrefs[style]?.[role] || {})[fontKey(f).replace(/\./g, "·")] ?? null;

  async function verdict(style: string, f: FontRow, v: "approve" | "reject") {
    const r = await fetch("/api/admin/font-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, role, family: f.family, weight: f.weight, verdict: v }),
    });
    if (r.ok) setScores((await r.json()).scores || {});
  }
  async function setCase(style: string, f: FontRow, pref: "upper" | null) {
    const r = await fetch("/api/admin/font-case", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style, role, family: f.family, weight: f.weight, pref }),
    });
    if (r.ok) setCasePrefs((await r.json()).casePrefs || {});
  }
  async function addByName() {
    if (!addName.trim() || view === "selected") return;
    setAddMsg("Checking…");
    const r = await fetch("/api/admin/custom-font", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: view, role, name: addName.trim() }),
    });
    const b = await r.json();
    if (r.ok) { setPool(b.pool || []); setScores(b.scores || {}); setAddMsg("Added ✓"); setAddName(""); }
    else setAddMsg(b.error || "failed");
  }

  const btn = { font: "inherit", fontSize: 11, padding: "2px 9px", cursor: "pointer" } as const;

  function card(style: string, f: FontRow, inPool: boolean) {
    const cs = caseIn(style, f);
    return (
      <div key={fontKey(f)} style={{ border: inPool ? "2px solid #5a6b3b" : "1px solid #c2c0b8", background: "#fff", padding: "7px 10px 6px" }}>
        <div style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: roleDef.size, lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", opacity: cs === "upper" ? 1 : 0.3 }}>
          {base.toUpperCase()}
        </div>
        <div style={{ fontFamily: f.family, fontWeight: f.weight, fontSize: roleDef.size, lineHeight: 1.3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: "#222", opacity: cs === "upper" ? 0.3 : 1 }}>
          {base}
        </div>
        <div style={{ fontSize: 10, color: "#8a887e", margin: "3px 0 4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{f.label}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {inPool ? (
            <>
              <span style={{ display: "inline-flex", border: "1px solid #999", borderRadius: 4, overflow: "hidden" }} title="Case on final labels">
                <button onClick={() => setCase(style, f, null)}
                  style={{ ...btn, border: "none", background: cs !== "upper" ? "#5a6b3b" : "#fff", color: cs !== "upper" ? "#fff" : "#4a4a42" }}>Aa</button>
                <button onClick={() => setCase(style, f, "upper")}
                  style={{ ...btn, border: "none", background: cs === "upper" ? "#5a6b3b" : "#fff", color: cs === "upper" ? "#fff" : "#4a4a42" }}>AA</button>
              </span>
              <span style={{ flex: 1 }} />
              <button style={{ ...btn, background: "#fff", border: "1px solid #a03030", borderRadius: 4, color: "#a03030" }}
                onClick={() => verdict(style, f, "reject")}>Remove</button>
            </>
          ) : (
            <>
              <button style={{ ...btn, background: "#fff", border: "1px solid #5a6b3b", borderRadius: 4, color: "#5a6b3b" }}
                onClick={() => verdict(style, f, "approve")}>Approve</button>
              <button style={{ ...btn, background: "#fff", border: "1px solid #a03030", borderRadius: 4, color: "#a03030" }}
                onClick={() => verdict(style, f, "reject")}>Reject</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const grid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 } as const;

  // browse data (real style selected)
  const relevant = pool.filter((f) => view !== "selected" && f.styles.includes(view));
  const candidates = relevant.filter((f) => scoreIn(view, f) === 0);
  const bannedCount = relevant.filter((f) => scoreIn(view, f) < 0).length;
  const deck = candidates.slice(deckStart, deckStart + DECK);
  const selectedByStyle = STYLE_DEFS.map(([k, n]) => [k, n, pool.filter((f) => scoreIn(k, f) > 0)] as const);
  useFontLink(view === "selected" ? selectedByStyle.flatMap(([, , l]) => l) : deck);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "0 0 4px", flexWrap: "wrap" }}>
        <select value={view} onChange={(e) => setView(e.target.value)} style={{ ...S.input, width: 170, padding: "6px 9px", fontSize: 13 }}>
          {STYLE_DEFS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          <option value="selected">★ Selected fonts</option>
        </select>
        <div style={{ display: "flex", border: "1px solid #5a6b3b", borderRadius: 5, overflow: "hidden" }}>
          {ROLE_DEFS.map((r) => (
            <button key={r.key} onClick={() => setRole(r.key)} title={r.hint}
              style={{ font: "inherit", fontSize: 12, padding: "6px 11px", border: "none", cursor: "pointer",
                background: role === r.key ? "#5a6b3b" : "transparent", color: role === r.key ? "#fff" : "#5a6b3b" }}>
              {r.name}
            </button>
          ))}
        </div>
        <input style={{ ...S.input, width: 190, padding: "6px 9px", fontSize: 13 }} value={sample} placeholder="sample text"
          onChange={(e) => setSample(e.target.value)} />
      </div>
      <p style={{ fontSize: 12, color: "#6b6a60", margin: "0 0 12px" }}>
        {view === "selected"
          ? <>Your approved pools for <b>{roleDef.name}</b>, per style. <b>Aa</b> standard grammar · <b>AA</b> always uppercase · Remove bans the font.</>
          : <><b>{roleDef.name}</b> candidates for <b>{view}</b> ({roleDef.hint}). Approving moves a font to ★ Selected.</>}
      </p>

      {view === "selected" ? (
        selectedByStyle.map(([k, n, list]) => (
          <section key={k} style={{ margin: "14px 0 18px" }}>
            <h2 style={{ fontSize: 13, letterSpacing: ".05em", textTransform: "uppercase", borderBottom: "2px solid #111", paddingBottom: 4, margin: "0 0 8px" }}>
              {n} <span style={{ color: "#8a887e", fontWeight: 400, textTransform: "none" }}>— {list.length} in the {roleDef.name} pool</span>
            </h2>
            {list.length
              ? <div style={grid}>{list.map((f) => card(k, f, true))}</div>
              : <p style={{ fontSize: 12, color: "#8a887e", margin: 0 }}>None yet for this role.</p>}
          </section>
        ))
      ) : (
        <>
          <div style={{ border: "1px dashed #5a6b3b", padding: "8px 10px", marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 12 }}>Add a specific font:</b>
            <input style={{ ...S.input, width: 200, padding: "5px 8px", fontSize: 13 }} value={addName}
              placeholder='Google Fonts name, e.g. "Lobster Two"'
              onChange={(e) => { setAddName(e.target.value); setAddMsg(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") addByName(); }} />
            <button style={{ ...S.btn, padding: "5px 13px", fontSize: 12 }} onClick={addByName}>Add to my pool</button>
            {addMsg && <span style={{ fontSize: 11, color: addMsg.startsWith("Added") ? "#5a6b3b" : "#a03030" }}>{addMsg}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "#8a887e" }}>
              {candidates.length} unrated · {bannedCount} rejected (never return)
            </span>
            <button style={{ ...S.btnGhost, padding: "3px 11px", fontSize: 12 }}
              disabled={candidates.length <= DECK}
              onClick={() => setDeckStart((deckStart + DECK) % Math.max(1, candidates.length))}>
              Show new fonts →
            </button>
          </div>
          {deck.length
            ? <div style={grid}>{deck.map((f) => card(view, f, false))}</div>
            : <p style={{ fontSize: 12, color: "#8a887e" }}>All candidates rated — add fonts by name above, or ask Claude to extend the catalog.</p>}
        </>
      )}
    </div>
  );
}

/* ============ HARD RULES (owner, 2026-08-15) ============
   Mechanical constraints enforced in the rendering engine and proven by the
   geometry verifier (tests/parity/check-hard-rules.mjs). Fixed rules are
   shown for reference; tunable ones apply to customers immediately. */
function HardRulesTab() {
  const [minGap, setMinGap] = useState("1");
  const [artFill, setArtFill] = useState("85");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    fetch("/api/admin/hard-rules").then((r) => r.json()).then((b) => {
      if (b.rules) { setMinGap(String(b.rules.minGapMM)); setArtFill(String(b.rules.artFillPct ?? 85)); }
    });
  }, []);
  async function save() {
    setSaved("");
    const r = await fetch("/api/admin/hard-rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minGapMM: Number(minGap), artFillPct: Number(artFill) }),
    });
    const b = await r.json();
    if (r.ok) { setSaved("Saved ✓ — applies to the next render"); setMinGap(String(b.rules.minGapMM)); setArtFill(String(b.rules.artFillPct)); }
    else setSaved(b.error || "failed");
  }
  const row = { display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #e5e4dc", fontSize: 13 } as const;
  return (
    <div style={S.card}>
      <p style={{ fontSize: 13, color: "#4a4a42", marginTop: 0 }}>
        These rules are <b>enforced in the rendering engine</b> — not wishes. Every one is proven by a
        geometry test that renders all styles across seeds and label sizes and measures the output.
        To add a new hard rule, tell Claude — it becomes code plus a verifier.
      </p>
      <div style={row}>
        <b style={{ width: 240 }}>Safe margin</b>
        <span>5 mm — no text may cross it; artwork alone may bleed to the edge</span>
        <span style={{ marginLeft: "auto", color: "#8a887e", fontSize: 11 }}>fixed</span>
      </div>
      <div style={row}>
        <b style={{ width: 240 }}>Minimum font size</b>
        <span>7 pt — nothing prints smaller</span>
        <span style={{ marginLeft: "auto", color: "#8a887e", fontSize: 11 }}>fixed</span>
      </div>
      <div style={row}>
        <b style={{ width: 240 }}>Minimum gap between texts</b>
        <input type="number" min={0} max={5} step={0.5} value={minGap}
          onChange={(e) => setMinGap(e.target.value)}
          style={{ ...S.input, width: 90 }} /> <span>mm</span>
      </div>
      <div style={{ ...row, borderBottom: "none" }}>
        <b style={{ width: 240 }}>Artwork fill of its free area</b>
        <input type="number" min={30} max={100} step={5} value={artFill}
          onChange={(e) => setArtFill(e.target.value)}
          style={{ ...S.input, width: 90 }} /> <span>% — bigger = bolder artwork, may bleed off the label edge</span>
        <button style={{ ...S.btn, marginLeft: 8 }} onClick={save}>Save</button>
        {saved && <span style={{ fontSize: 12, color: saved.startsWith("Saved") ? "#5a6b3b" : "#a03030" }}>{saved}</span>}
      </div>
    </div>
  );
}

/* ================= PROOF BENCH (owner 2026-08-20, POPIKA_IMage&layout_relation) =================
   Judge FINISHED labels — real artwork + layout + fonts together, exactly
   what a customer sees. One verdict per label; a rejection carries "what
   failed" chips so every lesson lands on the right subsystem. Verdicts feed
   /api/admin/proof-feedback (the future harmony critic's corpus). The
   artwork mini-map shows the new image intelligence: quiet zones (usable
   negative space), open side and ink share. */

interface ProofAnalysis {
  quiet: { x: number; y: number; w: number; h: number; density: number }[];
  openSide: string; inkShare: number;
}
interface ProofCard {
  style: string; svg: string; subStyleLabel: string; imgUrl: string;
  analysis: ProofAnalysis | null; done?: string;
}
const PROOF_FAILS = ["image", "arrangement", "fonts", "colour", "interplay"] as const;
const PROOF_STYLES = ["traditional", "contemporary", "punk"] as const;

function ProofBenchTab() {
  const [vision, setVision] = useState("An old man in a wool cap plays the panduri under a fig tree, a rooster pecking at his feet");
  const [wine, setWine] = useState("Saperavi Reserve");
  const [producer, setProducer] = useState("Popiashvili Cellars");
  const [colour, setColour] = useState("Red");
  const [grape, setGrape] = useState("Saperavi");
  const [region, setRegion] = useState("Kakheti, Georgia");
  const [vintage, setVintage] = useState("2023");
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState("");
  const [seed, setSeed] = useState(0);
  const [cards, setCards] = useState<ProofCard[]>([]);
  const [rej, setRej] = useState<Record<string, { chips: string[]; note: string }>>({});
  const [engineReady, setEngineReady] = useState(false);
  const lastResult = useRef<{ images?: Record<string, { url: string; subStyleLabel?: string }>; layoutHints?: Record<string, { imgAnalysis?: ProofAnalysis }> } | null>(null);

  useEffect(() => {
    const w = window as unknown as { LabelEngine?: { ensureFonts: () => Promise<void> } };
    if (w.LabelEngine) { setEngineReady(true); return; }
    const sc = document.createElement("script");
    sc.src = "/engine/label-engine.js";
    sc.onload = () => { w.LabelEngine?.ensureFonts().then(() => setEngineReady(true)); };
    document.body.appendChild(sc);
  }, []);

  const briefData = useCallback(() => {
    const [reg, country] = region.split(",").map((x) => x.trim());
    return {
      producer, wine, appellation: "", classification: "", grape,
      region: reg || "", country: country || "", special: "", vintage,
      wineColorName: colour, wineType: "Still Wine", sweetness: "Dry",
      alcohol: "12.5", volume: "750",
    };
  }, [producer, wine, grape, region, vintage, colour]);

  const renderCards = useCallback((s: number) => {
    const result = lastResult.current; if (!result) return;
    const w = window as unknown as {
      __LABEL_IMGS__?: Record<string, string>;
      LabelEngine: {
        setStyleHints: (h: unknown) => void;
        renderStyleOptions: (d: unknown, o: null, opts: { widthMM: number; heightMM: number; seed: number }) => { style: string; svg: string }[];
      };
    };
    w.__LABEL_IMGS__ = Object.fromEntries(Object.entries(result.images || {}).map(([k, v]) => [k, v.url]));
    w.LabelEngine.setStyleHints(result.layoutHints || {});
    const opts = w.LabelEngine.renderStyleOptions(briefData(), null, { widthMM: 110, heightMM: 80, seed: s });
    setCards(PROOF_STYLES.map((k) => ({
      style: k,
      svg: (opts.find((o) => o.style === k) || { svg: "" }).svg,
      subStyleLabel: result.images?.[k]?.subStyleLabel || "",
      imgUrl: result.images?.[k]?.url || "",
      analysis: (result.layoutHints?.[k]?.imgAnalysis as ProofAnalysis) || null,
    })));
    setRej({});
  }, [briefData]);

  async function generate() {
    setBusy(true); setErr(""); setProg(0.03); setCards([]);
    const s = 1 + Math.floor(Math.random() * 100000);
    setSeed(s);
    try {
      const w = window as unknown as { LabelEngine?: { styleZones?: (s: number) => unknown } };
      const res = await fetch("/api/generate-label-set", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision, reference: null, data: briefData(), seed: s, zones: w.LabelEngine?.styleZones?.(s) || null, aspect: "landscape" }),
      });
      if (!res.ok || !res.body) throw new Error(`generation failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ""; let result: typeof lastResult.current = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress" && msg.total) setProg(0.05 + ((msg.done || 0) / msg.total) * 0.93);
          else if (msg.type === "result") result = msg;
          else if (msg.type === "error") throw new Error(msg.error || "generation failed");
        }
      }
      if (!result?.images) throw new Error("no images came back");
      lastResult.current = result;
      setProg(1);
      renderCards(s);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  function reroll() {
    const s = 1 + Math.floor(Math.random() * 100000);
    setSeed(s);
    renderCards(s);
  }

  async function submit(style: string, verdict: "approve" | "reject") {
    const r = rej[style] || { chips: [], note: "" };
    const c = cards.find((x) => x.style === style);
    await fetch("/api/admin/proof-feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style, verdict,
        failures: verdict === "reject" ? r.chips : [],
        note: r.note, vision, wine, wineColorName: colour, seed,
        subStyle: c?.subStyleLabel, analysis: c?.analysis,
      }),
    });
    setCards((cs) => cs.map((x) => (x.style === style ? { ...x, done: verdict } : x)));
    setRej((m) => { const n = { ...m }; delete n[style]; return n; });
  }

  return (
    <>
      <div style={S.card}>
        <label style={S.label}>Story / vision</label>
        <textarea style={{ ...S.input, minHeight: 54 }} value={vision} onChange={(e) => setVision(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 8 }}>
          <div><label style={S.label}>Wine</label><input style={S.input} value={wine} onChange={(e) => setWine(e.target.value)} /></div>
          <div><label style={S.label}>Producer</label><input style={S.input} value={producer} onChange={(e) => setProducer(e.target.value)} /></div>
          <div><label style={S.label}>Colour</label>
            <select style={S.input} value={colour} onChange={(e) => setColour(e.target.value)}>
              {["Red", "White", "Rosé", "Orange"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label style={S.label}>Grape</label><input style={S.input} value={grape} onChange={(e) => setGrape(e.target.value)} /></div>
          <div><label style={S.label}>Region, Country</label><input style={S.input} value={region} onChange={(e) => setRegion(e.target.value)} /></div>
          <div><label style={S.label}>Vintage</label><input style={S.input} value={vintage} onChange={(e) => setVintage(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <button style={S.btn} disabled={!engineReady || busy} onClick={generate}>
            {busy ? "Printing…" : engineReady ? "Generate proofs" : "Loading engine…"}
          </button>
          {cards.length > 0 && !busy && (
            <button style={S.btnGhost} onClick={reroll}>Re-render layouts (same artwork)</button>
          )}
          {busy && <div style={{ flex: 1, height: 6, background: "#e4e3db", borderRadius: 3 }}>
            <div style={{ width: `${Math.round(prog * 100)}%`, height: "100%", background: "#5a6b3b", borderRadius: 3, transition: "width .4s" }} />
          </div>}
        </div>
        {err && <p style={{ color: "#a03030", fontSize: 13 }}>{err}</p>}
      </div>

      {cards.map((c) => (
        <div key={c.style + seed} style={S.card}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ flex: 1, border: "1px solid #e2e1da" }}
              dangerouslySetInnerHTML={{ __html: c.svg.replace(/width="110mm" height="80mm"/, 'width="100%"') }} />
            <div style={{ width: 170, flex: "none" }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{c.style}</div>
              <div style={{ fontSize: 11, color: "#8a887e", marginBottom: 6 }}>{c.subStyleLabel}</div>
              <div style={{ position: "relative", width: "100%" }}>
                {/* artwork mini-map with quiet zones (image intelligence) */}
                {c.imgUrl && <img src={c.imgUrl} alt="" style={{ width: "100%", display: "block", background: "#fff", border: "1px solid #e2e1da" }} />}
                {(c.analysis?.quiet || []).map((q, i) => (
                  <div key={i} style={{ position: "absolute", left: `${q.x * 100}%`, top: `${q.y * 100}%`, width: `${q.w * 100}%`, height: `${q.h * 100}%`, outline: "2px dashed #5a6b3b", outlineOffset: -2, background: "rgba(90,107,59,0.08)" }} />
                ))}
              </div>
              {c.analysis && (
                <div style={{ fontSize: 10.5, color: "#8a887e", marginTop: 4 }}>
                  quiet zones dashed · open side: {c.analysis.openSide} · ink {Math.round(c.analysis.inkShare * 100)}%
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {c.done ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.done === "approve" ? "#3f6d2a" : "#a03030" }}>
                    {c.done === "approve" ? "✓ recorded" : "✗ recorded"}
                  </span>
                ) : (
                  <>
                    <button style={{ ...S.btn, padding: "5px 12px", fontSize: 12 }} onClick={() => submit(c.style, "approve")}>✓ Good</button>
                    <button style={{ ...S.btnGhost, padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setRej((m) => ({ ...m, [c.style]: m[c.style] || { chips: [], note: "" } }))}>✗ Reject…</button>
                  </>
                )}
              </div>
              {rej[c.style] && !c.done && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10.5, color: "#5a5a52", marginBottom: 4 }}>what failed?</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {PROOF_FAILS.map((f) => {
                      const on = rej[c.style].chips.includes(f);
                      return (
                        <button key={f} onClick={() => setRej((m) => ({ ...m, [c.style]: { ...m[c.style], chips: on ? m[c.style].chips.filter((x) => x !== f) : [...m[c.style].chips, f] } }))}
                          style={{ font: "inherit", fontSize: 11, padding: "3px 8px", borderRadius: 10, cursor: "pointer", border: "1px solid #5a6b3b", background: on ? "#5a6b3b" : "transparent", color: on ? "#fff" : "#5a6b3b" }}>
                          {f}
                        </button>
                      );
                    })}
                  </div>
                  <input style={{ ...S.input, marginTop: 6, fontSize: 12 }} placeholder="optional note"
                    value={rej[c.style].note}
                    onChange={(e) => setRej((m) => ({ ...m, [c.style]: { ...m[c.style], note: e.target.value } }))} />
                  <button style={{ ...S.btnGhost, marginTop: 6, fontSize: 12 }} onClick={() => submit(c.style, "reject")}>Record rejection</button>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

