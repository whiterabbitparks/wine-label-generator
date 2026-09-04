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
        interface DreamRes { dream: string; preview?: string | null }
        const DREAM_STYLE_KEYS = ["traditional", "contemporary", "punk", "minimalist"];
        const STYLE_LABELS: Record<string, string> = { traditional: "Traditional", contemporary: "Contemporary", punk: "Punk", minimalist: "Minimalist" };
        const wrapDream = (key: string, href: string, wMM = 110, hMM = 73.3) => {
          const W = Math.round(wMM * 10), H = Math.round(hMM * 10);
          return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${wMM}mm" height="${hMM}mm" data-dream="${key}"><image x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" xlink:href="${href}" href="${href}"/></svg>`;
        };
        gen.setProvider = async (brief: unknown, onProgress?: (p: number) => void) => {
          const b = brief as { vision?: string; reference?: string | null; data?: Record<string, string> };
          let doneCount = 0;
          const aspect = (b as { aspect?: string }).aspect || "landscape";
          const runOne = async (styleKey: string): Promise<[string, DreamRes]> => {
            const r = await fetch("/api/dream-label", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vision: b.vision || "", style: styleKey, data: b.data || {}, sketch: b.reference || null, aspect }),
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
          /* branch POPIKA_No_Vector (owner 2026-09-03): the dream IS the
             label. Style cards show the dream image itself — no vector
             replica, no engine patching. */
          const dreams: Record<string, DreamRes> = Object.fromEntries(ok);
          (window as unknown as { __DREAM_IMAGES__?: Record<string, DreamRes> }).__DREAM_IMAGES__ = dreams;
          const w2 = window as unknown as {
            LabelEngine?: {
              renderStyleOptions: (d: unknown, o: unknown, opts: unknown) => { style: string; svg: string }[];
              __dreamPatched?: boolean;
            };
          };
          const eng2 = w2.LabelEngine;
          if (eng2 && !eng2.__dreamPatched) {
            const orig = eng2.renderStyleOptions.bind(eng2);
            eng2.renderStyleOptions = (d: unknown, o: unknown, opts: unknown) => {
              const out = orig(d, o, opts);
              const sp = (window as unknown as { __DREAM_IMAGES__?: Record<string, DreamRes> }).__DREAM_IMAGES__;
              if (!sp) return out;
              const dims = opts as { widthMM?: number; heightMM?: number } | undefined;
              const wMM = dims?.widthMM || 110, hMM = dims?.heightMM || 73.3;
              const mapped = out.map((entry) => {
                const dr = sp[entry.style];
                if (!dr) return entry;
                return { ...entry, svg: wrapDream(entry.style, dr.preview || dr.dream, wMM, hMM) };
              });
              /* minimalist has no legacy card — it joins as the fourth */
              if (sp.minimalist && !mapped.some((e) => e.style === "minimalist"))
                mapped.push({ style: "minimalist", name: "Minimalist", svg: wrapDream("minimalist", sp.minimalist.preview || sp.minimalist.dream, wMM, hMM) } as (typeof mapped)[number]);
              return mapped;
            };
            eng2.__dreamPatched = true;
          }
          return Object.fromEntries(ok.map(([k, r2]) => [k, { url: r2.preview || r2.dream }]));
        };
        /* the shell's payment button calls this for dream labels — the
           full-res dream becomes a 300dpi TIFF download */
        (window as unknown as { __DREAM_TIFF__?: (style: string, nm: string) => void }).__DREAM_TIFF__ = async (style, nm) => {
          const sp = (window as unknown as { __DREAM_IMAGES__?: Record<string, DreamRes> }).__DREAM_IMAGES__;
          const dr = sp?.[style]; // marker key: a style ("punk") or an alternative ("punk#a3")
          if (!dr) return;
          try {
            const res = await fetch("/api/dream-tiff", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: dr.dream, name: nm }),
            });
            if (!res.ok) throw new Error(`print file failed (${res.status})`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `${nm}-300dpi.tiff`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) { console.error(e); }
        };
        /* BACK LABEL ON WEB (owner 2026-09-04): the shell's Back Label tab
           was static HTML — wire it to /api/back-label. Fields are read by
           their row labels (the shell gives them no ids); markets come from
           the country grid's flag order; uploaded barcode/QR files replace
           the generated codes. */
        const backBtn = document.getElementById("backPreviewBtn");
        if (backBtn && !(backBtn as HTMLElement & { _wired?: boolean })._wired) {
          (backBtn as HTMLElement & { _wired?: boolean })._wired = true;
          const FLAG_CODES = ["EU", "AU", "KR", "IL", "US", "NZ", "BR", "GE", "GB", "CN", "MX", "CA", "JP"];
          const fieldByLabel = (want: string): string => {
            const panel = document.getElementById("panel-back");
            if (!panel) return "";
            for (const lb of Array.from(panel.querySelectorAll("label, .o-label, .grp-label, span"))) {
              if ((lb.textContent || "").trim().toLowerCase().startsWith(want)) {
                const row = lb.closest("div");
                const inp = row?.querySelector("input, textarea") as HTMLInputElement | null;
                if (inp && inp.type !== "checkbox" && inp.type !== "file") return inp.value || "";
              }
            }
            return "";
          };
          const fileAsDataUrl = (id: string) => new Promise<string>((res) => {
            const el = document.getElementById(id) as HTMLInputElement | null;
            const f = el?.files?.[0];
            if (!f) { res(""); return; }
            const rd = new FileReader(); rd.onload = () => res(String(rd.result)); rd.onerror = () => res("");
            rd.readAsDataURL(f);
          });
          backBtn.addEventListener("click", async () => {
            const btn = backBtn as HTMLButtonElement;
            const oldTxt = btn.textContent; btn.disabled = true; btn.textContent = "Composing…";
            try {
              const front = (window as unknown as { EightKImageGen?: { buildBrief?: () => { data?: Record<string, string> } } }).EightKImageGen?.buildBrief?.()?.data || {};
              const markets: string[] = [];
              document.querySelectorAll("#countryGrid .country-row").forEach((row, i) => {
                const cb = row.querySelector("input[type=checkbox]") as HTMLInputElement | null;
                if (cb ? cb.checked : row.classList.contains("on")) markets.push(FLAG_CODES[i] || "");
              });
              const hEl = document.getElementById("le_hmm") as HTMLInputElement | null;
              const [qrImage, barcodeImage] = await Promise.all([fileAsDataUrl("qrFile"), fileAsDataUrl("barcodeFile")]);
              const payload = {
                data: {
                  wine: front.wine || "", producer: fieldByLabel("producer company"),
                  description: (document.getElementById("descText") as HTMLTextAreaElement | null)?.value || "",
                  importer: fieldByLabel("importer"), bottlingDate: fieldByLabel("bottling date"),
                  lot: fieldByLabel("lot number"), web: fieldByLabel("web page"),
                  alcohol: front.alcohol || "", volume: front.volume || "",
                  countryOfOrigin: front.country || "", qrImage, barcodeImage,
                },
                markets: markets.filter(Boolean).length ? markets.filter(Boolean) : ["US"],
                heightMM: Number(hEl?.value) || 80,
                format: "png",
              };
              const r = await fetch("/api/back-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
              if (!r.ok) throw new Error(`back label failed (${r.status})`);
              const url = URL.createObjectURL(await r.blob());
              /* layout per owner 2026-09-04: [flags] · gap · black rule ·
                 gap · LABEL · gap · black rule · gap · [pricing]. The gap
                 mirrors the flags section's own top spacing. No download
                 button here — Proceed to Payment IS the download (TEMP,
                 until the payment phase exists). */
              (window as unknown as { __BACK_PAYLOAD__?: unknown }).__BACK_PAYLOAD__ = payload;
              const GAP = 26;
              const box = document.getElementById("backThumbBox") || document.getElementById("backThumbWrap");
              if (box) {
                /* owner 2026-09-04 (final): NO rules — ONLY clean space
                   above and below. The shell gives this box a FIXED height
                   and flex layout, which made content overlap the pricing
                   list below — both overridden inline. */
                (box as HTMLElement).style.display = "block";
                (box as HTMLElement).style.height = "auto";
                (box as HTMLElement).style.maxHeight = "none";
                (box as HTMLElement).style.overflow = "visible";
                box.innerHTML =
                  `<div style="display:block;width:100%">` +
                  `<div style="height:${GAP}px"></div>` +
                  `<img src="${url}" alt="back label" style="width:100%;display:block;border:1px solid #ccc"/>` +
                  `<div style="height:${GAP}px"></div>` +
                  `</div>`;
              }
              const reveal = document.getElementById("backReveal");
              if (reveal) (reveal as HTMLElement).style.display = "";
            } catch (e) { console.error(e); alert(e instanceof Error ? e.message : String(e)); }
            btn.disabled = false; btn.textContent = oldTxt;
          });
        }
        /* TEMP (owner 2026-09-04): the back panel's Proceed to Payment
           downloads the 300dpi TIFF directly — the payment phase will sit
           in between later */
        const backPay = document.querySelector("#panel-back .pay-btn");
        if (backPay && !(backPay as HTMLElement & { _wired?: boolean })._wired) {
          (backPay as HTMLElement & { _wired?: boolean })._wired = true;
          backPay.addEventListener("click", async () => {
            const payload = (window as unknown as { __BACK_PAYLOAD__?: Record<string, unknown> }).__BACK_PAYLOAD__;
            if (!payload) { alert("Generate the back label first."); return; }
            const tr = await fetch("/api/back-label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, format: "tiff" }) });
            if (!tr.ok) { alert("print file failed — try again"); return; }
            const tu = URL.createObjectURL(await tr.blob());
            const a = document.createElement("a"); a.href = tu; a.download = "back-label-300dpi.tiff"; a.click();
            setTimeout(() => URL.revokeObjectURL(tu), 1000);
          });
        }
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
