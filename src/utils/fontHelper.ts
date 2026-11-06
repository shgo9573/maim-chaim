/**
 * Font Utilities for Otzaria Web
 * Aligns 1:1 with Otzaria Flutter software font definitions:
 * - Default book font: 'FrankRuhlCLM'
 * - Default commentary font: 'NotoRashiHebrew'
 */

export interface OtzariaFontOption {
  id: string;
  nameHe: string;
  category: 'traditional' | 'rashi' | 'torah' | 'serif' | 'sans';
  cssFamily: string;
  description: string;
}

export const OTZARIA_FONTS: OtzariaFontOption[] = [
  {
    id: 'FrankRuhlCLM',
    nameHe: 'פרנק-רוהל (Frank Ruhl)',
    category: 'traditional',
    cssFamily: "'FrankRuhlCLM', 'Frank Ruehl CLM', 'Frank Ruhl Libre', 'Frank Ruhl Hofshi', Georgia, serif",
    description: 'גופן ברירת המחדל של ספרי אוצריא - קלאסי, חד וקריא'
  },
  {
    id: 'NotoRashiHebrew',
    nameHe: 'כתב רש״י (Noto Rashi)',
    category: 'rashi',
    cssFamily: "'NotoRashiHebrew', 'Noto Rashi Hebrew', 'Rashi', serif",
    description: 'גופן ברירת המחדל של המפרשים באוצריא - אותיות רש"י אותנטיות'
  },
  {
    id: 'TaameyDavidCLM',
    nameHe: 'טעמי דוד / דוד ליברה (David)',
    category: 'traditional',
    cssFamily: "'TaameyDavidCLM', 'Taamey David CLM', 'David Libre', 'David', serif",
    description: 'גופן דוד המסורתי, מעולה לטעמי המקרא'
  },
  {
    id: 'KeterYG',
    nameHe: 'כתר ארם צובא (כתר YG)',
    category: 'torah',
    cssFamily: "'KeterYG', 'Keter YG', 'Frank Ruhl Libre', serif",
    description: 'נוסח כתר ארם צובא, מותאם במיוחד לספרי תנ"ך ומקראות'
  },
  {
    id: 'TaameyAshkenaz',
    nameHe: 'טעמי אשכנז (Taamey Ashkenaz)',
    category: 'torah',
    cssFamily: "'TaameyAshkenaz', 'Taamey Ashkenaz', 'Frank Ruhl Libre', serif",
    description: 'עיצוב ייחודי עם דגש על דיוק טעמים'
  },
  {
    id: 'Shofar',
    nameHe: 'שופר (Shofar)',
    category: 'torah',
    cssFamily: "'Shofar', 'Frank Ruhl Libre', serif",
    description: 'גופן מקראי נאה'
  },
  {
    id: 'NotoSerifHebrew',
    nameHe: 'נוטו סריף (Noto Serif Hebrew)',
    category: 'serif',
    cssFamily: "'NotoSerifHebrew', 'Noto Serif Hebrew', Georgia, serif",
    description: 'סריפי מודרני מבית גוגל עם תמיכה מלאה בניקוד'
  },
  {
    id: 'Tinos',
    nameHe: 'טינוס (Tinos)',
    category: 'serif',
    cssFamily: "'Tinos', 'Times New Roman', serif",
    description: 'סריפי אלגנטי ועדין'
  },
  {
    id: 'Rubik',
    nameHe: 'רוביק (Rubik)',
    category: 'sans',
    cssFamily: "'Rubik', sans-serif",
    description: 'גופן סנס-סריף עגלגל, נעים וקריא'
  },
  {
    id: 'Heebo',
    nameHe: 'היבו (Heebo)',
    category: 'sans',
    cssFamily: "'Heebo', sans-serif",
    description: 'גופן סנס-סריף מודרני ונקי'
  }
];

/**
 * Resolves font family to CSS string.
 * Defaults match Otzaria desktop software:
 * Book: FrankRuhlCLM
 * Commentary: NotoRashiHebrew
 */
export function getFontFamilyCss(fontName?: string, isCommentary: boolean = false): string {
  const targetId = fontName || (isCommentary ? 'NotoRashiHebrew' : 'FrankRuhlCLM');
  const found = OTZARIA_FONTS.find(f => f.id === targetId || f.nameHe === targetId);
  if (found) {
    return found.cssFamily;
  }

  // Backwards compatibility mappings for older saved settings
  if (targetId === 'Frank Ruhl Hofshi' || targetId === 'Frank Ruhl Libre') {
    return "'FrankRuhlCLM', 'Frank Ruehl CLM', 'Frank Ruhl Libre', 'Frank Ruhl Hofshi', Georgia, serif";
  }
  if (targetId === 'Rashi') {
    return "'NotoRashiHebrew', 'Noto Rashi Hebrew', 'Rashi', serif";
  }
  if (targetId === 'David Libre') {
    return "'TaameyDavidCLM', 'Taamey David CLM', 'David Libre', 'David', serif";
  }

  return targetId ? `${targetId}, serif` : (isCommentary ? "'NotoRashiHebrew', serif" : "'FrankRuhlCLM', serif");
}
