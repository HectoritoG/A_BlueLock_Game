(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }
  function pointToSegmentDistance(px, py, x1, y1, x2, y2){
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if(len2 <= 0.0001) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
  function angleTo(from,to){ return Math.atan2(to.y-from.y, to.x-from.x); }
  function normalize(v){ const l=Math.hypot(v.x,v.y); if(l<0.001) return {x:0,y:0}; return {x:v.x/l, y:v.y/l}; }

  return {
    dist,
    pointToSegmentDistance,
    lerp,
    clamp,
    angleTo,
    normalize
  };
});
