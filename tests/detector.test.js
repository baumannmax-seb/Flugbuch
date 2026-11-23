'use strict';
const assert = require('assert');
const Detector = require('../js/detector.js');
const Airports = require('../js/airports.js');
const Util = require('../js/util.js');
const sim = require('./sim.js');
function run(pts, opts) {
  const d = Detector.create(opts);
  for (const p of pts) d.feed(p);
  return d;
}
function count(evs, type) { return evs.filter(e => e.type === type); }
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name + '\n  ' + e.message); process.exitCode = 1; }
}
test('Platzrunde mit 3 Touch & Go + Schlusslandung', () => {
  const d = run(sim.circuitTrack(3));
  const evs = d.events;
  assert.strictEqual(count(evs, 'touchandgo').length, 3, 'T&G: ' + JSON.stringify(evs.map(e => e.type)));
  assert.strictEqual(count(evs, 'landing').length, 1, 'Landungen: ' + JSON.stringify(evs.map(e => e.type)));
  assert.strictEqual(count(evs, 'takeoff').length, 4, 'Takeoffs');
  assert.strictEqual(count(evs, 'flightstart').length, 1, 'ein Auto-Start');
  assert.strictEqual(count(evs, 'flightstop').length, 1, 'ein Auto-Stop');
  const s = Detector.summarize(evs);
  assert.strictEqual(s.touchAndGos, 3);
  assert.strictEqual(s.landings, 4);
  assert.ok(s.firstTakeoff < s.lastLanding);
});
test('Nur Rollen erzeugt keine Ereignisse', () => {
  const d = run(sim.taxiOnlyTrack());
  assert.strictEqual(d.events.length, 0, JSON.stringify(d.events.map(e => e.type)));
});
test('Stop-and-Go zaehlt als Landung + neuer Start, nicht als T&G', () => {
  const d = run(sim.stopAndGoTrack());
  const evs = d.events;
  assert.strictEqual(count(evs, 'touchandgo').length, 0, JSON.stringify(evs.map(e => e.type)));
  assert.strictEqual(count(evs, 'landing').length, 2, JSON.stringify(evs.map(e => e.type)));
  assert.strictEqual(count(evs, 'takeoff').length, 2);
});
test('Langsamer Flug in 400 m ohne Sinkflug erzeugt kein T&G', () => {
  const d = run(sim.slowLevelTrack());
  const evs = d.events;
  assert.strictEqual(count(evs, 'touchandgo').length, 0, JSON.stringify(evs.map(e => e.type)));
  assert.strictEqual(count(evs, 'landing').length, 1);
});
test('T&G mit 5 Touch & Go', () => {
  const d = run(sim.circuitTrack(5));
  assert.strictEqual(count(d.events, 'touchandgo').length, 5);
  assert.strictEqual(count(d.events, 'landing').length, 1);
});
test('Flugplatz-Erkennung per GPS (EDMA)', () => {
  const hit = Airports.findNearest(sim.FIELD.lat, sim.FIELD.lon, 3000);
  assert.ok(hit, 'kein Flugplatz gefunden');
  assert.strictEqual(hit.airport.icao, 'EDMA');
  assert.ok(hit.distM < 500, 'Distanz: ' + hit.distM);
});
test('Flugplatz nicht in Reichweite -> null', () => {
  const hit = Airports.findNearest(40.0, 10.0, 3000);
  assert.strictEqual(hit, null);
});
test('Summarize: Dauer und Zeiten', () => {
  const pts = sim.circuitTrack(2);
  const d = run(pts);
  const s = Detector.summarize(d.events);
  assert.ok(s.firstTakeoff > pts[0].t);
  assert.ok(s.lastLanding < pts[pts.length - 1].t);
  assert.ok((s.lastLanding - s.firstTakeoff) / 1000 > 60, 'Flug dauer zu kurz');
});
test('Nachtberechnung: Sommernacht in Deutschland', () => {
  const d = new Date(2025, 5, 21, 23, 30);
  assert.strictEqual(Util.isNightAt(d, sim.FIELD.lat, sim.FIELD.lon), true);
  const d2 = new Date(2025, 5, 21, 12, 0);
  assert.strictEqual(Util.isNightAt(d2, sim.FIELD.lat, sim.FIELD.lon), false);
});
test('Haversine: 1 Grad Breite ~ 111 km', () => {
  const d = Util.haversineM({ lat: 48.0, lon: 11.0 }, { lat: 49.0, lon: 11.0 });
  assert.ok(Math.abs(d - 111195) < 1500, 'Distanz: ' + d);
});
console.log('\n' + passed + ' Tests bestanden' + (process.exitCode ? ' (mit Fehlern)' : ''));