import { session } from "./robot.mjs";
import { open, toLabels, select, forwardTo } from "./flows.mjs";
const s = await session("probe-row");
await open(s); await toLabels(s); await select(s, 0); await forwardTo(s, "checkout", 8);
await s.page.waitForTimeout(3000);
const info = await s.page.evaluate(() => {
  const el = [...document.querySelectorAll("button")].find((b) => /Product Page & QR/.test(b.textContent));
  if (!el) return "row not found";
  const chain = []; for (let e = el; e && chain.length < 8; e = e.parentElement) { const st = getComputedStyle(e); chain.push(`${e.tagName} op=${st.opacity} col=${st.color} filter=${st.filter}`); }
  const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 20, r.top + r.height / 2);
  return { chain, top: top ? `${top.tagName} ${top.textContent?.slice(0, 40)} op=${getComputedStyle(top).opacity} bg=${getComputedStyle(top).background.slice(0, 80)}` : null, topIsRow: top === el };
});
console.log(JSON.stringify(info, null, 1));
await s.done();
