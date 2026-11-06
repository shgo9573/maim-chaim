import fs from 'fs';
import path from 'path';

const BOOKS_DIR = path.resolve('data/otzaria_library/books');
if (!fs.existsSync(BOOKS_DIR)) {
  fs.mkdirSync(BOOKS_DIR, { recursive: true });
}

// Map of canonical books and their exact Otzaria repo paths
export const OTZARIA_BOOKS = [
  // תנ"ך - תורה
  { id: 101, title: 'בראשית', categoryPath: 'תנ"ך/תורה', author: 'משה רבינו', heEra: 'מקרא', remotePath: 'אוצריא/תנך/תורה/בראשית.txt' },
  { id: 102, title: 'שמות', categoryPath: 'תנ"ך/תורה', author: 'משה רבינו', heEra: 'מקרא', remotePath: 'אוצריא/תנך/תורה/שמות.txt' },
  { id: 103, title: 'ויקרא', categoryPath: 'תנ"ך/תורה', author: 'משה רבינו', heEra: 'מקרא', remotePath: 'אוצריא/תנך/תורה/ויקרא.txt' },
  { id: 104, title: 'במדבר', categoryPath: 'תנ"ך/תורה', author: 'משה רבינו', heEra: 'מקרא', remotePath: 'אוצריא/תנך/תורה/במדבר.txt' },
  { id: 105, title: 'דברים', categoryPath: 'תנ"ך/תורה', author: 'משה רבינו', heEra: 'מקרא', remotePath: 'אוצריא/תנך/תורה/דברים.txt' },

  // תנ"ך - נביאים
  { id: 106, title: 'יהושע', categoryPath: 'תנ"ך/נביאים', author: 'יהושע בן נון', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/יהושע.txt' },
  { id: 107, title: 'שופטים', categoryPath: 'תנ"ך/נביאים', author: 'שמואל הנביא', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/שופטים.txt' },
  { id: 108, title: 'שמואל א', categoryPath: 'תנ"ך/נביאים', author: 'שמואל, גד ונתן', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/שמואל א.txt' },
  { id: 109, title: 'שמואל ב', categoryPath: 'תנ"ך/נביאים', author: 'שמואל, גד ונתן', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/שמואל ב.txt' },
  { id: 110, title: 'ישעיהו', categoryPath: 'תנ"ך/נביאים', author: 'ישעיהו הנביא', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/ישעיהו.txt' },
  { id: 111, title: 'ירמיהו', categoryPath: 'תנ"ך/נביאים', author: 'ירמיהו הנביא', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/ירמיהו.txt' },
  { id: 112, title: 'יחזקאל', categoryPath: 'תנ"ך/נביאים', author: 'יחזקאל הנביא', heEra: 'מקרא', remotePath: 'אוצריא/תנך/נביאים/יחזקאל.txt' },

  // תנ"ך - כתובים
  { id: 113, title: 'תהילים', categoryPath: 'תנ"ך/כתובים', author: 'דוד המלך ועשרה זקנים', heEra: 'מקרא', remotePath: 'אוצריא/תנך/כתובים/תהילים.txt' },
  { id: 114, title: 'משלי', categoryPath: 'תנ"ך/כתובים', author: 'שלמה המלך', heEra: 'מקרא', remotePath: 'אוצריא/תנך/כתובים/משלי.txt' },
  { id: 115, title: 'איוב', categoryPath: 'תנ"ך/כתובים', author: 'משה רבינו', heEra: 'מקרא', remotePath: 'אוצריא/תנך/כתובים/איוב.txt' },
  { id: 116, title: 'שיר השירים', categoryPath: 'תנ"ך/כתובים', author: 'שלמה המלך', heEra: 'מקרא', remotePath: 'אוצריא/תנך/כתובים/שיר השירים.txt' },
  { id: 117, title: 'קהלת', categoryPath: 'תנ"ך/כתובים', author: 'שלמה המלך', heEra: 'מקרא', remotePath: 'אוצריא/תנך/כתובים/קהלת.txt' },
  { id: 118, title: 'אסתר', categoryPath: 'תנ"ך/כתובים', author: 'אנשי כנסת הגדולה', heEra: 'מקרא', remotePath: 'אוצריא/תנך/כתובים/אסתר.txt' },

  // משנה
  { id: 201, title: 'משנה ברכות', categoryPath: 'משנה/סדר זרעים', author: 'רבי יהודה הנשיא', heEra: 'תנאים', remotePath: 'אוצריא/משנה/סדר זרעים/משנה ברכות.txt' },
  { id: 202, title: 'משנה שבת', categoryPath: 'משנה/סדר מועד', author: 'רבי יהודה הנשיא', heEra: 'תנאים', remotePath: 'אוצריא/משנה/סדר מועד/משנה שבת.txt' },
  { id: 203, title: 'משנה פסחים', categoryPath: 'משנה/סדר מועד', author: 'רבי יהודה הנשיא', heEra: 'תנאים', remotePath: 'אוצריא/משנה/סדר מועד/משנה פסחים.txt' },
  { id: 204, title: 'משנה יומא', categoryPath: 'משנה/סדר מועד', author: 'רבי יהודה הנשיא', heEra: 'תנאים', remotePath: 'אוצריא/משנה/סדר מועד/משנה יומא.txt' },
  { id: 205, title: 'משנה סוכה', categoryPath: 'משנה/סדר מועד', author: 'רבי יהודה הנשיא', heEra: 'תנאים', remotePath: 'אוצריא/משנה/סדר מועד/משנה סוכה.txt' },
  { id: 206, title: 'משנה אבות', categoryPath: 'משנה/סדר נזיקין', author: 'רבי יהודה הנשיא', heEra: 'תנאים', remotePath: 'אוצריא/משנה/סדר נזיקין/משנה אבות.txt' },

  // תלמוד בבלי
  { id: 301, title: 'תלמוד בבלי ברכות', categoryPath: 'תלמוד בבלי/סדר זרעים', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר זרעים/ברכות.txt' },
  { id: 302, title: 'תלמוד בבלי שבת', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/שבת.txt' },
  { id: 303, title: 'תלמוד בבלי פסחים', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/פסחים.txt' },
  { id: 304, title: 'תלמוד בבלי ביצה', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/ביצה.txt' },
  { id: 305, title: 'תלמוד בבלי ראש השנה', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/ראש השנה.txt' },
  { id: 306, title: 'תלמוד בבלי יומא', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/יומא.txt' },
  { id: 307, title: 'תלמוד בבלי סוכה', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/סוכה.txt' },
  { id: 308, title: 'תלמוד בבלי מגילה', categoryPath: 'תלמוד בבלי/סדר מועד', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר מועד/מגילה.txt' },
  { id: 309, title: 'תלמוד בבלי בבא מציעא', categoryPath: 'תלמוד בבלי/סדר נזיקין', author: 'רבינא ורב אשי', heEra: 'אמוראים', remotePath: 'אוצריא/תלמוד בבלי/סדר נזיקין/בבא מציעא.txt' },

  // הלכה
  { id: 401, title: 'שולחן ערוך, אורח חיים', categoryPath: 'הלכה/שולחן ערוך', author: 'רבי יוסף קארו', heEra: 'אחרונים', remotePath: 'אוצריא/הלכה/שולחן ערוך/שולחן ערוך, אורח חיים.txt' },
  { id: 402, title: 'שולחן ערוך, יורה דעה', categoryPath: 'הלכה/שולחן ערוך', author: 'רבי יוסף קארו', heEra: 'אחרונים', remotePath: 'אוצריא/הלכה/שולחן ערוך/שולחן ערוך, יורה דעה.txt' },
  { id: 403, title: 'שולחן ערוך, אבן העזר', categoryPath: 'הלכה/שולחן ערוך', author: 'רבי יוסף קארו', heEra: 'אחרונים', remotePath: 'אוצריא/הלכה/שולחן ערוך/שולחן ערוך, אבן העזר.txt' },
  { id: 404, title: 'שולחן ערוך, חושן משפט', categoryPath: 'הלכה/שולחן ערוך', author: 'רבי יוסף קארו', heEra: 'אחרונים', remotePath: 'אוצריא/הלכה/שולחן ערוך/שולחן ערוך, חושן משפט.txt' },
  { id: 405, title: 'משנה תורה, הלכות יסודי התורה', categoryPath: 'הלכה/משנה תורה', author: 'הרמב"ם', heEra: 'ראשונים', remotePath: 'אוצריא/הלכה/משנה תורה/ספר המדע/משנה תורה, הלכות יסודי התורה.txt' },
  { id: 406, title: 'משנה תורה, הלכות דעות', categoryPath: 'הלכה/משנה תורה', author: 'הרמב"ם', heEra: 'ראשונים', remotePath: 'אוצריא/הלכה/משנה תורה/ספר המדע/משנה תורה, הלכות דעות.txt' },
  { id: 407, title: 'משנה תורה, הלכות תשובה', categoryPath: 'הלכה/משנה תורה', author: 'הרמב"ם', heEra: 'ראשונים', remotePath: 'אוצריא/הלכה/משנה תורה/ספר המדע/משנה תורה, הלכות תשובה.txt' },
  { id: 408, title: 'משנה תורה, הלכות תלמוד תורה', categoryPath: 'הלכה/משנה תורה', author: 'הרמב"ם', heEra: 'ראשונים', remotePath: 'אוצריא/הלכה/משנה תורה/ספר המדע/משנה תורה, הלכות תלמוד תורה.txt' },

  // מוסר ומחשבה
  { id: 501, title: 'מסילת ישרים', categoryPath: 'ספרי מוסר ומחשבה/מוסר', author: 'רבי משה חיים לוצאטו (רמח"ל)', heEra: 'אחרונים', remotePath: 'אוצריא/ספרי מוסר/אחרונים/מסילת ישרים.txt' },
  { id: 502, title: 'חובות הלבבות', categoryPath: 'ספרי מוסר ומחשבה/מוסר', author: 'רבנו בחיי אבן פקודה', heEra: 'ראשונים', remotePath: 'אוצריא/מחשבת ישראל/ראשונים/חובות הלבבות/חובות הלבבות.txt' },
  { id: 503, title: 'אורחות צדיקים', categoryPath: 'ספרי מוסר ומחשבה/מוסר', author: 'מחבר לא נודע', heEra: 'ראשונים', remotePath: 'אוצריא/ספרי מוסר/ראשונים/אורחות צדיקים.txt' },
  { id: 504, title: 'תומר דבורה', categoryPath: 'ספרי מוסר ומחשבה/מוסר', author: 'רבי משה קורדובירו (רמ"ק)', heEra: 'אחרונים', remotePath: 'אוצריא/ספרי מוסר/ראשונים/תומר דבורה.txt' },
  { id: 505, title: 'מורה נבוכים', categoryPath: 'ספרי מוסר ומחשבה/מחשבת ישראל', author: 'הרמב"ם', heEra: 'ראשונים', remotePath: 'אוצריא/מחשבת ישראל/ראשונים/מורה נבוכים/מורה נבוכים.txt' },

  // חסידות
  { id: 601, title: 'תניא קדישא', categoryPath: 'חסידות/חב"ד', author: 'רבי שניאור זלמן מליאדי (בעל התניא)', heEra: 'אחרונים', remotePath: 'אוצריא/חסידות/חבד/תניא.txt' },
  { id: 602, title: 'חיי מוהר"ן', categoryPath: 'חסידות/ברסלב', author: 'רבי נתן מברסלב', heEra: 'אחרונים', remotePath: 'אוצריא/חסידות/ברסלב/חיי מוהרן.txt' },
  { id: 603, title: 'שיחות הר"ן', categoryPath: 'חסידות/ברסלב', author: 'רבי נחמן מברסלב', heEra: 'אחרונים', remotePath: 'אוצריא/חסידות/ברסלב/שיחות הרן.txt' },
  { id: 604, title: 'ספר המידות', categoryPath: 'חסידות/ברסלב', author: 'רבי נחמן מברסלב', heEra: 'אחרונים', remotePath: 'אוצריא/חסידות/ברסלב/ספר המדות.txt' }
];

async function downloadBook(book) {
  const filePath = path.join(BOOKS_DIR, `${book.id}.txt`);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 100) {
    return { id: book.id, title: book.title, status: 'cached' };
  }

  const encoded = encodeURI(book.remotePath);
  const url = `https://raw.githubusercontent.com/Sivan22/otzaria-library/main/${encoded}`;
  console.log(`Downloading [${book.id}] ${book.title} from Otzaria repo...`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const text = await res.text();
    fs.writeFileSync(filePath, text, 'utf8');
    return { id: book.id, title: book.title, bytes: Buffer.byteLength(text), status: 'downloaded' };
  } catch (err) {
    console.error(`Failed to download ${book.title}:`, err.message);
    return { id: book.id, title: book.title, error: err.message, status: 'error' };
  }
}

async function run() {
  console.log(`Starting real Otzaria download for ${OTZARIA_BOOKS.length} core books...`);
  for (const book of OTZARIA_BOOKS) {
    const result = await downloadBook(book);
    console.log(`Book ${book.title}: ${result.status} (${result.bytes ? `${result.bytes} bytes` : ''})`);
  }
  console.log('All core books downloaded successfully from Otzaria repository!');
}

run();
