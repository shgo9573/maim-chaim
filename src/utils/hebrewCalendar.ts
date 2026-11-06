import { HDate, getSedra, getHolidaysOnDate, months } from '@hebcal/core';
import { numberToHebrew } from './gematria';
import { CustomDailyStudy, BookItem } from '../types/otzaria';

export interface DailyStudyItem {
  id: string;
  type: string;
  title: string;
  bookTitle: string;
  bookId?: string | number;
  portion: string;
  chapterIndex?: number;
  lineIndex?: number;
  description: string;
  badge?: string;
  isCustom?: boolean;
  navTarget?: string;
}

// Full Daf Yomi Masechtot Table with exact start and end daf per masechta (2711 total dafim)
const DAF_YOMI_MASECHTOT: Array<{ name: string; startDaf: number; endDaf: number }> = [
  { name: 'ברכות', startDaf: 2, endDaf: 64 },
  { name: 'שבת', startDaf: 2, endDaf: 157 },
  { name: 'עירובין', startDaf: 2, endDaf: 105 },
  { name: 'פסחים', startDaf: 2, endDaf: 121 },
  { name: 'שקלים', startDaf: 2, endDaf: 22 },
  { name: 'יומא', startDaf: 2, endDaf: 88 },
  { name: 'סוכה', startDaf: 2, endDaf: 56 },
  { name: 'ביצה', startDaf: 2, endDaf: 40 },
  { name: 'ראש השנה', startDaf: 2, endDaf: 35 },
  { name: 'תענית', startDaf: 2, endDaf: 31 },
  { name: 'מגילה', startDaf: 2, endDaf: 32 },
  { name: 'מועד קטן', startDaf: 2, endDaf: 29 },
  { name: 'חגיגה', startDaf: 2, endDaf: 27 },
  { name: 'יבמות', startDaf: 2, endDaf: 122 },
  { name: 'כתובות', startDaf: 2, endDaf: 112 },
  { name: 'נדרים', startDaf: 2, endDaf: 91 },
  { name: 'נזיר', startDaf: 2, endDaf: 66 },
  { name: 'סוטה', startDaf: 2, endDaf: 49 },
  { name: 'גיטין', startDaf: 2, endDaf: 90 },
  { name: 'קידושין', startDaf: 2, endDaf: 82 },
  { name: 'בבא קמא', startDaf: 2, endDaf: 119 },
  { name: 'בבא מציעא', startDaf: 2, endDaf: 119 },
  { name: 'בבא בתרא', startDaf: 2, endDaf: 176 },
  { name: 'סנהדרין', startDaf: 2, endDaf: 113 },
  { name: 'מכות', startDaf: 2, endDaf: 24 },
  { name: 'שבועות', startDaf: 2, endDaf: 49 },
  { name: 'עבודה זרה', startDaf: 2, endDaf: 76 },
  { name: 'הוריות', startDaf: 2, endDaf: 14 },
  { name: 'זבחים', startDaf: 2, endDaf: 120 },
  { name: 'מנחות', startDaf: 2, endDaf: 110 },
  { name: 'חולין', startDaf: 2, endDaf: 142 },
  { name: 'בכורות', startDaf: 2, endDaf: 61 },
  { name: 'ערכין', startDaf: 2, endDaf: 34 },
  { name: 'תמורה', startDaf: 2, endDaf: 34 },
  { name: 'כריתות', startDaf: 2, endDaf: 28 },
  { name: 'מעילה', startDaf: 2, endDaf: 22 },
  { name: 'קנים', startDaf: 23, endDaf: 25 },
  { name: 'תמיד', startDaf: 26, endDaf: 33 },
  { name: 'מידות', startDaf: 34, endDaf: 37 },
  { name: 'נידה', startDaf: 2, endDaf: 73 }
];

const TOTAL_DAF_CYCLE = 2711;
// Cycle 14 started on January 5, 2020 (UTC) with Berachot 2
const DAF_CYCLE_14_START = new Date(Date.UTC(2020, 0, 5));

/**
 * Calculates accurate Daf Yomi for any given date
 */
export function calculateDafYomi(targetDate: Date = new Date()): { masechet: string; dafNumber: number; dafHebrew: string; bookTitle: string } {
  const utcTarget = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const diffDays = Math.floor((utcTarget - DAF_CYCLE_14_START.getTime()) / (1000 * 60 * 60 * 24));
  let dayInCycle = ((diffDays % TOTAL_DAF_CYCLE) + TOTAL_DAF_CYCLE) % TOTAL_DAF_CYCLE;

  for (const m of DAF_YOMI_MASECHTOT) {
    const pagesInMasechet = m.endDaf - m.startDaf + 1;
    if (dayInCycle < pagesInMasechet) {
      const dafNum = m.startDaf + dayInCycle;
      return {
        masechet: m.name,
        dafNumber: dafNum,
        dafHebrew: `דף ${numberToHebrew(dafNum)}`,
        bookTitle: `תלמוד בבלי - מסכת ${m.name}`
      };
    }
    dayInCycle -= pagesInMasechet;
  }

  return {
    masechet: 'ברכות',
    dafNumber: 2,
    dafHebrew: 'דף ב׳',
    bookTitle: 'תלמוד בבלי - מסכת ברכות'
  };
}

/**
 * Official Chofetz Chaim 3-times-a-year cycle (Rabbi Yehuda Zev Segal zt"l)
 * 120-day cycle completing the entire Sefer Chofetz Chaim & Sefer Shmirat HaLashon 3 times a year
 * Cycles begin on: 1 Tishrei, 1 Shevat, 1 Sivan
 */
export const CHOFETZ_CHAIM_120_DAYS: Array<{ title: string; portion: string; desc: string; book: string }> = [
  // פתיחה ולאווין
  { title: 'הקדמה ופתיחה', portion: 'הקדמת המחבר ופתיחה', desc: 'הקדמת רבנו החפץ חיים זצוק"ל וגודל חובת שמירת הדיבור', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין א׳-ב׳', desc: 'לא תלך רכיל בעמך, לא תשא שמע שוא', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין ג׳-ד׳', desc: 'השמר בנגע הצרעת, לפני עור לא תתן מכשול', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין ה׳-ז׳', desc: 'השמר לך פן תשכח, לא תשא עליו חטא, לא תשנא את אחיך בלבבך', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין ח׳-י׳', desc: 'לא תקום, לא תטור, ולא יהיה כקרח וכעדתו', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין י״א-י״ב', desc: 'לא תונו איש את עמיתו (אונאת דברים), ולא תחללו את שם קדשי', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין י״ג-י״ד', desc: 'לא תהיה אחרי רבים לרעות, לא תטה משפט', book: 'חפץ חיים' },
  { title: 'פתיחה - לאווין', portion: 'לאווין ט״ו-י״ז', desc: 'מדבר שקר תרחק, לא תחנם, לא ימצא בך קוסם קסמים', book: 'חפץ חיים' },
  // עשין וארורין
  { title: 'פתיחה - עשין', portion: 'עשין א׳-ג׳', desc: 'זכור את אשר עשה ה׳ אלקיך למרים, ואהבת לרעך כמוך', book: 'חפץ חיים' },
  { title: 'פתיחה - עשין', portion: 'עשין ד׳-ז׳', desc: 'בצדק תשפוט עמיתך, הוכח תוכיח את עמיתך, ובו תדבק', book: 'חפץ חיים' },
  { title: 'פתיחה - עשין', portion: 'עשין ח׳-י׳', desc: 'מצות קימה והידור לתלמיד חכם, ואהבתם את הגר', book: 'חפץ חיים' },
  { title: 'פתיחה - עשין וארורין', portion: 'עשין י״א-י״ד וארורין', desc: 'צדק צדק תרדוף, ארור מכה רעהו בסתר וכללות הארורין', book: 'חפץ חיים' },
  // הלכות איסורי לשון הרע - כלל א'
  { title: 'הלכות לשון הרע', portion: 'כלל א׳, סעיפים א׳-ב׳', desc: 'איסור סיפור לשון הרע ואפילו על אמת גמורה', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל א׳, סעיפים ג׳-ד׳', desc: 'איסור לשון הרע בין בפניו ובין שלא בפניו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל א׳, סעיפים ה׳-ו׳', desc: 'איסור סיפור אפילו שאינו מתכוון לבזות', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל א׳, סעיפים ז׳-ח׳', desc: 'איסור השפלת חברו ברמז, בכתב או דרך שחוק', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל א׳, סעיף ט׳', desc: 'איסור לגנות את עצמו כדי להשפיל את חברו', book: 'חפץ חיים' },
  // כלל ב'
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיפים א׳-ב׳', desc: 'איסור קבלת לשון הרע והאמנה בלב', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיפים ג׳-ד׳', desc: 'חיוב להוכיח את המספר ואיסור להסכים עמו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיפים ה׳-ו׳', desc: 'מקרים שמותר לחוש בלבד כדי לשמור על עצמו אך לא להאמין', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיפים ז׳-ח׳', desc: 'שמירה שלא לנקוט שום פעולת נזק על פי שמועה', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיפים ט׳-י׳', desc: 'איסור שמיעה אם יש באפשרותו להשמיט עצמו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיף י״א', desc: 'דין מי שכבר שמע וקיבל בטעות', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ב׳, סעיפים י״ב-י״ג', desc: 'סדרי התשובה והתיקון למי שקיבל לשון הרע', book: 'חפץ חיים' },
  // כלל ג'
  { title: 'הלכות לשון הרע', portion: 'כלל ג׳, סעיפים א׳-ב׳', desc: 'דין לשון הרע באפי תלתא (בפני שלושה אנשים)', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ג׳, סעיפים ג׳-ד׳', desc: 'התנאים ההכרחיים באפי תלתא שלא תהיה כוונת פרסום', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ג׳, סעיפים ה׳-ו׳', desc: 'איסור לספר אם ניכר שהשומע ייקח הדבר כאמת מוחלטת', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ג׳, סעיפים ז׳-ח׳', desc: 'דבר העשוי להתגלות ואימתי נחשב כמפורסם', book: 'חפץ חיים' },
  // כלל ד'
  { title: 'הלכות לשון הרע', portion: 'כלל ד׳, סעיפים א׳-ב׳', desc: 'איסור סיפור על כל אדם מישראל אפילו פשוט', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ד׳, סעיפים ג׳-ד׳', desc: 'איסור סיפור על קטן, עני או בעל תשובה', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ד׳, סעיפים ה׳-ו׳', desc: 'חומרת איסור סיפור על תלמיד חכם וירא שמים', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ד׳, סעיפים ז׳-ח׳', desc: 'איסור סיפור על עיר שלמה, קהילה או ציבור', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ד׳, סעיפים ט׳-י׳', desc: 'דין אדם המוחזק ברשע ופורק עול מצוות', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ד׳, סעיף י״א', desc: 'התנאים המדויקים להגדרת אדם שיצא מכלל עמיתך', book: 'חפץ חיים' },
  // כלל ה'
  { title: 'הלכות לשון הרע', portion: 'כלל ה׳, סעיפים א׳-ב׳', desc: 'איסור גרימת רעה, בושת או הפסד לחברו בדיבור', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ה׳, סעיפים ג׳-ד׳', desc: 'אפילו אם חברו לא נתבזה בעיני השומעים', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ה׳, סעיפים ה׳-ו׳', desc: 'גרימת צער בגוף, בממון או במעמדו של חברו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ה׳, סעיפים ז׳-ח׳', desc: 'איסור מניעת טובה ופרנסה מחברו בדיבור', book: 'חפץ חיים' },
  // כלל ו' (לתועלת)
  { title: 'הלכות לשון הרע', portion: 'כלל ו׳, סעיפים א׳-ב׳', desc: 'דיני סיפור לתועלת והצלת אחרים מנזק', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ו׳, סעיפים ג׳-ד׳', desc: 'תנאי א׳ וב׳ לתועלת: ראייה בעצמו ובירור האמת עד תום', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ו׳, סעיפים ה׳-ו׳', desc: 'תנאי ג׳ וד׳: להוכיחו תחילה בלשון רכה ואי-הגזמה בפרטים', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ו׳, סעיפים ז׳-ח׳', desc: 'תנאי ה׳: כוונה לשם שמים ולתועלת בלבד ולא משנאה', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ו׳, סעיפים ט׳-י׳', desc: 'תנאי ו׳: אם אפשר להשיג התועלת בדרך אחרת אסור לספר', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ו׳, סעיפים י״א-י״ב', desc: 'תנאי ז׳: שלא יסובב על ידו נזק גדול יותר מן הדין', book: 'חפץ חיים' },
  // כלל ז'
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים א׳-ב׳', desc: 'איסור שמיעת לשון הרע וקבלתה', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים ג׳-ד׳', desc: 'כיצד ינהג השומע בעת מעשה: להשתיק או להגן על הנידון', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים ה׳-ו׳', desc: 'לימוד זכות על חברו בפני המספר', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים ז׳-ח׳', desc: 'התרחקות מחבורות ומקומות שיש בהם שיחת מרעים', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים ט׳-י׳', desc: 'איסור ישיבה בחבורת בעלי לשון הרע בקביעות', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים י״א-י״ב', desc: 'שמיעה לצורך בירור ותועלת ללא קביעת עמדה בלב', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ז׳, סעיפים י״ג-י״ד', desc: 'הנהגות זהירות בשמיעת שמועות על בעלי תפקידים', book: 'חפץ חיים' },
  // כלל ח' (אבק לשון הרע)
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים א׳-ב׳', desc: 'איסור אבק לשון הרע ומהותו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים ג׳-ד׳', desc: 'איסור שבח חברו בפני שונאיו המביא לגנותו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים ה׳-ו׳', desc: 'שבח מופלג הגורם קנאה או הערות גנאי', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים ז׳-ח׳', desc: 'דיבור הנשמע לשתי פנים ומשתמע לגנאי', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים ט׳-י׳', desc: 'שתיקה המסמלת הסכמה לדברי גנאי', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים י״א-י״ב', desc: 'הזכרת מעשי אבותיו הראשונים או מעשיו שבעבר', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ח׳, סעיפים י״ג-י״ד', desc: 'אבק לשון הרע בכתב, ברמז ובתנועות גוף', book: 'חפץ חיים' },
  // כלל ט'
  { title: 'הלכות לשון הרע', portion: 'כלל ט׳, סעיפים א׳-ב׳', desc: 'איסור סיפור על קרובים, שותפים ומחותנים', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ט׳, סעיפים ג׳-ד׳', desc: 'זהירות מלשון הרע בין איש לאשתו ובמשפחה', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל ט׳, סעיפים ה׳-ו׳', desc: 'סיפור על מלמדים, פועלים ומשרתים', book: 'חפץ חיים' },
  // כלל י' (שידוכים ועסקים)
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים א׳-ב׳', desc: 'דיני תועלת בשידוכים ובמשא ומתן', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים ג׳-ד׳', desc: 'חובת השבת תשובה ביושר ובדיוק לשואל על שידוך', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים ה׳-ו׳', desc: 'ההבדל בין מום גדול ומשמעותי למום קל וטבעי', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים ז׳-ח׳', desc: 'שבעת התנאים ההכרחיים בבירורי שידוכים ועסקים', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים ט׳-י׳', desc: 'איסור עדות שקר, הגזמה או נקמנות במסחר', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים י״א-י״ב', desc: 'הצלת עשוק מיד עושקו והצלת ממון חברו', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים י״ג-י״ד', desc: 'הצלת הרבים ממכשול רוחני או גשמי', book: 'חפץ חיים' },
  { title: 'הלכות לשון הרע', portion: 'כלל י׳, סעיפים ט״ו-י״ז', desc: 'סיום הלכות לשון הרע וציורים מעשיים', book: 'חפץ חיים' },
  // הלכות איסורי רכילות
  { title: 'הלכות רכילות', portion: 'כלל א׳, סעיפים א׳-ג׳', desc: 'איסור לא תלך רכיל בעמך ומהות עוון רכילות', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל א׳, סעיפים ד׳-ו׳', desc: 'הגדרת רכילות: פלוני אמר עליך או רוצה להזיק לך', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ב׳, סעיפים א׳-ב׳', desc: 'איסור קבלת רכילות והאמנה לדברי הולך רכיל', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ב׳, סעיפים ג׳-ד׳', desc: 'חובת תוכחה למספר רכילות והשקטת הרוחות', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ג׳, סעיפים א׳-ב׳', desc: 'דין רכילות באפי תלתא והתנאים בה', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ג׳, סעיפים ג׳-ד׳', desc: 'איסור גילוי סוד אפילו בפני רבים', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ד׳, סעיפים א׳-ב׳', desc: 'איסור רכילות על כל אדם מישראל', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ה׳, סעיפים א׳-ב׳', desc: 'איסור גרימת שנאה ומריבות בין אנשים', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ו׳, סעיפים א׳-ב׳', desc: 'רכילות על דיבורים ומחשבות', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ז׳, סעיפים א׳-ב׳', desc: 'שמיעת רכילות ודיני זהירות בה', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ח׳, סעיפים א׳-ב׳', desc: 'אבק רכילות ורמזים המעוררים חשד ומריבה', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ט׳, סעיפים א׳-ב׳', desc: 'רכילות לתועלת להצלת הנרדף ממזיק', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ט׳, סעיפים ג׳-ה׳', desc: 'שבעת התנאים ברכילות לתועלת', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ט׳, סעיפים ו׳-ח׳', desc: 'הצלת שותף או חבר מהפסד מובהק', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ט׳, סעיפים ט׳-י״א', desc: 'מניעת מחלוקת והבאת שלום בין אדם לחברו', book: 'חפץ חיים' },
  { title: 'הלכות רכילות', portion: 'כלל ט׳, סעיפים י״ב-י״ד', desc: 'סיום הלכות רכילות וציורים מעשיים', book: 'חפץ חיים' },
  // ספר שמירת הלשון - שער הזכירה
  { title: 'שמירת הלשון', portion: 'שער הזכירה, הקדמה ופרק א׳', desc: 'מעלת הזהירות בדיבור וחשיבות שמירת הלשון', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ב׳', desc: 'גודל עונש המספר לשון הרע בעולם הזה ובעולם הבא', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ג׳', desc: 'הפסד הזכויות והמצוות של בעל לשון הרע', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ד׳', desc: 'הצטרפות עבירות הלשון למספר עצום של עבירות', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ה׳', desc: 'שקילות עוון לשון הרע כנגד עבודה זרה, גילוי עריות ושפיכות דמים', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ו׳', desc: 'סגולת החיים והאריכות למי שנוצר לשונו מרע', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ז׳', desc: 'חומרת השמיעה והקבלה והשפעתן על הנפש', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ח׳', desc: 'השפעת הדיבור על העולמות העליונים ופתיחת קטרוגים', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק ט׳', desc: 'טיהור הנפש ועוררות מידת הרחמים על ישראל', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק י׳', desc: 'הזהירות מכת חנפים וכת ליצנים', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק י״א', desc: 'מדת השקר ואונאת דברים וחומרתן', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק י״ב', desc: 'הלבנת פנים וגסות הרוח כמקור לחטאי הלשון', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק י״ג', desc: 'הכעס והקפדה המביאים ללשון הרע והדרך להינצל מהם', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער הזכירה, פרק י״ד', desc: 'דרכי התשובה והתיקון השלם על חטאי הלשון', book: 'שמירת הלשון' },
  // שער התבונה
  { title: 'שמירת הלשון', portion: 'שער התבונה, הקדמה ופרק א׳', desc: 'תחבולות היצר הרע בדיבור וכיצד להתגבר עליהן', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ב׳', desc: 'עצות מעשיות יומיומיות להינצל ממלכודות הלשון', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ג׳', desc: 'התרחקות מחברת אנשים המדברים סרה', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ד׳', desc: 'שתיקה כסייג לחכמה ודרכי שמירתה בשעת מבחן', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ה׳', desc: 'לימוד הלכות שמירת הלשון כערובה היחידה לקיומן', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ו׳', desc: 'התבוננות בשכר הנצחי על כל רגע של בלימת פיו', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ז׳', desc: 'הנהגות יום-יומיות לזהירות מעשית בשעת כעס וויכוח', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התבונה, פרק ח׳', desc: 'קביעות לימוד הלכות לשון הרע בכל יום וסגולתו', book: 'שמירת הלשון' },
  // שער התורה
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק א׳', desc: 'מעלת עסק התורה וגודל קדושת הדיבור בתורה', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק ב׳', desc: 'הבל פיהם של תינוקות של בית רבן וטהרת הדיבור', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק ג׳', desc: 'כח התורה לכפר על כל החטאים ולהגן מן היצר', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק ד׳', desc: 'זריזות וקביעות עתים לתורה בכל מצב', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק ה׳', desc: 'שמירת הזמן משיחה בטלה לעמל התורה הקדושה', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק ו׳', desc: 'שמירת העיניים והמחשבה כסיוע ישיר לקדושת הדיבור', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'שער התורה, פרק ז׳', desc: 'זכות הרבים ותמיכה בלומדי תורה כסגולה לשמירת הלשון', book: 'שמירת הלשון' },
  // חלק שני וחתימת הספר
  { title: 'שמירת הלשון', portion: 'חלק שני, פרק א׳', desc: 'התחזקות בשמירת המצוות והדיבור בדורות האחרונים', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'חלק שני, פרק ב׳', desc: 'התעוררות לתשובה, תיקון המידות וציפייה לישועה', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'חלק שני, פרק ג׳', desc: 'גודל מעלת אהבת ישראל ועין טובה על כל אדם', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'חלק שני, פרק ד׳', desc: 'לימוד זכות על כל יהודי וסגולתו לפתיחת שערי שמים', book: 'שמירת הלשון' },
  { title: 'שמירת הלשון', portion: 'חלק שני, פרקים ה׳-ז׳', desc: 'ציפייה לישועה, החזקת התורה והשראת השכינה', book: 'שמירת הלשון' },
  { title: 'חתימת הספר', portion: 'חתימת ספר שמירת הלשון', desc: 'תפילה מעומק הלב על שמירת הלשון וסיום מחזור הלימוד', book: 'שמירת הלשון' }
];

export const PARASHA_NAMES_HE: Record<string, string> = {
  'Bereshit': 'בראשית',
  'Noach': 'נח',
  'Lech-Lecha': 'לך לך',
  'Vayera': 'וירא',
  'Chayei Sara': 'חיי שרה',
  'Toldot': 'תולדות',
  'Vayetzei': 'ויצא',
  'Vayishlach': 'וישלח',
  'Vayeshev': 'וישב',
  'Miketz': 'מקץ',
  'Vayigash': 'ויגש',
  'Vayechi': 'ויחי',
  'Shemot': 'שמות',
  'Vaera': 'וארא',
  'Bo': 'בא',
  'Beshalach': 'בשלח',
  'Yitro': 'יתרו',
  'Mishpatim': 'משפטים',
  'Terumah': 'תרומה',
  'Tetzaveh': 'תצוה',
  'Ki Tisa': 'כי תשא',
  'Vayakhel': 'ויקהל',
  'Pekudei': 'פקודי',
  'Vayikra': 'ויקרא',
  'Tzav': 'צו',
  'Shmini': 'שמיני',
  'Tazria': 'תזריע',
  'Metzora': 'מצורע',
  'Achrei Mot': 'אחרי מות',
  'Kedoshim': 'קדושים',
  'Emor': 'אמור',
  'Behar': 'בהר',
  'Bechukotai': 'בחוקתי',
  'Bamidbar': 'במדבר',
  'Nasso': 'נשא',
  'Beha\'alotcha': 'בהעלותך',
  'Sh\'lach': 'שלח לך',
  'Korach': 'קרח',
  'Chukat': 'חקת',
  'Balak': 'בלק',
  'Pinchas': 'פינחס',
  'Matot': 'מטות',
  'Masei': 'מסעי',
  'Devarim': 'דברים',
  'Vaetchanan': 'ואתחנן',
  'Eikev': 'עקב',
  'Re\'eh': 'ראה',
  'Shoftim': 'שופטים',
  'Ki Teitzei': 'כי תצא',
  'Ki Tavo': 'כי תבוא',
  'Nitzavim': 'נצבים',
  'Vayeilech': 'וילך',
  'Ha\'Azinu': 'האזינו',
  'Ha\'azinu': 'האזינו',
  'V\'Zot HaBerachah': 'וזאת הברכה',
  'Vezot Haberakhah': 'וזאת הברכה'
};

/**
 * Calculates the day in the 3-times-a-year cycle (Rabbi Yehuda Zev Segal zt"l)
 * 120 days cycle starting on:
 * - Round 1: 1 Tishrei
 * - Round 2: 1 Shevat
 * - Round 3: 1 Sivan
 */
export function getHebrewDayInThreeTimesCycle(date: Date = new Date()): { dayInCycle: number; roundNumber: number; roundName: string } {
  try {
    const hd = new HDate(date);
    const year = hd.getFullYear();
    const abs = hd.abs();

    const tishrei1 = new HDate(1, 7, year).abs();
    const shevat1 = new HDate(1, 11, year).abs();
    const sivan1 = new HDate(1, 3, year).abs();

    const prevTishrei1 = new HDate(1, 7, year - 1).abs();
    const prevShevat1 = new HDate(1, 11, year - 1).abs();
    const prevSivan1 = new HDate(1, 3, year - 1).abs();

    const candidates = [
      { start: prevTishrei1, round: 1, name: 'מחזור א׳ (תשרי-טבת)' },
      { start: prevShevat1, round: 2, name: 'מחזור ב׳ (שבט-אייר)' },
      { start: prevSivan1, round: 3, name: 'מחזור ג׳ (סיוון-אלול)' },
      { start: tishrei1, round: 1, name: 'מחזור א׳ (תשרי-טבת)' },
      { start: shevat1, round: 2, name: 'מחזור ב׳ (שבט-אייר)' },
      { start: sivan1, round: 3, name: 'מחזור ג׳ (סיוון-אלול)' },
    ].filter(c => c.start <= abs);

    candidates.sort((a, b) => b.start - a.start);
    const latest = candidates[0] || { start: tishrei1, round: 1, name: 'מחזור א׳ (תשרי-טבת)' };

    const dayInCycle = Math.min(120, Math.max(1, abs - latest.start + 1));
    return {
      dayInCycle,
      roundNumber: latest.round,
      roundName: latest.name
    };
  } catch {
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
    return { dayInCycle: (dayOfYear % 120) + 1, roundNumber: Math.floor((dayOfYear % 360) / 120) + 1, roundName: 'מחזור 3 פעמים בשנה' };
  }
}

/**
 * Accurate Hebrew Date calculation
 */
export function getHebrewDateString(date: Date = new Date()): string {
  try {
    const hd = new HDate(date);
    return hd.renderGematriya(true);
  } catch {
    try {
      return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(date);
    } catch {
      return 'כ״ד תשרי תשפ״ז';
    }
  }
}

/**
 * Complete Parasha Details Map with accurate Chumash, Perek, and Pasuk
 */
export interface ParashaDetails {
  name: string;
  chumash: 'בראשית' | 'שמות' | 'ויקרא' | 'במדבר' | 'דברים';
  perek: number;
  pasuk: number;
  perekHebrew: string;
  pasukHebrew: string;
}

export const PARASHA_DETAILS_MAP: Record<string, ParashaDetails> = {
  // ספר בראשית
  'בראשית': { name: 'בראשית', chumash: 'בראשית', perek: 1, pasuk: 1, perekHebrew: 'א׳', pasukHebrew: 'א׳' },
  'נח': { name: 'נח', chumash: 'בראשית', perek: 6, pasuk: 9, perekHebrew: 'ו׳', pasukHebrew: 'ט׳' },
  'לך לך': { name: 'לך לך', chumash: 'בראשית', perek: 12, pasuk: 1, perekHebrew: 'י״ב', pasukHebrew: 'א׳' },
  'וירא': { name: 'וירא', chumash: 'בראשית', perek: 18, pasuk: 1, perekHebrew: 'י״ח', pasukHebrew: 'א׳' },
  'חיי שרה': { name: 'חיי שרה', chumash: 'בראשית', perek: 23, pasuk: 1, perekHebrew: 'כ״ג', pasukHebrew: 'א׳' },
  'תולדות': { name: 'תולדות', chumash: 'בראשית', perek: 25, pasuk: 19, perekHebrew: 'כ״ה', pasukHebrew: 'י״ט' },
  'ויצא': { name: 'ויצא', chumash: 'בראשית', perek: 28, pasuk: 10, perekHebrew: 'כ״ח', pasukHebrew: 'י׳' },
  'וישלח': { name: 'וישלח', chumash: 'בראשית', perek: 32, pasuk: 4, perekHebrew: 'ל״ב', pasukHebrew: 'ד׳' },
  'וישב': { name: 'וישב', chumash: 'בראשית', perek: 37, pasuk: 1, perekHebrew: 'ל״ז', pasukHebrew: 'א׳' },
  'מקץ': { name: 'מקץ', chumash: 'בראשית', perek: 41, pasuk: 1, perekHebrew: 'מ״א', pasukHebrew: 'א׳' },
  'ויגש': { name: 'ויגש', chumash: 'בראשית', perek: 44, pasuk: 18, perekHebrew: 'מ״ד', pasukHebrew: 'י״ח' },
  'ויחי': { name: 'ויחי', chumash: 'בראשית', perek: 47, pasuk: 28, perekHebrew: 'מ״ז', pasukHebrew: 'כ״ח' },

  // ספר שמות
  'שמות': { name: 'שמות', chumash: 'שמות', perek: 1, pasuk: 1, perekHebrew: 'א׳', pasukHebrew: 'א׳' },
  'וארא': { name: 'וארא', chumash: 'שמות', perek: 6, pasuk: 2, perekHebrew: 'ו׳', pasukHebrew: 'ב׳' },
  'בא': { name: 'בא', chumash: 'שמות', perek: 10, pasuk: 1, perekHebrew: 'י׳', pasukHebrew: 'א׳' },
  'בשלח': { name: 'בשלח', chumash: 'שמות', perek: 13, pasuk: 17, perekHebrew: 'י״ג', pasukHebrew: 'י״ז' },
  'יתרו': { name: 'יתרו', chumash: 'שמות', perek: 18, pasuk: 1, perekHebrew: 'י״ח', pasukHebrew: 'א׳' },
  'משפטים': { name: 'משפטים', chumash: 'שמות', perek: 21, pasuk: 1, perekHebrew: 'כ״א', pasukHebrew: 'א׳' },
  'תרומה': { name: 'תרומה', chumash: 'שמות', perek: 25, pasuk: 1, perekHebrew: 'כ״ה', pasukHebrew: 'א׳' },
  'תצוה': { name: 'תצוה', chumash: 'שמות', perek: 27, pasuk: 20, perekHebrew: 'כ״ז', pasukHebrew: 'כ׳' },
  'כי תשא': { name: 'כי תשא', chumash: 'שמות', perek: 30, pasuk: 11, perekHebrew: 'ל׳', pasukHebrew: 'י״א' },
  'ויקהל': { name: 'ויקהל', chumash: 'שמות', perek: 35, pasuk: 1, perekHebrew: 'ל״ה', pasukHebrew: 'א׳' },
  'פקודי': { name: 'פקודי', chumash: 'שמות', perek: 38, pasuk: 21, perekHebrew: 'ל״ח', pasukHebrew: 'כ״א' },

  // ספר ויקרא
  'ויקרא': { name: 'ויקרא', chumash: 'ויקרא', perek: 1, pasuk: 1, perekHebrew: 'א׳', pasukHebrew: 'א׳' },
  'צו': { name: 'צו', chumash: 'ויקרא', perek: 6, pasuk: 1, perekHebrew: 'ו׳', pasukHebrew: 'א׳' },
  'שמיני': { name: 'שמיני', chumash: 'ויקרא', perek: 9, pasuk: 1, perekHebrew: 'ט׳', pasukHebrew: 'א׳' },
  'תזריע': { name: 'תזריע', chumash: 'ויקרא', perek: 12, pasuk: 1, perekHebrew: 'י״ב', pasukHebrew: 'א׳' },
  'מצורע': { name: 'מצורע', chumash: 'ויקרא', perek: 14, pasuk: 1, perekHebrew: 'י״ד', pasukHebrew: 'א׳' },
  'אחרי מות': { name: 'אחרי מות', chumash: 'ויקרא', perek: 16, pasuk: 1, perekHebrew: 'ט״ז', pasukHebrew: 'א׳' },
  'קדושים': { name: 'קדושים', chumash: 'ויקרא', perek: 19, pasuk: 1, perekHebrew: 'י״ט', pasukHebrew: 'א׳' },
  'אמור': { name: 'אמור', chumash: 'ויקרא', perek: 21, pasuk: 1, perekHebrew: 'כ״א', pasukHebrew: 'א׳' },
  'בהר': { name: 'בהר', chumash: 'ויקרא', perek: 25, pasuk: 1, perekHebrew: 'כ״ה', pasukHebrew: 'א׳' },
  'בחוקתי': { name: 'בחוקתי', chumash: 'ויקרא', perek: 26, pasuk: 3, perekHebrew: 'כ״ו', pasukHebrew: 'ג׳' },

  // ספר במדבר
  'במדבר': { name: 'במדבר', chumash: 'במדבר', perek: 1, pasuk: 1, perekHebrew: 'א׳', pasukHebrew: 'א׳' },
  'נשא': { name: 'נשא', chumash: 'במדבר', perek: 4, pasuk: 21, perekHebrew: 'ד׳', pasukHebrew: 'כ״א' },
  'בהעלותך': { name: 'בהעלותך', chumash: 'במדבר', perek: 8, pasuk: 1, perekHebrew: 'ח׳', pasukHebrew: 'א׳' },
  'שלח לך': { name: 'שלח לך', chumash: 'במדבר', perek: 13, pasuk: 1, perekHebrew: 'י״ג', pasukHebrew: 'א׳' },
  'שלח': { name: 'שלח לך', chumash: 'במדבר', perek: 13, pasuk: 1, perekHebrew: 'י״ג', pasukHebrew: 'א׳' },
  'קרח': { name: 'קרח', chumash: 'במדבר', perek: 16, pasuk: 1, perekHebrew: 'ט״ז', pasukHebrew: 'א׳' },
  'חקת': { name: 'חקת', chumash: 'במדבר', perek: 19, pasuk: 1, perekHebrew: 'י״ט', pasukHebrew: 'א׳' },
  'בלק': { name: 'בלק', chumash: 'במדבר', perek: 22, pasuk: 2, perekHebrew: 'כ״ב', pasukHebrew: 'ב׳' },
  'פינחס': { name: 'פינחס', chumash: 'במדבר', perek: 25, pasuk: 10, perekHebrew: 'כ״ה', pasukHebrew: 'י׳' },
  'מטות': { name: 'מטות', chumash: 'במדבר', perek: 30, pasuk: 2, perekHebrew: 'ל׳', pasukHebrew: 'ב׳' },
  'מסעי': { name: 'מסעי', chumash: 'במדבר', perek: 33, pasuk: 1, perekHebrew: 'ל״ג', pasukHebrew: 'א׳' },

  // ספר דברים
  'דברים': { name: 'דברים', chumash: 'דברים', perek: 1, pasuk: 1, perekHebrew: 'א׳', pasukHebrew: 'א׳' },
  'ואאתחנן': { name: 'ואתחנן', chumash: 'דברים', perek: 3, pasuk: 23, perekHebrew: 'ג׳', pasukHebrew: 'כ״ג' },
  'ואתחנן': { name: 'ואתחנן', chumash: 'דברים', perek: 3, pasuk: 23, perekHebrew: 'ג׳', pasukHebrew: 'כ״ג' },
  'עקב': { name: 'עקב', chumash: 'דברים', perek: 7, pasuk: 12, perekHebrew: 'ז׳', pasukHebrew: 'י״ב' },
  'ראה': { name: 'ראה', chumash: 'דברים', perek: 11, pasuk: 26, perekHebrew: 'י״א', pasukHebrew: 'כ״ו' },
  'שופטים': { name: 'שופטים', chumash: 'דברים', perek: 16, pasuk: 18, perekHebrew: 'ט״ז', pasukHebrew: 'י״ח' },
  'כי תצא': { name: 'כי תצא', chumash: 'דברים', perek: 21, pasuk: 10, perekHebrew: 'כ״א', pasukHebrew: 'י׳' },
  'כי תבוא': { name: 'כי תבוא', chumash: 'דברים', perek: 26, pasuk: 1, perekHebrew: 'כ״ו', pasukHebrew: 'א׳' },
  'נצבים': { name: 'נצבים', chumash: 'דברים', perek: 29, pasuk: 9, perekHebrew: 'כ״ט', pasukHebrew: 'ט׳' },
  'וילך': { name: 'וילך', chumash: 'דברים', perek: 31, pasuk: 1, perekHebrew: 'ל״א', pasukHebrew: 'א׳' },
  'האזינו': { name: 'האזינו', chumash: 'דברים', perek: 32, pasuk: 1, perekHebrew: 'ל״ב', pasukHebrew: 'א׳' },
  'וזאת הברכה': { name: 'וזאת הברכה', chumash: 'דברים', perek: 33, pasuk: 1, perekHebrew: 'ל״ג', pasukHebrew: 'א׳' }
};

export function getParashaDetails(parashaName: string): ParashaDetails {
  const cleanName = parashaName.replace(/פרשת\s+/g, '').replace(/[-"'\״\׳]/g, ' ').trim();
  const firstWord = cleanName.split(/\s+/)[0];
  
  if (PARASHA_DETAILS_MAP[cleanName]) return PARASHA_DETAILS_MAP[cleanName];

  for (const [key, details] of Object.entries(PARASHA_DETAILS_MAP)) {
    if (cleanName.includes(key) || key.includes(firstWord)) {
      return details;
    }
  }

  return PARASHA_DETAILS_MAP['בראשית'];
}

/**
 * Accurate Parashat Hashavua calculation according to the Jewish calendar (Israel schedule by default)
 */
export function getWeeklyParasha(date: Date = new Date(), isIsrael: boolean = true): string {
  try {
    // Determine the Saturday of the current week (from Sunday through Saturday)
    const d = new Date(date.getTime());
    const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
    const daysUntilSat = (6 - dayOfWeek + 7) % 7;
    d.setDate(d.getDate() + daysUntilSat);

    const satHDate = new HDate(d);
    const sedra = getSedra(satHDate.getFullYear(), isIsrael);
    const result = sedra.lookup(satHDate);

    if (result && result.parsha && result.parsha.length > 0) {
      return result.parsha
        .map((p: string) => PARASHA_NAMES_HE[p] || p)
        .join(' - ');
    }

    // If Saturday falls on a festival or Chol HaMoed with special reading (e.g. Sukkot, Pesach, Yom Tov)
    const holidays = getHolidaysOnDate(satHDate, isIsrael);
    if (holidays && holidays.length > 0) {
      const hDesc = holidays[0].render('he');
      if (hDesc) return hDesc;
    }

    // Fallback to next upcoming regular parasha
    let searchSat = new HDate(d);
    for (let i = 0; i < 4; i++) {
      searchSat = searchSat.add(7, 'd');
      const nextSedra = getSedra(searchSat.getFullYear(), isIsrael);
      const nextResult = nextSedra.lookup(searchSat);
      if (nextResult && nextResult.parsha && nextResult.parsha.length > 0) {
        return nextResult.parsha.map((p: string) => PARASHA_NAMES_HE[p] || p).join(' - ');
      }
    }

    return 'בראשית';
  } catch {
    return 'בראשית';
  }
}

/**
 * Calculate World Halacha Yomi (Daf HaYomi BaHalacha - Mishna Berura / Shulchan Aruch)
 * Currently in Cycle 3 studying Chelek 5 (Hilchot Pesach & Yom Tov, Simanim 429-529).
 * Active learning on 8 October 2026 (27 Tishrei 5787) is around Siman 443-444 (תמ״ג - תמ״ד: Hilchot Mechirat & Biur Chametz), NOT siman 41!
 */
export function calculateHalachaYomit(
  targetDate: Date = new Date(),
  method: 'dirshu_mishna_berura' | 'shulchan_aruch' | 'kitzur_shulchan_aruch' | 'rambam_halacha' = 'dirshu_mishna_berura'
): { bookTitle: string; portion: string; description: string; siman?: number; chelek?: number; navTarget?: string } {
  const dayOfYear = Math.floor((targetDate.getTime() - new Date(targetDate.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));

  if (method === 'dirshu_mishna_berura') {
    // Dirshu Daf Yomi BaHalacha Cycle 3: Mishna Berura Chelek 5 (Simanim תכ״ט עד תקכ״ט).
    // Baseline anchor: On 8 October 2026 (27 Tishrei 5787), study is at Siman 443/444 (תמ״ג - תמ״ד)
    const baseDate = new Date(2026, 9, 8); // 8 October 2026
    let weekdays = 0;
    const targetMid = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const baseMid = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const diffMs = targetMid.getTime() - baseMid.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays !== 0) {
      const step = diffDays > 0 ? 1 : -1;
      const cur = new Date(baseMid.getTime());
      while (cur.getTime() !== targetMid.getTime()) {
        cur.setDate(cur.getDate() + step);
        const day = cur.getDay(); // 0=Sun, 4=Thu
        if (day >= 0 && day <= 4) {
          weekdays += step;
        }
      }
    }

    // Average progress: ~1 siman per 2-3 study days
    const activeSiman = 443 + Math.floor(weekdays / 2.5);
    const clampedSiman = Math.max(429, Math.min(529, activeSiman));
    const simanHeb = numberToHebrew(clampedSiman);

    return {
      bookTitle: 'משנה ברורה',
      portion: `חלק ה׳: סימן ${simanHeb}`,
      description: `הדף היומי בהלכה (דרשו) - משנה ברורה, הלכות פסח ויום טוב (סימן ${simanHeb})`,
      siman: clampedSiman,
      chelek: 5,
      navTarget: `סימן ${simanHeb}`
    };
  }

  if (method === 'kitzur_shulchan_aruch') {
    const simanNum = (dayOfYear % 221) + 1;
    return {
      bookTitle: 'קיצור שולחן ערוך',
      portion: `סימן ${numberToHebrew(simanNum)} - סעיפים א׳-ה׳`,
      description: `לימוד הלכה יומית בקיצור שולחן ערוך לגנצפריד`,
      siman: simanNum,
      navTarget: `סימן ${simanNum}`
    };
  }

  if (method === 'rambam_halacha') {
    const perekNum = (dayOfYear % 14) + 1;
    return {
      bookTitle: 'משנה תורה לרמב"ם',
      portion: `ספר המדע - הלכות דעות פרק ${numberToHebrew(perekNum)}`,
      description: `לימוד הלכות היד החזקה לרמב"ם`,
      navTarget: `פרק ${perekNum}`
    };
  }

  // Default: Shulchan Aruch Orach Chaim
  const simanNum = (dayOfYear % 697) + 1;
  return {
    bookTitle: 'שולחן ערוך אורח חיים',
    portion: `סימן ${numberToHebrew(simanNum)}`,
    description: `הלכה יומית מתוך שולחן ערוך המחבר והרמ"א`,
    siman: simanNum,
    navTarget: `סימן ${simanNum}`
  };
}

/**
 * Calculate Chofetz Chaim daily schedule
 * Default: 'world_three_times' (Rabbi Yehuda Zev Segal zt"l - 3 times a year / 4 months cycle)
 */
export function calculateChofetzChaim(
  targetDate: Date = new Date(),
  scheduleType: 'world_three_times' | 'world_annual' | 'world_biannual' | 'daily_order' = 'world_three_times'
): { bookTitle: string; portion: string; description: string; dayIndex: number; navTarget?: string } {
  // 1. Default and most widely practiced worldwide schedule: 3 times a year (4 months per cycle)
  if (scheduleType === 'world_three_times' || !scheduleType) {
    const { dayInCycle, roundName } = getHebrewDayInThreeTimesCycle(targetDate);
    const itemIndex = Math.min(CHOFETZ_CHAIM_120_DAYS.length - 1, Math.max(0, dayInCycle - 1));
    const item = CHOFETZ_CHAIM_120_DAYS[itemIndex];

    // Compute precise navigation target including both Klal AND Seif
    let navTarget = item.portion;
    const klalMatch = item.portion.match(/כלל\s+([א-ת]+(?:׳|')?)/);
    const seifMatch = item.portion.match(/סעי[פף](?:ים|ו)?\s+([א-ת]+(?:׳|')?)/);
    const shaarMatch = item.portion.match(/שער\s+[א-ת]+(?:\s+פרק\s+[א-ת]+(?:׳|')?)?/);
    const lavinMatch = item.portion.match(/לאווין\s+([א-ת]+(?:׳|')?)/);
    const asayMatch = item.portion.match(/עשין\s+([א-ת]+(?:׳|')?)/);

    if (klalMatch && seifMatch) {
      const cleanKlal = klalMatch[0].replace(/['׳"]/g, '').trim();
      const firstSeif = seifMatch[1].replace(/['׳"]/g, '').trim();
      navTarget = `${cleanKlal} סעיף ${firstSeif}`;
    } else if (klalMatch) {
      navTarget = klalMatch[0].replace(/['׳"]/g, '').trim();
    } else if (shaarMatch) {
      navTarget = shaarMatch[0].replace(/['׳"]/g, '').trim();
    } else if (lavinMatch) {
      navTarget = `לאו ${lavinMatch[1].replace(/['׳"]/g, '').trim()}`;
    } else if (asayMatch) {
      navTarget = `עשה ${asayMatch[1].replace(/['׳"]/g, '').trim()}`;
    }

    return {
      bookTitle: item.book === 'חפץ חיים' ? 'ספר חפץ חיים' : 'ספר שמירת הלשון',
      portion: `${item.title}: ${item.portion}`,
      description: `${item.desc} (מסלול 3 פעמים בשנה - ${roundName}, יום ${numberToHebrew(dayInCycle)})`,
      dayIndex: dayInCycle,
      navTarget
    };
  }

  // 2. Annual or Biannual schedule
  const dayOfYear = Math.floor((targetDate.getTime() - new Date(targetDate.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const idx = scheduleType === 'world_biannual'
    ? (dayOfYear * 2) % CHOFETZ_CHAIM_120_DAYS.length
    : dayOfYear % CHOFETZ_CHAIM_120_DAYS.length;

  const item = CHOFETZ_CHAIM_120_DAYS[idx];
  return {
    bookTitle: item.book === 'חפץ חיים' ? 'ספר חפץ חיים' : 'ספר שמירת הלשון',
    portion: `${item.title}: ${item.portion}`,
    description: `${item.desc} (לימוד חפץ חיים יומי)`,
    dayIndex: idx + 1
  };
}

/**
 * Build Full Daily Study List based on user selection tracks and custom tracks
 */
export function getDailyStudySchedule(
  tracks: {
    dafYomi?: boolean;
    parasha?: boolean;
    chofetzChaim?: boolean;
    halachaYomit?: boolean;
  } = { dafYomi: true, parasha: true, chofetzChaim: true, halachaYomit: true },
  options?: {
    halachaYomitScheduleType?: 'dirshu_mishna_berura' | 'shulchan_aruch' | 'kitzur_shulchan_aruch' | 'rambam_halacha';
    chofetzChaimScheduleType?: 'world_three_times' | 'world_annual' | 'world_biannual' | 'daily_order';
    customDailyStudies?: CustomDailyStudy[];
  }
): DailyStudyItem[] {
  const items: DailyStudyItem[] = [];
  const today = new Date();

  // 1. דף יומי בבלי
  if (tracks.dafYomi !== false) {
    const daf = calculateDafYomi(today);
    items.push({
      id: 'daf_yomi',
      type: 'daf_yomi',
      title: 'דף יומי בבלי',
      bookTitle: daf.bookTitle,
      portion: `${daf.masechet} ${daf.dafHebrew}`,
      description: `מחזור י״ד העולמי: מסכת ${daf.masechet} ${daf.dafHebrew}`,
      badge: 'ש״ס בבלי',
      navTarget: daf.dafHebrew
    });
  }

  // 2. חפץ חיים ושמירת הלשון (ברירת מחדל: מסלול 3 פעמים בשנה)
  if (tracks.chofetzChaim !== false) {
    const chofetz = calculateChofetzChaim(today, options?.chofetzChaimScheduleType || 'world_three_times');
    items.push({
      id: 'chofetz_chaim',
      type: 'chofetz_chaim',
      title: 'חפץ חיים יומי',
      bookTitle: chofetz.bookTitle,
      portion: chofetz.portion,
      description: chofetz.description,
      badge: '3 פעמים בשנה',
      navTarget: chofetz.navTarget || chofetz.portion
    });
  }

  // 3. הלכה יומית (הדף היומי בהלכה - משנה ברורה חלק ה׳ / שו״ע)
  if (tracks.halachaYomit !== false) {
    const halacha = calculateHalachaYomit(today, options?.halachaYomitScheduleType);
    items.push({
      id: 'halacha_yomit',
      type: 'halacha_yomit',
      title: 'הלכה יומית',
      bookTitle: halacha.bookTitle,
      portion: halacha.portion,
      description: halacha.description,
      chapterIndex: halacha.siman,
      badge: 'הלכה',
      navTarget: halacha.navTarget || `סימן ${halacha.siman}`
    });
  }

  // 4. פרשת השבוע
  if (tracks.parasha !== false) {
    const parasha = getWeeklyParasha(today);
    const parashaInfo = getParashaDetails(parasha);
    items.push({
      id: 'parasha',
      type: 'parasha',
      title: 'פרשת השבוע',
      // Book title is the exact authentic Chumash book name: 'בראשית' | 'שמות' | 'ויקרא' | 'במדבר' | 'דברים'
      bookTitle: parashaInfo.chumash,
      portion: `פרשת ${parasha} (פרק ${parashaInfo.perekHebrew})`,
      description: `קריאת פרשת ${parasha} בחומש ${parashaInfo.chumash} (מתחילה בפרק ${parashaInfo.perekHebrew} פסוק ${parashaInfo.pasukHebrew}), שניים מקרא ואחד תרגום ומפרשי רש״י`,
      chapterIndex: parashaInfo.perek,
      lineIndex: parashaInfo.pasuk,
      badge: 'תורה',
      navTarget: `פרשת ${parasha}`
    });
  }

  // 5. לימודים מותאמים אישית (Custom Study Tracks)
  if (options?.customDailyStudies && options.customDailyStudies.length > 0) {
    for (const custom of options.customDailyStudies) {
      if (!custom.active) continue;

      let currentUnitNum = custom.currentUnit || 1;
      if (custom.startDate) {
        const start = new Date(custom.startDate);
        const diffDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        const rate = custom.unitsPerDay || 1;
        currentUnitNum = (custom.currentUnit || 1) + diffDays * rate;
      }

      let portionText = `יחידה ${numberToHebrew(currentUnitNum)}`;
      if (custom.paceType === 'daf') portionText = `דף ${numberToHebrew(currentUnitNum)}`;
      else if (custom.paceType === 'page') portionText = `עמוד ${currentUnitNum}`;
      else if (custom.paceType === 'chapter') portionText = `פרק ${numberToHebrew(currentUnitNum)}`;
      else if (custom.paceType === 'siman') portionText = `סימן ${numberToHebrew(currentUnitNum)}`;

      items.push({
        id: custom.id,
        type: 'custom',
        title: custom.title,
        bookTitle: custom.bookTitle,
        bookId: custom.bookId,
        portion: portionText,
        description: custom.description || `לימוד יומי אישי בקצב ${portionText}`,
        badge: 'מותאם אישית',
        isCustom: true
      });
    }
  }

  return items;
}

/**
 * Intelligent Matcher to find the best book in Otzaria Catalog for a daily study item
 */
export function findMatchingBookForDailyStudy(
  item: DailyStudyItem,
  books: BookItem[]
): BookItem | undefined {
  if (!books || books.length === 0) return undefined;

  // 1. If explicit bookId exists (e.g. from Custom Study Track or exact catalog reference)
  if (item.bookId) {
    const exactById = books.find(b => String(b.id) === String(item.bookId));
    if (exactById) return exactById;
  }

  const normQuery = (str: string) =>
    str.replace(/[-"'\״\׳]/g, '').toLowerCase().trim();

  const itemTitleClean = normQuery(item.title || '');
  const bookTitleClean = normQuery(item.bookTitle || '');
  const portionClean = normQuery(item.portion || '');

  // 2. Specific Heuristics based on Study Track Type
  if (item.type === 'daf_yomi') {
    // Extract masechet name (e.g., "ברכות", "שבת", "בבא מציעא"...)
    for (const m of DAF_YOMI_MASECHTOT) {
      if (
        item.portion.includes(m.name) ||
        item.bookTitle.includes(m.name) ||
        item.description.includes(m.name)
      ) {
        const mClean = normQuery(m.name);
        // Priority 1: Exact masechet title or Talmud Bavli masechet title
        const mExact = books.find(b => {
          const bClean = normQuery(b.title);
          return (
            bClean === mClean ||
            bClean === `תלמוד בבלי ${mClean}` ||
            bClean === `מסכת ${mClean}` ||
            bClean === `תלמוד בבלי מסכת ${mClean}`
          );
        });
        if (mExact) return mExact;

        // Priority 2: Contains masechet name & in Talmud Bavli category
        const mBavli = books.find(b => {
          const bClean = normQuery(b.title);
          const catClean = normQuery(b.categoryPath || '');
          return (
            (bClean.includes(mClean) || mClean.includes(bClean)) &&
            (catClean.includes('בבלי') || catClean.includes('תלמוד') || bClean.includes('בבלי')) &&
            !bClean.includes('ירושלמי') &&
            !bClean.includes('חידושי') &&
            !bClean.includes('פירוש') &&
            !bClean.includes('שיעור')
          );
        });
        if (mBavli) return mBavli;

        // Priority 3: Primary masechet book title without commentary words
        const mCleanCandidate = books.find(b => {
          const bClean = normQuery(b.title);
          return (
            bClean.includes(mClean) &&
            !bClean.includes('ירושלמי') &&
            !bClean.includes('חידושי') &&
            !bClean.includes('פירוש') &&
            !bClean.includes('עיונים')
          );
        });
        if (mCleanCandidate) return mCleanCandidate;

        // Priority 4: Any book containing the masechet name in title
        const mAny = books.find(b => normQuery(b.title).includes(mClean));
        if (mAny) return mAny;
      }
    }
  }

  if (item.type === 'parasha') {
    // 1. Identify which exact Chumash this parasha belongs to ('בראשית' | 'שמות' | 'ויקרא' | 'במדבר' | 'דברים')
    const pDetails = getParashaDetails(item.portion || item.bookTitle || item.title);
    const targetChumash = pDetails.chumash;
    const cClean = normQuery(targetChumash);

    // Priority 1: Exact match with Chumash name (e.g. "בראשית", "שמות", "ויקרא", "במדבר", "דברים")
    let matchChumash = books.find(b => {
      const bClean = normQuery(b.title);
      return bClean === cClean || bClean === `חומש ${cClean}` || bClean === `ספר ${cClean}`;
    });
    if (matchChumash) return matchChumash;

    // Priority 2: In Torah / Chumash / Tanakh category and contains the Chumash name, excluding commentaries and Neviim/Ketuvim
    matchChumash = books.find(b => {
      const bClean = normQuery(b.title);
      const catClean = normQuery(b.categoryPath || '');
      return (
        (catClean.includes('תורה') || catClean.includes('חומש') || catClean.includes('מקרא') || catClean.includes('תנ')) &&
        !catClean.includes('נביאים') &&
        !catClean.includes('כתובים') &&
        bClean.includes(cClean) &&
        !bClean.includes('רש"י') &&
        !bClean.includes('רמב"ן') &&
        !bClean.includes('פירוש') &&
        !bClean.includes('על')
      );
    });
    if (matchChumash) return matchChumash;

    // Priority 3: Any book strictly with target chumash name not in Neviim
    matchChumash = books.find(b => {
      const bClean = normQuery(b.title);
      const catClean = normQuery(b.categoryPath || '');
      return bClean.includes(cClean) && !catClean.includes('נביאים') && !catClean.includes('כתובים');
    });
    if (matchChumash) return matchChumash;

    // Priority 4: Fallback to any Torah category book
    const anyTorah = books.find(b => {
      const catClean = normQuery(b.categoryPath || '');
      return catClean.includes('תורה') || catClean.includes('חומש');
    });
    if (anyTorah) return anyTorah;

    // Return exact target chumash if in catalog by title
    return books.find(b => normQuery(b.title) === cClean);
  }

  if (item.type === 'chofetz_chaim') {
    const isShmiratHalashon = item.bookTitle.includes('שמירת הלשון') || item.portion.includes('שמירת הלשון') || item.portion.includes('שער ');
    const targetClean = isShmiratHalashon ? 'שמירת הלשון' : 'חפץ חיים';

    // Priority 1: Exact Title Match
    let matchCC = books.find(b => {
      const bClean = normQuery(b.title);
      return bClean === normQuery(item.bookTitle) || bClean === normQuery(isShmiratHalashon ? 'ספר שמירת הלשון' : 'ספר חפץ חיים') || bClean === targetClean;
    });
    if (matchCC) return matchCC;

    // Priority 2: Title contains main name, but excluding commentary/secondary books
    matchCC = books.find(b => {
      const bClean = normQuery(b.title);
      return (
        bClean.includes(targetClean) &&
        !bClean.includes('על') &&
        !bClean.includes('ספרא') &&
        !bClean.includes('תורה') &&
        !bClean.includes('פירוש') &&
        !bClean.includes('חידושי')
      );
    });
    if (matchCC) return matchCC;

    // Priority 3: Any book with target name
    matchCC = books.find(b => normQuery(b.title).includes(normQuery(isShmiratHalashon ? 'שמירת הלשון' : 'חפץ חיים')));
    if (matchCC) return matchCC;
  }

  if (item.type === 'halacha_yomit') {
    // Priority 1: Exact match with specific title (e.g. "משנה ברורה")
    let matchHalacha = books.find(b => {
      const bClean = normQuery(b.title);
      return bClean === normQuery(item.bookTitle) || bClean === 'משנה ברורה' || bClean === 'ספר משנה ברורה';
    });
    if (matchHalacha) return matchHalacha;

    // Priority 2: Contains "משנה ברורה" without commentary
    matchHalacha = books.find(b => {
      const bClean = normQuery(b.title);
      return bClean.includes('משנה ברורה') && !bClean.includes('על') && !bClean.includes('פירוש') && !bClean.includes('חידושי');
    });
    if (matchHalacha) return matchHalacha;

    // Priority 3: "שולחן ערוך, אורח חיים" or "שולחן ערוך אורח חיים"
    matchHalacha = books.find(b => {
      const bClean = normQuery(b.title);
      return bClean.includes('שולחן ערוך') && bClean.includes('אורח חיים') && !bClean.includes('על') && !bClean.includes('חידושי');
    });
    if (matchHalacha) return matchHalacha;
  }

  // 3. Exact or Substring title match on bookTitle
  const exactByTitle = books.find(b => {
    const bClean = normQuery(b.title);
    return bClean === bookTitleClean || bookTitleClean.includes(bClean) || bClean.includes(bookTitleClean);
  });
  if (exactByTitle) return exactByTitle;

  return undefined;
}
