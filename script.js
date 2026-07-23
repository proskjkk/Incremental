"use strict";

/* Eonshift V0.0.1 — prototype systems remain data-driven in one file. */

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
const BASE_RESONATOR_CAP = 50;
const BASE_AMPLIFIER_CAP = 35;
const BASE_WIND_TURBINE_CAP = 10;
const BASE_WIND_STORAGE_CAP = 100;
const BASE_WIND_COLLECT_AMOUNT = 10;
const BASE_WIND_PER_TURBINE = 0.25;
const BASE_INSIGHT_RATE = 0.02;
const BASE_RUNE_COST = 10;
const BASE_RUNE_COOLDOWN = 3;
const BASE_RUNE_PITY = 75;
const MAX_RUNE_LEVEL = 100;
const PRESTIGE_BASE_COST = "1e30";
const PRESTIGE_COST_GROWTH = "1e18";

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
  insight: 0,
  wind: 0,
  windStorage: 0,
  windWasted: 0,
  powerUpgradeLevel: 0,
  powerResonatorLevel: 0,
  rebirthUpgradeLevel: 0,
  rebirthCoreLevel: 0,
  windTurbineLevel: 0,
  prismProgress: 0,
  prismYieldRemainder: 0,
  treeLevels: {},
  purchasedTreeNodes: [],
  researchLevels: {},
  purchasedResearchNodes: [],
  ownedRunes: {},
  runePity: 0,
  runeCooldown: 0,
  autoRuneEnabled: false,
  autoPowerEnabled: false,
  autoRebirthEnabled: false,
  totalRebirths: 0,
  totalPrestiges: 0,
  prestigeLevel: 0,
  totalRuneRolls: 0,
  totalPlayTime: 0,
  selectedCosmetic: "default",
  unlockedCosmetics: ["default"],
  lastRuneResults: [],
  lastUpdateAt: Date.now()
});

const PRESTIGE_TIERS = {
  1: {
    id: 1,
    name: "First Shift",
    effects: {
      unlocks: ["research", "wind", "runes", "powerAutomation", "prismExpansion", "autoRebirth"],
      powerMultiplier: 2,
      rebirthMultiplier: 1.5,
      resonatorCapAdd: 10,
      amplifierCapAdd: 10,
      enableAutoPowerByDefault: true,
      cosmetics: ["first-shift"],
      defaultCosmetic: "first-shift"
    },
    rewards: [
      "Unlock Research and passive Insight",
      "Unlock Wind Turbines and Wind storage",
      "Unlock Runes and manual Rune rolling",
      "Unlock automatic Power Upgrade purchases",
      "Unlock additional Prism Tree branches",
      "Permanent ×2 Power production",
      "Permanent ×1.5 Rebirth Point gain",
      "+10 Power Resonator level cap",
      "+10 Rebirth Amplifier level cap",
      "Unlock Automatic Rebirth",
      "Unlock the First Shift interface theme"
    ]
  }
};

const TREE_NODES = {
  originLens: {
    id: "originLens", name: "Origin Lens", category: "ROOT NODE", branch: "root", icon: "◇",
    x: 49, y: 51, cost: 1, costGrowth: 1, maxLevel: 1, prerequisites: [], currency: "prisms",
    description: "Stabilize the first junction of the Prism network.", effect: "powerMultiplier", value: 1.1
  },
  currentChannel: {
    id: "currentChannel", name: "Current Channel", category: "POWER BRANCH", branch: "power", icon: "⚡",
    x: 35, y: 39, cost: 3, costGrowth: 1.72, maxLevel: 10, prerequisites: ["originLens"], currency: "prisms",
    description: "Repeatably redirect Prism energy into the Power stream.", effect: "powerMultiplier", value: 1.12
  },
  compressedFlow: {
    id: "compressedFlow", name: "Compressed Flow", category: "POWER BRANCH", branch: "power", icon: "↯",
    x: 23, y: 24, cost: 10, costGrowth: 1, maxLevel: 1, prerequisites: ["currentChannel"], currency: "prisms",
    description: "Compress the stream into a denser production cycle.", effect: "powerMultiplier", value: 1.5
  },
  overdriveArray: {
    id: "overdriveArray", name: "Overdrive Array", category: "POWER CAPSTONE", branch: "power", icon: "✦",
    x: 8, y: 37, cost: 22, costGrowth: 1, maxLevel: 1, prerequisites: ["compressedFlow"], currency: "prisms",
    description: "Push the Power stream beyond its normal operating range.", effect: "powerMultiplier", value: 2
  },
  pulseTuning: {
    id: "pulseTuning", name: "Pulse Tuning", category: "PRISM SPEED", branch: "prism-speed", icon: "◷",
    x: 53, y: 31, cost: 4, costGrowth: 1.86, maxLevel: 8, prerequisites: ["originLens"], currency: "prisms",
    description: "Repeatably shorten the time needed to form each Prism.", effect: "prismIntervalMultiplier", value: 0.96
  },
  chromaticFrequency: {
    id: "chromaticFrequency", name: "Chromatic Frequency", category: "PRISM SPEED", branch: "prism-speed", icon: "⌁",
    x: 66, y: 18, cost: 12, costGrowth: 1, maxLevel: 1, prerequisites: ["pulseTuning"], currency: "prisms",
    description: "Synchronize the Prism cycle with a higher frequency.", effect: "prismIntervalMultiplier", value: 0.9
  },
  rapidSpectrum: {
    id: "rapidSpectrum", name: "Rapid Spectrum", category: "PRISM SPEED CAPSTONE", branch: "prism-speed", icon: "»",
    x: 83, y: 12, cost: 26, costGrowth: 1, maxLevel: 1, prerequisites: ["chromaticFrequency"], currency: "prisms",
    description: "Collapse the final delay between Prism formations.", effect: "prismIntervalMultiplier", value: 0.85
  },
  splitSpectrum: {
    id: "splitSpectrum", name: "Split Spectrum", category: "PRISM MULTIPLIER", branch: "prism-multi", icon: "◆",
    x: 66, y: 48, cost: 5, costGrowth: 2, maxLevel: 6, prerequisites: ["originLens"], currency: "prisms",
    description: "Repeatably increase the Prism yield of every completed cycle.", effect: "prismGainMultiplier", value: 1.25
  },
  mirroredYield: {
    id: "mirroredYield", name: "Mirrored Yield", category: "PRISM MULTIPLIER", branch: "prism-multi", icon: "◈",
    x: 80, y: 35, cost: 16, costGrowth: 1, maxLevel: 1, prerequisites: ["splitSpectrum"], currency: "prisms",
    description: "Mirror the output produced by every Prism cycle.", effect: "prismGainMultiplier", value: 2
  },
  spectrumBloom: {
    id: "spectrumBloom", name: "Spectrum Bloom", category: "PRISM MULTIPLIER CAPSTONE", branch: "prism-multi", icon: "✺",
    x: 93, y: 24, cost: 34, costGrowth: 1, maxLevel: 1, prerequisites: ["mirroredYield"], currency: "prisms",
    description: "Expand every Prism cycle into a larger chromatic bloom.", effect: "prismGainMultiplier", value: 3
  },
  recoveryCalibration: {
    id: "recoveryCalibration", name: "Recovery Calibration", category: "OFFLINE EFFICIENCY", branch: "offline-efficiency", icon: "90",
    x: 37, y: 69, cost: 6, costGrowth: 1, maxLevel: 1, prerequisites: ["originLens"], currency: "prisms",
    description: "Reduce the production loss that occurs while the game is closed.", effect: "offlineEfficiency", value: 0.9
  },
  deepRecovery: {
    id: "deepRecovery", name: "Deep Recovery", category: "OFFLINE EFFICIENCY", branch: "offline-efficiency", icon: "98",
    x: 21, y: 81, cost: 16, costGrowth: 1, maxLevel: 1, prerequisites: ["recoveryCalibration"], currency: "prisms",
    description: "Preserve nearly all production while the game is closed.", effect: "offlineEfficiency", value: 0.98
  },
  perfectRecovery: {
    id: "perfectRecovery", name: "Perfect Recovery", category: "OFFLINE EFFICIENCY CAPSTONE", branch: "offline-efficiency", icon: "100",
    x: 7, y: 67, cost: 36, costGrowth: 1, maxLevel: 1, prerequisites: ["deepRecovery"], currency: "prisms",
    description: "Remove the remaining offline production penalty.", effect: "offlineEfficiency", value: 1
  },
  extendedMemory: {
    id: "extendedMemory", name: "Extended Memory", category: "OFFLINE DURATION", branch: "offline-duration", icon: "12h",
    x: 58, y: 70, cost: 6, costGrowth: 1, maxLevel: 1, prerequisites: ["originLens"], currency: "prisms",
    description: "Store a longer period of closed-game progression.", effect: "offlineLimit", value: 12 * 60 * 60
  },
  persistentMemory: {
    id: "persistentMemory", name: "Persistent Memory", category: "OFFLINE DURATION", branch: "offline-duration", icon: "24h",
    x: 73, y: 82, cost: 18, costGrowth: 1, maxLevel: 1, prerequisites: ["extendedMemory"], currency: "prisms",
    description: "Preserve a full day of closed-game progression.", effect: "offlineLimit", value: 24 * 60 * 60
  },
  timelessArchive: {
    id: "timelessArchive", name: "Timeless Archive", category: "OFFLINE DURATION CAPSTONE", branch: "offline-duration", icon: "∞",
    x: 91, y: 68, cost: 40, costGrowth: 1, maxLevel: 1, prerequisites: ["persistentMemory"], currency: "prisms",
    description: "Store all closed-game progression without a time limit.", effect: "offlineLimit", value: Infinity
  },
  shiftedLens: {
    id: "shiftedLens", name: "Shifted Lens", category: "PRESTIGE BRANCH", branch: "prestige", icon: "★",
    x: 49, y: 88, cost: 55, costGrowth: 1, maxLevel: 1, prerequisites: ["extendedMemory"], currency: "prisms", prestigeGate: 1,
    description: "Use the First Shift to expose a permanent lower branch.", effect: "powerMultiplier", value: 2
  },
  insightRefraction: {
    id: "insightRefraction", name: "Insight Refraction", category: "PRESTIGE BRANCH", branch: "prestige", icon: "I",
    x: 34, y: 94, cost: 75, costGrowth: 1, maxLevel: 1, prerequisites: ["shiftedLens"], currency: "prisms", prestigeGate: 1, researchGate: "prismExpansion",
    description: "Refract Prism structure into a stronger Insight stream.", effect: "insightMultiplier", value: 1.25
  },
  windConduit: {
    id: "windConduit", name: "Wind Conduit", category: "WIND BRANCH", branch: "wind", icon: "W",
    x: 83, y: 55, cost: 15, costGrowth: 1, maxLevel: 1, prerequisites: ["splitSpectrum"], currency: "wind", prestigeGate: 1,
    description: "Connect stored Wind to the Prism network.", effect: "windOutputMultiplier", value: 1.5
  },
  turbineArray: {
    id: "turbineArray", name: "Turbine Limit Array", category: "WIND BRANCH", branch: "wind", icon: "+T",
    x: 94, y: 45, cost: 28, costGrowth: 1.9, maxLevel: 4, prerequisites: ["windConduit"], currency: "wind", prestigeGate: 1,
    description: "Raise the maximum number of Wind Turbines.", effect: "windTurbineCapAdd", value: 5
  },
  windReservoir: {
    id: "windReservoir", name: "Wind Reservoir", category: "WIND BRANCH", branch: "wind", icon: "□",
    x: 92, y: 62, cost: 22, costGrowth: 1.75, maxLevel: 6, prerequisites: ["windConduit"], currency: "wind", prestigeGate: 1,
    description: "Expand the capped Wind storage buffer.", effect: "windStorageMultiplier", value: 1.5
  },
  collectionGrip: {
    id: "collectionGrip", name: "Collection Grip", category: "WIND BRANCH", branch: "wind", icon: "↧",
    x: 78, y: 72, cost: 14, costGrowth: 1.65, maxLevel: 5, prerequisites: ["windConduit"], currency: "wind", prestigeGate: 1,
    description: "Collect more stored Wind with each manual press.", effect: "windCollectMultiplier", value: 2
  },
  galeLattice: {
    id: "galeLattice", name: "Gale Lattice", category: "WIND CAPSTONE", branch: "wind", icon: "✧",
    x: 91, y: 84, cost: 180, costGrowth: 1, maxLevel: 1, prerequisites: ["windReservoir", "collectionGrip"], currency: "wind", prestigeGate: 1, researchGate: "prismExpansion",
    description: "Route the completed Wind branch back into turbine output.", effect: "windOutputMultiplier", value: 2
  }
};

const TREE_CONNECTIONS = [
  ["originLens", "currentChannel"], ["currentChannel", "compressedFlow"], ["compressedFlow", "overdriveArray"],
  ["originLens", "pulseTuning"], ["pulseTuning", "chromaticFrequency"], ["chromaticFrequency", "rapidSpectrum"],
  ["originLens", "splitSpectrum"], ["splitSpectrum", "mirroredYield"], ["mirroredYield", "spectrumBloom"],
  ["originLens", "recoveryCalibration"], ["recoveryCalibration", "deepRecovery"], ["deepRecovery", "perfectRecovery"],
  ["originLens", "extendedMemory"], ["extendedMemory", "persistentMemory"], ["persistentMemory", "timelessArchive"],
  ["extendedMemory", "shiftedLens"], ["shiftedLens", "insightRefraction"],
  ["splitSpectrum", "windConduit"], ["windConduit", "turbineArray"], ["windConduit", "windReservoir"],
  ["windConduit", "collectionGrip"], ["windReservoir", "galeLattice"], ["collectionGrip", "galeLattice"]
];

const RESEARCH_NODES = {
  firstObservation: {
    id: "firstObservation", name: "First Observation", category: "FOUNDATION", branch: "research-root", icon: "I",
    x: 50, y: 50, cost: 3, prerequisites: [], description: "Record the first stable law revealed by the Shift.",
    effect: "powerMultiplier", value: 1.05, effectText: "×1.05 total Power production"
  },
  resonanceTheory: {
    id: "resonanceTheory", name: "Resonance Theory", category: "LIMIT BREAK", branch: "research-power", icon: "R+",
    x: 34, y: 35, cost: 8, prerequisites: ["firstObservation"], description: "Extend the safe operating range of the Power Resonator.",
    effect: "resonatorCapAdd", value: 15, effectText: "+15 Power Resonator cap"
  },
  rebirthTheory: {
    id: "rebirthTheory", name: "Rebirth Theory", category: "LIMIT BREAK", branch: "research-rebirth", icon: "A+",
    x: 67, y: 35, cost: 8, prerequisites: ["firstObservation"], description: "Extend the stable range of the Rebirth Amplifier.",
    effect: "amplifierCapAdd", value: 12, effectText: "+12 Rebirth Amplifier cap"
  },
  analyticCurrent: {
    id: "analyticCurrent", name: "Analytic Current", category: "PASSIVE BONUS", branch: "research-power", icon: "%",
    x: 20, y: 23, cost: 18, prerequisites: ["resonanceTheory"], description: "Apply measured corrections to every Power cycle.",
    effect: "powerMultiplier", value: 1.1, effectText: "×1.10 total Power production"
  },
  windAutomation: {
    id: "windAutomation", name: "Closed-loop Collection", category: "AUTOMATION", branch: "research-power", icon: "W↻",
    x: 27, y: 55, cost: 20, prerequisites: ["resonanceTheory"], description: "Automatically move Wind from storage into the spendable balance.",
    effect: "windAutoCollect", value: 1, effectText: "Unlock Wind auto-collection"
  },
  runeMechanics: {
    id: "runeMechanics", name: "Runic Mechanism", category: "AUTOMATION", branch: "research-rebirth", icon: "◈↻",
    x: 74, y: 54, cost: 22, prerequisites: ["rebirthTheory"], description: "Automate Rune rolling while still paying the normal Wind cost.",
    effect: "runeAutoRoll", value: 1, effectText: "Unlock Rune auto-roll"
  },
  frugalRolls: {
    id: "frugalRolls", name: "Frugal Inscription", category: "RUNE STUDY", branch: "research-rune", icon: "−W",
    x: 87, y: 39, cost: 30, prerequisites: ["runeMechanics"], description: "Reduce the Wind consumed by every Rune batch.",
    effect: "runeCostMultiplier", value: 0.9, effectText: "Rune rolls cost 10% less Wind"
  },
  weightedFate: {
    id: "weightedFate", name: "Weighted Fate", category: "RUNE STUDY", branch: "research-rune", icon: "P−",
    x: 88, y: 67, cost: 34, prerequisites: ["runeMechanics"], description: "Shorten the guaranteed rare-or-better pity cycle.",
    effect: "pityReduction", value: 15, effectText: "Pity threshold reduced by 15 rolls"
  },
  prismExpansion: {
    id: "prismExpansion", name: "Prism Expansion", category: "NETWORK ACCESS", branch: "research-prism", icon: "◇+",
    x: 50, y: 72, cost: 28, prerequisites: ["firstObservation"], description: "Reveal deeper Prestige and Wind branches in the Prism Tree.",
    effect: "prismExpansion", value: 1, effectText: "Unlock additional Prism Tree nodes"
  },
  spectrumStudy: {
    id: "spectrumStudy", name: "Spectrum Study", category: "PASSIVE BONUS", branch: "research-prism", icon: "◇%",
    x: 63, y: 87, cost: 35, prerequisites: ["prismExpansion"], description: "Extract slightly more material from each Prism cycle.",
    effect: "prismGainMultiplier", value: 1.1, effectText: "×1.10 Prism gain"
  },
  recoveryModel: {
    id: "recoveryModel", name: "Recovery Model", category: "PASSIVE BONUS", branch: "research-prism", icon: "O%",
    x: 37, y: 88, cost: 35, prerequisites: ["prismExpansion"], description: "Recover a small portion of remaining offline production loss.",
    effect: "offlineEfficiencyBonus", value: 0.02, effectText: "+2% offline efficiency, capped at 100%"
  }
};

const RESEARCH_CONNECTIONS = [
  ["firstObservation", "resonanceTheory"], ["firstObservation", "rebirthTheory"], ["firstObservation", "prismExpansion"],
  ["resonanceTheory", "analyticCurrent"], ["resonanceTheory", "windAutomation"],
  ["rebirthTheory", "runeMechanics"], ["runeMechanics", "frugalRolls"], ["runeMechanics", "weightedFate"],
  ["prismExpansion", "spectrumStudy"], ["prismExpansion", "recoveryModel"]
];

const RARITY_TIERS = [
  { id: "eternal", name: "Eternal", chance: 1e-50, displayOdds: "1 / 1e50", rank: 5 },
  { id: "astral", name: "Astral", chance: 1e-10, displayOdds: "1 / 10B", rank: 4 },
  { id: "luminous", name: "Luminous", chance: 1e-6, displayOdds: "1 / 1M", rank: 3 },
  { id: "resonant", name: "Resonant", chance: 1e-3, displayOdds: "1 / 1,000", rank: 2 },
  { id: "charged", name: "Charged", chance: 0.1, displayOdds: "1 / 10", rank: 1 },
  { id: "faint", name: "Faint", chance: 1, displayOdds: "Common", rank: 0 }
];

const RUNE_DEFINITIONS = {
  pulseEtching: { id: "pulseEtching", name: "Pulse Etching", rarity: "faint", icon: "P", effect: "powerMultiplier", base: 0.003, description: "Modestly multiplies Power production." },
  glassEcho: { id: "glassEcho", name: "Glass Echo", rarity: "faint", icon: "◇", effect: "prismMultiplier", base: 0.0025, description: "Modestly increases Prism gain." },
  galeCircuit: { id: "galeCircuit", name: "Gale Circuit", rarity: "charged", icon: "W", effect: "windMultiplier", base: 0.006, description: "Increases Wind Turbine output." },
  secondDawn: { id: "secondDawn", name: "Second Dawn", rarity: "charged", icon: "R", effect: "rebirthMultiplier", base: 0.005, description: "Increases Rebirth Point gain." },
  chronicleLoop: { id: "chronicleLoop", name: "Chronicle Loop", rarity: "resonant", icon: "◷", effect: "runeSpeed", base: 1.2, description: "Reduces Rune roll cooldown with diminishing returns." },
  fortuneLattice: { id: "fortuneLattice", name: "Fortune Lattice", rarity: "resonant", icon: "✦", effect: "runeLuck", base: 1.4, description: "Improves rarer Rune odds with diminishing returns." },
  manyfoldSeal: { id: "manyfoldSeal", name: "Manyfold Seal", rarity: "luminous", icon: "×", effect: "runeBulk", base: 0.7, description: "Increases Runes produced per paid roll, up to the bulk cap." },
  insightCorona: { id: "insightCorona", name: "Insight Corona", rarity: "luminous", icon: "I", effect: "insightMultiplier", base: 0.012, description: "Increases passive Insight generation." },
  voidRelay: { id: "voidRelay", name: "Void Relay", rarity: "astral", icon: "V", effect: "powerMultiplier", base: 0.018, description: "A stronger multiplicative Power effect." },
  memoryHalo: { id: "memoryHalo", name: "Memory Halo", rarity: "astral", icon: "O", effect: "offlineEfficiency", base: 0.0012, description: "Adds a small capped offline-efficiency bonus." },
  eonCrown: { id: "eonCrown", name: "Eon Crown", rarity: "eternal", icon: "★", effect: "allProduction", base: 0.04, description: "Multiplies Power, Prism, Wind, Insight, and Rebirth gains." },
  parallaxSeed: { id: "parallaxSeed", name: "Parallax Seed", rarity: "eternal", icon: "∞", effect: "powerMultiplier", base: 0.055, description: "A rare multiplicative Power effect with diminishing level scaling." }
};

const UPGRADE_DEFINITIONS = {
  powerUpgradeLevel: { baseCost: 5, growth: 1.45, currencyField: "power", rounded: false, name: "Flux Condenser", cap: () => Infinity },
  powerResonatorLevel: { baseCost: 20, growth: 1.65, currencyField: "power", rounded: false, name: "Power Resonator", cap: () => getPowerResonatorCap() },
  rebirthUpgradeLevel: { baseCost: 1, growth: 1.82, currencyField: "rebirthPoints", rounded: true, name: "Rebirth Amplifier", cap: () => getRebirthAmplifierCap() },
  rebirthCoreLevel: { baseCost: 2, growth: 1.9, currencyField: "rebirthPoints", rounded: true, name: "Rebirth Core", cap: () => Infinity },
  windTurbineLevel: { baseCost: "1e5", growth: 1.8, currencyField: "power", rounded: false, name: "Wind Turbine", cap: () => getWindTurbineCap() }
};

let state = createFreshState();
let selectedTreeNodeId = null;
let selectedResearchNodeId = null;
let activePage = "power";
let lastTickAt = Date.now();
let autosaveAccumulator = 0;
let toastTimeout = null;
let tickTimer = null;
let lastOfflineReport = null;
let visibilityWasHidden = document.hidden;
let hiddenOfflineConsumedSeconds = 0;
let lastAutoRebirthAt = 0;
const elements = {};

function createFreshState() {
  return {
    ...DEFAULT_STATE,
    power: HugeNumber.zero(),
    rebirthPoints: HugeNumber.zero(),
    treeLevels: {},
    purchasedTreeNodes: [],
    researchLevels: {},
    purchasedResearchNodes: [],
    ownedRunes: {},
    unlockedCosmetics: ["default"],
    lastRuneResults: [],
    lastUpdateAt: Date.now()
  };
}

function cacheElements() {
  const ids = [
    "headerPower", "headerPowerRate", "headerPrism", "headerPrismTimer", "headerRebirthPoints",
    "headerInsightChip", "headerInsight", "headerInsightRate", "headerWindChip", "headerWind", "headerWindRate", "saveStatus",
    "researchNav", "windNav", "runesNav",
    "powerAmount", "powerPerSecond", "powerAutomationPanel", "autoPowerToggle",
    "powerUpgradeLevel", "powerUpgradeEffect", "powerUpgradeNextEffect", "powerUpgradeCost", "buyPowerUpgrade", "buyMaxPowerUpgrade",
    "powerResonatorLevel", "powerResonatorEffect", "powerResonatorNextEffect", "powerResonatorCost", "buyPowerResonator", "buyMaxPowerResonator",
    "rebirthAutomationPanel", "autoRebirthToggle", "rebirthGain", "rebirthRequirementText", "rebirthButton",
    "rebirthUpgradeLevel", "rebirthUpgradeEffect", "rebirthUpgradeNextEffect", "rebirthUpgradeCost", "buyRebirthUpgrade", "buyMaxRebirthUpgrade",
    "rebirthCoreLevel", "rebirthCoreEffect", "rebirthCoreNextEffect", "rebirthCoreCost", "buyRebirthCore", "buyMaxRebirthCore",
    "treePrismBalance", "treeNodes", "treeLines", "nodePlaceholder", "nodeDetails", "selectedNodeIcon", "selectedNodeCategory",
    "selectedNodeName", "selectedNodeDescription", "selectedNodeEffect", "selectedNodeCost", "selectedNodeStatus", "selectedNodeRequirement", "purchaseTreeNode",
    "prestigeLevelLabel", "prestigeTierName", "prestigeRequirement", "prestigeProgressFill", "prestigeProgressText", "prestigeButton",
    "prestigeRewardHeading", "prestigeRewardList", "totalPrestiges",
    "researchInsightBalance", "researchLines", "researchNodes", "researchPlaceholder", "researchDetails", "selectedResearchIcon",
    "selectedResearchCategory", "selectedResearchName", "selectedResearchDescription", "selectedResearchEffect", "selectedResearchCost",
    "selectedResearchStatus", "selectedResearchRequirement", "purchaseResearchNode",
    "windAmount", "windStored", "windStorageCap", "windStorageFill", "windProductionRate", "windCollectAmount", "collectWindButton", "windAutoStatus",
    "windTurbineLevel", "windTurbineEffect", "windTurbineNextEffect", "windTurbineCost", "buyWindTurbine", "buyMaxWindTurbine",
    "ownedRuneCount", "totalRuneCount", "runeRollCost", "runeCooldownText", "runeBulkLabel", "rollRuneButton", "autoRuneButton",
    "runePityFill", "runePityText", "runeLuckText", "runeSpeedText", "runeBulkText", "runeLastResult", "runeGrid",
    "settingsButton", "settingsModal", "closeSettingsButton", "saveNowButton", "exportSaveButton", "importSaveButton", "resetSaveButton",
    "saveTextarea", "saveTextareaActions", "confirmImportButton", "cancelSaveTextButton",
    "developerStatus", "developerLogin", "developerPasscode", "unlockDeveloperButton", "developerTools",
    "developerResourceSelect", "developerResourceAmount", "developerAddResource", "developerSetResource",
    "developerUpgradeSelect", "developerUpgradeAmount", "developerAddUpgrade", "developerSetUpgrade",
    "developerUnlockTree", "developerResetTree", "developerUnlockPrestige", "developerUnlockResearch", "developerGrantRunes",
    "developerOfflineHours", "developerSimulateOffline",
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
  let tier = Math.floor(Math.log10(absolute) / 3);
  if (tier < 1 || tier > suffixes.length) {
    return `${sign}${absolute.toExponential(2).replace("+", "")}`;
  }

  let scaled = absolute / Math.pow(1_000, tier);
  let decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  let rounded = Number(scaled.toFixed(decimals));

  // Prevent output such as 1000K when rounding crosses a suffix boundary.
  if (rounded >= 1_000) {
    tier += 1;
    if (tier > suffixes.length) {
      return `${sign}${absolute.toExponential(2).replace("+", "")}`;
    }
    scaled = absolute / Math.pow(1_000, tier);
    decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    rounded = Number(scaled.toFixed(decimals));
  }

  return `${sign}${rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  })}${suffixes[tier - 1]}`;
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

function formatDecimal(value, digits = 2) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 1e6) return formatSmallNumber(numeric, digits);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: digits });
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

function getHugeProgressPercent(currentValue, requirementValue) {
  const current = HN(currentValue);
  const requirement = HN(requirementValue);
  if (current.greaterThanOrEqual(requirement)) return 100;
  if (current.isZero()) return 0;
  const requirementLog = requirement.log10();
  if (requirementLog <= 0) return clamp(current.divide(requirement).toNumber() * 100, 0, 100);
  return clamp((current.log10() / requirementLog) * 100, 0, 99.99);
}

function currencyName(field, amount = 2) {
  if (field === "prisms") return pluralize(amount, "Prism");
  if (field === "wind") return "Wind";
  if (field === "insight") return "Insight";
  if (field === "power") return "Power";
  return "RP";
}

/* ------------------------------- Helpers -------------------------------- */

function getTreeLevel(nodeId) {
  return Math.max(0, Math.floor(Number(state.treeLevels[nodeId]) || 0));
}

function hasTreeNode(nodeId) {
  return getTreeLevel(nodeId) > 0;
}

function getResearchLevel(nodeId) {
  return Math.max(0, Math.floor(Number(state.researchLevels[nodeId]) || 0));
}

function hasResearchNode(nodeId) {
  return getResearchLevel(nodeId) > 0;
}

function getClaimedPrestigeTiers(prestigeLevel = state.prestigeLevel) {
  return Object.values(PRESTIGE_TIERS)
    .filter(config => config.id <= prestigeLevel)
    .sort((left, right) => left.id - right.id);
}

function hasPrestigeUnlock(unlockName, prestigeLevel = state.prestigeLevel) {
  return getClaimedPrestigeTiers(prestigeLevel)
    .some(config => config.effects?.unlocks?.includes(unlockName));
}

function getPrestigeProduct(effectName, prestigeLevel = state.prestigeLevel) {
  return getClaimedPrestigeTiers(prestigeLevel).reduce((product, config) => {
    const value = Number(config.effects?.[effectName]);
    return Number.isFinite(value) && value > 0 ? product * value : product;
  }, 1);
}

function getPrestigeSum(effectName, prestigeLevel = state.prestigeLevel) {
  return getClaimedPrestigeTiers(prestigeLevel).reduce((sum, config) => {
    const value = Number(config.effects?.[effectName]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function isPrestigeUnlocked() {
  return state.prestigeLevel > 0;
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

function getTreeSum(effectName) {
  return Object.values(TREE_NODES).reduce((total, node) => {
    const level = getTreeLevel(node.id);
    return level > 0 && node.effect === effectName ? total + node.value * level : total;
  }, 0);
}

function getTreeMaximum(effectName, fallbackValue) {
  return Object.values(TREE_NODES).reduce((maximum, node) => {
    if (getTreeLevel(node.id) <= 0 || node.effect !== effectName) return maximum;
    if (node.value === Infinity) return Infinity;
    return Math.max(maximum, node.value);
  }, fallbackValue);
}

function getResearchNumberProduct(effectName) {
  return Object.values(RESEARCH_NODES).reduce((total, node) => {
    if (!hasResearchNode(node.id) || node.effect !== effectName) return total;
    return total * node.value;
  }, 1);
}

function getResearchSum(effectName) {
  return Object.values(RESEARCH_NODES).reduce((total, node) => {
    if (!hasResearchNode(node.id) || node.effect !== effectName) return total;
    return total + node.value;
  }, 0);
}

function hasResearchEffect(effectName) {
  return Object.values(RESEARCH_NODES).some(node => hasResearchNode(node.id) && node.effect === effectName);
}

function getOwnedRune(runeId) {
  const owned = state.ownedRunes[runeId];
  return owned && owned.level > 0 ? owned : null;
}

function getRuneScale(level) {
  return Math.pow(Math.max(0, level), 0.6);
}

function getRuneEffectProduct(effectName) {
  return Object.values(RUNE_DEFINITIONS).reduce((product, rune) => {
    const owned = getOwnedRune(rune.id);
    if (!owned || rune.effect !== effectName) return product;
    return product * (1 + rune.base * getRuneScale(owned.level));
  }, 1);
}

function getRuneEffectSum(effectName) {
  return Object.values(RUNE_DEFINITIONS).reduce((sum, rune) => {
    const owned = getOwnedRune(rune.id);
    if (!owned || rune.effect !== effectName) return sum;
    return sum + rune.base * getRuneScale(owned.level);
  }, 0);
}

function getAllProductionRuneMultiplier() {
  return getRuneEffectProduct("allProduction");
}

function getPowerResonatorCap() {
  return BASE_RESONATOR_CAP + getPrestigeSum("resonatorCapAdd") + getResearchSum("resonatorCapAdd");
}

function getRebirthAmplifierCap() {
  return BASE_AMPLIFIER_CAP + getPrestigeSum("amplifierCapAdd") + getResearchSum("amplifierCapAdd");
}

function getWindTurbineCap() {
  return BASE_WIND_TURBINE_CAP + getTreeSum("windTurbineCapAdd");
}

function getUpgradeCap(levelField) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  const cap = definition?.cap ? Number(definition.cap()) : Infinity;
  return Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : Infinity;
}

function getUpgradeCost(levelField, level = state[levelField]) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  const rawCost = HN(definition.baseCost).multiply(HugeNumber.pow(definition.growth, level));
  return definition.rounded ? rawCost.ceil() : rawCost;
}

function getFluxBaseBonus() { return HN(state.powerUpgradeLevel); }
function getRebirthCoreBaseBonus() { return HN(state.rebirthCoreLevel).multiply(2); }
function getBasePowerPerSecond() { return HugeNumber.one().add(getFluxBaseBonus()).add(getRebirthCoreBaseBonus()); }
function getPowerResonatorMultiplier() { return HugeNumber.pow(1.25, state.powerResonatorLevel); }
function getRebirthPowerMultiplier() { return HugeNumber.pow(1.5, state.rebirthUpgradeLevel); }
function getPrestigePowerMultiplier() { return HN(getPrestigeProduct("powerMultiplier")); }
function getPrestigeRebirthMultiplier() { return HN(getPrestigeProduct("rebirthMultiplier")); }

function getPowerPerSecond() {
  return getBasePowerPerSecond()
    .multiply(getPowerResonatorMultiplier())
    .multiply(getRebirthPowerMultiplier())
    .multiply(getTreeBigProduct("powerMultiplier"))
    .multiply(getResearchNumberProduct("powerMultiplier"))
    .multiply(getPrestigePowerMultiplier())
    .multiply(getRuneEffectProduct("powerMultiplier"))
    .multiply(getAllProductionRuneMultiplier());
}

function getPrismInterval() {
  return Math.max(3, BASE_PRISM_INTERVAL * getTreeNumberProduct("prismIntervalMultiplier"));
}

function getPrismGainPerCycle() {
  return Math.max(1,
    getTreeNumberProduct("prismGainMultiplier")
    * getResearchNumberProduct("prismGainMultiplier")
    * getRuneEffectProduct("prismMultiplier")
    * getAllProductionRuneMultiplier()
  );
}

function getOfflineEfficiency() {
  const treeValue = getTreeMaximum("offlineEfficiency", BASE_OFFLINE_EFFICIENCY);
  const researchBonus = getResearchSum("offlineEfficiencyBonus");
  const runeBonus = Math.min(0.03, getRuneEffectSum("offlineEfficiency"));
  return clamp(treeValue + researchBonus + runeBonus, 0, 1);
}

function getOfflineLimitSeconds() {
  return getTreeMaximum("offlineLimit", BASE_OFFLINE_LIMIT_SECONDS);
}

function getRebirthGain() {
  if (state.power.lessThan(BASE_REBIRTH_REQUIREMENT)) return HugeNumber.zero();
  return state.power.divide(BASE_REBIRTH_REQUIREMENT).floor()
    .multiply(getPrestigeRebirthMultiplier())
    .multiply(getRuneEffectProduct("rebirthMultiplier"))
    .multiply(getAllProductionRuneMultiplier())
    .floor();
}

function getPrestigeCost(prestigeCount = state.totalPrestiges) {
  return HN(PRESTIGE_BASE_COST).multiply(HN(PRESTIGE_COST_GROWTH).power(prestigeCount));
}

function getCurrentPrestigeTier() {
  return state.prestigeLevel + 1;
}

function getInsightPerSecond() {
  if (!hasPrestigeUnlock("research")) return 0;
  return BASE_INSIGHT_RATE
    * getTreeNumberProduct("insightMultiplier")
    * getRuneEffectProduct("insightMultiplier")
    * getAllProductionRuneMultiplier();
}

function getWindOutputPerSecond() {
  if (!hasPrestigeUnlock("wind")) return 0;
  return state.windTurbineLevel * BASE_WIND_PER_TURBINE
    * getTreeNumberProduct("windOutputMultiplier")
    * getRuneEffectProduct("windMultiplier")
    * getAllProductionRuneMultiplier();
}

function getWindStorageCap() {
  return BASE_WIND_STORAGE_CAP * getTreeNumberProduct("windStorageMultiplier");
}

function getWindCollectAmount() {
  return BASE_WIND_COLLECT_AMOUNT * getTreeNumberProduct("windCollectMultiplier");
}

function getRuneLuckPoints() {
  return getRuneEffectSum("runeLuck");
}

function getRuneLuckMultiplier() {
  return 1 + 4 * (1 - Math.exp(-getRuneLuckPoints() / 20));
}

function getRuneCooldownSeconds() {
  const points = getRuneEffectSum("runeSpeed");
  return Math.max(0.6, BASE_RUNE_COOLDOWN / (1 + points / 10));
}

function getRuneBulk() {
  const points = getRuneEffectSum("runeBulk");
  const thresholds = [2, 5, 9, 14];
  return 1 + thresholds.filter(threshold => points >= threshold).length;
}

function getRuneCostPerUnit() {
  return Math.max(1, Math.ceil(BASE_RUNE_COST * getResearchNumberProduct("runeCostMultiplier")));
}

function getRuneBatchCost() {
  return getRuneCostPerUnit() * getRuneBulk();
}

function getRunePityThreshold() {
  return Math.max(30, BASE_RUNE_PITY - getResearchSum("pityReduction"));
}

function getRuneExpRequirement(level) {
  if (level >= MAX_RUNE_LEVEL) return Infinity;
  return Math.ceil(4 * Math.pow(level, 1.5) * Math.pow(1.35, Math.max(0, level - 1)));
}

function getTreeNodeCurrency(node) {
  return node.currency || "prisms";
}

function getTreeCurrencyBalance(node) {
  return state[getTreeNodeCurrency(node)];
}

function getTreeNodeCost(node) {
  const level = getTreeLevel(node.id);
  return Math.max(1, Math.ceil(node.cost * Math.pow(node.costGrowth || 1, level)));
}

function treeNodeGatesMet(node) {
  if (node.prestigeGate && state.prestigeLevel < node.prestigeGate) return false;
  if (node.researchGate && !hasResearchNode(node.researchGate)) return false;
  return true;
}

function areTreePrerequisitesMet(node) {
  return node.prerequisites.every(hasTreeNode);
}

function isTreeNodeVisible(node) {
  if (!treeNodeGatesMet(node)) return false;
  return node.id === "originLens" || hasTreeNode(node.id) || areTreePrerequisitesMet(node);
}

function getTreeNodeState(node) {
  if (!treeNodeGatesMet(node) || !areTreePrerequisitesMet(node)) return "locked";
  const level = getTreeLevel(node.id);
  if (level >= node.maxLevel) return "maxed";
  if (level > 0) return "owned";
  return "available";
}

function getTreeNodeEffectText(node, level = getTreeLevel(node.id)) {
  const nextLevel = Math.min(node.maxLevel, level + 1);
  const repeatable = node.maxLevel > 1;
  if (node.effect === "powerMultiplier") {
    const current = Math.pow(node.value, level);
    const next = Math.pow(node.value, nextLevel);
    return repeatable ? `Current ×${formatSmallNumber(current)} · Next ×${formatSmallNumber(next)}` : `×${formatSmallNumber(node.value)} total Power production`;
  }
  if (node.effect === "prismIntervalMultiplier") {
    return repeatable
      ? `This node: ×${formatSmallNumber(Math.pow(node.value, level), 3)} → ×${formatSmallNumber(Math.pow(node.value, nextLevel), 3)} interval`
      : `${Math.round((1 - node.value) * 100)}% faster Prism cycles`;
  }
  if (node.effect === "prismGainMultiplier") {
    return repeatable
      ? `Current ×${formatSmallNumber(Math.pow(node.value, level))} · Next ×${formatSmallNumber(Math.pow(node.value, nextLevel))} Prism gain`
      : `×${formatSmallNumber(node.value)} Prism gain`;
  }
  if (node.effect === "offlineEfficiency") return `Offline efficiency becomes ${Math.round(node.value * 100)}%`;
  if (node.effect === "offlineLimit") return Number.isFinite(node.value) ? `Offline limit becomes ${formatDuration(node.value)}` : "Offline progression has no time limit";
  if (node.effect === "windOutputMultiplier") return repeatable ? `Wind output ×${formatSmallNumber(Math.pow(node.value, level))} → ×${formatSmallNumber(Math.pow(node.value, nextLevel))}` : `×${node.value} Wind output`;
  if (node.effect === "windStorageMultiplier") return `Storage ×${formatSmallNumber(Math.pow(node.value, level))} → ×${formatSmallNumber(Math.pow(node.value, nextLevel))}`;
  if (node.effect === "windCollectMultiplier") return `Collect ×${formatSmallNumber(Math.pow(node.value, level))} → ×${formatSmallNumber(Math.pow(node.value, nextLevel))}`;
  if (node.effect === "windTurbineCapAdd") return `Turbine cap +${node.value * level} → +${node.value * nextLevel}`;
  if (node.effect === "insightMultiplier") return `×${node.value} Insight generation`;
  return "Permanent network effect";
}

function areResearchPrerequisitesMet(node) {
  return node.prerequisites.every(hasResearchNode);
}

function isResearchNodeVisible(node) {
  return hasPrestigeUnlock("research") && (node.id === "firstObservation" || hasResearchNode(node.id) || areResearchPrerequisitesMet(node));
}

function getResearchNodeState(node) {
  if (!areResearchPrerequisitesMet(node)) return "locked";
  return hasResearchNode(node.id) ? "maxed" : "available";
}

/* ------------------------------ Game Systems ----------------------------- */

function canAfford(currency, cost) {
  if (currency instanceof HugeNumber || cost instanceof HugeNumber || typeof currency === "string" || typeof cost === "string") {
    return HN(currency).greaterThanOrEqual(cost);
  }
  return Number.isFinite(currency) && Number.isFinite(cost) && currency + 1e-9 >= cost;
}

function getGeometricTotalCost(levelField, startLevel, count) {
  if (count <= 0) return HugeNumber.zero();
  const definition = UPGRADE_DEFINITIONS[levelField];
  if (count <= 2_000) {
    let total = HugeNumber.zero();
    for (let offset = 0; offset < count; offset += 1) total = total.add(getUpgradeCost(levelField, startLevel + offset));
    return total;
  }
  const firstCost = HN(definition.baseCost).multiply(HugeNumber.pow(definition.growth, startLevel));
  const growthPower = HugeNumber.pow(definition.growth, count);
  let total = firstCost.multiply(growthPower.subtract(1)).divide(definition.growth - 1);
  if (definition.rounded) total = total.add(count);
  return total;
}

function estimateAffordableCount(levelField, currency) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  const currentLevel = state[levelField];
  const cap = getUpgradeCap(levelField);
  const remainingLevels = Number.isFinite(cap) ? Math.max(0, cap - currentLevel) : Number.MAX_SAFE_INTEGER;
  if (remainingLevels <= 0) return 0;
  const firstCost = getUpgradeCost(levelField, currentLevel);
  if (!canAfford(currency, firstCost)) return 0;

  const ratio = HN(currency).multiply(definition.growth - 1).divide(firstCost);
  const logOnePlusRatio = ratio.exponent > 14 ? ratio.log10() : Math.log10(1 + Math.max(0, ratio.toNumber()));
  let estimate = Math.max(1, Math.floor(logOnePlusRatio / Math.log10(definition.growth)));
  estimate = Math.min(estimate + 2, remainingLevels, Number.MAX_SAFE_INTEGER);

  let low = 0;
  let high = estimate;
  while (high < remainingLevels && canAfford(currency, getGeometricTotalCost(levelField, currentLevel, high))) {
    low = high;
    high = Math.min(remainingLevels, Math.max(high + 1, high * 2));
    if (high === low) break;
  }
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (canAfford(currency, getGeometricTotalCost(levelField, currentLevel, middle))) low = middle;
    else high = middle;
  }
  return canAfford(currency, getGeometricTotalCost(levelField, currentLevel, high)) ? high : low;
}

function buyRepeatableUpgrade(levelField, amount = 1, options = {}) {
  const definition = UPGRADE_DEFINITIONS[levelField];
  if (!definition) return 0;
  const currentLevel = state[levelField];
  const cap = getUpgradeCap(levelField);
  const remaining = Number.isFinite(cap) ? Math.max(0, cap - currentLevel) : Number.MAX_SAFE_INTEGER;
  if (remaining <= 0) return 0;

  const currency = state[definition.currencyField];
  let purchased = 0;
  let totalCost = HugeNumber.zero();
  if (amount === Infinity) {
    purchased = Math.min(remaining, estimateAffordableCount(levelField, currency));
    if (purchased > 0) totalCost = getGeometricTotalCost(levelField, currentLevel, purchased);
  } else {
    purchased = Math.min(remaining, Math.max(0, Math.floor(amount)));
    totalCost = getGeometricTotalCost(levelField, currentLevel, purchased);
    if (!canAfford(currency, totalCost)) purchased = 0;
  }
  if (purchased <= 0) return 0;

  state[definition.currencyField] = HN(currency).subtract(totalCost).max(0);
  state[levelField] += purchased;
  if (!options.silent) showToast(`${definition.name} +${formatInteger(purchased)}`);
  if (options.render !== false) renderAll();
  return purchased;
}

function buyPowerUpgrade(amount = 1, options) { return buyRepeatableUpgrade("powerUpgradeLevel", amount, options); }
function buyPowerResonator(amount = 1, options) { return buyRepeatableUpgrade("powerResonatorLevel", amount, options); }
function buyRebirthUpgrade(amount = 1, options) { return buyRepeatableUpgrade("rebirthUpgradeLevel", amount, options); }
function buyRebirthCore(amount = 1, options) { return buyRepeatableUpgrade("rebirthCoreLevel", amount, options); }
function buyWindTurbine(amount = 1, options) { return buyRepeatableUpgrade("windTurbineLevel", amount, options); }

function performRebirth(options = {}) {
  const gain = getRebirthGain();
  if (gain.isZero()) return false;
  state.rebirthPoints = state.rebirthPoints.add(gain);
  state.totalRebirths += 1;
  state.power = HugeNumber.zero();
  state.powerUpgradeLevel = 0;
  state.powerResonatorLevel = 0;
  if (!options.silent) showToast(`Rebirth complete: +${formatInteger(gain)} RP`);
  if (options.save !== false) saveGame(false);
  if (options.render !== false) renderAll();
  return true;
}

function performPrestige() {
  const tier = getCurrentPrestigeTier();
  const config = PRESTIGE_TIERS[tier];
  if (!config) return;
  const cost = getPrestigeCost();
  if (!canAfford(state.power, cost)) return;
  if (!window.confirm(`Claim Prestige Tier ${tier}: ${config.name}? The listed Power and Rebirth systems will reset.`)) return;

  state.totalPrestiges += 1;
  state.prestigeLevel = Math.max(state.prestigeLevel, tier);
  state.power = HugeNumber.zero();
  state.powerUpgradeLevel = 0;
  state.powerResonatorLevel = 0;
  state.rebirthPoints = HugeNumber.zero();
  state.rebirthUpgradeLevel = 0;
  state.rebirthCoreLevel = 0;
  const effects = config.effects || {};
  if (effects.enableAutoPowerByDefault) state.autoPowerEnabled = true;
  state.autoRebirthEnabled = false;
  for (const cosmetic of effects.cosmetics || []) {
    if (!state.unlockedCosmetics.includes(cosmetic)) state.unlockedCosmetics.push(cosmetic);
  }
  if (effects.defaultCosmetic && state.unlockedCosmetics.includes(effects.defaultCosmetic)) {
    state.selectedCosmetic = effects.defaultCosmetic;
  }

  saveGame(false);
  updateUnlockVisibility();
  renderAll();
  showToast(`Prestige Tier ${tier} claimed: ${config.name}`);
}

function purchaseSelectedTreeNode() {
  const node = TREE_NODES[selectedTreeNodeId];
  if (!node || !isTreeNodeVisible(node)) return;
  const nodeState = getTreeNodeState(node);
  if (!["available", "owned"].includes(nodeState)) return;
  const cost = getTreeNodeCost(node);
  const currencyField = getTreeNodeCurrency(node);
  if (!canAfford(state[currencyField], cost)) return;

  state[currencyField] = Math.max(0, state[currencyField] - cost);
  state.treeLevels[node.id] = getTreeLevel(node.id) + 1;
  resolvePrismGeneration(false);
  showToast(`${node.name} ${node.maxLevel > 1 ? `level ${state.treeLevels[node.id]}` : "purchased"}`);
  saveGame(false);
  renderAll();
}

function purchaseSelectedResearchNode() {
  const node = RESEARCH_NODES[selectedResearchNodeId];
  if (!node || !isResearchNodeVisible(node) || getResearchNodeState(node) !== "available") return;
  if (!canAfford(state.insight, node.cost)) return;
  state.insight -= node.cost;
  state.researchLevels[node.id] = 1;
  state.purchasedResearchNodes = Object.keys(state.researchLevels).filter(id => getResearchLevel(id) > 0);
  showToast(`${node.name} researched`);
  saveGame(false);
  updateUnlockVisibility();
  renderAll();
}

function collectWind() {
  if (!hasPrestigeUnlock("wind")) return;
  const amount = Math.min(state.windStorage, getWindCollectAmount());
  if (amount <= 0) return;
  state.windStorage -= amount;
  state.wind += amount;
  showToast(`Collected ${formatDecimal(amount)} Wind`);
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
  if (showFeedback && generated > 0) showToast(`+${formatInteger(generated)} ${pluralize(generated, "Prism")}`);
  return generated;
}

function addWindProduction(effectiveSeconds) {
  const generated = getWindOutputPerSecond() * effectiveSeconds;
  if (generated <= 0) return { generated: 0, stored: 0, wasted: 0 };
  if (hasResearchEffect("windAutoCollect")) {
    state.wind += generated;
    return { generated, stored: 0, wasted: 0 };
  }
  const cap = getWindStorageCap();
  const available = Math.max(0, cap - state.windStorage);
  const stored = Math.min(available, generated);
  const wasted = Math.max(0, generated - stored);
  state.windStorage += stored;
  state.windWasted += wasted;
  return { generated, stored, wasted };
}

function selectNormalRarity() {
  const luck = getRuneLuckMultiplier();
  for (const rarity of RARITY_TIERS) {
    if (rarity.id === "faint") return rarity;
    const adjustedChance = Math.min(0.95, rarity.chance * luck);
    if (Math.random() < adjustedChance) return rarity;
  }
  return RARITY_TIERS[RARITY_TIERS.length - 1];
}

function selectPityRarity() {
  const roll = Math.random();
  if (roll < 1e-30) return RARITY_TIERS.find(rarity => rarity.id === "eternal");
  if (roll < 1e-6) return RARITY_TIERS.find(rarity => rarity.id === "astral");
  if (roll < 0.01) return RARITY_TIERS.find(rarity => rarity.id === "luminous");
  return RARITY_TIERS.find(rarity => rarity.id === "resonant");
}

function chooseRuneForRarity(rarityId) {
  const candidates = Object.values(RUNE_DEFINITIONS).filter(rune => rune.rarity === rarityId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function grantRune(rune) {
  const current = state.ownedRunes[rune.id];
  if (!current || current.level <= 0) {
    state.ownedRunes[rune.id] = { level: 1, exp: 0, copies: 1 };
    return { rune, newRune: true, levelsGained: 1, level: 1 };
  }

  current.copies = Math.max(1, Math.floor(current.copies || 1)) + 1;
  if (current.level >= MAX_RUNE_LEVEL) return { rune, newRune: false, levelsGained: 0, level: current.level };
  current.exp = Math.max(0, Math.floor(current.exp || 0)) + 1;
  let levelsGained = 0;
  while (current.level < MAX_RUNE_LEVEL) {
    const requirement = getRuneExpRequirement(current.level);
    if (current.exp < requirement) break;
    current.exp -= requirement;
    current.level += 1;
    levelsGained += 1;
  }
  return { rune, newRune: false, levelsGained, level: current.level };
}

function rollOneRune() {
  const pityThreshold = getRunePityThreshold();
  const pityTriggered = state.runePity + 1 >= pityThreshold;
  const rarity = pityTriggered ? selectPityRarity() : selectNormalRarity();
  const rune = chooseRuneForRarity(rarity.id);
  const result = grantRune(rune);
  state.totalRuneRolls += 1;
  if (rarity.rank >= 2) state.runePity = 0;
  else state.runePity += 1;
  return { ...result, rarity, pityTriggered };
}

function rollRuneBatch(options = {}) {
  if (!hasPrestigeUnlock("runes")) return [];
  const bulk = getRuneBulk();
  const cost = getRuneCostPerUnit() * bulk;
  if (state.wind + 1e-9 < cost) return [];
  if (!options.ignoreCooldown && state.runeCooldown > 0) return [];

  state.wind -= cost;
  const results = [];
  for (let index = 0; index < bulk; index += 1) results.push(rollOneRune());
  state.runeCooldown = getRuneCooldownSeconds();
  state.lastRuneResults = results.slice(-6).map(result => ({ id: result.rune.id, rarity: result.rarity.id, newRune: result.newRune, level: result.level }));
  if (!options.silent) {
    const best = results.reduce((current, result) => result.rarity.rank > current.rarity.rank ? result : current, results[0]);
    showToast(`${best.rarity.name}: ${best.rune.name}${results.length > 1 ? ` +${results.length - 1} more` : ""}`);
  }
  if (options.render !== false) renderAll();
  return results;
}

function toggleAutoRune() {
  if (!hasResearchEffect("runeAutoRoll")) return;
  state.autoRuneEnabled = !state.autoRuneEnabled;
  renderRunesPage();
}

function processRuneTime(effectiveSeconds) {
  state.runeCooldown -= Math.max(0, effectiveSeconds);
  if (!state.autoRuneEnabled || !hasResearchEffect("runeAutoRoll")) {
    state.runeCooldown = Math.max(0, state.runeCooldown);
    return;
  }

  let loops = 0;
  while (state.runeCooldown <= 0 && state.wind + 1e-9 >= getRuneBatchCost() && loops < 1_000) {
    const carriedCooldown = state.runeCooldown;
    const results = rollRuneBatch({ silent: true, render: false, ignoreCooldown: true });
    if (!results.length) break;
    state.runeCooldown = carriedCooldown + getRuneCooldownSeconds();
    loops += 1;
  }
  state.runeCooldown = Math.max(0, state.runeCooldown);
}

function processAutoPowerPurchases() {
  let loops = 0;
  while (loops < 50) {
    const candidates = ["powerUpgradeLevel", "powerResonatorLevel"].filter(field => {
      const cap = getUpgradeCap(field);
      return (!Number.isFinite(cap) || state[field] < cap) && canAfford(state.power, getUpgradeCost(field));
    });
    if (!candidates.length) break;
    candidates.sort((left, right) => getUpgradeCost(left).compare(getUpgradeCost(right)));
    if (!buyRepeatableUpgrade(candidates[0], 1, { silent: true, render: false })) break;
    loops += 1;
  }
}

function processAutomations() {
  const now = Date.now();
  if (hasPrestigeUnlock("autoRebirth") && state.autoRebirthEnabled && now - lastAutoRebirthAt >= 1_000 && !getRebirthGain().isZero()) {
    lastAutoRebirthAt = now;
    performRebirth({ silent: true, render: false, save: false });
  }
  if (hasPrestigeUnlock("powerAutomation") && state.autoPowerEnabled) processAutoPowerPurchases();
}

function applyProgress(seconds, efficiency = 1) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const safeEfficiency = clamp(Number(efficiency) || 0, 0, 1);
  if (safeSeconds <= 0 || safeEfficiency <= 0) return { powerGain: HugeNumber.zero(), prismGain: 0, insightGain: 0, windGain: 0 };

  const effectiveSeconds = safeSeconds * safeEfficiency;
  const powerBefore = state.power.clone();
  const prismBefore = state.prisms;
  const insightBefore = state.insight;
  const windBefore = state.wind;

  state.power = state.power.add(getPowerPerSecond().multiply(effectiveSeconds));
  state.prismProgress += effectiveSeconds;
  resolvePrismGeneration(false);
  if (hasPrestigeUnlock("research")) state.insight += getInsightPerSecond() * effectiveSeconds;
  if (hasPrestigeUnlock("wind")) addWindProduction(effectiveSeconds);
  if (hasPrestigeUnlock("runes")) processRuneTime(effectiveSeconds);
  state.totalPlayTime += safeSeconds;
  processAutomations();

  return {
    powerGain: state.power.subtract(powerBefore),
    prismGain: state.prisms - prismBefore,
    insightGain: state.insight - insightBefore,
    windGain: state.wind - windBefore
  };
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
    const suspended = elapsedSeconds > BACKGROUND_SUSPEND_THRESHOLD_SECONDS;
    if (suspended) applySuspendedBackgroundProgress(elapsedSeconds, treatAsHidden);
    else applyProgress(elapsedSeconds, 1);
    autosaveAccumulator += elapsedSeconds * 1_000;
  }
  return elapsedSeconds;
}

/* ---------------------------------- UI ---------------------------------- */

function updateUnlockVisibility() {
  const researchUnlocked = hasPrestigeUnlock("research");
  const windUnlocked = hasPrestigeUnlock("wind");
  const runesUnlocked = hasPrestigeUnlock("runes");
  elements.researchNav.classList.toggle("hidden", !researchUnlocked);
  elements.windNav.classList.toggle("hidden", !windUnlocked);
  elements.runesNav.classList.toggle("hidden", !runesUnlocked);
  elements.headerInsightChip.classList.toggle("hidden", !researchUnlocked);
  elements.headerWindChip.classList.toggle("hidden", !windUnlocked);
  elements.powerAutomationPanel.classList.toggle("hidden", !hasPrestigeUnlock("powerAutomation"));
  elements.rebirthAutomationPanel.classList.toggle("hidden", !hasPrestigeUnlock("autoRebirth"));
  const pageUnlocked = activePage === "research" ? researchUnlocked
    : activePage === "wind" ? windUnlocked
      : activePage === "runes" ? runesUnlocked
        : true;
  if (!pageUnlocked) setActivePage("power");
  document.body.classList.toggle("first-shift-theme", state.selectedCosmetic === "first-shift" && isPrestigeUnlocked());
}

function setActivePage(pageName) {
  if (pageName === "research" && !hasPrestigeUnlock("research")) return;
  if (pageName === "wind" && !hasPrestigeUnlock("wind")) return;
  if (pageName === "runes" && !hasPrestigeUnlock("runes")) return;
  activePage = pageName;
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.page === pageName));
  document.querySelectorAll("[data-page-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.pagePanel === pageName));
  if (pageName === "tree") renderTree();
  if (pageName === "research") renderResearchTree();
  if (pageName === "runes") renderRunesPage();
}

function renderHeader() {
  const pps = getPowerPerSecond();
  const prismInterval = getPrismInterval();
  const remaining = Math.max(0, prismInterval - state.prismProgress);
  elements.headerPower.textContent = formatNumber(state.power);
  elements.headerPowerRate.textContent = `+${formatNumber(pps)}/s`;
  elements.headerPrism.textContent = formatInteger(state.prisms);
  elements.headerPrismTimer.textContent = `+${formatDecimal(getPrismGainPerCycle())} in ${remaining.toFixed(1)}s`;
  elements.headerRebirthPoints.textContent = formatInteger(state.rebirthPoints);
  if (hasPrestigeUnlock("research")) {
    elements.headerInsight.textContent = formatDecimal(state.insight);
    elements.headerInsightRate.textContent = `+${formatDecimal(getInsightPerSecond(), 3)}/s`;
  }
  if (hasPrestigeUnlock("wind")) {
    elements.headerWind.textContent = formatDecimal(state.wind);
    elements.headerWindRate.textContent = `${formatDecimal(state.windStorage)} stored`;
  }
}

function renderPowerPage() {
  const pps = getPowerPerSecond();
  const fluxCost = getUpgradeCost("powerUpgradeLevel");
  const resonatorCost = getUpgradeCost("powerResonatorLevel");
  const resonatorMultiplier = getPowerResonatorMultiplier();
  const resonatorCap = getPowerResonatorCap();
  const resonatorMaxed = state.powerResonatorLevel >= resonatorCap;

  elements.powerAmount.textContent = formatNumber(state.power);
  elements.powerPerSecond.textContent = `${formatNumber(pps)} Power per second`;
  elements.autoPowerToggle.checked = Boolean(state.autoPowerEnabled);

  elements.powerUpgradeLevel.textContent = formatInteger(state.powerUpgradeLevel);
  elements.powerUpgradeEffect.textContent = `+${formatNumber(getFluxBaseBonus())}/s`;
  elements.powerUpgradeNextEffect.textContent = `+${formatNumber(getFluxBaseBonus().add(1))}/s`;
  elements.powerUpgradeCost.textContent = `${formatNumber(fluxCost)} Power`;
  elements.buyPowerUpgrade.disabled = !canAfford(state.power, fluxCost);
  elements.buyMaxPowerUpgrade.disabled = !canAfford(state.power, fluxCost);

  elements.powerResonatorLevel.textContent = `${formatInteger(state.powerResonatorLevel)} / ${formatInteger(resonatorCap)}`;
  elements.powerResonatorEffect.textContent = `×${formatNumber(resonatorMultiplier)}`;
  elements.powerResonatorNextEffect.textContent = resonatorMaxed ? "Max level" : `×${formatNumber(resonatorMultiplier.multiply(1.25))}`;
  elements.powerResonatorCost.textContent = resonatorMaxed ? "CAP REACHED" : `${formatNumber(resonatorCost)} Power`;
  elements.buyPowerResonator.disabled = resonatorMaxed || !canAfford(state.power, resonatorCost);
  elements.buyMaxPowerResonator.disabled = resonatorMaxed || !canAfford(state.power, resonatorCost);
}

function renderRebirthPage() {
  const gain = getRebirthGain();
  const ampCost = getUpgradeCost("rebirthUpgradeLevel");
  const coreCost = getUpgradeCost("rebirthCoreLevel");
  const currentMultiplier = getRebirthPowerMultiplier();
  const requirementRemaining = HN(BASE_REBIRTH_REQUIREMENT).subtract(state.power).max(0);
  const ampCap = getRebirthAmplifierCap();
  const ampMaxed = state.rebirthUpgradeLevel >= ampCap;

  elements.autoRebirthToggle.checked = Boolean(state.autoRebirthEnabled);
  elements.rebirthGain.textContent = `${formatInteger(gain)} Rebirth Points`;
  elements.rebirthButton.disabled = gain.isZero();
  elements.rebirthRequirementText.textContent = gain.greaterThan(0)
    ? `Ready. ${formatNumber(state.power.floor())} Power grants ${formatInteger(gain)} RP after permanent bonuses.`
    : `${formatNumber(requirementRemaining)} more Power required.`;

  elements.rebirthUpgradeLevel.textContent = `${formatInteger(state.rebirthUpgradeLevel)} / ${formatInteger(ampCap)}`;
  elements.rebirthUpgradeEffect.textContent = `×${formatNumber(currentMultiplier)}`;
  elements.rebirthUpgradeNextEffect.textContent = ampMaxed ? "Max level" : `×${formatNumber(currentMultiplier.multiply(1.5))}`;
  elements.rebirthUpgradeCost.textContent = ampMaxed ? "CAP REACHED" : `${formatInteger(ampCost)} RP`;
  elements.buyRebirthUpgrade.disabled = ampMaxed || !canAfford(state.rebirthPoints, ampCost);
  elements.buyMaxRebirthUpgrade.disabled = ampMaxed || !canAfford(state.rebirthPoints, ampCost);

  elements.rebirthCoreLevel.textContent = formatInteger(state.rebirthCoreLevel);
  elements.rebirthCoreEffect.textContent = `+${formatNumber(getRebirthCoreBaseBonus())}/s`;
  elements.rebirthCoreNextEffect.textContent = `+${formatNumber(getRebirthCoreBaseBonus().add(2))}/s`;
  elements.rebirthCoreCost.textContent = `${formatInteger(coreCost)} RP`;
  elements.buyRebirthCore.disabled = !canAfford(state.rebirthPoints, coreCost);
  elements.buyMaxRebirthCore.disabled = !canAfford(state.rebirthPoints, coreCost);
}

function createCurvedTreePath(from, to, index, heightScale = 7.6) {
  const x1 = from.x * 10;
  const y1 = from.y * heightScale;
  const x2 = to.x * 10;
  const y2 = to.y * heightScale;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const direction = index % 2 === 0 ? 1 : -1;
  const bend = Math.min(42, length * 0.12) * direction;
  const cx = (x1 + x2) / 2 - (dy / length) * bend;
  const cy = (y1 + y2) / 2 + (dx / length) * bend;
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
    path.classList.add("tree-line", to.branch);
    if (hasTreeNode(fromId)) path.classList.add("active");
    elements.treeLines.appendChild(path);
  });

  for (const node of Object.values(TREE_NODES)) {
    if (!isTreeNodeVisible(node)) continue;
    const nodeState = getTreeNodeState(node);
    const level = getTreeLevel(node.id);
    const cost = getTreeNodeCost(node);
    const balance = getTreeCurrencyBalance(node);
    const affordable = ["available", "owned"].includes(nodeState) && canAfford(balance, cost);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node ${node.branch} ${nodeState}${affordable ? " affordable" : ""}${selectedTreeNodeId === node.id ? " selected" : ""}`;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.dataset.nodeId = node.id;
    button.setAttribute("aria-label", `${node.name}, ${nodeState}, level ${level} of ${node.maxLevel}`);

    const levelLabel = node.maxLevel > 1 ? `${level}/${node.maxLevel}` : `${level > 0 ? 1 : 0}/1`;
    const costLabel = nodeState === "maxed" ? "Maxed" : `${formatInteger(cost)} ${getTreeNodeCurrency(node) === "wind" ? "W" : "◇"}`;
    button.innerHTML = `<span class="hex-border"></span><span class="hex-fill"></span><span class="hex-inner"><span class="node-tier-mini">${levelLabel}</span><span class="node-icon">${node.icon}</span><span class="node-cost-mini">${costLabel}</span></span>`;
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
  const currencyField = getTreeNodeCurrency(node);
  const prerequisiteNames = node.prerequisites.length ? node.prerequisites.map(id => TREE_NODES[id].name).join(" + ") : "None";

  elements.selectedNodeIcon.textContent = node.icon;
  elements.selectedNodeCategory.textContent = node.category;
  elements.selectedNodeName.textContent = node.name;
  elements.selectedNodeDescription.textContent = node.description;
  elements.selectedNodeEffect.textContent = getTreeNodeEffectText(node, level);
  elements.selectedNodeCost.textContent = nodeState === "maxed" ? "Maxed" : `${formatInteger(cost)} ${currencyName(currencyField, cost)}`;
  elements.selectedNodeStatus.textContent = node.maxLevel > 1 ? `Level ${level}/${node.maxLevel}` : `${level > 0 ? 1 : 0}/1`;
  elements.selectedNodeRequirement.textContent = prerequisiteNames;
  elements.purchaseTreeNode.textContent = nodeState === "maxed" ? "Maxed" : node.maxLevel > 1 && level > 0 ? "Buy next level" : "Purchase node";
  elements.purchaseTreeNode.disabled = nodeState === "maxed" || !areTreePrerequisitesMet(node) || !canAfford(getTreeCurrencyBalance(node), cost);
}

function renderPrestigePage() {
  const tier = getCurrentPrestigeTier();
  const config = PRESTIGE_TIERS[tier];
  elements.prestigeLevelLabel.textContent = formatInteger(state.prestigeLevel);
  elements.totalPrestiges.textContent = formatInteger(state.totalPrestiges);
  elements.prestigeRewardList.innerHTML = "";

  const displayedConfig = config || PRESTIGE_TIERS[state.prestigeLevel] || PRESTIGE_TIERS[1];
  displayedConfig.rewards.forEach(reward => {
    const item = document.createElement("div");
    item.className = `reward-item${!config ? " claimed" : ""}`;
    item.innerHTML = `<span>${!config ? "✓" : "+"}</span><p>${reward}</p>`;
    elements.prestigeRewardList.appendChild(item);
  });

  if (!config) {
    elements.prestigeTierName.textContent = "Tier 1 complete";
    elements.prestigeRequirement.textContent = "Tier 2 is not included in this build";
    elements.prestigeProgressFill.style.width = "100%";
    elements.prestigeProgressText.textContent = "Future tiers can be added through PRESTIGE_TIERS data.";
    elements.prestigeRewardHeading.textContent = `${displayedConfig.name} rewards claimed`;
    elements.prestigeButton.textContent = "Current content completed";
    elements.prestigeButton.disabled = true;
    return;
  }

  const cost = getPrestigeCost();
  const progress = getHugeProgressPercent(state.power, cost);
  elements.prestigeTierName.textContent = `Tier ${tier} — ${config.name}`;
  elements.prestigeRequirement.textContent = `${formatNumber(cost)} Power`;
  elements.prestigeProgressFill.style.width = `${progress}%`;
  elements.prestigeProgressText.textContent = `${progress.toFixed(progress >= 10 ? 1 : 2)}% of requirement`;
  elements.prestigeRewardHeading.textContent = `${config.name} rewards`;
  elements.prestigeButton.textContent = `Claim Prestige Tier ${tier}`;
  elements.prestigeButton.disabled = !canAfford(state.power, cost);
}

function renderResearchTree() {
  if (!hasPrestigeUnlock("research")) return;
  elements.researchInsightBalance.textContent = formatDecimal(state.insight);
  elements.researchNodes.innerHTML = "";
  elements.researchLines.innerHTML = "";

  RESEARCH_CONNECTIONS.forEach(([fromId, toId], index) => {
    const from = RESEARCH_NODES[fromId];
    const to = RESEARCH_NODES[toId];
    if (!isResearchNodeVisible(from) || !isResearchNodeVisible(to)) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", createCurvedTreePath(from, to, index, 7));
    path.classList.add("tree-line", "research-line", to.branch);
    if (hasResearchNode(fromId)) path.classList.add("active");
    elements.researchLines.appendChild(path);
  });

  for (const node of Object.values(RESEARCH_NODES)) {
    if (!isResearchNodeVisible(node)) continue;
    const nodeState = getResearchNodeState(node);
    const affordable = nodeState === "available" && canAfford(state.insight, node.cost);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node research-node ${node.branch} ${nodeState}${affordable ? " affordable" : ""}${selectedResearchNodeId === node.id ? " selected" : ""}`;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.innerHTML = `<span class="hex-border"></span><span class="hex-fill"></span><span class="hex-inner"><span class="node-tier-mini">${hasResearchNode(node.id) ? "1/1" : "0/1"}</span><span class="node-icon">${node.icon}</span><span class="node-cost-mini">${hasResearchNode(node.id) ? "Researched" : `${node.cost} I`}</span></span>`;
    button.addEventListener("click", () => { selectedResearchNodeId = node.id; renderResearchTree(); });
    elements.researchNodes.appendChild(button);
  }
  renderSelectedResearchNode();
}

function renderSelectedResearchNode() {
  const node = RESEARCH_NODES[selectedResearchNodeId];
  if (!node || !isResearchNodeVisible(node)) {
    elements.researchPlaceholder.classList.remove("hidden");
    elements.researchDetails.classList.add("hidden");
    return;
  }
  elements.researchPlaceholder.classList.add("hidden");
  elements.researchDetails.classList.remove("hidden");
  const stateName = getResearchNodeState(node);
  elements.selectedResearchIcon.textContent = node.icon;
  elements.selectedResearchCategory.textContent = node.category;
  elements.selectedResearchName.textContent = node.name;
  elements.selectedResearchDescription.textContent = node.description;
  elements.selectedResearchEffect.textContent = node.effectText;
  elements.selectedResearchCost.textContent = stateName === "maxed" ? "Researched" : `${node.cost} Insight`;
  elements.selectedResearchStatus.textContent = hasResearchNode(node.id) ? "1/1" : "0/1";
  elements.selectedResearchRequirement.textContent = node.prerequisites.length ? node.prerequisites.map(id => RESEARCH_NODES[id].name).join(" + ") : "None";
  elements.purchaseResearchNode.textContent = stateName === "maxed" ? "Researched" : "Research node";
  elements.purchaseResearchNode.disabled = stateName !== "available" || !canAfford(state.insight, node.cost);
}

function renderWindPage() {
  if (!hasPrestigeUnlock("wind")) return;
  const cap = getWindStorageCap();
  const turbineCap = getWindTurbineCap();
  const output = getWindOutputPerSecond();
  const cost = getUpgradeCost("windTurbineLevel");
  const maxed = state.windTurbineLevel >= turbineCap;
  const fill = cap > 0 ? clamp((state.windStorage / cap) * 100, 0, 100) : 0;

  elements.windAmount.textContent = formatDecimal(state.wind);
  elements.windStored.textContent = formatDecimal(state.windStorage);
  elements.windStorageCap.textContent = formatDecimal(cap);
  elements.windStorageFill.style.width = `${fill}%`;
  elements.windProductionRate.textContent = `${formatDecimal(output, 3)} Wind/s · ${formatDecimal(state.windWasted)} total wasted`;
  elements.windCollectAmount.textContent = formatDecimal(Math.min(getWindCollectAmount(), state.windStorage));
  elements.collectWindButton.disabled = state.windStorage <= 0 || hasResearchEffect("windAutoCollect");
  elements.windAutoStatus.textContent = hasResearchEffect("windAutoCollect") ? "Auto-collection active" : "Manual collection required";

  elements.windTurbineLevel.textContent = `${formatInteger(state.windTurbineLevel)} / ${formatInteger(turbineCap)}`;
  elements.windTurbineEffect.textContent = `${formatDecimal(output, 3)}/s`;
  const nextOutput = (state.windTurbineLevel + 1) * BASE_WIND_PER_TURBINE * getTreeNumberProduct("windOutputMultiplier") * getRuneEffectProduct("windMultiplier") * getAllProductionRuneMultiplier();
  elements.windTurbineNextEffect.textContent = maxed ? "Max level" : `${formatDecimal(nextOutput, 3)}/s`;
  elements.windTurbineCost.textContent = maxed ? "CAP REACHED" : `${formatNumber(cost)} Power`;
  elements.buyWindTurbine.disabled = maxed || !canAfford(state.power, cost);
  elements.buyMaxWindTurbine.disabled = maxed || !canAfford(state.power, cost);
}

function getRarity(rarityId) {
  return RARITY_TIERS.find(rarity => rarity.id === rarityId) || RARITY_TIERS[RARITY_TIERS.length - 1];
}

function getRuneEffectDescription(rune, level) {
  const scaled = rune.base * getRuneScale(level);
  if (["powerMultiplier", "prismMultiplier", "windMultiplier", "rebirthMultiplier", "insightMultiplier", "allProduction"].includes(rune.effect)) {
    return `×${formatSmallNumber(1 + scaled, 3)} ${rune.effect === "allProduction" ? "all production" : rune.effect.replace("Multiplier", "")}`;
  }
  if (rune.effect === "offlineEfficiency") return `+${(scaled * 100).toFixed(2)}% offline efficiency`;
  if (rune.effect === "runeLuck") return `+${formatDecimal(scaled, 2)} Luck points`;
  if (rune.effect === "runeSpeed") return `+${formatDecimal(scaled, 2)} Speed points`;
  if (rune.effect === "runeBulk") return `+${formatDecimal(scaled, 2)} Bulk points`;
  return rune.description;
}

function renderRunesPage() {
  if (!hasPrestigeUnlock("runes")) return;
  const ownedCount = Object.keys(state.ownedRunes).filter(id => getOwnedRune(id)).length;
  const bulk = getRuneBulk();
  const batchCost = getRuneBatchCost();
  const pityThreshold = getRunePityThreshold();
  const cooldown = getRuneCooldownSeconds();
  const ready = state.runeCooldown <= 0;

  elements.ownedRuneCount.textContent = formatInteger(ownedCount);
  elements.totalRuneCount.textContent = formatInteger(Object.keys(RUNE_DEFINITIONS).length);
  elements.runeRollCost.textContent = `${formatDecimal(batchCost)} Wind (${formatDecimal(getRuneCostPerUnit())} each)`;
  elements.runeCooldownText.textContent = ready ? "Ready" : `${state.runeCooldown.toFixed(2)}s remaining`;
  elements.runeBulkLabel.textContent = formatInteger(bulk);
  elements.rollRuneButton.disabled = !ready || state.wind + 1e-9 < batchCost;
  elements.runePityFill.style.width = `${clamp((state.runePity / pityThreshold) * 100, 0, 100)}%`;
  elements.runePityText.textContent = `Rare pity: ${formatInteger(state.runePity)} / ${formatInteger(pityThreshold)}`;
  elements.runeLuckText.textContent = `×${getRuneLuckMultiplier().toFixed(2)} odds`;
  elements.runeSpeedText.textContent = `${cooldown.toFixed(2)}s cooldown`;
  elements.runeBulkText.textContent = `${bulk} per roll (cap 5)`;

  const autoUnlocked = hasResearchEffect("runeAutoRoll");
  elements.autoRuneButton.disabled = !autoUnlocked;
  elements.autoRuneButton.textContent = autoUnlocked ? `Auto-roll: ${state.autoRuneEnabled ? "ON" : "OFF"}` : "Auto-roll locked";
  if (state.lastRuneResults.length) {
    elements.runeLastResult.textContent = state.lastRuneResults.map(result => `${getRarity(result.rarity).name} ${RUNE_DEFINITIONS[result.id]?.name || "Rune"} Lv.${result.level}`).join(" · ");
  } else {
    elements.runeLastResult.textContent = "No Rune rolled yet.";
  }

  elements.runeGrid.innerHTML = "";
  for (const rune of Object.values(RUNE_DEFINITIONS)) {
    const rarity = getRarity(rune.rarity);
    const owned = getOwnedRune(rune.id);
    const card = document.createElement("article");
    card.className = `rune-card rarity-${rarity.id}${owned ? " owned" : " locked"}`;
    if (!owned) {
      card.innerHTML = `<div class="rune-card-top"><span class="rune-icon">?</span><span class="rune-rarity">${rarity.name}</span></div><h3>Unknown Rune</h3><p>${rarity.displayOdds}</p><div class="rune-exp-row"><span>Not discovered</span><strong>Lv.0</strong></div>`;
    } else {
      const requirement = getRuneExpRequirement(owned.level);
      const expText = Number.isFinite(requirement) ? `${formatInteger(owned.exp)} / ${formatInteger(requirement)} EXP` : "MAX LEVEL";
      card.innerHTML = `<div class="rune-card-top"><span class="rune-icon">${rune.icon}</span><span class="rune-rarity">${rarity.name}</span></div><h3>${rune.name}</h3><p>${getRuneEffectDescription(rune, owned.level)}</p><div class="rune-exp-row"><span>${expText}</span><strong>Lv.${formatInteger(owned.level)}</strong></div><small>${formatInteger(owned.copies)} total copies · ${rarity.displayOdds}</small>`;
    }
    elements.runeGrid.appendChild(card);
  }
}

function renderAll() {
  updateUnlockVisibility();
  renderHeader();
  renderPowerPage();
  renderRebirthPage();
  renderPrestigePage();
  if (activePage === "tree") renderTree();
  if (hasPrestigeUnlock("wind")) renderWindPage();
  if (hasPrestigeUnlock("runes")) renderRunesPage();
  if (activePage === "research" && hasPrestigeUnlock("research")) renderResearchTree();
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimeout);
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

  for (let index = 0; index <= 6; index += 1) {
    const x = margin.left + (plotWidth * index) / 6;
    context.beginPath();
    context.moveTo(x, margin.top);
    context.lineTo(x, margin.top + plotHeight);
    context.stroke();
    context.textAlign = index === 0 ? "left" : index === 6 ? "right" : "center";
    context.fillText(formatDuration((report.appliedSeconds * index) / 6), x, cssHeight - 22);
  }

  for (let index = 0; index <= 4; index += 1) {
    const progress = index / 4;
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
  for (let index = 0; index <= 48; index += 1) {
    const progress = index / 48;
    const eased = 1 - Math.pow(1 - progress, 1.35);
    const x = margin.left + plotWidth * progress;
    const y = margin.top + plotHeight - plotHeight * eased;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

/* ------------------------------- Save Data ------------------------------- */

function sanitizeFiniteNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function rebuildPrerequisiteLevels(definitions, requestedLevels, gateCheck = () => true) {
  const accepted = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of Object.values(definitions)) {
      if (!requestedLevels[node.id] || accepted[node.id] || !gateCheck(node)) continue;
      if ((node.prerequisites || []).every(id => (accepted[id] || 0) > 0)) {
        accepted[node.id] = Math.min(node.maxLevel || 1, Math.max(1, requestedLevels[node.id]));
        changed = true;
      }
    }
  }
  return accepted;
}

function sanitizeLoadedState(candidate) {
  const clean = createFreshState();
  if (!candidate || typeof candidate !== "object") return clean;

  clean.power = HN(candidate.power).max(0);
  clean.rebirthPoints = HN(candidate.rebirthPoints).max(0);
  clean.prisms = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.prisms));
  clean.insight = sanitizeFiniteNonNegativeNumber(candidate.insight);
  clean.wind = sanitizeFiniteNonNegativeNumber(candidate.wind);
  clean.windStorage = sanitizeFiniteNonNegativeNumber(candidate.windStorage);
  clean.windWasted = sanitizeFiniteNonNegativeNumber(candidate.windWasted);
  clean.prismProgress = sanitizeFiniteNonNegativeNumber(candidate.prismProgress);
  clean.prismYieldRemainder = sanitizeFiniteNonNegativeNumber(candidate.prismYieldRemainder);
  clean.totalRebirths = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.totalRebirths));
  clean.totalPrestiges = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.totalPrestiges));
  clean.prestigeLevel = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.prestigeLevel));
  if (clean.prestigeLevel > clean.totalPrestiges) clean.totalPrestiges = clean.prestigeLevel;
  clean.totalRuneRolls = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.totalRuneRolls));
  clean.totalPlayTime = sanitizeFiniteNonNegativeNumber(candidate.totalPlayTime);
  clean.lastUpdateAt = sanitizeFiniteNonNegativeNumber(candidate.lastUpdateAt, Date.now());
  clean.runePity = Math.floor(sanitizeFiniteNonNegativeNumber(candidate.runePity));
  clean.runeCooldown = sanitizeFiniteNonNegativeNumber(candidate.runeCooldown);
  clean.autoRuneEnabled = Boolean(candidate.autoRuneEnabled);
  clean.autoPowerEnabled = Boolean(candidate.autoPowerEnabled);
  clean.autoRebirthEnabled = Boolean(candidate.autoRebirthEnabled);

  const requestedResearch = {};
  if (candidate.researchLevels && typeof candidate.researchLevels === "object") {
    for (const [nodeId, rawLevel] of Object.entries(candidate.researchLevels)) {
      if (Object.hasOwn(RESEARCH_NODES, nodeId) && sanitizeFiniteNonNegativeNumber(rawLevel) >= 1) requestedResearch[nodeId] = 1;
    }
  }
  if (Array.isArray(candidate.purchasedResearchNodes)) {
    for (const nodeId of candidate.purchasedResearchNodes) if (Object.hasOwn(RESEARCH_NODES, nodeId)) requestedResearch[nodeId] = 1;
  }
  clean.researchLevels = hasPrestigeUnlock("research", clean.prestigeLevel)
    ? rebuildPrerequisiteLevels(RESEARCH_NODES, requestedResearch)
    : {};
  clean.purchasedResearchNodes = Object.keys(clean.researchLevels);
  clean.autoPowerEnabled = hasPrestigeUnlock("powerAutomation", clean.prestigeLevel) && clean.autoPowerEnabled;
  clean.autoRebirthEnabled = hasPrestigeUnlock("autoRebirth", clean.prestigeLevel) && clean.autoRebirthEnabled;
  clean.autoRuneEnabled = Boolean(clean.researchLevels.runeMechanics) && clean.autoRuneEnabled;

  const requestedTree = {};
  if (candidate.treeLevels && typeof candidate.treeLevels === "object") {
    for (const [nodeId, rawLevel] of Object.entries(candidate.treeLevels)) {
      if (!Object.hasOwn(TREE_NODES, nodeId)) continue;
      requestedTree[nodeId] = Math.min(TREE_NODES[nodeId].maxLevel, Math.floor(sanitizeFiniteNonNegativeNumber(rawLevel)));
    }
  }
  if (Array.isArray(candidate.purchasedTreeNodes)) {
    for (const nodeId of candidate.purchasedTreeNodes) if (Object.hasOwn(TREE_NODES, nodeId)) requestedTree[nodeId] = Math.max(1, requestedTree[nodeId] || 0);
  }
  const originalState = state;
  state = clean;
  clean.treeLevels = rebuildPrerequisiteLevels(TREE_NODES, requestedTree, node => treeNodeGatesMet(node));
  clean.purchasedTreeNodes = Object.keys(clean.treeLevels);
  state = originalState;

  for (const field of Object.keys(UPGRADE_DEFINITIONS)) clean[field] = Math.floor(sanitizeFiniteNonNegativeNumber(candidate[field]));
  const stateBeforeClamp = state;
  state = clean;
  for (const field of Object.keys(UPGRADE_DEFINITIONS)) {
    const cap = getUpgradeCap(field);
    if (Number.isFinite(cap)) clean[field] = Math.min(clean[field], cap);
    clean[field] = Math.min(clean[field], Number.MAX_SAFE_INTEGER);
  }
  clean.windStorage = Math.min(clean.windStorage, getWindStorageCap());
  state = stateBeforeClamp;

  if (candidate.ownedRunes && typeof candidate.ownedRunes === "object") {
    for (const [runeId, rawOwned] of Object.entries(candidate.ownedRunes)) {
      if (!Object.hasOwn(RUNE_DEFINITIONS, runeId) || !rawOwned || typeof rawOwned !== "object") continue;
      let level = clamp(Math.floor(sanitizeFiniteNonNegativeNumber(rawOwned.level)), 0, MAX_RUNE_LEVEL);
      if (level <= 0) continue;
      let exp = Math.floor(sanitizeFiniteNonNegativeNumber(rawOwned.exp));
      const copies = Math.max(1, Math.floor(sanitizeFiniteNonNegativeNumber(rawOwned.copies, 1)));
      while (level < MAX_RUNE_LEVEL && exp >= getRuneExpRequirement(level)) {
        exp -= getRuneExpRequirement(level);
        level += 1;
      }
      if (level >= MAX_RUNE_LEVEL) exp = 0;
      clean.ownedRunes[runeId] = { level, exp, copies };
    }
  }

  clean.lastRuneResults = Array.isArray(candidate.lastRuneResults)
    ? candidate.lastRuneResults.filter(result => result && Object.hasOwn(RUNE_DEFINITIONS, result.id)).slice(-6).map(result => ({
      id: result.id,
      rarity: RUNE_DEFINITIONS[result.id].rarity,
      newRune: Boolean(result.newRune),
      level: clamp(Math.floor(sanitizeFiniteNonNegativeNumber(result.level, 1)), 1, MAX_RUNE_LEVEL)
    }))
    : [];

  clean.unlockedCosmetics = Array.isArray(candidate.unlockedCosmetics)
    ? [...new Set(candidate.unlockedCosmetics.filter(value => ["default", "first-shift"].includes(value)))]
    : ["default"];
  if (!clean.unlockedCosmetics.includes("default")) clean.unlockedCosmetics.unshift("default");
  for (const config of getClaimedPrestigeTiers(clean.prestigeLevel)) {
    for (const cosmetic of config.effects?.cosmetics || []) {
      if (!clean.unlockedCosmetics.includes(cosmetic)) clean.unlockedCosmetics.push(cosmetic);
    }
  }
  clean.selectedCosmetic = clean.unlockedCosmetics.includes(candidate.selectedCosmetic) ? candidate.selectedCosmetic : "default";
  clean.version = GAME_VERSION;
  return clean;
}

function saveGame(showFeedback = true) {
  try {
    state.lastUpdateAt = Date.now();
    state.purchasedTreeNodes = Object.keys(state.treeLevels).filter(id => getTreeLevel(id) > 0);
    state.purchasedResearchNodes = Object.keys(state.researchLevels).filter(id => getResearchLevel(id) > 0);
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    elements.saveStatus.textContent = "Saved";
    if (showFeedback) showToast("Game saved");
    setTimeout(() => { if (elements.saveStatus.textContent === "Saved") elements.saveStatus.textContent = "Ready"; }, 1400);
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
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
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
    selectedResearchNodeId = null;
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
  selectedResearchNodeId = null;
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

  if (["power", "rebirthPoints"].includes(field)) {
    const amount = HN(raw);
    if (amount.sign < 0 || (!raw || amount.isZero() && !/^0(?:\.0+)?$/i.test(raw))) {
      showToast("Use a value such as 1000 or 1e100K");
      return;
    }
    state[field] = mode === "add" ? HN(state[field]).add(amount) : amount;
  } else {
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      showToast("Enter a finite non-negative amount");
      return;
    }
    state[field] = mode === "add" ? state[field] + amount : amount;
    if (field === "prisms") state[field] = Math.floor(state[field]);
    if (field === "windStorage") state.windStorage = Math.min(state.windStorage, getWindStorageCap());
  }
  saveGame(false);
  renderAll();
  showToast(`${field} ${mode === "add" ? "increased" : "set"}`);
}

function developerChangeUpgrade(mode) {
  if (!isDeveloperUnlocked()) return;
  const field = elements.developerUpgradeSelect.value;
  const amount = getDeveloperNumberInput(elements.developerUpgradeAmount, true);
  if (amount === null || !Object.hasOwn(state, field) || !Object.hasOwn(UPGRADE_DEFINITIONS, field)) {
    showToast("Enter a valid upgrade level");
    return;
  }
  const proposed = mode === "add" ? state[field] + amount : amount;
  const cap = getUpgradeCap(field);
  state[field] = Math.min(Math.floor(proposed), Number.isFinite(cap) ? cap : Number.MAX_SAFE_INTEGER);
  saveGame(false);
  renderAll();
  showToast(`Upgrade level ${mode === "add" ? "increased" : "set"}`);
}

function developerUnlockTree() {
  if (!isDeveloperUnlocked()) return;
  const requested = { ...state.treeLevels };
  for (const node of Object.values(TREE_NODES)) {
    if (treeNodeGatesMet(node)) requested[node.id] = node.maxLevel;
  }
  state.treeLevels = rebuildPrerequisiteLevels(TREE_NODES, requested, node => treeNodeGatesMet(node));
  state.purchasedTreeNodes = Object.keys(state.treeLevels);
  resolvePrismGeneration(false);
  saveGame(false);
  renderAll();
  showToast("Available Prism Tree nodes maxed");
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

function developerGrantPrestige() {
  if (!isDeveloperUnlocked()) return;
  state.prestigeLevel = Math.max(1, state.prestigeLevel);
  state.totalPrestiges = Math.max(1, state.totalPrestiges);
  for (const config of getClaimedPrestigeTiers()) {
    const effects = config.effects || {};
    if (effects.enableAutoPowerByDefault) state.autoPowerEnabled = true;
    for (const cosmetic of effects.cosmetics || []) {
      if (!state.unlockedCosmetics.includes(cosmetic)) state.unlockedCosmetics.push(cosmetic);
    }
  }
  saveGame(false);
  renderAll();
  showToast("Prestige Tier 1 granted");
}

function developerUnlockResearch() {
  if (!isDeveloperUnlocked()) return;
  developerGrantPrestige();
  state.researchLevels = {};
  for (const node of Object.values(RESEARCH_NODES)) state.researchLevels[node.id] = 1;
  state.researchLevels = rebuildPrerequisiteLevels(RESEARCH_NODES, state.researchLevels);
  state.purchasedResearchNodes = Object.keys(state.researchLevels);
  saveGame(false);
  renderAll();
  showToast("All Research purchased");
}

function developerGrantRunes() {
  if (!isDeveloperUnlocked()) return;
  developerGrantPrestige();
  for (const rune of Object.values(RUNE_DEFINITIONS)) {
    if (!state.ownedRunes[rune.id]) state.ownedRunes[rune.id] = { level: 1, exp: 0, copies: 1 };
  }
  saveGame(false);
  renderAll();
  showToast("All Runes granted at level 1");
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
    if (activePage === "power") renderPowerPage();
    else if (activePage === "rebirth") renderRebirthPage();
    else if (activePage === "tree") {
      elements.treePrismBalance.textContent = formatInteger(state.prisms);
      renderSelectedTreeNode();
    } else if (activePage === "prestige") renderPrestigePage();
    else if (activePage === "research") {
      elements.researchInsightBalance.textContent = formatDecimal(state.insight);
      renderSelectedResearchNode();
    } else if (activePage === "wind") renderWindPage();
    else if (activePage === "runes") renderRunesPage();
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
  elements.autoPowerToggle.addEventListener("change", () => { state.autoPowerEnabled = elements.autoPowerToggle.checked; });
  elements.rebirthButton.addEventListener("click", () => performRebirth());
  elements.buyRebirthUpgrade.addEventListener("click", () => buyRebirthUpgrade(1));
  elements.buyMaxRebirthUpgrade.addEventListener("click", () => buyRebirthUpgrade(Infinity));
  elements.buyRebirthCore.addEventListener("click", () => buyRebirthCore(1));
  elements.buyMaxRebirthCore.addEventListener("click", () => buyRebirthCore(Infinity));
  elements.autoRebirthToggle.addEventListener("change", () => { state.autoRebirthEnabled = elements.autoRebirthToggle.checked; });
  elements.purchaseTreeNode.addEventListener("click", purchaseSelectedTreeNode);
  elements.prestigeButton.addEventListener("click", performPrestige);
  elements.purchaseResearchNode.addEventListener("click", purchaseSelectedResearchNode);
  elements.collectWindButton.addEventListener("click", collectWind);
  elements.buyWindTurbine.addEventListener("click", () => buyWindTurbine(1));
  elements.buyMaxWindTurbine.addEventListener("click", () => buyWindTurbine(Infinity));
  elements.rollRuneButton.addEventListener("click", () => rollRuneBatch());
  elements.autoRuneButton.addEventListener("click", toggleAutoRune);

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
  elements.developerUnlockPrestige.addEventListener("click", developerGrantPrestige);
  elements.developerUnlockResearch.addEventListener("click", developerUnlockResearch);
  elements.developerGrantRunes.addEventListener("click", developerGrantRunes);
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
  updateUnlockVisibility();

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
