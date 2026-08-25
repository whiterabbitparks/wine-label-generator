"use client";

/* The configurator, transplanted VERBATIM from 8k-labels-package/dist/configurator.html.
   The static body HTML and the five behavior scripts are byte-identical to the
   original build (extracted by tests/parity/extract-shell.mjs — rerun that after
   `node build.js` in the package to resync). React only hosts them; it renders
   the HTML once and never touches the subtree again, so the original scripts own
   the DOM exactly as they do in the single-file version. */
import { useEffect, useRef } from "react";
import { loadScriptsSequentially } from "@/lib/load-scripts";
import shellBodyHtml from "../shell-body";
import shellScripts from "../shell-scripts.json";

export default function Configurator() {
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return; // survive StrictMode double-invoke in dev
    booted.current = true;
    loadScriptsSequentially(shellScripts)
      .then(() => {
        // The ONE integration point the original exposes (CONTINUE-HERE.md §6):
        // replace the offline placeholder provider with a call to our backend.
        // The API key stays server-side; the client only ever sees the image.
        const w = window as unknown as {
          __PARITY_OFFLINE__?: boolean;
          EightKImageGen?: {
            provider: unknown;
            setProvider?: unknown;
            setConfig?: (c: unknown) => void;
            wired?: boolean;
          };
        };
        const gen = w.EightKImageGen;
        if (!gen) return;
        // parity captures set this flag: keep the package's offline placeholder
        // providers so the ported app renders byte-identically to the dist file
        // (generated images are environment-dependent and can never be compared)
        if (w.__PARITY_OFFLINE__) {
          gen.wired = true;
          return;
        }
        // apply the server-persisted Art Direction config (edited at /admin)
        fetch("/api/admin/config")
          .then((r) => r.json())
          .then((cfg) => gen.setConfig?.(cfg))
          .catch(() => {});
        // single-image hook (admin "Test generate") — legacy endpoint
        gen.provider = async (job: unknown) => {
          const r = await fetch("/api/generate-label-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(job),
          });
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error || `generation failed (${r.status})`);
          return body.imageDataUrl;
        };
        /* DREAM ENGINE WIRING (owner 2026-08-25): classic is the interface
           the owner actually uses — its UI stays untouched, but "Show
           Labels" now runs the DREAM pipeline per style: three complete
           dreamed designs, rule-verified, replicated as vector. The shell's
           own renderStyleOptions is patched to return the fitted dream
           replicas, so cards, lightbox and resizing all keep working. */
        interface DreamRes {
          dream: string; spec: { elements?: { font?: string }[] };
          artwork: string | null; artAlign?: string; artworkMode?: string;
        }
        const DREAM_STYLE_KEYS = ["traditional", "contemporary", "punk"];
        gen.setProvider = async (brief: unknown, onProgress?: (p: number) => void) => {
          const b = brief as { vision?: string; reference?: string | null; data?: Record<string, string> };
          let doneCount = 0;
          const runOne = async (styleKey: string): Promise<[string, DreamRes]> => {
            const r = await fetch("/api/dream-label", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vision: b.vision || "", style: styleKey, data: b.data || {}, sketch: b.reference || null }),
            });
            if (!r.ok || !r.body) throw new Error(`generation failed (${r.status})`);
            const reader = r.body.getReader();
            const dec = new TextDecoder();
            let buf = ""; let result: DreamRes | null = null;
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              let nl;
              while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
                if (!line) continue;
                const msg = JSON.parse(line) as { type: string; error?: string } & DreamRes;
                if (msg.type === "result") result = msg;
                else if (msg.type === "error") throw new Error(msg.error || "generation failed");
              }
            }
            if (!result) throw new Error("generation stream ended unexpectedly");
            doneCount++; onProgress?.(doneCount / DREAM_STYLE_KEYS.length);
            return [styleKey, result];
          };
          const settled = await Promise.allSettled(DREAM_STYLE_KEYS.map(runOne));
          const ok = settled.filter((x): x is PromiseFulfilledResult<[string, DreamRes]> => x.status === "fulfilled").map((x) => x.value);
          if (!ok.length) {
            const firstErr = settled.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
            throw new Error(firstErr?.reason instanceof Error ? firstErr.reason.message : "all dream generations failed");
          }
          // stash specs + load every chosen font before the repaint
          const specs: Record<string, DreamRes> = Object.fromEntries(ok);
          (window as unknown as { __DREAM_SPECS__?: Record<string, DreamRes> }).__DREAM_SPECS__ = specs;
          const fams = [...new Set(ok.flatMap(([, r2]) => (r2.spec?.elements || []).map((e) => e.font).filter(Boolean)))] as string[];
          if (fams.length) {
            const href = "https://fonts.googleapis.com/css2?" + fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`).join("&") + "&display=swap";
            if (!document.querySelector(`link[href="${href}"]`)) {
              const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href;
              document.head.appendChild(l);
              await new Promise((res) => setTimeout(res, 900));
            }
          }
          // patch the engine ONCE: styles with a dream spec render the
          // fitted replica; everything else falls through to the original
          const w2 = window as unknown as {
            LabelEngine?: {
              renderStyleOptions: (d: unknown, o: unknown, opts: unknown) => { style: string; svg: string }[];
              renderDreamFitted: (spec: unknown, d: unknown, o: unknown, art: string | null, align?: string, mode?: string) => { svg: string };
              __dreamPatched?: boolean;
            };
          };
          const eng2 = w2.LabelEngine;
          if (eng2 && !eng2.__dreamPatched) {
            const orig = eng2.renderStyleOptions.bind(eng2);
            eng2.renderStyleOptions = (d: unknown, o: unknown, opts: unknown) => {
              const out = orig(d, o, opts);
              const sp = (window as unknown as { __DREAM_SPECS__?: Record<string, DreamRes> }).__DREAM_SPECS__;
              if (!sp) return out;
              return out.map((entry) => {
                const dr = sp[entry.style];
                if (!dr) return entry;
                try {
                  const fit = eng2.renderDreamFitted(dr.spec, d, opts, dr.artwork, dr.artAlign, dr.artworkMode);
                  return { ...entry, svg: fit.svg };
                } catch { return entry; }
              });
            };
            eng2.__dreamPatched = true;
          }
          // the shell keeps its images contract (artwork per style)
          return Object.fromEntries(ok.map(([k, r2]) => [k, { url: r2.artwork || r2.dream }]));
        };
        gen.wired = true; // e2e tests wait for this before driving the UI
      })
      .catch((e) => console.error(e));
  }, []);

  return (
    <div
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: shellBodyHtml }}
    />
  );
}
