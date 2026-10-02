import { session } from "./robot.mjs";
const s = await session("walk2");
await s.page.goto(process.env.BASE || "https://8k.wine", { waitUntil: "load", timeout: 60000 });
await s.page.waitForTimeout(9000);
await s.next("start");            // → taste
await s.next("taste next");       // → vision
await s.next("vision next");      // → confirm modal
await s.click("Create", "confirm create");
await s.waitPage("options", 60000);
await s.page.waitForTimeout(6000);
await s.check("labels page");
console.log("on", s.where());
const texts = await s.page.evaluate(() => [...document.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).filter(Boolean));
console.log(texts.join(" | "));
const log = await s.done();
console.log(JSON.stringify(log.issues.map((i) => `${i.step} :: ${i.kind} :: ${i.detail}`), null, 1));
