"use client";

/* Harness page for the golden-SVG parity check (tests/parity/check-golden.mjs).
   Loads the verbatim engine scripts and exposes a ready flag once the engine's
   fonts have REALLY loaded. */
import { useEffect, useRef, useState } from "react";
import { loadScriptsSequentially } from "@/lib/load-scripts";

declare global {
  interface Window {
    LabelEngine?: {
      ensureFonts(): Promise<unknown>;
      renderStyleOptions(
        data: Record<string, string>,
        order: string[],
        cfg: { widthMM: number; heightMM: number; seed: number }
      ): { name: string; style: string; svg: string }[];
      STYLE_LIST: unknown[];
    };
    __ENGINE_READY__?: boolean;
  }
}

export default function EngineTest() {
  const booted = useRef(false);
  const [status, setStatus] = useState("loading engine…");

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // ensureFonts injects a Google Fonts @import and calls document.fonts.load();
    // until that stylesheet is parsed the families are unregistered, so load() is
    // a silent no-op AND fonts.check() "passes" via system fallback. The only
    // trustworthy signal is actual FontFace entries reaching status === 'loaded'.
    // Re-invoke ensureFonts each round: once the faces are registered its load()
    // calls really fetch them.
    // family alone is not enough: Archivo 400 loading must not mask a still-
    // pending Archivo 800 (the shrink-to-fit measurement depends on the exact
    // face). Require every family+weight(+style) the styles actually measure.
    const NEED: Array<[string, string, string?]> = [
      ["Archivo", "300"], ["Archivo", "400"], ["Archivo", "600"], ["Archivo", "700"], ["Archivo", "800"],
      ["Barlow", "700"], ["Barlow Condensed", "700"], ["Permanent Marker", "400"],
      ["Anton", "400"], ["Bebas Neue", "400"], ["Jost", "400"], ["Jost", "500"],
      ["EB Garamond", "400"], ["EB Garamond", "500"], ["EB Garamond", "400", "italic"],
      // NOTE: FONTS_URL carries Cormorant italic ONLY at 500 — the engine's
      // italic-600 runs render with this face (browser substitution), so THIS
      // is the face whose metrics must be loaded before goldens render.
      ["Cormorant Garamond", "600"], ["Cormorant Garamond", "500", "italic"],
      ["Cinzel", "500"], ["Cinzel", "600"],
      ["Playfair Display", "600"], ["Playfair Display", "700"],
      ["Fraunces", "600"], ["Fraunces", "700"], ["Tinos", "700"],
      ["Prata", "400"], ["Grenze Gotisch", "600"], ["Manufacturing Consent", "400"],
      ["Caveat", "600"],
    ];
    (async () => {
      await loadScriptsSequentially(["/engine/img-data.js", "/engine/label-engine.js"]);
      if (!window.LabelEngine) {
        setStatus("FAILED: window.LabelEngine missing");
        return;
      }
      for (let i = 0; i < 120; i++) {
        await window.LabelEngine.ensureFonts();
        const faces = [...document.fonts].filter((f) => f.status === "loaded");
        const has = (fam: string, w: string, style?: string) =>
          faces.some(
            (f) =>
              f.family.replace(/['"]/g, "") === fam &&
              (f.weight === w || (f.weight === "normal" && w === "400")) &&
              (style ? f.style === "italic" : f.style !== "italic")
          );
        if (NEED.every(([fam, w, st]) => has(fam, w, st))) {
          window.__ENGINE_READY__ = true;
          setStatus("engine ready");
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      setStatus("FAILED: fonts never finished loading");
    })();
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Engine parity harness</h1>
      <p id="engine-status">{status}</p>
    </main>
  );
}
