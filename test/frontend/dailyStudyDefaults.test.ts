import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HDate, months } from '@hebcal/core';
import { chofetzChaim } from '@hebcal/learning/chofetzChaimBase';
import { TRACKS, orderedTracks } from '../../src/components/DailyStudy';
import { DEFAULT_SETTINGS } from '../../src/types';

test('default daily-study order puts Daf Yomi first and Chofetz Chaim second', () => {
  const tracks = orderedTracks(DEFAULT_SETTINGS.dailyStudyOrder);
  assert.deepEqual(tracks.slice(0, 2).map((track) => track.key), ['dafYomi', 'chofetzChaim']);
  assert.deepEqual(TRACKS.slice(0, 2).map((track) => track.key), ['dafYomi', 'chofetzChaim']);
  assert.equal(DEFAULT_SETTINGS.chofetzChaimScheduleType, 'world_three_times');
});

test('Chofetz Chaim schedule begins its three annual cycles on the expected Hebrew dates in a regular year', () => {
  const dates = [
    new HDate(1, months.TISHREI, 5786),
    new HDate(1, months.SHVAT, 5786),
    new HDate(1, months.SIVAN, 5786),
  ];

  for (const date of dates) {
    const reading = chofetzChaim(date);
    assert.equal(reading.k, 'Hakdamah');
    assert.equal(reading.b, 1);
    assert.equal(reading.e, 4);
  }
});

test('Chofetz Chaim schedule uses the adjusted three-cycle dates in a leap year', () => {
  const dates = [
    new HDate(1, months.TISHREI, 5784),
    new HDate(11, months.SHVAT, 5784),
    new HDate(20, months.IYYAR, 5784),
  ];

  for (const date of dates) {
    const reading = chofetzChaim(date);
    assert.equal(reading.k, 'Hakdamah');
    assert.equal(reading.b, 1);
    assert.equal(reading.e, 4);
  }
});
