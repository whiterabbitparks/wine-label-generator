import { session } from "./robot.mjs";
const s = await session("walk1");
await s.page.goto(process.env.BASE || "https://8k.wine", { waitUntil: "load", timeout: 60000 });
await s.page.waitForTimeout(9000);
await s.check("open");
for (let i = 0; i < 12; i++) {
  const before = s.where();
  await s.next(`next from ${before}`);
  await s.page.waitForTimeout(2500);
  console.log(before, "→", s.where());
  if (s.where() === before) { await s.page.waitForTimeout(6000); if (s.where() === before) { console.log("stays on", before); break; } }
}
const log = await s.done();
console.log(JSON.stringify(log.issues, null, 1).slice(0, 3000));
