'use strict';

const assert = require('assert');
const sim = require('./sim.js');

const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
let watchCb = null;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    geolocation: {
      watchPosition: (ok) => { watchCb = ok; return 42; },
      clearWatch: () => {}
    }
  },
  configurable: true
});
Object.defineProperty(globalThis, 'document', {
  value: { addEventListener: () => {} },
  configurable: true
});

const Recorder = require('../js/recorder.js');
const Store = require('../js/store.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok - ' + name); }
  catch (e) { console.error('FAIL - ' + name + '\n  ' + e.stack); process.exitCode = 1; }
}

function feedTrack(rec, pts) {
  for (const p of pts) {
    watchCb({
      timestamp: p.t,
      coords: {
        latitude: p.lat, longitude: p.lon, altitude: p.alt,
        accuracy: 5, speed: p.speed, heading: p.heading
      }
    });
  }
}

test('Kompletter Auto-Flug: 2 T&G + Landung, Auto-ICAO EDMA, wird gespeichert', () => {
  Store.resetAll();
  let saved = null;
  const rec = new Recorder.Recorder({
    settings: () => Store.getSettings(),
    onStop: (flight) => { saved = flight; }
  });
  rec.start('D-MABC');
  assert.ok(rec.active);
  feedTrack(rec, sim.circuitTrack(2));
  const evs = rec.det.events.map(e => e.type);
  assert.ok(evs.includes('flightstart'), 'kein flightstart: ' + evs.join(','));
  assert.ok(evs.includes('flightstop'), 'kein flightstop: ' + evs.join(','));
  const flight = rec.stop('auto');
  assert.ok(saved === flight, 'onStop nicht mit gleichem Flug aufgerufen');
  assert.strictEqual(flight.touchAndGos, 2, JSON.stringify(evs));
  assert.strictEqual(flight.landings, 3);
  assert.strictEqual(flight.dep, 'EDMA');
  assert.strictEqual(typeof flight.arr, 'string');
  assert.ok(flight.durationSec > 300, 'Dauer: ' + flight.durationSec);
  assert.ok(flight.track.length > 100, 'Track zu kurz: ' + flight.track.length);
  assert.ok(flight.distanceM > 5000, 'Distanz: ' + flight.distanceM);
  assert.ok(flight.maxSpeedKmh > 90, 'maxSpeed: ' + flight.maxSpeedKmh);
  assert.ok(flight.maxAltM > sim.FIELD.elev + 200, 'maxAlt: ' + flight.maxAltM);
  assert.strictEqual(typeof flight.nightSec, 'number');
  assert.strictEqual(flight.aircraft, 'D-MABC');
  assert.strictEqual(flight.auto, true);
  const inStore = Store.listFlights();
  assert.strictEqual(inStore.length, 0, 'onStop speichert nicht selbst – App speichert');
});

test('Manueller Start ohne Auto-Start: setFlightStarted, T&G trotzdem erkannt', () => {
  Store.resetAll();
  Store.saveSettings({ autoStart: false });
  const rec = new Recorder.Recorder({ settings: () => Store.getSettings() });
  rec.start(null);
  feedTrack(rec, sim.circuitTrack(1));
  const s = require('../js/detector.js').summarize(rec.det.events);
  assert.strictEqual(s.touchAndGos, 1);
  assert.strictEqual(s.landings, 2);
  const f = rec.stop('manual');
  assert.strictEqual(f.auto, false);
  Store.saveSettings({ autoStart: true });
});

test('Recorder-Summarize: Zeiten aus Ereignissen, nicht aus letzter Position', () => {
  const rec = new Recorder.Recorder({ settings: () => Store.getSettings() });
  rec.start(null);
  const pts = sim.circuitTrack(1);
  feedTrack(rec, pts);
  const f = rec.stop('manual');
  const s = require('../js/detector.js').summarize(rec.det.events);
  assert.strictEqual(f.depTs, s.firstTakeoff);
  assert.strictEqual(f.arrTs, s.lastLanding);
  assert.ok(f.arrTs < pts[pts.length - 1].t, 'Ankunft = letzte Landung, nicht letzter GPS-Punkt');
});

test('Kurzer Platzrunden-Hop am Heimatplatz: Abflug UND Ankunft = EDMA', () => {
  const s = sim.makeSim();
  s.taxi(10);
  s.takeoffRoll(15);
  s.climbTo(150, 28);
  s.turnTo(Math.PI);
  s.fly(30, 28);
  s.descendTo(20, 22);
  s.fly(12, 18, Math.PI);
  s.touchdown('stop');
  s.stand(40);
  const rec = new Recorder.Recorder({ settings: () => Store.getSettings() });
  rec.start(null);
  feedTrack(rec, s.pts);
  const f = rec.stop('auto');
  assert.strictEqual(f.dep, 'EDMA', 'dep: ' + f.dep);
  assert.strictEqual(f.arr, 'EDMA', 'arr: ' + f.arr);
  assert.strictEqual(f.landings, 1);
  assert.strictEqual(f.touchAndGos, 0);
});

console.log('\n' + passed + ' Tests bestanden' + (process.exitCode ? ' (mit Fehlern)' : ''));
