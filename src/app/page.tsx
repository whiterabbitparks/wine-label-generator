"use client";

/* THE TASTING JOURNEY (owner-approved concept, 2026-08-17, branch
   UX_Tasting_Journey) — the customer-facing flow rebuilt as a journey:

     Calibration (swipe approved looks, taste profile)
       → Sommelier Interview (one question at a time)
       → Print House (generation staged as craft theatre)
       → Tasting Flight (eliminate / crown a winner)
       → Winner (tier cards, payments arrive later)

   The label ENGINE, admin panel and all curation (approved looks, fonts,
   rules) are untouched — this is only a new shell. The classic configurator
   lives on at /classic. House UI rules: Special Elite (already global via
   configurator.css), white ground, #E3E3E1 grey accents, black 2px lines. */

import { useCallback, useEffect, useRef, useState } from "react";

type Look = { variant: number; seed: number } & Record<string, unknown>;
type Engine = {
  ensureFonts: () => Promise<void>;
  setStyleHints: (h: unknown) => void;
  styleZones: (seed: number) => unknown;
  renderStyleOptions: (d: unknown, o: null, opts: { widthMM: number; heightMM: number; seed: number }) => { style: string; svg: string }[];
};
type Stage = "intro" | "calibrate" | "interview" | "printing" | "flight" | "winner";

const STYLE_NAMES: Record<string, string> = { traditional: "Traditional", contemporary: "Contemporary", punk: "Punk" };

/* neutral, handsome demo data for the calibration deck (before we know the wine) */
const CAL_DATA = {
  producer: "GRAND VIN", wine: "Château Margaux", appellation: "Margaux AOC",
  grape: "Cabernet Sauvignon", region: "Bordeaux", country: "France",
  special: "Vieilles Vignes", vintage: "2018", classification: "Grand Cru Classé",
  sweetness: "Dry", wineColorName: "Red", wineType: "Still Wine", alcohol: "12.5", volume: "750",
};

const INK = "#111";
const GREY = "#E3E3E1";
const SUBT = "#8a887e";

const S = {
  page: { minHeight: "100vh", background: "#fff", color: INK, fontFamily: "'Special Elite', monospace", display: "flex", flexDirection: "column" as const, alignItems: "center" },
  col: { width: "min(940px, 92vw)", display: "flex", flexDirection: "column" as const, alignItems: "center", flex: 1 },
  h1: { fontSize: 19, letterSpacing: 2, margin: "26px 0 0", fontWeight: 400 },
  big: { fontSize: 30, lineHeight: 1.35, textAlign: "center" as const, margin: "0 0 26px", fontWeight: 400 },
  sub: { fontSize: 13.3, color: SUBT, textAlign: "center" as const, maxWidth: 560, lineHeight: 1.7 },
  btn: { fontFamily: "inherit", fontSize: 13.3, letterSpacing: 1, background: "#fff", color: INK, border: `2px solid ${INK}`, padding: "12px 34px", cursor: "pointer" },
  btnGrey: { fontFamily: "inherit", fontSize: 13.3, letterSpacing: 1, background: GREY, color: INK, border: `2px solid ${INK}`, padding: "12px 34px", cursor: "pointer" },
  ghost: { fontFamily: "inherit", fontSize: 12, background: "transparent", color: SUBT, border: "none", cursor: "pointer", textDecoration: "underline" },
  input: { fontFamily: "inherit", fontSize: 22, border: "none", borderBottom: `2px solid ${INK}`, outline: "none", padding: "8px 4px", width: "min(560px, 84vw)", textAlign: "center" as const, background: "transparent" },
  card: { border: `2px solid ${INK}`, background: "#fff", padding: 10, width: "min(680px, 90vw)" },
  chip: (on: boolean) => ({ fontFamily: "inherit", fontSize: 13.3, border: `2px solid ${INK}`, background: on ? INK : "#fff", color: on ? "#fff" : INK, padding: "10px 20px", cursor: "pointer" }),
  bar: { height: 3, background: GREY, width: "100%", position: "relative" as const },
  barFill: (f: number) => ({ position: "absolute" as const, left: 0, top: 0, bottom: 0, width: `${Math.round(f * 100)}%`, background: INK, transition: "width .4s" }),
};

/* ---- interview script ---- */
interface Q {
  key: string; ask: string; hint?: string; placeholder?: string;
  optional?: boolean; kind?: "text" | "chips" | "pair" | "story";
  chips?: string[]; pair?: [string, string, string, string]; // keyA, phA, keyB, phB
}
const QUESTIONS: Q[] = [
  { key: "wine", ask: "What is the wine called?", placeholder: "e.g. Château Margaux", hint: "the name that goes biggest on the label" },
  { key: "producer", ask: "Who makes it?", placeholder: "estate or producer", optional: true },
  { key: "color", ask: "What's in the bottle?", kind: "chips", chips: ["Red", "White", "Rosé", "Orange", "Sparkling"] },
  { key: "grape", ask: "Which grape?", placeholder: "e.g. Saperavi", optional: true },
  { key: "appellation", ask: "Appellation or region name on the label?", placeholder: "e.g. Margaux AOC", optional: true },
  { key: "rc", ask: "Where does it come from?", kind: "pair", pair: ["region", "region", "country", "country"], optional: true },
  { key: "vintage", ask: "Which vintage?", placeholder: "e.g. 2018", optional: true },
  { key: "cs", ask: "Anything official or special to add?", kind: "pair", pair: ["classification", "classification (e.g. Grand Cru)", "special", "e.g. Vieilles Vignes"], optional: true },
  { key: "av", ask: "Alcohol and volume?", kind: "pair", pair: ["alcohol", "12.5", "volume", "750"], optional: true, hint: "press next to keep 12.5% / 750 mL" },
  { key: "vision", ask: "Now — tell me one true thing about this wine that nobody else can say.", kind: "story", hint: "a place, a memory, a person, a picture in your head. this becomes your artwork.", optional: true },
];

const PRINT_STAGES = [
  "Reading your story…",
  "Mixing the inks…",
  "Cutting the plates…",
  "Proofing on the press…",
  "Hanging the prints to dry…",
];

export default function Journey() {
  const [stage, setStage] = useState<Stage>("intro");
  const [engineReady, setEngineReady] = useState(false);
  const engRef = useRef<Engine | null>(null);
  const hintsRef = useRef<Record<string, { looks?: Look[] }>>({});

  /* calibration */
  const [deck, setDeck] = useState<{ st: string; look: Look; svg: string }[]>([]);
  const [deckIdx, setDeckIdx] = useState(0);
  const tasteRef = useRef<Record<string, number>>({}); // per style tally
  const lovedRef = useRef<Set<string>>(new Set());     // st#seed of loved looks

  /* interview */
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({ alcohol: "12.5", volume: "750" });

  /* printing */
  const [printFrac, setPrintFrac] = useState(0);
  const [printMsg, setPrintMsg] = useState(PRINT_STAGES[0]);
  const [genError, setGenError] = useState("");

  /* flight */
  const flightQueue = useRef<{ st: string; look: Look }[]>([]);
  const [glasses, setGlasses] = useState<{ st: string; look: Look; svg: string }[]>([]);
  const [winner, setWinner] = useState<{ st: string; look: Look; svg: string } | null>(null);

  /* ---- engine bootstrap ---- */
  useEffect(() => {
    const w = window as unknown as { LabelEngine?: Engine };
    const boot = async () => {
      const [h] = await Promise.all([fetch("/api/layout-hints").then((r) => r.json()).catch(() => ({ hints: {} }))]);
      hintsRef.current = (h.hints || {}) as Record<string, { looks?: Look[] }>;
      await w.LabelEngine!.ensureFonts();
      engRef.current = w.LabelEngine!;
      setEngineReady(true);
    };
    if (w.LabelEngine) { boot(); return; }
    const sc = document.createElement("script");
    sc.src = "/engine/label-engine.js";
    sc.onload = () => boot();
    document.body.appendChild(sc);
  }, []);

  const renderLook = useCallback((st: string, look: Look, data: Record<string, string>): string => {
    const eng = engRef.current; if (!eng) return "";
    eng.setStyleHints({ [st]: { looks: [look] } });
    const opts = eng.renderStyleOptions(data, null, { widthMM: 110, heightMM: 80, seed: 1 });
    return opts.find((o) => o.style === st)?.svg || "";
  }, []);

  const allLooks = useCallback((): { st: string; look: Look }[] => {
    const out: { st: string; look: Look }[] = [];
    for (const [st, e] of Object.entries(hintsRef.current)) {
      if (st.startsWith("__") || !e?.looks?.length) continue;
      for (const look of e.looks) out.push({ st, look });
    }
    return out;
  }, []);

  /* ---- calibration deck ---- */
  const startCalibration = useCallback(() => {
    const w = window as unknown as { __LABEL_IMGS__?: unknown };
    delete w.__LABEL_IMGS__; // no artwork yet — the deck shows pure looks
    const pool = allLooks();
    if (!pool.length) { setStage("interview"); return; } // nothing curated yet
    // shuffle deterministically-ish, cap at 10
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    setDeck(shuffled.map(({ st, look }) => ({ st, look, svg: renderLook(st, look, CAL_DATA) })));
    setDeckIdx(0);
    setStage("calibrate");
  }, [allLooks, renderLook]);

  const vote = useCallback((love: boolean) => {
    const c = deck[deckIdx]; if (!c) return;
    if (love) {
      tasteRef.current[c.st] = (tasteRef.current[c.st] || 0) + 1;
      lovedRef.current.add(`${c.st}#${c.look.seed}`);
    }
    if (deckIdx + 1 >= deck.length) setStage("interview");
    else setDeckIdx(deckIdx + 1);
  }, [deck, deckIdx]);

  useEffect(() => {
    if (stage !== "calibrate") return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") vote(true);
      if (e.key === "ArrowLeft") vote(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stage, vote]);

  /* ---- interview ---- */
  const q = QUESTIONS[qIdx];
  const setA = (k: string, v: string) => setAnswers((a) => ({ ...a, [k]: v }));
  const nextQ = useCallback(() => {
    if (QUESTIONS[qIdx].key === "wine" && !String(answers.wine || "").trim()) return;
    if (qIdx + 1 >= QUESTIONS.length) startPrinting();
    else setQIdx(qIdx + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx, answers]);

  /* ---- printing (generation) ---- */
  const briefData = useCallback((): Record<string, string> => {
    const a = answers;
    const colour = a.color || "Red";
    return {
      producer: a.producer || "", wine: a.wine || "", appellation: a.appellation || "",
      classification: a.classification || "", grape: a.grape || "", region: a.region || "",
      country: a.country || "", special: a.special || "", vintage: a.vintage || "",
      wineColorName: colour === "Sparkling" ? "White" : colour,
      wineType: colour === "Sparkling" ? "Sparkling Wine" : "Still Wine",
      alcohol: a.alcohol || "12.5", volume: a.volume || "750",
    };
  }, [answers]);

  const startPrinting = useCallback(async () => {
    setStage("printing"); setGenError(""); setPrintFrac(0.02); setPrintMsg(PRINT_STAGES[0]);
    const eng = engRef.current;
    const seed = 1 + Math.floor(Math.random() * 100000);
    const data = briefData();
    try {
      const res = await fetch("/api/generate-label-set", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision: answers.vision || "", reference: null, data, seed, zones: eng?.styleZones(seed) || null, aspect: "landscape" }),
      });
      if (!res.ok || !res.body) throw new Error(`generation failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = ""; let result: { images?: Record<string, { url: string }>; layoutHints?: unknown } | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.type === "progress" && msg.total) {
            const f = (msg.done || 0) / msg.total;
            setPrintFrac(0.05 + f * 0.9);
            setPrintMsg(PRINT_STAGES[Math.min(PRINT_STAGES.length - 1, Math.floor(f * PRINT_STAGES.length))]);
          } else if (msg.type === "result") result = msg;
          else if (msg.type === "error") throw new Error(msg.error || "generation failed");
        }
      }
      if (!result?.images) throw new Error("no images came back");
      const w = window as unknown as { __LABEL_IMGS__?: Record<string, string> };
      w.__LABEL_IMGS__ = Object.fromEntries(Object.entries(result.images).map(([k, v]) => [k, v.url]));
      if (result.layoutHints) hintsRef.current = (result.layoutHints || {}) as Record<string, { looks?: Look[] }>;
      setPrintFrac(1);
      startFlight(data);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, briefData]);

  /* ---- flight ---- */
  const startFlight = useCallback((data: Record<string, string>) => {
    const pool = allLooks();
    if (!pool.length) { setGenError("No approved looks are curated yet — the flight is empty."); return; }
    // taste order: loved looks first, then loved styles, then the rest
    const score = (c: { st: string; look: Look }) =>
      (lovedRef.current.has(`${c.st}#${c.look.seed}`) ? 100 : 0) + (tasteRef.current[c.st] || 0);
    const ordered = [...pool].sort((a, b) => score(b) - score(a));
    const first = ordered.slice(0, 4);
    flightQueue.current = ordered.slice(4);
    setGlasses(first.map(({ st, look }) => ({ st, look, svg: renderLook(st, look, data) })));
    setWinner(null);
    setStage("flight");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLooks, renderLook]);

  const eliminate = (i: number) => {
    setGlasses((g) => {
      const next = [...g];
      const rep = flightQueue.current.shift();
      if (rep) next[i] = { st: rep.st, look: rep.look, svg: renderLook(rep.st, rep.look, briefData()) };
      else next.splice(i, 1);
      return next;
    });
  };
  const crown = (i: number) => { setWinner(glasses[i]); setStage("winner"); };

  /* =============================== render =============================== */
  const header = (
    <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 0 14px", borderBottom: `2px solid ${INK}` }}>
      <span style={S.h1}>8K LABELS</span>
      <a href="/classic" style={{ ...S.ghost, fontSize: 11 }}>classic version</a>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.col}>
        {header}

        {stage === "intro" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, flex: 1, justifyContent: "center" }}>
            <p style={S.big}>Your wine has a story.<br />Let&apos;s print it.</p>
            <p style={S.sub}>
              A few minutes from now you&apos;ll be tasting a flight of label designs made for your wine —
              drawn, typeset and inked around what you tell us. First, a quick look at what you like.
            </p>
            <button style={S.btnGrey} disabled={!engineReady} onClick={startCalibration}>
              {engineReady ? "Begin" : "Warming up the press…"}
            </button>
          </div>
        )}

        {stage === "calibrate" && deck[deckIdx] && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, flex: 1, justifyContent: "center", padding: "20px 0" }}>
            <p style={{ ...S.sub, margin: 0 }}>Does this one speak to you? ({deckIdx + 1}/{deck.length})</p>
            <div style={S.card} dangerouslySetInnerHTML={{ __html: deck[deckIdx].svg.replace(/width="110mm" height="80mm"/, 'width="100%" height="auto"') }} />
            <div style={{ display: "flex", gap: 18 }}>
              <button style={S.btn} onClick={() => vote(false)}>← Not for me</button>
              <button style={S.btnGrey} onClick={() => vote(true)}>Love it →</button>
            </div>
            <button style={S.ghost} onClick={() => setStage("interview")}>skip the tasting, go straight to my wine</button>
          </div>
        )}

        {stage === "interview" && q && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, flex: 1, justifyContent: "center", width: "100%", padding: "20px 0" }}>
            <div style={{ ...S.bar, maxWidth: 560 }}><div style={S.barFill(qIdx / QUESTIONS.length)} /></div>
            <p style={{ ...S.big, marginBottom: 0 }}>{q.ask}</p>
            {q.hint && <p style={{ ...S.sub, marginTop: -10 }}>{q.hint}</p>}

            {(!q.kind || q.kind === "text") && (
              <input autoFocus style={S.input} placeholder={q.placeholder || ""} value={answers[q.key] || ""}
                onChange={(e) => setA(q.key, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && nextQ()} />
            )}
            {q.kind === "chips" && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
                {q.chips!.map((c) => (
                  <button key={c} style={S.chip(answers[q.key] === c)} onClick={() => { setA(q.key, c); setTimeout(nextQ, 220); }}>{c}</button>
                ))}
              </div>
            )}
            {q.kind === "pair" && (
              <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center" }}>
                <input autoFocus style={{ ...S.input, width: 220 }} placeholder={q.pair![1]} value={answers[q.pair![0]] || ""}
                  onChange={(e) => setA(q.pair![0], e.target.value)} onKeyDown={(e) => e.key === "Enter" && nextQ()} />
                <input style={{ ...S.input, width: 220 }} placeholder={q.pair![3]} value={answers[q.pair![2]] || ""}
                  onChange={(e) => setA(q.pair![2], e.target.value)} onKeyDown={(e) => e.key === "Enter" && nextQ()} />
              </div>
            )}
            {q.kind === "story" && (
              <textarea autoFocus rows={4} style={{ ...S.input, textAlign: "left", fontSize: 16, lineHeight: 1.6, borderBottom: "none", border: `2px solid ${INK}`, padding: 14 }}
                placeholder="One summer the whole village helped with the harvest…" value={answers[q.key] || ""}
                onChange={(e) => setA(q.key, e.target.value)} />
            )}

            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              {qIdx > 0 && <button style={S.ghost} onClick={() => setQIdx(qIdx - 1)}>back</button>}
              <button style={S.btnGrey} onClick={nextQ}>
                {qIdx + 1 >= QUESTIONS.length ? "Print my labels" : q.optional && !(answers[q.key] || (q.pair && (answers[q.pair[0]] || answers[q.pair[2]]))) ? "Skip" : "Next"}
              </button>
            </div>
          </div>
        )}

        {stage === "printing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, flex: 1, justifyContent: "center", width: "100%" }}>
            {!genError ? (
              <>
                <p style={S.big}>{printMsg}</p>
                <div style={{ ...S.bar, maxWidth: 480 }}><div style={S.barFill(printFrac)} /></div>
                <p style={S.sub}>Real ink takes a moment. Your story is being drawn — no two prints come out alike.</p>
              </>
            ) : (
              <>
                <p style={S.big}>The press jammed.</p>
                <p style={{ ...S.sub, color: "#a03030" }}>{genError}</p>
                <button style={S.btnGrey} onClick={startPrinting}>Try again</button>
              </>
            )}
          </div>
        )}

        {stage === "flight" && (
          <div style={{ width: "100%", padding: "24px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <p style={{ ...S.big, marginBottom: 0 }}>Your tasting flight</p>
            <p style={S.sub}>These are real designs of <b>your</b> label. Pour away the ones that aren&apos;t right — a new one takes the glass. Crown the one that&apos;s yours.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, width: "100%" }}>
              {glasses.map((g, i) => (
                <div key={g.st + g.look.seed + i} style={{ border: `2px solid ${INK}`, background: "#fff", padding: 8 }}>
                  <div dangerouslySetInnerHTML={{ __html: g.svg.replace(/width="110mm" height="80mm"/, 'width="100%" height="auto"') }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: SUBT }}>{STYLE_NAMES[g.st] || g.st}</span>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button style={{ ...S.btn, padding: "6px 16px" }} onClick={() => eliminate(i)}>Pour away</button>
                      <button style={{ ...S.btnGrey, padding: "6px 16px" }} onClick={() => crown(i)}>♥ This one</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!glasses.length && <p style={S.sub}>The flight is empty — every glass was poured away. <button style={S.ghost} onClick={() => startFlight(briefData())}>Pour a fresh flight</button></p>}
          </div>
        )}

        {stage === "winner" && winner && (
          <div style={{ width: "100%", padding: "24px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <p style={{ ...S.big, marginBottom: 0 }}>It&apos;s yours.</p>
            <div style={{ ...S.card, width: "min(760px, 92vw)" }} dangerouslySetInnerHTML={{ __html: winner.svg.replace(/width="110mm" height="80mm"/, 'width="100%" height="auto"') }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, width: "100%", maxWidth: 760 }}>
              {[
                ["The Label", "print-ready front & back label files"],
                ["The Bottle", "label files + photoreal bottle mockups"],
                ["The Launch", "everything + a marketing image kit"],
              ].map(([t, d]) => (
                <div key={t} style={{ border: `2px solid ${INK}`, padding: 16, display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
                  <b style={{ fontSize: 15 }}>{t}</b>
                  <span style={{ fontSize: 12, color: SUBT, lineHeight: 1.5 }}>{d}</span>
                  <button style={{ ...S.btnGrey, padding: "8px 18px", fontSize: 12 }} disabled>coming after this preview</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <button style={S.ghost} onClick={() => startFlight(briefData())}>back to the flight</button>
              <button style={S.ghost} onClick={() => { location.reload(); }}>start over</button>
            </div>
          </div>
        )}

        <p style={{ fontSize: 10.5, color: SUBT, padding: "26px 0 14px" }}>
          preview of the new journey — the <a href="/classic" style={{ color: SUBT }}>classic configurator</a> is untouched
        </p>
      </div>
    </div>
  );
}
