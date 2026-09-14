import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function tokens(block: string) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]));
}
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe("core UI text contrast", () => {
  const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
  for (const [index, block] of [...css.matchAll(/\{([^}]+)\}/g)].entries()) {
    const palette = tokens(block[1]);
    it(`keeps primary and secondary text readable in ${index ? "dark" : "light"} mode`, () => {
      for (const foreground of ["ink", "muted"]) {
        for (const background of ["bg", "panel", "surface-soft"]) {
          expect(contrast(palette[foreground], palette[background])).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(palette.accent, palette["accent-soft"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(index ? "#122139" : "#ffffff", palette.accent)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("keeps dark sidebar labels and selected links readable", () => {
    const workspace = readFileSync(new URL("../styles/workspace.css", import.meta.url), "utf8");
    const palette = tokens(workspace.match(/\.sidebar \{ --panel:[^}]+\}/)![0]);
    expect(contrast(palette.muted, palette.panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.accent, palette["accent-soft"])).toBeGreaterThanOrEqual(4.5);
  });
});
