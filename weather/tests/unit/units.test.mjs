import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertTemp, convertWind, convertPrecip, convertPressure, convertDistance,
  formatTemp, formatWind, formatPrecip, formatPressure, formatDistance, formatPercent,
  compassPoint, defaultUnitsForLocale,
} from '../../js/units.js';

test('temperature conversion', () => {
  assert.equal(convertTemp(0, 'c'), 0);
  assert.equal(convertTemp(0, 'f'), 32);
  assert.equal(convertTemp(100, 'f'), 212);
  assert.equal(convertTemp(-40, 'f'), -40);
  assert.equal(convertTemp(null, 'f'), null);
  assert.equal(convertTemp(NaN, 'c'), null);
});

test('wind conversion', () => {
  assert.equal(convertWind(36, 'kmh'), 36);
  assert.equal(convertWind(36, 'ms'), 10);
  assert.ok(Math.abs(convertWind(100, 'mph') - 62.137) < 0.001);
});

test('precipitation, pressure and distance conversion', () => {
  assert.equal(convertPrecip(25.4, 'in'), 1);
  assert.equal(convertPrecip(3, 'mm'), 3);
  assert.ok(Math.abs(convertPressure(1013.25, 'inHg') - 29.92) < 0.01);
  assert.equal(convertPressure(1013, 'hPa'), 1013);
  assert.equal(convertDistance(10000, false), 10);
  assert.ok(Math.abs(convertDistance(1609.344, true) - 1) < 1e-9);
});

test('formatting rounds and labels values', () => {
  assert.equal(formatTemp(21.6, 'c'), '22°');
  assert.equal(formatTemp(21.6, 'f'), '71°');
  assert.equal(formatTemp(-0.3, 'c'), '0°', 'no negative zero');
  assert.equal(formatTemp(undefined, 'c'), '–');
  assert.equal(formatWind(14.4, 'kmh'), '14 km/h');
  assert.equal(formatWind(14.4, 'ms'), '4.0 m/s');
  assert.equal(formatWind(16.09344, 'mph'), '10 mph');
  assert.equal(formatPrecip(4.8, 'mm'), '4.8 mm');
  assert.equal(formatPrecip(25.4, 'in'), '1.00 in');
  assert.equal(formatPressure(1013.2, 'hPa'), '1,013 hPa');
  assert.equal(formatPressure(1013.25, 'inHg'), '29.92 inHg');
  assert.equal(formatDistance(24140, false), '24 km');
  assert.equal(formatDistance(8000, true), '5.0 mi');
  assert.equal(formatPercent(55), '55%');
  assert.equal(formatPercent(null), '–');
});

test('formatting respects locale digits', () => {
  assert.equal(formatTemp(22, 'c', 'ar-EG'), '٢٢°');
});

test('compass points', () => {
  assert.equal(compassPoint(0), 'N');
  assert.equal(compassPoint(360), 'N');
  assert.equal(compassPoint(315), 'NW');
  assert.equal(compassPoint(200), 'SSW');
  assert.equal(compassPoint(-90), 'W');
  assert.equal(compassPoint(null), '');
});

test('locale default units', () => {
  assert.deepEqual(defaultUnitsForLocale('en-US'), { tempUnit: 'f', windUnit: 'mph', precipUnit: 'in', pressureUnit: 'inHg' });
  assert.deepEqual(defaultUnitsForLocale('en-GB'), { tempUnit: 'c', windUnit: 'kmh', precipUnit: 'mm', pressureUnit: 'hPa' });
  assert.equal(defaultUnitsForLocale('ar').tempUnit, 'c');
});
