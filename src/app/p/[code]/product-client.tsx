"use client";

/* PRODUCT PAGE CLIENT (owner 2026-09-08): three sections — About the wine ·
   Ingredients · Gallery — on the owner's artboards (stripped to chrome in
   public/newui/product/*.svg; ALL text/images render live from the product
   snapshot). Wizard-style 3-band parallax slides; arrows AND the bar words
   navigate. Geometry decoded from the artboards (viewBox 1440×822.86). */

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
/* ROUND 28 #5: wizard logic — header and progress bar are STATIC live
   chrome; only the zone between them slides, and the thick progress
   segment animates its width */
const HEADER_H = 68.57, BAR_TOP = 740;
const BAR_Y = 754.16, DOT_X = [142.06, 720.28, 1297.94];
const BOUNDS = [190, 640];   // strip cuts in the artboards' empty bands
const HNW = "'HNW', 'Helvetica Neue', Helvetica, sans-serif";
const SECTIONS = ["about", "ingredients", "gallery"] as const;
type Section = (typeof SECTIONS)[number];

const FIELDS: [string, string][] = [
  ["Producer:", "producer"], ["Wine Name:", "wine"], ["Appellation:", "appellation"],
  ["Classification:", "classification"], ["Vintage:", "vintage"], ["Grape Variety:", "grape"],
  ["Region, Country:", "regionCountry"], ["Special mention:", "special"], ["Sweetness:", "sweetness"],
  ["Colour:", "colour"], ["Wine Type:", "wineType"], ["Alcohol:", "alcohol"], ["Volume:", "volume"],
  ["Producer Company:", "producerCompany"], ["Company Address:", "producerAddress"],
  ["Importer:", "importer"], ["Importer Address:", "importerAddress"],
  ["Bottling Date:", "bottlingDate"], ["LOT Number:", "lot"], ["Web Page:", "web"],
];

function namespaceSvg(t: string, key: string) {
  return t
    .replace(/\.st(\d+)/g, `.${key}-st$1`)
    .replace(/class="([^"]*)"/g, (_, cls: string) => `class="${cls.split(/\s+/).map((c) => (/^st\d+$/.test(c) ? `${key}-${c}` : c)).join(" ")}"`)
    .replace(/id="([^"]*)"/g, (_, id: string) => `id="${key}--${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${key}--${id})`)
    .replace(/href="#([^"]+)"/g, (_, id: string) => `href="#${key}--${id}"`);
}

export default function ProductClient({ doc }: { doc: ProductDoc }) {
  const [sec, setSec] = useState<Section>("about");
  const [prev, setPrev] = useState<Section | null>(null);
  const [dir, setDir] = useState(1);
  const [scale, setScale] = useState(1);
  const [boards, setBoards] = useState<Record<string, string>>({});
  const [gallery, setGallery] = useState<{ imgs: string[]; i: number } | null>(null);

  useEffect(() => {
    const fit = () => setScale(Math.max(1, window.innerWidth / W));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    SECTIONS.forEach((p) => {
      fetch(`/newui/product/${p}.svg`).then((r) => r.text()).then((t) =>
        setBoards((m) => ({ ...m, [p]: namespaceSvg(t, p).replace(/<\?xml[^>]*\?>/, "").replace(/<svg /, '<svg preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%" ') }))
      ).catch(() => { });
    });
  }, []);

  const go = useCallback((next: Section) => {
    if (next === sec || prev) return;
    setDir(SECTIONS.indexOf(next) > SECTIONS.indexOf(sec) ? 1 : -1);
    setPrev(sec); setSec(next);
    setTimeout(() => setPrev(null), SLIDE_MS + DELAYS[2] + 60);
  }, [sec, prev]);
  const step = (d: number) => {
    const i = SECTIONS.indexOf(sec) + d;
    if (i >= 0 && i < SECTIONS.length) go(SECTIONS[i]);
  };

  const w = doc.wine || {};
  const title = [w.producer, w.wine].filter(Boolean);
  const px = (x: number, y: number, w2?: number, h2?: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w2, height: h2 });
  const ghost: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", padding: 0, position: "absolute" };

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
    ? doc.ingredients.split(/\r?\n/).filter(Boolean).slice(0, 16).map((l) => {
        const i = l.indexOf(":");
        return i > 0 ? [l.slice(0, i + 1).trim(), l.slice(i + 1).trim()] as [string, string] : ["", l.trim()] as [string, string];
      })
    : ING_PLACEHOLDER;

  const bottle = (img: string) => img ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={img} alt="" style={{ ...px(132.41, 197.76, 286.7, 430.1), objectFit: "contain", pointerEvents: "none" }} />
  ) : null;

  const overlay = (p: Section) => (
    <>
      {p === "about" && (<>
        <span style={{ ...px(478.91, 156.08 - 20, 500, 26), font: `700 24.27px ${HNW}` }}>WINE DETAILS</span>
        {bottle(doc.images.front)}
        <span style={{ ...px(480, 234.14 - 34, 340, 44), font: `700 38.27px ${HNW}`, color: "#231f20", whiteSpace: "nowrap" }}>{(w.producer || w.wine || "WINE").toUpperCase()}</span>
        {(w.wine || "").split(/\s+/).slice(0, 2).map((word, i) => (
          <span key={i} style={{ ...px(480, 234.14 + 48.54 * (i + 1) - 34, 340, 44), font: `38.27px ${HNW}`, color: "#231f20", whiteSpace: "nowrap" }}>{word}</span>
        ))}
        {doc.description && (
          <span style={{ ...px(480, 540, 300, 110), font: `italic 13px ${HNW}`, color: "#333", lineHeight: 1.45, display: "block", overflow: "hidden" }}>{doc.description.slice(0, 300)}</span>
        )}
        {FIELDS.map(([lbl, key], i) => w[key] ? (
          <span key={key}>
            <span style={{ ...px(821.41, 215.12 + i * 21 - 13, 170, 16), font: `700 14px ${HNW}` }}>{lbl}</span>
            {/* height 26: HNW's line box is ~25px at 15px — anything tighter clips at the baseline */}
            <span style={{ ...px(994.95, 215.12 + i * 21 - 13, 320, 26), font: `italic 15px ${HNW}`, textDecoration: "underline", whiteSpace: "nowrap", overflow: "hidden" }}>{w[key]}</span>
          </span>
        ) : null)}
      </>)}

      {p === "ingredients" && (<>
        <span style={{ ...px(483.06, 156.08 - 20, 500, 26), font: `700 24.27px ${HNW}` }}>INGREDIENTS</span>
        {bottle(doc.images.back || doc.images.front)}
        {ingRows.map(([lbl, val], i) => (
          <span key={i}>
            {lbl && <span style={{ ...px(483.06, 215.12 + i * 21 - 13, 175, 16), font: `700 14px ${HNW}` }}>{lbl}</span>}
            {val && <span style={{ ...px(656.6, 215.12 + i * 21 - 13, 420, 17), font: `italic 15px ${HNW}`, whiteSpace: "nowrap" }}>{val}</span>}
          </span>
        ))}
      </>)}

      {p === "gallery" && (<>
        <span style={{ ...px(480.06, 156.08 - 20, 500, 26), font: `700 24.27px ${HNW}` }}>GALLERY</span>
        {bottle(doc.images.front)}
        {[
          { x: 480, y: 205.71, s: 409.6, i: 0 },
          { x: 891.43, y: 205.71, s: 204.8, i: 1 }, { x: 1097.14, y: 205.71, s: 204.8, i: 2 },
          { x: 891.43, y: 411.43, s: 204.8, i: 3 }, { x: 1097.14, y: 411.43, s: 204.8, i: 4 },
        ].map((f) => doc.images.life[f.i] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img key={f.i} src={doc.images.life[f.i]} alt="" onClick={() => setGallery({ imgs: doc.images.life.filter(Boolean), i: f.i })}
            style={{ ...px(f.x, f.y, f.s, f.s), objectFit: "cover", cursor: "zoom-in" }} />
        ) : (
          <div key={f.i} style={{ ...px(f.x, f.y, f.s, f.s), background: "#F4F3EE" }} />
        ))}
      </>)}

    </>
  );

  const pageSpace = (p: Section) => (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
      <div style={{ position: "absolute", inset: 0, userSelect: "none" }} dangerouslySetInnerHTML={{ __html: boards[p] || "" }} />
      {overlay(p)}
    </div>
  );
  /* strips live INSIDE the content zone (header→bar); chrome never moves */
  const strips = (p: Section, dirIn: boolean) => {
    const cuts = [HEADER_H, ...BOUNDS, BAR_TOP];
    return cuts.slice(0, -1).map((y0, si) => (
      <div key={`${p}-${si}`} style={{ position: "absolute", left: 0, top: y0 - HEADER_H, width: W, height: cuts[si + 1] - y0, overflow: "hidden", animation: `${dirIn ? "ppIn" : "ppOut"} ${SLIDE_MS}ms ${EASE} ${DELAYS[si]}ms both`, pointerEvents: "none" }}>
        <div style={{ position: "absolute", left: 0, top: -y0, width: W, height: H, background: "#fff" }}>{pageSpace(p)}</div>
      </div>
    ));
  };
  const idx = SECTIONS.indexOf(sec);

  return (
    // not <main>: configurator.css pads the main tag 44/40px and would shift every hit zone
    <div style={{ background: "#000", minHeight: "100vh", margin: 0, padding: 0 }}>
      <style>{`html, body { margin: 0; padding: 0; background: #000; font-synthesis: none; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
        @font-face { font-family: 'HNW'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-55Roman'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-75Bold'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-display: block; }
        @font-face { font-family: 'HelveticaNeueWorld-56It'; src: url('/newui/fonts/HNW-56It.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
        @font-face { font-family: 'Helvetica Neue World'; src: url('/newui/fonts/HNW-55Roman.woff2') format('woff2'); font-weight: 400; font-display: block; }
        @font-face { font-family: 'Helvetica Neue World'; src: url('/newui/fonts/HNW-75Bold.woff2') format('woff2'); font-weight: 700; font-display: block; }
        @keyframes ppIn { from { transform: translateX(${dir > 0 ? 1440 : -1440}px) } to { transform: translateX(0) } }
        @keyframes ppOut { from { transform: translateX(0) } to { transform: translateX(${dir > 0 ? -1440 : 1440}px) } }`}</style>
      <div style={{ width: W * scale, height: H * scale, position: "relative", margin: "0 auto" }}>
        <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", overflow: "hidden", background: "#fff" }}>
          {/* sliding CONTENT zone between the static header and bar */}
          <div style={{ position: "absolute", left: 0, top: HEADER_H, width: W, height: BAR_TOP - HEADER_H, overflow: "hidden" }}>
            {prev && strips(prev, false)}
            {prev
              ? strips(sec, true)
              : <div style={{ position: "absolute", left: 0, top: -HEADER_H, width: W, height: H }}>{pageSpace(sec)}</div>}
          </div>

          {/* STATIC header */}
          <div style={{ ...px(0, 0, W, HEADER_H), background: "#000" }}>
            <span style={{ ...px(138.18, 42.37 - 14, 900, 20), font: `16px ${HNW}`, color: "#fff", lineHeight: "20px" }}>
              <b>{(title[0] || "WINE").toUpperCase()}</b>{title[1] ? <span style={{ fontWeight: 400 }}> / {title[1]}</span> : null}
            </span>
            <span style={{ ...px(1242.09, 42.37 - 11, 90, 14), font: `11px ${HNW}`, color: "#fff" }}>© 8K Labels</span>
          </div>

          {/* STATIC progress bar — thick segment animates width, dots fill */}
          <div style={{ ...px(0, BAR_TOP, W, H - BAR_TOP), background: "#fff" }}>
            <div style={{ ...px(137.14, BAR_Y - BAR_TOP, 1303.41 - 137.14, 1), background: "#111" }} />
            <div style={{ ...px(DOT_X[0], BAR_Y - 1 - BAR_TOP, DOT_X[idx] - DOT_X[0], 3), background: "#111", transition: `width ${SLIDE_MS}ms ${EASE}` }} />
            {DOT_X.map((cx, i) => (
              <span key={i} style={{ ...px(cx - 4.92, BAR_Y - 4.92 - BAR_TOP, 9.84, 9.84), borderRadius: 5, border: "1px solid #111", background: idx >= i ? "#111" : "#fff", transition: `background 300ms ${EASE}`, boxSizing: "border-box" }} />
            ))}
            <button onClick={() => go("about")} style={{ ...ghost, ...px(137.15, 788.56 - 15 - BAR_TOP, 130, 22), font: `700 15px ${HNW}`, color: "#111", textAlign: "left" }}>About the wine</button>
            <button onClick={() => go("ingredients")} style={{ ...ghost, ...px(679.83 - 40, 788.56 - 15 - BAR_TOP, 160, 22), font: `700 15px ${HNW}`, color: "#111", textAlign: "center" }}>Ingredients</button>
            <button onClick={() => go("gallery")} style={{ ...ghost, ...px(1251.61 - 20, 788.56 - 15 - BAR_TOP, 90, 22), font: `700 15px ${HNW}`, color: "#111", textAlign: "right" }}>Gallery</button>
            {idx > 0 && (
              <button aria-label="back" onClick={() => step(-1)} style={{ ...ghost, ...px(60, BAR_Y - 20 - BAR_TOP, 60, 40) }}>
                <svg viewBox="0 0 60 40" width="60" height="40"><line x1="47" y1="20" x2="13" y2="20" stroke="#000" strokeWidth="1.6" /><polyline points="23.5,9.5 13,20 23.5,30.5" fill="none" stroke="#000" strokeWidth="1.6" /></svg>
              </button>)}
            {idx < SECTIONS.length - 1 && (
              <button aria-label="next" onClick={() => step(1)} style={{ ...ghost, ...px(1325, BAR_Y - 20 - BAR_TOP, 60, 40) }}>
                <svg viewBox="0 0 60 40" width="60" height="40"><line x1="13" y1="20" x2="47" y2="20" stroke="#000" strokeWidth="1.6" /><polyline points="36.5,9.5 47,20 36.5,30.5" fill="none" stroke="#000" strokeWidth="1.6" /></svg>
              </button>)}
          </div>
          {gallery && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(17,17,17,0.92)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setGallery(null)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gallery.imgs[gallery.i]} alt="" onClick={(e) => e.stopPropagation()} style={{ maxWidth: W * 0.8, maxHeight: H * 0.8 }} />
              <button onClick={(e) => { e.stopPropagation(); setGallery((g) => g && { ...g, i: (g.i + g.imgs.length - 1) % g.imgs.length }); }} style={{ ...ghost, left: 40, top: H / 2 - 30, width: 60, height: 60, color: "#fff", font: `300 46px ${HNW}` }}>‹</button>
              <button onClick={(e) => { e.stopPropagation(); setGallery((g) => g && { ...g, i: (g.i + 1) % g.imgs.length }); }} style={{ ...ghost, left: W - 100, top: H / 2 - 30, width: 60, height: 60, color: "#fff", font: `300 46px ${HNW}` }}>›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
