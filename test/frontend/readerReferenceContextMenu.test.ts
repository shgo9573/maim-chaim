import assert from 'node:assert/strict';
import test from 'node:test';
import type { CommentaryLink } from '../../src/types';
import {
  groupReaderReferenceLinks,
  isReaderDependentTextLink,
  isReaderReferenceLink,
  readerConnectionTypeLabel,
} from '../../src/utils/readerReferenceContextMenu';

const link = (
  sourceBook: string,
  line: number,
  category = 'REFERENCE',
  text = '<b>מראה מקום</b> וקטע מקושר',
  dibburHamatchil = 'ברכות ב ע״א',
  targetBookId?: number | string,
): CommentaryLink => ({
  ...(targetBookId == null ? {} : { targetBookId }),
  sourceBook,
  line,
  category,
  text,
  dibburHamatchil,
});

test('reference classification matches Otzaria dependent-text and virtual-source rules', () => {
  for (const type of [
    'COMMENTARY',
    'SUPER_COMMENTARY',
    'SUPERCOMMENTARY',
    'TARGUM',
    'MIDRASH',
    'PARSHANUT',
    'DIBUR_HAMATCHIL',
    'ELUCIDATION',
    'EXPLICATION',
    'FOOTNOTES',
    'מפרש',
    'פירוש',
    'תרגום',
    'מדרש',
  ]) {
    assert.equal(isReaderReferenceLink(type), false, type);
  }

  assert.equal(isReaderDependentTextLink('SUPER_COMMENTARY'), true);
  assert.equal(isReaderDependentTextLink('MIDRASH'), true);
  assert.equal(isReaderDependentTextLink('REFERENCE'), false);
  assert.equal(isReaderReferenceLink('SOURCE'), false);
  assert.equal(isReaderReferenceLink('מקור'), false);
  assert.equal(isReaderReferenceLink('הפניה'), true);
  assert.equal(isReaderReferenceLink('אחר'), true);
  assert.equal(isReaderReferenceLink('FOOTNOTE'), false);
  assert.equal(isReaderReferenceLink('ELLUCIDATION'), false);
  assert.equal(isReaderReferenceLink('REFERENCE'), true);
  assert.equal(isReaderReferenceLink('QUOTATION'), true);
  assert.equal(isReaderReferenceLink('MESORAT_HASHAS'), true);
  assert.equal(isReaderReferenceLink('EIN_MISHPAT'), true);
  assert.equal(isReaderReferenceLink('CUSTOM_REFERENCE_TYPE'), true);
  assert.equal(isReaderReferenceLink(undefined), true);
});

test('inline link ranges are not repeated as context-menu reference entries', () => {
  assert.equal(isReaderReferenceLink('REFERENCE', 0, null), false);
  assert.equal(isReaderReferenceLink('REFERENCE', null, 4), false);
  assert.equal(isReaderReferenceLink('REFERENCE', null, null), true);
});

test('reference labels use the Hebrew names from Otzaria link types', () => {
  assert.equal(readerConnectionTypeLabel('MESORAT_HASHAS'), 'מסורת הש״ס');
  assert.equal(readerConnectionTypeLabel('EIN_MISHPAT'), 'עין משפט');
  assert.equal(readerConnectionTypeLabel('REFERENCE'), 'עיון');
  assert.equal(readerConnectionTypeLabel('קישור אישי'), 'קישור אישי');
  assert.equal(readerConnectionTypeLabel('הפניה'), 'עיון');
  assert.equal(readerConnectionTypeLabel('NONE'), 'לא מסווג');
  assert.equal(readerConnectionTypeLabel('EIN_MISHPAT_/_NER_MITSVAH'), 'עין משפט');
});

test('same-title references remain distinct when the database supplies different target IDs', () => {
  const items = groupReaderReferenceLinks([
    link('ספר זהה', 12, 'REFERENCE', 'יעד א', '', 101),
    link('ספר זהה', 12, 'REFERENCE', 'יעד ב', '', 202),
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.bookId), [101, 202]);
});

test('reference menu keeps first-seen target, filters invalid lines, and includes a safe text preview', () => {
  const items = groupReaderReferenceLinks([
    link('ירושלמי ברכות', 14, 'REFERENCE', '<b>הפניה</b> למסכת'),
    link('ירושלמי ברכות', 14, 'QUOTATION', 'כפילות לאותה שורה'),
    link('מדרש רבה', 21, 'MESORAT_HASHAS', 'מדרש מקושר', ''),
    link(' ', 3),
    link('יעד חסר', 0),
  ]);

  assert.deepEqual(items, [
    {
      key: 'ירושלמי ברכות\u000014',
      title: 'ירושלמי ברכות',
      categoryLabel: 'עיון',
      line: 14,
      reference: 'ברכות ב ע״א',
      preview: 'הפניה למסכת',
    },
    {
      key: 'מדרש רבה\u000021',
      title: 'מדרש רבה',
      categoryLabel: 'מסורת הש״ס',
      line: 21,
      reference: '',
      preview: 'מדרש מקושר',
    },
  ]);
});
