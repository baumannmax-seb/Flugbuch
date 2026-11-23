'use strict';

const assert = require('assert');
const Airspace = require('../js/airspace.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name + '\n  ' + e.stack); process.exitCode = 1; }
}

const SAMPLE = [
  '* Kommentarzeile',
  'AC R',
  'AN EDR Muenchen',
  'AH FL100',
  'AL GND',
  'V X=48:07:59 N 011:33:53 E',
  'DC 3.00',
  '',
  'AC R',
  'AN EDR Celle (30.9. 0600-1500)',
  'AH 1500ft AMSL',
  'AL GND',
  'DP 52:35:03 N 009:53:11 E',
  'DP 52:39:54 N 009:48:22 E',
  'DP 52:42:55 N 009:50:55 E',
  'DP 52:43:52 N 010:13:54 E',
  'DP 52:39:23 N 010:10:16 E',
  'DP 52:38:06 N 009:57:16 E',
  'DP 52:35:03 N 009:53:11 E',
  ''
].join('\n');

test('parseCoord DMS', () => {
  const c = Airspace.parseCoord('52:35:03 N 009:53:11 E');
  assert.ok(Math.abs(c.lat - 52.5841667) < 1e-6, 'lat ' + c.lat);
  assert.ok(Math.abs(c.lon - 9.8863889) < 1e-6, 'lon ' + c.lon);
  const s = Airspace.parseCoord('48.5 S 011.5 W');
  assert.strictEqual(s.lat, -48.5);
  assert.strictEqual(s.lon, -11.5);
});

test('parseAlt: FL, ft, GND, UNL', () => {
  assert.strictEqual(Airspace.parseAlt('FL100'), 3048);
  assert.ok(Math.abs(Airspace.parseAlt('1500ft AMSL') - 457.2) < 0.01);
  assert.strictEqual(Airspace.parseAlt('GND'), 0);
  assert.strictEqual(Airspace.parseAlt('UNL'), 1e9);
});

test('Kreis (DC 3.00 NM um Muenchen): innen ja, aussen nein', () => {
  const areas = Airspace.parseOpenAir(SAMPLE);
  const muc = areas.find(a => a.name.includes('Muenchen'));
  assert.ok(muc, 'EDR Muenchen fehlt');
  assert.strictEqual(muc.cls, 'R');
  assert.strictEqual(muc.ring.length, 49);
  assert.ok(Airspace.contains(muc, 48.133055, 11.564722), 'Zentrum sollte innen sein');
  assert.ok(!Airspace.contains(muc, 48.5, 11.5), '47 km entfernt sollte aussen sein');
  assert.ok(!Airspace.contains(muc, 49.5, 11.5), '100 km entfernt aussen');
});

test('Höhenband: FL100 = 3048 m', () => {
  const areas = Airspace.parseOpenAir(SAMPLE);
  const muc = areas.find(a => a.name.includes('Muenchen'));
  assert.ok(Airspace.contains(muc, 48.133055, 11.564722, 2000), '2000 m < FL100 -> innen');
  assert.ok(!Airspace.contains(muc, 48.133055, 11.564722, 4000), '4000 m > FL100 -> aussen');
});

test('Polygon (EDR Celle): Punkt innen/aussen', () => {
  const areas = Airspace.parseOpenAir(SAMPLE);
  const celle = areas.find(a => a.name.includes('Celle'));
  assert.ok(celle, 'EDR Celle fehlt');
  assert.ok(Math.abs(celle.ah - 457.2) < 0.01, 'AH 1500ft');
  assert.ok(Airspace.contains(celle, 52.65, 9.95), 'Mitte Polygon innen');
  assert.ok(!Airspace.contains(celle, 52.0, 9.0), 'weit weg aussen');
});

test('check() sortiert nach Warnstufe (R vor TMZ)', () => {
  Airspace.areas = Airspace.parseOpenAir(SAMPLE + '\nAC RMZ\nAN RMZ Test\nAH FL100\nAL GND\nV X=48:07:59 N 011:33:53 E\nDC 12.00\n');
  const hits = Airspace.check(48.133055, 11.564722, 1000);
  assert.ok(hits.length >= 2, JSON.stringify(hits.map(h => h.cls)));
  assert.strictEqual(hits[0].cls, 'R');
});

console.log('\n' + passed + ' Tests bestanden' + (process.exitCode ? ' (mit Fehlern)' : ''));
