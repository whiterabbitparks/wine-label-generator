/* the shared moves of the scenarios */
export async function open(s) {
  await s.page.goto(process.env.BASE || "https://8k.wine", { waitUntil: "load", timeout: 60000 });
  await s.page.waitForTimeout(9000);
  await s.check("open");
}
export async function toLabels(s) {
  await s.next("start");
  await s.next("taste next");
  await s.next("vision next");
  await createIn(s, "confirm create");
  await s.waitPage("options", 90000);
  await s.page.waitForTimeout(5000);
  await s.check("labels page");
}
export async function select(s, i = 0) {
  const b = s.page.getByText(/^(Select|აირჩიე)$/).nth(i);
  if (!(await b.count())) { s.log.issues.push({ step: s.where(), kind: "missing control", detail: "Select" }); return; }
  await b.click(); await s.page.waitForTimeout(1200); await s.check(`select label ${i + 1}`);
}
/* forward until `key` (or a page that will not move) */
export async function forwardTo(s, key, max = 8) {
  for (let i = 0; i < max && s.where() !== key; i++) {
    const before = s.where();
    await s.next(`next from ${before}`);
    await s.page.waitForTimeout(2500);
    if (s.where() === before) {
      await s.page.waitForTimeout(8000);
      if (s.where() === before) { await s.check(`stays on ${before}`); return false; }
    }
  }
  return s.where() === key;
}
export const report = (log) => log.issues.map((i) => `${i.step} :: ${i.kind} :: ${i.detail}`);

/* the confirmation window's black button (English or Georgian) */
export async function createIn(s, label) {
  const b = s.page.locator("button").filter({ hasText: /^(Create|შექმნა|შექმენი)$/ }).last();
  if (!(await b.count())) { s.log.issues.push({ step: s.where(), kind: "missing control", detail: "Create button" }); return; }
  await b.click({ timeout: 5000 }).catch((e) => s.log.issues.push({ step: s.where(), kind: "click failed", detail: e.message.split("\n")[0] }));
  await s.page.waitForTimeout(1500); await s.check(label);
}
