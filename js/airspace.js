(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util.js'));
  else root.Airspace = factory(root.Util);
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';
  var FT = 0.3048, FL_M = 30.48;

  function parseCoord(s) {
    var m = /^\s*([\d.:]+)\s*([NS])\s+([\d.:]+)\s*([EW])\s*$/i.exec(s || '');
    if (!m) return null;
    function dms(v) {
      var p = v.split(':');
      var d = parseFloat(p[0]);
      if (p.length > 1) d += parseFloat(p[1]) / 60;
      if (p.length > 2) d += parseFloat(p[2]) / 3600;
      return d;
    }
    var lat = dms(m[1]), lon = dms(m[3]);
    if (m[2].toUpperCase() === 'S') lat = -lat;
    if (m[4].toUpperCase() === 'W') lon = -lon;
    return { lat: lat, lon: lon };
  }

  function parseAlt(s) {
    s = (s || '').trim().toUpperCase();
    if (!s || s === 'GND' || s === 'SFC') return 0;
    if (s === 'UNL') return 1e9;
    var m = /^FL\s*(\d+)/.exec(s);
    if (m) return parseInt(m[1], 10) * FL_M;
    m = /(\d+(?:\.\d+)?)\s*FT/.exec(s);
    if (m) return parseFloat(m[1]) * FT;
    m = /^(\d+(?:\.\d+)?)\s*M\b/.exec(s);
    if (m) return parseFloat(m[1]);
    return null;
  }

  function parseOpenAir(text) {
    var areas = [];
    var cur = null, lastPt = null, center = null;
    function finalize() {
      if (cur && cur.pts.length >= 3) {
        var ring = cur.pts.slice();
        var f = ring[0], l = ring[ring.length - 1];
        if (Math.abs(f.lat - l.lat) > 1e-9 || Math.abs(f.lon - l.lon) > 1e-9) ring.push({ lat: f.lat, lon: f.lon });
        areas.push({ name: cur.name, cls: cur.cls, ah: cur.ah, al: cur.al, ring: ring });
      }
      cur = null; lastPt = null; center = null;
    }
    var lines = String(text).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line.charAt(0) === '*') continue;
      var sp = line.indexOf(' ');
      var code = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
      var rest = sp < 0 ? '' : line.slice(sp + 1).trim();
      if (code === 'AC') { finalize(); cur = { cls: rest, name: '', ah: null, al: null, pts: [] }; continue; }
      if (!cur) continue;
      if (code === 'AN') cur.name = rest;
      else if (code === 'AH') cur.ah = parseAlt(rest);
      else if (code === 'AL') cur.al = parseAlt(rest);
      else if (code === 'V') {
        var mx = /X\s*=\s*(.+)/i.exec(rest);
        if (mx) { var c = parseCoord(mx[1]); if (c) { center = c; lastPt = c; } }
      } else if (code === 'DP') {
        var p = parseCoord(rest);
        if (p) { cur.pts.push(p); lastPt = p; }
      } else if (code === 'DC') {
        var rNm = parseFloat(rest);
        if (center && isFinite(rNm)) {
          var rM = rNm * 1852;
          var cosC = Math.cos(center.lat * Math.PI / 180);
          for (var k = 0; k < 48; k++) {
            var a = 2 * Math.PI * k / 48;
            cur.pts.push({ lat: center.lat + (rM * Math.cos(a)) / 111320, lon: center.lon + (rM * Math.sin(a)) / (111320 * cosC) });
          }
          lastPt = cur.pts[0];
        }
      } else if (code === 'DA' || code === 'DB') {
        var parts = rest.split(',');
        for (var j = 0; j < parts.length; j++) {
          var q = parseCoord(parts[j]);
          if (q) { cur.pts.push(q); lastPt = q; }
        }
      }
    }
    finalize();
    return areas;
  }

  function pointInRing(lat, lon, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i].lon, yi = ring[i].lat, xj = ring[j].lon, yj = ring[j].lat;
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function contains(area, lat, lon, altM) {
    if (!area.ring || !pointInRing(lat, lon, area.ring)) return false;
    if (altM != null && isFinite(altM)) {
      var al = area.al == null ? 0 : area.al;
      var ah = area.ah == null ? 1e9 : area.ah;
      if (altM < al || altM > ah) return false;
    }
    return true;
  }

  var WARN = { R: 3, D: 3, P: 3, C: 3, CTR: 3, TMZ: 2, RMZ: 2, TRA: 2, TSA: 2 };
  function warnLevel(cls) { return WARN[(cls || '').toUpperCase()] || 0; }

  var LS_KEY = 'pilotlog.airspace.v1';
  var mem = {};
  var LS = (function () {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
    catch (e) {
      return {
        getItem: function (k) { return k in mem ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();

  var Airspace = {
    areas: [],
    load: function () {
      try { var raw = LS.getItem(LS_KEY); this.areas = raw ? JSON.parse(raw) : []; }
      catch (e) { this.areas = []; }
      return this.areas;
    },
    save: function () { try { LS.setItem(LS_KEY, JSON.stringify(this.areas)); } catch (e) {} },
    clear: function () { this.areas = []; try { LS.removeItem(LS_KEY); } catch (e) {} },
    setFromOpenAir: function (text) { this.areas = parseOpenAir(text); this.save(); return this.areas; },
    check: function (lat, lon, altM) {
      var hits = [];
      for (var i = 0; i < this.areas.length; i++) {
        if (contains(this.areas[i], lat, lon, altM)) hits.push(this.areas[i]);
      }
      hits.sort(function (a, b) { return warnLevel(b.cls) - warnLevel(a.cls); });
      return hits;
    },
    parseOpenAir: parseOpenAir,
    parseCoord: parseCoord,
    parseAlt: parseAlt,
    pointInRing: pointInRing,
    contains: contains,
    warnLevel: warnLevel
  };
  return Airspace;
});
