'use strict';

const assert = require('assert');
const Tiles = require('../js/tiles.js');
const OpenAIP = require('../js/openaip.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name + '\n  ' + e.stack); process.exitCode = 1; }
}

test('TMS-Zeile -> XYZ: y = 2^z - 1 - tmsRow', () => {
  assert.strictEqual(Tiles.tmsRowToXyzY(13, 0), 8191);
  assert.strictEqual(Tiles.tmsRowToXyzY(13, 8191), 0);
  assert.strictEqual(Tiles.tmsRowToXyzY(10, 512), 511);
});

test('Kachel-Ordner-Pfad parsen', () => {
  assert.deepStrictEqual(Tiles.parseFolderPath('tiles/13/4402/2687.png'), { z: 13, x: 4402, y: 2687 });
  assert.deepStrictEqual(Tiles.parseFolderPath('13\\4402\\2687.jpg'), null);
  assert.strictEqual(Tiles.parseFolderPath('README.md'), null);
  assert.deepStrictEqual(Tiles.parseFolderPath('a/8/137/91.webp'), { z: 8, x: 137, y: 91 });
});

test('Tiles-Key', () => {
  assert.strictEqual(Tiles.key(13, 4402, 2687), '13/4402/2687');
});

test('OpenAIP normalizeAirport (verschachtelte location)', () => {
  const a = OpenAIP.normalizeAirport({ icao: 'edma', name: 'Maisach', location: { lat: 48.2372, lon: 11.2881 }, elevation: 518 });
  assert.deepStrictEqual(a, { icao: 'EDMA', name: 'Maisach', lat: 48.2372, lon: 11.2881, elev: 518 });
  assert.strictEqual(OpenAIP.normalizeAirport({ name: 'x' }), null);
});

test('OpenAIP normalizeAirspace: GeoJSON [lon,lat] -> ring [lat,lon], Typ/Hoehen', () => {
  const s = OpenAIP.normalizeAirspace({
    name: 'EDR Test',
    type: { name: 'RESTRICTED' },
    category: { name: 'R' },
    upperLimit: { value: 'FL100', unit: 'FL' },
    lowerLimit: { value: 'GND' },
    geometry: { type: 'Polygon', coordinates: [[[11.0, 48.0], [11.1, 48.0], [11.1, 48.1], [11.0, 48.0]]] }
  });
  assert.strictEqual(s.cls, 'R');
  assert.strictEqual(s.ah, 3048);
  assert.strictEqual(s.al, 0);
  assert.deepStrictEqual(s.ring[0], { lat: 48.0, lon: 11.0 });
  assert.strictEqual(s.ring.length, 4);
});

test('OpenAIP itemsOf: Array oder {items}', () => {
  assert.deepStrictEqual(OpenAIP.itemsOf([1, 2]), [1, 2]);
  assert.deepStrictEqual(OpenAIP.itemsOf({ items: [3] }), [3]);
  assert.deepStrictEqual(OpenAIP.itemsOf({}), []);
});

console.log('\n' + passed + ' Tests bestanden' + (process.exitCode ? ' (mit Fehlern)' : ''));
