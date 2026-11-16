// Helpers shared by build-time Astro components and the client script.

// Fixed radius for projects without a single reliable power figure.
export const R_DEFAULT = 6.5;
export const radius = (mw: number | null) => (mw == null ? R_DEFAULT : 2.5 + Math.sqrt(Math.max(mw, 1)) * 0.55);

// Server-rack mark drawn inside a project marker: three stacked units, each with a status light.
// s = scale (about half the marker radius).
export function rackPaths(s: number): string {
  const w = 1.7 * s, h = 0.52 * s, gap = 0.72 * s, sw = Math.max(0.8, s * 0.17).toFixed(2);
  let out = '';
  for (const i of [-1, 0, 1]) {
    const y = i * gap - h / 2;
    out += `<rect class="srv" x="${(-w / 2).toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(0.12 * s).toFixed(2)}" stroke-width="${sw}"/>`;
    out += `<circle class="srv-dot" cx="${(w * 0.28).toFixed(2)}" cy="${(i * gap).toFixed(2)}" r="${(0.09 * s).toFixed(2)}"/>`;
  }
  return out;
}

// 14px status glyph matching the map marker styles (classes from global.css).
export function glyph(key: string, ring = false): string {
  const x = key === 'can' ? '<path class="x" d="M4.2 4.2l5.6 5.6M9.8 4.2l-5.6 5.6"/>' : '';
  const r = ring ? '<circle class="ring" cx="7" cy="7" r="6.4"/>' : '';
  const dr = ring ? 4.4 : 6;
  const dot = `<circle class="dot" cx="7" cy="7" r="${dr}"/>`;
  const back = key === 'op' ? '' : `<circle class="srv-back" cx="7" cy="7" r="${dr * 0.7}"/>`;
  const rack = key === 'can' ? '' : `<g transform="translate(7,7)">${rackPaths(dr * 0.42)}</g>`;
  return `<svg class="glyph mk ${key}" viewBox="0 0 14 14" aria-hidden="true">${r}${dot}${back}${rack}${x}</svg>`;
}

// Icons for the kinds of resistance (24x24, drawn with strokes).
export const ICON_PATHS: Record<string, string> = {
  // people: neighbourhood platform
  platform:
    'M3 21v-1.5A3.5 3.5 0 0 1 6.5 16h3a3.5 3.5 0 0 1 3.5 3.5V21M8 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M15.5 16H17a4 4 0 0 1 4 4v1M16.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  // megaphone: campaign or initiative
  campaign: 'M3 10.5v3a1 1 0 0 0 1 1h2.5l5.5 4v-13l-5.5 4H4a1 1 0 0 0-1 1zM15.5 9a4.5 4.5 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12',
  // leaf: organisation
  org: 'M5 19c0-8.5 5.5-14 14-14 0 8.5-5.5 14-14 14zM5 19c2-4.5 5-7.5 9.5-9.5',
  // target: other
  other: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 3v3M12 18v3M3 12h3M18 12h3',
};

export function icon(key: string, size = 16, cls = 'ico'): string {
  const d = ICON_PATHS[key] ?? ICON_PATHS.other;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export const fmtInt = (n: number, lang: 'es' | 'en') =>
  new Intl.NumberFormat(lang === 'es' ? 'es-ES' : 'en-GB', { maximumFractionDigits: 0, useGrouping: true }).format(n);
