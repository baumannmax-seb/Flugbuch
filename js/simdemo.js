(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimDemo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FIELD = { icao: 'EDMA', lat: 48.2372, lon: 11.2881, elev: 518 };

  function noise(v, amp) { return v + (Math.random() - 0.5) * 2 * amp; }

  function generate(tgCount, field) {
    field = field || FIELD;
    var t = 0, lat = field.lat, lon = field.lon, agl = 0, heading = 0;
    var pts = [];

    function step(dt, spd, climbRate, hdg) {
      heading = hdg != null ? hdg : heading;
      agl = Math.max(0, agl + climbRate * dt);
      var dist = spd * dt;
      lat += (dist * Math.cos(heading)) / 111320;
      lon += (dist * Math.sin(heading)) / (111320 * Math.cos(field.lat * Math.PI / 180));
      t += dt * 1000;
      pts.push({
        t: t,
        lat: noise(lat, 3e-6), lon: noise(lon, 3e-6),
        alt: field.elev + agl + (agl > 0 ? noise(0, 2) : noise(0, 1)),
        speed: Math.max(0, noise(spd, 0.6)),
        heading: Math.round((heading * 180 / Math.PI + 360) % 360)
      });
    }
    function ramp(dt, from, to, climbRate, hdg) {
      var n = Math.round(dt);
      for (var i = 1; i <= n; i++) step(1, from + (to - from) * (i / n), climbRate == null ? 0 : climbRate, hdg);
    }

    ramp(20, 5, 5, 0, 0);
    ramp(18, 0, 30, 0, 0);
    while (agl < 300) step(1, 29, 6, 0);
    for (var k = 0; k < tgCount; k++) {
      ramp(45, 33, 33, 0, 0);
      heading = Math.PI / 2; ramp(30, 30, 30, 0);
      heading = Math.PI; ramp(30, 28, 28, 0);
      var guard = 0;
      while (agl > 60 && guard++ < 500) step(1, 24, -6, Math.PI);
      ramp(15, 21, 21, 0, Math.PI);
      ramp(6, 19, 17, -1.5, Math.PI);
      ramp(5, 17, 15, 0, Math.PI);
      ramp(10, 15, 30, 5, Math.PI);
      while (agl < 300) step(1, 28, 6, Math.PI);
    }
    ramp(45, 33, 33, 0, 0);
    heading = Math.PI / 2; ramp(25, 30, 30, 0);
    heading = Math.PI;
    guard = 0;
    while (agl > 60 && guard++ < 500) step(1, 24, -6, Math.PI);
    ramp(15, 21, 21, 0, Math.PI);
    ramp(6, 19, 17, -1.5, Math.PI);
    ramp(15, 17, 0, 0, Math.PI);
    ramp(45, 0, 0, 0, Math.PI);
    return pts;
  }

  return { generate: generate, FIELD: FIELD };
});
