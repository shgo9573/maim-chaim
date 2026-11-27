import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatReaderCopyText,
  getReaderCopyOptionStates,
  toggleReaderCopyOption,
} from '../../src/components/ReaderCopyAsMenu';
import type { TextOpts } from '../../src/utils/text';

const visible: TextOpts = {
  nikud: true,
  teamim: true,
  punctuation: true,
  holyName: 'יהוה',
};

test('תפריט העתק כ מציג את מצב התצוגה ההתחלתי', () => {
  const options = getReaderCopyOptionStates(visible, visible);
  assert.deepEqual(options.map(({ id, checked, disabled }) => ({ id, checked, disabled })), [
    { id: 'nikud', checked: true, disabled: false },
    { id: 'teamim', checked: true, disabled: false },
    { id: 'punctuation', checked: true, disabled: false },
    { id: 'holyName', checked: true, disabled: false },
  ]);
});

test('שינוי ניקוד, טעמים ופיסוק נשאר עצמאי ואינו משנה את פרופיל המקור', () => {
  const draft = toggleReaderCopyOption(visible, 'nikud', 'קוק');
  const next = toggleReaderCopyOption(draft, 'teamim', 'קוק');
  const final = toggleReaderCopyOption(next, 'punctuation', 'קוק');

  assert.deepEqual(visible, {
    nikud: true,
    teamim: true,
    punctuation: true,
    holyName: 'יהוה',
  });
  assert.deepEqual(final, {
    nikud: false,
    teamim: false,
    punctuation: false,
    holyName: 'יהוה',
  });
});

test('העתקה מותאמת מסירה רק את הסימנים שנבחרו ומחליפה את שם הוי״ה', () => {
  const text = 'יְהוָה֑, בְּרֵאשִׁית!';
  const profile: TextOpts = {
    nikud: false,
    teamim: false,
    punctuation: false,
    holyName: 'קוק',
  };

  assert.equal(formatReaderCopyText(text, profile), 'קוק בראשית');
  assert.equal(text, 'יְהוָה֑, בְּרֵאשִׁית!');
});

test('לא ניתן להפעיל סימנים שאינם קיימים בטקסט שכבר מוצג', () => {
  const hidden: TextOpts = {
    nikud: false,
    teamim: false,
    punctuation: false,
    holyName: 'קוק',
  };
  const options = getReaderCopyOptionStates(hidden, hidden);

  assert.ok(options.every((option) => option.disabled));
  assert.equal(options.find((option) => option.id === 'holyName')?.checked, false);
});

test('אפשר להחליף שם הוי״ה בין ככתבו לבין צורת ההחלפה בלי לשנות הגדרות', () => {
  const replaced = toggleReaderCopyOption(visible, 'holyName', 'קוק');
  const restored = toggleReaderCopyOption(replaced, 'holyName', 'קוק');

  assert.equal(replaced.holyName, 'קוק');
  assert.equal(restored.holyName, 'יהוה');
  assert.equal(visible.holyName, 'יהוה');
});
