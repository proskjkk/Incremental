"use strict";

const SAVE_KEY = "the-world-incremental-save";
const SAVE_VERSION = 3;
const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_OFFLINE_SECONDS = 28 * 24 * 60 * 60;
const REBIRTH_BASE = 1000;
const UNDERWORLD_REQUIREMENT = 100;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const DEFAULT_RUNES = {
  basic: 0,
  charged: 0,
  verdant: 0,
  infernal: 0,
  aerial: 0,
  void: 0,
  cosmic: 0,
};

const DEFAULT_TREE = {
  root: 0,
  generator: 0,
  rebirth: 0,
  prism: 0,
  automation: 0,
  underworld: 0,
  runeLuck: 0,
  sky: 0,
  cosmicRoot: 0,
};

const DEFAULT_STATE = {
  version: SAVE_VERSION,
  power: 0,
  generatorLevel: 0,
  sparks: 0,
  sparkCollectorLevel: 0,
  voltageLevel: 0,

  rebirths: 0,
  totalRebirths: 0,
  rebirthPowerLevel: 0,
  rebirthEfficiencyLevel: 0,
  rebirthSparkLevel: 0,
  prismForgeLevel: 0,

  prestigeCount: 0,
  prisms: 0,
  runeRolls: 0,
  runes: { ...DEFAULT_RUNES },
  tree: { ...DEFAULT_TREE },

  souls: 0,
  soulHarvesterLevel: 0,
  soulPowerLevel: 0,
  embers: 0,
  emberFurnaceLevel: 0,
  emberPowerLevel: 0,

  aether: 0,
  aetherCondenserLevel: 0,
  celestialPowerLevel: 0,
  clouds: 0,
  cloudHarvesterLevel: 0,
  cloudPowerLevel: 0,

  voidEssence: 0,
  voidAmplifierLevel: 0,
  starCores: 0,
  starCoreLevel: 0,
  stardust: 0,
  stardustCollectorLevel: 0,
  stardustPowerLevel: 0,

  unlocks: { underworld: false },
  settings: { notation: "standard", language: "en" },
  lastSavedAt: Date.now(),
};

let state = structuredClone(DEFAULT_STATE);
let buyMode = "1";
let lastTickAt = Date.now();
let lastRenderedAt = 0;
let activeLayer = "overworld";
let selectedTreeNode = "root";
let toastTimer = null;

const COSTS = {
  generator: { base: 10, scale: 1.18, currency: "power" },
  sparkCollector: { base: 250, scale: 1.35, currency: "power" },
  voltage: { base: 25, scale: 2.5, currency: "sparks" },
  rebirthPower: { base: 1, scale: 3, currency: "rebirths" },
  rebirthEfficiency: { base: 5, scale: 4, currency: "rebirths" },
  rebirthSpark: { base: 10, scale: 3.5, currency: "rebirths" },
  prismForge: { base: 50, scale: 3, currency: "rebirths" },
  soulHarvester: { base: 10, scale: 1.7, currency: "souls" },
  emberFurnace: { base: 100, scale: 2.2, currency: "souls" },
  soulPower: { base: 50, scale: 3, currency: "souls" },
  emberPower: { base: 25, scale: 3.5, currency: "embers" },
  aetherCondenser: { base: 10, scale: 1.8, currency: "aether" },
  cloudHarvester: { base: 100, scale: 2.25, currency: "aether" },
  celestialPower: { base: 50, scale: 3.2, currency: "aether" },
  cloudPower: { base: 25, scale: 3.5, currency: "clouds" },
  stardustCollector: { base: 10, scale: 1.9, currency: "stardust" },
  stardustPower: { base: 25, scale: 4, currency: "stardust" },
  starCore: { base: 1, scale: 2.5, currency: "starCores" },
};

const PRESTIGE_REWARDS = [
  { level: 1, title: "Prismatic Awakening", description: "Unlock Prisms, Runes, and the Prism Tree. Gain 25 Prisms." },
  { level: 2, title: "Infernal Expansion", description: "Unlock Embers and Infernal Runes. Gain 75 Prisms." },
  { level: 3, title: "Sky Passage", description: "Unlock Sky World and Aerial Runes. Rebirth upgrades survive Prestige. Gain 150 Prisms." },
  { level: 4, title: "World Automation", description: "Unlock Clouds and automatic Generator purchasing. Gain 300 Prisms." },
  { level: 5, title: "Void Contact", description: "Unlock Void Essence and Void Runes. Power multipliers gain an exponent. Gain 600 Prisms." },
  { level: 6, title: "Stellar Seed", description: "Unlock Star Cores. Prism production is multiplied by 10. Gain 1,000 Prisms." },
  { level: 7, title: "Leave the World", description: "Unlock Space, Stardust, and Cosmic Runes. All production is multiplied by 1,000. Gain 2,500 Prisms." },
];

const RUNE_TYPES = [
  { id: "basic", name: "Stone Rune", icon: "◆", unlock: 1, weight: 42, effect: "+8% Power per Rune", className: "rune-basic" },
  { id: "charged", name: "Charged Rune", icon: "⚡", unlock: 1, weight: 28, effect: "+12% Spark and Prism production per Rune", className: "rune-charged" },
  { id: "verdant", name: "Verdant Rune", icon: "♣", unlock: 1, weight: 20, effect: "+15% Rebirth gain per Rune", className: "rune-verdant" },
  { id: "infernal", name: "Infernal Rune", icon: "♨", unlock: 2, weight: 12, effect: "+18% Soul and Ember production per Rune", className: "rune-infernal" },
  { id: "aerial", name: "Aerial Rune", icon: "▲", unlock: 3, weight: 8, effect: "+18% Aether and Cloud production per Rune", className: "rune-aerial" },
  { id: "void", name: "Void Rune", icon: "◉", unlock: 5, weight: 4, effect: "+25% all production per Rune", className: "rune-void" },
  { id: "cosmic", name: "Cosmic Rune", icon: "✦", unlock: 7, weight: 1, effect: "×2 all production per Rune", className: "rune-cosmic" },
];

const TREE_NODES = [
  { id: "root", name: "Prism Root", icon: "◇", x: 50, y: 86, max: 1, baseCost: 5, scale: 1, requires: [], effect: "Unlocks the first branches of the Prism Tree." },
  { id: "generator", name: "Generator Lattice", icon: "⚡", x: 25, y: 64, max: 10, baseCost: 8, scale: 1.8, requires: ["root"], effect: "+50% Generator output per level." },
  { id: "rebirth", name: "Rebirth Flow", icon: "R", x: 50, y: 64, max: 10, baseCost: 10, scale: 1.9, requires: ["root"], effect: "+20% Rebirth gain per level." },
  { id: "prism", name: "Prism Refraction", icon: "◇", x: 75, y: 64, max: 10, baseCost: 12, scale: 2, requires: ["root"], effect: "+40% Prism production per level." },
  { id: "automation", name: "World Engine", icon: "⌁", x: 14, y: 37, max: 1, baseCost: 80, scale: 1, requires: ["generator"], effect: "Automatically buys Spark Collectors and Voltage upgrades." },
  { id: "underworld", name: "Soul Conduit", icon: "☠", x: 38, y: 37, max: 8, baseCost: 35, scale: 2.1, requires: ["rebirth"], effect: "+50% Soul and Ember production per level." },
  { id: "runeLuck", name: "Rune Fortune", icon: "✧", x: 62, y: 37, max: 8, baseCost: 45, scale: 2.2, requires: ["prism"], effect: "Improves the weight of rarer Runes." },
  { id: "sky", name: "Sky Resonance", icon: "▲", x: 86, y: 37, max: 8, baseCost: 60, scale: 2.25, requires: ["prism"], prestige: 3, effect: "+50% Aether and Cloud production per level." },
  { id: "cosmicRoot", name: "Cosmic Root", icon: "✦", x: 50, y: 12, max: 1, baseCost: 2500, scale: 1, requires: ["underworld", "runeLuck", "sky"], prestige: 7, effect: "Multiplies all production by 100." },
];

const INDONESIAN = {
  worlds: "DUNIA", overworld: "Dunia Atas", underworld: "Dunia Bawah", skyWorld: "Dunia Langit", space: "Luar Angkasa", system: "SISTEM", settings: "Pengaturan",
  power: "Daya", rebirths: "Rebirth", prestige: "Prestise", sparks: "Percikan", prisms: "Prisma", souls: "Jiwa", embers: "Bara", aether: "Aether", clouds: "Awan", starCores: "Inti Bintang", stardust: "Debu Bintang",
  overworldDescription: "Kembangkan Daya dan ubah setiap 1.000 Daya menjadi satu Rebirth.", powerPerSecond: "Daya per detik", production: "Produksi", rebirth: "Rebirth", runes: "Rune", prismTree: "Pohon Prisma",
  multiplier: "Pengali", producer: "PRODUSEN", powerGenerator: "Generator Daya", generatorDescription: "Menambah produksi dasar Daya. Prestise 4 dapat mengotomatiskan pembelian.", output: "Hasil", cost: "Biaya", buyGenerator: "Beli Generator",
  sparkCollector: "Pengumpul Percikan", sparkDescription: "Menghasilkan Percikan. Percikan yang tersimpan melipatgandakan Daya.", rate: "Laju", buyCollector: "Beli Pengumpul", sparkUpgrade: "UPGRADE PERCIKAN", voltage: "Tegangan", voltageDescription: "Menggandakan produksi Daya setiap level.", effect: "Efek", upgrade: "Tingkatkan",
  nextUnlock: "BUKA BERIKUTNYA", rebirthReset: "RESET REBIRTH", rebirthFormula: "Setiap 1.000 Daya memberikan satu Rebirth dasar. Daya yang lebih tinggi menumpuk hadiahnya.", currentPower: "Daya saat ini", gainMultiplier: "Pengali perolehan", rebirthNow: "Rebirth Sekarang", spendRebirths: "GUNAKAN REBIRTH", rebirthUpgrades: "Upgrade Rebirth",
  rebirthCharge: "Muatan Rebirth", rebirthChargeDescription: "Melipatgandakan Daya tiga kali setiap level.", rebirthEfficiency: "Efisiensi Rebirth", rebirthEfficiencyDescription: "Menambah 25% perolehan Rebirth setiap level.", sparkMemory: "Memori Percikan", sparkMemoryDescription: "Menggandakan produksi Percikan setiap level.", prismForge: "Tempa Prisma", prismForgeDescription: "Menghasilkan Prisma secara pasif setelah Prestise 1.",
  prestigeReset: "RESET PRESTISE", nextRequirement: "Syarat berikutnya", levelsGained: "Level diperoleh", prestigeNow: "Prestise Sekarang", rewardPath: "JALUR HADIAH", prestigeRewards: "Hadiah Prestise", prestigeCurrencies: "MATA UANG PRESTISE", permanentFlows: "Aliran Permanen", prestigeCurrencyLocked: "Capai Prestise 5 untuk membuka Esensi Void.",
  runeMachine: "MESIN RUNE", rollRunes: "Putar Rune", runeDescription: "Gunakan Prisma untuk memperoleh Rune acak berbobot. Prestise lebih tinggi membuka jenis yang lebih langka.", lastRoll: "Putaran terakhir", noneYet: "Belum ada", runeInfo: "INFO RUNE", runesOwned: "Rune Dimiliki", growWorldTree: "Tumbuhkan Pohon Dunia", treeDescription: "Gunakan Prisma untuk upgrade permanen yang terhubung. Beli node prasyarat terlebih dahulu.",
  underworldDescription: "Panen Jiwa dan Bara untuk memperkuat semua sistem sebelumnya.", soulsPerSecond: "Jiwa per detik", harvest: "Panen", upgrades: "Upgrade", soulHarvester: "Pemanen Jiwa", soulHarvesterDescription: "Meningkatkan produksi Jiwa pasif.", emberFurnace: "Tungku Bara", emberFurnaceDescription: "Mengubah pertumbuhan Dunia Bawah menjadi Bara pasif.", tormentedPower: "Daya Tersiksa", tormentedPowerDescription: "Melipatgandakan Daya empat kali setiap level.", emberDrive: "Penggerak Bara", emberDriveDescription: "Melipatgandakan Jiwa, Bara, dan Daya tiga kali setiap level.",
  skyDescription: "Kondensasikan Aether dan kumpulkan Awan untuk pengali surgawi.", aetherPerSecond: "Aether per detik", aetherCondenser: "Kondensor Aether", aetherCondenserDescription: "Meningkatkan produksi Aether pasif.", cloudHarvester: "Pemanen Awan", cloudHarvesterDescription: "Menghasilkan Awan setelah Prestise 4.", celestialPower: "Daya Surgawi", celestialPowerDescription: "Melipatgandakan Daya sepuluh kali setiap level.", stormCircuit: "Sirkuit Badai", stormCircuitDescription: "Melipatgandakan Aether, Awan, dan Daya tiga kali setiap level.",
  spaceDescription: "Prestise 7 menembus batas planet dan membuka Debu Bintang.", stardustPerSecond: "Debu Bintang per detik", stardustCollector: "Pengumpul Debu Bintang", stardustCollectorDescription: "Meningkatkan produksi Debu Bintang pasif.", spaceEffect: "EFEK ANGKASA", stellarAmplification: "Amplifikasi Bintang", stellarAmplificationDescription: "Debu Bintang dan Inti Bintang melipatgandakan semua produksi dunia sebelumnya.", stellarPower: "Daya Bintang", stellarPowerDescription: "Melipatgandakan semua produksi sepuluh kali setiap level.", coreCompression: "Kompresi Inti", coreCompressionDescription: "Menggandakan laju setiap mata uang per level.",
  settingsDescription: "Tampilan, bahasa, data simpanan, dan kontrol progres.", display: "TAMPILAN", languageAndNotation: "Bahasa & Notasi", language: "Bahasa", notation: "Notasi angka", saveData: "DATA SIMPANAN", saveManagement: "Pengelolaan Simpanan", saveDescription: "Game menyimpan otomatis setiap lima detik dan mendukung hingga 28 hari perolehan offline.", manualSave: "Simpan Manual", exportSave: "Ekspor Simpanan", importSave: "Impor Simpanan", dangerZone: "ZONA BAHAYA", resetProgress: "Reset Progres", resetDescription: "Hapus permanen semua mata uang, Rune, upgrade, dan dunia yang terbuka di browser ini.", resetEverything: "Reset Semuanya",
  welcomeBack: "SELAMAT DATANG KEMBALI", offlineProgress: "Progres Offline", continue: "Lanjutkan", confirmReset: "KONFIRMASI RESET", deleteAllProgress: "Hapus semua progres?", deleteWarning: "Tindakan ini tidak dapat dibatalkan kecuali Anda telah mengekspor simpanan.", cancel: "Batal", deleteSave: "Hapus Simpanan", close: "Tutup"
};

function getText(key, fallback = key) {
  if (state.settings.language === "id" && INDONESIAN[key]) return INDONESIAN[key];
  return fallback;
}

function formatNumber(value, precision = 2) {
  if (!Number.isFinite(value)) return "∞";
  if (value < 0) return `-${formatNumber(-value, precision)}`;
  if (value === 0) return "0";
  if (state.settings.notation === "scientific" && value >= 1000) {
    return value.toExponential(precision).replace("e+", "e");
  }
  if (value < 1000) {
    if (value >= 100) return Math.floor(value).toLocaleString("en-US");
    if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
    return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  const suffixes = [
    [3, "K"], [6, "M"], [9, "B"], [12, "T"], [15, "Qa"], [18, "Qn"],
    [21, "Sx"], [24, "Sp"], [27, "Oc"], [30, "No"], [33, "Dc"],
    [36, "Ud"], [39, "Dd"], [42, "Td"], [45, "Qad"], [48, "Qid"],
    [51, "Sxd"], [54, "Spd"], [57, "Ocd"], [60, "Nod"], [63, "Vg"],
  ];
  const exponent = Math.floor(Math.log10(value));
  const match = [...suffixes].reverse().find(([power]) => exponent >= power);
  if (!match) return value.toExponential(precision).replace("e+", "e");
  const [power, suffix] = match;
  if (power >= 63 && exponent >= 66) return value.toExponential(precision).replace("e+", "e");
  return `${(value / 10 ** power).toFixed(precision).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}${suffix}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function safePow(base, exponent) {
  const result = Math.pow(base, exponent);
  return Number.isFinite(result) ? result : Number.MAX_VALUE;
}

function costAt(config, level) {
  return config.base * safePow(config.scale, level);
}

function cumulativeCost(config, level, amount) {
  if (amount <= 0) return 0;
  if (config.scale === 1) return config.base * amount;
  return config.base * safePow(config.scale, level) * ((safePow(config.scale, amount) - 1) / (config.scale - 1));
}

function maxAffordable(config, level, balance, cap = 100000) {
  if (balance < costAt(config, level)) return 0;
  if (config.scale === 1) return Math.min(cap, Math.floor(balance / config.base));
  const ratio = 1 + (balance * (config.scale - 1)) / (config.base * safePow(config.scale, level));
  const estimate = Math.max(0, Math.floor(Math.log(ratio) / Math.log(config.scale)));
  let amount = Math.min(cap, estimate);
  while (amount > 0 && cumulativeCost(config, level, amount) > balance) amount -= 1;
  while (amount < cap && cumulativeCost(config, level, amount + 1) <= balance) amount += 1;
  return amount;
}

function amountForMode(config, level, balance) {
  if (buyMode === "max") return maxAffordable(config, level, balance);
  return buyMode === "10" ? 10 : 1;
}

function treeLevel(id) {
  return Number(state.tree[id] || 0);
}

function runeCount(id) {
  return Number(state.runes[id] || 0);
}

function totalRunes() {
  return Object.values(state.runes).reduce((sum, value) => sum + Number(value || 0), 0);
}

function getPrestigeRequirement(level = state.prestigeCount) {
  const exponent = 18 + 5 * level + 2 * level * level;
  return safePow(10, exponent);
}

function getPrestigeGainCount() {
  let gained = 0;
  let level = state.prestigeCount;
  while (level < 100 && state.power >= getPrestigeRequirement(level)) {
    gained += 1;
    level += 1;
  }
  return gained;
}

function getRebirthGainMultiplier() {
  return (1 + 0.25 * state.rebirthEfficiencyLevel)
    * safePow(1.2, treeLevel("rebirth"))
    * safePow(1.15, runeCount("verdant"));
}

function getRebirthGain() {
  const base = Math.floor(state.power / REBIRTH_BASE);
  return Math.floor(base * getRebirthGainMultiplier());
}

function getAllProductionMultiplier() {
  let multiplier = 1;
  multiplier *= safePow(2, state.starCoreLevel);
  multiplier *= safePow(10, state.stardustPowerLevel);
  multiplier *= safePow(1.25, runeCount("void"));
  multiplier *= safePow(2, runeCount("cosmic"));
  multiplier *= 1 + Math.sqrt(Math.max(0, state.voidEssence));
  multiplier *= 1 + Math.log10(state.stardust + 1) * 0.25;
  multiplier *= 1 + state.starCores * 0.5;
  if (state.prestigeCount >= 7) multiplier *= 1000;
  if (treeLevel("cosmicRoot") > 0) multiplier *= 100;
  return multiplier;
}

function getPowerBase() {
  return (1 + state.generatorLevel) * safePow(1.5, treeLevel("generator"));
}

function getPowerMultiplier() {
  let multiplier = 1;
  multiplier *= safePow(2, state.voltageLevel);
  multiplier *= safePow(3, state.rebirthPowerLevel);
  multiplier *= safePow(1000, state.prestigeCount);
  multiplier *= 1 + Math.sqrt(Math.max(0, state.sparks)) / 10;
  multiplier *= 1 + Math.log10(state.souls + 1);
  multiplier *= 1 + Math.sqrt(Math.max(0, state.embers)) / 4;
  multiplier *= 1 + Math.log10(state.aether + 1) * 2;
  multiplier *= 1 + Math.sqrt(Math.max(0, state.clouds)) / 3;
  multiplier *= safePow(4, state.soulPowerLevel);
  multiplier *= safePow(3, state.emberPowerLevel);
  multiplier *= safePow(10, state.celestialPowerLevel);
  multiplier *= safePow(3, state.cloudPowerLevel);
  multiplier *= safePow(1.08, runeCount("basic"));
  multiplier *= getAllProductionMultiplier();
  if (state.prestigeCount >= 5) multiplier = safePow(multiplier, 1.05);
  return multiplier;
}

function getPowerRate() {
  return getPowerBase() * getPowerMultiplier();
}

function getSparkRate() {
  if (state.sparkCollectorLevel <= 0) return 0;
  return state.sparkCollectorLevel
    * safePow(2, state.rebirthSparkLevel)
    * safePow(1.12, runeCount("charged"))
    * getAllProductionMultiplier();
}

function getPrismRate() {
  if (state.prestigeCount < 1) return 0;
  const base = 0.01 + state.prismForgeLevel * 0.05;
  return base
    * safePow(1.4, treeLevel("prism"))
    * safePow(1.12, runeCount("charged"))
    * (state.prestigeCount >= 6 ? 10 : 1)
    * getAllProductionMultiplier();
}

function getSoulRate() {
  if (!state.unlocks.underworld) return 0;
  return (0.1 + state.soulHarvesterLevel * 0.25)
    * safePow(1.5, treeLevel("underworld"))
    * safePow(1.18, runeCount("infernal"))
    * safePow(3, state.emberPowerLevel)
    * getAllProductionMultiplier();
}

function getEmberRate() {
  if (state.prestigeCount < 2) return 0;
  return (0.02 + state.emberFurnaceLevel * 0.08)
    * safePow(1.5, treeLevel("underworld"))
    * safePow(1.18, runeCount("infernal"))
    * safePow(3, state.emberPowerLevel)
    * getAllProductionMultiplier();
}

function getAetherRate() {
  if (state.prestigeCount < 3) return 0;
  return (0.08 + state.aetherCondenserLevel * 0.2)
    * safePow(1.5, treeLevel("sky"))
    * safePow(1.18, runeCount("aerial"))
    * safePow(3, state.cloudPowerLevel)
    * getAllProductionMultiplier();
}

function getCloudRate() {
  if (state.prestigeCount < 4) return 0;
  return (0.02 + state.cloudHarvesterLevel * 0.08)
    * safePow(1.5, treeLevel("sky"))
    * safePow(1.18, runeCount("aerial"))
    * safePow(3, state.cloudPowerLevel)
    * getAllProductionMultiplier();
}

function getVoidRate() {
  if (state.prestigeCount < 5) return 0;
  return 0.004 * (state.prestigeCount - 4) * getAllProductionMultiplier();
}

function getStarCoreRate() {
  if (state.prestigeCount < 6) return 0;
  return 0.0015 * (state.prestigeCount - 5) * getAllProductionMultiplier();
}

function getStardustRate() {
  if (state.prestigeCount < 7) return 0;
  return (0.05 + state.stardustCollectorLevel * 0.15) * getAllProductionMultiplier();
}

function getRuneRollCost(quantity = 1) {
  const single = 5 + Math.floor(state.runeRolls / 20) * 5;
  return single * quantity;
}

function getAvailableRunes() {
  const luck = treeLevel("runeLuck");
  return RUNE_TYPES.filter((rune) => state.prestigeCount >= rune.unlock).map((rune) => ({
    ...rune,
    adjustedWeight: rune.weight * (1 + luck * 0.12 * Math.max(0, rune.unlock - 1)),
  }));
}

function getRuneOdds() {
  const available = getAvailableRunes();
  const total = available.reduce((sum, rune) => sum + rune.adjustedWeight, 0);
  return available.map((rune) => ({ ...rune, chance: total > 0 ? rune.adjustedWeight / total : 0 }));
}

function getTreeNodeCost(node) {
  return Math.ceil(node.baseCost * safePow(node.scale, treeLevel(node.id)));
}

function isTreeNodeUnlocked(node) {
  if (state.prestigeCount < (node.prestige || 1)) return false;
  return node.requires.every((required) => treeLevel(required) > 0);
}

function getRates() {
  return {
    power: getPowerRate(), sparks: getSparkRate(), prisms: getPrismRate(), souls: getSoulRate(),
    embers: getEmberRate(), aether: getAetherRate(), clouds: getCloudRate(), voidEssence: getVoidRate(),
    starCores: getStarCoreRate(), stardust: getStardustRate(),
  };
}

function normalizeState(raw) {
  const migrated = { ...structuredClone(DEFAULT_STATE), ...(raw || {}) };
  migrated.version = SAVE_VERSION;
  migrated.runes = { ...DEFAULT_RUNES, ...(raw?.runes || {}) };
  migrated.tree = { ...DEFAULT_TREE, ...(raw?.tree || {}) };
  migrated.unlocks = { ...DEFAULT_STATE.unlocks, ...(raw?.unlocks || {}) };
  migrated.settings = { ...DEFAULT_STATE.settings, ...(raw?.settings || {}) };

  if (raw?.rebirthPoints !== undefined && raw?.rebirths === undefined) migrated.rebirths = Number(raw.rebirthPoints) || 0;
  if (raw?.rebirthCount !== undefined && raw?.totalRebirths === undefined) migrated.totalRebirths = Number(raw.rebirthCount) || 0;
  if (raw?.prestigePoints !== undefined && raw?.prisms === undefined) migrated.prisms = (Number(raw.prestigePoints) || 0) * 25;
  if (raw?.prestigeCount !== undefined) migrated.prestigeCount = Math.max(0, Math.floor(Number(raw.prestigeCount) || 0));

  const numericKeys = Object.keys(DEFAULT_STATE).filter((key) => typeof DEFAULT_STATE[key] === "number");
  for (const key of numericKeys) {
    migrated[key] = Math.max(0, Number(migrated[key]) || 0);
  }
  migrated.totalRebirths = Math.max(migrated.totalRebirths, migrated.rebirths);
  migrated.unlocks.underworld = Boolean(migrated.unlocks.underworld || migrated.totalRebirths >= UNDERWORLD_REQUIREMENT);
  migrated.settings.notation = ["standard", "scientific"].includes(migrated.settings.notation) ? migrated.settings.notation : "standard";
  migrated.settings.language = ["en", "id"].includes(migrated.settings.language) ? migrated.settings.language : "en";
  migrated.lastSavedAt = Number(migrated.lastSavedAt) || Date.now();
  return migrated;
}

function saveGame(showFeedback = false) {
  state.version = SAVE_VERSION;
  state.lastSavedAt = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  const status = $("#save-status");
  if (status) status.textContent = getText("saved", "Saved");
  if (showFeedback) showToast(state.settings.language === "id" ? "Progres disimpan." : "Progress saved.");
}

function loadGame() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    state = structuredClone(DEFAULT_STATE);
    state.lastSavedAt = Date.now();
    return null;
  }
  try {
    const parsed = JSON.parse(saved);
    state = normalizeState(parsed);
    const now = Date.now();
    const secondsAway = clamp((now - state.lastSavedAt) / 1000, 0, MAX_OFFLINE_SECONDS);
    let report = null;
    if (secondsAway >= 10) report = applyProduction(secondsAway, true);
    state.lastSavedAt = now;
    return report;
  } catch (error) {
    console.error("Failed to load save:", error);
    state = structuredClone(DEFAULT_STATE);
    showToast("Save data was invalid. A new game was started.");
    return null;
  }
}

function applyProduction(seconds, collectReport = false) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const rates = getRates();
  const gains = {};
  for (const [currency, rate] of Object.entries(rates)) {
    const gain = rate * seconds;
    if (gain > 0) {
      state[currency] += gain;
      gains[currency] = gain;
    }
  }
  if (state.totalRebirths >= UNDERWORLD_REQUIREMENT) state.unlocks.underworld = true;
  return collectReport ? { seconds, gains } : null;
}

function silentlyCatchUp() {
  const now = Date.now();
  const elapsed = clamp((now - lastTickAt) / 1000, 0, MAX_OFFLINE_SECONDS);
  if (elapsed > 0) applyProduction(elapsed, false);
  lastTickAt = now;
}

function purchaseUpgrade(key, levelKey) {
  const config = COSTS[key];
  const balance = state[config.currency];
  const currentLevel = state[levelKey];
  const requested = amountForMode(config, currentLevel, balance);
  if (requested <= 0) return;
  const amount = Math.min(requested, maxAffordable(config, currentLevel, balance, requested));
  if (amount <= 0) {
    showToast(state.settings.language === "id" ? "Mata uang tidak cukup." : "Not enough currency.");
    return;
  }
  const totalCost = cumulativeCost(config, currentLevel, amount);
  state[config.currency] = Math.max(0, state[config.currency] - totalCost);
  state[levelKey] += amount;
  renderGame();
}

function performRebirth() {
  const gain = getRebirthGain();
  if (gain < 1) {
    showToast(state.settings.language === "id" ? "Butuh setidaknya 1.000 Daya." : "You need at least 1,000 Power.");
    return;
  }
  state.rebirths += gain;
  state.totalRebirths += gain;
  state.power = 0;
  state.generatorLevel = 0;
  state.sparks = 0;
  state.sparkCollectorLevel = 0;
  state.voltageLevel = 0;
  if (state.totalRebirths >= UNDERWORLD_REQUIREMENT) state.unlocks.underworld = true;
  showToast(`+${formatNumber(gain)} Rebirth${gain === 1 ? "" : "s"}`);
  saveGame(false);
  renderGame();
}

function prestigePrismReward(fromLevel, toLevel) {
  let reward = 0;
  const rewards = { 1: 25, 2: 75, 3: 150, 4: 300, 5: 600, 6: 1000, 7: 2500 };
  for (let level = fromLevel + 1; level <= toLevel; level += 1) reward += rewards[level] || 1000 * safePow(2, level - 7);
  return reward;
}

function performPrestige() {
  const gain = getPrestigeGainCount();
  if (gain < 1) {
    showToast(state.settings.language === "id" ? "Syarat Prestise belum tercapai." : "Prestige requirement not reached.");
    return;
  }
  const oldLevel = state.prestigeCount;
  const newLevel = oldLevel + gain;
  const prismReward = prestigePrismReward(oldLevel, newLevel);
  state.prestigeCount = newLevel;
  state.prisms += prismReward;

  state.power = 0;
  state.generatorLevel = 0;
  state.sparks = 0;
  state.sparkCollectorLevel = 0;
  state.voltageLevel = 0;
  state.rebirths = 0;
  if (newLevel < 3) {
    state.rebirthPowerLevel = 0;
    state.rebirthEfficiencyLevel = 0;
    state.rebirthSparkLevel = 0;
    state.prismForgeLevel = 0;
  }
  state.souls = 0;
  state.soulHarvesterLevel = 0;
  state.soulPowerLevel = 0;
  state.embers = 0;
  state.emberFurnaceLevel = 0;
  state.emberPowerLevel = 0;
  state.aether = 0;
  state.aetherCondenserLevel = 0;
  state.celestialPowerLevel = 0;
  state.clouds = 0;
  state.cloudHarvesterLevel = 0;
  state.cloudPowerLevel = 0;
  state.stardust = 0;
  state.stardustCollectorLevel = 0;
  state.stardustPowerLevel = 0;

  showToast(`Prestige +${gain} · +${formatNumber(prismReward)} Prisms`);
  saveGame(false);
  renderGame();
}

function rollRunes(quantity) {
  if (state.prestigeCount < 1) return;
  const cost = getRuneRollCost(quantity);
  if (state.prisms < cost) {
    showToast(state.settings.language === "id" ? "Prisma tidak cukup." : "Not enough Prisms.");
    return;
  }
  const odds = getRuneOdds();
  if (!odds.length) return;
  state.prisms -= cost;
  const results = {};
  for (let i = 0; i < quantity; i += 1) {
    const roll = Math.random();
    let cumulative = 0;
    let selected = odds[odds.length - 1];
    for (const rune of odds) {
      cumulative += rune.chance;
      if (roll <= cumulative) {
        selected = rune;
        break;
      }
    }
    state.runes[selected.id] += 1;
    results[selected.id] = (results[selected.id] || 0) + 1;
  }
  state.runeRolls += quantity;
  const entries = Object.entries(results).sort((a, b) => b[1] - a[1]);
  const best = entries[0];
  const rune = RUNE_TYPES.find((item) => item.id === best[0]);
  $("#last-rune-result").innerHTML = `<span class="rune-result-icon ${rune.className}">${rune.icon}</span><div><small>${getText("lastRoll", "Last roll")}</small><strong class="${rune.className}">${rune.name}${best[1] > 1 ? ` ×${best[1]}` : ""}</strong></div>`;
  showToast(quantity === 1 ? `Rolled ${rune.name}` : `Rolled ${quantity} Runes`);
  renderGame();
}

function purchaseTreeNode(nodeId) {
  const node = TREE_NODES.find((item) => item.id === nodeId);
  if (!node) return;
  selectedTreeNode = nodeId;
  const level = treeLevel(node.id);
  if (level >= node.max) {
    renderTree();
    return;
  }
  if (!isTreeNodeUnlocked(node)) {
    showToast(state.settings.language === "id" ? "Beli node prasyarat terlebih dahulu." : "Purchase the prerequisite nodes first.");
    renderTree();
    return;
  }
  const cost = getTreeNodeCost(node);
  if (state.prisms < cost) {
    showToast(state.settings.language === "id" ? "Prisma tidak cukup." : "Not enough Prisms.");
    renderTree();
    return;
  }
  state.prisms -= cost;
  state.tree[node.id] += 1;
  showToast(`${node.name} ${node.max > 1 ? `Lv. ${state.tree[node.id]}` : "unlocked"}`);
  renderGame();
}

function runAutomation() {
  if (state.prestigeCount >= 4) {
    const config = COSTS.generator;
    const amount = maxAffordable(config, state.generatorLevel, state.power, 1000);
    if (amount > 0) {
      state.power -= cumulativeCost(config, state.generatorLevel, amount);
      state.generatorLevel += amount;
    }
  }
  if (treeLevel("automation") > 0) {
    const sparkConfig = COSTS.sparkCollector;
    const sparkAmount = maxAffordable(sparkConfig, state.sparkCollectorLevel, state.power, 100);
    if (sparkAmount > 0) {
      state.power -= cumulativeCost(sparkConfig, state.sparkCollectorLevel, sparkAmount);
      state.sparkCollectorLevel += sparkAmount;
    }
    const voltageConfig = COSTS.voltage;
    const voltageAmount = maxAffordable(voltageConfig, state.voltageLevel, state.sparks, 100);
    if (voltageAmount > 0) {
      state.sparks -= cumulativeCost(voltageConfig, state.voltageLevel, voltageAmount);
      state.voltageLevel += voltageAmount;
    }
  }
}

function setText(id, value) {
  const element = $(`#${id}`);
  if (element) element.textContent = value;
}

function setHidden(selector, hidden) {
  const element = typeof selector === "string" ? $(selector) : selector;
  if (element) element.hidden = hidden;
}

function setDisabled(id, disabled) {
  const element = $(`#${id}`);
  if (element) element.disabled = disabled;
}

function getPurchaseInfo(key, levelKey) {
  const config = COSTS[key];
  const level = state[levelKey];
  const balance = state[config.currency];
  const requested = amountForMode(config, level, balance);
  const amount = Math.min(requested, maxAffordable(config, level, balance, requested || 1));
  const shownAmount = buyMode === "max" ? amount : requested;
  const cost = shownAmount > 0 ? cumulativeCost(config, level, shownAmount) : costAt(config, level);
  return { config, level, balance, amount, shownAmount, cost };
}

function renderPurchase(key, levelKey, options) {
  const info = getPurchaseInfo(key, levelKey);
  const currencyName = options.currencyName || options.currency;
  setText(options.levelId, `Lv. ${formatNumber(state[levelKey], 0)}`);
  setText(options.costId, `${formatNumber(info.cost)} ${currencyName}`);
  if (options.effectId && options.effect) setText(options.effectId, options.effect());
  setDisabled(options.buttonId, info.amount <= 0);
  if (options.previewId) {
    const label = buyMode === "max" ? "MAX" : info.shownAmount;
    setText(options.previewId, info.amount > 0
      ? `Buy ${label} for ${formatNumber(info.cost)} ${currencyName}.`
      : `Need ${formatNumber(costAt(info.config, info.level))} ${currencyName}.`);
  }
}

function renderHeader(rates) {
  setText("header-power", formatNumber(state.power));
  setText("header-rebirths", formatNumber(state.rebirths));
  setText("header-prestige", formatNumber(state.prestigeCount, 0));
  setText("header-sparks", formatNumber(state.sparks));
  setText("header-prisms", formatNumber(state.prisms));
  setText("header-souls", formatNumber(state.souls));
  setText("header-embers", formatNumber(state.embers));
  setText("header-aether", formatNumber(state.aether));
  setText("header-clouds", formatNumber(state.clouds));
  setText("header-star-cores", formatNumber(state.starCores));
  setText("header-stardust", formatNumber(state.stardust));

  setHidden('[data-header-resource="prisms"]', state.prestigeCount < 1);
  setHidden('[data-header-resource="souls"]', !state.unlocks.underworld);
  setHidden('[data-header-resource="embers"]', state.prestigeCount < 2);
  setHidden('[data-header-resource="aether"]', state.prestigeCount < 3);
  setHidden('[data-header-resource="clouds"]', state.prestigeCount < 4);
  setHidden('[data-header-resource="starCores"]', state.prestigeCount < 6);
  setHidden('[data-header-resource="stardust"]', state.prestigeCount < 7);

  setText("world-power-rate", `${formatNumber(rates.power)}/s`);
  setText("world-soul-rate", `${formatNumber(rates.souls)}/s`);
  setText("world-aether-rate", `${formatNumber(rates.aether)}/s`);
  setText("world-stardust-rate", `${formatNumber(rates.stardust)}/s`);
}

function renderNavigation() {
  const underworldUnlocked = state.unlocks.underworld;
  const skyUnlocked = state.prestigeCount >= 3;
  const spaceUnlocked = state.prestigeCount >= 7;
  const navStates = [
    ["#underworld-nav", underworldUnlocked], ["#sky-nav", skyUnlocked], ["#space-nav", spaceUnlocked],
  ];
  for (const [selector, unlocked] of navStates) {
    const button = $(selector);
    if (!button) continue;
    button.disabled = !unlocked;
    button.classList.toggle("locked", !unlocked);
  }
  if ((activeLayer === "underworld" && !underworldUnlocked) || (activeLayer === "sky" && !skyUnlocked) || (activeLayer === "space" && !spaceUnlocked)) {
    switchLayer("overworld");
  }
  setDisabled("runes-tab-button", state.prestigeCount < 1);
  setDisabled("tree-tab-button", state.prestigeCount < 1);
  $("#runes-tab-button")?.classList.toggle("locked-tab", state.prestigeCount < 1);
  $("#tree-tab-button")?.classList.toggle("locked-tab", state.prestigeCount < 1);
}

function renderProduction(rates) {
  setText("power-amount", formatNumber(state.power));
  setText("power-rate", `+${formatNumber(rates.power)} Power/s`);
  setText("power-multiplier", `×${formatNumber(getPowerMultiplier())}`);

  renderPurchase("generator", "generatorLevel", {
    levelId: "generator-level", costId: "generator-cost", buttonId: "buy-generator-button", previewId: "generator-preview", currencyName: "Power",
    effectId: "generator-output", effect: () => `+${formatNumber(state.generatorLevel * safePow(1.5, treeLevel("generator")) * getPowerMultiplier())}/s`,
  });
  renderPurchase("sparkCollector", "sparkCollectorLevel", {
    levelId: "spark-collector-level", costId: "spark-collector-cost", buttonId: "buy-spark-collector-button", previewId: "spark-collector-preview", currencyName: "Power",
    effectId: "spark-rate", effect: () => `+${formatNumber(rates.sparks)}/s`,
  });
  renderPurchase("voltage", "voltageLevel", {
    levelId: "voltage-level", costId: "voltage-cost", buttonId: "buy-voltage-button", currencyName: "Sparks",
    effectId: "voltage-effect", effect: () => `×${formatNumber(safePow(2, state.voltageLevel))} Power`,
  });

  let title = "Underworld";
  let description = "Earn 100 total Rebirths to open the Underworld.";
  let current = Math.min(state.totalRebirths, UNDERWORLD_REQUIREMENT);
  let required = UNDERWORLD_REQUIREMENT;
  let progressLabel = `${formatNumber(state.totalRebirths)} / ${formatNumber(required)} total Rebirths`;
  if (state.unlocks.underworld && state.prestigeCount < 1) {
    title = "Prestige 1";
    description = "Reach 1 Qn Power to unlock Prisms, Runes, and the Prism Tree.";
    current = Math.min(state.power, getPrestigeRequirement(0));
    required = getPrestigeRequirement(0);
    progressLabel = `${formatNumber(state.power)} / ${formatNumber(required)} Power`;
  } else if (state.prestigeCount >= 1 && state.prestigeCount < 3) {
    title = "Sky World";
    description = "Reach Prestige 3 to unlock Aether and the Sky World.";
    current = state.prestigeCount;
    required = 3;
    progressLabel = `${state.prestigeCount} / 3 Prestige`;
  } else if (state.prestigeCount >= 3 && state.prestigeCount < 7) {
    title = "Space";
    description = "Reach Prestige 7 to leave the world and unlock Stardust.";
    current = state.prestigeCount;
    required = 7;
    progressLabel = `${state.prestigeCount} / 7 Prestige`;
  } else if (state.prestigeCount >= 7) {
    title = "Space Unlocked";
    description = "The planetary boundary has been broken.";
    current = 1;
    required = 1;
    progressLabel = "Complete";
  }
  setText("next-unlock-title", title);
  setText("next-unlock-description", description);
  setText("next-unlock-progress", progressLabel);
  const percentage = required > 0 ? clamp((current / required) * 100, 0, 100) : 0;
  $("#next-unlock-bar").style.width = `${percentage}%`;
}

function renderRebirth(rates) {
  const gain = getRebirthGain();
  setText("rebirth-gain", formatNumber(gain));
  setText("rebirth-current-power", formatNumber(state.power));
  setText("rebirth-gain-multiplier", `×${formatNumber(getRebirthGainMultiplier())}`);
  setText("rebirth-balance", formatNumber(state.rebirths));
  setDisabled("rebirth-button", gain < 1);

  renderPurchase("rebirthPower", "rebirthPowerLevel", {
    levelId: "rebirth-power-level", costId: "rebirth-power-cost", buttonId: "buy-rebirth-power-button", currencyName: "R",
    effectId: "rebirth-power-effect", effect: () => `×${formatNumber(safePow(3, state.rebirthPowerLevel))}`,
  });
  renderPurchase("rebirthEfficiency", "rebirthEfficiencyLevel", {
    levelId: "rebirth-efficiency-level", costId: "rebirth-efficiency-cost", buttonId: "buy-rebirth-efficiency-button", currencyName: "R",
    effectId: "rebirth-efficiency-effect", effect: () => `×${formatNumber(1 + state.rebirthEfficiencyLevel * 0.25)}`,
  });
  renderPurchase("rebirthSpark", "rebirthSparkLevel", {
    levelId: "rebirth-spark-level", costId: "rebirth-spark-cost", buttonId: "buy-rebirth-spark-button", currencyName: "R",
    effectId: "rebirth-spark-effect", effect: () => `×${formatNumber(safePow(2, state.rebirthSparkLevel))}`,
  });
  setHidden("#prism-forge-card", state.prestigeCount < 1);
  if (state.prestigeCount >= 1) {
    renderPurchase("prismForge", "prismForgeLevel", {
      levelId: "prism-forge-level", costId: "prism-forge-cost", buttonId: "buy-prism-forge-button", currencyName: "R",
      effectId: "prism-forge-effect", effect: () => `+${formatNumber(rates.prisms)}/s`,
    });
  }
}

function renderPrestige() {
  const gain = getPrestigeGainCount();
  const nextRequirement = getPrestigeRequirement(state.prestigeCount);
  setText("prestige-current-level", formatNumber(state.prestigeCount, 0));
  setText("prestige-potential", `+${gain}`);
  setText("prestige-next-requirement", `${formatNumber(nextRequirement)} Power`);
  setText("prestige-levels-gained", formatNumber(gain, 0));
  setDisabled("prestige-button", gain < 1);
  setText("prestige-gain-copy", gain > 0
    ? `Prestige now to gain ${gain} permanent level${gain === 1 ? "" : "s"}.`
    : `Reach ${formatNumber(nextRequirement)} Power for Prestige ${state.prestigeCount + 1}.`);

  $("#prestige-reward-list").innerHTML = PRESTIGE_REWARDS.map((reward) => `
    <div class="reward-item ${state.prestigeCount >= reward.level ? "unlocked" : ""}">
      <div class="reward-level">P${reward.level}</div>
      <div><h4>${reward.title}</h4><p>${reward.description}</p></div>
    </div>`).join("");

  const flows = [];
  if (state.prestigeCount >= 5) {
    flows.push(`<div class="prestige-flow-card"><h4>Void Essence</h4><p>Generated automatically from Prestige 5. It strengthens every production rate.</p><strong>${formatNumber(state.voidEssence)} · +${formatNumber(getVoidRate())}/s</strong></div>`);
  }
  if (state.prestigeCount >= 6) {
    flows.push(`<div class="prestige-flow-card"><h4>Star Cores</h4><p>Generated from Prestige 6. Stored Star Cores amplify every world.</p><strong>${formatNumber(state.starCores)} · +${formatNumber(getStarCoreRate())}/s</strong></div>`);
  }
  $("#prestige-currency-content").innerHTML = flows.length
    ? flows.join("")
    : `<p class="empty-state">${getText("prestigeCurrencyLocked", "Reach Prestige 5 to unlock Void Essence.")}</p>`;
}

function renderRunes() {
  if (state.prestigeCount < 1) return;
  const odds = getRuneOdds();
  setText("rune-roll-cost", `Cost: ${formatNumber(getRuneRollCost(1))} Prisms · Roll 10: ${formatNumber(getRuneRollCost(10))}`);
  setText("rune-total-count", formatNumber(totalRunes(), 0));
  setDisabled("roll-rune-button", state.prisms < getRuneRollCost(1));
  setDisabled("roll-ten-runes-button", state.prisms < getRuneRollCost(10));
  $("#rune-odds-list").innerHTML = odds.map((rune) => `<div class="rune-odds-row"><span class="${rune.className}">${rune.icon} ${rune.name}</span><b>${(rune.chance * 100).toFixed(2)}%</b></div>`).join("");
  $("#rune-inventory").innerHTML = RUNE_TYPES.map((rune) => {
    const unlocked = state.prestigeCount >= rune.unlock;
    return `<article class="rune-card ${unlocked ? "" : "locked"}"><div class="rune-card-header"><h4 class="${rune.className}">${rune.icon} ${rune.name}</h4><span class="rune-count">${unlocked ? formatNumber(runeCount(rune.id), 0) : `P${rune.unlock}`}</span></div><p>${rune.effect}</p></article>`;
  }).join("");
}

function renderTree() {
  if (state.prestigeCount < 1) return;
  setText("tree-prism-balance", formatNumber(state.prisms));
  const container = $("#tree-node-container");
  container.innerHTML = TREE_NODES.map((node) => {
    const level = treeLevel(node.id);
    const maxed = level >= node.max;
    const unlocked = isTreeNodeUnlocked(node);
    const affordable = unlocked && !maxed && state.prisms >= getTreeNodeCost(node);
    const className = maxed ? "maxed" : level > 0 ? "owned" : affordable ? "available" : "locked";
    const label = maxed ? "MAX" : level > 0 ? `${level}/${node.max}` : unlocked ? `${formatNumber(getTreeNodeCost(node))}◇` : `P${node.prestige || 1}`;
    return `<button class="tree-node ${className}" type="button" data-tree-node="${node.id}" style="left:${node.x}%;top:${node.y}%"><strong>${node.icon} ${node.name}</strong><span>${label}</span></button>`;
  }).join("");
  $$('[data-tree-node]').forEach((button) => button.addEventListener("click", () => purchaseTreeNode(button.dataset.treeNode)));

  const selected = TREE_NODES.find((node) => node.id === selectedTreeNode) || TREE_NODES[0];
  const level = treeLevel(selected.id);
  const maxed = level >= selected.max;
  const prerequisiteText = selected.requires.length ? selected.requires.map((id) => TREE_NODES.find((node) => node.id === id)?.name).join(", ") : "None";
  $("#tree-node-details").innerHTML = `<strong>${selected.icon} ${selected.name}</strong> · Level ${level}/${selected.max}<br>${selected.effect}<br>${maxed ? "Maximum level reached." : `Next cost: ${formatNumber(getTreeNodeCost(selected))} Prisms · Requires: ${prerequisiteText}`}`;
}

function renderWorlds(rates) {
  setText("souls-amount", formatNumber(state.souls));
  setText("souls-rate", `+${formatNumber(rates.souls)}/s`);
  setHidden("#ember-hero", state.prestigeCount < 2);
  setHidden("#ember-furnace-card", state.prestigeCount < 2);
  setHidden("#ember-power-card", state.prestigeCount < 2);
  setText("embers-amount", formatNumber(state.embers));
  setText("embers-rate", `+${formatNumber(rates.embers)}/s`);

  renderPurchase("soulHarvester", "soulHarvesterLevel", { levelId: "soul-harvester-level", costId: "soul-harvester-cost", buttonId: "buy-soul-harvester-button", currencyName: "Souls", effectId: "soul-harvester-effect", effect: () => `+${formatNumber(rates.souls)}/s` });
  renderPurchase("soulPower", "soulPowerLevel", { levelId: "soul-power-level", costId: "soul-power-cost", buttonId: "buy-soul-power-button", currencyName: "Souls", effectId: "soul-power-effect", effect: () => `×${formatNumber(safePow(4, state.soulPowerLevel))}` });
  if (state.prestigeCount >= 2) {
    renderPurchase("emberFurnace", "emberFurnaceLevel", { levelId: "ember-furnace-level", costId: "ember-furnace-cost", buttonId: "buy-ember-furnace-button", currencyName: "Souls", effectId: "ember-furnace-effect", effect: () => `+${formatNumber(rates.embers)}/s` });
    renderPurchase("emberPower", "emberPowerLevel", { levelId: "ember-power-level", costId: "ember-power-cost", buttonId: "buy-ember-power-button", currencyName: "Embers", effectId: "ember-power-effect", effect: () => `×${formatNumber(safePow(3, state.emberPowerLevel))}` });
  }

  setText("aether-amount", formatNumber(state.aether));
  setText("aether-rate", `+${formatNumber(rates.aether)}/s`);
  setHidden("#cloud-hero", state.prestigeCount < 4);
  setHidden("#cloud-harvester-card", state.prestigeCount < 4);
  setHidden("#cloud-power-card", state.prestigeCount < 4);
  setText("clouds-amount", formatNumber(state.clouds));
  setText("clouds-rate", `+${formatNumber(rates.clouds)}/s`);
  renderPurchase("aetherCondenser", "aetherCondenserLevel", { levelId: "aether-condenser-level", costId: "aether-condenser-cost", buttonId: "buy-aether-condenser-button", currencyName: "Aether", effectId: "aether-condenser-effect", effect: () => `+${formatNumber(rates.aether)}/s` });
  renderPurchase("celestialPower", "celestialPowerLevel", { levelId: "celestial-power-level", costId: "celestial-power-cost", buttonId: "buy-celestial-power-button", currencyName: "Aether", effectId: "celestial-power-effect", effect: () => `×${formatNumber(safePow(10, state.celestialPowerLevel))}` });
  if (state.prestigeCount >= 4) {
    renderPurchase("cloudHarvester", "cloudHarvesterLevel", { levelId: "cloud-harvester-level", costId: "cloud-harvester-cost", buttonId: "buy-cloud-harvester-button", currencyName: "Aether", effectId: "cloud-harvester-effect", effect: () => `+${formatNumber(rates.clouds)}/s` });
    renderPurchase("cloudPower", "cloudPowerLevel", { levelId: "cloud-power-level", costId: "cloud-power-cost", buttonId: "buy-cloud-power-button", currencyName: "Clouds", effectId: "cloud-power-effect", effect: () => `×${formatNumber(safePow(3, state.cloudPowerLevel))}` });
  }

  setText("stardust-amount", formatNumber(state.stardust));
  setText("stardust-rate", `+${formatNumber(rates.stardust)}/s`);
  setText("star-cores-amount", formatNumber(state.starCores));
  setText("star-cores-rate", `+${formatNumber(rates.starCores)}/s`);
  setText("space-passive-effect", `×${formatNumber((1 + Math.log10(state.stardust + 1) * 0.25) * (1 + state.starCores * 0.5))} all production`);
  renderPurchase("stardustCollector", "stardustCollectorLevel", { levelId: "stardust-collector-level", costId: "stardust-collector-cost", buttonId: "buy-stardust-collector-button", currencyName: "Stardust", effectId: "stardust-collector-effect", effect: () => `+${formatNumber(rates.stardust)}/s` });
  renderPurchase("stardustPower", "stardustPowerLevel", { levelId: "stardust-power-level", costId: "stardust-power-cost", buttonId: "buy-stardust-power-button", currencyName: "Stardust", effectId: "stardust-power-effect", effect: () => `×${formatNumber(safePow(10, state.stardustPowerLevel))}` });
  renderPurchase("starCore", "starCoreLevel", { levelId: "star-core-level", costId: "star-core-cost", buttonId: "buy-star-core-button", currencyName: "Star Cores", effectId: "star-core-effect", effect: () => `×${formatNumber(safePow(2, state.starCoreLevel))}` });
}

function applyTranslations() {
  document.documentElement.lang = state.settings.language;
  if (state.settings.language !== "id") return;
  $$('[data-i18n]').forEach((element) => {
    const translation = INDONESIAN[element.dataset.i18n];
    if (translation) element.textContent = translation;
  });
}

function renderGame() {
  const rates = getRates();
  renderNavigation();
  renderHeader(rates);
  renderProduction(rates);
  renderRebirth(rates);
  renderPrestige();
  renderRunes();
  renderTree();
  renderWorlds(rates);
  $("#language-select").value = state.settings.language;
  $("#notation-select").value = state.settings.notation;
}

const ENGLISH_TEXT = new Map($$('[data-i18n]').map((element) => [element.dataset.i18n, element.textContent]));

function switchLayer(layer) {
  activeLayer = layer;
  $$('[data-layer-view]').forEach((view) => {
    const active = view.dataset.layerView === layer;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });
  $$('[data-layer]').forEach((button) => {
    const active = button.dataset.layer === layer;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchSection(group, section) {
  $$(`[data-section-group="${group}"]`).forEach((button) => button.classList.toggle("active", button.dataset.section === section));
  $$(`[data-section-panel^="${group}:"]`).forEach((panel) => {
    const active = panel.dataset.sectionPanel === `${group}:${section}`;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function showOfflineDialog(report) {
  if (!report || !Object.keys(report.gains).length) return;
  const labels = {
    power: "Power", sparks: "Sparks", prisms: "Prisms", souls: "Souls", embers: "Embers",
    aether: "Aether", clouds: "Clouds", voidEssence: "Void Essence", starCores: "Star Cores", stardust: "Stardust",
  };
  $("#offline-results").innerHTML = `<p>You were away for <strong>${formatDuration(report.seconds)}</strong>.</p>${Object.entries(report.gains).map(([key, gain]) => `<div><span>${labels[key] || key}</span><strong>+${formatNumber(gain)}</strong></div>`).join("")}`;
  $("#offline-dialog").showModal();
}

function encodeSave(data) {
  return btoa(unescape(encodeURIComponent(data)));
}

function decodeSave(data) {
  return decodeURIComponent(escape(atob(data.trim())));
}

function openExportDialog() {
  saveGame(false);
  setText("save-data-title", state.settings.language === "id" ? "Ekspor Simpanan" : "Export Save");
  setText("save-data-description", state.settings.language === "id" ? "Salin teks ini dan simpan di tempat aman." : "Copy this text and store it somewhere safe.");
  $("#save-data-textarea").value = encodeSave(JSON.stringify(state));
  $("#save-data-textarea").readOnly = true;
  $("#save-data-error").textContent = "";
  $("#apply-import-button").hidden = true;
  $("#save-data-dialog").showModal();
  $("#save-data-textarea").select();
}

function openImportDialog() {
  setText("save-data-title", state.settings.language === "id" ? "Impor Simpanan" : "Import Save");
  setText("save-data-description", state.settings.language === "id" ? "Tempel kode simpanan yang valid di bawah." : "Paste a valid save code below.");
  $("#save-data-textarea").value = "";
  $("#save-data-textarea").readOnly = false;
  $("#save-data-error").textContent = "";
  $("#apply-import-button").hidden = false;
  $("#save-data-dialog").showModal();
}

function applyImportedSave() {
  try {
    const raw = JSON.parse(decodeSave($("#save-data-textarea").value));
    state = normalizeState(raw);
    state.lastSavedAt = Date.now();
    lastTickAt = Date.now();
    saveGame(false);
    $("#save-data-dialog").close();
    applyTranslations();
    renderGame();
    showToast(state.settings.language === "id" ? "Simpanan berhasil diimpor." : "Save imported successfully.");
  } catch (error) {
    $("#save-data-error").textContent = state.settings.language === "id" ? "Kode simpanan tidak valid." : "Invalid save code.";
  }
}

function resetProgress() {
  localStorage.removeItem(SAVE_KEY);
  state = structuredClone(DEFAULT_STATE);
  state.lastSavedAt = Date.now();
  lastTickAt = Date.now();
  activeLayer = "overworld";
  selectedTreeNode = "root";
  switchLayer("overworld");
  switchSection("overworld", "production");
  $("#reset-dialog").close();
  applyTranslations();
  renderGame();
  saveGame(false);
  showToast("Progress reset.");
}

function bindEvents() {
  $$('[data-layer]').forEach((button) => button.addEventListener("click", () => {
    if (!button.disabled) switchLayer(button.dataset.layer);
  }));
  $$('[data-section-group]').forEach((button) => button.addEventListener("click", () => {
    if (!button.disabled) switchSection(button.dataset.sectionGroup, button.dataset.section);
  }));
  $$('[data-buy-mode]').forEach((button) => button.addEventListener("click", () => {
    buyMode = button.dataset.buyMode;
    $$('[data-buy-mode]').forEach((item) => item.classList.toggle("active", item === button));
    renderGame();
  }));

  const purchases = [
    ["buy-generator-button", "generator", "generatorLevel"], ["buy-spark-collector-button", "sparkCollector", "sparkCollectorLevel"], ["buy-voltage-button", "voltage", "voltageLevel"],
    ["buy-rebirth-power-button", "rebirthPower", "rebirthPowerLevel"], ["buy-rebirth-efficiency-button", "rebirthEfficiency", "rebirthEfficiencyLevel"], ["buy-rebirth-spark-button", "rebirthSpark", "rebirthSparkLevel"], ["buy-prism-forge-button", "prismForge", "prismForgeLevel"],
    ["buy-soul-harvester-button", "soulHarvester", "soulHarvesterLevel"], ["buy-ember-furnace-button", "emberFurnace", "emberFurnaceLevel"], ["buy-soul-power-button", "soulPower", "soulPowerLevel"], ["buy-ember-power-button", "emberPower", "emberPowerLevel"],
    ["buy-aether-condenser-button", "aetherCondenser", "aetherCondenserLevel"], ["buy-cloud-harvester-button", "cloudHarvester", "cloudHarvesterLevel"], ["buy-celestial-power-button", "celestialPower", "celestialPowerLevel"], ["buy-cloud-power-button", "cloudPower", "cloudPowerLevel"],
    ["buy-stardust-collector-button", "stardustCollector", "stardustCollectorLevel"], ["buy-stardust-power-button", "stardustPower", "stardustPowerLevel"], ["buy-star-core-button", "starCore", "starCoreLevel"],
  ];
  for (const [id, key, levelKey] of purchases) $(`#${id}`)?.addEventListener("click", () => purchaseUpgrade(key, levelKey));

  $("#rebirth-button").addEventListener("click", performRebirth);
  $("#prestige-button").addEventListener("click", performPrestige);
  $("#roll-rune-button").addEventListener("click", () => rollRunes(1));
  $("#roll-ten-runes-button").addEventListener("click", () => rollRunes(10));

  $("#language-select").addEventListener("change", (event) => {
    state.settings.language = event.target.value;
    applyTranslations();
    renderGame();
    saveGame(false);
  });
  $("#notation-select").addEventListener("change", (event) => {
    state.settings.notation = event.target.value;
    renderGame();
    saveGame(false);
  });
  $("#manual-save-button").addEventListener("click", () => saveGame(true));
  $("#export-save-button").addEventListener("click", openExportDialog);
  $("#import-save-button").addEventListener("click", openImportDialog);
  $("#reset-save-button").addEventListener("click", () => $("#reset-dialog").showModal());
  $("#cancel-reset-button").addEventListener("click", () => $("#reset-dialog").close());
  $("#confirm-reset-button").addEventListener("click", resetProgress);
  $("#close-offline-dialog").addEventListener("click", () => $("#offline-dialog").close());
  $("#close-save-data-button").addEventListener("click", () => $("#save-data-dialog").close());
  $("#apply-import-button").addEventListener("click", applyImportedSave);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      silentlyCatchUp();
      saveGame(false);
    } else {
      silentlyCatchUp();
      renderGame();
    }
  });
  window.addEventListener("beforeunload", () => {
    silentlyCatchUp();
    saveGame(false);
  });
}

function applyTranslations() {
  document.documentElement.lang = state.settings.language;
  $$('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    const value = state.settings.language === "id" ? (INDONESIAN[key] || ENGLISH_TEXT.get(key)) : ENGLISH_TEXT.get(key);
    if (value) element.textContent = value;
  });
}

function tick() {
  const now = Date.now();
  const elapsed = clamp((now - lastTickAt) / 1000, 0, MAX_OFFLINE_SECONDS);
  lastTickAt = now;
  if (elapsed > 0) applyProduction(elapsed, false);
  runAutomation();
  if (now - lastRenderedAt >= 100) {
    renderGame();
    lastRenderedAt = now;
  }
}

function initialize() {
  const offlineReport = loadGame();
  lastTickAt = Date.now();
  bindEvents();
  applyTranslations();
  renderGame();
  switchLayer("overworld");
  switchSection("overworld", "production");
  if (offlineReport) showOfflineDialog(offlineReport);
  setInterval(tick, 50);
  setInterval(() => {
    if (document.visibilityState === "visible") saveGame(false);
  }, AUTOSAVE_INTERVAL_MS);
}

initialize();
