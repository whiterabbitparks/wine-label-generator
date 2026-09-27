"use client";

/* PRODUCT PAGE CLIENT — the owner's second design (2026-09-26, NEW UI/
   Product Page/Product page.ai, artboard 1440×822.86). A white header
   with the wine's name and five words: WINE DETAILS · INGREDIENTS ·
   GALLERY · DOWNLOAD ASSETS · GEO / ENG (the page shown in bold).
     page one — the front bottle shot, the title and the description stay
       put; the right-hand column lists the wine's details OR its
       ingredients, whichever word was clicked.
     page two — the gallery: a carousel as on the Final Pack, bigger and
       centred between the margin crosses; its neighbours smaller and
       blurred; the Final Pack's chevrons; "Download Image" under it.
   Everything is live — no baked artboard. Wizard-style 3-band slide
   between the two pages.
   2026-09-27 (owner): DOWNLOAD ASSETS is gone from the page (the pack is
   what the customer pays for). The page is LOCKED — seen through a white
   veil — until its 5-digit code (in the Final Pack's READ ME) is typed
   once; then it is open for everyone who scans the bottle. */

import { useCallback, useEffect, useState } from "react";

export interface ProductDoc {
  _id: string;
  wine: Record<string, string>;
  description: string;
  ingredients: string;
  images: { front: string; back: string; life: string[] };
}

const W = 1440, H = 822.86;
const EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const SLIDE_MS = 650;
const DELAYS = [0, 55, 110];
const HEADER_H = 68.57, FOOT_Y = 754.18;
const BOUNDS = [190, 640];   // the slide's strip cuts
const M_L = 137.14, M_R = 1302.86, M_T = 137.14, M_B = 685.73;   // the margin crosses
const HNW = "'HNW', 'Helvetica Neue', Helvetica, sans-serif";
const INK = "#231f20";
const SECTIONS = ["about", "ingredients", "gallery"] as const;
type Section = (typeof SECTIONS)[number];
type Lang = "en" | "ge";
const pageOf = (s: Section) => (s === "gallery" ? "gallery" : "one");

/* HNW's hhea metrics (ascent 1.479, descent 0.428): with an explicit line
   height L the baseline sits L/2 + 0.5255·size below the line box's top */
const topFor = (baseline: number, size: number, lh: number) => baseline - lh / 2 - 0.5255 * size;

const FIELDS: [string, string, string][] = [
  ["Producer:", "მწარმოებელი:", "producer"], ["Wine Name:", "ღვინის სახელი:", "wine"],
  ["Appellation:", "აპელასიონი:", "appellation"], ["Classification:", "კლასიფიკაცია:", "classification"],
  ["Vintage:", "მოსავლის წელი:", "vintage"], ["Grape Variety:", "ყურძნის ჯიში:", "grape"],
  ["Region, Country:", "წარმოშობა:", "regionCountry"], ["Special mention:", "მინაწერი:", "special"],
  ["Sweetness:", "სიტკბო:", "sweetness"], ["Colour:", "ფერი:", "colour"], ["Wine Type:", "ღვინის ტიპი:", "wineType"],
  ["Alcohol:", "ალკოჰოლი:", "alcohol"], ["Volume:", "მოცულობა:", "volume"],
  ["Producer Company:", "მწარმოებელი კომპანია:", "producerCompany"], ["Company Address:", "კომპანიის მისამართი:", "producerAddress"],
  ["Importer:", "იმპორტიორი:", "importer"], ["Importer Address:", "იმპორტიორის მისამართი:", "importerAddress"],
  ["Bottling Date:", "ჩამოსხმის თარიღი:", "bottlingDate"], ["LOT Number:", "LOT ნომერი:", "lot"], ["Web Page:", "ვებგვერდი:", "web"],
];
const T: Record<string, [string, string]> = {
  about: ["WINE DETAILS", "ᲦᲕᲘᲜᲘᲡ ᲓᲔᲢᲐᲚᲔᲑᲘ"],
  ingredients: ["INGREDIENTS", "ᲘᲜᲒᲠᲔᲓᲘᲔᲜᲢᲔᲑᲘ"],
  gallery: ["GALLERY", "ᲒᲐᲚᲔᲠᲔᲐ"],
  lockTitle: ["ENTER YOUR CODE", "ᲨᲔᲘᲧᲕᲐᲜᲔ ᲙᲝᲓᲘ"],
  lockNote: ["You'll find the 5-digit code in the READ ME file of your Final Pack.", "5-ნიშნა კოდს იპოვი შენი საბოლოო პაკეტის READ ME ფაილში."],
  lockGo: ["Open the page", "გვერდის გახსნა"],
  lockWrong: ["That code isn't right — check the READ ME.", "კოდი არასწორია — გადაამოწმე READ ME."],
  lockMany: ["Too many tries today — try again tomorrow.", "დღეს ძალიან ბევრი ცდა იყო — ხვალ სცადე."],
  image: ["Download Image", "სურათის ჩამოტვირთვა"],
  front: ["Front of the bottle", "ბოთლი წინიდან"],
  back: ["Back of the bottle", "ბოთლი უკნიდან"],
};
const ING_GE: Record<string, string> = {
  "Grapes:": "ყურძენი:", "Preservative:": "კონსერვანტი:", "Acidity regulator:": "მჟავიანობის რეგულატორი:",
  "Stabiliser:": "სტაბილიზატორი:", "Nutrition per 100 ml:": "კვებითი ღირებულება 100 მლ-ზე:", "Energy:": "ენერგია:",
  "Carbohydrates:": "ნახშირწყლები:", "Protein:": "ცილა:", "Fat:": "ცხიმი:", "Alcohol:": "ალკოჰოლი:",
};

/* the carousel: the current picture big in the middle, its neighbours
   smaller, raised a little and blurred (positions from the artboard) */
const CAR_S = 445.72, CAR_CX = 720, CAR_CY = (M_T + M_B) / 2;
/* blur is set before the scale shrinks it, so it is divided by the scale:
   the eye sees 3 px next to the middle, 4 px further out */
const RING: Record<number, { s: number; dx: number; dy: number; blur: number }> = {
  0: { s: 1, dx: 0, dy: 0, blur: 0 },
  1: { s: 0.5, dx: 222.86, dy: -17, blur: 3 / 0.5 },
  2: { s: 0.3077, dx: 334.29, dy: -17, blur: 4 / 0.3077 },
  3: { s: 0.2, dx: 400, dy: -17, blur: 5 / 0.2 },
};

export default function ProductClient({ doc, locked: lockedAtFirst = false }: { doc: ProductDoc; locked?: boolean }) {
  const [locked, setLocked] = useState(lockedAtFirst);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");
  const tryPin = async (p: string) => {
    setPinErr("");
    const r = await fetch("/api/product/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: doc._id, pin: p }) }).catch(() => null);
    if (r?.ok) { setLocked(false); return; }
    setPinErr(r?.status === 429 ? "lockMany" : "lockWrong");
  };
  const [sec, setSec] = useState<Section>("about");
  const [prev, setPrev] = useState<Section | null>(null);
  const [dir, setDir] = useState(1);
  const [scale, setScale] = useState(1);
  const [lang, setLang] = useState<Lang>("en");

  /* the gallery: both bottle shots, then the lifestyle pictures; k is the
     picture's place in the pack (api/product/pack?img=k) */
  const pics = [
    { src: doc.images.front, k: 0 }, { src: doc.images.back, k: 1 },
    ...(doc.images.life || []).map((src, i) => ({ src, k: 2 + i })),
  ].filter((p) => p.src);
  const firstLife = pics.findIndex((p) => p.k >= 2);
  const [car, setCar] = useState(Math.max(0, firstLife));

  useEffect(() => {
    const fit = () => setScale(Math.max(1, window.innerWidth / W));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  /* the same language as the wizard (and the other way round) */
  useEffect(() => { try { if (localStorage.getItem("nui-lang") === "ge") setLang("ge"); } catch { } }, []);
  const pickLang = (l: Lang) => { setLang(l); try { localStorage.setItem("nui-lang", l); } catch { } };
  const t = (k: string) => T[k][lang === "ge" ? 1 : 0];

  const go = useCallback((next: Section) => {
    if (next === sec || prev) return;
    /* WINE DETAILS ↔ INGREDIENTS is the same page — only its list changes */
    if (pageOf(next) === pageOf(sec)) { setSec(next); return; }
    setDir(next === "gallery" ? 1 : -1);
    setPrev(sec); setSec(next);
    setTimeout(() => setPrev(null), SLIDE_MS + DELAYS[2] + 60);
  }, [sec, prev]);
  const turn = useCallback((d: number) => setCar((c) => (c + d + pics.length) % Math.max(1, pics.length)), [pics.length]);
  useEffect(() => {
    if (sec !== "gallery") return;
    const key = (e: KeyboardEvent) => { if (e.key === "ArrowLeft") turn(-1); if (e.key === "ArrowRight") turn(1); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sec, turn]);

  const w = doc.wine || {};
  const code = encodeURIComponent(doc._id);
  const px = (x: number, y: number, w2?: number, h2?: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w2, height: h2 });
  /* one line of type with its baseline exactly on y */
  const line = (x: number, y: number, size: number, extra?: React.CSSProperties): React.CSSProperties =>
    ({ position: "absolute", left: x, top: topFor(y, size, size * 1.4), height: size * 1.4, lineHeight: `${size * 1.4}px`, fontSize: size, fontFamily: HNW, color: INK, whiteSpace: "nowrap", ...extra });
  const ghost: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0, margin: 0 };
  const cross = (x: number, y: number) => (
    <span key={`${x}-${y}`}>
      <span style={{ ...px(x - 8.24, y - 0.5, 16.48, 1), background: "#000" }} />
      <span style={{ ...px(x - 0.5, y - 8.24, 1, 16.48), background: "#000" }} />
    </span>
  );

  /* placeholder ingredients until the upload flow feeds real ones */
  const ING_PLACEHOLDER: [string, string][] = [
    ["Grapes:", w.grape || "Saperavi"],
    ["Preservative:", "Sulphites (E220)"],
    ["Acidity regulator:", "Tartaric acid (E334)"],
    ["Stabiliser:", "Gum arabic (E414)"],
    ["", ""],
    ["Nutrition per 100 ml:", ""],
    ["Energy:", "343 kJ / 82 kcal"],
    ["Carbohydrates:", "2.6 g (of which sugars 0.5 g)"],
    ["Protein:", "0.1 g"],
    ["Fat:", "0 g"],
    ["Alcohol:", `${w.alcohol || "12.5"} % vol`],
  ];
  const ingRows: [string, string][] = doc.ingredients
    ? doc.ingredients.split(/\r?\n/).filter(Boolean).slice(0, 20).map((l) => {
        const i = l.indexOf(":");
        return i > 0 ? [l.slice(0, i + 1).trim(), l.slice(i + 1).trim()] as [string, string] : ["", l.trim()] as [string, string];
      })
    : ING_PLACEHOLDER.map(([l, v]) => [lang === "ge" ? ING_GE[l] || l : l, v] as [string, string]);
  const detailRows: [string, string][] = FIELDS.filter(([, , k]) => (w[k] || "").trim())
    .map(([en, ge, k]) => [lang === "ge" ? ge : en, w[k]]);

  /* the right-hand column: label in bold, the value in italic on its rule */
  /* Georgian names are wider — they set a size smaller to fit the column */
  const rows = (list: [string, string][]) => list.map(([lbl, val], i) => {
    const y = 215.12 + i * 21;
    return (
      <span key={i}>
        {lbl && <span style={line(821.41, y, lang === "ge" ? 12.5 : 14, { fontWeight: 700, maxWidth: 994.95 - 821.41 - 6, overflow: "hidden", textOverflow: "ellipsis", color: "#000" })}>{lbl}</span>}
        {val && <span title={val} style={line(994.95, y, 15, { fontStyle: "italic", width: M_R - 994.95, overflow: "hidden", textOverflow: "ellipsis", color: "#000" })}>{val}</span>}
        {(lbl || val) && <span style={{ ...px(994.95, y + 1.12 - 0.375, M_R - 994.95, 0.75), background: "#000" }} />}
      </span>
    );
  });

  const title = (w.producer || "").trim();
  const name = (w.wine || "").trim();
  const long = (title + name).length > 34;
  const TS = long ? 30 : 38.27, TL = long ? 38 : 48.52;

  const pageOne = (
    <>
      {[[M_L, M_T], [411.43, M_T], [M_R, M_T], [M_L, M_B], [411.43, M_B], [M_R, M_B]].map(([x, y]) => cross(x, y))}
      {doc.images.front && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={doc.images.front} alt="" style={{ ...px(112.47, 171.43, 323.63, 485.45), objectFit: "contain", pointerEvents: "none" }} />
      )}
      <div style={{ ...px(480, topFor(234.14, TS, TL), 320, 330), font: `${TS}px/${TL}px ${HNW}`, color: INK, overflow: "hidden" }}>
        {title && <div style={{ fontWeight: 700 }}>{title.toUpperCase()}</div>}
        {name && <div>{name}</div>}
      </div>
      {doc.description && (
        <div lang="en" style={{ position: "absolute", left: 480, bottom: H - (615.62 + 3.12), width: 285, maxHeight: 22 * 9, overflow: "hidden", font: `italic 15px/22px ${HNW}`, color: "#000", hyphens: "auto", WebkitHyphens: "auto" }}>
          {doc.description}
        </div>
      )}
      {/* the list swaps in place — details or ingredients */}
      <div key={sec === "gallery" ? "about" : sec} style={{ position: "absolute", inset: 0, animation: `ppFade 260ms ${EASE} both`, pointerEvents: "none" }}>
        {rows(sec === "ingredients" ? ingRows : detailRows)}
      </div>
    </>
  );

  const pageTwo = (
    <>
      {[[M_L, M_T], [M_R, M_T], [M_L, M_B], [M_R, M_B]].map(([x, y]) => cross(x, y))}
      {pics.map((p, i) => {
        const n = pics.length;
        let rel = ((i - car) % n + n) % n;
        if (rel > n / 2) rel -= n;
        const ar = Math.min(3, Math.abs(rel));
        const r = RING[ar];
        return (
          <div key={p.k} onClick={rel ? () => setCar(i) : undefined}
            style={{ ...px(CAR_CX - CAR_S / 2, CAR_CY - CAR_S / 2, CAR_S, CAR_S), zIndex: 10 - ar,
              transform: `translate(${Math.sign(rel) * r.dx}px, ${r.dy}px) scale(${r.s})`,
              filter: r.blur ? `blur(${r.blur}px)` : "none", opacity: ar === 3 ? 0 : 1,
              transition: `transform 520ms ${EASE}, filter 520ms ${EASE}, opacity 520ms ${EASE}`,
              cursor: rel ? "pointer" : undefined, pointerEvents: ar === 3 ? "none" : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={p.k === 0 ? t("front") : p.k === 1 ? t("back") : ""} draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: p.k < 2 ? "contain" : "cover" }} />
          </div>
        );
      })}
      {pics.length > 1 && ([["previous picture", M_L - 3.33, "13,3 5,11 13,19", -1], ["next picture", M_R - 8.67, "5,3 13,11 5,19", 1]] as const).map(([lab, x, pts, d]) => (
        <button key={lab} aria-label={lab} onClick={() => turn(d)}
          style={{ ...ghost, ...px(x - 16, CAR_CY - 22, 44, 44), zIndex: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 18 22" width="12" height="16"><polyline points={pts} fill="none" stroke="#111" strokeWidth="1.6" /></svg>
        </button>
      ))}
      {pics[car] && (
        <a href={`/api/product/pack?code=${code}&img=${pics[car].k}`} download
          style={{ ...line(0, M_B, 12, { width: W, textAlign: "center", color: "#000" }), pointerEvents: "none" }}>
          <span style={{ textDecoration: "underline", textUnderlineOffset: 2, pointerEvents: "auto", cursor: "pointer" }}>{t("image")}</span>
        </a>
      )}
    </>
  );

  const pageSpace = (s: Section) => (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
      {pageOf(s) === "gallery" ? pageTwo : pageOne}
    </div>
  );
  /* strips live INSIDE the content zone (header→foot rule); chrome never moves */
  const strips = (s: Section, dirIn: boolean) => {
    const cuts = [HEADER_H, ...BOUNDS, FOOT_Y];
    return cuts.slice(0, -1).map((y0, si) => (
      <div key={`${pageOf(s)}-${si}`} style={{ position: "absolute", left: 0, top: y0 - HEADER_H, width: W, height: cuts[si + 1] - y0, overflow: "hidden", animation: `${dirIn ? "ppIn" : "ppOut"} ${SLIDE_MS}ms ${EASE} ${DELAYS[si]}ms both`, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, top: -y0, width: W, height: H, background: "#fff" }}>{pageSpace(s)}</div>
      </div>
    ));
  };

  const nav = (k: Section) => (
    <button key={k} onClick={() => go(k)}
      style={{ ...ghost, ...line({ about: 483.06, ingredients: 669.59, gallery: 868.04 }[k], 58.62, 15, { fontWeight: sec === k ? 700 : 400 }) }}>{t(k)}</button>
  );

  return (
    // not <main>: configurator.css pads the main tag 44/40px and would shift every hit zone
    <div style={{ background: "#fff", minHeight: "100vh", margin: 0, padding: 0 }}>
      <style>{`html, body { margin: 0; padding: 0; background: #fff; font-synthesis: none; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: block; }
        @keyframes ppIn { from { transform: translateX(${dir > 0 ? 1440 : -1440}px) } to { transform: translateX(0) } }
        @keyframes ppOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? -1440 : 1440}px) } }
        @keyframes ppFade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div style={{ width: W * scale, height: H * scale, position: "relative", margin: "0 auto" }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden", background: "#fff" }}>
          {/* sliding CONTENT zone between the static header and the foot rule */}
          <div style={{ position: "absolute", left: 0, top: HEADER_H, width: W, height: FOOT_Y - HEADER_H, overflow: "hidden" }}>
            {prev && strips(prev, false)}
            {prev
              ? strips(sec, true)
              : <div style={{ position: "absolute", left: 0, top: -HEADER_H, width: W, height: H }}>{pageSpace(sec)}</div>}
          </div>

          {/* STATIC header: the wine's name, the five words, the rule */}
          <div style={{ ...px(0, 0, W, HEADER_H), background: "#fff" }}>
            <span style={line(137.15, 58.62, 15, { fontWeight: 700, maxWidth: 483.06 - 137.15 - 30, overflow: "hidden", textOverflow: "ellipsis" })}>
              {(name || title || "WINE").toUpperCase()}
            </span>
            {SECTIONS.map(nav)}
            <span style={line(1228.36, 58.62, 15)}>
              <button onClick={() => pickLang("ge")} style={{ ...ghost, font: "inherit", color: "inherit", fontWeight: lang === "ge" ? 700 : 400 }}>GEO</button>
              {" / "}
              <button onClick={() => pickLang("en")} style={{ ...ghost, font: "inherit", color: "inherit", fontWeight: lang === "en" ? 700 : 400 }}>ENG</button>
            </span>
            <div style={{ ...px(0, HEADER_H - 0.5, W, 1), background: "#000" }} />
          </div>

          {/* THE LOCK: the page under a white veil, the code box in its middle */}
          {locked && (
            <div style={{ position: "absolute", left: 0, top: HEADER_H, width: W, height: H - HEADER_H, background: "rgba(255,255,255,0.8)", backdropFilter: "blur(2px)", zIndex: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: HNW, color: "#111" }}>
              <div style={{ font: `700 24.27px ${HNW}`, marginBottom: 28 }}>{t("lockTitle")}</div>
              <input value={pin} inputMode="numeric" autoFocus maxLength={5} aria-label="code"
                onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setPin(v); setPinErr(""); if (v.length === 5) tryPin(v); }}
                onKeyDown={(e) => { if (e.key === "Enter" && pin.length === 5) tryPin(pin); }}
                style={{ width: 220, border: "none", borderBottom: "1px solid #111", background: "transparent", outline: "none", textAlign: "center", font: `36px ${HNW}`, letterSpacing: 18, paddingLeft: 18, color: "#111" }} />
              <div style={{ font: `italic 15px ${HNW}`, marginTop: 22, maxWidth: 420, textAlign: "center", lineHeight: "22px" }}>{t("lockNote")}</div>
              <button onClick={() => pin.length === 5 && tryPin(pin)}
                style={{ marginTop: 26, width: 220, height: 34.3, background: pin.length === 5 ? "#111" : "#fff", color: pin.length === 5 ? "#fff" : "#111", border: "1px solid #111", font: `12px ${HNW}`, letterSpacing: 0.3, cursor: "pointer" }}>{t("lockGo")}</button>
              <div style={{ height: 20, marginTop: 12, font: `13px ${HNW}`, color: "#BA141A" }}>{pinErr ? t(pinErr) : ""}</div>
            </div>
          )}
          {/* the foot rule and its end tick */}
          <div style={{ ...px(0, FOOT_Y - 0.5, 1439.5, 1), background: "#000" }} />
          <div style={{ ...px(1439, 750.93, 1, 6.5), background: "#000" }} />
        </div>
      </div>
    </div>
  );
}
