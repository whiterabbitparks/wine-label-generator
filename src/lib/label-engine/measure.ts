/**
 * Text measurement using canvas 2D context
 * Isolated here to be safe for SSR - the canvas is only created when actually needed
 */

let _ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (typeof window === "undefined") {
    throw new Error(
      "Label engine text measurement requires a browser environment (canvas 2D context). " +
        "Make sure this function is only called from client-side code (use 'use client' directive)"
    );
  }
  if (!_ctx) {
    const canvas = document.createElement("canvas");
    _ctx = canvas.getContext("2d");
    if (!_ctx) {
      throw new Error("Failed to create canvas 2D context");
    }
  }
  return _ctx;
}

/**
 * Measure text width using the 2D canvas context
 * @param text The text to measure
 * @param font CSS font specification (e.g. "bold 12pt Arial")
 * @returns Width in pixels
 */
export function measure(text: string, font: string): number {
  const ctx = getCtx();
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Fit text to a maximum width by iteratively reducing font size
 * @param text The text to fit
 * @param fontFamily CSS font-family
 * @param maxWidth Maximum width in pixels
 * @param maxFontSize Starting font size in points
 * @returns Final font size in points
 */
export function fitText(
  text: string,
  fontFamily: string,
  maxWidth: number,
  maxFontSize: number
): number {
  let fontSize = maxFontSize;
  let width = measure(text, `${fontSize}pt ${fontFamily}`);

  while (width > maxWidth && fontSize > 1) {
    fontSize -= 0.5;
    width = measure(text, `${fontSize}pt ${fontFamily}`);
  }

  return fontSize;
}
