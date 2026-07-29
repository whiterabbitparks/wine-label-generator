/**
 * Fonts configuration for Wine Label Generator
 * Strategy: Use next/font for a few key families, external @import for the full palette
 * The external import is needed anyway for exported SVGs to be standalone-correct
 */

import { Hepta_Slab, Jost, Archivo } from "next/font/google";

// Load a few key fonts via next/font - these are the UI display fonts
export const heptaSlab = Hepta_Slab({ variable: "--font-hepta-slab", display: "swap" });
export const jost = Jost({ variable: "--font-jost", display: "swap" });
export const archivo = Archivo({ variable: "--font-archivo", display: "swap" });

// Export font class names for use in layout.tsx
export const fontClassNames = [heptaSlab, jost, archivo].map((f) => f.className).join(" ");

// The label engine's 30 font families are loaded via the Google Fonts CDN @import
// This is defined in globals.css and ensures exported SVGs remain standalone-correct
export const googleFontsUrl =
  "https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@400;500&family=Ballet&family=Baskervville+SC&family=Cinzel:wght@500;600&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Cutive+Mono&family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400&family=Estonia&family=Felipa&family=Girassol&family=Great+Vibes&family=Italianno&family=Manufacturing+Consent&family=Marcellus&family=Mate+SC&family=MonteCarlo&family=Montagu+Slab:wght@500;600&family=Mrs+Saint+Delafield&family=Nixie+One&family=Pinyon+Script&family=Playfair+Display:wght@600;700&family=Prata&family=Tinos:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600&family=Archivo:wght@400;500;600;700;800&family=Anton&family=Bebas+Neue&family=Caveat:wght@500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;0,700;1,500&display=swap";

// Font family name mapping for the label engine (used in SVG generation and CSS)
export const fontFamilies = {
  cormorant: "'Cormorant Garamond', serif",
  ebg: "'EB Garamond', serif",
  playfair: "'Playfair Display', serif",
  cinzel: "'Cinzel', serif",
  pinyon: "'Pinyon Script', cursive",
  marcellus: "'Marcellus', serif",
  prata: "'Prata', serif",
  ballet: "'Ballet', cursive",
  mrsSaint: "'Mrs Saint Delafield', cursive",
  greatVibes: "'Great Vibes', cursive",
  monteCarlo: "'MonteCarlo', cursive",
  estonia: "'Estonia', cursive",
  felipa: "'Felipa', cursive",
  italianno: "'Italianno', cursive",
  manufacturing: "'Manufacturing Consent', serif",
  cutiveMono: "'Cutive Mono', monospace",
  montaguSlab: "'Montagu Slab', serif",
  girassol: "'Girassol', serif",
  nixieOne: "'Nixie One', serif",
  alegreyaSC: "'Alegreya SC', serif",
  mateSC: "'Mate SC', serif",
  baskervvilleSC: "'Baskervville SC', serif",
  tinos: "'Tinos','Times New Roman',serif",
  jost: "'Jost', sans-serif",
  archivo: "'Archivo', sans-serif",
  anton: "'Anton', sans-serif",
  bebasNeue: "'Bebas Neue', sans-serif",
  caveat: "'Caveat', cursive",
  fraunces: "'Fraunces', serif",
};
