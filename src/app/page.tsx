"use client";

/* The configurator, transplanted VERBATIM from 8k-labels-package/dist/configurator.html.
   The static body HTML and the five behavior scripts are byte-identical to the
   original build (extracted by tests/parity/extract-shell.mjs — rerun that after
   `node build.js` in the package to resync). React only hosts them; it renders
   the HTML once and never touches the subtree again, so the original scripts own
   the DOM exactly as they do in the single-file version. */
import { useEffect, useRef } from "react";
import { loadScriptsSequentially } from "@/lib/load-scripts";
import shellBodyHtml from "./shell-body";
import shellScripts from "./shell-scripts.json";

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
        const gen = (
          window as unknown as {
            EightKImageGen?: { provider: unknown; setConfig?: (c: unknown) => void };
          }
        ).EightKImageGen;
        if (!gen) return;
        // apply the server-persisted Art Direction config (edited at /admin)
        fetch("/api/admin/config")
          .then((r) => r.json())
          .then((cfg) => gen.setConfig?.(cfg))
          .catch(() => {});
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
