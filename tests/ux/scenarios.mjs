/* The scenarios a real visitor can wander into. Run one or all:
     node tests/ux/scenarios.mjs [name …]
   Each writes tests/ux/out/<name>/ (screenshots + log.json). */
import { session } from "./robot.mjs";
import { open, toLabels, select, forwardTo, report, createIn } from "./flows.mjs";

const note = (s, kind, detail) => s.log.issues.push({ step: s.where(), kind, detail });
const imgsOnPage = (s) => s.page.evaluate(() => [...document.images].filter((i) => i.naturalWidth > 0 && i.getBoundingClientRect().width > 80).length);

/* a saved order of three REAL labels from the server (nothing painted) */
const REAL = [["traditional", "2026-10-02-e6673e80430d", "Petre Otskheli"], ["contemporary", "2026-10-02-8d3ab6d748f7", "Rati Bakradze"], ["punk", "2026-10-02-1c8df558bdb6", "Niko Pirosmani"]];
const realOrder = () => ({ v: 1, at: Date.now(), vision: "Two old friends share a jug of wine under a fig tree", f: { producer: "Giorgi's Marani", wine: "Dzelshavi", vintage: "2021", colour: "Red", wineType: "Wine", alcohol: "13", volume: "750", width: "110", height: "80" }, sets: [REAL.map(([style, id, artist]) => ({ style, id, artist }))], setIdx: 0, selSet: 0, selected: -1 });

const totalOf = (s) => s.page.evaluate(() => { const m = document.body.innerText.match(/\$(\d{3,4})(?![\s\S]*Total)/); const all = [...document.body.innerText.matchAll(/\$(\d{3,4})/g)].map((x) => +x[1]); return Math.max(0, ...all); });
const SCEN = {
  /* REAL painting (3 labels): change only the year, come back — the labels
     page must show its waiting columns, never the old loader page */
  async yearchange(s) {
    await open(s); await toLabels(s);
    await s.waitPage("options", 30000);
    for (let i = 0; i < 60; i++) { if ((await imgsOnPage(s)) >= 3) break; await s.page.waitForTimeout(5000); }
    await s.check("real labels made");
    await s.back("back to the details");
    if (s.where() !== "vision") await s.waitPage("vision", 10000);
    const idx = await s.page.evaluate(() => [...document.querySelectorAll("input")].findIndex((x) => /^\d{4}$/.test(x.value)));
    if (idx >= 0) { const el = s.page.locator("input").nth(idx); await el.click({ clickCount: 3 }); await el.fill("1999"); }
    else note(s, "missing control", "vintage field");
    await s.check("year changed");
    await s.next("next after the year");
    if (await s.page.locator("button").filter({ hasText: /^(Create|შექმნა)$/ }).count()) await createIn(s, "confirm");
    const seen = [];
    for (let i = 0; i < 20; i++) { seen.push(s.where()); await s.page.waitForTimeout(1000); }
    await s.check("after the re-set");
    if (seen.includes("loader")) note(s, "old loader page", `pages seen: ${[...new Set(seen)].join(" → ")}`);
    const yrShown = await s.page.evaluate(() => document.body.innerText.includes("1999"));
    console.log("pages seen:", [...new Set(seen)].join(" → "), "| 1999 on the page:", yrShown);
  },
  /* the Final Pack's product page row: only with a CREATED QR */
  async qrnone(s) {
    await open(s); await toLabels(s); await select(s, 0); await forwardTo(s, "checkout", 8);
    await s.page.waitForTimeout(2500); await s.check("final pack without a QR");
    const tot = await totalOf(s); if (tot !== 498) note(s, "wrong total", `without a QR the total is $${tot} (expected $498)`);
    await s.click("Product Page", "click the product page row");
    const tot2 = await totalOf(s); if (tot2 !== 498) note(s, "row still active", `after clicking it the total is $${tot2}`);
  },
  async qrcreate(s) {
    await open(s); await toLabels(s); await select(s, 0); await forwardTo(s, "backdetails", 3);
    await s.click("Create QR Code", "create QR chosen");
    await forwardTo(s, "checkout", 8);
    await s.page.waitForTimeout(2500); await s.check("final pack with a created QR");
    const tot = await totalOf(s); if (tot !== 547) note(s, "wrong total", `with a created QR the total is $${tot} (expected $547)`);
  },
  /* a visitor with real labels: reload on every page */
  async restore(s) {
    await s.page.goto((process.env.BASE || "https://8k.wine") + "/?page=options", { waitUntil: "load", timeout: 60000 });
    await s.page.waitForTimeout(8000);
    await s.check("open with a saved order");
    const n0 = await imgsOnPage(s);
    if (n0 < 3) note(s, "saved labels not shown", `${n0} pictures on ${s.where()}`);
    await select(s, 1);
    for (const key of ["options", "backdetails", "backdesign", "bottle", "assets"]) {
      if (key !== "options" && !(await forwardTo(s, key, 3))) break;
      const before = await imgsOnPage(s);
      await s.reload(`reload on ${key}`);
      await s.page.waitForTimeout(5000);
      await s.check(`after reload on ${key}`);
      const after = await imgsOnPage(s);
      if (s.where() !== key) note(s, "reload moved page", `reload on ${key} → ${s.where()}`);
      if (after < before) note(s, "reload lost pictures", `${key}: ${before} pictures before, ${after} after`);
    }
  },
  /* Back and forward again at every page of the path */
  async backforward(s) {
    await open(s); await toLabels(s); await select(s, 0);
    for (const key of ["backdetails", "backdesign", "bottle", "assets"]) {
      if (!(await forwardTo(s, key, 3))) break;
      const at = s.where();
      await s.back(`browser back from ${at}`);
      const after = s.where();
      await s.page.goForward().catch(() => {}); await s.page.waitForTimeout(1500);
      await s.check(`browser forward to ${at}`);
      if (s.where() !== at) note(s, "forward lost", `back from ${at} went to ${after}; forward came to ${s.where()}`);
    }
  },
  /* Reload on every page: does the visitor land where they were, with their things? */
  async reload(s) {
    await open(s); await toLabels(s);
    const want = { options: 3 };
    for (const key of ["options", "backdetails", "backdesign", "bottle"]) {
      if (key === "backdetails") await select(s, 0);
      if (key !== "options" && !(await forwardTo(s, key, 3))) break;
      const before = await imgsOnPage(s);
      await s.reload(`reload on ${key}`);
      await s.page.waitForTimeout(4000);
      const resumeBtn = await s.page.getByText(/continue|გაგრძელება/i).first().count();
      if (resumeBtn) { await s.page.getByText(/continue|გაგრძელება/i).first().click().catch(() => {}); await s.page.waitForTimeout(5000); await s.check(`resume after reload on ${key}`); }
      const after = await imgsOnPage(s);
      if (s.where() !== key) note(s, "reload moved page", `reload on ${key} → ${s.where()}`);
      if (after < Math.min(before, want[key] || 1)) note(s, "reload lost pictures", `${key}: ${before} pictures before, ${after} after`);
    }
  },
  /* NEW TRY until the tries run out, buy (fake), carry on — and with a label selected */
  async newtry(s) {
    await open(s); await toLabels(s);
    for (let i = 0; i < 4; i++) {
      const nt = s.page.getByText(/NEW TRY/).first();
      if (!(await nt.count())) { note(s, "missing control", "NEW TRY"); break; }
      if (i === 2) await select(s, 1);
      await nt.click().catch((e) => note(s, "click failed", e.message.split("\n")[0]));
      await s.page.waitForTimeout(3000);
      await s.check(`new try ${i + 1}`);
      if (s.where() === "more") {
        const buy = s.page.locator("[aria-label='next']").first();
        await buy.click().catch(() => {}); await s.page.waitForTimeout(6000);
        await s.check("after buying tries");
      }
      if (s.where() !== "options") await s.waitPage("options", 30000);
      await s.page.waitForTimeout(4000);
    }
    await s.check("labels after tries");
  },
  /* the whole path in Georgian */
  async georgian(s) { await open(s); await toLabels(s); await select(s, 0); await forwardTo(s, "checkout", 10); },
  /* the whole path at the iPad's size */
  async ipad(s) { await open(s); await toLabels(s); await select(s, 2); await forwardTo(s, "checkout", 10); },
  /* jumping ahead on the progress bar before anything is made */
  async jump(s) {
    await open(s); await s.next("start"); await s.next("taste next");
    for (const lab of ["MARKETING ASSETS", "BACK LABEL", "Bottle Details", "FRONT LABEL"]) {
      const b = s.page.getByRole("button", { name: lab, exact: true }).first();
      if (!(await b.count())) { note(s, "missing control", lab); continue; }
      await b.click({ force: true }).catch(() => {}); await s.page.waitForTimeout(2000);
      await s.check(`progress jump: ${lab}`);
      const n = await imgsOnPage(s);
      if (["assets", "backdesign", "options", "checkout"].includes(s.where()) && n === 0) note(s, "empty page reachable", `${lab} → ${s.where()} with nothing on it`);
    }
  },
  /* select, then unselect, then next */
  async deselect(s) {
    await open(s); await toLabels(s); await select(s, 0); await select(s, 0);
    await s.next("next with nothing selected");
    if (s.where() !== "options") note(s, "went on without a label", `→ ${s.where()}`);
  },
  /* the header's pages in the middle of the path, then back to work */
  async header(s) {
    await open(s); await toLabels(s); await select(s, 0); await forwardTo(s, "backdesign", 3);
    for (const lab of ["About Us", "About artists", "Gallery"]) {
      await s.click(lab, `header: ${lab}`);
      await s.back(`back from ${lab}`);
      if (s.where() !== "backdesign") note(s, "header trip lost the place", `${lab} → back landed on ${s.where()}`);
    }
    await s.next("carry on after header trips");
  },
  /* the confirmation windows: closed, edited, and the button behind them */
  async modals(s) {
    await open(s); await s.next("start"); await s.next("taste next"); await s.next("vision next (window)");
    await s.click("[aria-label='close confirm']", "close window ✕");
    await s.next("vision next again"); await s.click("Edit Details", "edit details");
    await s.next("vision next (third)"); await createIn(s, "create");
    await s.waitPage("options", 90000); await s.page.waitForTimeout(4000); await select(s, 0);
    await forwardTo(s, "assets", 6);
    /* the window on the marketing page: the red button behind it */
    await s.next("red button while the marketing window is open");
    const stillOpen = await s.page.getByText(/CHECK YOUR DETAILS/).count();
    if (s.where() !== "assets" && stillOpen) note(s, "window follows to another page", `the confirmation window is still open on ${s.where()}`);
    await s.back("browser back with the window open");
  },
  /* checkout: agree, pay (fake), download */
  async checkout(s) {
    await open(s); await toLabels(s); await select(s, 0);
    await forwardTo(s, "assets", 6);
    await createIn(s, "create marketing (fake)");
    await s.page.waitForTimeout(8000); await s.check("marketing made");
    await forwardTo(s, "checkout", 3);
    await s.next("pay without agreeing");
    const glass = s.page.locator("text=/By clinking|ჭიქ/").first();
    if (await glass.count()) { await glass.click().catch(() => {}); await s.page.waitForTimeout(800); await s.check("agreed"); }
    await s.next("pay (fake)");
    await s.page.waitForTimeout(8000); await s.check("after payment");
  },
};

const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCEN);
const results = await Promise.all(want.map(async (name) => {
  const s = await session(name, name === "ipad" ? { viewport: { width: 1366, height: 1024 } } : name === "georgian" ? { lang: "ge" } : name === "restore" ? { order: realOrder() } : name === "yearchange" ? { fake: false } : {});
  try { await SCEN[name](s); } catch (e) { note(s, "robot stopped", e.message.split("\n")[0]); }
  return [name, report(await s.done())];
}));
for (const [name, lines] of results) { console.log(`\n=== ${name} (${lines.length})`); for (const l of lines) console.log("  " + l); }
