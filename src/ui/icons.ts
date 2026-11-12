// Hand-drawn style line icons (inline SVG), in the spirit of charcoal sketches.

const svg = (body: string) =>
  `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  finger: svg(
    '<path d="M20 44V20a3.5 3.5 0 0 1 7 0v10"/><path d="M27 26a3 3 0 0 1 6 0v6"/><path d="M33 29a3 3 0 0 1 6 0v6c0 6-4 9-9 9h-4c-4 0-6-2-8-5l-5-7a3 3 0 0 1 5-3l2 3"/><ellipse cx="23.5" cy="11" rx="4" ry="4.5" fill="currentColor" opacity=".35" stroke="none"/>',
  ),
  lump: svg(
    '<path d="M14 36l-4-8 6-12 12-6 10 4 2 10-6 10-10 4z" fill="currentColor" fill-opacity=".25"/><path d="M8 44c6-2 10-3 14-3" stroke-dasharray="2 3"/>',
  ),
  brush: svg(
    '<path d="M40 6L22 26"/><path d="M22 26c-3-1-7 0-9 3-3 4-2 9-7 13 6 1 13 0 16-4 2-3 3-7 0-12z" fill="currentColor" fill-opacity=".25"/><path d="M12 36l4-5M9 40l5-6M16 38l3-4"/>',
  ),
  twig: svg('<path d="M42 6L14 34"/><path d="M30 18l6 0M24 24l-1-5"/><path d="M14 34l-6 6M14 34l-7 3M14 34l-3 7M14 34l-8 1"/>'),
  hand: svg(
    '<path d="M17 42v-6l-6-9a2.5 2.5 0 0 1 4-3l3 4V10a2.5 2.5 0 0 1 5 0v12V7a2.5 2.5 0 0 1 5 0v15V9a2.5 2.5 0 0 1 5 0v14-9a2.5 2.5 0 0 1 5 0v15c0 7-4 12-10 13h-7z" fill="currentColor" fill-opacity=".2"/>',
  ),
  leaf: svg('<path d="M24 4C12 14 12 30 24 40 36 30 36 14 24 4z" fill="currentColor" fill-opacity=".2"/><path d="M24 8v38M24 18l-5-4M24 18l5-4M24 27l-6-4M24 27l6-4"/>'),
  shell: svg(
    '<path d="M24 40L8 18a17 17 0 0 1 32 0z" fill="currentColor" fill-opacity=".2"/><path d="M24 40l-9-26M24 40l-3-28M24 40l3-28M24 40l9-26M24 40L10 20M24 40l14-20"/><path d="M18 41h12"/>',
  ),
  undo: svg('<path d="M14 14L6 22l8 8"/><path d="M6 22h22a12 12 0 0 1 0 24h-6" transform="translate(0 -6)"/>'),
  redo: svg('<path d="M34 14l8 8-8 8"/><path d="M42 22H20a12 12 0 0 0 0 24h6" transform="translate(0 -6)"/>'),
  menu: svg('<path d="M10 14h28M10 24h28M10 34h28"/>'),
  rotate: svg('<path d="M36 10v10H26"/><path d="M36 20a14 14 0 1 0-3 14"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** Toolbar icon for a tracing-paper animal, drawn from its outline. */
export function animalIcon(outline: string): string {
  return `<svg viewBox="0 10 400 240" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="13" stroke-linejoin="round" aria-hidden="true"><path d="${outline}"/></svg>`;
}
