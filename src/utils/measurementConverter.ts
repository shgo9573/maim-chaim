export type MeasurementCategory = 'אורך' | 'שטח' | 'נפח' | 'משקל' | 'זמן';

export interface MeasurementUnitGroups {
  ancient: readonly string[];
  modern: readonly string[];
}

export interface MeasurementSelection {
  value: string;
  fromUnit: string;
  toUnit: string;
  opinion: string;
}

interface MeasurementCategoryData {
  ancientUnits: readonly string[];
  modernUnits: readonly string[];
  ancientToBase: Readonly<Record<string, number>>;
  modernToBase: Readonly<Record<string, number>>;
  opinionNames: readonly string[];
  opinionFactors: Readonly<Record<string, readonly number[]>>;
}

export const MEASUREMENT_CATEGORIES: readonly MeasurementCategory[] = [
  'אורך',
  'שטח',
  'נפח',
  'משקל',
  'זמן',
];

const DATA: Record<MeasurementCategory, MeasurementCategoryData> = {
  'אורך': {
    ancientUnits: ['אצבעות', 'טפחים', 'זרתות', 'אמות', 'קנים', 'מילים', 'פרסאות'],
    modernUnits: ['מ"מ', 'ס"מ', 'מטר', 'ק"מ'],
    ancientToBase: {
      'אצבעות': 1,
      'טפחים': 4,
      'זרתות': 12,
      'אמות': 24,
      'קנים': 144,
      'מילים': 48000,
      'פרסאות': 192000,
    },
    modernToBase: { 'מ"מ': 0.1, 'ס"מ': 1, 'מטר': 100, 'ק"מ': 100000 },
    opinionNames: ['רמב"ם', 'רא"ח נאה', 'אגרות משה', 'צל"ח', 'חזון איש', 'חתם סופר'],
    opinionFactors: {
      'רמב"ם': [1.9, 7.6, 22.8, 45.6, 273.6, 91200, 364800],
      'רא"ח נאה': [2, 8, 24, 48, 288, 96000, 384000],
      'אגרות משה': [2.25, 9, 27, 54, 324, 108000, 432000],
      'צל"ח': [2.34, 9.36, 28.08, 56.16, 337, 112300, 449300],
      'חזון איש': [2.4, 9.6, 28.8, 57.6, 345.6, 115200, 460800],
      'חתם סופר': [2.7, 10.8, 32.4, 64.8, 388.8, 129600, 518400],
    },
  },
  'שטח': {
    ancientUnits: ['בית רובע', 'בית קב', 'בית סאה', 'בית סאתיים', 'בית לתך', 'בית כור'],
    modernUnits: ['ס"מ רבוע', 'מ"ר', 'ק"מ רבוע', 'דונם'],
    ancientToBase: {
      'בית רובע': 1,
      'בית קב': 4,
      'בית סאה': 24,
      'בית סאתיים': 48,
      'בית לתך': 360,
      'בית כור': 720,
    },
    modernToBase: { 'ס"מ רבוע': 0.0001, 'מ"ר': 1, 'ק"מ רבוע': 1000000, 'דונם': 1000 },
    opinionNames: ['רמב"ם', 'רא"ח נאה', 'אגרות משה', 'צל"ח', 'חזון איש', 'חתם סופר'],
    opinionFactors: {
      'רמב"ם': [21 + 2 / 3, 86 + 2 / 3, 520, 1040, 7800, 15600],
      'רא"ח נאה': [24, 96, 576, 1152, 8640, 17280],
      'אגרות משה': [30 + 3 / 8, 121.5, 729, 1458, 10935, 21870],
      'צל"ח': [32.85, 131.4, 788.5, 1577, 11827, 23655],
      'חזון איש': [34.56, 138 + 1 / 4, 829.5, 1659, 12442, 24883],
      'חתם סופר': [43 + 3 / 4, 175, 1050, 2100, 15746, 31493],
    },
  },
  'נפח': {
    ancientUnits: ['רביעיות', 'לוגים', 'קבים', 'עשרונות', 'הינים', 'סאים', 'איפות', 'לתכים', 'כורים'],
    modernUnits: ['מ"מ מעוקב', 'ס"מ מעוקב', 'סמ"ק', 'מ"ל', 'ליטר', 'מטר מעוקב', 'קוב'],
    ancientToBase: {
      'רביעיות': 1,
      'לוגים': 4,
      'קבים': 16,
      'עשרונות': 28.8,
      'הינים': 48,
      'סאים': 96,
      'איפות': 288,
      'לתכים': 1440,
      'כורים': 2880,
    },
    modernToBase: {
      'מ"מ מעוקב': 0.001,
      'ס"מ מעוקב': 1,
      'סמ"ק': 1,
      'מ"ל': 1,
      'ליטר': 1000,
      'מטר מעוקב': 1000000,
      'קוב': 1000000,
    },
    opinionNames: ['רמב"ם', 'רא"ח נאה', 'אגרות משה', 'צל"ח', 'חזון איש', 'חתם סופר'],
    opinionFactors: {
      'רמב"ם': [76.4, 305.6, 1220, 2200, 3670, 7340, 22000, 110000, 220000],
      'רא"ח נאה': [86.5, 346, 1380, 2500, 4150, 8300, 24900, 124500, 249000],
      'אגרות משה': [123, 492, 1970, 3500, 5900, 11800, 35400, 177000, 354000],
      'צל"ח': [139, 556, 2220, 4000, 6670, 13340, 40000, 200000, 400000],
      'חזון איש': [149.3, 597.2, 2400, 4300, 7200, 14300, 43000, 215000, 430000],
      'חתם סופר': [212.6, 850.4, 3400, 6120, 10200, 20400, 61200, 306000, 612000],
    },
  },
  'משקל': {
    ancientUnits: ['דינרים', 'שקלים', 'סלעים', 'טרטימרים', 'מנים', 'ככרות', 'קנטרים'],
    modernUnits: ['מ"ג', 'גרם', 'ק"ג', 'טון'],
    ancientToBase: {
      'דינרים': 1,
      'שקלים': 2,
      'סלעים': 4,
      'טרטימרים': 50,
      'מנים': 100,
      'ככרות': 6000,
      'קנטרים': 10000,
    },
    modernToBase: { 'מ"ג': 0.001, 'גרם': 1, 'ק"ג': 1000, 'טון': 1000000 },
    opinionNames: ['רש"י', 'ר"ם מ"ץ', 'ש"ך', 'גאונים ורמב"ם', 'בירורי המידות והשיעורין', 'הליכות עולם (לר"ע יוסף)', 'חזון איש ורא"ח נאה'],
    opinionFactors: {
      'רש"י': [3.54, 7.08, 14.16, 177, 354, 21240, 35400],
      'ר"ם מ"ץ': [3.84, 7.67, 15.34, 192, 384, 23040, 38400],
      'ש"ך': [3.95, 7.9, 15.8, 197, 395, 23700, 39500],
      'גאונים ורמב"ם': [4.25, 8.5, 17, 212.5, 425, 25500, 42500],
      'בירורי המידות והשיעורין': [4.36, 8.72, 17.44, 218, 436, 26160, 43600],
      'הליכות עולם (לר"ע יוסף)': [4.5, 9, 18, 225, 450, 27000, 45000],
      'חזון איש ורא"ח נאה': [4.8, 9.6, 19.2, 240, 480, 28800, 48000],
    },
  },
  'זמן': {
    ancientUnits: [
      'הילוך אמה',
      'הילוך מיל',
      'הילוך פרסה',
      'הילוך ארבע אמות',
      'הילוך מאה אמה',
      'הילוך שלושה רבעי מיל',
      'הילוך ארבעה מילים',
      'הילוך עשרה פרסאות',
    ],
    modernUnits: ['שניות', 'חלקים', 'דקות', 'שעות', 'ימים'],
    ancientToBase: {
      'הילוך אמה': 1 / 4,
      'הילוך מיל': 500,
      'הילוך פרסה': 2000,
      'הילוך ארבע אמות': 1,
      'הילוך מאה אמה': 25,
      'הילוך שלושה רבעי מיל': 375,
      'הילוך ארבעה מילים': 2000,
      'הילוך עשרה פרסאות': 20000,
    },
    modernToBase: { 'שניות': 1, 'חלקים': 10 / 3, 'דקות': 60, 'שעות': 3600, 'ימים': 86400 },
    opinionNames: ['שולחן ערוך', 'גר"א וחתם סופר', 'רמב"ם'],
    opinionFactors: {
      'שולחן ערוך': [0.54, 1080, 4320, 2.16, 54, 810, 4320, 43200],
      'גר"א וחתם סופר': [0.675, 1350, 5400, 2.7, 67.5, 16 * 60 + 52.51, 5400, 54000],
      'רמב"ם': [0.72, 1440, 5760, 2.88, 72, 18 * 60, 5760, 57600],
    },
  },
};

export function getMeasurementUnitGroups(category: MeasurementCategory): MeasurementUnitGroups {
  const data = DATA[category];
  return { ancient: data.ancientUnits, modern: data.modernUnits };
}

export function getMeasurementOpinions(category: MeasurementCategory): readonly string[] {
  return DATA[category].opinionNames;
}

export function getDefaultMeasurementSelection(category: MeasurementCategory): MeasurementSelection {
  const data = DATA[category];
  return {
    value: '1',
    fromUnit: data.ancientUnits[0],
    toUnit: data.ancientUnits[0],
    opinion: data.opinionNames[0],
  };
}

export function needsMeasurementOpinion(
  category: MeasurementCategory,
  fromUnit: string,
  toUnit: string,
): boolean {
  const data = DATA[category];
  const fromAncient = data.ancientUnits.includes(fromUnit);
  const toAncient = data.ancientUnits.includes(toUnit);
  return fromAncient !== toAncient;
}

export function convertMeasurement(
  category: MeasurementCategory,
  rawValue: string | number,
  fromUnit: string,
  toUnit: string,
  opinion?: string,
): number | null {
  if (typeof rawValue === 'string' && rawValue.trim() === '') return null;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(value) || value < 0) return null;

  const data = DATA[category];
  const fromAncientIndex = data.ancientUnits.indexOf(fromUnit);
  const toAncientIndex = data.ancientUnits.indexOf(toUnit);
  const fromIsAncient = fromAncientIndex >= 0;
  const toIsAncient = toAncientIndex >= 0;

  if (!fromIsAncient && !Object.prototype.hasOwnProperty.call(data.modernToBase, fromUnit)) return null;
  if (!toIsAncient && !Object.prototype.hasOwnProperty.call(data.modernToBase, toUnit)) return null;

  if (fromIsAncient && toIsAncient) {
    return value * data.ancientToBase[fromUnit] / data.ancientToBase[toUnit];
  }

  if (!fromIsAncient && !toIsAncient) {
    return value * data.modernToBase[fromUnit] / data.modernToBase[toUnit];
  }

  if (!opinion) return null;
  const opinionFactors = data.opinionFactors[opinion];
  if (!opinionFactors) return null;

  const fromFactor = fromIsAncient
    ? opinionFactors[fromAncientIndex]
    : data.modernToBase[fromUnit];
  const toFactor = toIsAncient
    ? opinionFactors[toAncientIndex]
    : data.modernToBase[toUnit];

  if (!Number.isFinite(fromFactor) || !Number.isFinite(toFactor) || toFactor <= 0) return null;
  return value * fromFactor / toFactor;
}

export function formatMeasurementValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}
