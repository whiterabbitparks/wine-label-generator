"use client";

/* THE ARTISTS (2026-09-24, the admin tidy — replaces the old "who paints
   each column" picker, which stopped meaning anything once every run
   mixes the artists across the columns). One card per artist: on or off,
   the trained model, the owner's sets of works (turned one a label), how
   many labels they have painted, and — first, in red when missing — the
   artist's consent. Read-only: switching an artist or changing a set is
   a word to Claude (a deploy copies data/artists to the server). */

import { useEffect, useState } from "react";
import { AdminStyles as S } from "../legacy/LegacyAdmin";

type A = {
  id: string; name: string; active: boolean; page: boolean; consent: string; status: string; note: string;
  works: string[]; refSets: string[][]; lora: { trigger: string; trainedAt: string; works: number } | null; painted: number;
};

const small = { fontSize: 11.5, color: "#6b6a60" } as React.CSSProperties;

export function ArtistsCard() {
  const [list, setList] = useState<A[] | null>(null);
  useEffect(() => { fetch("/api/admin/artists").then((r) => r.json()).then((b) => setList(b.artists || [])); }, []);
  if (!list) return <div style={S.card}>Loading…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
      {list.map((a) => {
        const noConsent = /NOT OBTAINED/i.test(a.consent);
        const thumb = (f: string) => `/api/admin/artists?id=${a.id}&work=${encodeURIComponent(f)}`;
        return (
          <div key={a.id} style={{ ...S.card, margin: 0, opacity: a.active ? 1 : 0.55 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <b style={{ fontSize: 15 }}>{a.name}</b>
              <span style={{ fontSize: 11, padding: "1px 8px", border: "1px solid #111", background: a.active ? "#111" : "#fff", color: a.active ? "#fff" : "#111" }}>{a.active ? "painting" : "switched off"}</span>
              <span style={small}>{a.painted} labels painted · {a.works.length} works{a.page ? " · has a page on the site" : ""}</span>
            </div>
            <div style={{ ...small, marginTop: 6, color: noConsent ? "#B71318" : "#6b6a60", fontWeight: noConsent ? 700 : 400 }}>
              Consent: {a.consent || "—"}
            </div>
            <div style={{ ...small, marginTop: 4 }}>
              Model: {a.lora ? `trained ${a.lora.trainedAt.slice(0, 10)} on ${a.lora.works} works (trigger ${a.lora.trigger})` : "not trained yet"}
            </div>
            {a.note && <div style={{ ...small, marginTop: 4 }}>Your note on the hand: “{a.note}”</div>}
            {a.refSets.length > 0 ? (
              <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
                {a.refSets.map((set, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>Set {String.fromCharCode(65 + i)}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {set.map((f) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={f} src={thumb(f)} alt={f} title={f} style={{ height: 64, border: "1px solid #E3E3E1" }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ ...small, marginTop: 8 }}>No sets of works chosen yet — four are picked evenly from the folder.</div>
            )}
          </div>
        );
      })}
      <p style={small}>To switch an artist on or off, or change a set of works, tell Claude — a deploy copies the artists&rsquo; files to the server, so a switch made only on the live admin would be undone.</p>
    </div>
  );
}
