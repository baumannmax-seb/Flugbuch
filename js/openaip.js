(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpenAIP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var BASE = 'https://api.core.openaip.net/api';

  function apiGet(key, path, params) {
    var q = Object.keys(params || {}).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var url = BASE + path + (q ? '?' + q : '');
    return fetch(url, { headers: { 'x-openaip-api-key': key } }).then(function (r) {
      if (!r.ok) throw new Error('OpenAIP HTTP ' + r.status);
      return r.json();
    });
  }

  function itemsOf(json) {
    return Array.isArray(json) ? json : (json.items || json.data || json.results || []);
  }

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  function normalizeAirport(it) {
    var loc = it.location || it.position || {};
    var lat = num(loc.lat != null ? loc.lat : it.lat);
    var lon = num(loc.lon != null ? loc.lon : (loc.lng != null ? loc.lng : it.lon));
    var icao = String(it.icao || it.icaoCode || '').toUpperCase();
    if (lat == null || lon == null) return null;
    return {
      icao: icao,
      name: it.name || icao,
      lat: lat,
      lon: lon,
      elev: num(it.elevation != null ? it.elevation : loc.elevation) || 0
    };
  }

  var TYPE_MAP = {
    CTR: 'CTR', TMA: 'TMA', TMZ: 'TMZ', RMZ: 'RMZ',
    R: 'R', RESTRICTED: 'R', D: 'D', DANGER: 'D', P: 'P', PROHIBITED: 'P',
    TRA: 'TRA', TSA: 'TSA', GLIDING: 'G', WAVE: 'G'
  };

  function altM(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    var s = String(v).toUpperCase();
    var m = /^FL\s*(\d+)/.exec(s);
    if (m) return parseInt(m[1], 10) * 30.48;
    m = /(\d+(?:\.\d+)?)\s*FT/.exec(s);
    if (m) return parseFloat(m[1]) * 0.3048;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function normalizeAirspace(it) {
    var geom = it.geometry || {};
    var coords = geom.coordinates && geom.coordinates[0];
    if (!coords || coords.length < 3) return null;
    var ring = coords.map(function (c) { return { lat: c[1], lon: c[0] }; });
    var rawType = it.type && (it.type.name || it.type);
    var cat = it.category && (it.category.name || it.category);
    var cls = TYPE_MAP[String(rawType || '').toUpperCase()] || (cat ? String(cat).toUpperCase() : 'C');
    var up = it.upperLimit != null ? it.upperLimit : it.upper;
    var lo = it.lowerLimit != null ? it.lowerLimit : it.lower;
    return {
      name: it.name || cls,
      cls: cls,
      ah: altM(up && up.value != null ? up.value : up),
      al: altM(lo && lo.value != null ? lo.value : lo) || 0,
      ring: ring
    };
  }

  return {
    BASE: BASE,
    apiGet: apiGet,
    itemsOf: itemsOf,
    normalizeAirport: normalizeAirport,
    normalizeAirspace: normalizeAirspace,
    fetchAirports: function (key, country) {
      return apiGet(key, '/airports', country ? { country: country } : {})
        .then(function (j) { return itemsOf(j).map(normalizeAirport).filter(Boolean); });
    },
    fetchAirspaces: function (key, country) {
      return apiGet(key, '/airspaces', country ? { country: country } : {})
        .then(function (j) { return itemsOf(j).map(normalizeAirspace).filter(Boolean); });
    }
  };
});
