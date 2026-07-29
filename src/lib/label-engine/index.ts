/**
 * Wine Label Engine - SVG rendering engine for label generation
 *
 * This module is ported from the original vanilla JS label-engine.js
 * It provides functions to generate print-ready SVG labels in multiple styles
 *
 * IMPORTANT: This module uses canvas for text measurement and therefore
 * must only be called from client-side code. All components calling
 * into this engine should use the 'use client' directive.
 */

// Re-export types
export * from "./types";
export * from "./measure";

// TODO: Complete engine port from legacy/src/label-engine.js
// This is a large 1058-line file with 4 rendering subsystems:
// 1. Legacy 6-template / 4-tier system (lines ~93–274)
// 2. Priority-driven 10-rank layout engine (lines ~274–437)
// 3. Classic/Traditional composition library from client PDF (lines ~438–790)
// 4. 6-style system (lines ~814–1055) - THIS IS THE ONE ACTUALLY USED

// Fonts and rendering configuration
export const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@400;500&family=Ballet&family=Baskervville+SC&family=Cinzel:wght@500;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Cutive+Mono&family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400&family=Estonia&family=Felipa&family=Girassol&family=Great+Vibes&family=Italianno&family=Manufacturing+Consent&family=Marcellus&family=Mate+SC&family=MonteCarlo&family=Montagu+Slab:wght@500;600&family=Mrs+Saint+Delafield&family=Nixie+One&family=Pinyon+Script&family=Playfair+Display:wght@600;700&family=Prata&family=Tinos:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600&family=Archivo:wght@400;500;600;700;800&family=Anton&family=Bebas+Neue&family=Caveat:wght@500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,500&display=swap";

/**
 * Ensure Google Fonts are loaded before rendering
 * Uses the CSS Font Loading API to wait for fonts
 */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined") return;

  // Inject the fonts stylesheet if not already present
  if (!document.getElementById("__lblfonts")) {
    const style = document.createElement("style");
    style.id = "__lblfonts";
    style.textContent = `@import url('${FONTS_URL}');`;
    document.head.appendChild(style);
  }

  // Wait for fonts to load
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (e) {
      console.warn("Font loading error:", e);
    }
  }
}

/**
 * Render a single label in a specific style
 * @param data Label field data
 * @param order Field priority order
 * @param options Render options (size, seed, images)
 * @param style Style key (traditional, contemporary, flora, premium, minimalist, artistic)
 * @returns SVG string
 */
export async function renderLabel(
  data: any,
  order: string[],
  options: any,
  style: string
): Promise<string> {
  // TODO: Implement full rendering logic from original engine
  // For now, return a placeholder SVG
  const { widthMM, heightMM } = options;
  const viewBox = `0 0 ${widthMM * 10} ${heightMM * 10}`;

  return `<svg viewBox="${viewBox}" width="${widthMM}mm" height="${heightMM}mm" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style><![CDATA[@import url('${FONTS_URL}');]]></style>
    </defs>
    <rect width="100%" height="100%" fill="#f5f5f5"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="24pt" font-family="Hepta Slab, serif" fill="#1e1e1e">
      Wine Label - ${style}
    </text>
  </svg>`;
}

/**
 * Render all 6 style options for a label
 * @param data Label field data
 * @param order Field priority order
 * @param options Render options (widthMM, heightMM, seed, images)
 * @returns Array of {name, rank, style, desc, svg}
 */
export async function renderStyleOptions(
  data: any,
  order: string[],
  options: any
): Promise<any[]> {
  // TODO: Implement all 6 style renderers
  const styles = ["Traditional", "Contemporary", "Flora & Fauna", "Premium", "Minimalist", "Artistic"];
  const svgs = await Promise.all(
    styles.map((style) => renderLabel(data, order, options, style))
  );

  return styles.map((style, i) => ({
    name: style,
    rank: style.toLowerCase().replace(" & ", "-").replace(" ", "-"),
    style: style,
    desc: `${style} design style`,
    svg: svgs[i],
  }));
}

// Export style list
export const STYLE_LIST = [
  { key: "traditional", name: "Traditional" },
  { key: "contemporary", name: "Contemporary" },
  { key: "flora", name: "Flora & Fauna" },
  { key: "premium", name: "Premium" },
  { key: "minimalist", name: "Minimalist" },
  { key: "artistic", name: "Artistic" },
];

// Placeholder data exports (will be populated with actual data from original engine)
export const LC_COMPS = {}; // Classic compositions from PDF
export const STYLE_PRESETS = {}; // Per-style rendering data
