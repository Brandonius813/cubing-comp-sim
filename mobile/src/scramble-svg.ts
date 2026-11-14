/** Presentation-only native adapter. Puzzle geometry and saved engine SVG stay intact. */
export function nativeScrambleSvg(svg: string, eventId: string): string {
  if (eventId !== 'minx') return svg;
  // TNoodle places each label at its center-sticker centroid. SVG text baseline,
  // inherited font size and px offsets vary between native renderers. Small
  // vector glyphs use the same coordinates without native text layout.
  return svg.replace(/<text\b([^>]*)>\s*([UF])\s*<\/text>/g, (original, attributes: string, label: string) => {
    const x = attributes.match(/\bx="([^"]+)"/)?.[1];
    const y = attributes.match(/\by="([^"]+)"/)?.[1];
    if (x === undefined || y === undefined || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return original;
    const path = label === 'U' ? 'M -4 -6 V 2 A 4 4 0 0 0 4 2 V -6' : 'M -3.5 6 V -6 H 4 M -3.5 -0.5 H 3';
    return `<g transform="translate(${Number(x)} ${Number(y)})"><path d="${path}" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></g>`;
  });
}
