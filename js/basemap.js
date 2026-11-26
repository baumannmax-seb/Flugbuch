(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./tiles.js'));
  else root.Basemap = factory(root.Tiles);
})(typeof self !== 'undefined' ? self : this, function (Tiles) {
  'use strict';

  var OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  var memCache = {};

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
  function mercYDeg(lat) { return 180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }

  function chooseZoom(w, spanLonDeg) {
    var z = Math.round(Math.log2(360 * w / (256 * Math.max(spanLonDeg, 1e-6))));
    return Math.max(3, Math.min(17, z));
  }

  function rangeFor(view, z) {
    var n = Math.pow(2, z);
    var x0 = Math.max(0, Math.floor(lon2x(view.minLon, z)));
    var x1 = Math.min(n - 1, Math.floor(lon2x(view.maxLon, z)));
    var y0 = Math.max(0, Math.floor(lat2y(view.maxLat, z)));
    var y1 = Math.min(n - 1, Math.floor(lat2y(view.minLat, z)));
    var out = [];
    for (var tx = x0; tx <= x1; tx++) {
      for (var ty = y0; ty <= y1; ty++) {
        out.push({
          key: z + '/' + tx + '/' + ty,
          lonA: x2lon(tx, z), lonB: x2lon(tx + 1, z),
          latA: y2lat(ty, z), latB: y2lat(ty + 1, z)
        });
      }
    }
    return out;
  }

  function blobToImg(blob) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(blob).catch(function () { return null; });
    }
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { res(null); };
      im.src = URL.createObjectURL(blob);
    });
  }

  function paintTile(ctx, view, img, t) {
    if (!img) return false;
    var wpx = view.s * (t.lonB - t.lonA);
    var hpx = view.s * (mercYDeg(t.latA) - mercYDeg(t.latB));
    var c = view.P((t.lonA + t.lonB) / 2, (t.latA + t.latB) / 2);
    ctx.save();
    ctx.translate(c.x, c.y);
    if (view.rot) ctx.rotate(view.rot);
    ctx.drawImage(img, -wpx / 2, -hpx / 2, wpx, hpx);
    ctx.restore();
    return true;
  }

  function attribution(ctx, view) {
    ctx.fillStyle = 'rgba(10,15,28,.55)';
    ctx.font = '10px sans-serif';
    var label = '© OpenStreetMap-Mitwirkende';
    var tw = ctx.measureText(label).width;
    ctx.fillRect(view.w - tw - 12, view.h - 16, tw + 8, 14);
    ctx.fillStyle = '#c8d4e6';
    ctx.fillText(label, view.w - tw - 8, view.h - 5);
  }

  function draw(ctx, view, opts) {
    opts = opts || {};
    var source = opts.source || 'auto';
    var z = opts.zoom != null ? opts.zoom : chooseZoom(view.w, view.maxLon - view.minLon);
    var tiles = rangeFor(view, z);
    var anyLocal = false;
    if (source !== 'osm' && Tiles) {
      Tiles.getTiles(tiles.map(function (t) { return t.key; })).then(function (local) {
        var jobs = [];
        tiles.forEach(function (t) {
          if (local[t.key]) {
            jobs.push(blobToImg(local[t.key]).then(function (img) {
              if (paintTile(ctx, view, img, t)) anyLocal = true;
            }));
          }
        });
        return Promise.all(jobs);
      }).then(function () {
        if (anyLocal && opts.onLoaded) opts.onLoaded();
        if (source === 'local') return;
        fetchOnline(ctx, view, tiles, opts);
      }).catch(function () { fetchOnline(ctx, view, tiles, opts); });
    } else {
      fetchOnline(ctx, view, tiles, opts);
    }
  }

  function fetchOnline(ctx, view, tiles, opts) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    tiles.forEach(function (t) {
      var img = memCache[t.key];
      if (img === undefined) {
        memCache[t.key] = null;
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function () {
          memCache[t.key] = im;
          paintTile(ctx, view, im, t);
          attribution(ctx, view);
          if (opts.onLoaded) opts.onLoaded();
        };
        im.onerror = function () { memCache[t.key] = false; };
        im.src = OSM_URL
          .replace('{z}', t.key.split('/')[0])
          .replace('{x}', t.key.split('/')[1])
          .replace('{y}', t.key.split('/')[2]);
      } else if (img) {
        paintTile(ctx, view, img, t);
        attribution(ctx, view);
      }
    });
  }

  return {
    draw: draw,
    chooseZoom: chooseZoom,
    rangeFor: rangeFor,
    mercYDeg: mercYDeg,
    lon2x: lon2x, lat2y: lat2y, x2lon: x2lon, y2lat: y2lat
  };
});
