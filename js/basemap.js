(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Basemap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var cache = {};

  function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function lat2y(lat, z) {
    var r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
  }
  function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function y2lat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function chooseZoom(w, spanLonDeg) {
    var z = Math.round(Math.log2(360 * w / (256 * Math.max(spanLonDeg, 1e-6))));
    return Math.max(3, Math.min(17, z));
  }

  function draw(ctx, view, onTileLoaded) {
    var z = chooseZoom(view.w, view.maxLon - view.minLon);
    var x0 = Math.max(0, Math.floor(lon2x(view.minLon - 0.002, z)));
    var x1 = Math.min(Math.pow(2, z) - 1, Math.floor(lon2x(view.maxLon + 0.002, z)));
    var y0 = Math.max(0, Math.floor(lat2y(view.maxLat + 0.002, z)));
    var y1 = Math.min(Math.pow(2, z) - 1, Math.floor(lat2y(view.minLat - 0.002, z)));
    var anyDrawn = false;
    for (var tx = x0; tx <= x1; tx++) {
      for (var ty = y0; ty <= y1; ty++) {
        var key = z + '/' + tx + '/' + ty;
        var lonA = x2lon(tx, z), lonB = x2lon(tx + 1, z);
        var latA = y2lat(ty, z), latB = y2lat(ty + 1, z);
        var px0 = view.X(lonA), px1 = view.X(lonB), py0 = view.Y(latA), py1 = view.Y(latB);
        var img = cache[key];
        if (img === undefined) {
          cache[key] = null;
          (function (k) {
            var im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = function () { cache[k] = im; if (onTileLoaded) onTileLoaded(); };
            im.onerror = function () { cache[k] = false; };
            im.src = TILE_URL.replace('{z}', k.split('/')[0]).replace('{x}', k.split('/')[1]).replace('{y}', k.split('/')[2]);
          })(key);
        } else if (img) {
          ctx.drawImage(img, px0, py0, px1 - px0, py1 - py0);
          anyDrawn = true;
        }
      }
    }
    if (anyDrawn) {
      ctx.fillStyle = 'rgba(10,15,28,.55)';
      ctx.font = '10px sans-serif';
      var label = '© OpenStreetMap-Mitwirkende';
      var tw = ctx.measureText(label).width;
      ctx.fillRect(view.w - tw - 12, view.h - 16, tw + 8, 14);
      ctx.fillStyle = '#c8d4e6';
      ctx.fillText(label, view.w - tw - 8, view.h - 5);
    }
    return anyDrawn;
  }

  return { draw: draw, chooseZoom: chooseZoom, lon2x: lon2x, lat2y: lat2y, x2lon: x2lon, y2lat: y2lat };
});
