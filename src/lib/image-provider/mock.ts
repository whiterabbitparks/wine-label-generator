import type { GenerationJob } from "./types";

/* Mock provider — returns a deterministic engraving-style SVG vignette built from
   the job, so the whole client flow (prompt → backend → image → label repaint)
   is exercised without spending money. Different prompts give different scenes;
   the same prompt always gives the same image. */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateMockImage(job: GenerationJob): Promise<string> {
  const W = job.size?.w || 1024;
  const H = job.size?.h || 640;
  const seed = hash(job.prompt || job.vision || "8k-labels");
  const pick = <T,>(arr: T[], salt: number) => arr[(seed + salt) % arr.length];

  // house rule: artwork is always on a clean solid WHITE background (the
  // multiply blend then makes the white vanish on the label)
  const paper = "#ffffff";
  const ink = pick(["#4a4234", "#3f3a2f", "#514735"], 2);
  const subject = (job.vision || "").trim().slice(0, 90) || "Vineyard beneath the mountains";

  // hills + sun vary with the seed so "regenerate" visibly changes the scene
  const sunX = 0.2 + ((seed >> 4) % 60) / 100;
  const h1 = 0.42 + ((seed >> 8) % 12) / 100;
  const h2 = 0.5 + ((seed >> 12) % 12) / 100;

  let vines = "";
  for (let r = 1; r <= 4; r++) {
    const y = H * (0.58 + r * 0.08);
    vines += `<path d="M ${(W * 0.08).toFixed(0)} ${y.toFixed(0)} Q ${(W * 0.5).toFixed(0)} ${(y - H * 0.035).toFixed(0)} ${(W * 0.92).toFixed(0)} ${y.toFixed(0)}" fill="none" stroke="${ink}" stroke-width="2" opacity="0.55"/>`;
  }
  for (let i = 0; i < 7; i++) {
    const x = W * (0.14 + i * 0.12);
    vines += `<line x1="${x.toFixed(0)}" y1="${(H * 0.62).toFixed(0)}" x2="${x.toFixed(0)}" y2="${(H * 0.92).toFixed(0)}" stroke="${ink}" stroke-width="2.5" opacity="0.5"/>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${paper}"/>` +
    `<circle cx="${(W * sunX).toFixed(0)}" cy="${(H * 0.22).toFixed(0)}" r="${(H * 0.09).toFixed(0)}" fill="none" stroke="${ink}" stroke-width="3" opacity="0.7"/>` +
    `<path d="M 0 ${(H * h1).toFixed(0)} Q ${(W * 0.3).toFixed(0)} ${(H * (h1 - 0.14)).toFixed(0)} ${(W * 0.62).toFixed(0)} ${(H * h1).toFixed(0)} T ${W} ${(H * (h1 - 0.04)).toFixed(0)}" fill="none" stroke="${ink}" stroke-width="3" opacity="0.75"/>` +
    `<path d="M 0 ${(H * h2).toFixed(0)} Q ${(W * 0.45).toFixed(0)} ${(H * (h2 - 0.1)).toFixed(0)} ${W} ${(H * h2).toFixed(0)}" fill="none" stroke="${ink}" stroke-width="2.5" opacity="0.6"/>` +
    vines +
    `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${ink}" stroke-width="4"/>` +
    `<rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${ink}" stroke-width="1.5"/>` +
    `<text x="${W / 2}" y="${(H * 0.1).toFixed(0)}" text-anchor="middle" font-family="Georgia, serif" font-size="${(H * 0.045).toFixed(0)}" font-style="italic" fill="${ink}">${esc(subject)}</text>` +
    `<text x="${W / 2}" y="${H - 40}" text-anchor="middle" font-family="Georgia, serif" font-size="${(H * 0.03).toFixed(0)}" letter-spacing="4" fill="${ink}" opacity="0.55">MOCK ARTWORK — PROVIDER NOT WIRED TO A REAL MODEL</text>` +
    `</svg>`;

  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}
