"use client";

/* LEGACY ADMIN (owner 2026-08-25): the previous engine's full admin, kept
   reachable while the Dream Engine takes over /admin. Everything here still
   works against the old routes; the old branches keep it at /admin forever. */
import LegacyAdmin from "./LegacyAdmin";

export default function LegacyPage() {
  return <LegacyAdmin />;
}
