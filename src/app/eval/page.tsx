"use client";

/* /eval moved into the admin (round 97) — this address just forwards */
import { useEffect } from "react";

export default function EvalRedirect() {
  useEffect(() => { window.location.replace("/admin?tab=Evaluate"); }, []);
  return null;
}
