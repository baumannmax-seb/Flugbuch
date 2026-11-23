(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'), require('./detector.js'), require('./airports.js'));
  } else {
    root.Recorder = factory(root.Util, root.Detector, root.Airports);
  }
})(typeof self !== 'undefined' ? self : this, function (Util, Detector, Airports) {
  'use strict';
  function Recorder(hooks) {
    this.hooks = hooks || {};
    this.active = false;
    this.points = [];
    this.det = null;
    this.watchId = null;
    this.wakeLock = null;
    this.aircraftId = null;
    this.startedAt = null;
    this.lastPt = null;
    this.manualTg = 0;
    this.stopTimer = null;
  }
  Recorder.prototype.start = function (aircraftId, opts) {
    if (this.active) return;
    var self = this;
    opts = opts || {};
    this.demo = !!opts.demo;
    this.active = true;
    this.points = [];
    this.manualTg = 0;
    this.aircraftId = aircraftId || null;
    this.startedAt = Date.now();
    this.lastPt = null;
    var s = (this.hooks.settings ? this.hooks.settings() : {}) || {};
    this.det = Detector.create({
      startSpeed: Util.ms(s.startKmh != null ? s.startKmh : 58),
      landSpeed: Util.ms(s.landKmh != null ? s.landKmh : 68),
      takeoffSpeed: Util.ms(s.takeoffKmh != null ? s.takeoffKmh : 83),
      stopConfirmSec: s.stopConfirmSec != null ? s.stopConfirmSec : 30,
      maxTouchGroundSec: s.touchGroundSec != null ? s.touchGroundSec : 22
    });
    if (!s.autoStart) this.det.setFlightStarted(true);
    if (!this.demo) {
      this.watchId = navigator.geolocation.watchPosition(
        function (pos) { self._onPos(pos); },
        function (err) { if (self.hooks.onError) self.hooks.onError(err); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    }
    this._wake();
    if (this.hooks.onStart) this.hooks.onStart();
  };
  Recorder.prototype._wake = function () {
    var self = this;
    if (navigator.wakeLock) {
      navigator.wakeLock.request('screen').then(function (wl) { self.wakeLock = wl; }).catch(function () {});
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && self.active && navigator.wakeLock) {
        navigator.wakeLock.request('screen').then(function (wl) { self.wakeLock = wl; }).catch(function () {});
      }
    });
  };
  Recorder.prototype._onPos = function (pos) {
    var c = pos.coords;
    var now = pos.timestamp || Date.now();
    var pt = {
      t: now,
      lat: c.latitude,
      lon: c.longitude,
      alt: (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null,
      acc: c.accuracy,
      speed: (c.speed != null && c.speed >= 0) ? c.speed : null,
      heading: (c.heading != null && isFinite(c.heading)) ? c.heading : null
    };
    if (this.lastPt) {
      var dt = (pt.t - this.lastPt.t) / 1000;
      var d = Util.haversineM(this.lastPt, pt);
      if (dt < 0.8 && d < 2 && (pt.speed || 0) < 1) return;
      if (pt.speed == null && dt > 0) pt.speed = d / dt;
    }
    this.lastPt = pt;
    this.points.push(pt);
    var evs = this.det.feed(pt);
    for (var i = 0; i < evs.length; i++) this._onEvent(evs[i]);
    if (this.hooks.onPoint) this.hooks.onPoint(pt, this.det);
  };
  Recorder.prototype._onEvent = function (e) {
    if (e.type === 'touchandgo' || e.type === 'landing') {
      try { if (navigator.vibrate) navigator.vibrate(e.type === 'touchandgo' ? 120 : [80, 60, 120]); } catch (_) {}
    }
    if (e.type === 'flightstop') {
      var self = this;
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(function () { if (self.active) self.stop('auto'); }, 5000);
    }
    if (this.hooks.onEvent) this.hooks.onEvent(e);
  };
  Recorder.prototype.addManualTg = function () {
    this.manualTg += 1;
    if (this.hooks.onEvent) this.hooks.onEvent({ type: 'manualtg', t: Date.now() });
  };
  Recorder.prototype.summarize = function () {
    var pts = this.points;
    var evs = this.det ? this.det.events : [];
    var s = Detector.summarize(evs);
    var settings = (this.hooks.settings ? this.hooks.settings() : {}) || {};
    var custom = settings.customAirports || [];
    var depT = s.firstTakeoff || s.flightstart || (pts.length ? pts[0].t : this.startedAt);
    var arrT = s.lastLanding || s.flightstop || (pts.length ? pts[pts.length - 1].t : this.startedAt);
    if (arrT < depT) arrT = depT;
    var durationSec = Math.round((arrT - depT) / 1000);
    var dist = 0, maxAlt = null, maxSpeed = 0, speedSum = 0, speedN = 0;
    for (var i = 1; i < pts.length; i++) dist += Util.haversineM(pts[i - 1], pts[i]);
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j];
      if (p.alt != null && (maxAlt === null || p.alt > maxAlt)) maxAlt = p.alt;
      if (p.speed != null) { if (p.speed > maxSpeed) maxSpeed = p.speed; speedSum += p.speed; speedN++; }
    }
    function groundPointAt(idxFrom, dir) {
      for (var k = 0; k < pts.length; k++) {
        var p = pts[dir > 0 ? idxFrom + k : idxFrom - k];
        if (!p) break;
        if ((p.speed || 0) < 8) return p;
      }
      return pts[dir > 0 ? 0 : pts.length - 1];
    }
    var depP = pts.length ? groundPointAt(0, 1) : null;
    var arrP = pts.length ? groundPointAt(pts.length - 1, -1) : null;
    var depAp = depP ? Airports.findNearest(depP.lat, depP.lon, 3000, custom) : null;
    var arrAp = arrP ? Airports.findNearest(arrP.lat, arrP.lon, 3000, custom) : null;
    var mid = pts.length ? pts[Math.floor(pts.length / 2)] : null;
    var nightSec = (settings.nightAuto !== false && mid) ?
      Util.nightSecondsBetween(depT, arrT, mid.lat, mid.lon) : 0;
    var depD = new Date(depT), arrD = new Date(arrT);
    return {
      date: Util.fmtDate(depD),
      dep: depAp ? depAp.airport.icao : '',
      arr: arrAp ? arrAp.airport.icao : '',
      depName: depAp ? depAp.airport.name : '',
      arrName: arrAp ? arrAp.airport.name : '',
      aircraft: this.aircraftId || settings.defaultAircraft || '',
      depTime: Util.fmtClock(depD),
      arrTime: Util.fmtClock(arrD),
      depTs: depT,
      arrTs: arrT,
      durationSec: durationSec,
      landings: s.landings,
      touchAndGos: s.touchAndGos + this.manualTg,
      manualTg: this.manualTg,
      role: 'PIC',
      remarks: '',
      nightSec: Math.round(nightSec),
      distanceM: Math.round(dist),
      maxAltM: maxAlt,
      maxSpeedKmh: Math.round(Util.kmh(maxSpeed)),
      avgSpeedKmh: speedN ? Math.round(Util.kmh(speedSum / speedN)) : 0,
      track: pts.map(function (p) {
        return {
          t: p.t,
          lat: Math.round(p.lat * 1e5) / 1e5,
          lon: Math.round(p.lon * 1e5) / 1e5,
          alt: p.alt != null ? Math.round(p.alt) : null,
          speed: p.speed != null ? Math.round(p.speed * 10) / 10 : null,
          heading: p.heading
        };
      }),
      events: evs.map(function (e) {
        return { type: e.type, t: e.t, lat: e.lat, lon: e.lon, alt: e.alt, speed: e.speed };
      })
    };
  };
  Recorder.prototype.stop = function (reason) {
    if (!this.active) return null;
    this.active = false;
    clearTimeout(this.stopTimer);
    if (this.watchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.wakeLock && this.wakeLock.release) { this.wakeLock.release().catch(function () {}); }
    this.wakeLock = null;
    var flight = Object.assign({ id: Util.uid(), auto: reason === 'auto', createdAt: Date.now() }, this.summarize());
    if (this.hooks.onStop) this.hooks.onStop(flight, reason || 'manual');
    return flight;
  };
  return { Recorder: Recorder };
});