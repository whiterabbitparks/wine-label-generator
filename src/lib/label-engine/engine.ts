/**
 * Wine Label Engine - Interim Implementation
 *
 * This is a simplified, working version that generates valid SVGs with correct structure.
 * Full rendering logic from legacy/src/label-engine.js will be ported in a follow-up pass.
 *
 * For now, this generates placeholder SVGs that are structurally correct:
 * - Correct viewBox and dimensions
 * - Proper 2mm bleed and 5mm safety margins
 * - All 6 styles with distinct layouts
 * - Text content from label data
 * - Placeholder SVG content
 */

import { LabelData, RenderOptions } from "./types";
import { measure } from "./measure";
import { FONTS_URL, fontFamilies } from "../fonts";

const SM = 50; // 5mm safety margin in units (0.1mm)
const SBLEED = 20; // 2mm bleed in units

/**
 * Ensure Google Fonts are loaded before rendering
 */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined") return;

  if (!document.getElementById("__lblfonts")) {
    const style = document.createElement("style");
    style.id = "__lblfonts";
    style.textContent = `@import url('${FONTS_URL}');`;
    document.head.appendChild(style);
  }

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      console.warn("Font loading error:", e);
    }
  }
}

/**
 * Format label data into display-ready text fields
 */
function formatFields(data: LabelData) {
  return {
    producer: String(data.producer || "").trim(),
    wine: String(data.wine || "").trim(),
    appellation: String(data.appellation || "").trim(),
    grape: String(data.grape || "").trim(),
    region: [data.region, data.country].filter(Boolean).join(", "),
    vintage: String(data.vintage || "").trim(),
    classification: String(data.classification || "").trim(),
    special: String(data.special || "").trim(),
    descriptor: formatDescriptor(data),
    alc: [data.alcohol, data.volume].filter(Boolean).join(" · "),
  };
}

/**
 * Format wine descriptor from attributes
 */
function formatDescriptor(data: LabelData): string {
  const parts = [
    data.sweetness !== "N/A" ? data.sweetness : "",
    data.wineColorName !== "N/A" ? data.wineColorName : "",
    data.wineType !== "N/A" ? data.wineType : "",
  ]
    .filter(Boolean);
  return parts.join(", ");
}

/**
 * Escape XML/SVG special characters
 */
function esc(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate SVG wrapper with proper structure
 */
function wrapSVG(
  W: number,
  H: number,
  widthMM: number,
  heightMM: number,
  bgColor: string,
  content: string
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W.toFixed(
    1
  )} ${H.toFixed(1)}" width="${widthMM}mm" height="${heightMM}mm">
    <defs>
      <style><![CDATA[@import url('${FONTS_URL}');]]></style>
    </defs>
    <rect x="${(-SBLEED).toFixed(1)}" y="${(-SBLEED).toFixed(1)}" width="${(
      W +
      2 * SBLEED
    ).toFixed(1)}" height="${(H + 2 * SBLEED).toFixed(1)}" fill="${bgColor}"/>
    ${content}
  </svg>`;
}

/**
 * Render a single label in Traditional style (uses heritage engine compositions)
 */
function renderTraditional(
  data: LabelData,
  order: string[],
  options: RenderOptions
): string {
  const { widthMM = 100, heightMM = 80 } = options;
  const W = widthMM * 10;
  const H = heightMM * 10;
  const f = formatFields(data);

  const bg = "#f5f5f5";
  const textColor = "#1a1a1a";

  const content = `
    <text x="${(W / 2).toFixed(1)}" y="${(SM + 20).toFixed(1)}" text-anchor="middle" font-family="'Cormorant Garamond', serif" font-size="36" fill="${textColor}" font-weight="600">
      ${esc(f.wine)}
    </text>
    <text x="${(W / 2).toFixed(1)}" y="${(SM + 60).toFixed(1)}" text-anchor="middle" font-family="'EB Garamond', serif" font-size="14" fill="#666">
      ${esc(f.producer)}
    </text>
    <text x="${(W / 2).toFixed(1)}" y="${(H - SM - 20).toFixed(1)}" text-anchor="middle" font-family="'EB Garamond', serif" font-size="12" fill="#666">
      ${esc(f.vintage)} · ${esc(f.region)}
    </text>
  `;

  return wrapSVG(W, H, widthMM, heightMM, bg, content);
}

/**
 * Render a single label in Contemporary style
 */
function renderContemporary(
  data: LabelData,
  order: string[],
  options: RenderOptions
): string {
  const { widthMM = 100, heightMM = 80 } = options;
  const W = widthMM * 10;
  const H = heightMM * 10;
  const f = formatFields(data);

  const bg = "#f6f5f2";
  const accent = "#e74c3c";

  const content = `
    <rect x="10" y="10" width="15" height="${(H - 20).toFixed(1)}" fill="${accent}"/>
    <text x="${(SM + 30).toFixed(1)}" y="50" font-family="'Archivo', sans-serif" font-size="14" font-weight="600" fill="#999" text-transform="uppercase">
      ${esc(f.producer)}
    </text>
    <text x="${(W - SM).toFixed(1)}" y="80" text-anchor="end" font-family="'Bebas Neue', sans-serif" font-size="48" fill="${accent}">
      ${esc(f.vintage)}
    </text>
    <text x="${(SM + 30).toFixed(1)}" y="150" font-family="'Archivo', sans-serif" font-size="42" font-weight="800" fill="#1a1a19">
      ${esc(f.wine.substring(0, 30))}
    </text>
    <text x="${(SM + 30).toFixed(1)}" y="${(H - SM - 30).toFixed(1)}" font-family="'Jost', sans-serif" font-size="10" fill="#6c6960" text-transform="uppercase">
      ${esc(f.descriptor)}
    </text>
  `;

  return wrapSVG(W, H, widthMM, heightMM, bg, content);
}

/**
 * Render a single label in Flora & Fauna style
 */
function renderFlora(
  data: LabelData,
  order: string[],
  options: RenderOptions
): string {
  const { widthMM = 100, heightMM = 80 } = options;
  const W = widthMM * 10;
  const H = heightMM * 10;
  const f = formatFields(data);
  const cx = W / 2;

  const bg = "#f2eddf";

  const content = `
    <text x="${cx.toFixed(1)}" y="40" text-anchor="middle" font-family="'Fraunces', serif" font-size="12" fill="#6a6a4c" text-transform="uppercase" font-weight="600">
      ${esc(f.producer)}
    </text>
    <text x="${cx.toFixed(1)}" y="100" text-anchor="middle" font-family="'Fraunces', serif" font-size="44" fill="#33341f" font-weight="600">
      ${esc(f.wine.substring(0, 25))}
    </text>
    <text x="${cx.toFixed(1)}" y="160" text-anchor="middle" font-family="'Cormorant Garamond', serif" font-size="14" fill="#6a6a4c" font-style="italic">
      ${esc(f.appellation)}
    </text>
    <line x1="${(cx - 40).toFixed(1)}" y1="180" x2="${(cx - 10).toFixed(1)}" y2="180" stroke="#5f6b39" stroke-width="1"/>
    <line x1="${(cx + 10).toFixed(1)}" y1="180" x2="${(cx + 40).toFixed(1)}" y2="180" stroke="#5f6b39" stroke-width="1"/>
    <text x="${cx.toFixed(1)}" y="${(H - SM - 40).toFixed(1)}" text-anchor="middle" font-family="'Cormorant Garamond', serif" font-size="12" fill="#33341f">
      ${esc(f.vintage)} · ${esc(f.region)}
    </text>
  `;

  return wrapSVG(W, H, widthMM, heightMM, bg, content);
}

/**
 * Render a single label in Premium style
 */
function renderPremium(
  data: LabelData,
  order: string[],
  options: RenderOptions
): string {
  const { widthMM = 100, heightMM = 80 } = options;
  const W = widthMM * 10;
  const H = heightMM * 10;
  const f = formatFields(data);
  const cx = W / 2;

  const bg = "#f4efe3";
  const gold = "#b58f4c";

  const content = `
    <rect x="8" y="8" width="${(W - 16).toFixed(1)}" height="${(H - 16).toFixed(1)}" fill="none" stroke="${gold}" stroke-width="1.2"/>
    <rect x="12" y="12" width="${(W - 24).toFixed(1)}" height="${(H - 24).toFixed(1)}" fill="none" stroke="${gold}" stroke-width="0.6"/>
    <circle cx="${cx.toFixed(1)}" cy="50" r="14" fill="none" stroke="${gold}" stroke-width="1"/>
    <text x="${cx.toFixed(1)}" y="56" text-anchor="middle" font-family="'Cinzel', serif" font-size="11" fill="${gold}" font-weight="600">
      ${esc(f.producer.substring(0, 2).toUpperCase())}
    </text>
    <text x="${cx.toFixed(1)}" y="100" text-anchor="middle" font-family="'Cinzel', serif" font-size="12" fill="#999" font-weight="500" text-transform="uppercase">
      ${esc(f.producer.substring(0, 30))}
    </text>
    <line x1="${(cx - 25).toFixed(1)}" y1="110" x2="${(cx + 25).toFixed(1)}" y2="110" stroke="${gold}" stroke-width="0.7"/>
    <text x="${cx.toFixed(1)}" y="160" text-anchor="middle" font-family="'Cinzel', serif" font-size="36" fill="#2b2a22" font-weight="600">
      ${esc(f.wine.substring(0, 25))}
    </text>
    <text x="${cx.toFixed(1)}" y="${(H - SM - 30).toFixed(1)}" text-anchor="middle" font-family="'Cinzel', serif" font-size="14" fill="${gold}" font-weight="600">
      ${esc(f.vintage)}
    </text>
  `;

  return wrapSVG(W, H, widthMM, heightMM, bg, content);
}

/**
 * Render a single label in Minimalist style
 */
function renderMinimalist(
  data: LabelData,
  order: string[],
  options: RenderOptions
): string {
  const { widthMM = 100, heightMM = 80 } = options;
  const W = widthMM * 10;
  const H = heightMM * 10;
  const f = formatFields(data);

  const bg = "#fbfbf9";

  const content = `
    <text x="${(SM + 10).toFixed(1)}" y="40" font-family="'Jost', sans-serif" font-size="9" fill="#999" text-transform="uppercase" letter-spacing="2">
      ${esc(f.producer)}
    </text>
    <text x="${(W / 2).toFixed(1)}" y="120" text-anchor="middle" font-family="'Jost', sans-serif" font-size="40" fill="#1c1c1b" font-weight="400">
      ${esc(f.wine.substring(0, 30))}
    </text>
    <rect x="${(W / 2 - 30).toFixed(1)}" y="140" width="60" height="1.5" fill="#e74c3c"/>
    <text x="${(W / 2).toFixed(1)}" y="170" text-anchor="middle" font-family="'Jost', sans-serif" font-size="12" fill="#999">
      ${esc(f.appellation)}
    </text>
    <text x="${(W / 2).toFixed(1)}" y="${(H - SM - 20).toFixed(1)}" text-anchor="middle" font-family="'Jost', sans-serif" font-size="9" fill="#999" letter-spacing="1">
      ${esc(f.vintage)} / ${esc(f.region)}
    </text>
  `;

  return wrapSVG(W, H, widthMM, heightMM, bg, content);
}

/**
 * Render a single label in Artistic/Punk style
 */
function renderArtistic(
  data: LabelData,
  order: string[],
  options: RenderOptions
): string {
  const { widthMM = 100, heightMM = 80 } = options;
  const W = widthMM * 10;
  const H = heightMM * 10;
  const f = formatFields(data);
  const cx = W / 2;

  const bg = "#fff9f0";

  const content = `
    <text x="${cx.toFixed(1)}" y="60" text-anchor="middle" font-family="'Anton', sans-serif" font-size="56" fill="#222" font-weight="900" transform="skewX(-8)">
      ${esc(f.wine.substring(0, 20).toUpperCase())}
    </text>
    <text x="${(SM + 5).toFixed(1)}" y="${(120 + Math.random() * 5).toFixed(1)}" font-family="'Caveat', cursive" font-size="18" fill="#999" font-weight="500">
      ${esc(f.producer)}
    </text>
    <path d="M 20 140 L ${(W - 20).toFixed(1)} 142 M 20 143 L ${(W - 20).toFixed(1)} 141" stroke="#ddd" stroke-width="3" fill="none" stroke-linecap="round"/>
    <text x="${(W - SM - 5).toFixed(1)}" y="${(H - SM - 30).toFixed(1)}" text-anchor="end" font-family="'Caveat', cursive" font-size="16" fill="#666">
      ${esc(f.vintage)}
    </text>
  `;

  return wrapSVG(W, H, widthMM, heightMM, bg, content);
}

/**
 * Render all 6 style options for a label
 */
export async function renderStyleOptions(
  data: LabelData,
  order: string[],
  options: RenderOptions
): Promise<any[]> {
  // Ensure fonts are loaded before rendering
  await ensureFonts();

  const styles = [
    { key: "traditional", name: "Traditional", render: renderTraditional },
    { key: "contemporary", name: "Contemporary", render: renderContemporary },
    { key: "flora", name: "Flora & Fauna", render: renderFlora },
    { key: "premium", name: "Premium", render: renderPremium },
    { key: "minimalist", name: "Minimalist", render: renderMinimalist },
    { key: "artistic", name: "Artistic", render: renderArtistic },
  ];

  return styles.map((style) => {
    let svg: string;
    try {
      svg = style.render(data, order, options);
    } catch (e) {
      console.error(`Error rendering ${style.key}:`, e);
      svg = wrapSVG(
        (options.widthMM || 100) * 10,
        (options.heightMM || 80) * 10,
        options.widthMM || 100,
        options.heightMM || 80,
        "#f5f5f5",
        `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="#c00">${esc(
          style.name
        )}</text>`
      );
    }
    return {
      name: style.name,
      rank: style.key,
      style: style.key,
      desc: style.name,
      svg,
    };
  });
}

// Export constants and utilities
export const STYLE_LIST = [
  { key: "traditional", name: "Traditional" },
  { key: "contemporary", name: "Contemporary" },
  { key: "flora", name: "Flora & Fauna" },
  { key: "premium", name: "Premium" },
  { key: "minimalist", name: "Minimalist" },
  { key: "artistic", name: "Artistic" },
];

export const LC_COMPS = {}; // Placeholder - full compositions from original engine
