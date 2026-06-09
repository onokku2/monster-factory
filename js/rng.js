/* rng.js — シード付き乱数と分布ユーティリティ
 * 原種・ドット絵・名前は seed から決定論的に再生成できること。
 * バトルや育成の即時乱数は new RNG() で実行時シードを使う。 */
(function (MF) {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // RNG インスタンス：seed は数値か文字列。省略時は時刻ベース。
  function RNG(seed) {
    if (seed === undefined) seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    if (typeof seed === "string") seed = hashSeed(seed);
    this._next = mulberry32(seed);
  }
  RNG.prototype.next = function () { return this._next(); };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this._next() * (b - a + 1)); };
  RNG.prototype.float = function (a, b) { return a + this._next() * (b - a); };
  RNG.prototype.chance = function (p) { return this._next() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this._next() * arr.length)]; };
  RNG.prototype.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  // Box-Muller 近似（標準正規）
  RNG.prototype.gauss = function () {
    let u = 0, v = 0;
    while (u === 0) u = this._next();
    while (v === 0) v = this._next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // 重み付き抽選：entries = [{item, w}]
  RNG.prototype.weighted = function (entries) {
    let total = 0;
    for (let i = 0; i < entries.length; i++) total += entries[i].w;
    let r = this._next() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i].w;
      if (r < 0) return entries[i].item;
    }
    return entries[entries.length - 1].item;
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  MF.RNG = RNG;
  MF.hashSeed = hashSeed;
  MF.clamp = clamp;
})(window.MF = window.MF || {});
