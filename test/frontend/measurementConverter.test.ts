import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  convertMeasurement,
  formatMeasurementValue,
  getDefaultMeasurementSelection,
  getMeasurementOpinions,
  getMeasurementUnitGroups,
  needsMeasurementOpinion,
} from '../../src/utils/measurementConverter';

test('ancient length units convert by the traditional ratios', () => {
  assert.equal(convertMeasurement('אורך', '1', 'אמות', 'אצבעות'), 24);
  assert.equal(convertMeasurement('אורך', 1, 'מילים', 'פרסאות'), 0.25);
});

test('modern units convert through the category base unit', () => {
  assert.equal(convertMeasurement('אורך', 1, 'מטר', 'ס"מ'), 100);
  assert.equal(convertMeasurement('נפח', 1, 'ליטר', 'סמ"ק'), 1000);
  assert.equal(convertMeasurement('זמן', 1, 'חלקים', 'שניות'), 10 / 3);
});

test('crossing ancient and modern units requires and applies an opinion', () => {
  assert.equal(needsMeasurementOpinion('אורך', 'אמות', 'ס"מ'), true);
  assert.equal(convertMeasurement('אורך', 1, 'אמות', 'ס"מ'), null);
  assert.equal(convertMeasurement('אורך', 1, 'אמות', 'ס"מ', 'רמב"ם'), 45.6);
});

test('area conversion preserves the source-specific Chatam Sofer measure', () => {
  assert.equal(convertMeasurement('שטח', 1, 'בית סאה', 'מ"ר', 'חתם סופר'), 1050);
});

test('volume conversion uses the selected opinion', () => {
  assert.equal(convertMeasurement('נפח', 1, 'סאים', 'ליטר', 'רא"ח נאה'), 8.3);
});

test('weight conversion handles kilogram-scale ancient units', () => {
  assert.equal(convertMeasurement('משקל', 1, 'קנטרים', 'ק"ג', 'רש"י'), 35.4);
});

test('ancient-to-ancient conversions do not depend on an opinion', () => {
  assert.equal(needsMeasurementOpinion('זמן', 'הילוך מיל', 'הילוך פרסה'), false);
  assert.equal(convertMeasurement('זמן', 1, 'הילוך מיל', 'הילוך פרסה'), 0.25);
});

test('invalid, negative, empty and unknown inputs are rejected', () => {
  assert.equal(convertMeasurement('אורך', '', 'אמות', 'אצבעות'), null);
  assert.equal(convertMeasurement('אורך', -1, 'אמות', 'אצבעות'), null);
  assert.equal(convertMeasurement('אורך', 'abc', 'אמות', 'אצבעות'), null);
  assert.equal(convertMeasurement('אורך', 1, 'unknown', 'אצבעות'), null);
});

test('default selections and opinion lists match every category', () => {
  const groups = getMeasurementUnitGroups('זמן');
  assert.ok(groups.ancient.includes('הילוך ארבע אמות'));
  assert.ok(groups.modern.includes('חלקים'));
  assert.equal(getDefaultMeasurementSelection('משקל').value, '1');
  assert.ok(getMeasurementOpinions('משקל').includes('חזון איש ורא"ח נאה'));
});

test('result formatting trims trailing zeroes and limits precision', () => {
  assert.equal(formatMeasurementValue(24), '24');
  assert.equal(formatMeasurementValue(3.333333), '3.3333');
  assert.equal(formatMeasurementValue(null), '—');
});
