(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    root.Airports = factory(root.Util);
  }
})(typeof self !== 'undefined' ? self : this, function (Util) {
  'use strict';
  var LIST = [
    ['EDDF', 'Frankfurt am Main', 50.0264, 8.5431, 111],
    ['EDDM', 'München', 48.3538, 11.7861, 453],
    ['EDDH', 'Hamburg Fuhlsbüttel', 53.6304, 9.9882, 16],
    ['EDHE', 'Hamburg Finkenwerder', 53.5350, 9.8352, 16],
    ['EDDK', 'Köln/Bonn', 50.8659, 7.1427, 92],
    ['EDDL', 'Düsseldorf', 51.2895, 6.7668, 45],
    ['EDDS', 'Stuttgart', 48.6899, 9.2220, 315],
    ['EDDV', 'Hannover', 52.4611, 9.6852, 55],
    ['EDDP', 'Leipzig/Halle', 51.4238, 12.2364, 142],
    ['EDDB', 'Berlin Brandenburg', 52.3667, 13.5033, 48],
    ['EDDT', 'Berlin Tegel', 52.5597, 13.2877, 37],
    ['EDDC', 'Dresden', 51.1328, 13.7676, 230],
    ['EDDR', 'Saarbrücken', 49.2146, 7.1094, 193],
    ['EDJA', 'Memmingen', 47.9888, 10.2395, 633],
    ['EDLW', 'Dortmund', 51.5183, 7.6121, 125],
    ['EDLP', 'Paderborn/Lippstadt', 51.6140, 8.6163, 213],
    ['EDVK', 'Kassel-Calden', 51.4197, 9.3785, 277],
    ['EDNX', 'Nürnberg', 49.4977, 11.0675, 319],
    ['EDTB', 'Karlsruhe/Baden-Baden', 48.7654, 8.0804, 124],
    ['EDXW', 'Sylt', 54.9133, 8.3414, 16],
    ['EDMA', 'Maisach', 48.2372, 11.2881, 518],
    ['EDML', 'Landshut', 48.5428, 12.3372, 397],
    ['EDMS', 'Straubing', 48.9411, 12.5178, 351],
    ['EDNY', 'Friedrichshafen', 47.6713, 9.5115, 417],
    ['EDQW', 'Weiden', 49.7033, 12.1967, 442],
    ['LOWW', 'Wien', 48.1103, 16.5697, 183],
    ['LOWL', 'Linz', 48.2332, 14.1878, 298],
    ['LOWG', 'Graz', 46.9911, 15.4395, 340],
    ['LOWI', 'Innsbruck', 47.2602, 11.3440, 581],
    ['LOWS', 'Salzburg', 47.7933, 13.0042, 430],
    ['LOWK', 'Klagenfurt', 46.6426, 14.3378, 447],
    ['LOWZ', 'Zell am See', 47.2043, 12.7953, 767],
    ['LSZH', 'Zürich', 47.4647, 8.5492, 432],
    ['LSGG', 'Genf', 46.2381, 6.1089, 430],
    ['LSZB', 'Bern-Belp', 46.9144, 7.4971, 510],
    ['LSZL', 'Locarno', 46.1636, 8.8786, 197],
    ['LSZS', 'Samedan', 46.4239, 9.8835, 1707],
    ['EHAM', 'Amsterdam', 52.3105, 4.7641, -3],
    ['EHEH', 'Eindhoven', 51.4500, 5.3744, 22],
    ['LFLL', 'Lyon Saint-Exupéry', 45.7256, 5.0811, 201],
    ['LFBO', 'Toulouse', 43.6291, 1.3639, 152],
    ['EKCH', 'Kopenhagen', 55.6180, 12.6560, 5],
    ['EPWA', 'Warschau', 52.1657, 20.9671, 110],
    ['LKPR', 'Prag', 50.1008, 14.2600, 380]
  ].map(function (r) {
    return { icao: r[0], name: r[1], lat: r[2], lon: r[3], elev: r[4] };
  });
  function findNearest(lat, lon, maxM, extra) {
    var all = LIST.concat(extra || []);
    var best = null, bestD = Infinity;
    for (var i = 0; i < all.length; i++) {
      var a = all[i];
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      var d = Util.haversineM({ lat: lat, lon: lon }, a);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best && bestD <= (maxM || 2500)) return { airport: best, distM: Math.round(bestD) };
    return null;
  }
  function findByIcao(icao, extra) {
    if (!icao) return null;
    var all = LIST.concat(extra || []);
    var up = String(icao).toUpperCase().trim();
    for (var i = 0; i < all.length; i++) if (all[i].icao === up) return all[i];
    return null;
  }
  return { list: LIST, findNearest: findNearest, findByIcao: findByIcao };
});