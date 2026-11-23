(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Util = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var R = 6371000;
  function haversineM(a, b) {
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtClock(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return pad2(h) + ':' + pad2(m);
  }
  function fmtDurMin(min) { return fmtDur(min * 60); }
  function parseClockMin(s) {
    var m = /(\d{1,2})[:.](\d{2})/.exec(s || '');
    if (!m) return null;
    var v = (+m[1]) * 60 + (+m[2]);
    return (v >= 0 && v < 24 * 60) ? v : null;
  }
  function clockToDate(dateStr, min) {
    var d = new Date(dateStr + 'T00:00:00');
    d.setMinutes(d.getMinutes() + min);
    return d;
  }
  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dayOfYear(d) {
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
  }
  function sunTimes(date, lat, lon) {
    var rad = Math.PI / 180, deg = 180 / Math.PI;
    var N = dayOfYear(date);
    var lngHour = lon / 15;
    function calc(t) {
      var M = 0.9856 * t - 3.289;
      var L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
      L = ((L % 360) + 360) % 360;
      var RA = Math.atan(0.91764 * Math.tan(L * rad)) * deg;
      RA = ((RA % 360) + 360) % 360;
      var Lquad = Math.floor(L / 90) * 90, RAquad = Math.floor(RA / 90) * 90;
      RA = (RA + (Lquad - RAquad) / 15) / 15;
      var sinDec = 0.39782 * Math.sin(L * rad);
      var cosDec = Math.cos(Math.asin(sinDec));
      var cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) /
        (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return null;
      var H = (t === 6 ? 360 - Math.acos(cosH) * deg : Math.acos(cosH) * deg) / 15;
      var T = H + RA - 0.06571 * t - 6.622;
      var UT = ((T - lngHour) % 24 + 24) % 24;
      return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + UT * 3600000);
    }
    return { sunrise: calc(6), sunset: calc(18) };
  }
  function isNightAt(date, lat, lon) {
    var s = sunTimes(date, lat, lon);
    if (!s.sunrise || !s.sunset) return false;
    var t = date.getTime();
    var ss = s.sunset.getTime() + 30 * 60000;
    var sr = s.sunrise.getTime() - 30 * 60000;
    return t >= ss || t < sr;
  }
  function nightSecondsBetween(t1, t2, lat, lon) {
    if (t2 <= t1) return 0;
    var step = 300000, total = 0;
    for (var t = t1; t < t2; t += step) {
      if (isNightAt(new Date(t + step / 2), lat, lon)) total += step / 1000;
    }
    if (total > (t2 - t1) / 1000) total = (t2 - t1) / 1000;
    return total;
  }
  function kmh(ms) { return ms * 3.6; }
  function ms(kmh) { return kmh / 3.6; }
  return {
    haversineM: haversineM, pad2: pad2, fmtClock: fmtClock, fmtDate: fmtDate,
    fmtDur: fmtDur, fmtDurMin: fmtDurMin, parseClockMin: parseClockMin,
    clockToDate: clockToDate, uid: uid, escapeHtml: escapeHtml,
    sunTimes: sunTimes, isNightAt: isNightAt, nightSecondsBetween: nightSecondsBetween,
    kmh: kmh, ms: ms
  };
});