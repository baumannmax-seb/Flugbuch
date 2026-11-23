(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Detector = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEFAULTS = {
    landSpeed: 19,
    takeoffSpeed: 23,
    stopSpeed: 7,
    stopConfirmSec: 30,
    maxTouchGroundSec: 22,
    minFlightSpeed: 25,
    lookbackSec: 150,
    descentWindowSec: 60,
    descentMinM: 25,
    aglMaxM: 60,
    smoothSec: 4,
    startSpeed: 16,
    startConfirmSec: 5,
    groundRefWindowSec: 600
  };
  function create(opts) {
    var cfg = Object.assign({}, DEFAULTS, opts || {});
    var state = 'GROUND';
    var events = [];
    var hist = [];
    var candT0 = null, candPt = null;
    var lowAutoSince = null, lowLandSince = null, highSince = null;
    var flightStarted = false, flightStopped = false;
    function snap(p) {
      return { lat: p.lat, lon: p.lon, alt: p.alt, speed: p.speed, heading: p.heading };
    }
    function push(type, t, pt, extra) {
      var ev = Object.assign({ type: type, t: t }, snap(pt || {}), extra || {});
      events.push(ev);
      return ev;
    }
    function feed(p) {
      var t = p.t;
      var rec = {
        t: t, lat: p.lat, lon: p.lon,
        alt: isFinite(p.alt) ? p.alt : NaN,
        speed: isFinite(p.speed) ? p.speed : 0,
        heading: p.heading
      };
      hist.push(rec);
      var cutoff = t - Math.max(cfg.lookbackSec, cfg.groundRefWindowSec) * 1000 - 5000;
      while (hist.length && hist[0].t < cutoff) hist.shift();
      var out = [];
      var sw = hist.filter(function (h) { return t - h.t <= cfg.smoothSec * 1000; });
      var sm = sw.reduce(function (s, h) { return s + h.speed; }, 0) / (sw.length || 1);
      var altPts = sw.filter(function (h) { return isFinite(h.alt); });
      var smAlt = altPts.length ? altPts.reduce(function (s, h) { return s + h.alt; }, 0) / altPts.length : NaN;
      var gw = hist.filter(function (h) { return t - h.t <= cfg.groundRefWindowSec * 1000 && isFinite(h.alt); });
      var groundRef = gw.length ? Math.min.apply(null, gw.map(function (h) { return h.alt; })) :
        (isFinite(rec.alt) ? rec.alt : NaN);
      var agl = (isFinite(smAlt) && isFinite(groundRef)) ? smAlt - groundRef : NaN;
      var lw = hist.filter(function (h) { return t - h.t <= cfg.lookbackSec * 1000; });
      var maxSpeed = lw.reduce(function (m, h) { return Math.max(m, h.speed); }, 0);
      var dw = hist.filter(function (h) { return t - h.t <= cfg.descentWindowSec * 1000 && isFinite(h.alt); });
      var recentDescent = dw.length >= 2 && isFinite(smAlt) ?
        (Math.max.apply(null, dw.map(function (h) { return h.alt; })) - smAlt) >= cfg.descentMinM : false;
      if (!flightStarted) {
        if (sm >= cfg.startSpeed) {
          if (highSince === null) highSince = t;
          if (t - highSince >= cfg.startConfirmSec * 1000) {
            flightStarted = true;
            out.push(push('flightstart', t, rec));
          }
        } else highSince = null;
      } else if (!flightStopped) {
        if (sm < cfg.stopSpeed) {
          if (lowAutoSince === null) lowAutoSince = t;
          if (t - lowAutoSince >= cfg.stopConfirmSec * 1000) {
            flightStopped = true;
            flightStarted = false;
            state = 'GROUND'; candT0 = null; candPt = null;
            out.push(push('flightstop', t, rec));
          }
        } else lowAutoSince = null;
      }
      if (state === 'GROUND') {
        if (sm >= cfg.takeoffSpeed) {
          out.push(push('takeoff', t, rec));
          state = 'AIR';
        }
      } else if (state === 'AIR') {
        var wasFlying = maxSpeed >= cfg.minFlightSpeed;
        var nearGround = !isFinite(agl) || agl <= cfg.aglMaxM;
        if (sm < cfg.landSpeed && wasFlying && (recentDescent || nearGround)) {
          state = 'CANDIDATE';
          candT0 = t; candPt = rec;
        }
      } else if (state === 'CANDIDATE') {
        var groundDur = (t - candT0) / 1000;
        if (sm >= cfg.takeoffSpeed) {
          if (groundDur <= cfg.maxTouchGroundSec) {
            out.push(push('touchandgo', candT0, candPt, { resolvedAt: t, groundDur: Math.round(groundDur * 10) / 10 }));
            out.push(push('takeoff', t, rec));
          } else {
            out.push(push('landing', candT0, candPt, { resolvedAt: t }));
            out.push(push('takeoff', t, rec));
          }
          state = 'AIR'; candT0 = null; candPt = null;
        } else if (sm < cfg.stopSpeed) {
          if (lowLandSince === null) lowLandSince = t;
          if (t - lowLandSince >= cfg.stopConfirmSec * 1000 || groundDur > cfg.maxTouchGroundSec + 15) {
            out.push(push('landing', candT0, candPt, { resolvedAt: t }));
            state = 'GROUND'; candT0 = null; candPt = null;
          }
        } else lowLandSince = null;
      }
      return out;
    }
    return {
      cfg: cfg,
      feed: feed,
      get events() { return events; },
      get state() { return state; },
      get flightStarted() { return flightStarted; },
      setFlightStarted: function (v) { flightStarted = !!v; if (v) flightStopped = false; },
      reset: function () {
        state = 'GROUND'; events = []; hist = [];
        candT0 = candPt = lowAutoSince = lowLandSince = highSince = null;
        flightStarted = flightStopped = false;
      }
    };
  }
  function summarize(events) {
    var s = {
      takeoffs: 0, landings: 0, touchAndGos: 0,
      flightstart: null, flightstop: null, firstTakeoff: null, lastLanding: null
    };
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (e.type === 'takeoff') { s.takeoffs++; if (s.firstTakeoff === null) s.firstTakeoff = e.t; }
      else if (e.type === 'touchandgo') {
        s.touchAndGos++; s.landings++;
        if (s.lastLanding === null || e.t > s.lastLanding) s.lastLanding = e.t;
      } else if (e.type === 'landing') {
        s.landings++;
        if (s.lastLanding === null || e.t > s.lastLanding) s.lastLanding = e.t;
      } else if (e.type === 'flightstart' && s.flightstart === null) s.flightstart = e.t;
      else if (e.type === 'flightstop' && s.flightstop === null) s.flightstop = e.t;
    }
    return s;
  }
  return { create: create, summarize: summarize, DEFAULTS: DEFAULTS };
});