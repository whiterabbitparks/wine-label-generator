/* 2026-09-30 (owner): Final Pack $399, designer hour $99, product page $49 a YEAR (renews) */
import fs from "node:fs";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const ENV = process.env.PADDLE_ENV === "live" ? "live" : "sandbox";
const API = ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
const H = { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json" };
const f = "src/lib/paddle-prices.json"; const all = JSON.parse(fs.readFileSync(f, "utf8")); const ids = all[ENV];
const patch = async (id: string, body: unknown) => { const r = await fetch(`${API}/prices/${id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(id + " " + r.status + " " + await r.text()); };
await patch(ids.pack, { unit_price: { amount: "39900", currency_code: "USD" } });
await patch(ids.designer, { unit_price: { amount: "9900", currency_code: "USD" } });
/* the page: a new YEARLY price on the same product, the old one archived */
const old = await (await fetch(`${API}/prices/${ids.page}`, { headers: H })).json() as { data: { product_id: string } };
await fetch(`${API}/products/${old.data.product_id}`, { method: "PATCH", headers: H, body: JSON.stringify({ name: "Product page & QR code — 1 year (renews yearly)", description: "A published product page for the wine and its QR code, hosted for one year; renews every year at the same price unless cancelled." }) });
const r = await fetch(`${API}/prices`, { method: "POST", headers: H, body: JSON.stringify({ product_id: old.data.product_id, description: "Product page & QR code — yearly", unit_price: { amount: "4900", currency_code: "USD" }, billing_cycle: { interval: "year", frequency: 1 }, quantity: { minimum: 1, maximum: 1 } }) });
const j = await r.json() as { data?: { id: string } }; if (!j.data) throw new Error("page price " + JSON.stringify(j));
await patch(ids.page, { status: "archived" });
ids.page = j.data.id; fs.writeFileSync(f, JSON.stringify(all, null, 1) + "\n");
console.log("ok", ids);
