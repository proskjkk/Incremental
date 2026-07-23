"use strict";

/*
  Eonshift V0.0.1
  Prototype code remains in one file for now, but data, formulas, systems,
  rendering, saves, offline progress, and developer tools are separated.
*/

const GAME_VERSION = "0.0.1";
const SAVE_KEY = "eonshift-save-v001";
const SESSION_KEY = "eonshift-session-v001";
const DEV_SESSION_KEY = "eonshift-dev-v001";
const DEV_PASSCODE = "1234";
const AUTOSAVE_INTERVAL_MS = 10_000;
const GAME_TICK_MS = 100;
const BACKGROUND_SUSPEND_THRESHOLD_SECONDS = 2;
const BASE_PRISM_INTERVAL = 40;
const BASE_REBIRTH_REQUIREMENT = 1_000;
const BASE_OFFLINE_EFFICIENCY = 0.85;
const BASE_OFFLINE_LIMIT_SECONDS = 6 * 60 * 60;

/* --------------------------- Large-number core --------------------------- */

/**
 * Positive/negative scientific number with a JavaScript-number exponent.
 * It safely handles values such as 1e100000 without becoming Infinity.
 * This prototype range is sufficient for V0.0.1 and can later be swapped for
 * a layered-number library without changing the game-state API.
 */
class HugeNumber {
  constructor(value = 0) {
    this.sign = 0;
    this.mantissa = 0;
    this.exponent = 0;
    this.set(value);
  }

  static zero() {
    return new HugeNumber(0);
  }

  static one() {
    return new HugeNumber(1);
  }

  static from(value) {
    return value instanceof HugeNumber ? value.clone() : new HugeNumber(value);
  }

  static fromParts(sign, mantissa, exponent) {
    const result = Object.create(HugeNumber.prototype);
    result.sign = sign;
    result.mantissa = Math.abs(mantissa);
    result.exponent = Number(exponent) || 0;
    return result.normalize();
  }

  static fromLog10(logarithm) {
    if (logarithm === -Infinity) return HugeNumber.zero();
    if (!Number.isFinite(logarithm)) {
      throw new RangeError("HugeNumber exponent exceeded the supported prototype range");
    }
    const exponent = Math.floor(logarithm);
    return HugeNumber.fromParts(1, Math.pow(10, logarithm - exponent), exponent);
  }

  static pow(base, exponent) {
    const numericBase = Number(base);
    const numericExponent = Number(exponent);
    if (!Number.isFinite(numericBase) || numericBase < 0 || !Number.isFinite(numericExponent)) {
      return HugeNumber.zero();
    }
    if (numericBase === 0) return numericExponent === 0 ? HugeNumber.one() : HugeNumber.zero();
    return HugeNumber.fromLog10(Math.log10(numericBase) * numericExponent);
  }

  set(value) {
    if (value instanceof HugeNumber) {
      this.sign = value.sign;
      this.mantissa = value.mantissa;
      this.exponent = value.exponent;
      return this;
    }

    if (value && typeof value === "object") {
      const mantissa = Number(value.mantissa ?? value.m ?? 0);
      const exponent = Number(value.exponent ?? value.e ?? 0);
      const sign = Number(value.sign ?? value.s ?? Math.sign(mantissa));
      if (Number.isFinite(mantissa) && Number.isFinite(exponent) && Number.isFinite(sign)) {
        this.sign = Math.sign(sign);
        this.mantissa = Math.abs(mantissa);
        this.exponent = exponent;
        return this.normalize();
      }
    }

    if (typeof value === "string") return this.fromString(value);

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) {
      this.sign = 0;
      this.mantissa = 0;
      this.exponent = 0;
      return this;
    }

    this.sign = Math.sign(numeric);
    this.mantissa = Math.abs(numeric);
    this.exponent = 0;
    return this.normalize();
  }

  fromString(rawValue) {
    const raw = String(rawValue).trim().replaceAll(",", "");
    if (!raw || /^[-+]?0(?:\.0+)?$/i.test(raw)) return this.set(0);

    const suffixMatch = raw.match(/^([+-]?\d*\.?\d+)\s*(K|M|B|T|Qa|Qn|Sx|Sp|Oc|No|Dc)$/i);
    if (suffixMatch) {
      const suffixes = ["K", "M", "B", "T", "QA", "QN", "SX", "SP", "OC", "NO", "DC"];
      const tier = suffixes.indexOf(suffixMatch[2].toUpperCase()) + 1;
      return this.set(Number(suffixMatch[1])).multiply(HugeNumber.fromParts(1, 1, tier * 3)).copyTo(this);
    }

    const scientificMatch = raw.match(/^([+-]?\d*\.?\d+)(?:e([+-]?[\d.]+(?:[kmbt])?))?$/i);
    if (!scientificMatch) return this.set(0);

    const coefficient = Number(scientificMatch[1]);
    if (!Number.isFinite(coefficient) || coefficient === 0) return this.set(0);

    let exponent = 0;
    if (scientificMatch[2]) {
      const exponentText = scientificMatch[2].toLowerCase();
      const multiplier = exponentText.endsWith("k") ? 1e3
        : exponentText.endsWith("m") ? 1e6
          : exponentText.endsWith("b") ? 1e9
            : exponentText.endsWith("t") ? 1e12
              : 1;
      exponent = Number.parseFloat(exponentText) * multiplier;
    }

    if (!Number.isFinite(exponent)) return this.set(0);
    this.sign = Math.sign(coefficient);
    this.mantissa = Math.abs(coefficient);
    this.exponent = exponent;
    return this.normalize();
  }

  copyTo(target) {
    target.sign = this.sign;
    target.mantissa = this.mantissa;
    target.exponent = this.exponent;
    return target;
  }

  clone() {
    return HugeNumber.fromParts(this.sign, this.mantissa, this.exponent);
  }

  normalize() {
    if (this.sign === 0 || this.mantissa === 0 || !Number.isFinite(this.mantissa)) {
      this.sign = 0;
      this.mantissa = 0;
      this.exponent = 0;
      return this;
    }

    if (!Number.isFinite(this.exponent)) {
      throw new RangeError("HugeNumber exponent exceeded the supported prototype range");
    }

    const shift = Math.floor(Math.log10(this.mantissa));
    this.mantissa /= Math.pow(10, shift);
    this.exponent += shift;

    if (this.mantissa >= 10) {
      this.mantissa /= 10;
      this.exponent += 1;
    } else if (this.mantissa < 1) {
      this.mantissa *= 10;
      this.exponent -= 1;
    }

    return this;
  }

  isZero() {
    return this.sign === 0;
  }

  negate() {
    return HugeNumber.fromParts(-this.sign, this.mantissa, this.exponent);
  }

  absolute() {
    return HugeNumber.fromParts(Math.abs(this.sign), this.mantissa, this.exponent);
  }

  compareAbsolute(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero()) return other.isZero() ? 0 : -1;
    if (other.isZero()) return 1;
    if (this.exponent !== other.exponent) return this.exponent > other.exponent ? 1 : -1;
    if (this.mantissa === other.mantissa) return 0;
    return this.mantissa > other.mantissa ? 1 : -1;
  }

  compare(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.sign !== other.sign) return this.sign > other.sign ? 1 : -1;
    if (this.sign === 0) return 0;
    return this.sign * this.compareAbsolute(other);
  }

  equals(otherValue) {
    return this.compare(otherValue) === 0;
  }

  greaterThan(otherValue) {
    return this.compare(otherValue) > 0;
  }

  greaterThanOrEqual(otherValue) {
    return this.compare(otherValue) >= 0;
  }

  lessThan(otherValue) {
    return this.compare(otherValue) < 0;
  }

  lessThanOrEqual(otherValue) {
    return this.compare(otherValue) <= 0;
  }

  add(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero()) return other;
    if (other.isZero()) return this.clone();
    if (this.sign !== other.sign) return this.subtract(other.negate());

    const larger = this.compareAbsolute(other) >= 0 ? this : other;
    const smaller = larger === this ? other : this;
    const difference = larger.exponent - smaller.exponent;
    if (difference > 16) return larger.clone();

    const mantissa = larger.mantissa + smaller.mantissa * Math.pow(10, -difference);
    return HugeNumber.fromParts(larger.sign, mantissa, larger.exponent);
  }

  subtract(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (other.isZero()) return this.clone();
    if (this.isZero()) return other.negate();
    if (this.sign !== other.sign) return this.add(other.negate());

    const comparison = this.compareAbsolute(other);
    if (comparison === 0) return HugeNumber.zero();

    const larger = comparison > 0 ? this : other;
    const smaller = comparison > 0 ? other : this;
    const difference = larger.exponent - smaller.exponent;
    const mantissa = difference > 16
      ? larger.mantissa
      : larger.mantissa - smaller.mantissa * Math.pow(10, -difference);
    const sign = comparison > 0 ? this.sign : -this.sign;
    return HugeNumber.fromParts(sign, mantissa, larger.exponent);
  }

  multiply(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero() || other.isZero()) return HugeNumber.zero();
    return HugeNumber.fromParts(
      this.sign * other.sign,
      this.mantissa * other.mantissa,
      this.exponent + other.exponent
    );
  }

  divide(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (other.isZero()) throw new RangeError("Cannot divide by zero");
    if (this.isZero()) return HugeNumber.zero();
    return HugeNumber.fromParts(
      this.sign * other.sign,
      this.mantissa / other.mantissa,
      this.exponent - other.exponent
    );
  }

  power(exponent) {
    const numericExponent = Number(exponent);
    if (!Number.isFinite(numericExponent)) return HugeNumber.zero();
    if (this.isZero()) return numericExponent === 0 ? HugeNumber.one() : HugeNumber.zero();
    if (this.sign < 0 && !Number.isInteger(numericExponent)) return HugeNumber.zero();
    const sign = this.sign < 0 && Math.abs(numericExponent % 2) === 1 ? -1 : 1;
    const result = HugeNumber.fromLog10(this.log10() * numericExponent);
    result.sign = sign;
    return result;
  }

  floor() {
    if (this.sign <= 0) {
      if (this.sign === 0) return HugeNumber.zero();
      return this.negate().ceil().negate();
    }
    if (this.exponent < 0) return HugeNumber.zero();
    if (this.exponent >= 15) return this.clone();
    return new HugeNumber(Math.floor(this.toNumber()));
  }

  ceil() {
    if (this.sign <= 0) {
      if (this.sign === 0) return HugeNumber.zero();
      return this.negate().floor().negate();
    }
    if (this.exponent < 0) return HugeNumber.one();
    if (this.exponent >= 15) return this.clone();
    return new HugeNumber(Math.ceil(this.toNumber()));
  }

  max(otherValue) {
    return this.greaterThanOrEqual(otherValue) ? this.clone() : HugeNumber.from(otherValue);
  }

  log10() {
    if (this.sign <= 0) return -Infinity;
    return this.exponent + Math.log10(this.mantissa);
  }

  toNumber() {
    if (this.isZero()) return 0;
    if (this.exponent > 308) return this.sign * Infinity;
    if (this.exponent < -324) return 0;
    return this.sign * this.mantissa * Math.pow(10, this.exponent);
  }

  toString() {
    if (this.isZero()) return "0";
    if (this.exponent >= -6 && this.exponent <= 20) {
      const numeric = this.toNumber();
      if (Number.isFinite(numeric)) return String(numeric);
    }
    const coefficient = Number(this.mantissa.toPrecision(15));
    return `${this.sign < 0 ? "-" : ""}${coefficient}e${this.exponent}`;
  }

  toJSON() {
    return this.toString();
  }
}

const HN = value => HugeNumber.from(value);

/* ------------------------------- Game data ------------------------------- */

const DEFAULT_STATE = Object.freeze({
  version: GAME_VERSION,
  power: "0",
  prisms: 0,
  rebirthPoints: "0",
  powerUpgradeLevel: 0,
  powerResonatorLevel: 0,
  rebirthUpgradeLevel: 0,
  rebirthCoreLevel: 0,
  prismProgress: 0,
  prismYieldRemainder: 0,
  treeLevels: {},
  purchasedTreeNodes: [],
  totalRebirths: 0,
  totalPlayTime: 0,
  lastUpdateAt: Date.now()
});

const TREE_NODES = {
  originLens: {
    id: "originLens", name: "Origin Lens", category: "ROOT NODE", branch: "root", icon: "◇",
    x: 48, y: 52, cost: 1, costGrowth: 1, maxLevel: 1, prerequisites: [],
    description: "Stabilize the first junction of the Prism network.",
    effect: "powerMultiplier", value: 1.1
  },

  currentChannel: {
    id: "currentChannel", name: "Current Channel", category: "POWER BRANCH", branch: "power", icon: "⚡",
    x: 34, y: 41, cost: 3, costGrowth: 1.8, maxLevel: 10, prerequisites: ["originLens"],
    description: "Repeatably redirect Prism energy into the Power stream.",
    effect: "powerMultiplier", value: 1.12
  },
  compressedFlow: {
    id: "compressedFlow", name: "Compressed Flow", category: "POWER BRANCH", branch: "power", icon: "↯",
    x: 21, y: 28, cost: 12, costGrowth: 1, maxLevel: 1, prerequisites: ["currentChannel"],
    description: "Compress the stream into a denser production cycle.",
    effect: "powerMultiplier", value: 1.5
  },
  overdriveArray: {
    id: "overdriveArray", name: "Overdrive Array", category: "POWER CAPSTONE", branch: "power", icon: "✦",
    x: 9, y: 43, cost: 24, costGrowth: 1, maxLevel: 1, prerequisites: ["compressedFlow"],
    description: "Push the Power stream beyond its normal operating range.",
    effect: "powerMultiplier", value: 2
  },

  pulseTuning: {
    id: "pulseTuning", name: "Pulse Tuning", category: "PRISM SPEED", branch: "prism-speed", icon: "◷",
    x: 52, y: 32, cost: 4, costGrowth: 2, maxLevel: 8, prerequisites: ["originLens"],
    description: "Repeatably shorten the time needed to form each Prism.",
    effect: "prismIntervalMultiplier", value: 0.96
  },
  chromaticFrequency: {
    id: "chromaticFrequency", name: "Chromatic Frequency", category: "PRISM SPEED", branch: "prism-speed", icon: "⌁",
    x: 67, y: 22, cost: 14, costGrowth: 1, maxLevel: 1, prerequisites: ["pulseTuning"],
    description: "Synchronize the Prism cycle with a higher frequency.",
    effect: "prismIntervalMultiplier", value: 0.9
  },
  rapidSpectrum: {
    id: "rapidSpectrum", name: "Rapid Spectrum", category: "PRISM SPEED CAPSTONE", branch: "prism-speed", icon: "»",
    x: 84, y: 16, cost: 28, costGrowth: 1, maxLevel: 1, prerequisites: ["chromaticFrequency"],
    description: "Collapse the final delay between Prism formations.",
    effect: "prismIntervalMultiplier", value: 0.85
  },

  splitSpectrum: {
    id: "splitSpectrum", name: "Split Spectrum", category: "PRISM MULTIPLIER", branch: "prism-multi", icon: "◆",
    x: 65, y: 49, cost: 5, costGrowth: 2.2, maxLevel: 6, prerequisites: ["originLens"],
    description: "Repeatably increase the Prism yield of every completed cycle.",
    effect: "prismGainMultiplier", value: 1.25
  },
  mirroredYield: {
    id: "mirroredYield", name: "Mirrored Yield", category: "PRISM MULTIPLIER", branch: "prism-multi", icon: "◈",
    x: 79, y: 38, cost: 18, costGrowth: 1, maxLevel: 1, prerequisites: ["splitSpectrum"],
    description: "Mirror the output produced by every Prism cycle.",
    effect: "prismGainMultiplier", value: 2
  },
  spectrumBloom: {
    id: "spectrumBloom", name: "Spectrum Bloom", category: "PRISM MULTIPLIER CAPSTONE", branch: "prism-multi", icon: "✺",
    x: 92, y: 27, cost: 38, costGrowth: 1, maxLevel: 1, prerequisites: ["mirroredYield"],
    description: "Expand every Prism cycle into a larger chromatic bloom.",
    effect: "prismGainMultiplier", value: 3
  },

  recoveryCalibration: {
    id: "recoveryCalibration", name: "Recovery Calibration", category: "OFFLINE EFFICIENCY", branch: "offline-efficiency", icon: "90",
    x: 38, y: 70, cost: 6, costGrowth: 1, maxLevel: 1, prerequisites: ["originLens"],
    description: "Reduce the production loss that occurs while the game is closed.",
    effect: "offlineEfficiency", value: 0.9
  },
  deepRecovery: {
    id: "deepRecovery", name: "Deep Recovery", category: "OFFLINE EFFICIENCY", branch: "offline-efficiency", icon: "98",
    x: 23, y: 82, cost: 18, costGrowth: 1, maxLevel: 1, prerequisites: ["recoveryCalibration"],
    description: "Preserve nearly all production while the game is closed.",
    effect: "offlineEfficiency", value: 0.98
  },
  perfectRecovery: {
    id: "perfectRecovery", name: "Perfect Recovery", category: "OFFLINE EFFICIENCY CAPSTONE", branch: "offline-efficiency", icon: "100",
    x: 9, y: 69, cost: 40, costGrowth: 1, maxLevel: 1, prerequisites: ["deepRecovery"],
    description: "Remove the remaining offline production penalty.",
    effect: "offlineEfficiency", value: 1
  },

  extendedMemory: {
    id: "extendedMemory", name: "Extended Memory", category: "OFFLINE DURATION", branch: "offline-duration", icon: "12h",
    x: 58, y: 72, cost: 6, costGrowth: 1, maxLevel: 1, prerequisites: ["originLens"],
    description: "Store a longer period of closed-game progression.",
    effect: "offlineLimit", value: 12 * 60 * 60
  },
  persistentMemory: {
    id: "persistentMemory", name: "Persistent Memory", category: "OFFLINE DURATION", branch: "offline-duration", icon: "24h",
    x: 74, y: 84, cost: 20, costGrowth: 1, maxLevel: 1, prerequisites: ["extendedMemory"],
    description: "Preserve a full day of closed-game progression.",
    effect: "offlineLimit", value: 24 * 60 * 60
  },
  timelessArchive: {
    id: "timelessArchive", name: "Timeless Archive", category: "OFFLINE DURATION CAPSTONE", branch: "offline-duration", icon: "∞",
    x: 91, y: 70, cost: 44, costGrowth: 1, maxLevel: 1, prerequisites: ["persistentMemory"],
    description: "Store all closed-game progression without a time limit.",
    effect: "offlineLimit", value: Infinity
  }
};

const TREE_CONNECTIONS = [
  ["originLens", "currentChannel"], ["currentChannel", "compressedFlow"], ["compressedFlow", "overdriveArray"],
  ["originLens", "pulseTuning"], ["pulseTuning", "chromaticFrequency"], ["chromaticFrequency", "rapidSpectrum"],
  ["originLens", "splitSpectrum"], ["splitSpectrum", "mirroredYield"], ["mirroredYield", "spectrumBloom"],
  ["originLens", "recoveryCalibration"], ["recoveryCalibration", "deepRecovery"], ["deepRecovery", "perfectRecovery"],
  ["originLens", "extendedMemory"], ["extendedMemory", "persistentMemory"], ["persistentMemory", "timelessArchive"]
];

const UPGRADE_DEFINITIONS = {
  powerUpgradeLevel: { baseCost: 5, growth: 1.45, currencyField: "power", rounded: false, name: "Flux Condenser" },
  powerResonatorLevel: { baseCost: 20, growth: 1.58, currencyField: "power", rounded: false, name: "Power Resonator" },
  rebirthUpgradeLevel: { baseCost: 1, growth: 1.75, currencyField: "rebirthPoints", rounded: true, name: "Rebirth Amplifier" },
  rebirthCoreLevel: { baseCost: 2, growth: 1.9, currencyField: "rebirthPoints", rounded: true, name: "Rebirth Core" }
};

let state = createFreshState();
let selectedTreeNodeId = null;
let activePage = "power";
let lastTickAt = Date.now();
let autosaveAccumulator = 0;
let toastTimeout = null;
let tickTimer = null;
let lastOfflineReport = null;
let visibilityWasHidden = document.hidden;
let hiddenOfflineConsumedSeconds = 0;
const elements = {};

function createFreshState() {
  return {
    ...DEFAULT_STATE,
    power: HugeNumber.zero(),
    rebirthPoints: HugeNumber.zero(),
    treeLevels: {},
    purchasedTreeNodes: [],
    lastUpdateAt: Date.now()
  };
}

function cacheElements() {
  const ids = [
    "headerPower", "headerPowerRate", "headerPrism", "headerPrismTimer", "headerRebirthPoints", "saveStatus",
    "powerAmount", "powerPerSecond", "powerUpgradeLevel", "powerUpgradeEffect", "powerUpgradeNextEffect",
    "powerUpgradeCost", "buyPowerUpgrade", "buyMaxPowerUpgrade", "powerResonatorLevel", "powerResonatorEffect",
    "powerResonatorNextEffect", "powerResonatorCost", "buyPowerResonator", "buyMaxPowerResonator",
    "rebirthGain", "rebirthRequirementText", "rebirthButton", "rebirthUpgradeLevel", "rebirthUpgradeEffect",
    "rebirthUpgradeNextEffect", "rebirthUpgradeCost", "buyRebirthUpgrade", "buyMaxRebirthUpgrade",
    "rebirthCoreLevel", "rebirthCoreEffect", "rebirthCoreNextEffect", "rebirthCoreCost", "buyRebirthCore", "buyMaxRebirthCore",
    "treePrismBalance", "treeNodes", "treeLines", "nodePlaceholder", "nodeDetails", "selectedNodeIcon",
    "selectedNodeCategory", "selectedNodeName", "selectedNodeDescription", "selectedNodeEffect", "selectedNodeCost",
    "selectedNodeStatus", "selectedNodeRequirement", "purchaseTreeNode",
    "settingsButton", "settingsModal", "closeSettingsButton", "saveNowButton", "exportSaveButton", "importSaveButton",
    "resetSaveButton", "saveTextarea", "saveTextareaActions", "confirmImportButton", "cancelSaveTextButton",
    "developerStatus", "developerLogin", "developerPasscode", "unlockDeveloperButton", "developerTools",
    "developerResourceSelect", "developerResourceAmount", "developerAddResource", "developerSetResource",
    "developerUpgradeSelect", "developerUpgradeAmount", "developerAddUpgrade", "developerSetUpgrade",
    "developerUnlockTree", "developerResetTree", "developerOfflineHours", "developerSimulateOffline",
    "offlineModal", "closeOfflineButton", "offlineContinueButton", "offlineElapsedText", "offlineAppliedText",
    "offlineEfficiencyText", "offlinePowerGain", "offlinePrismGain", "offlineLimitNote", "offlineChart", "toast"
  ];
  for (const id of ids) elements[id] = document.getElementById(id);
}

/* ------------------------------ Formatting ------------------------------ */

function formatExponent(exponent) {
  const absolute = Math.abs(exponent);
  const sign = exponent < 0 ? "-" : "";
  if (absolute < 1_000) return `${sign}${Math.floor(absolute).toLocaleString()}`;
  const suffixes = ["K", "M", "B", "T", "Qa", "Qn"];
  const tier = Math.floor(Math.log10(absolute) / 3);
  if (tier >= 1 && tier <= suffixes.length) {
    const scaled = absolute / Math.pow(1_000, tier);
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return `${sign}${scaled.toFixed(decimals)}${suffixes[tier - 1]}`;
  }
  return `${sign}${absolute.toExponential(2).replace("+", "")}`;
}

function formatSmallNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "∞";
  if (value < 0) return `-${formatSmallNumber(Math.abs(value), maximumFractionDigits)}`;
  const suffixes = ["K", "M", "B", "T", "Qa", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];
  if (value < 1_000) {
    const decimals = value < 10 ? maximumFractionDigits : 1;
    const rounded = Number(value.toFixed(decimals));
    if (rounded < 1_000) return rounded.toLocaleString(undefined, { maximumFractionDigits: decimals });
  }
  let tier = Math.max(1, Math.floor(Math.log10(value) / 3));
  if (tier > suffixes.length) return value.toExponential(2).replace("+", "");
  let scaled = value / Math.pow(1_000, tier);
  let decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : maximumFractionDigits;
  let rounded = Number(scaled.toFixed(decimals));
  if (rounded >= 1_000) {
    tier += 1;
    if (tier > suffixes.length) return value.toExponential(2).replace("+", "");
    scaled = value / Math.pow(1_000, tier);
    decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : maximumFractionDigits;
    rounded = Number(scaled.toFixed(decimals));
  }
  return `${rounded.toFixed(decimals)} ${suffixes[tier - 1]}`;
}

function formatNumber(value, maximumFractionDigits = 2) {
  const huge = HugeNumber.from(value);
  if (huge.isZero()) return "0";
  if (huge.sign < 0) return `-${formatNumber(huge.absolute(), maximumFractionDigits)}`;

  if (huge.exponent < 33) return formatSmallNumber(huge.toNumber(), maximumFractionDigits);
  let displayMantissa = huge.mantissa;
  let displayExponent = huge.exponent;
  let decimals = displayMantissa >= 100 ? 0 : displayMantissa >= 10 ? 1 : maximumFractionDigits;
  let roundedMantissa = Number(displayMantissa.toFixed(decimals));
  if (roundedMantissa >= 10) {
    roundedMantissa = 1;
    displayExponent += 1;
    decimals = maximumFractionDigits;
  }
  return `${roundedMantissa.toFixed(decimals)}e${formatExponent(displayExponent)}`;
}

function formatInteger(value) {
  if (value instanceof HugeNumber || typeof value === "string") {
    const huge = HugeNumber.from(value).floor();
    if (huge.exponent < 15) return Math.floor(huge.toNumber()).toLocaleString();
    return formatNumber(huge);
  }
  if (!Number.isFinite(value)) return "∞";
  if (Math.abs(value) >= 1e15) return formatNumber(value);
  return Math.floor(value).toLocaleString();
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "No limit";
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  if (!days || parts.length < 3) parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

function pluralize(value, singular, plural = `${singular}s`) {
  return Math.abs(Number(value) - 1) < Number.EPSILON ? singular : plural;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/* ------------------------------- Formulas ------------------------------- */

function getTreeLevel(nodeId) {
  return Math.max(0, Math.floor(Number(state.treeLevels[nodeId]) || 0));
}

function hasTreeNode(nodeId) {
  return getTreeLevel(nodeId) > 0;
}

function getTreeNumberProduct(effectName) {
  return Object.values(TREE_NODES).reduce((total, node) => {
    const level = getTreeLevel(node.id);
    if (level <= 0 || node.effect !== effectName) return total;
    return total * Math.pow(node.value, level);
  }, 1);
}

function getTreeBigProduct(effectName) {
  return Object.values(TREE_NODES).reduce((total, node) => {
    const level = getTreeLevel(node.id);
    if (level <= 0 || node.effect !== effectName) return total;
    return total.multiply(HugeNumber.pow(node.value, level));
  }, HugeNumber.one());
}

function getTreeMaximum(effectName, fallbackValue) {
  return Object.values(TREE_NODES).reduce((maximum, node) => {
    if (getTreeLevel(node.id) <= 0 || node.effect !== effectName) return maximum;
    if (node.value === Infinity) return Infinity;
    return Math.max(maximum, node.value);
  }, fallbackValue);
}

function getUpgradeCost(levelField, level = state[levelField]) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  const rawCost = HN(definition.baseCost).multiply(HugeNumber.pow(definition.growth, level));
  return definition.rounded ? rawCost.ceil() : rawCost;
}

function getPowerUpgradeCost(level = state.powerUpgradeLevel) {
  return getUpgradeCost("powerUpgradeLevel", level);
}

function getPowerResonatorCost(level = state.powerResonatorLevel) {
  return getUpgradeCost("powerResonatorLevel", level);
}

function getRebirthUpgradeCost(level = state.rebirthUpgradeLevel) {
  return getUpgradeCost("rebirthUpgradeLevel", level);
}

function getRebirthCoreCost(level = state.rebirthCoreLevel) {
  return getUpgradeCost("rebirthCoreLevel", level);
}

function getFluxBaseBonus() {
  return HN(state.powerUpgradeLevel);
}

function getRebirthCoreBaseBonus() {
  return HN(state.rebirthCoreLevel).multiply(2);
}

function getBasePowerPerSecond() {
  return HugeNumber.one().add(getFluxBaseBonus()).add(getRebirthCoreBaseBonus());
}

function getPowerResonatorMultiplier() {
  return HugeNumber.pow(1.25, state.powerResonatorLevel);
}

function getRebirthPowerMultiplier() {
  return HugeNumber.pow(1.5, state.rebirthUpgradeLevel);
}

function getPowerPerSecond() {
  return getBasePowerPerSecond()
    .multiply(getPowerResonatorMultiplier())
    .multiply(getRebirthPowerMultiplier())
    .multiply(getTreeBigProduct("powerMultiplier"));
}

function getPrismInterval() {
  return Math.max(5, BASE_PRISM_INTERVAL * getTreeNumberProduct("prismIntervalMultiplier"));
}

function getPrismGainPerCycle() {
  return Math.max(1, getTreeNumberProduct("prismGainMultiplier"));
}

function getOfflineEfficiency() {
  return getTreeMaximum("offlineEfficiency", BASE_OFFLINE_EFFICIENCY);
}

function getOfflineLimitSeconds() {
  return getTreeMaximum("offlineLimit", BASE_OFFLINE_LIMIT_SECONDS);
}

function getRebirthGain() {
  if (state.power.lessThan(BASE_REBIRTH_REQUIREMENT)) return HugeNumber.zero();
  return state.power.divide(BASE_REBIRTH_REQUIREMENT).floor();
}

function getTreeNodeCost(node) {
  const level = getTreeLevel(node.id);
  return Math.max(1, Math.ceil(node.cost * Math.pow(node.costGrowth || 1, level)));
}

function getTreeNodeEffectText(node, level = getTreeLevel(node.id)) {
  const nextLevel = Math.min(node.maxLevel, level + 1);
  const isRepeatable = node.maxLevel > 1;

  if (node.effect === "powerMultiplier") {
    const current = Math.pow(node.value, level);
    const next = Math.pow(node.value, nextLevel);
    return isRepeatable
      ? `Current ×${formatSmallNumber(current)} · Next ×${formatSmallNumber(next)}`
      : `×${formatSmallNumber(node.value)} total Power generation`;
  }
  if (node.effect === "prismIntervalMultiplier") {
    const currentSeconds = BASE_PRISM_INTERVAL * Math.pow(node.value, level);
    const nextSeconds = BASE_PRISM_INTERVAL * Math.pow(node.value, nextLevel);
    return isRepeatable
      ? `This node: ${currentSeconds.toFixed(1)}s → ${nextSeconds.toFixed(1)}s base contribution`
      : `Prism cycles are ${Math.round((1 - node.value) * 100)}% faster`;
  }
  if (node.effect === "prismGainMultiplier") {
    const current = Math.pow(node.value, level);
    const next = Math.pow(node.value, nextLevel);
    return isRepeatable
      ? `Current ×${formatSmallNumber(current)} · Next ×${formatSmallNumber(next)} Prism yield`
      : `×${formatSmallNumber(node.value)} Prisms gained per cycle`;
  }
  if (node.effect === "offlineEfficiency") return `Offline efficiency becomes ${Math.round(node.value * 100)}%`;
  if (node.effect === "offlineLimit") return Number.isFinite(node.value)
    ? `Offline limit becomes ${formatDuration(node.value)}`
    : "Offline progression has no time limit";
  return "No effect";
}

/* ------------------------------ Game Systems ----------------------------- */

function canAfford(currency, cost) {
  if (currency instanceof HugeNumber || cost instanceof HugeNumber || typeof currency === "string" || typeof cost === "string") {
    return HugeNumber.from(currency).greaterThanOrEqual(cost);
  }
  return Number.isFinite(currency) && Number.isFinite(cost) && currency + 1e-9 >= cost;
}

function getGeometricTotalCost(levelField, startLevel, count) {
  if (count <= 0) return HugeNumber.zero();
  const definition = UPGRADE_DEFINITIONS[levelField];

  if (count <= 2_000) {
    let total = HugeNumber.zero();
    for (let offset = 0; offset < count; offset += 1) {
      total = total.add(getUpgradeCost(levelField, startLevel + offset));
    }
    return total;
  }

  const firstCost = HN(definition.baseCost).multiply(HugeNumber.pow(definition.growth, startLevel));
  const growthPower = HugeNumber.pow(definition.growth, count);
  let total = firstCost.multiply(growthPower.subtract(1)).divide(definition.growth - 1);

  // Ceil-based RP prices can differ from the raw geometric sum by less than
  // one per level. Add a conservative allowance so Buy Max never overspends.
  if (definition.rounded) total = total.add(count);
  return total;
}

function estimateAffordableCount(levelField, currency) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  const firstCost = getUpgradeCost(levelField, state[levelField]);
  if (!canAfford(currency, firstCost)) return 0;

  const ratio = HugeNumber.from(currency).multiply(definition.growth - 1).divide(firstCost);
  const logOnePlusRatio = ratio.exponent > 14
    ? ratio.log10()
    : Math.log10(1 + Math.max(0, ratio.toNumber()));
  let estimate = Math.max(1, Math.floor(logOnePlusRatio / Math.log10(definition.growth)));
  estimate = Math.min(estimate + 2, Number.MAX_SAFE_INTEGER);

  let low = 0;
  let high = estimate;
  while (high < Number.MAX_SAFE_INTEGER && canAfford(currency, getGeometricTotalCost(levelField, state[levelField], high))) {
    low = high;
    high = Math.min(Number.MAX_SAFE_INTEGER, Math.max(high + 1, high * 2));
    if (high === low) break;
  }

  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (canAfford(currency, getGeometricTotalCost(levelField, state[levelField], middle))) low = middle;
    else high = middle;
  }

  return canAfford(currency, getGeometricTotalCost(levelField, state[levelField], high)) ? high : low;
}

function buyRepeatableUpgrade(levelField, amount = 1) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  const currency = state[definition.currencyField];
  let purchased = 0;
  let totalCost = HugeNumber.zero();

  if (amount === Infinity) {
    purchased = estimateAffordableCount(levelField, currency);
    if (purchased > 0) totalCost = getGeometricTotalCost(levelField, state[levelField], purchased);
  } else {
    purchased = Math.max(0, Math.floor(amount));
    totalCost = getGeometricTotalCost(levelField, state[levelField], purchased);
    if (!canAfford(currency, totalCost)) purchased = 0;
  }

  if (purchased <= 0) return;
  state[definition.currencyField] = HugeNumber.from(currency).subtract(totalCost).max(0);
  state[levelField] += purchased;
  showToast(`${definition.name} +${formatInteger(purchased)}`);
  renderAll();
}

function buyPowerUpgrade(amount = 1) { buyRepeatableUpgrade("powerUpgradeLevel", amount); }
function buyPowerResonator(amount = 1) { buyRepeatableUpgrade("powerResonatorLevel", amount); }
function buyRebirthUpgrade(amount = 1) { buyRepeatableUpgrade("rebirthUpgradeLevel", amount); }
function buyRebirthCore(amount = 1) { buyRepeatableUpgrade("rebirthCoreLevel", amount); }

function performRebirth() {
  const gain = getRebirthGain();
  if (gain.isZero()) return;
  state.rebirthPoints = state.rebirthPoints.add(gain);
  state.totalRebirths += 1;
  state.power = HugeNumber.zero();
  state.powerUpgradeLevel = 0;
  state.powerResonatorLevel = 0;
  showToast(`Rebirth complete: +${formatInteger(gain)} RP`);
  saveGame(false);
  renderAll();
}

function areTreePrerequisitesMet(node) {
  return node.prerequisites.every(hasTreeNode);
}

function isTreeNodeVisible(node) {
  return node.id === "originLens" || hasTreeNode(node.id) || areTreePrerequisitesMet(node);
}

function getTreeNodeState(node) {
  if (!areTreePrerequisitesMet(node)) return "locked";
  const level = getTreeLevel(node.id);
  if (level >= node.maxLevel) return "maxed";
  if (level > 0) return "owned";
  return "available";
}

function purchaseSelectedTreeNode() {
  const node = TREE_NODES[selectedTreeNodeId];
  if (!node || !isTreeNodeVisible(node)) return;
  const nodeState = getTreeNodeState(node);
  if (!["available", "owned"].includes(nodeState)) return;
  const cost = getTreeNodeCost(node);
  if (!canAfford(state.prisms, cost)) return;

  state.prisms -= cost;
  state.treeLevels[node.id] = getTreeLevel(node.id) + 1;
  resolvePrismGeneration(false);
  showToast(`${node.name} ${node.maxLevel > 1 ? `level ${state.treeLevels[node.id]}` : "purchased"}`);
  saveGame(false);
  renderAll();
}

function resolvePrismGeneration(showFeedback = false) {
  const interval = getPrismInterval();
  if (state.prismProgress < interval) return 0;
  const cycles = Math.floor(state.prismProgress / interval);
  const rawGenerated = cycles * getPrismGainPerCycle() + state.prismYieldRemainder;
  const generated = Math.floor(rawGenerated + 1e-9);
  state.prismYieldRemainder = Math.max(0, rawGenerated - generated);
  state.prisms += generated;
  state.prismProgress -= cycles * interval;
  if (showFeedback && generated > 0) showToast(`+${generated} ${pluralize(generated, "Prism")}`);
  if (activePage === "tree" && elements.treeNodes) renderTree();
  return generated;
}

function applyProgress(seconds, efficiency = 1) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const safeEfficiency = clamp(Number(efficiency) || 0, 0, 1);
  if (safeSeconds <= 0 || safeEfficiency <= 0) return { powerGain: HugeNumber.zero(), prismGain: 0 };

  const powerBefore = state.power.clone();
  const prismBefore = state.prisms;
  state.power = state.power.add(getPowerPerSecond().multiply(safeSeconds * safeEfficiency));
  state.prismProgress += safeSeconds * safeEfficiency;
  resolvePrismGeneration(false);
  state.totalPlayTime += safeSeconds;

  return { powerGain: state.power.subtract(powerBefore), prismGain: state.prisms - prismBefore };
}

function applyOfflineProgress(elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const efficiency = getOfflineEfficiency();
  const limitSeconds = getOfflineLimitSeconds();
  const appliedSeconds = Number.isFinite(limitSeconds) ? Math.min(elapsed, limitSeconds) : elapsed;
  const powerBefore = state.power.clone();
  const prismBefore = state.prisms;
  const gains = applyProgress(appliedSeconds, efficiency);
  return {
    elapsedSeconds: elapsed, appliedSeconds, efficiency, limitSeconds,
    capped: Number.isFinite(limitSeconds) && elapsed > limitSeconds,
    powerBefore, powerAfter: state.power.clone(), powerGain: gains.powerGain,
    prismBefore, prismAfter: state.prisms, prismGain: gains.prismGain
  };
}

function applySuspendedBackgroundProgress(elapsedSeconds, trackHiddenSession) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const efficiency = getOfflineEfficiency();
  const limitSeconds = getOfflineLimitSeconds();
  const consumed = trackHiddenSession ? hiddenOfflineConsumedSeconds : 0;
  const remaining = Number.isFinite(limitSeconds) ? Math.max(0, limitSeconds - consumed) : Infinity;
  const appliedSeconds = Math.min(elapsed, remaining);
  if (appliedSeconds > 0) {
    applyProgress(appliedSeconds, efficiency);
    if (trackHiddenSession) hiddenOfflineConsumedSeconds += appliedSeconds;
  }
  return appliedSeconds;
}

function processRealTime(treatAsHidden = visibilityWasHidden) {
  const now = Date.now();
  const elapsedSeconds = Math.max(0, (now - lastTickAt) / 1_000);
  lastTickAt = now;
  if (elapsedSeconds > 0) {
    const eventLoopWasSuspended = elapsedSeconds > BACKGROUND_SUSPEND_THRESHOLD_SECONDS;
    if (eventLoopWasSuspended) applySuspendedBackgroundProgress(elapsedSeconds, treatAsHidden);
    else applyProgress(elapsedSeconds, 1);
    autosaveAccumulator += elapsedSeconds * 1_000;
  }
  return elapsedSeconds;
}

/* ---------------------------------- UI ---------------------------------- */

function setActivePage(pageName) {
  activePage = pageName;
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.page === pageName));
  document.querySelectorAll("[data-page-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.pagePanel === pageName));
  if (pageName === "tree") renderTree();
}

function renderHeader() {
  const pps = getPowerPerSecond();
  const prismInterval = getPrismInterval();
  const remaining = Math.max(0, prismInterval - state.prismProgress);
  elements.headerPower.textContent = formatNumber(state.power);
  elements.headerPowerRate.textContent = `+${formatNumber(pps)}/s`;
  elements.headerPrism.textContent = formatInteger(state.prisms);
  elements.headerPrismTimer.textContent = `+${formatNumber(getPrismGainPerCycle())} in ${remaining.toFixed(1)}s`;
  elements.headerRebirthPoints.textContent = formatInteger(state.rebirthPoints);
}

function renderPowerPage() {
  const pps = getPowerPerSecond();
  const fluxCost = getPowerUpgradeCost();
  const resonatorCost = getPowerResonatorCost();
  const resonatorMultiplier = getPowerResonatorMultiplier();

  elements.powerAmount.textContent = formatNumber(state.power);
  elements.powerPerSecond.textContent = `${formatNumber(pps)} Power per second`;
  elements.powerUpgradeLevel.textContent = formatInteger(state.powerUpgradeLevel);
  elements.powerUpgradeEffect.textContent = `+${formatNumber(getFluxBaseBonus())}/s`;
  elements.powerUpgradeNextEffect.textContent = `+${formatNumber(getFluxBaseBonus().add(1))}/s`;
  elements.powerUpgradeCost.textContent = `${formatNumber(fluxCost)} Power`;
  elements.buyPowerUpgrade.disabled = !canAfford(state.power, fluxCost);
  elements.buyMaxPowerUpgrade.disabled = !canAfford(state.power, fluxCost);

  elements.powerResonatorLevel.textContent = formatInteger(state.powerResonatorLevel);
  elements.powerResonatorEffect.textContent = `×${formatNumber(resonatorMultiplier)}`;
  elements.powerResonatorNextEffect.textContent = `×${formatNumber(resonatorMultiplier.multiply(1.25))}`;
  elements.powerResonatorCost.textContent = `${formatNumber(resonatorCost)} Power`;
  elements.buyPowerResonator.disabled = !canAfford(state.power, resonatorCost);
  elements.buyMaxPowerResonator.disabled = !canAfford(state.power, resonatorCost);
}

function renderRebirthPage() {
  const gain = getRebirthGain();
  const ampCost = getRebirthUpgradeCost();
  const coreCost = getRebirthCoreCost();
  const currentMultiplier = getRebirthPowerMultiplier();
  const requirementRemaining = HN(BASE_REBIRTH_REQUIREMENT).subtract(state.power).max(0);

  elements.rebirthGain.textContent = `${formatInteger(gain)} Rebirth Points`;
  elements.rebirthButton.disabled = gain.isZero();
  elements.rebirthRequirementText.textContent = gain.greaterThan(0)
    ? `Ready. ${formatInteger(state.power.floor())} Power grants ${formatInteger(gain)} RP.`
    : `${formatNumber(requirementRemaining)} more Power required.`;

  elements.rebirthUpgradeLevel.textContent = formatInteger(state.rebirthUpgradeLevel);
  elements.rebirthUpgradeEffect.textContent = `×${formatNumber(currentMultiplier)}`;
  elements.rebirthUpgradeNextEffect.textContent = `×${formatNumber(currentMultiplier.multiply(1.5))}`;
  elements.rebirthUpgradeCost.textContent = `${formatInteger(ampCost)} RP`;
  elements.buyRebirthUpgrade.disabled = !canAfford(state.rebirthPoints, ampCost);
  elements.buyMaxRebirthUpgrade.disabled = !canAfford(state.rebirthPoints, ampCost);

  elements.rebirthCoreLevel.textContent = formatInteger(state.rebirthCoreLevel);
  elements.rebirthCoreEffect.textContent = `+${formatNumber(getRebirthCoreBaseBonus())}/s`;
  elements.rebirthCoreNextEffect.textContent = `+${formatNumber(getRebirthCoreBaseBonus().add(2))}/s`;
  elements.rebirthCoreCost.textContent = `${formatInteger(coreCost)} RP`;
  elements.buyRebirthCore.disabled = !canAfford(state.rebirthPoints, coreCost);
  elements.buyMaxRebirthCore.disabled = !canAfford(state.rebirthPoints, coreCost);
}

function createCurvedTreePath(from, to, index) {
  const x1 = from.x * 10;
  const y1 = from.y * 7.6;
  const x2 = to.x * 10;
  const y2 = to.y * 7.6;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const direction = index % 2 === 0 ? 1 : -1;
  const bend = Math.min(34, Math.hypot(dx, dy) * 0.09) * direction;
  const cx = (x1 + x2) / 2 - (dy / Math.max(1, Math.hypot(dx, dy))) * bend;
  const cy = (y1 + y2) / 2 + (dx / Math.max(1, Math.hypot(dx, dy))) * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function renderTree() {
  elements.treePrismBalance.textContent = formatInteger(state.prisms);
  elements.treeNodes.innerHTML = "";
  elements.treeLines.innerHTML = "";

  TREE_CONNECTIONS.forEach(([fromId, toId], index) => {
    const from = TREE_NODES[fromId];
    const to = TREE_NODES[toId];
    if (!isTreeNodeVisible(from) || !isTreeNodeVisible(to)) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", createCurvedTreePath(from, to, index));
    path.classList.add("tree-line");
    if (hasTreeNode(fromId)) path.classList.add("active");
    elements.treeLines.appendChild(path);
  });

  for (const node of Object.values(TREE_NODES)) {
    if (!isTreeNodeVisible(node)) continue;
    const nodeState = getTreeNodeState(node);
    const level = getTreeLevel(node.id);
    const cost = getTreeNodeCost(node);
    const affordable = ["available", "owned"].includes(nodeState) && state.prisms >= cost;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node ${node.branch} ${nodeState}${affordable ? " affordable" : ""}${selectedTreeNodeId === node.id ? " selected" : ""}`;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.dataset.nodeId = node.id;
    button.setAttribute("aria-label", `${node.name}, ${nodeState}, level ${level} of ${node.maxLevel}`);

    const levelLabel = node.maxLevel > 1 ? `${level}/${node.maxLevel}` : nodeState === "maxed" ? "✓" : "ONE";
    const costLabel = nodeState === "maxed" ? "Maxed" : `${formatInteger(cost)} ◇`;
    button.innerHTML = `
      <span class="hex-border"></span>
      <span class="hex-fill"></span>
      <span class="hex-inner">
        <span class="node-tier-mini">${levelLabel}</span>
        <span class="node-icon">${node.icon}</span>
        <span class="node-cost-mini">${costLabel}</span>
      </span>
    `;
    button.addEventListener("click", () => selectTreeNode(node.id));
    elements.treeNodes.appendChild(button);
  }

  renderSelectedTreeNode();
}

function selectTreeNode(nodeId) {
  selectedTreeNodeId = nodeId;
  renderTree();
}

function renderSelectedTreeNode() {
  const node = TREE_NODES[selectedTreeNodeId];
  if (!node || !isTreeNodeVisible(node)) {
    elements.nodePlaceholder.classList.remove("hidden");
    elements.nodeDetails.classList.add("hidden");
    return;
  }

  elements.nodePlaceholder.classList.add("hidden");
  elements.nodeDetails.classList.remove("hidden");
  const nodeState = getTreeNodeState(node);
  const level = getTreeLevel(node.id);
  const cost = getTreeNodeCost(node);
  const prerequisiteNames = node.prerequisites.length
    ? node.prerequisites.map(id => TREE_NODES[id].name).join(" + ")
    : "None";

  elements.selectedNodeIcon.textContent = node.icon;
  elements.selectedNodeCategory.textContent = node.category;
  elements.selectedNodeName.textContent = node.name;
  elements.selectedNodeDescription.textContent = node.description;
  elements.selectedNodeEffect.textContent = getTreeNodeEffectText(node, level);
  elements.selectedNodeCost.textContent = nodeState === "maxed" ? "Maxed" : `${formatInteger(cost)} ${pluralize(cost, "Prism")}`;
  elements.selectedNodeStatus.textContent = node.maxLevel > 1
    ? `Level ${level}/${node.maxLevel}`
    : nodeState === "maxed" ? "Purchased" : "Available";
  elements.selectedNodeRequirement.textContent = prerequisiteNames;

  elements.purchaseTreeNode.disabled = nodeState === "maxed" || state.prisms < cost;
  elements.purchaseTreeNode.textContent = nodeState === "maxed"
    ? "Maxed"
    : state.prisms < cost
      ? `Need ${formatInteger(cost - state.prisms)} more ${pluralize(cost - state.prisms, "Prism")}`
      : node.maxLevel > 1 ? "Buy level" : "Purchase node";
}

function renderAll() {
  renderHeader();
  renderPowerPage();
  renderRebirthPage();
  if (activePage === "tree") renderTree();
}

function showToast(message) {
  clearTimeout(toastTimeout);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimeout = setTimeout(() => elements.toast.classList.remove("visible"), 2100);
}

/* -------------------------- Offline Progress UI -------------------------- */

function showOfflineReport(report) {
  lastOfflineReport = report;
  elements.offlineElapsedText.textContent = formatDuration(report.elapsedSeconds);
  elements.offlineAppliedText.textContent = formatDuration(report.appliedSeconds);
  elements.offlineEfficiencyText.textContent = `${Math.round(report.efficiency * 100)}%`;
  elements.offlinePowerGain.textContent = `+${formatNumber(report.powerGain)}`;
  elements.offlinePrismGain.textContent = `+${formatInteger(report.prismGain)}`;
  elements.offlineLimitNote.textContent = Number.isFinite(report.limitSeconds)
    ? `${formatDuration(report.limitSeconds)} limit${report.capped ? " reached" : ""}`
    : "No time limit";
  elements.offlineModal.classList.remove("hidden");
  requestAnimationFrame(() => drawOfflineChart(report));
}

function closeOfflineReport() {
  elements.offlineModal.classList.add("hidden");
  lastOfflineReport = null;
}

function drawOfflineChart(report) {
  const canvas = elements.offlineChart;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(320, Math.floor(rect.width || 800));
  const cssHeight = Math.max(220, Math.min(340, Math.floor(cssWidth * 0.4)));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.height = `${cssHeight}px`;

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  const computed = getComputedStyle(document.documentElement);
  const grid = computed.getPropertyValue("--line-strong").trim() || "rgba(157,196,232,.28)";
  const text = computed.getPropertyValue("--muted").trim() || "#8fa5b8";
  const accent = computed.getPropertyValue("--warning").trim() || "#ffc65c";
  const axis = "rgba(244,248,252,.88)";
  context.fillStyle = "#07111a";
  context.fillRect(0, 0, cssWidth, cssHeight);

  const margin = { left: 88, right: 24, top: 18, bottom: 54 };
  const plotWidth = cssWidth - margin.left - margin.right;
  const plotHeight = cssHeight - margin.top - margin.bottom;
  context.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.lineWidth = 1;
  context.strokeStyle = grid;
  context.fillStyle = text;

  const xTicks = 6;
  const yTicks = 4;
  for (let i = 0; i <= xTicks; i += 1) {
    const x = margin.left + (plotWidth * i) / xTicks;
    context.beginPath();
    context.moveTo(x, margin.top);
    context.lineTo(x, margin.top + plotHeight);
    context.stroke();
    context.textAlign = i === 0 ? "left" : i === xTicks ? "right" : "center";
    context.fillText(formatDuration((report.appliedSeconds * i) / xTicks), x, cssHeight - 22);
  }

  for (let i = 0; i <= yTicks; i += 1) {
    const progress = i / yTicks;
    const y = margin.top + plotHeight - plotHeight * progress;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(margin.left + plotWidth, y);
    context.stroke();
    const value = report.powerBefore.add(report.powerGain.multiply(progress));
    context.textAlign = "right";
    context.fillText(formatNumber(value), margin.left - 10, y + 4);
  }

  context.strokeStyle = axis;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(margin.left, margin.top);
  context.lineTo(margin.left, margin.top + plotHeight);
  context.lineTo(margin.left + plotWidth, margin.top + plotHeight);
  context.stroke();

  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  const sampleCount = 48;
  for (let i = 0; i <= sampleCount; i += 1) {
    const progress = i / sampleCount;
    const eased = 1 - Math.pow(1 - progress, 1.35);
    const x = margin.left + plotWidth * progress;
    const y = margin.top + plotHeight - plotHeight * eased;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(margin.left + plotWidth, margin.top, 4.5, 0, Math.PI * 2);
  context.fill();
}

/* ------------------------------- Save Data ------------------------------- */

function sanitizeFiniteNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function sanitizeLoadedState(candidate) {
  const clean = createFreshState();
  if (!candidate || typeof candidate !== "object") return clean;

  clean.power = HugeNumber.from(candidate.power).max(0);
  clean.rebirthPoints = HugeNumber.from(candidate.rebirthPoints).max(0);
  clean.prisms = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.prisms));
  clean.prismProgress = sanitizeFiniteNonNegativeNumber(candidate.prismProgress);
  clean.prismYieldRemainder = sanitizeFiniteNonNegativeNumber(candidate.prismYieldRemainder);
  clean.totalRebirths = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.totalRebirths));
  clean.totalPlayTime = sanitizeFiniteNonNegativeNumber(candidate.totalPlayTime);
  clean.lastUpdateAt = sanitizeFiniteNonNegativeNumber(candidate.lastUpdateAt, Date.now());

  for (const field of Object.keys(UPGRADE_DEFINITIONS)) {
    clean[field] = Math.floor(sanitizeFiniteNonNegativeNumber(candidate[field]));
  }

  const requestedLevels = {};
  if (candidate.treeLevels && typeof candidate.treeLevels === "object") {
    for (const [nodeId, rawLevel] of Object.entries(candidate.treeLevels)) {
      if (!Object.hasOwn(TREE_NODES, nodeId)) continue;
      requestedLevels[nodeId] = Math.min(TREE_NODES[nodeId].maxLevel, Math.floor(sanitizeFiniteNonNegativeNumber(rawLevel)));
    }
  }
  if (Array.isArray(candidate.purchasedTreeNodes)) {
    for (const nodeId of candidate.purchasedTreeNodes) {
      if (Object.hasOwn(TREE_NODES, nodeId)) requestedLevels[nodeId] = Math.max(1, requestedLevels[nodeId] || 0);
    }
  }

  const acceptedLevels = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(TREE_NODES)) {
      if (!requestedLevels[node.id] || acceptedLevels[node.id]) continue;
      if (node.prerequisites.every(id => (acceptedLevels[id] || 0) > 0)) {
        acceptedLevels[node.id] = requestedLevels[node.id];
        changed = true;
      }
    }
  }
  clean.treeLevels = acceptedLevels;
  clean.purchasedTreeNodes = Object.keys(acceptedLevels);
  clean.version = GAME_VERSION;
  return clean;
}

function saveGame(showFeedback = true) {
  try {
    state.lastUpdateAt = Date.now();
    state.purchasedTreeNodes = Object.keys(state.treeLevels).filter(id => getTreeLevel(id) > 0);
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    elements.saveStatus.textContent = "Saved";
    if (showFeedback) showToast("Game saved");
    setTimeout(() => {
      if (elements.saveStatus.textContent === "Saved") elements.saveStatus.textContent = "Ready";
    }, 1400);
  } catch (error) {
    console.error("Failed to save Eonshift:", error);
    elements.saveStatus.textContent = "Error";
    if (showFeedback) showToast("Save failed");
  }
}

function loadGame() {
  try {
    const rawSave = localStorage.getItem(SAVE_KEY);
    if (!rawSave) return false;
    state = sanitizeLoadedState(JSON.parse(rawSave));
    return true;
  } catch (error) {
    console.error("Failed to load Eonshift:", error);
    state = createFreshState();
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeSave() {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(state)));
}

function decodeSave(encoded) {
  const json = new TextDecoder().decode(base64ToBytes(encoded.trim()));
  return sanitizeLoadedState(JSON.parse(json));
}

function showSaveTextarea(mode) {
  elements.saveTextarea.classList.remove("hidden");
  elements.saveTextareaActions.classList.remove("hidden");
  elements.saveTextarea.dataset.mode = mode;
  if (mode === "export") {
    processRealTime();
    elements.saveTextarea.value = encodeSave();
    elements.saveTextarea.readOnly = true;
    elements.confirmImportButton.classList.add("hidden");
    elements.saveTextarea.select();
  } else {
    elements.saveTextarea.value = "";
    elements.saveTextarea.readOnly = false;
    elements.confirmImportButton.classList.remove("hidden");
    elements.saveTextarea.focus();
  }
}

function hideSaveTextarea() {
  elements.saveTextarea.classList.add("hidden");
  elements.saveTextareaActions.classList.add("hidden");
  elements.saveTextarea.value = "";
  elements.saveTextarea.dataset.mode = "";
}

function importSave() {
  try {
    state = decodeSave(elements.saveTextarea.value);
    selectedTreeNodeId = null;
    lastTickAt = Date.now();
    saveGame(false);
    hideSaveTextarea();
    closeSettings();
    renderAll();
    showToast("Save imported");
  } catch (error) {
    console.error("Failed to import save:", error);
    showToast("Invalid save data");
  }
}

function resetGame() {
  if (!window.confirm("Reset all Eonshift progress? This cannot be undone unless you exported a backup.")) return;
  state = createFreshState();
  selectedTreeNodeId = null;
  localStorage.removeItem(SAVE_KEY);
  lastTickAt = Date.now();
  saveGame(false);
  closeSettings();
  renderAll();
  showToast("Progress reset");
}

/* ------------------------------- Settings -------------------------------- */

function openSettings() {
  elements.settingsModal.classList.remove("hidden");
  elements.closeSettingsButton.focus();
}

function closeSettings() {
  elements.settingsModal.classList.add("hidden");
  hideSaveTextarea();
  elements.settingsButton.focus();
}

/* ---------------------------- Developer tools ---------------------------- */

function isDeveloperUnlocked() {
  return sessionStorage.getItem(DEV_SESSION_KEY) === "unlocked";
}

function updateDeveloperAccessUI() {
  const unlocked = isDeveloperUnlocked();
  elements.developerStatus.textContent = unlocked ? "Unlocked" : "Locked";
  elements.developerLogin.classList.toggle("hidden", unlocked);
  elements.developerTools.classList.toggle("hidden", !unlocked);
}

function unlockDeveloperAccess() {
  if (elements.developerPasscode.value !== DEV_PASSCODE) {
    showToast("Incorrect developer passcode");
    return;
  }
  sessionStorage.setItem(DEV_SESSION_KEY, "unlocked");
  elements.developerPasscode.value = "";
  updateDeveloperAccessUI();
  showToast("Developer access unlocked");
}

function getDeveloperNumberInput(element, integerOnly = false) {
  const value = Number(element.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return integerOnly ? Math.floor(value) : value;
}

function developerChangeResource(mode) {
  if (!isDeveloperUnlocked()) return;
  const field = elements.developerResourceSelect.value;
  const raw = elements.developerResourceAmount.value.trim();
  if (!Object.hasOwn(state, field)) return;

  if (field === "prisms") {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("Enter a valid resource amount");
      return;
    }
    state.prisms = Math.floor(mode === "add" ? state.prisms + amount : amount);
  } else {
    const amount = HugeNumber.from(raw);
    if (amount.sign < 0 || (!raw || amount.isZero() && !/^0(?:\.0+)?$/i.test(raw))) {
      showToast("Use a value such as 1000 or 1e100K");
      return;
    }
    state[field] = mode === "add" ? HugeNumber.from(state[field]).add(amount) : amount;
  }

  saveGame(false);
  renderAll();
  showToast(`${field} ${mode === "add" ? "increased" : "set"}`);
}

function developerChangeUpgrade(mode) {
  if (!isDeveloperUnlocked()) return;
  const field = elements.developerUpgradeSelect.value;
  const amount = getDeveloperNumberInput(elements.developerUpgradeAmount, true);
  if (amount === null || !Object.hasOwn(state, field)) {
    showToast("Enter a valid upgrade level");
    return;
  }
  state[field] = mode === "add" ? state[field] + amount : amount;
  state[field] = Math.floor(state[field]);
  saveGame(false);
  renderAll();
  showToast(`Upgrade level ${mode === "add" ? "increased" : "set"}`);
}

function developerUnlockTree() {
  if (!isDeveloperUnlocked()) return;
  state.treeLevels = Object.fromEntries(Object.values(TREE_NODES).map(node => [node.id, node.maxLevel]));
  resolvePrismGeneration(false);
  saveGame(false);
  renderAll();
  showToast("All Prism Tree nodes maxed");
}

function developerResetTree() {
  if (!isDeveloperUnlocked()) return;
  state.treeLevels = {};
  state.purchasedTreeNodes = [];
  selectedTreeNodeId = null;
  saveGame(false);
  renderAll();
  showToast("Prism Tree reset");
}

function developerSimulateOffline() {
  if (!isDeveloperUnlocked()) return;
  const hours = getDeveloperNumberInput(elements.developerOfflineHours, false);
  if (hours === null || hours <= 0) {
    showToast("Enter a valid number of hours");
    return;
  }
  const report = applyOfflineProgress(hours * 3_600);
  saveGame(false);
  renderAll();
  closeSettings();
  showOfflineReport(report);
}

/* ------------------------------- Game Loop -------------------------------- */

function gameTick() {
  processRealTime();
  if (!document.hidden) {
    renderHeader();
    renderPowerPage();
    renderRebirthPage();
    if (activePage === "tree") {
      elements.treePrismBalance.textContent = formatInteger(state.prisms);
      renderSelectedTreeNode();
    }
  }
  if (autosaveAccumulator >= AUTOSAVE_INTERVAL_MS) {
    autosaveAccumulator = 0;
    saveGame(false);
  }
}

/* ------------------------------ Event Setup ------------------------------ */

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach(button => button.addEventListener("click", () => setActivePage(button.dataset.page)));
  elements.buyPowerUpgrade.addEventListener("click", () => buyPowerUpgrade(1));
  elements.buyMaxPowerUpgrade.addEventListener("click", () => buyPowerUpgrade(Infinity));
  elements.buyPowerResonator.addEventListener("click", () => buyPowerResonator(1));
  elements.buyMaxPowerResonator.addEventListener("click", () => buyPowerResonator(Infinity));
  elements.rebirthButton.addEventListener("click", performRebirth);
  elements.buyRebirthUpgrade.addEventListener("click", () => buyRebirthUpgrade(1));
  elements.buyMaxRebirthUpgrade.addEventListener("click", () => buyRebirthUpgrade(Infinity));
  elements.buyRebirthCore.addEventListener("click", () => buyRebirthCore(1));
  elements.buyMaxRebirthCore.addEventListener("click", () => buyRebirthCore(Infinity));
  elements.purchaseTreeNode.addEventListener("click", purchaseSelectedTreeNode);

  elements.settingsButton.addEventListener("click", openSettings);
  elements.closeSettingsButton.addEventListener("click", closeSettings);
  elements.settingsModal.addEventListener("click", event => { if (event.target === elements.settingsModal) closeSettings(); });
  elements.saveNowButton.addEventListener("click", () => { processRealTime(); saveGame(true); });
  elements.exportSaveButton.addEventListener("click", () => showSaveTextarea("export"));
  elements.importSaveButton.addEventListener("click", () => showSaveTextarea("import"));
  elements.confirmImportButton.addEventListener("click", importSave);
  elements.cancelSaveTextButton.addEventListener("click", hideSaveTextarea);
  elements.resetSaveButton.addEventListener("click", resetGame);

  elements.unlockDeveloperButton.addEventListener("click", unlockDeveloperAccess);
  elements.developerPasscode.addEventListener("keydown", event => { if (event.key === "Enter") unlockDeveloperAccess(); });
  elements.developerAddResource.addEventListener("click", () => developerChangeResource("add"));
  elements.developerSetResource.addEventListener("click", () => developerChangeResource("set"));
  elements.developerAddUpgrade.addEventListener("click", () => developerChangeUpgrade("add"));
  elements.developerSetUpgrade.addEventListener("click", () => developerChangeUpgrade("set"));
  elements.developerUnlockTree.addEventListener("click", developerUnlockTree);
  elements.developerResetTree.addEventListener("click", developerResetTree);
  elements.developerSimulateOffline.addEventListener("click", developerSimulateOffline);

  elements.closeOfflineButton.addEventListener("click", closeOfflineReport);
  elements.offlineContinueButton.addEventListener("click", closeOfflineReport);
  elements.offlineModal.addEventListener("click", event => { if (event.target === elements.offlineModal) closeOfflineReport(); });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!elements.offlineModal.classList.contains("hidden")) closeOfflineReport();
    else if (!elements.settingsModal.classList.contains("hidden")) closeSettings();
  });

  document.addEventListener("visibilitychange", () => {
    processRealTime(visibilityWasHidden);
    visibilityWasHidden = document.hidden;
    if (document.hidden) {
      hiddenOfflineConsumedSeconds = 0;
      saveGame(false);
    } else {
      hiddenOfflineConsumedSeconds = 0;
      renderAll();
    }
  });

  window.addEventListener("resize", () => {
    if (lastOfflineReport && !elements.offlineModal.classList.contains("hidden")) drawOfflineChart(lastOfflineReport);
  });
  window.addEventListener("pagehide", () => { processRealTime(visibilityWasHidden); saveGame(false); });
  window.addEventListener("beforeunload", () => { processRealTime(visibilityWasHidden); saveGame(false); });
}

function init() {
  cacheElements();
  const sameTabSession = sessionStorage.getItem(SESSION_KEY) === "active";
  sessionStorage.setItem(SESSION_KEY, "active");
  const loaded = loadGame();
  const now = Date.now();
  const elapsedSinceSave = loaded ? Math.max(0, (now - state.lastUpdateAt) / 1_000) : 0;
  lastTickAt = now;
  visibilityWasHidden = document.hidden;
  hiddenOfflineConsumedSeconds = 0;
  bindEvents();
  updateDeveloperAccessUI();

  if (elapsedSinceSave > 1) {
    if (sameTabSession) {
      if (elapsedSinceSave > BACKGROUND_SUSPEND_THRESHOLD_SECONDS) applyOfflineProgress(elapsedSinceSave);
      else applyProgress(elapsedSinceSave, 1);
    } else {
      const report = applyOfflineProgress(elapsedSinceSave);
      if (report.appliedSeconds >= 2) showOfflineReport(report);
    }
  }

  state.lastUpdateAt = now;
  renderAll();
  renderTree();
  saveGame(false);
  tickTimer = window.setInterval(gameTick, GAME_TICK_MS);
}

document.addEventListener("DOMContentLoaded", init);
