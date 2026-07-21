"use strict";

const SAVE_KEY = "the-world-incremental-save-v013";
const SAVE_VERSION = 13;
const AUTOSAVE_MS = 60_000;
const MAX_OFFLINE_SECONDS = 28 * 24 * 60 * 60;
const DEV_PASSWORD = "1234";

class BigNum {
  constructor(m = 0, e = 0) {
    this.m = Number(m) || 0;
    this.e = Number(e) || 0;
    this.normalize();
  }

  static from(value) {
    if (value instanceof BigNum) return value.clone();
    if (value && typeof value === "object" && Number.isFinite(value.m) && Number.isFinite(value.e)) return new BigNum(value.m, value.e);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return new BigNum(1, 999999);
      if (value === 0) return new BigNum(0, 0);
      const e = Math.floor(Math.log10(Math.abs(value)));
      return new BigNum(value / 10 ** e, e);
    }
    const text = String(value ?? "0").trim().replaceAll(",", "");
    if (!text) return new BigNum(0, 0);
    const match = text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:e([+-]?\d+))?$/i);
    if (!match) return new BigNum(0, 0);
    const coefficient = Number(match[1]);
    const exponent = Number(match[2] || 0);
    if (!Number.isFinite(coefficient) || !Number.isFinite(exponent) || coefficient === 0) return new BigNum(0, 0);
    const shift = Math.floor(Math.log10(Math.abs(coefficient)));
    return new BigNum(coefficient / 10 ** shift, exponent + shift);
  }

  static pow10(exponent) { return new BigNum(1, exponent); }
  clone() { return new BigNum(this.m, this.e); }
  normalize() {
    if (!Number.isFinite(this.m) || !Number.isFinite(this.e)) { this.m = 1; this.e = 999999; return this; }
    if (this.m === 0) { this.e = 0; return this; }
    const sign = Math.sign(this.m);
    this.m = Math.abs(this.m);
    const shift = Math.floor(Math.log10(this.m));
    this.m = sign * this.m / 10 ** shift;
    this.e += shift;
    if (Math.abs(this.m) < 1) { this.m *= 10; this.e -= 1; }
    return this;
  }
  isZero() { return this.m === 0; }
  cmp(otherValue) {
    const other = BigNum.from(otherValue);
    if (this.m === 0 && other.m === 0) return 0;
    if (this.m < 0 && other.m >= 0) return -1;
    if (this.m >= 0 && other.m < 0) return 1;
    const sign = this.m < 0 ? -1 : 1;
    if (this.e !== other.e) return this.e > other.e ? sign : -sign;
    if (this.m === other.m) return 0;
    return this.m > other.m ? sign : -sign;
  }
  gte(v) { return this.cmp(v) >= 0; }
  gt(v) { return this.cmp(v) > 0; }
  lte(v) { return this.cmp(v) <= 0; }
  add(otherValue) {
    const other = BigNum.from(otherValue);
    if (this.isZero()) return other;
    if (other.isZero()) return this.clone();
    if (this.m < 0 || other.m < 0) return BigNum.from(this.toNumber() + other.toNumber());
    let a = this, b = other;
    if (a.e < b.e) [a, b] = [b, a];
    const diff = a.e - b.e;
    if (diff > 16) return a.clone();
    return new BigNum(a.m + b.m * 10 ** -diff, a.e);
  }
  sub(otherValue) {
    const other = BigNum.from(otherValue);
    if (this.cmp(other) <= 0) return new BigNum(0, 0);
    const diff = this.e - other.e;
    if (diff > 16) return this.clone();
    return new BigNum(this.m - other.m * 10 ** -diff, this.e);
  }
  mul(otherValue) {
    const other = BigNum.from(otherValue);
    if (this.isZero() || other.isZero()) return new BigNum(0, 0);
    return new BigNum(this.m * other.m, this.e + other.e);
  }
  div(otherValue) {
    const other = BigNum.from(otherValue);
    if (other.isZero()) return new BigNum(1, 999999);
    if (this.isZero()) return new BigNum(0, 0);
    return new BigNum(this.m / other.m, this.e - other.e);
  }
  pow(power) {
    const p = Number(power);
    if (this.isZero()) return new BigNum(0, 0);
    if (!Number.isFinite(p)) return new BigNum(1, 999999);
    const log = this.log10() * p;
    const e = Math.floor(log);
    return new BigNum(10 ** (log - e), e);
  }
  sqrt() { return this.pow(0.5); }
  floor() {
    if (this.e < 0) return new BigNum(0, 0);
    if (this.e >= 15) return this.clone();
    return BigNum.from(Math.floor(this.toNumber()));
  }
  log10() { return this.isZero() ? -Infinity : Math.log10(Math.abs(this.m)) + this.e; }
  toNumber() { return this.e > 308 ? Infinity : this.m * 10 ** this.e; }
  toJSON() { return { m: this.m, e: this.e }; }
}

const bn = (v) => BigNum.from(v);
const pow10 = (e) => BigNum.pow10(e);

const PRESTIGE_REQUIREMENTS = [
  bn("1e18"), bn("1e75"), bn("1e175"), bn("1e550"), bn("1e700"),
  bn("1e900"), bn("1e1150"), bn("1e1450"), bn("1e1800"), bn("1e2200"),
];

const PRESTIGE_REWARDS = [
  "Unlock Sparks and Basic Runes. Grants ×1e5 fixed Power.",
  "Unlock The Core and Core Shards. Grants ×1e12 fixed Power and a production exponent.",
  "Unlock Underworld, Souls, and World Survey. Grants ×1e25 fixed Power.",
  "Unlock Sky World, Aether, and Momentum. Grants ×1e55 fixed Power.",
  "Unlock Echoes and the Relic Forge. Grants ×1e80 fixed Power.",
  "Unlock Stardust and the Astral Lab. Grants ×1e120 fixed Power.",
  "Unlock Space and Star Essence. Grants ×1e180 fixed Power.",
  "Unlock the Nebula Foundry. Grants ×1e260 fixed Power.",
  "Unlock the Reality Archive. Grants ×1e380 fixed Power.",
  "Unlock the Continuum. Grants ×1e600 fixed Power.",
];

const PRESTIGE_LOG_BONUSES = [5, 12, 25, 55, 80, 120, 180, 260, 380, 600];
// Grows by a flat +0.25 per Prestige instead of large uneven jumps, so no single
// reset dwarfs the value of fixed multipliers earned from trees/runes/relics.
const PRESTIGE_EXPONENTS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5];

const RUNE_GROUPS = [
  { id: "basic", name: "Basic", cost: bn(25), unlock: () => state.prestige >= 1 },
  { id: "refined", name: "Refined", cost: bn("1e4"), unlock: () => treeLevel("unlockRefined") > 0 },
  { id: "arcane", name: "Arcane", cost: bn("1e7"), unlock: () => treeLevel("unlockArcane") > 0 },
  { id: "cosmic", name: "Cosmic", cost: bn("1e10"), unlock: () => treeLevel("unlockCosmic") > 0 },
  { id: "transcendent", name: "Transcendent", cost: bn("1e14"), unlock: () => treeLevel("unlockTranscendent") > 0 },
];

const RUNE_EFFECT_TYPES = ["power", "generator", "rebirth", "prism", "core", "souls", "aether", "survey", "luck", "copies"];
const RUNE_NAMES = {
  basic: ["Pulse", "Current", "Coil", "Beacon", "Circuit", "Anchor", "Relay", "Drive", "Conduit", "Surge"],
  refined: ["Tempered Pulse", "Silver Current", "Resonant Coil", "Focused Beacon", "Dense Circuit", "Runic Anchor", "Prismatic Relay", "Refined Drive", "Crystal Conduit", "Controlled Surge"],
  arcane: ["Arcane Pulse", "Mystic Current", "Astral Coil", "Oracle Beacon", "Glyph Circuit", "Soul Anchor", "Ether Relay", "Mana Drive", "Veiled Conduit", "Spell Surge"],
  cosmic: ["Solar Pulse", "Void Current", "Gravity Coil", "Nova Beacon", "Orbit Circuit", "Stellar Anchor", "Nebula Relay", "Cosmic Drive", "Quasar Conduit", "Supernova Surge"],
  transcendent: ["Infinite Pulse", "Causal Current", "Eternal Coil", "Origin Beacon", "Reality Circuit", "Continuum Anchor", "Absolute Relay", "Transcendent Drive", "Paradox Conduit", "Final Surge"],
};

const RELICS = [
  { id: "engine", name: "Clockwork Engine", text: "×3 Power per level", weight: 38 },
  { id: "lens", name: "Prismatic Lens", text: "×2 Prism rate per level", weight: 26 },
  { id: "compass", name: "Survey Compass", text: "×1.5 Survey speed per level", weight: 18 },
  { id: "core", name: "Core Crucible", text: "×2 Core output per level", weight: 12 },
  { id: "crown", name: "Continuum Crown", text: "+0.03 Power exponent per level", weight: 6 },
];

const SURVEYS = [
  { id: "greenbelt", name: "Greenbelt Circuit", duration: 300, reward: { surveyData: bn(10), prisms: bn(30) }, desc: "A short route that returns Survey Data and Prisms." },
  { id: "faultline", name: "Faultline Descent", duration: 900, reward: { surveyData: bn(40), coreShards: bn(20) }, desc: "A deep route focused on Core resources." },
  { id: "cloudring", name: "Cloudring Transect", duration: 1800, reward: { surveyData: bn(120), aether: bn(100) }, desc: "A long aerial route with Aether rewards." },
  { id: "echozone", name: "Echozone Recovery", duration: 3600, reward: { surveyData: bn(300), echoes: bn(50) }, desc: "Recovers Echoes for the Relic Forge." },
  { id: "starfall", name: "Starfall Boundary", duration: 7200, reward: { surveyData: bn(800), stardust: bn(200) }, desc: "A late route that returns Stardust." },
];

const ACHIEVEMENTS = [
  { id: "power1", name: "First Spark", desc: "Reach 100 Power.", check: () => state.power.gte(100) },
  { id: "power2", name: "Overloaded", desc: "Reach 1e6 Power.", check: () => state.power.gte("1e6") },
  { id: "power3", name: "Power Surge", desc: "Reach 1e18 Power.", check: () => state.power.gte("1e18") },
  { id: "rebirth1", name: "Reborn", desc: "Perform your first Rebirth.", check: () => state.totalRebirths.gt(0) },
  { id: "rebirth2", name: "Cycle Breaker", desc: "Reach 100 total Rebirths.", check: () => state.totalRebirths.gte(100) },
  { id: "prestige1", name: "New Foundations", desc: "Reach Prestige 1.", check: () => state.prestige >= 1 },
  { id: "prestige5", name: "Halfway to Everything", desc: "Reach Prestige 5.", check: () => state.prestige >= 5 },
  { id: "prestige10", name: "The Continuum", desc: "Reach Prestige 10.", check: () => state.prestige >= 10 },
  { id: "runes10", name: "Rune Collector", desc: "Roll 10 Runes total.", check: () => state.totalRunesRolled >= 10 },
  { id: "runes100", name: "Rune Hoarder", desc: "Roll 100 Runes total.", check: () => state.totalRunesRolled >= 100 },
  { id: "relics1", name: "First Forge", desc: "Forge your first Relic.", check: () => state.totalRelicsForged >= 1 },
  { id: "relics25", name: "Relic Master", desc: "Forge 25 Relics.", check: () => state.totalRelicsForged >= 25 },
  { id: "surveys1", name: "Surveyor", desc: "Complete a World Survey.", check: () => state.totalSurveysCompleted >= 1 },
  { id: "surveys10", name: "Cartographer", desc: "Complete 10 World Surveys.", check: () => state.totalSurveysCompleted >= 10 },
  { id: "core1", name: "Core Ignition", desc: "Activate the Core for the first time.", check: () => state.totalCoreActivations >= 1 },
];

const translations = {
  en: {},
  id: { main: "UTAMA", system: "SISTEM", overworld: "Dunia Atas", rebirth: "Kelahiran Kembali", prestige: "Prestise", trees: "Pohon", settings: "Pengaturan", power: "Daya", rebirths: "Rebirth", prisms: "Prisma", powerPerSecond: "Daya per detik", production: "PRODUKSI", generator: "Generator", output: "Produksi", nextCost: "Harga berikutnya", buyOne: "Beli 1", buyMax: "Beli Maks", fixedUpgrades: "UPGRADE TETAP", language: "Bahasa", notation: "Notasi" },
  zh: { main: "主要", system: "系统", overworld: "主世界", rebirth: "重生", prestige: "威望", trees: "升级树", settings: "设置", power: "能量", rebirths: "重生点", prisms: "棱晶", powerPerSecond: "每秒能量", production: "生产", generator: "发电机", output: "产量", nextCost: "下次费用", buyOne: "购买 1", buyMax: "全部购买", language: "语言", notation: "计数法" },
  ko: { main: "메인", system: "시스템", overworld: "오버월드", rebirth: "환생", prestige: "프레스티지", trees: "트리", settings: "설정", power: "파워", rebirths: "환생", prisms: "프리즘", powerPerSecond: "초당 파워", production: "생산", generator: "발전기", output: "출력", nextCost: "다음 비용", buyOne: "1개 구매", buyMax: "최대 구매", language: "언어", notation: "표기법" },
  ja: { main: "メイン", system: "システム", overworld: "オーバーワールド", rebirth: "リバース", prestige: "プレステージ", trees: "ツリー", settings: "設定", power: "パワー", rebirths: "リバース", prisms: "プリズム", powerPerSecond: "毎秒パワー", production: "生産", generator: "ジェネレーター", output: "出力", nextCost: "次のコスト", buyOne: "1個購入", buyMax: "最大購入", language: "言語", notation: "表記" },
};

const bigFields = ["power", "rebirths", "totalRebirths", "prisms", "sparks", "coreShards", "souls", "surveyData", "aether", "echoes", "stardust", "starEssence", "nebulaEssence", "realityFragments", "continuumCores"];

function defaultState() {
  return {
    saveVersion: SAVE_VERSION,
    power: bn(0), rebirths: bn(0), totalRebirths: bn(0), prisms: bn(0), sparks: bn(0), coreShards: bn(0), souls: bn(0), surveyData: bn(0), aether: bn(0), echoes: bn(0), stardust: bn(0), starEssence: bn(0), nebulaEssence: bn(0), realityFragments: bn(0), continuumCores: bn(0),
    generatorLevel: 0, amplifierLevel: 0,
    rebirthPowerLevel: 0, rebirthGainLevel: 0, generatorMasteryLevel: 0,
    prestige: 0,
    prismProgress: 0,
    sparkCollectorLevel: 0, sparkPowerLevel: 0,
    coreActive: false, coreRateLevel: 0, corePowerLevel: 0,
    soulHarvesterLevel: 0, soulPowerLevel: 0,
    aetherHarvesterLevel: 0, aetherPowerLevel: 0,
    stardustCollectorLevel: 0, stardustPowerLevel: 0,
    starCollectorLevel: 0, starPowerLevel: 0,
    nebulaCollectorLevel: 0, nebulaPowerLevel: 0,
    realityCollectorLevel: 0, realityPowerLevel: 0,
    continuumCollectorLevel: 0, continuumPowerLevel: 0,
    momentumSeconds: 0,
    trees: {}, runeCopies: {}, relicLevels: {}, achievements: {},
    totalRunesRolled: 0, totalRelicsForged: 0, totalSurveysCompleted: 0, totalCoreActivations: 0,
    activeRuneGroup: "basic", activeTree: "power",
    activeSurvey: null,
    notation: "mixed", language: "en", developerUnlocked: false,
    lastUpdateAt: Date.now(), lastSavedAt: Date.now(),
  };
}

let state = defaultState();
let currentView = "overworld";
let toastTimer = null;
let frameHandle = null;
let lastRenderAt = 0;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    const fresh = defaultState();
    state = { ...fresh, ...parsed };
    for (const field of bigFields) state[field] = bn(parsed[field] ?? fresh[field]);
    state.trees = parsed.trees && typeof parsed.trees === "object" ? parsed.trees : {};
    state.runeCopies = parsed.runeCopies && typeof parsed.runeCopies === "object" ? parsed.runeCopies : {};
    state.relicLevels = parsed.relicLevels && typeof parsed.relicLevels === "object" ? parsed.relicLevels : {};
    state.achievements = parsed.achievements && typeof parsed.achievements === "object" ? parsed.achievements : {};
    state.prestige = Math.max(0, Math.min(10, Math.floor(Number(state.prestige) || 0)));
    state.lastUpdateAt = Number(parsed.lastUpdateAt || parsed.lastSavedAt || Date.now());
    const elapsed = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - state.lastUpdateAt) / 1000));
    processProduction(elapsed);
    state.lastUpdateAt = Date.now();
    return elapsed;
  } catch (error) {
    console.error("Save load failed", error);
    state = defaultState();
    return 0;
  }
}

function saveGame(showToast = false) {
  state.lastSavedAt = Date.now();
  state.lastUpdateAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  $("#last-save-text").textContent = `Last saved: ${new Date(state.lastSavedAt).toLocaleTimeString()} · Autosave: 1 minute · Offline limit: 28 days.`;
  if (showToast) showToastMessage("Game saved");
}

function format(value, decimals = 2) {
  const x = bn(value);
  if (x.isZero()) return "0";
  const notation = state.notation;
  if (notation === "scientific") return `${x.m.toFixed(decimals)}e${x.e}`;
  if (notation === "mixed" && x.e >= 12) return `${x.m.toFixed(decimals)}e${x.e}`;
  if (x.e < 6) {
    const number = x.toNumber();
    return Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits: number < 10 ? 2 : number < 100 ? 1 : 0 }) : `${x.m.toFixed(decimals)}e${x.e}`;
  }
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const group = Math.floor(x.e / 3);
  if (group < suffixes.length && notation === "standard") {
    const scaled = x.m * 10 ** (x.e - group * 3);
    return `${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${suffixes[group]}`;
  }
  return `${x.m.toFixed(decimals)}e${x.e}`;
}

function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const d = Math.floor(seconds / 86400); seconds %= 86400;
  const h = Math.floor(seconds / 3600); seconds %= 3600;
  const m = Math.floor(seconds / 60); const s = seconds % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function treeLevel(id) { return Number(state.trees[id] || 0); }
function relicLevel(id) { return Number(state.relicLevels[id] || 0); }

function refreshAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (!state.achievements[a.id] && a.check()) {
      state.achievements[a.id] = true;
      changed = true;
      showToastMessage(`Achievement unlocked: ${a.name}`);
    }
  }
  return changed;
}
function unlockedAchievementCount() { return Object.keys(state.achievements).length; }
// Purely a small, steadily-stacking bonus — the reward for exploring the game's
// systems rather than a progression requirement in its own right.
function achievementMultiplier() { return bn(1.01).pow(unlockedAchievementCount()); }

function prestigeFixedMultiplier() {
  let log = 0;
  for (let i = 0; i < state.prestige; i += 1) log += PRESTIGE_LOG_BONUSES[i];
  return pow10(log);
}

function getPowerExponent() {
  let exponent = PRESTIGE_EXPONENTS[state.prestige] || PRESTIGE_EXPONENTS.at(-1);
  exponent += treeLevel("powerExponent") * 0.08;
  exponent += relicLevel("crown") * 0.03;
  exponent += state.nebulaPowerLevel * 0.04;
  exponent += state.continuumPowerLevel * 0.08;
  return exponent;
}

function getRuneLevelFromCopies(copies) {
  let level = 0;
  let spent = 0;
  let requirement = 1;
  while (copies >= spent + requirement && level < 1000) {
    spent += requirement;
    level += 1;
    requirement = Math.ceil(requirement * 1.55 + 1);
  }
  return { level, current: copies - spent, needed: requirement };
}

function runeAggregate(type) {
  let total = 0;
  for (const group of RUNE_GROUPS) {
    RUNE_NAMES[group.id].forEach((name, index) => {
      if (RUNE_EFFECT_TYPES[index] !== type) return;
      const copies = Number(state.runeCopies[`${group.id}:${index}`] || 0);
      const { level } = getRuneLevelFromCopies(copies);
      const groupPower = RUNE_GROUPS.findIndex((g) => g.id === group.id) + 1;
      total += level * groupPower;
    });
  }
  return total;
}

function fixedPowerMultiplier() {
  let result = bn(1);
  result = result.mul(pow10(state.amplifierLevel));
  result = result.mul(pow10(state.rebirthPowerLevel));
  result = result.mul(bn(3).pow(state.generatorMasteryLevel));
  result = result.mul(prestigeFixedMultiplier());
  result = result.mul(pow10(treeLevel("powerNode") * 2));
  result = result.mul(pow10(state.sparkPowerLevel * 3));
  result = result.mul(pow10(state.corePowerLevel * 10));
  result = result.mul(pow10(state.soulPowerLevel * 15));
  result = result.mul(pow10(state.aetherPowerLevel * 22));
  result = result.mul(pow10(state.stardustPowerLevel * 35));
  result = result.mul(pow10(state.starPowerLevel * 50));
  result = result.mul(pow10(state.realityPowerLevel * 70));
  result = result.mul(pow10(state.continuumPowerLevel * 100));
  result = result.mul(bn(2).pow(runeAggregate("power")));
  result = result.mul(bn(3).pow(relicLevel("engine")));
  result = result.mul(achievementMultiplier());
  if (momentumUnlocked()) result = result.mul(getMomentumMultiplier());
  return result;
}

function getMomentumMultiplier() {
  const cap = 100 + treeLevel("momentum") * 100;
  const progress = Math.min(1, state.momentumSeconds / 3600);
  return bn(1 + (cap - 1) * progress);
}

function momentumUnlocked() { return state.prestige >= 4 || treeLevel("momentum") > 0; }

function getGeneratorBase() {
  const level = Math.max(0, state.generatorLevel);
  const base = bn(1 + level).pow(1.25);
  return base.mul(bn(2).pow(runeAggregate("generator")));
}

function otherProductionFactor() {
  if (!state.coreActive) return 1;
  const stabilizer = treeLevel("coreStabilizer");
  if (stabilizer >= 2) return 0.9;
  if (stabilizer >= 1) return 0.75;
  return 0.5;
}

function getPowerPerSecond() {
  const raw = getGeneratorBase().mul(fixedPowerMultiplier()).mul(otherProductionFactor());
  return raw.pow(getPowerExponent());
}

function getGeneratorCost(level = state.generatorLevel) { return bn(10).mul(bn(1.12).pow(level)); }
function getGeneratorBulkCost(amount) {
  if (amount <= 0) return bn(0);
  const first = getGeneratorCost(state.generatorLevel);
  const series = bn(1.12).pow(amount).sub(1).div(0.12);
  return first.mul(series);
}
function getGeneratorMaxBuy() {
  const first = getGeneratorCost();
  if (!state.power.gte(first)) return 0;
  const ratio = state.power.mul(0.12).div(first).add(1);
  const amount = Math.floor(ratio.log10() / Math.log10(1.12));
  return Math.max(1, Math.min(1_000_000_000, amount));
}

function getAmplifierCost(level = state.amplifierLevel) { return pow10(6 + level * 3); }
function getAmplifierMaxBuy() {
  if (!state.power.gte(getAmplifierCost())) return 0;
  return Math.max(1, Math.floor((state.power.log10() - 6) / 3) - state.amplifierLevel + 1);
}

function getRebirthBaseGain() { return state.power.div(1000).floor(); }
function getRebirthGain() {
  let gain = getRebirthBaseGain();
  gain = gain.mul(bn(2).pow(state.rebirthGainLevel));
  gain = gain.mul(bn(2).pow(treeLevel("rebirthNode")));
  gain = gain.mul(bn(1.5).pow(runeAggregate("rebirth")));
  return gain.floor();
}

function rebirthUpgradeCost(type, level) {
  if (type === "power") return pow10(1 + level * 3);
  if (type === "gain") return pow10(2 + level * 4);
  return pow10(3 + level * 5);
}

function getPrismRate() {
  let rate = 1 / 60;
  rate *= 2 ** treeLevel("prismRate");
  rate *= 2 ** relicLevel("lens");
  rate *= 1.25 ** runeAggregate("prism");
  return rate;
}

function getCoreRate() {
  if (!state.coreActive || state.prestige < 2) return 0;
  return (0.1 + state.coreRateLevel * 0.25) * (2 ** runeAggregate("core")) * (2 ** relicLevel("core"));
}
function getSparkRate() { return state.prestige >= 1 ? state.sparkCollectorLevel * (1.5 ** runeAggregate("copies")) : 0; }
function getSoulRate() { return state.prestige >= 3 ? state.soulHarvesterLevel * (1.5 ** runeAggregate("souls")) : 0; }
function getMomentumCharge() { return momentumUnlocked() ? Math.min(1, state.momentumSeconds / 3600) : 0; }
function getAetherRate() {
  if (state.prestige < 4) return 0;
  const base = state.aetherHarvesterLevel * (1.5 ** runeAggregate("aether"));
  // Ramps from 25% to 100% as Momentum charges, so Sky World rewards keeping
  // a session running rather than just being another buy-two-things tier.
  const momentumFactor = momentumUnlocked() ? 0.25 + 0.75 * getMomentumCharge() : 1;
  return base * momentumFactor;
}
function getEchoRate() { return state.prestige >= 5 ? 0.05 : 0; }
function getStardustRate() { return state.prestige >= 6 ? state.stardustCollectorLevel : 0; }
function getStarRate() { return state.prestige >= 7 ? state.starCollectorLevel : 0; }
function getNebulaRate() { return state.prestige >= 8 ? state.nebulaCollectorLevel : 0; }
function getRealityRate() { return state.prestige >= 9 ? state.realityCollectorLevel : 0; }
function getContinuumRate() { return state.prestige >= 10 ? state.continuumCollectorLevel : 0; }

function processProduction(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const factor = otherProductionFactor();
  state.power = state.power.add(getPowerPerSecond().mul(seconds));
  state.prisms = state.prisms.add(getPrismRate() * seconds * factor);
  state.prismProgress = (state.prismProgress + seconds * getPrismRate()) % 1;
  state.sparks = state.sparks.add(getSparkRate() * seconds * factor);
  state.coreShards = state.coreShards.add(getCoreRate() * seconds);
  state.souls = state.souls.add(getSoulRate() * seconds * factor);
  state.aether = state.aether.add(getAetherRate() * seconds * factor);
  state.echoes = state.echoes.add(getEchoRate() * seconds * factor);
  state.stardust = state.stardust.add(getStardustRate() * seconds * factor);
  state.starEssence = state.starEssence.add(getStarRate() * seconds * factor);
  state.nebulaEssence = state.nebulaEssence.add(getNebulaRate() * seconds * factor);
  state.realityFragments = state.realityFragments.add(getRealityRate() * seconds * factor);
  state.continuumCores = state.continuumCores.add(getContinuumRate() * seconds * factor);
  if (momentumUnlocked()) state.momentumSeconds = Math.min(3600, state.momentumSeconds + seconds);
  processSurvey(seconds);
  processSoulDecay(seconds);
  refreshAchievements();
}

// Souls above a small buffer (three purchases' worth of the next Soul Furnace
// level) decay steadily. This gives the Underworld its own decision, like the
// Core: bank a little for safety, but don't let Souls stockpile indefinitely.
function getSoulDecayThreshold() {
  return bn(100).mul(pow10(state.soulPowerLevel * 2)).mul(3);
}
function getSoulDecayRate() { return 0.02; }
function processSoulDecay(seconds) {
  if (state.prestige < 3) return;
  const threshold = getSoulDecayThreshold();
  if (state.souls.lte(threshold)) return;
  const excess = state.souls.sub(threshold);
  state.souls = state.souls.sub(excess.mul(Math.min(1, getSoulDecayRate() * seconds)));
}

function processSurvey(seconds) {
  if (!state.activeSurvey) return;
  state.activeSurvey.remaining -= seconds * (1.5 ** treeLevel("surveySpeed")) * (1.5 ** runeAggregate("survey")) * (1.5 ** relicLevel("compass"));
  if (state.activeSurvey.remaining > 0) return;
  const route = SURVEYS.find((x) => x.id === state.activeSurvey.id);
  if (route) {
    for (const [key, amount] of Object.entries(route.reward)) state[key] = state[key].add(amount);
    state.totalSurveysCompleted += 1;
    showToastMessage(`${route.name} completed`);
  }
  state.activeSurvey = null;
}

function buyGenerator(max = false) {
  const amount = max ? getGeneratorMaxBuy() : 1;
  if (amount <= 0) return;
  const cost = getGeneratorBulkCost(amount);
  if (!state.power.gte(cost)) return;
  state.power = state.power.sub(cost);
  state.generatorLevel += amount;
  render();
}

function buyAmplifier(max = false) {
  const amount = max ? getAmplifierMaxBuy() : 1;
  if (amount <= 0) return;
  let bought = 0;
  while (bought < amount && state.power.gte(getAmplifierCost())) {
    state.power = state.power.sub(getAmplifierCost());
    state.amplifierLevel += 1;
    bought += 1;
  }
  render();
}

function performRebirth() {
  const gain = getRebirthGain();
  if (gain.lte(0)) return;
  state.rebirths = state.rebirths.add(gain);
  state.totalRebirths = state.totalRebirths.add(gain);
  state.power = bn(0);
  state.generatorLevel = 0;
  state.amplifierLevel = 0;
  state.momentumSeconds = 0;
  showToastMessage(`Gained ${format(gain)} Rebirths`);
  render();
}

function buyRebirthUpgrade(type, max = false) {
  const levelKey = type === "power" ? "rebirthPowerLevel" : type === "gain" ? "rebirthGainLevel" : "generatorMasteryLevel";
  let bought = 0;
  do {
    const cost = rebirthUpgradeCost(type, state[levelKey]);
    if (!state.rebirths.gte(cost)) break;
    state.rebirths = state.rebirths.sub(cost);
    state[levelKey] += 1;
    bought += 1;
  } while (max && bought < 1000);
  render();
}

function getPrestigeTarget() {
  let target = state.prestige;
  for (let i = state.prestige; i < PRESTIGE_REQUIREMENTS.length; i += 1) {
    if (state.power.gte(PRESTIGE_REQUIREMENTS[i])) target = i + 1;
    else break;
  }
  return target;
}

function performPrestige() {
  const target = getPrestigeTarget();
  if (target <= state.prestige) return;
  const old = state.prestige;
  state.prestige = target;
  state.power = bn(0); state.rebirths = bn(0); state.generatorLevel = 0; state.amplifierLevel = 0;
  state.rebirthPowerLevel = 0; state.rebirthGainLevel = 0; state.generatorMasteryLevel = 0; state.momentumSeconds = 0;
  for (let p = old + 1; p <= target; p += 1) applyPrestigeGrant(p);
  showToastMessage(`Prestige ${target} reached`);
  render();
}

function applyPrestigeGrant(level) {
  if (level === 1) state.prisms = state.prisms.add(100);
  if (level === 2) state.sparks = state.sparks.add(25);
  if (level === 3) state.coreShards = state.coreShards.add(25);
  if (level === 4) state.souls = state.souls.add(100);
  if (level === 5) state.echoes = state.echoes.add(100);
  if (level === 6) state.stardust = state.stardust.add(100);
  if (level === 7) state.starEssence = state.starEssence.add(100);
  if (level === 8) state.nebulaEssence = state.nebulaEssence.add(100);
  if (level === 9) state.realityFragments = state.realityFragments.add(100);
  if (level === 10) state.continuumCores = state.continuumCores.add(10);
}

const TREE_DEFS = {
  power: [
    { id: "powerNode", name: "Power Conduction", desc: "×100 fixed Power per level.", max: 20, currency: "power", cost: (l) => pow10(8 + l * 8), req: () => true },
    { id: "rebirthNode", name: "Rebirth Compression", desc: "×2 Rebirth gain per level.", max: 20, currency: "rebirths", cost: (l) => pow10(6 + l * 6), req: () => true },
    { id: "unlockRefined", name: "Refined Rune Theory", desc: "Unlock the Refined Rune group.", max: 1, currency: "rebirths", cost: () => bn("1e12"), req: () => state.prestige >= 1 },
    { id: "coreStabilizer", name: "Core Stabilizer", desc: "Reduces the Core penalty from 50% to 25%, then 10%.", max: 2, currency: "coreShards", cost: (l) => bn(100).mul(pow10(l * 3)), req: () => state.prestige >= 2 },
    { id: "unlockArcane", name: "Arcane Rune Theory", desc: "Unlock the Arcane Rune group.", max: 1, currency: "souls", cost: () => bn("1e6"), req: () => state.prestige >= 3 },
    { id: "surveySpeed", name: "Survey Logistics", desc: "×1.5 Survey speed per level.", max: 10, currency: "surveyData", cost: (l) => bn(100).mul(pow10(l)), req: () => state.prestige >= 3 },
    { id: "unlockCosmic", name: "Cosmic Rune Theory", desc: "Unlock the Cosmic Rune group.", max: 1, currency: "stardust", cost: () => bn("1e4"), req: () => state.prestige >= 6 },
  ],
  prism: [
    { id: "prismRate", name: "Prism Refraction", desc: "×2 Prism generation per level.", max: 12, currency: "prisms", cost: (l) => bn(100).mul(pow10(l * 2)), req: () => true },
    { id: "runeLuck", name: "Rune Fortune", desc: "Improves high-tier Rune roll weights.", max: 10, currency: "prisms", cost: (l) => bn("1e4").mul(pow10(l * 3)), req: () => state.prestige >= 1 },
    { id: "duplicateChance", name: "Rune Echo", desc: "Chance for an extra Rune copy per roll.", max: 10, currency: "prisms", cost: (l) => bn("1e6").mul(pow10(l * 3)), req: () => state.prestige >= 1 },
    { id: "momentum", name: "Momentum Reservoir", desc: "Unlocks a time-growing multiplier capped at ×100, plus ×100 cap per level.", max: 5, currency: "prisms", cost: (l) => pow10(8 + l * 4), req: () => state.prestige >= 3 },
    { id: "unlockPowerPrism", name: "Power Prism Gateway", desc: "Unlock the Power Prism Tree.", max: 1, currency: "prisms", cost: () => bn("1e9"), req: () => state.prestige >= 6 },
  ],
  powerPrism: [
    { id: "powerExponent", name: "Prismatic Exponent", desc: "+0.08 Power exponent per level.", max: 10, currency: "prisms", cost: (l) => pow10(12 + l * 5), req: () => treeLevel("unlockPowerPrism") > 0 },
    { id: "unlockTranscendent", name: "Transcendent Rune Theory", desc: "Unlock the Transcendent Rune group.", max: 1, currency: "starEssence", cost: () => bn("1e5"), req: () => treeLevel("unlockPowerPrism") > 0 && state.prestige >= 7 },
    { id: "continuumLink", name: "Continuum Link", desc: "×1e50 fixed Power per level.", max: 10, currency: "continuumCores", cost: (l) => bn(1 + l * 2), req: () => state.prestige >= 10 },
  ],
};

function buyTreeNode(id) {
  const node = Object.values(TREE_DEFS).flat().find((x) => x.id === id);
  if (!node || !node.req()) return;
  const level = treeLevel(id);
  if (level >= node.max) return;
  const cost = node.cost(level);
  if (!state[node.currency].gte(cost)) return;
  state[node.currency] = state[node.currency].sub(cost);
  state.trees[id] = level + 1;
  render();
}

function getRuneLuck() { return treeLevel("runeLuck") * 0.03 + runeAggregate("luck") * 0.01; }
function rollRune(count) {
  const group = RUNE_GROUPS.find((g) => g.id === state.activeRuneGroup && g.unlock());
  if (!group) return;
  const totalCost = group.cost.mul(count);
  if (!state.prisms.gte(totalCost)) return;
  state.prisms = state.prisms.sub(totalCost);
  const results = [];
  for (let roll = 0; roll < count; roll += 1) {
    const luck = getRuneLuck();
    const weights = RUNE_NAMES[group.id].map((_, index) => Math.max(0.2, 10 - index * 0.75 + luck * index * 2));
    let random = Math.random() * weights.reduce((a, b) => a + b, 0);
    let chosen = 0;
    for (let i = 0; i < weights.length; i += 1) { random -= weights[i]; if (random <= 0) { chosen = i; break; } }
    const key = `${group.id}:${chosen}`;
    state.runeCopies[key] = Number(state.runeCopies[key] || 0) + 1;
    if (Math.random() < treeLevel("duplicateChance") * 0.03 + runeAggregate("copies") * 0.005) state.runeCopies[key] += 1;
    state.totalRunesRolled += 1;
    results.push(RUNE_NAMES[group.id][chosen]);
  }
  $("#rune-roll-result").textContent = count === 1 ? `Rolled ${results[0]}` : `Rolled ${count} Runes`;
  render();
}

function forgeRelic() {
  const cost = bn(100).mul(pow10(Object.values(state.relicLevels).reduce((a, b) => a + Number(b || 0), 0) * 0.25));
  if (!state.echoes.gte(cost)) return;
  state.echoes = state.echoes.sub(cost);
  const luck = treeLevel("relicLuck") * 0.03;
  const adjusted = RELICS.map((r, i) => Math.max(1, r.weight + luck * i * 10));
  let random = Math.random() * adjusted.reduce((a, b) => a + b, 0);
  let relic = RELICS[0];
  for (let i = 0; i < adjusted.length; i += 1) { random -= adjusted[i]; if (random <= 0) { relic = RELICS[i]; break; } }
  state.relicLevels[relic.id] = relicLevel(relic.id) + 1;
  state.totalRelicsForged += 1;
  $("#relic-result").textContent = `Forged ${relic.name}`;
  render();
}

// Converts one level of an unwanted Relic back into Echoes at half the going
// forge rate, so a bad gacha spread can be reshaped instead of sitting dead.
function salvageRelic(id) {
  const level = relicLevel(id);
  if (level <= 0) return;
  const totalLevels = Object.values(state.relicLevels).reduce((a, b) => a + Number(b || 0), 0);
  const refund = bn(100).mul(pow10(Math.max(0, totalLevels - 1) * 0.25)).mul(0.5);
  state.relicLevels[id] = level - 1;
  state.echoes = state.echoes.add(refund);
  showToastMessage(`Salvaged 1 level for ${format(refund)} Echoes`);
  render();
}

function startSurvey(id) {
  if (state.activeSurvey) return;
  const route = SURVEYS.find((x) => x.id === id);
  if (!route) return;
  state.activeSurvey = { id, remaining: route.duration };
  render();
}

function buyWorldUpgrade(system, type) {
  const defs = {
    spark: { producerKey: "sparkCollectorLevel", producerCurrency: "power", producerCost: (l) => pow10(20 + l * 4), powerKey: "sparkPowerLevel", powerCurrency: "sparks", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    core: { producerKey: "coreRateLevel", producerCurrency: "power", producerCost: (l) => pow10(90 + l * 8), powerKey: "corePowerLevel", powerCurrency: "coreShards", powerCost: (l) => bn(10).mul(pow10(l * 2)) },
    soul: { producerKey: "soulHarvesterLevel", producerCurrency: "rebirths", producerCost: (l) => pow10(50 + l * 6), powerKey: "soulPowerLevel", powerCurrency: "souls", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    aether: { producerKey: "aetherHarvesterLevel", producerCurrency: "souls", producerCost: (l) => pow10(8 + l * 4), powerKey: "aetherPowerLevel", powerCurrency: "aether", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    stardust: { producerKey: "stardustCollectorLevel", producerCurrency: "aether", producerCost: (l) => pow10(10 + l * 4), powerKey: "stardustPowerLevel", powerCurrency: "stardust", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    star: { producerKey: "starCollectorLevel", producerCurrency: "stardust", producerCost: (l) => pow10(6 + l * 3), powerKey: "starPowerLevel", powerCurrency: "starEssence", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    nebula: { producerKey: "nebulaCollectorLevel", producerCurrency: "starEssence", producerCost: (l) => pow10(6 + l * 3), powerKey: "nebulaPowerLevel", powerCurrency: "nebulaEssence", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    reality: { producerKey: "realityCollectorLevel", producerCurrency: "nebulaEssence", producerCost: (l) => pow10(6 + l * 3), powerKey: "realityPowerLevel", powerCurrency: "realityFragments", powerCost: (l) => bn(100).mul(pow10(l * 2)) },
    continuum: { producerKey: "continuumCollectorLevel", producerCurrency: "realityFragments", producerCost: (l) => pow10(6 + l * 3), powerKey: "continuumPowerLevel", powerCurrency: "continuumCores", powerCost: (l) => bn(1 + l * 2) },
  };
  const def = defs[system]; if (!def) return;
  const key = type === "producer" ? def.producerKey : def.powerKey;
  const currency = type === "producer" ? def.producerCurrency : def.powerCurrency;
  const cost = (type === "producer" ? def.producerCost : def.powerCost)(state[key]);
  if (!state[currency].gte(cost)) return;
  state[currency] = state[currency].sub(cost);
  state[key] += 1;
  render();
}

function genericWorldCards(container, system, currency, producerName, powerName, producerLevelKey, powerLevelKey, producerCost, powerCost, producerEffect, powerEffect) {
  container.innerHTML = `
    <article class="game-card"><div class="card-icon">＋</div><div class="card-content"><div class="card-title-row"><h3>${producerName}</h3><span class="level-pill">Lv. ${state[producerLevelKey]}</span></div><p>Generates ${currency} continuously through an explicit producer.</p><div class="stat-row"><span><small>Rate</small><b>${producerEffect}</b></span><span><small>Cost</small><b>${format(producerCost)} ${currency === "Sparks" ? "Power" : getProducerCostCurrency(system)}</b></span></div><div class="button-row"><button class="action-button" data-world-buy="${system}:producer">Buy 1</button></div></div></article>
    <article class="game-card"><div class="card-icon">×</div><div class="card-content"><div class="card-title-row"><h3>${powerName}</h3><span class="level-pill">Lv. ${state[powerLevelKey]}</span></div><p>Purchases a fixed Power effect. Currency balances alone provide no multiplier.</p><div class="stat-row"><span><small>Effect</small><b>${powerEffect}</b></span><span><small>Cost</small><b>${format(powerCost)} ${currency}</b></span></div><div class="button-row"><button class="action-button" data-world-buy="${system}:power">Buy 1</button></div></div></article>`;
}

function getProducerCostCurrency(system) {
  return { core: "Power", soul: "Rebirths", aether: "Souls", stardust: "Aether", star: "Stardust", nebula: "Star Essence", reality: "Nebula Essence", continuum: "Reality Fragments" }[system] || "Power";
}

function showView(view) {
  currentView = view;
  $$("[data-view-panel]").forEach((panel) => { const active = panel.dataset.viewPanel === view; panel.hidden = !active; panel.classList.toggle("active", active); });
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  render();
}

function showToastMessage(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderNavigation() {
  const entries = [];
  if (state.prestige >= 1) entries.push(["sparks", "ϟ", "Sparks"], ["runes", "◇", "Runes"]);
  if (state.prestige >= 2) entries.push(["core", "⬟", "The Core"]);
  if (state.prestige >= 3) entries.push(["underworld", "◆", "Underworld"], ["exploration", "⌖", "World Survey"]);
  if (state.prestige >= 4) entries.push(["sky", "▲", "Sky World"]);
  if (state.prestige >= 5) entries.push(["relics", "◈", "Relic Forge"]);
  if (state.prestige >= 6) entries.push(["astral", "✧", "Astral Lab"]);
  if (state.prestige >= 7) entries.push(["space", "✦", "Space"]);
  if (state.prestige >= 8) entries.push(["nebula", "☁", "Nebula Foundry"]);
  if (state.prestige >= 9) entries.push(["reality", "▣", "Reality Archive"]);
  if (state.prestige >= 10) entries.push(["continuum", "∞", "Continuum"]);
  $("#progressive-nav").innerHTML = entries.length ? `<p class="nav-label">UNLOCKED SYSTEMS</p>${entries.map(([view, icon, name]) => `<button class="nav-button ${currentView === view ? "active" : ""}" data-view="${view}" type="button"><span>${icon}</span><b>${name}</b></button>`).join("")}` : "";
  $$(".nav-button").forEach((button) => button.onclick = () => showView(button.dataset.view));
  const availableViews = new Set(["overworld", "rebirth", "prestige", "trees", "achievements", "settings", ...entries.map((x) => x[0])]);
  if (!availableViews.has(currentView)) showView("overworld");
}

function renderTop() {
  $("#top-power").textContent = format(state.power);
  $("#top-rebirths").textContent = format(state.rebirths);
  $("#top-prestige").textContent = `${state.prestige} / 10`;
  $("#top-prisms").textContent = format(state.prisms);
}

function renderOverworld() {
  const pps = getPowerPerSecond();
  $("#power-amount").textContent = format(state.power);
  $("#power-rate").textContent = `${format(pps)}/s`;
  $("#power-multiplier").textContent = `Fixed multiplier ×${format(fixedPowerMultiplier())} · exponent ^${getPowerExponent().toFixed(2)}`;
  $("#prism-amount").textContent = format(state.prisms);
  const secondsPerPrism = 1 / getPrismRate();
  const remaining = Math.max(0, secondsPerPrism * (1 - state.prismProgress));
  $("#prism-timer").textContent = `Next base Prism in ${Math.ceil(remaining)}s · ${format(getPrismRate(), 3)}/s`;
  $("#generator-level").textContent = `Lv. ${state.generatorLevel.toLocaleString()}`;
  $("#generator-output").textContent = `+${format(getGeneratorBase())} base/s`;
  $("#generator-cost").textContent = `${format(getGeneratorCost())} Power`;
  $("#buy-generator").disabled = !state.power.gte(getGeneratorCost());
  $("#buy-max-generator").disabled = getGeneratorMaxBuy() <= 0;
  $("#amplifier-level").textContent = `Lv. ${state.amplifierLevel}`;
  $("#amplifier-effect").textContent = `×${format(pow10(state.amplifierLevel))}`;
  $("#amplifier-cost").textContent = `${format(getAmplifierCost())} Power`;
  $("#buy-amplifier").disabled = !state.power.gte(getAmplifierCost());
  $("#buy-max-amplifier").disabled = getAmplifierMaxBuy() <= 0;
}

function renderRebirth() {
  const gain = getRebirthGain();
  $("#rebirth-gain").textContent = format(gain);
  $("#rebirth-preview").textContent = `${format(gain)} Rebirths`;
  $("#rebirth-button").disabled = gain.lte(0);
  const defs = [
    ["power", "Rebirth Conductor", "×10 fixed Power per level.", state.rebirthPowerLevel],
    ["gain", "Rebirth Compression", "×2 Rebirth gain per level.", state.rebirthGainLevel],
    ["mastery", "Generator Mastery", "×3 Generator output per level.", state.generatorMasteryLevel],
  ];
  $("#rebirth-upgrade-grid").innerHTML = defs.map(([id, name, desc, level]) => {
    const cost = rebirthUpgradeCost(id, level);
    return `<article class="game-card"><div class="card-content"><div class="card-title-row"><h3>${name}</h3><span class="level-pill">Lv. ${level}</span></div><p>${desc}</p><div class="stat-row"><span><small>Current</small><b>${id === "power" ? `×${format(pow10(level))}` : id === "gain" ? `×${format(bn(2).pow(level))}` : `×${format(bn(3).pow(level))}`}</b></span><span><small>Cost</small><b>${format(cost)} Rebirths</b></span></div><div class="button-row"><button class="action-button" data-rebirth-upgrade="${id}:one">Buy 1</button><button class="action-button secondary" data-rebirth-upgrade="${id}:max">Buy Max</button></div></div></article>`;
  }).join("");
  $$('[data-rebirth-upgrade]').forEach((button) => button.onclick = () => { const [id, mode] = button.dataset.rebirthUpgrade.split(":"); buyRebirthUpgrade(id, mode === "max"); });
}

function renderPrestige() {
  const target = getPrestigeTarget();
  $("#prestige-level").textContent = `${state.prestige} / 10`;
  $("#prestige-preview").textContent = target > state.prestige ? `Advance to Prestige ${target}` : "No Prestige available";
  const next = state.prestige < 10 ? PRESTIGE_REQUIREMENTS[state.prestige] : null;
  $("#prestige-next-requirement").textContent = next ? `Prestige ${state.prestige + 1} requires ${format(next)} Power.` : "Prestige 10 is the current maximum.";
  $("#prestige-button").disabled = target <= state.prestige;
  $("#prestige-reward-list").innerHTML = PRESTIGE_REQUIREMENTS.map((req, index) => `<article class="prestige-item ${state.prestige > index ? "unlocked" : state.prestige === index ? "current" : ""}"><div class="prestige-number">P${index + 1}</div><div><b>${format(req)} Power</b><small>${state.prestige > index ? " · Unlocked" : ""}</small></div><p>${PRESTIGE_REWARDS[index]}</p></article>`).join("");
}

function renderTrees() {
  $$('[data-tree-tab]').forEach((button) => button.classList.toggle("active", button.dataset.treeTab === state.activeTree));
  const defs = TREE_DEFS[state.activeTree];
  if (state.activeTree === "powerPrism" && treeLevel("unlockPowerPrism") === 0) {
    $("#tree-container").innerHTML = `<article class="tree-node locked"><h3>Power Prism Tree Locked</h3><p>Purchase Power Prism Gateway in the Prism Tree for 1e9 Prisms after Prestige 6.</p></article>`;
    return;
  }
  $("#tree-container").innerHTML = defs.map((node) => {
    const level = treeLevel(node.id); const unlocked = node.req(); const maxed = level >= node.max; const cost = maxed ? bn(0) : node.cost(level);
    return `<article class="tree-node ${!unlocked ? "locked" : ""} ${level > 0 ? "purchased" : ""}"><h3>${node.name}</h3><p>${node.desc}</p><div class="node-footer"><span>Lv. ${level}/${node.max}<br><small>${maxed ? "MAX" : `${format(cost)} ${node.currency}`}</small></span><button class="action-button" data-tree-buy="${node.id}" ${!unlocked || maxed ? "disabled" : ""}>${maxed ? "Maxed" : "Buy"}</button></div></article>`;
  }).join("");
  $$('[data-tree-buy]').forEach((button) => button.onclick = () => buyTreeNode(button.dataset.treeBuy));
}

function renderRunes() {
  const unlocked = RUNE_GROUPS.filter((g) => g.unlock());
  if (!unlocked.some((g) => g.id === state.activeRuneGroup)) state.activeRuneGroup = unlocked[0]?.id || "basic";
  $("#rune-group-tabs").innerHTML = unlocked.map((group) => `<button class="subtab ${state.activeRuneGroup === group.id ? "active" : ""}" data-rune-group="${group.id}">${group.name}</button>`).join("");
  $$('[data-rune-group]').forEach((button) => button.onclick = () => { state.activeRuneGroup = button.dataset.runeGroup; renderRunes(); });
  const group = RUNE_GROUPS.find((g) => g.id === state.activeRuneGroup) || RUNE_GROUPS[0];
  $("#rune-roll-cost").textContent = `${format(group.cost)} Prisms`;
  $("#roll-rune-one").disabled = !state.prisms.gte(group.cost);
  $("#roll-rune-ten").disabled = !state.prisms.gte(group.cost.mul(10));
  $("#rune-grid").innerHTML = RUNE_NAMES[group.id].map((name, index) => {
    const copies = Number(state.runeCopies[`${group.id}:${index}`] || 0); const info = getRuneLevelFromCopies(copies); const type = RUNE_EFFECT_TYPES[index];
    const descriptions = { power: "Multiplies fixed Power", generator: "Multiplies Generator output", rebirth: "Increases Rebirth gain", prism: "Increases Prism generation", core: "Increases Core output", souls: "Increases Soul output", aether: "Increases Aether output", survey: "Increases Survey speed", luck: "Improves Rune luck", copies: "Improves extra-copy chance" };
    return `<article class="rune-card"><h3>${name}</h3><span class="rune-type">${group.name} · ${type}</span><div class="rune-level">LV ${info.level}</div><p>${descriptions[type]}. Current strength scales with Rune level.</p><small>${info.current}/${info.needed} copies to next level</small><div class="exp-track"><span style="width:${Math.min(100, info.current / info.needed * 100)}%"></span></div></article>`;
  }).join("");
}

function renderSparks() {
  if (state.prestige < 1) return;
  $("#sparks-amount").textContent = format(state.sparks);
  genericWorldCards($("#spark-grid"), "spark", "Sparks", "Spark Collector", "Voltage Array", "sparkCollectorLevel", "sparkPowerLevel", pow10(20 + state.sparkCollectorLevel * 4), bn(100).mul(pow10(state.sparkPowerLevel * 2)), `+${format(getSparkRate())}/s`, `×${format(pow10(state.sparkPowerLevel * 3))} Power`);
}

function renderCore() {
  $("#core-shards").textContent = format(state.coreShards);
  $("#core-status").textContent = state.coreActive ? `Active · ${format(getCoreRate())}/s` : "Inactive";
  const stabilizer = treeLevel("coreStabilizer");
  $("#core-penalty").textContent = state.coreActive ? `Other production currently receives ×${otherProductionFactor().toFixed(2)}.` : `When active, other production receives ×${stabilizer >= 2 ? "0.90" : stabilizer >= 1 ? "0.75" : "0.50"}.`;
  $("#toggle-core").textContent = state.coreActive ? "Stop Core" : "Start Core";
  const producerCost = pow10(90 + state.coreRateLevel * 8); const powerCost = bn(10).mul(pow10(state.corePowerLevel * 2));
  genericWorldCards($("#core-upgrades"), "core", "Core Shards", "Core Drill", "Core Resonance", "coreRateLevel", "corePowerLevel", producerCost, powerCost, `+${format(0.1 + state.coreRateLevel * .25)}/s`, `×${format(pow10(state.corePowerLevel * 10))} Power`);
}

function renderWorlds() {
  if (state.prestige >= 3) {
    $("#souls-amount").textContent = format(state.souls);
    const threshold = getSoulDecayThreshold();
    const decaying = state.souls.gt(threshold);
    genericWorldCards($("#underworld-grid"), "soul", "Souls", "Soul Harvester", "Soul Furnace", "soulHarvesterLevel", "soulPowerLevel", pow10(50 + state.soulHarvesterLevel * 6), bn(100).mul(pow10(state.soulPowerLevel * 2)), `+${format(getSoulRate())}/s`, `×${format(pow10(state.soulPowerLevel * 15))} Power`);
    const note = $("#underworld-note");
    note.style.color = decaying ? "var(--danger)" : "var(--muted)";
    note.textContent = decaying
      ? `Souls above ${format(threshold)} are decaying at ${(getSoulDecayRate() * 100).toFixed(0)}%/s — spend them on Soul Furnace.`
      : `Souls stay safe up to ${format(threshold)}. Beyond that they decay — bank in Soul Furnace levels instead of hoarding.`;
  }
  if (state.prestige >= 4) {
    $("#aether-amount").textContent = format(state.aether);
    genericWorldCards($("#sky-grid"), "aether", "Aether", "Aether Harvester", "Celestial Engine", "aetherHarvesterLevel", "aetherPowerLevel", pow10(8 + state.aetherHarvesterLevel * 4), bn(100).mul(pow10(state.aetherPowerLevel * 2)), `+${format(getAetherRate())}/s`, `×${format(pow10(state.aetherPowerLevel * 22))} Power`);
    const charge = getMomentumCharge();
    $("#sky-note").textContent = `Momentum charge: ${(charge * 100).toFixed(0)}% — Aether output scales from 25% to 100% as Momentum builds over the hour.`;
  }
  if (state.prestige >= 6) {
    $("#stardust-amount").textContent = format(state.stardust);
    genericWorldCards($("#astral-grid"), "stardust", "Stardust", "Stardust Collector", "Astral Compression", "stardustCollectorLevel", "stardustPowerLevel", pow10(10 + state.stardustCollectorLevel * 4), bn(100).mul(pow10(state.stardustPowerLevel * 2)), `+${format(getStardustRate())}/s`, `×${format(pow10(state.stardustPowerLevel * 35))} Power`);
  }
  if (state.prestige >= 7) {
    $("#star-essence").textContent = format(state.starEssence);
    genericWorldCards($("#space-grid"), "star", "Star Essence", "Star Collector", "Stellar Engine", "starCollectorLevel", "starPowerLevel", pow10(6 + state.starCollectorLevel * 3), bn(100).mul(pow10(state.starPowerLevel * 2)), `+${format(getStarRate())}/s`, `×${format(pow10(state.starPowerLevel * 50))} Power`);
  }
  if (state.prestige >= 8) {
    $("#nebula-essence").textContent = format(state.nebulaEssence);
    genericWorldCards($("#nebula-grid"), "nebula", "Nebula Essence", "Nebula Condenser", "Nebula Exponent", "nebulaCollectorLevel", "nebulaPowerLevel", pow10(6 + state.nebulaCollectorLevel * 3), bn(100).mul(pow10(state.nebulaPowerLevel * 2)), `+${format(getNebulaRate())}/s`, `+${(state.nebulaPowerLevel * .04).toFixed(2)} exponent`);
  }
  if (state.prestige >= 9) {
    $("#reality-fragments").textContent = format(state.realityFragments);
    genericWorldCards($("#reality-grid"), "reality", "Reality Fragments", "Reality Scanner", "Reality Engine", "realityCollectorLevel", "realityPowerLevel", pow10(6 + state.realityCollectorLevel * 3), bn(100).mul(pow10(state.realityPowerLevel * 2)), `+${format(getRealityRate())}/s`, `×${format(pow10(state.realityPowerLevel * 70))} Power`);
  }
  if (state.prestige >= 10) {
    $("#continuum-cores").textContent = format(state.continuumCores);
    genericWorldCards($("#continuum-grid"), "continuum", "Continuum Cores", "Continuum Collector", "Continuum Exponent", "continuumCollectorLevel", "continuumPowerLevel", pow10(6 + state.continuumCollectorLevel * 3), bn(1 + state.continuumPowerLevel * 2), `+${format(getContinuumRate())}/s`, `+${(state.continuumPowerLevel * .08).toFixed(2)} exponent`);
  }
  $$('[data-world-buy]').forEach((button) => button.onclick = () => { const [system, type] = button.dataset.worldBuy.split(":"); buyWorldUpgrade(system, type); });
}

function renderSurveys() {
  if (state.prestige < 3) return;
  $("#survey-data").textContent = format(state.surveyData);
  if (state.activeSurvey) {
    const route = SURVEYS.find((x) => x.id === state.activeSurvey.id);
    $("#survey-active").innerHTML = `<b>${route?.name || "Survey"}</b><p>${formatDuration(state.activeSurvey.remaining)} remaining</p>`;
  } else $("#survey-active").innerHTML = `<b>No active survey</b><p>Select one route below.</p>`;
  $("#survey-grid").innerHTML = SURVEYS.filter((route, index) => state.prestige >= 3 + Math.floor(index / 2)).map((route) => `<article class="survey-card"><h3>${route.name}</h3><p>${route.desc}</p><small>${formatDuration(route.duration)} base duration</small><div class="button-row"><button class="action-button" data-survey="${route.id}" ${state.activeSurvey ? "disabled" : ""}>Start Survey</button></div></article>`).join("");
  $$('[data-survey]').forEach((button) => button.onclick = () => startSurvey(button.dataset.survey));
}

function renderRelics() {
  if (state.prestige < 5) return;
  $("#echoes-amount").textContent = format(state.echoes);
  const totalLevels = Object.values(state.relicLevels).reduce((a, b) => a + Number(b || 0), 0);
  const cost = bn(100).mul(pow10(totalLevels * .25));
  $("#forge-relic").textContent = `Forge Relic · ${format(cost)} Echoes`;
  $("#forge-relic").disabled = !state.echoes.gte(cost);
  $("#relic-grid").innerHTML = RELICS.map((r) => {
    const level = relicLevel(r.id);
    const refund = bn(100).mul(pow10(Math.max(0, totalLevels - 1) * 0.25)).mul(0.5);
    return `<article class="rune-card"><h3>${r.name}</h3><span class="rune-type">Relic</span><div class="rune-level">LV ${level}</div><p>${r.text}</p><small>Base weight: ${r.weight}</small><button class="action-button secondary salvage-button" type="button" data-salvage="${r.id}" ${level <= 0 ? "disabled" : ""}>Salvage 1 lv → ${format(refund)} Echoes</button></article>`;
  }).join("");
  $$('[data-salvage]').forEach((button) => button.onclick = () => salvageRelic(button.dataset.salvage));
}

function renderAchievements() {
  const unlockedCount = unlockedAchievementCount();
  $("#achievement-count").textContent = `${unlockedCount} / ${ACHIEVEMENTS.length}`;
  $("#achievement-bonus").textContent = `×${format(achievementMultiplier())} fixed Power`;
  $("#achievement-grid").innerHTML = ACHIEVEMENTS.map((a) => {
    const unlocked = !!state.achievements[a.id];
    return `<article class="prestige-item achievement-item ${unlocked ? "unlocked" : "locked"}"><div class="prestige-number">${unlocked ? "✓" : "?"}</div><div><b>${a.name}</b><small>${unlocked ? " · Unlocked" : ""}</small></div><p>${unlocked ? a.desc : "Keep playing to reveal this milestone."}</p></article>`;
  }).join("");
}

function renderSettings() {
  $("#language-select").value = state.language;
  $("#notation-select").value = state.notation;
  $("#developer-login").hidden = state.developerUnlocked;
  $("#developer-panel").hidden = !state.developerUnlocked;
  const options = [...bigFields, "prestige", "generatorLevel", "rebirthPowerLevel", "rebirthGainLevel", "generatorMasteryLevel"];
  $("#developer-currency").innerHTML = options.map((x) => `<option value="${x}">${x}</option>`).join("");
}

function applyLanguage() {
  const dict = translations[state.language] || {};
  $$('[data-t]').forEach((el) => {
    const key = el.dataset.t;
    if (!el.dataset.baseText) el.dataset.baseText = el.textContent;
    el.textContent = dict[key] || el.dataset.baseText;
  });
  document.documentElement.lang = state.language;
}

function render() {
  renderNavigation(); renderTop(); renderOverworld(); renderRebirth(); renderPrestige(); renderTrees(); renderAchievements();
  if (state.prestige >= 1) { renderSparks(); renderRunes(); }
  if (state.prestige >= 2) renderCore();
  renderWorlds(); renderSurveys(); renderRelics(); renderSettings(); applyLanguage();
}

function exportSave() {
  $("#text-dialog-title").textContent = "Export Save";
  $("#save-text").value = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  $("#apply-import").hidden = true; $("#save-error").textContent = ""; $("#text-dialog").showModal();
}
function importSaveDialog() {
  $("#text-dialog-title").textContent = "Import Save"; $("#save-text").value = ""; $("#apply-import").hidden = false; $("#save-error").textContent = ""; $("#text-dialog").showModal();
}
function applyImport() {
  try {
    const decoded = decodeURIComponent(escape(atob($("#save-text").value.trim())));
    localStorage.setItem(SAVE_KEY, decoded); location.reload();
  } catch { $("#save-error").textContent = "Invalid save data."; }
}

function resetProgress() { localStorage.removeItem(SAVE_KEY); state = defaultState(); currentView = "overworld"; saveGame(false); render(); }

function developerModify(mode) {
  const key = $("#developer-currency").value; const raw = $("#developer-amount").value;
  if (bigFields.includes(key)) state[key] = mode === "add" ? state[key].add(raw) : bn(raw);
  else if (key === "prestige") state.prestige = Math.max(0, Math.min(10, mode === "add" ? state.prestige + Number(raw) : Number(raw)));
  else state[key] = Math.max(0, Math.floor(mode === "add" ? Number(state[key] || 0) + Number(raw) : Number(raw)));
  render();
}

function unlockAllSystems() {
  state.prestige = 10; state.prisms = state.prisms.add("1e20"); state.rebirths = state.rebirths.add("1e200"); state.power = state.power.add("1e2500");
  state.coreShards = state.coreShards.add("1e10"); state.souls = state.souls.add("1e12"); state.aether = state.aether.add("1e12"); state.echoes = state.echoes.add("1e8"); state.stardust = state.stardust.add("1e10"); state.starEssence = state.starEssence.add("1e10"); state.nebulaEssence = state.nebulaEssence.add("1e10"); state.realityFragments = state.realityFragments.add("1e10"); state.continuumCores = state.continuumCores.add("1e4");
  state.trees.unlockRefined = 1; state.trees.unlockArcane = 1; state.trees.unlockCosmic = 1; state.trees.unlockPowerPrism = 1; state.trees.unlockTranscendent = 1;
  render();
}

function bindEvents() {
  $("#buy-generator").onclick = () => buyGenerator(false); $("#buy-max-generator").onclick = () => buyGenerator(true);
  $("#buy-amplifier").onclick = () => buyAmplifier(false); $("#buy-max-amplifier").onclick = () => buyAmplifier(true);
  $("#rebirth-button").onclick = performRebirth; $("#prestige-button").onclick = performPrestige;
  $$('[data-tree-tab]').forEach((button) => button.onclick = () => { state.activeTree = button.dataset.treeTab; renderTrees(); });
  $("#roll-rune-one").onclick = () => rollRune(1); $("#roll-rune-ten").onclick = () => rollRune(10);
  $("#toggle-core").onclick = () => { state.coreActive = !state.coreActive; if (state.coreActive) state.totalCoreActivations += 1; render(); };
  $("#forge-relic").onclick = forgeRelic;
  $("#language-select").onchange = (e) => { state.language = e.target.value; render(); };
  $("#notation-select").onchange = (e) => { state.notation = e.target.value; render(); };
  $("#manual-save").onclick = () => saveGame(true); $("#export-save").onclick = exportSave; $("#import-save").onclick = importSaveDialog;
  $("#close-text-dialog").onclick = () => $("#text-dialog").close(); $("#apply-import").onclick = applyImport;
  $("#reset-progress").onclick = () => $("#confirm-dialog").showModal(); $("#cancel-reset").onclick = () => $("#confirm-dialog").close(); $("#confirm-reset").onclick = () => { $("#confirm-dialog").close(); resetProgress(); };
  $("#close-offline").onclick = () => $("#offline-dialog").close();
  $("#enable-developer").onclick = () => { if ($("#developer-password").value === DEV_PASSWORD) { state.developerUnlocked = true; $("#developer-message").textContent = "Developer access enabled."; render(); } else $("#developer-message").textContent = "Incorrect password."; };
  $("#developer-add").onclick = () => developerModify("add"); $("#developer-set").onclick = () => developerModify("set"); $("#developer-unlock").onclick = unlockAllSystems;
  window.addEventListener("beforeunload", () => saveGame(false));
  document.addEventListener("visibilitychange", () => {
    const now = Date.now(); const elapsed = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (now - state.lastUpdateAt) / 1000)); processProduction(elapsed); state.lastUpdateAt = now; render();
  });
}

function gameLoop() {
  const now = Date.now();
  const elapsed = Math.min(10, Math.max(0, (now - state.lastUpdateAt) / 1000));
  processProduction(elapsed);
  state.lastUpdateAt = now;
  if (now - lastRenderAt >= 100) {
    render();
    lastRenderAt = now;
  }
  frameHandle = requestAnimationFrame(gameLoop);
}

function initialize() {
  bindEvents();
  const offlineSeconds = loadGame();
  render();
  setInterval(() => saveGame(false), AUTOSAVE_MS);
  frameHandle = requestAnimationFrame(gameLoop);
  if (offlineSeconds >= 30) {
    $("#offline-summary").innerHTML = `<p>You were away for ${formatDuration(offlineSeconds)}.</p><p>All unlocked producers, Prisms, and active systems were processed for up to 28 days.</p>`;
    $("#offline-dialog").showModal();
  }
}

initialize();
