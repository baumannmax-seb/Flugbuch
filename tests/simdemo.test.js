'use strict';

const assert = require('assert');
const Detector = require('../js/detector.js');
const SimDemo = require('../js/simdemo.js');

const d = Detector.create();
for (const p of SimDemo.generate(3)) d.feed(p);
const evs = d.events.map(e => e.type);
assert.strictEqual(evs.filter(t => t === 'touchandgo').length, 3, evs.join(','));
assert.strictEqual(evs.filter(t => t === 'landing').length, 1, evs.join(','));
assert.strictEqual(evs.filter(t => t === 'flightstart').length, 1, evs.join(','));
assert.strictEqual(evs.filter(t => t === 'flightstop').length, 1, evs.join(','));
console.log('ok - SimDemo-Track (Browser-Demo) wird korrekt erkannt: ' + evs.join(','));
console.log('\n1 Test bestanden');
