const GEMATRIA_MAP: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40, 'ם': 40, 'נ': 50, 'ן': 50,
  'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200,
  'ש': 300, 'ת': 400
};

export function stripNikud(text: string): string {
  // Remove Hebrew vowels (nikud) and cantillation marks (taamim)
  return text.replace(/[\u0591-\u05C7]/g, '');
}

export function calculateGematria(text: string): number {
  const plain = stripNikud(text);
  let total = 0;
  for (const char of plain) {
    if (GEMATRIA_MAP[char]) {
      total += GEMATRIA_MAP[char];
    }
  }
  return total;
}

export function hebrewToNumber(text: string): number {
  return calculateGematria(text);
}

export function numberToHebrew(num: number): string {
  if (num <= 0) return '';
  if (num > 1000) return num.toString();

  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

  let result = '';

  // Hundreds
  const h = Math.floor(num / 100);
  if (h > 0) {
    if (h <= 9) {
      result += hundreds[h];
    } else {
      let rem = h * 100;
      while (rem >= 400) {
        result += 'ת';
        rem -= 400;
      }
      if (rem > 0) {
        result += hundreds[rem / 100];
      }
    }
  }

  // Tens and Units
  const remainder = num % 100;
  if (remainder === 15) {
    result += 'טו';
  } else if (remainder === 16) {
    result += 'טז';
  } else {
    const t = Math.floor(remainder / 10);
    const u = remainder % 10;
    result += tens[t] + units[u];
  }

  return result;
}
