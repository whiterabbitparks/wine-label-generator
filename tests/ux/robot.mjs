/* UX ROBOT (owner, 2026-10-02: "look through the different UX scenarios
   and find bugs, unforeseen paths, mistakes — someone goes somewhere,
   presses Back, then pays…"). A browser walks the live site with the
   footer's dev switches on (fake painting, fake payment, filled details —
   nothing is spent) and, at every step, records what a person would trip
   over: script errors, failed requests, broken images, text running into
   text, a page with no way forward, a state lost on reload.

     node tests/ux/robot.mjs [scenario …]      (BASE=https://8k.wine, OUT=dir)
*/
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "https://8k.wine";
const OUT = process.env.OUT || "tests/ux/out";
fs.mkdirSync(OUT, { recursive: true });

export async function session(name, { viewport = { width: 1440, height: 900 }, lang = "en", fake = true, order = null } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ fake, lang, order }) => {
    try {
      if (!sessionStorage.getItem("ux-init")) {
        sessionStorage.setItem("ux-init", "1");
        if (order) localStorage.setItem("nui-order", JSON.stringify(order));
        /* fake = no real painting; details are filled and payment is fake either way */
        if (fake) localStorage.setItem("nui-live-gen", "0");
        localStorage.setItem("nui-fake-pay", "1"); localStorage.setItem("nui-fill", "1");
        localStorage.setItem("nui-lang", lang);
      }
    } catch { }
  }, { fake, lang, order });
  const page = await ctx.newPage();
  const log = { name, steps: [], issues: [] };
  let step = "start";
  const issue = (kind, detail) => { log.issues.push({ step, kind, detail: String(detail).slice(0, 400) }); };
  page.on("pageerror", (e) => issue("script error", e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|Server Reference ID/i.test(m.text())) issue("console error", m.text()); });
  page.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && u.startsWith(BASE) && !/favicon/.test(u)) issue("failed request", `${r.status()} ${u.replace(BASE, "")}`); });
  const dir = path.join(OUT, name); fs.mkdirSync(dir, { recursive: true });
  let n = 0;

  const api = {
    page, log,
    /* the current page key from the address bar (?page=…) */
    where: () => new URL(page.url()).searchParams.get("page") || "?",
    async check(label) {
      step = `${++n} ${label} [${api.where()}]`;
      await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const out = { broken: [], overlaps: [], next: null };
        for (const img of document.images) {
          const st = getComputedStyle(img); const b = img.getBoundingClientRect();
          if (img.complete && img.naturalWidth === 0 && img.src && b.width > 4 && st.visibility !== "hidden" && st.display !== "none" && +st.opacity > 0.05) out.broken.push(img.src.slice(0, 120));
        }
        /* visible text leaves */
        const leaves = [];
        const vis = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.05) return false; } return true; };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          const txt = t.textContent.trim(); if (txt.length < 2) continue;
          const el = t.parentElement; if (!el || ["SCRIPT", "STYLE", "TEXTAREA", "OPTION"].includes(el.tagName)) continue;
          const rg = document.createRange(); rg.selectNodeContents(t);
          for (const b of rg.getClientRects()) {
            if (!(b.width > 3 && b.height > 3 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth && vis(el))) continue;
            /* text covered by something on top (a modal) is not seen */
            const top = document.elementFromPoint(Math.min(innerWidth - 1, b.left + b.width / 2), Math.min(innerHeight - 1, b.top + b.height / 2));
            if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;
            leaves.push({ txt: txt.slice(0, 40), b, el });
          }
        }
        for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
          const a = leaves[i], c = leaves[j];
          if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
          const w = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), h = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
          /* a real collision, not two stacked lines whose boxes touch */
          if (w > 3 && h > 0.45 * Math.min(a.b.height, c.b.height) && w * h > 0.25 * Math.min(a.b.width * a.b.height, c.b.width * c.b.height)) out.overlaps.push(`"${a.txt}" × "${c.txt}"`);
        }
        /* text cut by its own box (a button too narrow for its words) */
        for (const el of document.querySelectorAll("button, a, label, span, div")) {
          if (el.children.length || !el.textContent.trim()) continue;
          const s = getComputedStyle(el);
          if (s.overflow === "hidden" && el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis" && vis(el)) out.overlaps.push(`cut: "${el.textContent.trim().slice(0, 40)}"`);
        }
        const nb = document.querySelector("[aria-label='next'], [aria-label='start']");
        out.next = nb ? { disabled: nb.disabled || getComputedStyle(nb).pointerEvents === "none" } : null;
        return out;
      });
      for (const b of r.broken) issue("broken image", b);
      for (const o of [...new Set(r.overlaps)].slice(0, 12)) issue("overlap", o);
      const shot = path.join(dir, `${String(n).padStart(2, "0")}-${label.replace(/[^\w]+/g, "_")}.png`);
      await page.screenshot({ path: shot });
      log.steps.push({ step, shot, next: r.next });
      return r;
    },
    async next(label = "next") {
      const b = page.locator("[aria-label='next'], [aria-label='start']").first();
      if (!(await b.count())) { issue("no way forward", "no next button"); return false; }
      await b.click({ timeout: 5000 }).catch((e) => issue("next not clickable", e.message.split("\n")[0]));
      await page.waitForTimeout(1500);
      await api.check(label);
      return true;
    },
    async back(label = "browser back") { await page.goBack({ timeout: 15000 }).catch((e) => issue("back failed", e.message.split("\n")[0])); await page.waitForTimeout(1500); await api.check(label); },
    async reload(label = "reload") { await page.reload({ timeout: 30000 }); await page.waitForTimeout(3000); await api.check(label); },
    async click(textOrSel, label) {
      const loc = textOrSel.startsWith("[") || textOrSel.startsWith("#") ? page.locator(textOrSel).first() : page.getByText(textOrSel, { exact: false }).first();
      if (!(await loc.count())) { issue("missing control", textOrSel); return false; }
      await loc.click({ timeout: 5000 }).catch((e) => issue("click failed", `${textOrSel}: ${e.message.split("\n")[0]}`));
      await page.waitForTimeout(1200);
      if (label) await api.check(label);
      return true;
    },
    async waitPage(key, ms = 60000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (api.where() === key) return true; await page.waitForTimeout(500); }
      issue("stuck", `waited ${ms / 1000}s for ${key}, still on ${api.where()}`); return false;
    },
    async done() { fs.writeFileSync(path.join(dir, "log.json"), JSON.stringify(log, null, 1)); await browser.close(); return log; },
  };
  return api;
}
