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
    const FAMILIES = [
      "Archivo", "Anton", "Cormorant Garamond", "EB Garamond", "Cinzel",
      "Caveat", "Fraunces", "Jost", "Bebas Neue", "Playfair Display",
    ];
    (async () => {
      await loadScriptsSequentially(["/engine/img-data.js", "/engine/label-engine.js"]);
      if (!window.LabelEngine) {
        setStatus("FAILED: window.LabelEngine missing");
        return;
      }
      for (let i = 0; i < 120; i++) {
        await window.LabelEngine.ensureFonts();
        const loaded = new Set(
          [...document.fonts]
            .filter((f) => f.status === "loaded")
            .map((f) => f.family.replace(/['"]/g, ""))
        );
        if (FAMILIES.every((f) => loaded.has(f))) {
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
