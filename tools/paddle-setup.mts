/* PADDLE PRODUCTS (2026-09-30): creates the site's products and prices in
   the Paddle account the environment points to (PADDLE_ENV sandbox|live,
   PADDLE_API_KEY) and writes their ids to src/lib/paddle-prices.json under
   that environment. Run once per account:  npx tsx tools/paddle-setup.mts  */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const ENV = process.env.PADDLE_ENV === "live" ? "live" : "sandbox";
const API = ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
const KEY = process.env.PADDLE_API_KEY!;
const call = async (path: string, body: unknown) => {
  const r = await fetch(API + path, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json() as { data?: { id: string }; error?: unknown };
  if (!r.ok || !j.data) throw new Error(path + " " + r.status + " " + JSON.stringify(j.error));
  return j.data.id;
};
const ITEMS: [string, string, string, number][] = [
  ["try1", "1 try — 3 new label versions", "One more try: three new label versions, each inspired by a different artist.", 500],
  ["try3", "3 tries — 9 new label versions", "Three more tries: nine new label versions.", 900],
  ["try10", "10 tries — 30 new label versions", "Ten more tries: thirty new label versions.", 1500],
  ["pack", "Print-ready labels & marketing assets", "Front and back labels as print-ready files, bottle shots and five marketing images.", 39900],
  ["page", "Product page & QR code (1 year hosting)", "A published product page for the wine and its QR code, hosted for one year.", 4900],
  ["designer", "1-hour session with a human designer", "One hour with a designer to refine the label.", 9900],
  ["own", "Marketing assets for your own label", "Bottle shots and marketing images made with the customer's own label.", 900],
];
const out: Record<string, string> = {};
for (const [key, name, desc, cents] of ITEMS) {
  const product = await call("/products", { name, description: desc, tax_category: "standard" });
  out[key] = await call("/prices", { product_id: product, description: name, unit_price: { amount: String(cents), currency_code: "USD" }, quantity: { minimum: 1, maximum: 1 } });
  console.log(key, out[key]);
}
const f = "src/lib/paddle-prices.json";
const all = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
all[ENV] = out;
fs.writeFileSync(f, JSON.stringify(all, null, 1) + "\n");
