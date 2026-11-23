(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    root.Store = factory(root.Util);
  }
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';
  var mem = {};
  var LS = (function () {
    try {
      localStorage.setItem('__t', '1');
      localStorage.removeItem('__t');
      return localStorage;
    } catch (e) {
      return {
        getItem: function (k) { return k in mem ? mem[k] : null; },
        setItem: function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      };
    }
  })();
  var K = {
    flights: 'pilotlog.flights.v1',
    aircraft: 'pilotlog.aircraft.v1',
    settings: 'pilotlog.settings.v1',
    seq: 'pilotlog.seq.v1'
  };
  function load(key, def) {
    try {
      var raw = LS.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  }
  function save(key, val) {
    try { LS.setItem(key, JSON.stringify(val)); } catch (e) { /* Speicher voll */ }
  }
  var flights = load(K.flights, []);
  var aircraft = load(K.aircraft, []);
  var settings = Object.assign({
    autoStart: true,
    startKmh: 58,
    landKmh: 68,
    takeoffKmh: 83,
    stopConfirmSec: 30,
    touchGroundSec: 22,
    defaultAircraft: null,
    customAirports: [],
    nightAuto: true,
    airspaceMap: true,
    airspaceWarn: true,
    basemap: true
  }, load(K.settings, {}));
  var seq = load(K.seq, 1);
  function nextNo() { var n = seq; seq += 1; save(K.seq, seq); return n; }
  var Store = {
    listFlights: function () {
      return flights.slice().sort(function (a, b) {
        return String(b.date + ' ' + (b.depTime || '')).localeCompare(String(a.date + ' ' + (a.depTime || '')));
      });
    },
    getFlight: function (id) { return flights.find(function (f) { return f.id === id; }) || null; },
    addFlight: function (f) {
      f.no = f.no || nextNo();
      f.createdAt = f.createdAt || Date.now();
      f.updatedAt = Date.now();
      flights.push(f);
      save(K.flights, flights);
      return f;
    },
    updateFlight: function (f) {
      var i = flights.findIndex(function (x) { return x.id === f.id; });
      if (i >= 0) { f.updatedAt = Date.now(); flights[i] = f; save(K.flights, flights); }
      return f;
    },
    deleteFlight: function (id) {
      flights = flights.filter(function (f) { return f.id !== id; });
      save(K.flights, flights);
    },
    listAircraft: function () { return aircraft.slice(); },
    getAircraft: function (id) { return aircraft.find(function (a) { return a.id === id; }) || null; },
    addAircraft: function (a) {
      a.id = a.id || Util.uid();
      aircraft.push(a);
      save(K.aircraft, aircraft);
      return a;
    },
    deleteAircraft: function (id) {
      aircraft = aircraft.filter(function (a) { return a.id !== id; });
      save(K.aircraft, aircraft);
      if (settings.defaultAircraft === id) { settings.defaultAircraft = null; save(K.settings, settings); }
    },
    getSettings: function () { return settings; },
    saveSettings: function (s) {
      settings = Object.assign({}, settings, s);
      save(K.settings, settings);
      return settings;
    },
    resetAll: function () {
      flights = []; aircraft = [];
      save(K.flights, flights);
      save(K.aircraft, aircraft);
    }
  };
  return Store;
});