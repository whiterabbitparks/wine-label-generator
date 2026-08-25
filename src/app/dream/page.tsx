"use client";

/* Dream Studio standalone page — the same core the /admin tab embeds. */
import { useEffect, useState } from "react";
import { StudioCore, S, INK } from "./studio";

export default function DreamStudioPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((m) => setAuthed(!!m.authenticated));
  }, []);
  if (authed === null) return <main style={S.page}>Checking session…</main>;
  if (!authed)
    return (
      <main style={S.page}>
        <div style={S.wrap}>
          <h1 style={S.h1}>DREAM STUDIO</h1>
          <p style={S.sub}>Log in at <a href="/admin">/admin</a> first, then come back.</p>
        </div>
      </main>
    );
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `2px solid ${INK}`, paddingBottom: 10 }}>
          <h1 style={S.h1}>DREAM STUDIO</h1>
          <span style={S.sub}>the new engine — dreams lead, architecture follows · <a href="/admin">admin</a></span>
        </div>
        <StudioCore />
      </div>
    </main>
  );
}
