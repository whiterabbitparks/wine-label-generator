import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const issues = []; p.on("pageerror", (e) => issues.push("script error: " + e.message)); p.on("response", (r) => { if (r.status() >= 400 && r.url().includes("/api/")) issues.push(`${r.status()} ${r.url().replace("http://localhost:3200", "")}`); });
await p.goto("http://localhost:3200/admin?tab=Final%20round", { waitUntil: "load" });
await p.locator("input").first().fill("John"); await p.locator("input[type=password]").fill("Doe"); await p.keyboard.press("Enter"); await p.waitForTimeout(4000);
const me = await p.evaluate(() => fetch("/api/admin/me").then((r) => r.status));
console.log("session:", me, "| login form still shown:", await p.locator("input[type=password]").count());
await p.goto("http://localhost:3200/admin?tab=Final%20round", { waitUntil: "load" }); await p.waitForTimeout(4000);
const artists = await p.locator("label").filter({ hasText: /Pirosmani/ }).count();
console.log("artists listed:", await p.locator("label input[type=checkbox]").count(), "| Pirosmani:", artists);
await p.screenshot({ path: "tests/layout2/out/admin-1-panel.png" });
/* pick Levan, 1 label, paint */
await p.locator("label").filter({ hasText: /Levan/ }).first().click();
const nums = p.locator("input[type=number]"); await nums.nth(2).fill("1");
await p.locator("button").filter({ hasText: /^Paint$/ }).click();
let got = 0;
for (let i = 0; i < 60; i++) { await p.waitForTimeout(4000); got = await p.locator("img[alt^='L']").count(); if (got) break; }
console.log("painted items shown:", got);
await p.screenshot({ path: "tests/layout2/out/admin-2-painted.png", fullPage: true });
if (got) {
  await p.locator("button").filter({ hasText: /Other layout/ }).first().click(); await p.waitForTimeout(6000);
  await p.locator("button").filter({ hasText: /Other ground/ }).first().click(); await p.waitForTimeout(6000);
  console.log("items after re-sets:", await p.locator("img[alt^='L']").count());
  await p.screenshot({ path: "tests/layout2/out/admin-3-resets.png", fullPage: true });
}
console.log("issues:", issues.length ? issues : "none");
await b.close();
