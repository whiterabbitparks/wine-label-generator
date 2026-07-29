/**
 * Wine Label Engine - Main exports
 *
 * This module is ported from the original vanilla JS label-engine.js
 * It provides functions to generate print-ready SVG labels in multiple styles
 *
 * Current implementation: INTERIM (simplified working version)
 * Status: ✅ Functional - generates valid SVGs with correct structure
 * Next: Full rendering logic from legacy/src/label-engine.js (1058 lines)
 *
 * IMPORTANT: This module uses canvas for text measurement and therefore
 * must only be called from client-side code. All components calling
 * into this engine should use the 'use client' directive.
 */

// Re-export types and utilities
export * from "./types";
export * from "./measure";
export { renderStyleOptions, STYLE_LIST, LC_COMPS, ensureFonts } from "./engine";

// Import fonts from the fonts config
import { googleFontsUrl } from "../fonts";

export const FONTS_URL = googleFontsUrl;
