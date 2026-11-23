'use strict';
const FIELD = { icao: 'EDMA', lat: 48.2372, lon: 11.2881, elev: 518 };
function noise(v, amp) { return v + (Math.random() - 0.5) * 2 * amp; }
function makeSim(field) {
  field = field || FIELD;
  let t = 1700000000000;
  let lat = field.lat, lon = field.lon;
  let agl = 0, speed = 0, heading = 0;
  const pts = [];
  function step(dt, spd, climbRate, hdg) {
    speed = spd;
    heading = hdg != null ? hdg : heading;
    agl = Math.max(0, agl + climbRate * dt);
    const dist = speed * dt;
    const dLat = (dist * Math.cos(heading)) / 111320;
    const dLon = (dist * Math.sin(heading)) / (111320 * Math.cos(field.lat * Math.PI / 180));
    lat += dLat; lon += dLon;
    t += dt * 1000;
    pts.push({
      t, lat: noise(lat, 3e-6), lon: noise(lon, 3e-6),
      alt: field.elev + agl + (agl > 0 ? noise(0, 2) : noise(0, 1)),
      speed: Math.max(0, noise(speed, 0.6)),
      heading: Math.round((heading * 180 / Math.PI + 360) % 360)
    });
  }
  function ramp(dt, from, to, climbRate, hdg) {
    const n = Math.round(dt);
    for (let i = 1; i <= n; i++) {
      step(1, from + (to - from) * (i / n), climbRate == null ? 0 : climbRate, hdg);
    }
  }
  return {
    pts,
    field,
    taxi(sec, hdg) { ramp(sec, 5, 5, 0, hdg == null ? 0 : hdg); },
    takeoffRoll(sec) { ramp(sec, 0, 30, 0, 0); },
    climbTo(aglTarget, spd) { while (agl < aglTarget) step(1, spd == null ? 30 : spd, 6, 0); },
    fly(sec, spd, hdg) { ramp(sec, spd == null ? 33 : spd, spd == null ? 33 : spd, 0, hdg == null ? 0 : hdg); },
    turnTo(hdg) { heading = hdg; },
    descendTo(aglTarget, spd) {
      let guard = 0;
      while (agl > aglTarget && guard++ < 500) step(1, spd == null ? 24 : spd, -6, 0);
    },
    touchdown(behavior) {
      ramp(6, 19, 17, -1.5, 0);
      if (behavior === 'tg') {
        ramp(5, 17, 15, 0, 0);
        ramp(10, 15, 30, 5, 0);
      } else {
        ramp(15, 17, 0, 0, 0);
      }
    },
    stand(sec) { ramp(sec, 0, 0, 0, 0); }
  };
}
function circuitTrack(tgCount) {
  const s = makeSim();
  s.taxi(20);
  s.takeoffRoll(18);
  s.climbTo(300, 29);
  for (let i = 0; i < tgCount; i++) {
    s.fly(45, 33, 0);
    s.turnTo(Math.PI / 2); s.fly(30, 30);
    s.turnTo(Math.PI); s.fly(30, 28);
    s.descendTo(60, 24);
    s.turnTo(Math.PI); s.fly(15, 21, Math.PI);
    s.touchdown('tg');
    s.climbTo(300, 28);
  }
  s.fly(45, 33, 0);
  s.turnTo(Math.PI / 2); s.fly(25, 30);
  s.turnTo(Math.PI); s.descendTo(60, 24); s.fly(15, 21, Math.PI);
  s.touchdown('stop');
  s.stand(45);
  return s.pts;
}
function taxiOnlyTrack() {
  const s = makeSim();
  s.taxi(60);
  return s.pts;
}
function stopAndGoTrack() {
  const s = makeSim();
  s.taxi(15);
  s.takeoffRoll(18);
  s.climbTo(200, 29);
  s.fly(60, 32, 0);
  s.descendTo(50, 24);
  s.touchdown('stop');
  s.stand(60);
  s.takeoffRoll(18);
  s.climbTo(200, 29);
  s.fly(60, 32, 0);
  s.descendTo(50, 24);
  s.touchdown('stop');
  s.stand(45);
  return s.pts;
}
function slowLevelTrack() {
  const s = makeSim();
  s.taxi(15);
  s.takeoffRoll(18);
  s.climbTo(400, 29);
  s.fly(40, 30, 0);
  s.fly(12, 17, 0);
  s.fly(40, 30, 0);
  s.descendTo(50, 24);
  s.touchdown('stop');
  s.stand(45);
  return s.pts;
}
module.exports = { makeSim, circuitTrack, taxiOnlyTrack, stopAndGoTrack, slowLevelTrack, FIELD };