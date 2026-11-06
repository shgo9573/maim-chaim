// Build a Material-ish tonal palette from a single seed colour.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6) || '7a5640', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.max(0, Math.min(100, s)).toFixed(1)}% ${Math.max(0, Math.min(100, l)).toFixed(1)}%)`;
}

export function isValidHex(v: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

export type ThemeName = 'light' | 'sepia' | 'dark';

/**
 * CSS custom properties for the given seed colour + theme.
 * `brightness` shifts every surface/text lightness: -100 = much darker, +100 = much lighter.
 */
export function paletteFor(seed: string, theme: ThemeName, brightness = 0): Record<string, string> {
  const [r, g, b] = hexToRgb(seed);
  const [h, rawS] = rgbToHsl(r, g, b);
  const s = Math.max(12, Math.min(90, rawS));
  const neutral = Math.min(s * 0.22, 14);
  // surfaces move the full amount, text moves the opposite way so contrast survives
  const bg = (brightness / 100) * 12;
  const fg = (brightness / 100) * -6;
  const hslB = (hue: number, sat: number, light: number) => hsl(hue, sat, light + bg);
  const hslT = (hue: number, sat: number, light: number) => hsl(hue, sat, light + fg);

  if (theme === 'dark') {
    return {
      '--c-surface': hslB(h, neutral * 0.7, 8),
      '--c-surface-1': hslB(h, neutral * 0.7, 11),
      '--c-surface-2': hslB(h, neutral * 0.7, 14),
      '--c-surface-3': hslB(h, neutral * 0.7, 18),
      '--c-on-surface': hsl(h, 8, 92 - fg),
      '--c-on-variant': hsl(h, 8, 78 - fg),
      '--c-primary': hsl(h, Math.max(s, 40), 78),
      '--c-on-primary': hsl(h, Math.max(s, 40), 18),
      '--c-primary-container': hslB(h, Math.max(s, 35), 30),
      '--c-on-primary-container': hsl(h, 40, 92),
      '--c-sec-container': hslB(h, Math.min(s, 25), 27),
      '--c-on-sec-container': hsl(h, 25, 92),
      '--c-outline': hsl(h, 10, 58),
      '--c-outline-variant': hslB(h, 10, 30),
      '--c-error': '#f2b8b5',
      'color-scheme': 'dark',
    };
  }
  if (theme === 'sepia') {
    return {
      '--c-surface': hslB(h, Math.min(s, 45), 93),
      '--c-surface-1': hslB(h, Math.min(s, 42), 89),
      '--c-surface-2': hslB(h, Math.min(s, 40), 85),
      '--c-surface-3': hslB(h, Math.min(s, 38), 81),
      '--c-on-surface': hslT(h, 32, 16),
      '--c-on-variant': hslT(h, 24, 30),
      '--c-primary': hslT(h, Math.max(s, 45), 32),
      '--c-on-primary': '#ffffff',
      '--c-primary-container': hslB(h, Math.min(s, 55), 80),
      '--c-on-primary-container': hslT(h, 60, 14),
      '--c-sec-container': hslB(h, Math.min(s, 40), 82),
      '--c-on-sec-container': hslT(h, 40, 16),
      '--c-outline': hslT(h, 18, 48),
      '--c-outline-variant': hslB(h, 22, 68),
      '--c-error': '#ba1a1a',
      'color-scheme': 'light',
    };
  }
  return {
    '--c-surface': hslB(h, Math.min(s, 50), 98),
    '--c-surface-1': hslB(h, Math.min(s, 45), 95),
    '--c-surface-2': hslB(h, Math.min(s, 42), 92),
    '--c-surface-3': hslB(h, Math.min(s, 40), 88),
    '--c-on-surface': hslT(h, 28, 12),
    '--c-on-variant': hslT(h, 16, 32),
    '--c-primary': hslT(h, Math.max(s, 38), 36),
    '--c-on-primary': '#ffffff',
    '--c-primary-container': hslB(h, Math.min(Math.max(s, 40), 70), 86),
    '--c-on-primary-container': hslT(h, 55, 13),
    '--c-sec-container': hslB(h, Math.min(s, 35), 88),
    '--c-on-sec-container': hslT(h, 35, 14),
    '--c-outline': hslT(h, 12, 48),
    '--c-outline-variant': hslB(h, 16, 78),
    '--c-error': '#ba1a1a',
    'color-scheme': 'light',
  };
}

const DEFAULT_SEEDS: Record<ThemeName, string> = { light: '#7a5640', sepia: '#8a5a1f', dark: '#7a5640' };

export function applyTheme(theme: ThemeName, seed?: string, brightness = 0) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  const keys = ['--c-surface', '--c-surface-1', '--c-surface-2', '--c-surface-3', '--c-on-surface', '--c-on-variant', '--c-primary', '--c-on-primary', '--c-primary-container', '--c-on-primary-container', '--c-sec-container', '--c-on-sec-container', '--c-outline', '--c-outline-variant', '--c-error', 'color-scheme'];
  const custom = seed && isValidHex(seed);
  if (!custom && !brightness) {
    for (const k of keys) root.style.removeProperty(k);
    return;
  }
  const base = custom ? (seed!.startsWith('#') ? seed! : '#' + seed!) : DEFAULT_SEEDS[theme];
  const p = paletteFor(base, theme, brightness);
  for (const [k, v] of Object.entries(p)) root.style.setProperty(k, v);
}

export const PRESET_COLORS = [
  { hex: '#7a5640', name: 'חום קלאסי' },
  { hex: '#1b6b4c', name: 'ירוק' },
  { hex: '#15607a', name: 'תכלת' },
  { hex: '#2b4c9b', name: 'כחול' },
  { hex: '#5b3fa8', name: 'סגול' },
  { hex: '#9b2d6f', name: 'ורוד' },
  { hex: '#a33030', name: 'אדום' },
  { hex: '#a86b12', name: 'זהב' },
  { hex: '#4a5568', name: 'אפור' },
  { hex: '#0f766e', name: 'טורקיז' },
];
