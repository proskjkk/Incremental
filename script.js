"use strict";

/* --------------------------------------------------------------------------
   Eonshift V0.0.1
   Static HTML/CSS/JS prototype. All progression numbers use HugeNumber so
   values such as 1e100K remain finite and serializable.
---------------------------------------------------------------------------- */

const GAME_VERSION = "0.0.1";
const SAVE_KEY = "eonshift-save-v001";
const AUTOSAVE_SECONDS = 10;
const BASE_PRISM_INTERVAL = 40;
const BASE_OFFLINE_EFFICIENCY = 0.85;
const BASE_OFFLINE_LIMIT_SECONDS = 6 * 60 * 60;
const BASE_INSIGHT_RATE = 0.2;
const BASE_RUNE_COOLDOWN = 1;
const MIN_RUNE_COOLDOWN = 0.15;
const BASE_RUNE_PITY = 75;
const BASE_REBIRTH_REQUIREMENT = 1000;
const SUSPEND_GAP_SECONDS = 10;
const MAX_SAFE_LEVEL = 1e9;

/* -------------------------------- HugeNumber ------------------------------- */

class HugeNumber {
  constructor(value = 0) {
    this.m = 0;
    this.e = 0;
    this.set(value);
  }

  static from(value) {
    return value instanceof HugeNumber ? value.clone() : new HugeNumber(value);
  }

  static zero() { return new HugeNumber(0); }
  static one() { return new HugeNumber(1); }

  static fromLog10(logValue) {
    if (!Number.isFinite(logValue)) return logValue === -Infinity ? HugeNumber.zero() : new HugeNumber({ m: 9.99999999999999, e: Number.MAX_VALUE });
    const exponent = Math.floor(logValue);
    const mantissa = Math.pow(10, logValue - exponent);
    return new HugeNumber({ m: mantissa, e: exponent });
  }

  set(value) {
    if (value instanceof HugeNumber) {
      this.m = value.m;
      this.e = value.e;
      return this;
    }

    if (value && typeof value === "object") {
      const mantissa = Number(value.m ?? value.mantissa ?? value.significand);
      const exponent = Number(value.e ?? value.exponent ?? 0);
      if (Number.isFinite(mantissa) && Number.isFinite(exponent)) {
        this.m = Math.max(0, mantissa);
        this.e = exponent;
        return this.normalize();
      }
    }

    if (typeof value === "string") {
      const text = value.trim().replaceAll(",", "");
      if (!text || /^0+(\.0+)?$/i.test(text)) {
        this.m = 0;
        this.e = 0;
        return this;
      }

      const scientific = text.match(/^([+]?(?:\d+\.?\d*|\.\d+))(?:e([+]?[-\d.]+(?:[a-z]+)?))?$/i);
      if (scientific) {
        const coefficient = Number(scientific[1]);
        const exponent = scientific[2] ? parseCompactMagnitude(scientific[2]) : 0;
        if (Number.isFinite(coefficient) && Number.isFinite(exponent) && coefficient >= 0) {
          if (!scientific[2]) return this.set(coefficient);
          this.m = coefficient;
          this.e = exponent;
          return this.normalize();
        }
      }

      const plain = Number(text);
      if (Number.isFinite(plain) && plain >= 0) return this.set(plain);
      this.m = 0;
      this.e = 0;
      return this;
    }

    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      this.m = 0;
      this.e = 0;
      return this;
    }

    this.e = Math.floor(Math.log10(number));
    this.m = number / Math.pow(10, this.e);
    return this.normalize();
  }

  normalize() {
    if (!Number.isFinite(this.m) || !Number.isFinite(this.e) || this.m <= 0) {
      this.m = 0;
      this.e = 0;
      return this;
    }

    const shift = Math.floor(Math.log10(this.m));
    this.m /= Math.pow(10, shift);
    this.e += shift;

    if (this.m >= 10) {
      this.m /= 10;
      this.e += 1;
    } else if (this.m < 1) {
      this.m *= 10;
      this.e -= 1;
    }

    return this;
  }

  clone() { return new HugeNumber(this); }
  isZero() { return this.m === 0; }
  log10() { return this.isZero() ? -Infinity : this.e + Math.log10(this.m); }
  toNumber() { return this.isZero() ? 0 : this.e > 308 ? Infinity : this.m * Math.pow(10, this.e); }

  compare(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero() && other.isZero()) return 0;
    if (this.isZero()) return -1;
    if (other.isZero()) return 1;
    if (this.e !== other.e) return this.e > other.e ? 1 : -1;
    if (this.m === other.m) return 0;
    return this.m > other.m ? 1 : -1;
  }

  eq(other) { return this.compare(other) === 0; }
  gt(other) { return this.compare(other) > 0; }
  gte(other) { return this.compare(other) >= 0; }
  lt(other) { return this.compare(other) < 0; }
  lte(other) { return this.compare(other) <= 0; }

  add(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero()) return other;
    if (other.isZero()) return this.clone();
    const larger = this.gte(other) ? this : other;
    const smaller = this.gte(other) ? other : this;
    const difference = larger.e - smaller.e;
    if (difference > 16) return larger.clone();
    return new HugeNumber({ m: larger.m + smaller.m * Math.pow(10, -difference), e: larger.e });
  }

  sub(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (other.isZero()) return this.clone();
    if (this.lte(other)) return HugeNumber.zero();
    const difference = this.e - other.e;
    if (difference > 16) return this.clone();
    return new HugeNumber({ m: this.m - other.m * Math.pow(10, -difference), e: this.e });
  }

  mul(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero() || other.isZero()) return HugeNumber.zero();
    return new HugeNumber({ m: this.m * other.m, e: this.e + other.e });
  }

  div(otherValue) {
    const other = HugeNumber.from(otherValue);
    if (this.isZero()) return HugeNumber.zero();
    if (other.isZero()) return new HugeNumber({ m: 9.99999999999999, e: Number.MAX_VALUE });
    return new HugeNumber({ m: this.m / other.m, e: this.e - other.e });
  }

  pow(power) {
    const numericPower = Number(power);
    if (numericPower === 0) return HugeNumber.one();
    if (this.isZero()) return HugeNumber.zero();
    if (!Number.isFinite(numericPower)) return HugeNumber.zero();
    return HugeNumber.fromLog10(this.log10() * numericPower);
  }

  floor() {
    if (this.isZero() || this.e < 0) return HugeNumber.zero();
    if (this.e >= 15) return this.clone();
    return new HugeNumber(Math.floor(this.toNumber()));
  }

  min(other) { return this.lte(other) ? this.clone() : HugeNumber.from(other); }
  max(other) { return this.gte(other) ? this.clone() : HugeNumber.from(other); }

  toJSON() { return this.toString(); }
  toString() {
    if (this.isZero()) return "0";
    const mantissa = Number(this.m.toPrecision(15)).toString();
    return `${mantissa}e${Math.trunc(this.e)}`;
  }
}

function parseCompactMagnitude(token) {
  const match = String(token).trim().match(/^([+-]?\d+(?:\.\d+)?)([a-z]+)?$/i);
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return Number.NaN;
  const suffix = (match[2] || "").toUpperCase();
  const suffixMap = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, QA: 1e15, QN: 1e18 };
  return value * (suffixMap[suffix] || 1);
}

function H(value = 0) { return HugeNumber.from(value); }

/* --------------------------------- Config --------------------------------- */

const UPGRADE_CONFIG = {
  flux: {
    id: "flux",
    group: "power",
    name: "Flux Condenser",
    tag: "POWER UPGRADE",
    icon: "+",
    description: "Adds +1 base Power/s per level.",
    baseCost: H(5),
    growth: 1.58,
    cap: () => Infinity,
    current: level => `+${formatLevelNumber(level)}/s`,
    next: level => `+${formatLevelNumber(level + 1)}/s`
  },
  resonator: {
    id: "resonator",
    group: "power",
    name: "Power Resonator",
    tag: "POWER UPGRADE",
    icon: "×",
    description: "Multiplies total Power by ×1.25 per level.",
    baseCost: H(20),
    growth: 2.08,
    cap: () => getResonatorCap(),
    current: level => `×${formatHuge(H(1.25).pow(level))}`,
    next: level => `×${formatHuge(H(1.25).pow(level + 1))}`
  },
  amplifier: {
    id: "amplifier",
    group: "rebirth",
    name: "Rebirth Amplifier",
    tag: "REBIRTH UPGRADE",
    icon: "↟",
    description: "Multiplies total Power by ×1.5 per level.",
    baseCost: H(1),
    growth: 3.25,
    cap: () => getAmplifierCap(),
    current: level => `×${formatHuge(H(1.5).pow(level))}`,
    next: level => `×${formatHuge(H(1.5).pow(level + 1))}`
  },
  core: {
    id: "core",
    group: "rebirth",
    name: "Rebirth Core",
    tag: "REBIRTH UPGRADE",
    icon: "◆",
    description: "Adds +2 base Power/s per level.",
    baseCost: H(2),
    growth: 2.05,
    cap: () => Infinity,
    current: level => `+${formatLevelNumber(level * 2)}/s`,
    next: level => `+${formatLevelNumber((level + 1) * 2)}/s`
  }
};

const PRESTIGE_TIERS = [
  {
    tier: 1,
    name: "First Shift",
    baseCost: H("1e30"),
    growth: H("1e18"),
    rewards: [
      ["Research", "Unlock Insight generation and the Research Tree."],
      ["Wind", "Unlock Wind Turbines and storage."],
      ["Runes", "Unlock the Wind-powered Rune system."],
      ["Power automation", "Automatically purchase Power upgrades when enabled."],
      ["Auto Rebirth", "Unlock an optional automatic Rebirth toggle."],
      ["Expanded Prism Tree", "Reveal the Wind and post-shift Prism branches."],
      ["Permanent Power", "One-time ×2 Power production."],
      ["Permanent Rebirth", "One-time ×1.5 Rebirth Point gain."],
      ["Limit breaks", "+10 Resonator cap and +10 Amplifier cap."],
      ["First Shift theme", "Unlock the gold Shift accent." ]
    ]
  }
];

const PRISM_TREE_NODES = {
  originLens: node("originLens", "Origin Lens", "◇", 750, 480, "prisms", 1, 1, [], "Stabilize the first Prism pathway.", "×1.20 total Power.", { powerMultiplier: 1.2 }),

  currentChannel: node("currentChannel", "Current Channel", "↯", 555, 360, "prisms", 3, 10, ["originLens"], "Compress the main current into a denser flow.", "×1.15 Power per level.", { powerMultiplierPerLevel: 1.15 }, 1.85),
  fluxEconomy: node("fluxEconomy", "Flux Economy", "−", 350, 245, "prisms", 4, 8, ["currentChannel"], "Reduce Power upgrade requirements.", "Power upgrade requirements −4% per level.", { powerCostReductionPerLevel: 0.04 }, 2.0),
  overdriveArray: node("overdriveArray", "Overdrive Array", "+", 180, 390, "prisms", 20, 1, ["fluxEconomy"], "Converge the left branch into one amplified output.", "×2.5 total Power.", { powerMultiplier: 2.5 }),

  rebirthFocus: node("rebirthFocus", "Rebirth Focus", "↻", 500, 620, "prisms", 4, 6, ["originLens"], "Strengthen the imprint recovered during Rebirth.", "×1.16 RP gain per level.", { rebirthMultiplierPerLevel: 1.16 }, 2.05),
  recursiveMemory: node("recursiveMemory", "Recursive Memory", "R", 285, 755, "prisms", 16, 1, ["rebirthFocus"], "Preserve a stronger cycle memory.", "×1.75 Rebirth Point gain.", { rebirthMultiplier: 1.75 }),

  pulseTuning: node("pulseTuning", "Pulse Tuning", "◷", 810, 260, "prisms", 3, 10, ["originLens"], "Shorten the Prism formation interval.", "Prism interval −1s per level.", { prismIntervalPerLevel: 1 }, 1.85),
  splitSpectrum: node("splitSpectrum", "Split Spectrum", "◇+", 1005, 150, "prisms", 6, 8, ["pulseTuning"], "Produce more Prism from every completed cycle.", "×1.22 Prism gain per level.", { prismGainPerLevel: 1.22 }, 2.1),
  chromaticClock: node("chromaticClock", "Chromatic Clock", "⌁", 1210, 260, "prisms", 30, 1, ["splitSpectrum"], "Synchronize every Prism pulse.", "Prism interval −5s.", { prismInterval: 5 }),

  recovery90: node("recovery90", "Recovery Calibration", "90", 1010, 445, "prisms", 8, 1, ["originLens"], "Improve recovered production while offline.", "Offline efficiency becomes at least 90%.", { offlineEfficiencySet: 0.9 }),
  recovery98: node("recovery98", "Deep Recovery", "98", 1215, 385, "prisms", 24, 1, ["recovery90"], "Recover almost all production from closed sessions.", "Offline efficiency becomes at least 98%.", { offlineEfficiencySet: 0.98 }),
  recovery100: node("recovery100", "Perfect Recovery", "100", 1370, 500, "prisms", 75, 1, ["recovery98"], "Recover closed-session production without efficiency loss.", "Offline efficiency becomes 100%.", { offlineEfficiencySet: 1 }),

  archive12: node("archive12", "Extended Archive", "12h", 980, 650, "prisms", 8, 1, ["originLens"], "Expand the amount of closed-session time that can be recovered.", "Offline limit becomes 12 hours.", { offlineLimitSet: 12 * 3600 }),
  archive24: node("archive24", "Long Archive", "24h", 1170, 730, "prisms", 24, 1, ["archive12"], "Double the closed-session archive again.", "Offline limit becomes 24 hours.", { offlineLimitSet: 24 * 3600 }),
  timelessArchive: node("timelessArchive", "Timeless Archive", "∞", 1365, 655, "prisms", 90, 1, ["archive24"], "Remove the closed-session time limit.", "Offline progression has no time limit.", { offlineUnlimited: true }),

  windGate: node("windGate", "Aeolian Gate", "W", 720, 735, "prisms", 12, 1, ["originLens"], "Open the post-shift Wind branch.", "Unlock Wind Prism upgrades.", { windBranch: true }, 1, "prestige1"),
  turbineMatrix: node("turbineMatrix", "Turbine Matrix", "✣", 900, 835, "wind", 20, 10, ["windGate"], "Increase Wind production from every turbine.", "×1.20 Wind output per level.", { windMultiplierPerLevel: 1.2 }, 1.8, "wind"),
  reservoirLattice: node("reservoirLattice", "Reservoir Lattice", "▣", 1100, 870, "wind", 25, 10, ["turbineMatrix"], "Expand the Wind storage buffer.", "×1.35 Wind capacity per level.", { windCapacityPerLevel: 1.35 }, 1.9, "wind"),
  collectorGrip: node("collectorGrip", "Collector Grip", "⇩", 1270, 815, "wind", 18, 6, ["reservoirLattice"], "Capture more Wind with every manual collection.", "+25 Wind collected per click per level.", { windCollectPerLevel: 25 }, 2.0, "wind"),

  insightPrism: node("insightPrism", "Insight Refraction", "◆", 610, 140, "prisms", 45, 5, ["pulseTuning"], "Route Prism resonance into the Research layer.", "×1.15 Insight gain per level.", { insightMultiplierPerLevel: 1.15 }, 2.3, "researchBranch")
};

const PRISM_CONNECTIONS = [
  ["originLens", "currentChannel"], ["currentChannel", "fluxEconomy"], ["fluxEconomy", "overdriveArray"],
  ["originLens", "rebirthFocus"], ["rebirthFocus", "recursiveMemory"],
  ["originLens", "pulseTuning"], ["pulseTuning", "splitSpectrum"], ["splitSpectrum", "chromaticClock"],
  ["originLens", "recovery90"], ["recovery90", "recovery98"], ["recovery98", "recovery100"],
  ["originLens", "archive12"], ["archive12", "archive24"], ["archive24", "timelessArchive"],
  ["originLens", "windGate"], ["windGate", "turbineMatrix"], ["turbineMatrix", "reservoirLattice"], ["reservoirLattice", "collectorGrip"],
  ["pulseTuning", "insightPrism"]
];

const RESEARCH_NODES = {
  firstObservation: research("firstObservation", "First Observation", "◆", 650, 450, 1, [], "Establish a stable post-shift research process.", "Unlock the first protocol branches.", {}),

  kineticDoctrine: research("kineticDoctrine", "Kinetic Doctrine", "⚡", 455, 320, 4, ["firstObservation"], "Focus Research on immediate production.", "+25% Power production.", { powerPercent: 0.25 }, "researchFocus"),
  recursiveDoctrine: research("recursiveDoctrine", "Recursive Doctrine", "↻", 455, 585, 4, ["firstObservation"], "Focus Research on long-term analysis.", "×1.30 Insight generation.", { insightMultiplier: 1.3 }, "researchFocus"),

  resonatorBreak1: research("resonatorBreak1", "Resonator Limit I", "×", 265, 210, 12, ["kineticDoctrine"], "Expand the safe Power Resonator range.", "+15 Power Resonator cap.", { resonatorCap: 15 }),
  resonatorBreak2: research("resonatorBreak2", "Resonator Limit II", "×+", 95, 305, 45, ["resonatorBreak1"], "Break the Resonator limit again.", "+25 Power Resonator cap.", { resonatorCap: 25 }),
  freeCircuitry: research("freeCircuitry", "Lossless Circuitry", "0", 255, 435, 55, ["firstObservation"], "Power upgrades still require their listed Power, but purchasing them no longer consumes it.", "Power upgrade purchases do not spend Power.", { freePowerUpgrades: true }),

  amplifierBreak1: research("amplifierBreak1", "Amplifier Limit I", "↟", 265, 700, 14, ["recursiveDoctrine"], "Increase the stable Rebirth Amplifier range.", "+12 Rebirth Amplifier cap.", { amplifierCap: 12 }),
  amplifierBreak2: research("amplifierBreak2", "Amplifier Limit II", "↟+", 90, 620, 52, ["amplifierBreak1"], "Extend the Rebirth Amplifier range again.", "+20 Rebirth Amplifier cap.", { amplifierCap: 20 }),
  rebirthContinuity: research("rebirthContinuity", "Rebirth Continuity", "∞", 280, 805, 38, ["firstObservation"], "Rebirth no longer removes current Power. Previously claimed Power cannot be claimed twice.", "Rebirth preserves current Power.", { preservePowerOnRebirth: true }),

  windAutomation: research("windAutomation", "Closed-Loop Collection", "W", 820, 285, 10, ["firstObservation"], "Route Wind storage directly into the collected supply.", "Unlock automatic Wind collection.", { autoWind: true }),
  rebirthUpgradeAutomation: research("rebirthUpgradeAutomation", "Recursive Purchasing", "R+", 1030, 205, 26, ["windAutomation"], "Automate permanent Rebirth module purchasing.", "Unlock automatic Rebirth Upgrade purchases.", { autoRebirthUpgrades: true }),
  prismExpansion: research("prismExpansion", "Prismatic Survey", "◇", 1040, 355, 20, ["windAutomation"], "Reveal a new post-shift branch in the Prism Tree.", "Unlock Insight Refraction in the Prism Tree.", { researchBranch: true }),

  runeAutomation: research("runeAutomation", "Rune Sequencer", "ᚱ", 820, 610, 18, ["firstObservation"], "Allow the Rune chamber to repeat rolls automatically.", "Unlock Rune auto-roll.", { autoRune: true }),
  runeLuck1: research("runeLuck1", "Probability Lens I", "☘", 1005, 530, 8, ["runeAutomation"], "Bend Rune outcomes toward rarer patterns.", "+2 Rune Luck.", { runeLuck: 2 }),
  runeLuck2: research("runeLuck2", "Probability Lens II", "☘+", 1180, 470, 30, ["runeLuck1"], "Improve the Probability Lens without removing diminishing returns.", "+4 Rune Luck.", { runeLuck: 4 }),
  runeBulk1: research("runeBulk1", "Parallel Etching I", "×2", 1030, 660, 12, ["runeAutomation"], "Etch an additional Rune during every paid roll.", "+1 Rune Bulk.", { runeBulk: 1 }),
  runeBulk2: research("runeBulk2", "Parallel Etching II", "×3", 1200, 720, 42, ["runeBulk1"], "Add another parallel etching channel.", "+1 Rune Bulk.", { runeBulk: 1 }),
  runeSpeed1: research("runeSpeed1", "Rapid Inscription I", "▶", 860, 790, 9, ["runeAutomation"], "Reduce Rune chamber recovery time.", "Rune cooldown ×0.80.", { runeSpeedMultiplier: 0.8 }),
  runeSpeed2: research("runeSpeed2", "Rapid Inscription II", "▶▶", 1035, 825, 28, ["runeSpeed1"], "Accelerate inscriptions again.", "Rune cooldown ×0.75.", { runeSpeedMultiplier: 0.75 }),
  runeSpeed3: research("runeSpeed3", "Rapid Inscription III", "▶▶▶", 1210, 835, 70, ["runeSpeed2"], "Approach the stable minimum Rune cooldown.", "Rune cooldown ×0.70.", { runeSpeedMultiplier: 0.7 }),
  runeCost: research("runeCost", "Efficient Etching", "−W", 1190, 585, 22, ["runeLuck1", "runeBulk1"], "Reduce Wind lost during Rune formation.", "Rune roll cost −25%.", { runeCostMultiplier: 0.75 }),
  pityTuning: research("pityTuning", "Pity Calibration", "!", 1160, 335, 34, ["runeLuck1"], "Guarantee a Harmonic-or-better Rune sooner.", "Pity threshold −20 rolls.", { pityReduction: 20 }),

  offlineAnalysis: research("offlineAnalysis", "Dormant Analysis", "Z", 820, 455, 24, ["firstObservation"], "Improve passive recovery without exceeding 100% efficiency.", "+3% offline efficiency and +15% Prism gain.", { offlineEfficiency: 0.03, prismPercent: 0.15 })
};

const RESEARCH_CONNECTIONS = [
  ["firstObservation", "kineticDoctrine"], ["firstObservation", "recursiveDoctrine"],
  ["kineticDoctrine", "resonatorBreak1"], ["resonatorBreak1", "resonatorBreak2"], ["firstObservation", "freeCircuitry"],
  ["recursiveDoctrine", "amplifierBreak1"], ["amplifierBreak1", "amplifierBreak2"], ["firstObservation", "rebirthContinuity"],
  ["firstObservation", "windAutomation"], ["windAutomation", "rebirthUpgradeAutomation"], ["windAutomation", "prismExpansion"],
  ["firstObservation", "runeAutomation"], ["runeAutomation", "runeLuck1"], ["runeLuck1", "runeLuck2"],
  ["runeAutomation", "runeBulk1"], ["runeBulk1", "runeBulk2"], ["runeAutomation", "runeSpeed1"],
  ["runeSpeed1", "runeSpeed2"], ["runeSpeed2", "runeSpeed3"], ["runeLuck1", "runeCost"], ["runeBulk1", "runeCost"],
  ["runeLuck1", "pityTuning"], ["firstObservation", "offlineAnalysis"]
];

const RARITIES = {
  trace: { name: "Trace", logDenominator: 0, className: "trace" },
  charged: { name: "Charged", logDenominator: Math.log10(4), className: "charged" },
  harmonic: { name: "Harmonic", logDenominator: Math.log10(80), className: "harmonic" },
  celestial: { name: "Celestial", logDenominator: Math.log10(5000), className: "celestial" },
  paradox: { name: "Paradox", logDenominator: 12, className: "paradox" },
  eternal: { name: "Eternal", logDenominator: 50, className: "eternal" }
};

const RUNES = {
  currentSigil: rune("currentSigil", "Current Sigil", "ϟ", "trace", "power", 0.022, "Power production"),
  condenserMark: rune("condenserMark", "Condenser Mark", "+", "trace", "power", 0.018, "Power production"),
  aeolianTrace: rune("aeolianTrace", "Aeolian Trace", "W", "trace", "wind", 0.020, "Wind production"),
  memoryGlyph: rune("memoryGlyph", "Memory Glyph", "↻", "charged", "rebirth", 0.018, "Rebirth Point gain"),
  chromaSeal: rune("chromaSeal", "Chroma Seal", "◇", "charged", "prisms", 0.020, "Prism gain"),
  thoughtSpiral: rune("thoughtSpiral", "Thought Spiral", "◆", "charged", "insight", 0.020, "Insight generation"),
  velocityScript: rune("velocityScript", "Velocity Script", "▶", "harmonic", "runeSpeed", 0.012, "Rune speed"),
  fortuneCircuit: rune("fortuneCircuit", "Fortune Circuit", "☘", "harmonic", "runeLuck", 0.11, "Rune Luck"),
  resonantCrown: rune("resonantCrown", "Resonant Crown", "♢", "celestial", "power", 0.025, "Power production"),
  prismChoir: rune("prismChoir", "Prism Choir", "◈", "celestial", "prisms", 0.025, "Prism gain"),
  parallelScript: rune("parallelScript", "Parallel Script", "≋", "paradox", "runeBulk", 1, "Rune Bulk milestones"),
  eonHeart: rune("eonHeart", "Eon Heart", "✦", "eternal", "allCore", 0.030, "Power, RP, Prism, Wind and Insight")
};

function node(id, name, icon, x, y, currency, baseCost, maxLevel, prerequisites, description, effectText, effects, growth = 1, unlock = null) {
  return { id, name, icon, x, y, currency, baseCost: H(baseCost), maxLevel, prerequisites, description, effectText, effects, growth, unlock };
}

function research(id, name, icon, x, y, cost, prerequisites, description, effectText, effects, exclusiveGroup = null) {
  return { id, name, icon, x, y, cost: H(cost), prerequisites, description, effectText, effects, exclusiveGroup };
}

function rune(id, name, symbol, rarity, effectType, strength, effectLabel) {
  return { id, name, symbol, rarity, effectType, strength, effectLabel };
}

/* ---------------------------------- State --------------------------------- */

function defaultState() {
  return {
    version: GAME_VERSION,
    power: H(0),
    prisms: H(0),
    rebirthPoints: H(0),
    insight: H(0),
    wind: H(0),
    windStorage: H(0),
    wastedWind: H(0),
    powerUpgrades: { flux: 0, resonator: 0 },
    rebirthUpgrades: { amplifier: 0, core: 0 },
    treeLevels: {},
    purchasedResearchNodes: [],
    windTurbines: 0,
    ownedRunes: {},
    runePity: 0,
    runeCooldown: 0,
    totalRuneRolls: 0,
    totalRebirths: 0,
    totalPrestiges: 0,
    prestigeLevel: 0,
    rebirthClaimedBase: H(0),
    prismProgress: 0,
    totalPlayTime: 0,
    lastUpdate: Date.now(),
    notation: "mixed",
    autoPowerEnabled: true,
    autoRebirthEnabled: false,
    autoRebirthUpgradesEnabled: false,
    autoRuneEnabled: false,
    lastRuneResult: ""
  };
}

let state = defaultState();
let activePage = "power";
let selectedPrismNodeId = null;
let selectedResearchNodeId = null;
let autosaveTimer = 0;
let automationTimer = 0;
let autoRebirthTimer = 0;
let lastLoopTimestamp = Date.now();
let toastTimer = null;
let pendingOfflineReport = null;
const elements = {};

/* -------------------------------- Utilities -------------------------------- */

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function getByPath(path) { return path.reduce((object, key) => object[key], state); }
function hasResearch(id) { return state.purchasedResearchNodes.includes(id); }
function hasPrestige(tier = 1) { return state.prestigeLevel >= tier; }
function treeLevel(id) { return Math.max(0, Math.floor(Number(state.treeLevels[id] || 0))); }
function hasTreeNode(id) { return treeLevel(id) > 0; }
function formatPercent(value) { return `${Math.round(value * 100)}%`; }

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "Unlimited";
  let seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function formatLevelNumber(value) {
  const numeric = Math.max(0, Math.floor(Number(value) || 0));
  if (numeric < 1000) return numeric.toLocaleString();
  return formatCompactInteger(numeric);
}

function formatCompactInteger(value) {
  const numeric = Math.abs(Number(value));
  if (!Number.isFinite(numeric)) return "∞";
  if (numeric < 1000) return Math.floor(numeric).toLocaleString();
  const suffixes = ["K", "M", "B", "T", "Qa", "Qn"];
  let tier = Math.floor(Math.log10(numeric) / 3);
  let scaled = numeric / Math.pow(1000, tier);
  let decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  let rounded = Number(scaled.toFixed(decimals));
  if (rounded >= 1000) {
    tier += 1;
    scaled = rounded / 1000;
    decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    rounded = Number(scaled.toFixed(decimals));
  }
  if (tier <= suffixes.length) return `${rounded.toFixed(decimals)}${suffixes[tier - 1]}`;
  return numeric.toExponential(2).replace("+", "");
}

function formatHuge(value, digits = 2) {
  const number = H(value);
  if (number.isZero()) return "0";

  const notation = state.notation || "mixed";
  if (number.e < 3) {
    return number.toNumber().toLocaleString(undefined, {
      maximumFractionDigits: number.e < 1 ? digits : 1
    });
  }

  const suffixes = ["K", "M", "B", "T", "Qa", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];
  if (notation !== "scientific" && number.e < suffixes.length * 3 + 3) {
    let tier = Math.floor(number.e / 3);
    let scaled = number.m * Math.pow(10, number.e - tier * 3);
    let decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    let rounded = Number(scaled.toFixed(decimals));
    if (rounded >= 1000) {
      tier += 1;
      scaled = rounded / 1000;
      decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      rounded = Number(scaled.toFixed(decimals));
    }
    if (tier <= suffixes.length) return `${rounded.toFixed(decimals)} ${suffixes[tier - 1]}`;
  }

  let mantissa = Number(number.m.toFixed(digits));
  let exponent = number.e;
  if (mantissa >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  const exponentText = Math.abs(exponent) >= 1000 ? formatCompactInteger(exponent) : String(exponent);
  return `${mantissa.toFixed(digits)}e${exponentText}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2100);
}

function currencyName(key) {
  return { power: "Power", prisms: "Prisms", rebirthPoints: "Rebirth Points", insight: "Insight", wind: "Wind", windStorage: "Wind Storage" }[key] || key;
}

function getCurrency(key) { return H(state[key]); }
function setCurrency(key, value) { state[key] = H(value).max(0); }
function addCurrency(key, value) { state[key] = getCurrency(key).add(value); }
function spendCurrency(key, value) {
  const cost = H(value);
  if (!getCurrency(key).gte(cost)) return false;
  state[key] = getCurrency(key).sub(cost);
  return true;
}

/* --------------------------------- Effects --------------------------------- */

function aggregateResearchEffects() {
  const effects = {};
  for (const nodeId of state.purchasedResearchNodes) {
    const nodeEffects = RESEARCH_NODES[nodeId]?.effects || {};
    for (const [key, value] of Object.entries(nodeEffects)) {
      if (typeof value === "boolean") effects[key] = effects[key] || value;
      else if (key.endsWith("Multiplier")) effects[key] = (effects[key] || 1) * value;
      else effects[key] = (effects[key] || 0) + value;
    }
  }
  return effects;
}

function getResearchFlag(flag) { return Boolean(aggregateResearchEffects()[flag]); }
function getResearchSum(key) { return Number(aggregateResearchEffects()[key] || 0); }
function getResearchProduct(key) { return Number(aggregateResearchEffects()[key] || 1); }

function getPrismTreeProduct(perLevelKey, flatKey = null) {
  let result = 1;
  for (const node of Object.values(PRISM_TREE_NODES)) {
    const level = treeLevel(node.id);
    if (!level) continue;
    if (node.effects[perLevelKey] !== undefined) result *= Math.pow(node.effects[perLevelKey], level);
    if (flatKey && node.effects[flatKey] !== undefined) result *= node.effects[flatKey];
  }
  return result;
}

function getPrismTreeSum(perLevelKey, flatKey = null) {
  let result = 0;
  for (const node of Object.values(PRISM_TREE_NODES)) {
    const level = treeLevel(node.id);
    if (!level) continue;
    if (node.effects[perLevelKey] !== undefined) result += node.effects[perLevelKey] * level;
    if (flatKey && node.effects[flatKey] !== undefined) result += node.effects[flatKey];
  }
  return result;
}

function getRuneData(id) {
  const entry = state.ownedRunes[id];
  if (!entry) return { level: 0, exp: 0 };
  return { level: Math.max(0, Math.floor(Number(entry.level) || 0)), exp: Math.max(0, Math.floor(Number(entry.exp) || 0)) };
}

function getRuneScaledStrength(runeData) {
  return Math.pow(runeData.level, 0.75);
}

function getRuneMultiplier(effectType) {
  let result = 1;
  for (const runeConfig of Object.values(RUNES)) {
    const data = getRuneData(runeConfig.id);
    if (data.level <= 0) continue;
    const scale = getRuneScaledStrength(data);
    if (runeConfig.effectType === effectType) result *= 1 + runeConfig.strength * scale;
    if (runeConfig.effectType === "allCore" && ["power", "rebirth", "prisms", "wind", "insight"].includes(effectType)) {
      result *= 1 + runeConfig.strength * scale;
    }
  }
  return result;
}

function getRuneLuckRaw() {
  let raw = getResearchSum("runeLuck");
  const runeData = getRuneData("fortuneCircuit");
  if (runeData.level > 0) raw += RUNES.fortuneCircuit.strength * getRuneScaledStrength(runeData);
  return raw;
}

function getRuneLuckMultiplier() {
  const raw = Math.max(0, getRuneLuckRaw());
  return 1 + 9 * (1 - Math.exp(-raw / 8));
}

function getRuneBulk() {
  let bulk = 1 + getResearchSum("runeBulk");
  const parallel = getRuneData("parallelScript");
  if (parallel.level >= 25) bulk += 1;
  if (parallel.level >= 75) bulk += 1;
  return clamp(Math.floor(bulk), 1, 5);
}

function getRuneCooldown() {
  let cooldown = BASE_RUNE_COOLDOWN * getResearchProduct("runeSpeedMultiplier");
  const speedRune = getRuneData("velocityScript");
  if (speedRune.level > 0) cooldown *= Math.max(0.45, 1 - RUNES.velocityScript.strength * getRuneScaledStrength(speedRune));
  return Math.max(MIN_RUNE_COOLDOWN, cooldown);
}

function getRunePityThreshold() {
  return Math.max(25, BASE_RUNE_PITY - getResearchSum("pityReduction"));
}

function getRuneRollCost() {
  const bulk = getRuneBulk();
  const bulkFactor = 1 + (bulk - 1) * 0.6;
  return H(5 * bulkFactor * getResearchProduct("runeCostMultiplier"));
}

function getResonatorCap() {
  return 50 + (hasPrestige(1) ? 10 : 0) + getResearchSum("resonatorCap");
}

function getAmplifierCap() {
  return 35 + (hasPrestige(1) ? 10 : 0) + getResearchSum("amplifierCap");
}

function getPowerCostRequirementMultiplier() {
  const reduction = Math.min(0.75, getPrismTreeSum("powerCostReductionPerLevel"));
  return Math.max(0.25, 1 - reduction);
}

function getUpgradeLevel(id) {
  const config = UPGRADE_CONFIG[id];
  return config.group === "power" ? state.powerUpgrades[id] : state.rebirthUpgrades[id];
}

function setUpgradeLevel(id, level) {
  const config = UPGRADE_CONFIG[id];
  const clean = clamp(Math.floor(Number(level) || 0), 0, MAX_SAFE_LEVEL);
  if (config.group === "power") state.powerUpgrades[id] = clean;
  else state.rebirthUpgrades[id] = clean;
}

function getUpgradeCurrency(id) { return UPGRADE_CONFIG[id].group === "power" ? "power" : "rebirthPoints"; }
function getUpgradeCost(id, level = getUpgradeLevel(id)) {
  const config = UPGRADE_CONFIG[id];
  let cost = config.baseCost.mul(H(config.growth).pow(level));
  if (config.group === "power") cost = cost.mul(getPowerCostRequirementMultiplier());
  return cost;
}

function getUpgradeTotalCost(id, count) {
  if (count <= 0) return H(0);
  const config = UPGRADE_CONFIG[id];
  const firstCost = getUpgradeCost(id);
  const numerator = H(config.growth).pow(count).sub(1);
  return firstCost.mul(numerator).div(config.growth - 1);
}

function powerUpgradeDoesNotSpend() { return getResearchFlag("freePowerUpgrades"); }

function estimateAffordableCount(id) {
  const config = UPGRADE_CONFIG[id];
  const currentLevel = getUpgradeLevel(id);
  const cap = config.cap();
  const remainingCap = Number.isFinite(cap) ? Math.max(0, cap - currentLevel) : MAX_SAFE_LEVEL;
  if (remainingCap <= 0) return 0;

  const currencyKey = getUpgradeCurrency(id);
  const currency = getCurrency(currencyKey);
  const firstCost = getUpgradeCost(id, currentLevel);
  if (!currency.gte(firstCost)) return 0;

  let estimated;
  if (currencyKey === "power" && powerUpgradeDoesNotSpend()) {
    estimated = Math.floor((currency.log10() - config.baseCost.mul(getPowerCostRequirementMultiplier()).log10()) / Math.log10(config.growth)) - currentLevel + 1;
  } else {
    const term = currency.mul(config.growth - 1).div(firstCost).add(1);
    estimated = Math.floor(term.log10() / Math.log10(config.growth));
  }

  estimated = clamp(estimated, 1, remainingCap);

  if (!(currencyKey === "power" && powerUpgradeDoesNotSpend())) {
    while (estimated > 0 && getUpgradeTotalCost(id, estimated).gt(currency)) estimated -= 1;
    while (estimated < remainingCap && getUpgradeTotalCost(id, estimated + 1).lte(currency)) estimated += 1;
  } else {
    while (estimated > 0 && getUpgradeCost(id, currentLevel + estimated - 1).gt(currency)) estimated -= 1;
    while (estimated < remainingCap && getUpgradeCost(id, currentLevel + estimated).lte(currency)) estimated += 1;
  }

  return estimated;
}

function buyRepeatableUpgrade(id, requestedCount = 1, silent = false) {
  const config = UPGRADE_CONFIG[id];
  if (!config) return 0;
  const available = estimateAffordableCount(id);
  const count = requestedCount === Infinity ? available : Math.min(available, Math.max(0, Math.floor(requestedCount)));
  if (count <= 0) return 0;

  const currencyKey = getUpgradeCurrency(id);
  if (!(currencyKey === "power" && powerUpgradeDoesNotSpend())) {
    state[currencyKey] = getCurrency(currencyKey).sub(getUpgradeTotalCost(id, count));
  }
  setUpgradeLevel(id, getUpgradeLevel(id) + count);
  if (!silent) showToast(`${config.name} +${formatLevelNumber(count)}`);
  return count;
}

function getBasePowerPerSecond() {
  return H(1 + state.powerUpgrades.flux + state.rebirthUpgrades.core * 2);
}

function getPowerPerSecond() {
  let rate = getBasePowerPerSecond();
  rate = rate.mul(H(1.25).pow(state.powerUpgrades.resonator));
  rate = rate.mul(H(1.5).pow(state.rebirthUpgrades.amplifier));
  rate = rate.mul(getPrismTreeProduct("powerMultiplierPerLevel", "powerMultiplier"));
  rate = rate.mul(1 + getResearchSum("powerPercent"));
  rate = rate.mul(getRuneMultiplier("power"));
  if (hasPrestige(1)) rate = rate.mul(2);
  return rate;
}

function getPrismInterval() {
  const reduction = getPrismTreeSum("prismIntervalPerLevel", "prismInterval");
  return Math.max(5, BASE_PRISM_INTERVAL - reduction);
}

function getPrismGainPerCycle() {
  let gain = H(1);
  gain = gain.mul(getPrismTreeProduct("prismGainPerLevel"));
  gain = gain.mul(1 + getResearchSum("prismPercent"));
  gain = gain.mul(getRuneMultiplier("prism"));
  return gain;
}

function getRebirthMultiplier() {
  let multiplier = H(getPrismTreeProduct("rebirthMultiplierPerLevel", "rebirthMultiplier"));
  multiplier = multiplier.mul(getRuneMultiplier("rebirth"));
  if (hasPrestige(1)) multiplier = multiplier.mul(1.5);
  return multiplier;
}

function getCurrentRebirthBaseUnits() {
  return state.power.div(BASE_REBIRTH_REQUIREMENT).floor();
}

function getRebirthGain() {
  const currentBase = getCurrentRebirthBaseUnits();
  const claimableBase = getResearchFlag("preservePowerOnRebirth") ? currentBase.sub(state.rebirthClaimedBase) : currentBase;
  if (claimableBase.lte(0)) return H(0);
  return claimableBase.mul(getRebirthMultiplier()).floor();
}

function getOfflineEfficiency() {
  let efficiency = BASE_OFFLINE_EFFICIENCY;
  for (const node of Object.values(PRISM_TREE_NODES)) {
    if (hasTreeNode(node.id) && node.effects.offlineEfficiencySet !== undefined) efficiency = Math.max(efficiency, node.effects.offlineEfficiencySet);
  }
  efficiency += getResearchSum("offlineEfficiency");
  const archiveRune = getRuneData("eonHeart");
  if (archiveRune.level > 0) efficiency += Math.min(0.02, 0.0005 * getRuneScaledStrength(archiveRune));
  return Math.min(1, efficiency);
}

function getOfflineLimit() {
  let limit = BASE_OFFLINE_LIMIT_SECONDS;
  for (const node of Object.values(PRISM_TREE_NODES)) {
    if (!hasTreeNode(node.id)) continue;
    if (node.effects.offlineUnlimited) return Infinity;
    if (node.effects.offlineLimitSet !== undefined) limit = Math.max(limit, node.effects.offlineLimitSet);
  }
  return limit;
}

function getInsightRate() {
  if (!hasPrestige(1)) return H(0);
  let rate = H(BASE_INSIGHT_RATE);
  rate = rate.mul(getResearchProduct("insightMultiplier"));
  rate = rate.mul(getPrismTreeProduct("insightMultiplierPerLevel"));
  rate = rate.mul(getRuneMultiplier("insight"));
  return rate;
}

function getWindTurbineCost() { return H("1e6").mul(H(2.4).pow(state.windTurbines)); }
function getWindRate() {
  if (!hasPrestige(1) || state.windTurbines <= 0) return H(0);
  let rate = H(0.25 * state.windTurbines);
  rate = rate.mul(getPrismTreeProduct("windMultiplierPerLevel"));
  rate = rate.mul(getRuneMultiplier("wind"));
  return rate;
}

function getWindCapacity() {
  return H(100).mul(getPrismTreeProduct("windCapacityPerLevel"));
}

function getWindCollectAmount() {
  return H(25 + getPrismTreeSum("windCollectPerLevel"));
}

/* ------------------------------- Tree logic -------------------------------- */

function isPrismNodeUnlockedBySystem(node) {
  if (!node.unlock) return true;
  if (node.unlock === "prestige1") return hasPrestige(1);
  if (node.unlock === "wind") return hasPrestige(1) && hasTreeNode("windGate");
  if (node.unlock === "researchBranch") return getResearchFlag("researchBranch");
  return false;
}

function isPrismNodeVisible(node) {
  if (!isPrismNodeUnlockedBySystem(node)) return false;
  if (node.id === "originLens" || treeLevel(node.id) > 0) return true;
  return node.prerequisites.every(id => treeLevel(id) > 0);
}

function getPrismNodeCost(node, level = treeLevel(node.id)) {
  return node.baseCost.mul(H(node.growth).pow(level));
}

function getPrismNodeState(node) {
  const level = treeLevel(node.id);
  if (level >= node.maxLevel) return "maxed";
  if (node.prerequisites.every(id => treeLevel(id) > 0)) return level > 0 ? "purchased" : "available";
  return "locked";
}

function purchasePrismNode(nodeId) {
  const node = PRISM_TREE_NODES[nodeId];
  if (!node || !isPrismNodeVisible(node)) return;
  const level = treeLevel(node.id);
  if (level >= node.maxLevel) return;
  if (!node.prerequisites.every(id => treeLevel(id) > 0)) return;
  const cost = getPrismNodeCost(node, level);
  if (!spendCurrency(node.currency, cost)) return;
  state.treeLevels[node.id] = level + 1;
  showToast(`${node.name} ${node.maxLevel === 1 ? "purchased" : `Lv ${level + 1}`}`);
  saveGame(false);
  renderAll();
}

function isResearchNodeVisible(node) {
  if (state.purchasedResearchNodes.includes(node.id)) return true;
  if (node.id === "firstObservation") return true;
  return node.prerequisites.every(id => state.purchasedResearchNodes.includes(id));
}

function getResearchNodeState(node) {
  if (state.purchasedResearchNodes.includes(node.id)) return "purchased";
  if (!node.prerequisites.every(id => state.purchasedResearchNodes.includes(id))) return "locked";
  if (node.exclusiveGroup) {
    const conflict = state.purchasedResearchNodes.some(id => RESEARCH_NODES[id]?.exclusiveGroup === node.exclusiveGroup);
    if (conflict) return "choice-blocked";
  }
  return "available";
}

function purchaseResearchNode(nodeId) {
  const node = RESEARCH_NODES[nodeId];
  if (!node || getResearchNodeState(node) !== "available") return;
  if (!spendCurrency("insight", node.cost)) return;
  state.purchasedResearchNodes.push(node.id);
  showToast(`${node.name} researched`);
  saveGame(false);
  renderAll();
}

/* ------------------------------- Core actions ------------------------------ */

function performRebirth(silent = false) {
  const gain = getRebirthGain();
  if (gain.lte(0)) return false;

  const preservePower = getResearchFlag("preservePowerOnRebirth");
  const currentBase = getCurrentRebirthBaseUnits();
  state.rebirthPoints = state.rebirthPoints.add(gain);
  state.totalRebirths += 1;
  state.powerUpgrades.flux = 0;
  state.powerUpgrades.resonator = 0;

  if (preservePower) {
    state.rebirthClaimedBase = currentBase;
  } else {
    state.power = H(0);
    state.rebirthClaimedBase = H(0);
  }

  if (!silent) showToast(`Rebirth complete: +${formatHuge(gain)} RP`);
  return true;
}

function getPrestigeCost(tierIndex = state.totalPrestiges) {
  const tier = PRESTIGE_TIERS[Math.min(tierIndex, PRESTIGE_TIERS.length - 1)];
  return tier.baseCost.mul(tier.growth.pow(state.totalPrestiges));
}

function performPrestige() {
  const tier = PRESTIGE_TIERS[state.prestigeLevel];
  if (!tier) return;
  const cost = getPrestigeCost();
  if (!state.power.gte(cost)) return;

  state.power = H(0);
  state.powerUpgrades.flux = 0;
  state.powerUpgrades.resonator = 0;
  state.rebirthPoints = H(0);
  state.rebirthUpgrades.amplifier = 0;
  state.rebirthUpgrades.core = 0;
  state.rebirthClaimedBase = H(0);
  state.totalPrestiges += 1;
  state.prestigeLevel += 1;
  state.autoPowerEnabled = true;

  showToast(`${tier.name} complete`);
  saveGame(false);
  setActivePage("research");
  renderAll();
}

function buyWindTurbine() {
  const cost = getWindTurbineCost();
  if (!spendCurrency("power", cost)) return;
  state.windTurbines += 1;
  showToast("Wind Turbine purchased");
  renderAll();
}

function collectWind(silent = false) {
  if (state.windStorage.lte(0)) return H(0);
  const amount = state.windStorage.min(getWindCollectAmount());
  state.windStorage = state.windStorage.sub(amount);
  state.wind = state.wind.add(amount);
  if (!silent) showToast(`Collected ${formatHuge(amount)} Wind`);
  return amount;
}

/* ---------------------------------- Runes ---------------------------------- */

function runeExpRequired(level) {
  if (level <= 0) return 1;
  return Math.ceil(4 * Math.pow(1.55, level) * Math.pow(level + 1, 1.35));
}

function randomLog10Unit() {
  if (globalThis.crypto?.getRandomValues) {
    const words = new Uint32Array(8);
    crypto.getRandomValues(words);
    let integer = 0n;
    for (const word of words) integer = (integer << 32n) | BigInt(word);
    if (integer === 0n) return -Infinity;
    const bitLength = integer.toString(2).length;
    const shift = Math.max(0, bitLength - 53);
    const top = Number(integer >> BigInt(shift));
    const log2Value = Math.log2(top) + shift - 256;
    return log2Value * Math.LOG10E * Math.LN2;
  }
  return Math.log10(Math.max(Number.MIN_VALUE, Math.random()));
}

function chanceFromLogDenominator(logDenominator) {
  return randomLog10Unit() <= -Math.max(0, logDenominator);
}

function chooseRuneRarity(forceHarmonic = false) {
  const luckLogReduction = Math.log10(getRuneLuckMultiplier());
  if (forceHarmonic) {
    if (chanceFromLogDenominator(Math.max(0, RARITIES.paradox.logDenominator - luckLogReduction))) return "paradox";
    if (chanceFromLogDenominator(Math.max(0, RARITIES.celestial.logDenominator - luckLogReduction))) return "celestial";
    return "harmonic";
  }

  if (chanceFromLogDenominator(Math.max(0, RARITIES.eternal.logDenominator - luckLogReduction))) return "eternal";
  if (chanceFromLogDenominator(Math.max(0, RARITIES.paradox.logDenominator - luckLogReduction))) return "paradox";
  if (chanceFromLogDenominator(Math.max(0, RARITIES.celestial.logDenominator - luckLogReduction))) return "celestial";
  if (chanceFromLogDenominator(Math.max(0, RARITIES.harmonic.logDenominator - luckLogReduction))) return "harmonic";
  if (chanceFromLogDenominator(Math.max(0, RARITIES.charged.logDenominator - luckLogReduction))) return "charged";
  return "trace";
}

function awardRune(runeId) {
  const config = RUNES[runeId];
  const current = getRuneData(runeId);
  let level = current.level;
  let exp = current.exp + 1;
  while (level < 100 && exp >= runeExpRequired(level)) {
    exp -= runeExpRequired(level);
    level += 1;
  }
  if (level >= 100) exp = 0;
  state.ownedRunes[runeId] = { level, exp };
  return { config, level, exp };
}

function rollRuneOnce(forcePity = false) {
  const rarity = chooseRuneRarity(forcePity);
  const candidates = Object.values(RUNES).filter(runeConfig => runeConfig.rarity === rarity);
  const picked = candidates[Math.floor(Math.random() * candidates.length)] || Object.values(RUNES)[0];
  return awardRune(picked.id);
}

function attemptRuneRoll(silent = false) {
  if (!hasPrestige(1) || state.runeCooldown > 0) return false;
  const cost = getRuneRollCost();
  if (!spendCurrency("wind", cost)) return false;

  const bulk = getRuneBulk();
  const results = [];
  for (let index = 0; index < bulk; index += 1) {
    state.runePity += 1;
    const pityTriggered = state.runePity >= getRunePityThreshold();
    const result = rollRuneOnce(pityTriggered);
    if (pityTriggered) state.runePity = 0;
    results.push(result);
    state.totalRuneRolls += 1;
  }

  state.runeCooldown = getRuneCooldown();
  const best = results.reduce((currentBest, result) => {
    const order = ["trace", "charged", "harmonic", "celestial", "paradox", "eternal"];
    return order.indexOf(result.config.rarity) > order.indexOf(currentBest.config.rarity) ? result : currentBest;
  }, results[0]);
  state.lastRuneResult = `${RARITIES[best.config.rarity].name}: ${best.config.name} — Lv ${best.level}`;
  if (!silent) showToast(state.lastRuneResult);
  return true;
}

/* ---------------------------- Passive progression -------------------------- */

function advancePrisms(seconds, efficiency = 1) {
  const interval = getPrismInterval();
  const totalProgress = state.prismProgress + seconds;
  const cycles = Math.floor(totalProgress / interval);
  state.prismProgress = totalProgress - cycles * interval;
  if (cycles <= 0) return H(0);
  const gain = getPrismGainPerCycle().mul(cycles * efficiency);
  state.prisms = state.prisms.add(gain);
  return gain;
}

function advanceWind(seconds, efficiency = 1) {
  const generated = getWindRate().mul(seconds * efficiency);
  if (generated.lte(0)) return H(0);
  const capacity = getWindCapacity();
  const availableSpace = capacity.sub(state.windStorage);
  const stored = generated.min(availableSpace);
  const wasted = generated.sub(stored);
  state.windStorage = state.windStorage.add(stored).min(capacity);
  state.wastedWind = state.wastedWind.add(wasted);

  if (getResearchFlag("autoWind")) {
    state.wind = state.wind.add(state.windStorage);
    state.windStorage = H(0);
  }
  return stored;
}

function processPassiveProgress(seconds, efficiency = 1) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  if (safeSeconds <= 0) return { power: H(0), prisms: H(0), insight: H(0), wind: H(0) };

  const powerGain = getPowerPerSecond().mul(safeSeconds * efficiency);
  state.power = state.power.add(powerGain);
  const prismGain = advancePrisms(safeSeconds, efficiency);
  const insightGain = getInsightRate().mul(safeSeconds * efficiency);
  state.insight = state.insight.add(insightGain);
  const windGain = advanceWind(safeSeconds, efficiency);
  state.totalPlayTime += safeSeconds;
  return { power: powerGain, prisms: prismGain, insight: insightGain, wind: windGain };
}

function applyOfflineProgress(rawSeconds, showModal) {
  const limit = getOfflineLimit();
  const appliedSeconds = Number.isFinite(limit) ? Math.min(rawSeconds, limit) : rawSeconds;
  const efficiency = getOfflineEfficiency();
  const startingPower = state.power.clone();
  state.runeCooldown = Math.max(0, state.runeCooldown - appliedSeconds);
  const gains = processPassiveProgress(appliedSeconds, efficiency);

  const report = {
    rawSeconds,
    appliedSeconds,
    efficiency,
    startingPower,
    endingPower: state.power.clone(),
    gains
  };

  if (showModal && appliedSeconds >= 5) {
    pendingOfflineReport = report;
    renderOfflineModal(report);
  }
  return report;
}

function autoBuyCheapest(upgradeIds, maximumPurchases = 40) {
  let purchased = 0;
  while (purchased < maximumPurchases) {
    const affordable = upgradeIds
      .filter(id => estimateAffordableCount(id) > 0)
      .sort((left, right) => getUpgradeCost(left).compare(getUpgradeCost(right)));
    if (affordable.length === 0) break;
    if (!buyRepeatableUpgrade(affordable[0], 1, true)) break;
    purchased += 1;
  }
  return purchased;
}

function processAutomation(deltaSeconds) {
  automationTimer += deltaSeconds;
  autoRebirthTimer += deltaSeconds;
  if (automationTimer < 0.2) return;
  automationTimer = 0;

  if (hasPrestige(1) && state.autoPowerEnabled) {
    if (powerUpgradeDoesNotSpend()) {
      buyRepeatableUpgrade("flux", Infinity, true);
      buyRepeatableUpgrade("resonator", Infinity, true);
    } else {
      autoBuyCheapest(["flux", "resonator"], 40);
    }
  }

  if (getResearchFlag("autoRebirthUpgrades") && state.autoRebirthUpgradesEnabled) {
    autoBuyCheapest(["amplifier", "core"], 40);
  }

  if (hasPrestige(1) && state.autoRebirthEnabled && autoRebirthTimer >= 1 && getRebirthGain().gt(0)) {
    performRebirth(true);
    autoRebirthTimer = 0;
  }

  if (getResearchFlag("autoRune") && state.autoRuneEnabled && state.runeCooldown <= 0) {
    attemptRuneRoll(true);
  }
}

function gameLoop() {
  const now = Date.now();
  const elapsed = Math.max(0, (now - lastLoopTimestamp) / 1000);
  lastLoopTimestamp = now;
  state.lastUpdate = now;

  if (elapsed > SUSPEND_GAP_SECONDS) {
    applyOfflineProgress(elapsed, false);
  } else {
    processPassiveProgress(Math.min(elapsed, 2), 1);
    state.runeCooldown = Math.max(0, state.runeCooldown - elapsed);
    processAutomation(elapsed);
  }

  autosaveTimer += elapsed;
  if (autosaveTimer >= AUTOSAVE_SECONDS) {
    autosaveTimer = 0;
    saveGame(false);
  }

  renderAll();
}

/* -------------------------------- Rendering -------------------------------- */

function cacheElements() {
  document.querySelectorAll("[id]").forEach(element => { elements[element.id] = element; });
}

function setActivePage(page) {
  if (["research", "wind", "runes"].includes(page) && !hasPrestige(1)) page = "prestige";
  activePage = page;
  document.querySelectorAll(".nav-button").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  document.querySelectorAll(".page-panel").forEach(panel => panel.classList.toggle("active", panel.dataset.pagePanel === page));
  elements.sidebar.classList.remove("open");
  if (page === "prism-tree") renderPrismTree();
  if (page === "research") renderResearchTree();
}

function renderUnlockVisibility() {
  const unlocked = hasPrestige(1);
  elements.navResearch.classList.toggle("hidden", !unlocked);
  elements.navWind.classList.toggle("hidden", !unlocked);
  elements.navRunes.classList.toggle("hidden", !unlocked);
  elements.headerInsightChip.classList.toggle("hidden", !unlocked);
  elements.headerWindChip.classList.toggle("hidden", !unlocked);
  elements.autoPowerControl.classList.toggle("hidden", !unlocked);
  elements.autoRebirthControl.classList.toggle("hidden", !unlocked);
  elements.autoRebirthUpgradeControl.classList.toggle("hidden", !getResearchFlag("autoRebirthUpgrades"));
  elements.autoRuneControl.classList.toggle("hidden", !getResearchFlag("autoRune"));
  elements.rebirthContinuityNote.classList.toggle("hidden", !getResearchFlag("preservePowerOnRebirth"));
}

function renderHeader() {
  elements.headerPower.textContent = formatHuge(state.power);
  elements.headerPowerRate.textContent = `+${formatHuge(getPowerPerSecond())}/s`;
  elements.headerPrisms.textContent = formatHuge(state.prisms);
  elements.headerPrismTimer.textContent = `${Math.max(0, getPrismInterval() - state.prismProgress).toFixed(1)}s`;
  elements.headerRebirthPoints.textContent = formatHuge(state.rebirthPoints);
  elements.headerInsight.textContent = formatHuge(state.insight);
  elements.headerInsightRate.textContent = `+${formatHuge(getInsightRate())}/s`;
  elements.headerWind.textContent = formatHuge(state.wind);
  elements.playTimeDisplay.textContent = formatDuration(state.totalPlayTime);
  elements.sidebarPrestige.textContent = formatLevelNumber(state.prestigeLevel);
}

function renderUpgradeCard(id) {
  const config = UPGRADE_CONFIG[id];
  const level = getUpgradeLevel(id);
  const cap = config.cap();
  const maxed = Number.isFinite(cap) && level >= cap;
  const cost = getUpgradeCost(id, level);
  const currencyKey = getUpgradeCurrency(id);
  const affordable = getCurrency(currencyKey).gte(cost) && !maxed;
  const levelText = Number.isFinite(cap) ? `Lv ${formatLevelNumber(level)} / ${formatLevelNumber(cap)}` : `Lv ${formatLevelNumber(level)}`;
  const freeNote = currencyKey === "power" && powerUpgradeDoesNotSpend() ? "Requirement only — not spent" : `${formatHuge(cost)} ${currencyName(currencyKey)}`;

  return `
    <article class="upgrade-card" data-upgrade-card="${id}">
      <div class="upgrade-icon">${config.icon}</div>
      <div class="upgrade-body">
        <div class="upgrade-topline"><span class="upgrade-tag">${config.tag}</span><span class="level-badge" title="${levelText}">${maxed ? `${levelText} — MAX` : levelText}</span></div>
        <h3>${config.name}</h3>
        <p class="upgrade-description">${config.description}</p>
        <div class="upgrade-values"><div><span>Current</span><strong>${config.current(level)}</strong></div><div><span>Next</span><strong>${maxed ? "Maxed" : config.next(level)}</strong></div></div>
        <div class="upgrade-footer">
          <div class="upgrade-cost"><span>${maxed ? "Status" : "Cost"}</span><strong>${maxed ? "Maximum level" : freeNote}</strong></div>
          <div class="upgrade-actions"><button class="secondary-button buy-one" type="button" data-upgrade="${id}" ${affordable ? "" : "disabled"}>Buy 1</button><button class="secondary-button buy-max" type="button" data-upgrade="${id}" ${affordable ? "" : "disabled"}>Buy Max</button></div>
        </div>
      </div>
    </article>`;
}

function wireUpgradeButtons(container) {
  container.querySelectorAll(".buy-one").forEach(button => button.addEventListener("click", () => { buyRepeatableUpgrade(button.dataset.upgrade, 1); renderAll(); }));
  container.querySelectorAll(".buy-max").forEach(button => button.addEventListener("click", () => { buyRepeatableUpgrade(button.dataset.upgrade, Infinity); renderAll(); }));
}

function renderPowerPage() {
  elements.powerAmount.textContent = formatHuge(state.power);
  elements.powerPerSecond.textContent = `${formatHuge(getPowerPerSecond())} Power per second`;
  elements.autoPowerToggle.checked = state.autoPowerEnabled;
  elements.powerUpgradeGrid.innerHTML = renderUpgradeCard("flux") + renderUpgradeCard("resonator");
  wireUpgradeButtons(elements.powerUpgradeGrid);
}

function renderRebirthPage() {
  const gain = getRebirthGain();
  elements.rebirthGain.textContent = `${formatHuge(gain)} Rebirth Points`;
  elements.rebirthButton.disabled = gain.lte(0);
  if (gain.gt(0)) {
    elements.rebirthRequirementText.textContent = getResearchFlag("preservePowerOnRebirth")
      ? "Ready. Only newly reached Power milestones are claimable."
      : `Ready at ${formatHuge(state.power)} Power.`;
  } else {
    const nextBase = getResearchFlag("preservePowerOnRebirth") ? state.rebirthClaimedBase.add(1) : H(1);
    const nextRequirement = nextBase.mul(BASE_REBIRTH_REQUIREMENT);
    elements.rebirthRequirementText.textContent = `${formatHuge(nextRequirement.sub(state.power))} more Power required.`;
  }
  elements.autoRebirthToggle.checked = state.autoRebirthEnabled;
  elements.autoRebirthUpgradeToggle.checked = state.autoRebirthUpgradesEnabled;
  elements.rebirthUpgradeGrid.innerHTML = renderUpgradeCard("amplifier") + renderUpgradeCard("core");
  wireUpgradeButtons(elements.rebirthUpgradeGrid);
}

function makeCurvePath(from, to, index) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midpointX = (from.x + to.x) / 2;
  const midpointY = (from.y + to.y) / 2;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = ((index % 2 === 0 ? 1 : -1) * Math.min(52, length * 0.16));
  const controlX = midpointX - (dy / length) * bend;
  const controlY = midpointY + (dx / length) * bend;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function centerTreeViewport(viewport, x, y) {
  if (!viewport || viewport.dataset.centered === "1") return;
  requestAnimationFrame(() => {
    viewport.scrollLeft = Math.max(0, x - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, y - viewport.clientHeight / 2);
    viewport.dataset.centered = "1";
  });
}

function renderPrismTree() {
  elements.treePrismBalance.textContent = formatHuge(state.prisms);
  elements.prismTreeNodes.innerHTML = "";
  elements.prismTreeLines.innerHTML = "";

  PRISM_CONNECTIONS.forEach(([fromId, toId], index) => {
    const from = PRISM_TREE_NODES[fromId];
    const to = PRISM_TREE_NODES[toId];
    if (!isPrismNodeVisible(from) || !isPrismNodeVisible(to)) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", makeCurvePath(from, to, index));
    path.classList.add("tree-line");
    if (hasTreeNode(fromId)) path.classList.add("active");
    elements.prismTreeLines.appendChild(path);
  });

  Object.values(PRISM_TREE_NODES).forEach(nodeConfig => {
    if (!isPrismNodeVisible(nodeConfig)) return;
    const level = treeLevel(nodeConfig.id);
    const stateName = getPrismNodeState(nodeConfig);
    const cost = getPrismNodeCost(nodeConfig, level);
    const affordable = stateName !== "maxed" && getCurrency(nodeConfig.currency).gte(cost);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node ${stateName}${affordable ? " affordable" : ""}${selectedPrismNodeId === nodeConfig.id ? " selected" : ""}`;
    button.style.left = `${nodeConfig.x}px`;
    button.style.top = `${nodeConfig.y}px`;
    button.setAttribute("aria-label", `${nodeConfig.name}, level ${level} of ${nodeConfig.maxLevel}`);
    const levelCounter = `${level}/${nodeConfig.maxLevel}`;
    const footer = stateName === "maxed" ? (nodeConfig.maxLevel === 1 ? "OWNED" : "MAX") : `${formatHuge(cost)} ${nodeConfig.currency === "prisms" ? "◇" : "W"}`;
    button.innerHTML = `<span class="tree-node-shell"></span><span class="tree-node-content"><span class="tree-node-level">${levelCounter}</span><span class="tree-node-icon">${nodeConfig.icon}</span><span class="tree-node-footer">${footer}</span></span>`;
    button.addEventListener("click", () => { selectedPrismNodeId = nodeConfig.id; renderPrismTree(); });
    elements.prismTreeNodes.appendChild(button);
  });

  renderSelectedPrismNode();
  centerTreeViewport(elements.prismTreeViewport, PRISM_TREE_NODES.originLens.x, PRISM_TREE_NODES.originLens.y);
}

function renderSelectedPrismNode() {
  const nodeConfig = PRISM_TREE_NODES[selectedPrismNodeId];
  if (!nodeConfig || !isPrismNodeVisible(nodeConfig)) {
    elements.prismNodePlaceholder.classList.remove("hidden");
    elements.prismNodeDetails.classList.add("hidden");
    return;
  }

  elements.prismNodePlaceholder.classList.add("hidden");
  elements.prismNodeDetails.classList.remove("hidden");
  const level = treeLevel(nodeConfig.id);
  const stateName = getPrismNodeState(nodeConfig);
  const cost = getPrismNodeCost(nodeConfig, level);
  elements.prismSelectedIcon.textContent = nodeConfig.icon;
  elements.prismSelectedCategory.textContent = nodeConfig.maxLevel === 1 ? "ONE-TIME NODE" : "REPEATABLE NODE";
  elements.prismSelectedName.textContent = nodeConfig.name;
  elements.prismSelectedDescription.textContent = nodeConfig.description;
  elements.prismSelectedEffect.textContent = nodeConfig.effectText;
  elements.prismSelectedLevel.textContent = `${level}/${nodeConfig.maxLevel}`;
  elements.prismSelectedCost.textContent = stateName === "maxed" ? "Maxed" : `${formatHuge(cost)} ${currencyName(nodeConfig.currency)}`;
  elements.prismSelectedRequirement.textContent = nodeConfig.prerequisites.length ? nodeConfig.prerequisites.map(id => PRISM_TREE_NODES[id].name).join(" + ") : "None";
  elements.purchasePrismNode.disabled = stateName === "maxed" || !getCurrency(nodeConfig.currency).gte(cost);
  elements.purchasePrismNode.textContent = stateName === "maxed" ? "Maximum level" : nodeConfig.maxLevel === 1 ? "Purchase node" : "Buy level";
}

function renderPrestigePage() {
  const tier = PRESTIGE_TIERS[state.prestigeLevel];
  if (!tier) {
    elements.prestigeTierLabel.textContent = "TIER 1 COMPLETE";
    elements.prestigeCost.textContent = "First Shift achieved";
    elements.prestigeStatusText.textContent = "Additional Prestige tiers are not included in this build.";
    elements.prestigeButton.textContent = "No further tier";
    elements.prestigeButton.disabled = true;
  } else {
    const cost = getPrestigeCost();
    elements.prestigeTierLabel.textContent = `TIER ${tier.tier} — ${tier.name.toUpperCase()}`;
    elements.prestigeCost.textContent = `${formatHuge(cost)} Power`;
    elements.prestigeStatusText.textContent = state.power.gte(cost) ? "Requirement reached. The Shift is ready." : `${formatHuge(cost.sub(state.power))} more Power required.`;
    elements.prestigeButton.textContent = "Initiate Prestige";
    elements.prestigeButton.disabled = !state.power.gte(cost);
  }

  const rewardTier = PRESTIGE_TIERS[0];
  elements.prestigeRewardList.innerHTML = rewardTier.rewards.map(([title, description]) => `<div class="reward-item"><span>✦</span><div><strong>${title}</strong><small>${description}</small></div></div>`).join("");
}

function renderResearchTree() {
  elements.researchInsightBalance.textContent = formatHuge(state.insight);
  elements.researchInsightRate.textContent = `+${formatHuge(getInsightRate())}/s`;
  elements.researchTreeNodes.innerHTML = "";
  elements.researchTreeLines.innerHTML = "";

  RESEARCH_CONNECTIONS.forEach(([fromId, toId], index) => {
    const from = RESEARCH_NODES[fromId];
    const to = RESEARCH_NODES[toId];
    if (!isResearchNodeVisible(from) || !isResearchNodeVisible(to)) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", makeCurvePath(from, to, index + 31));
    path.classList.add("tree-line");
    if (state.purchasedResearchNodes.includes(fromId)) path.classList.add("active");
    elements.researchTreeLines.appendChild(path);
  });

  Object.values(RESEARCH_NODES).forEach(nodeConfig => {
    if (!isResearchNodeVisible(nodeConfig)) return;
    const stateName = getResearchNodeState(nodeConfig);
    const affordable = stateName === "available" && state.insight.gte(nodeConfig.cost);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node research-node ${stateName}${affordable ? " affordable" : ""}${selectedResearchNodeId === nodeConfig.id ? " selected" : ""}`;
    button.style.left = `${nodeConfig.x}px`;
    button.style.top = `${nodeConfig.y}px`;
    button.setAttribute("aria-label", `${nodeConfig.name}, ${stateName}`);
    const owned = stateName === "purchased" ? "1/1" : "0/1";
    const footer = stateName === "purchased" ? "OWNED" : stateName === "choice-blocked" ? "BLOCKED" : `${formatHuge(nodeConfig.cost)} ◆`;
    button.innerHTML = `<span class="tree-node-shell"></span><span class="tree-node-content"><span class="tree-node-level">${owned}</span><span class="tree-node-icon">${nodeConfig.icon}</span><span class="tree-node-footer">${footer}</span></span>`;
    button.addEventListener("click", () => { selectedResearchNodeId = nodeConfig.id; renderResearchTree(); });
    elements.researchTreeNodes.appendChild(button);
  });

  renderSelectedResearchNode();
  centerTreeViewport(elements.researchTreeViewport, RESEARCH_NODES.firstObservation.x, RESEARCH_NODES.firstObservation.y);
}

function renderSelectedResearchNode() {
  const nodeConfig = RESEARCH_NODES[selectedResearchNodeId];
  if (!nodeConfig || !isResearchNodeVisible(nodeConfig)) {
    elements.researchNodePlaceholder.classList.remove("hidden");
    elements.researchNodeDetails.classList.add("hidden");
    return;
  }

  elements.researchNodePlaceholder.classList.add("hidden");
  elements.researchNodeDetails.classList.remove("hidden");
  const stateName = getResearchNodeState(nodeConfig);
  elements.researchSelectedIcon.textContent = nodeConfig.icon;
  elements.researchSelectedCategory.textContent = nodeConfig.exclusiveGroup ? "BRANCH CHOICE" : "ONE-TIME RESEARCH";
  elements.researchSelectedName.textContent = nodeConfig.name;
  elements.researchSelectedDescription.textContent = nodeConfig.description;
  elements.researchSelectedEffect.textContent = nodeConfig.effectText;
  elements.researchSelectedStatus.textContent = stateName === "choice-blocked" ? "Blocked by the other branch choice" : stateName === "purchased" ? "Purchased" : "Available";
  elements.researchSelectedCost.textContent = stateName === "purchased" ? "Owned" : `${formatHuge(nodeConfig.cost)} Insight`;
  elements.researchSelectedRequirement.textContent = nodeConfig.prerequisites.length ? nodeConfig.prerequisites.map(id => RESEARCH_NODES[id].name).join(" + ") : "None";
  elements.purchaseResearchNode.disabled = stateName !== "available" || !state.insight.gte(nodeConfig.cost);
  elements.purchaseResearchNode.textContent = stateName === "purchased" ? "Researched" : stateName === "choice-blocked" ? "Branch unavailable" : "Research protocol";
}

function renderWindPage() {
  const capacity = getWindCapacity();
  const percentage = capacity.gt(0) ? clamp(state.windStorage.div(capacity).toNumber() * 100, 0, 100) : 0;
  elements.windGaugeFill.style.height = `${percentage}%`;
  elements.windStored.textContent = formatHuge(state.windStorage);
  elements.windCapacity.textContent = formatHuge(capacity);
  elements.windProductionRate.textContent = `+${formatHuge(getWindRate())} Wind/s`;
  elements.windCollectAmount.textContent = formatHuge(state.windStorage.min(getWindCollectAmount()));
  elements.collectWindButton.disabled = state.windStorage.lte(0) || getResearchFlag("autoWind");
  elements.windAutoStatus.textContent = getResearchFlag("autoWind") ? "Automatic collection active" : "Manual collection required";
  elements.windTurbineCount.textContent = formatLevelNumber(state.windTurbines);
  elements.windTurbineCost.textContent = `${formatHuge(getWindTurbineCost())} Power`;
  elements.buyWindTurbine.disabled = !state.power.gte(getWindTurbineCost());
}

function runeEffectText(config, level) {
  if (level <= 0) return `${config.effectLabel}: inactive`;
  const scale = getRuneScaledStrength({ level });
  if (["power", "rebirth", "prisms", "wind", "insight"].includes(config.effectType)) return `${config.effectLabel}: ×${(1 + config.strength * scale).toFixed(3)}`;
  if (config.effectType === "runeLuck") return `Rune Luck: +${(config.strength * scale).toFixed(2)}`;
  if (config.effectType === "runeSpeed") return `Rune cooldown reduction: ${(Math.min(55, config.strength * scale * 100)).toFixed(1)}%`;
  if (config.effectType === "runeBulk") return `+1 Bulk at Lv 25 and another at Lv 75`;
  if (config.effectType === "allCore") return `Core systems: ×${(1 + config.strength * scale).toFixed(3)}`;
  return config.effectLabel;
}

function renderRunesPage() {
  const cost = getRuneRollCost();
  elements.runeWindBalance.textContent = formatHuge(state.wind);
  elements.runeRollCost.textContent = `${formatHuge(cost)} Wind`;
  elements.runeCooldownDisplay.textContent = state.runeCooldown <= 0 ? "Ready" : `${state.runeCooldown.toFixed(2)}s`;
  elements.runePityDisplay.textContent = `${state.runePity} / ${getRunePityThreshold()}`;
  elements.runeLuckDisplay.textContent = `×${getRuneLuckMultiplier().toFixed(2)}`;
  elements.runeBulkDisplay.textContent = String(getRuneBulk());
  elements.rollRuneButton.disabled = state.runeCooldown > 0 || !state.wind.gte(cost);
  elements.autoRuneToggle.checked = state.autoRuneEnabled;
  elements.lastRuneResult.textContent = state.lastRuneResult || "No Rune rolled yet.";

  elements.runeGrid.innerHTML = Object.values(RUNES).map(config => {
    const data = getRuneData(config.id);
    const required = data.level >= 100 ? 0 : runeExpRequired(data.level);
    const progress = required > 0 ? clamp(data.exp / required * 100, 0, 100) : 100;
    const rarity = RARITIES[config.rarity];
    return `<article class="rune-card rarity-${rarity.className}${data.level <= 0 ? " locked" : ""}">
      <div class="rune-card-head"><div class="rune-name"><span class="rune-symbol">${config.symbol}</span><strong>${config.name}</strong></div><span class="rarity-badge">${rarity.name.toUpperCase()}</span></div>
      <p class="rune-effect">${runeEffectText(config, data.level)}</p>
      <div class="rune-progress-row"><span>Lv ${data.level}</span><span>${data.level >= 100 ? "MAX" : `${formatLevelNumber(data.exp)} / ${formatLevelNumber(required)} EXP`}</span></div>
      <div class="rune-progress"><div style="width:${progress}%"></div></div>
    </article>`;
  }).join("");
}

function renderSettingsPage() {
  elements.notationSelect.value = state.notation;
}

function renderAll() {
  renderUnlockVisibility();
  renderHeader();
  renderPowerPage();
  renderRebirthPage();
  renderPrestigePage();
  if (activePage === "prism-tree") renderPrismTree();
  if (activePage === "research" && hasPrestige(1)) renderResearchTree();
  if (activePage === "wind" && hasPrestige(1)) renderWindPage();
  if (activePage === "runes" && hasPrestige(1)) renderRunesPage();
  if (activePage === "settings") renderSettingsPage();
}

/* ------------------------------ Offline modal ------------------------------ */

function drawOfflineGraph(report) {
  const canvas = elements.offlineGraph;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#050b10";
  context.fillRect(0, 0, width, height);

  const left = 70, right = 24, top = 24, bottom = 50;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  context.strokeStyle = "rgba(125,170,198,0.18)";
  context.lineWidth = 1;
  for (let index = 0; index <= 6; index += 1) {
    const y = top + plotHeight * index / 6;
    context.beginPath(); context.moveTo(left, y); context.lineTo(width - right, y); context.stroke();
  }
  for (let index = 0; index <= 8; index += 1) {
    const x = left + plotWidth * index / 8;
    context.beginPath(); context.moveTo(x, top); context.lineTo(x, height - bottom); context.stroke();
  }

  const startLog = Math.max(0, report.startingPower.log10());
  const endLog = Math.max(startLog + 1e-9, report.endingPower.log10());
  context.strokeStyle = "#54a8ff";
  context.lineWidth = 4;
  context.beginPath();
  for (let index = 0; index <= 40; index += 1) {
    const ratio = index / 40;
    const sampleGain = report.gains.power.mul(ratio);
    const sample = report.startingPower.add(sampleGain);
    const sampleLog = Math.max(0, sample.log10());
    const normalized = (sampleLog - startLog) / Math.max(1e-9, endLog - startLog);
    const x = left + plotWidth * ratio;
    const y = top + plotHeight * (1 - normalized);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();

  context.fillStyle = "#91a8ba";
  context.font = "12px ui-monospace, monospace";
  context.fillText(formatHuge(report.startingPower), 8, height - bottom + 4);
  context.fillText(formatHuge(report.endingPower), 8, top + 4);
  context.fillText("Time", width / 2 - 12, height - 15);
}

function renderOfflineModal(report) {
  elements.offlineDurationText.textContent = `You were away for ${formatDuration(report.rawSeconds)}. ${formatDuration(report.appliedSeconds)} was applied.`;
  elements.offlinePowerGain.textContent = formatHuge(report.gains.power);
  elements.offlinePrismGain.textContent = formatHuge(report.gains.prisms);
  elements.offlineEfficiency.textContent = formatPercent(report.efficiency);
  elements.offlineAppliedTime.textContent = formatDuration(report.appliedSeconds);
  elements.offlineModal.classList.remove("hidden");
  requestAnimationFrame(() => drawOfflineGraph(report));
}

function closeOfflineModal() {
  elements.offlineModal.classList.add("hidden");
  pendingOfflineReport = null;
}

/* -------------------------------- Save data -------------------------------- */

function serializeState() {
  return JSON.stringify(state, (key, value) => value instanceof HugeNumber ? value.toString() : value);
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function decodeUtf8Base64(text) {
  const binary = atob(text.trim());
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sanitizeTreeLevels(candidate, prestigeLevel = 0, researchNodes = []) {
  const requested = {};
  if (candidate?.treeLevels && typeof candidate.treeLevels === "object") {
    for (const [id, value] of Object.entries(candidate.treeLevels)) {
      if (PRISM_TREE_NODES[id]) requested[id] = clamp(Math.floor(Number(value) || 0), 0, PRISM_TREE_NODES[id].maxLevel);
    }
  }
  if (Array.isArray(candidate?.purchasedTreeNodes)) {
    for (const id of candidate.purchasedTreeNodes) if (PRISM_TREE_NODES[id]) requested[id] = Math.max(requested[id] || 0, 1);
  }

  const researchSet = new Set(researchNodes);
  const result = {};
  const systemAllows = nodeConfig => {
    if (!nodeConfig.unlock) return true;
    if (nodeConfig.unlock === "prestige1") return prestigeLevel >= 1;
    if (nodeConfig.unlock === "wind") return prestigeLevel >= 1;
    if (nodeConfig.unlock === "researchBranch") return researchSet.has("prismExpansion");
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeConfig of Object.values(PRISM_TREE_NODES)) {
      if (!requested[nodeConfig.id] || result[nodeConfig.id] || !systemAllows(nodeConfig)) continue;
      if (nodeConfig.prerequisites.every(id => result[id] > 0)) {
        result[nodeConfig.id] = requested[nodeConfig.id];
        changed = true;
      }
    }
  }
  return result;
}

function sanitizeResearchNodes(candidate) {
  const requested = Array.isArray(candidate?.purchasedResearchNodes) ? [...new Set(candidate.purchasedResearchNodes)].filter(id => RESEARCH_NODES[id]) : [];
  const result = [];
  const chosenGroups = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of requested) {
      if (result.includes(id)) continue;
      const nodeConfig = RESEARCH_NODES[id];
      if (!nodeConfig.prerequisites.every(prerequisite => result.includes(prerequisite))) continue;
      if (nodeConfig.exclusiveGroup && chosenGroups.has(nodeConfig.exclusiveGroup)) continue;
      result.push(id);
      if (nodeConfig.exclusiveGroup) chosenGroups.add(nodeConfig.exclusiveGroup);
      changed = true;
    }
  }
  return result;
}

function getSanitizedResearchSum(researchNodes, effectKey) {
  return researchNodes.reduce((total, id) => total + Number(RESEARCH_NODES[id]?.effects?.[effectKey] || 0), 0);
}

function sanitizeLoadedState(candidate) {
  const clean = defaultState();
  if (!candidate || typeof candidate !== "object") return clean;

  const hugeFields = ["power", "prisms", "rebirthPoints", "insight", "wind", "windStorage", "wastedWind", "rebirthClaimedBase"];
  for (const field of hugeFields) clean[field] = H(candidate[field] ?? clean[field]);

  clean.totalPrestiges = Math.max(0, Math.floor(Number(candidate.totalPrestiges) || 0));
  clean.prestigeLevel = clamp(Math.floor(Number(candidate.prestigeLevel ?? candidate.totalPrestiges) || 0), 0, PRESTIGE_TIERS.length);
  clean.purchasedResearchNodes = clean.prestigeLevel >= 1 ? sanitizeResearchNodes(candidate) : [];
  clean.treeLevels = sanitizeTreeLevels(candidate, clean.prestigeLevel, clean.purchasedResearchNodes);

  const resonatorCap = 50 + (clean.prestigeLevel >= 1 ? 10 : 0) + getSanitizedResearchSum(clean.purchasedResearchNodes, "resonatorCap");
  const amplifierCap = 35 + (clean.prestigeLevel >= 1 ? 10 : 0) + getSanitizedResearchSum(clean.purchasedResearchNodes, "amplifierCap");
  clean.powerUpgrades.flux = clamp(Math.floor(Number(candidate.powerUpgrades?.flux ?? candidate.powerUpgradeLevel ?? 0) || 0), 0, MAX_SAFE_LEVEL);
  clean.powerUpgrades.resonator = clamp(Math.floor(Number(candidate.powerUpgrades?.resonator ?? candidate.powerResonatorLevel ?? 0) || 0), 0, resonatorCap);
  clean.rebirthUpgrades.amplifier = clamp(Math.floor(Number(candidate.rebirthUpgrades?.amplifier ?? candidate.rebirthUpgradeLevel ?? 0) || 0), 0, amplifierCap);
  clean.rebirthUpgrades.core = clamp(Math.floor(Number(candidate.rebirthUpgrades?.core ?? candidate.rebirthCoreLevel ?? 0) || 0), 0, MAX_SAFE_LEVEL);

  clean.windTurbines = clean.prestigeLevel >= 1 ? clamp(Math.floor(Number(candidate.windTurbines) || 0), 0, MAX_SAFE_LEVEL) : 0;
  clean.runePity = clamp(Math.floor(Number(candidate.runePity) || 0), 0, 1e9);
  clean.runeCooldown = Math.max(0, Number(candidate.runeCooldown) || 0);
  clean.totalRuneRolls = Math.max(0, Math.floor(Number(candidate.totalRuneRolls) || 0));
  clean.totalRebirths = Math.max(0, Math.floor(Number(candidate.totalRebirths) || 0));
  clean.prismProgress = clamp(Number(candidate.prismProgress) || 0, 0, 1e9);
  clean.totalPlayTime = Math.max(0, Number(candidate.totalPlayTime) || 0);
  clean.lastUpdate = Number(candidate.lastUpdate ?? candidate.latest_time) || Date.now();
  clean.notation = ["mixed", "scientific", "standard"].includes(candidate.notation) ? candidate.notation : "mixed";
  clean.autoPowerEnabled = candidate.autoPowerEnabled !== false;
  clean.autoRebirthEnabled = Boolean(candidate.autoRebirthEnabled);
  clean.autoRebirthUpgradesEnabled = Boolean(candidate.autoRebirthUpgradesEnabled) && clean.purchasedResearchNodes.includes("rebirthUpgradeAutomation");
  clean.autoRuneEnabled = Boolean(candidate.autoRuneEnabled) && clean.purchasedResearchNodes.includes("runeAutomation");
  clean.lastRuneResult = typeof candidate.lastRuneResult === "string" ? candidate.lastRuneResult.slice(0, 180) : "";

  if (clean.prestigeLevel >= 1 && Array.isArray(candidate.ownedRunes)) {
    for (const entry of candidate.ownedRunes) {
      const id = typeof entry === "string" ? entry : entry?.id;
      if (!RUNES[id]) continue;
      clean.ownedRunes[id] = {
        level: clamp(Math.floor(Number(entry?.level ?? 1) || 1), 0, 100),
        exp: Math.max(0, Math.floor(Number(entry?.exp ?? entry?.experience) || 0))
      };
    }
  } else if (clean.prestigeLevel >= 1 && candidate.ownedRunes && typeof candidate.ownedRunes === "object") {
    for (const [id, entry] of Object.entries(candidate.ownedRunes)) {
      if (!RUNES[id]) continue;
      if (typeof entry === "number") clean.ownedRunes[id] = { level: clamp(Math.floor(entry), 0, 100), exp: 0 };
      else clean.ownedRunes[id] = { level: clamp(Math.floor(Number(entry?.level) || 0), 0, 100), exp: Math.max(0, Math.floor(Number(entry?.exp ?? entry?.experience) || 0)) };
    }
  }

  clean.version = GAME_VERSION;
  return clean;
}

function saveGame(showFeedback = true) {
  try {
    state.lastUpdate = Date.now();
    localStorage.setItem(SAVE_KEY, serializeState());
    elements.saveStatus.textContent = "Saved";
    if (showFeedback) showToast("Game saved");
    setTimeout(() => { if (elements.saveStatus.textContent === "Saved") elements.saveStatus.textContent = "Ready"; }, 1100);
  } catch (error) {
    console.error("Save failed", error);
    elements.saveStatus.textContent = "Error";
    if (showFeedback) showToast("Save failed");
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { offlineSeconds: 0 };
    const loaded = sanitizeLoadedState(JSON.parse(raw));
    const offlineSeconds = Math.max(0, (Date.now() - loaded.lastUpdate) / 1000);
    state = loaded;
    return { offlineSeconds };
  } catch (error) {
    console.error("Load failed", error);
    state = defaultState();
    return { offlineSeconds: 0 };
  }
}

function exportSave() {
  try {
    elements.saveTextarea.value = encodeUtf8Base64(serializeState());
    elements.saveTextarea.focus();
    elements.saveTextarea.select();
    showToast("Save exported to the text box");
  } catch (error) {
    console.error(error);
    showToast("Export failed");
  }
}

function importSave() {
  const text = elements.saveTextarea.value.trim();
  if (!text) return showToast("Paste a save first");
  try {
    const decoded = JSON.parse(decodeUtf8Base64(text));
    state = sanitizeLoadedState(decoded);
    state.lastUpdate = Date.now();
    saveGame(false);
    selectedPrismNodeId = null;
    selectedResearchNodeId = null;
    showToast("Save imported");
    renderAll();
  } catch (error) {
    console.error(error);
    showToast("Invalid save data");
  }
}

function resetGame() {
  if (!confirm("Reset every Eonshift save value? This cannot be undone unless you exported a backup.")) return;
  state = defaultState();
  localStorage.removeItem(SAVE_KEY);
  selectedPrismNodeId = null;
  selectedResearchNodeId = null;
  setActivePage("power");
  showToast("Progress reset");
  renderAll();
}

/* -------------------------------- Developer -------------------------------- */

function unlockDeveloper() {
  if (elements.developerPasscode.value !== "1234") return showToast("Incorrect passcode");
  sessionStorage.setItem("eonshift-dev", "1");
  elements.developerLocked.classList.add("hidden");
  elements.developerTools.classList.remove("hidden");
  showToast("Developer tools unlocked");
}

function applyDeveloperValue() {
  const target = elements.developerTarget.value;
  const value = H(elements.developerValue.value);
  if (elements.developerOperation.value === "set") setCurrency(target, value);
  else addCurrency(target, value);
  showToast(`${currencyName(target)} updated`);
  renderAll();
}

function developerGrantPrestige() {
  state.prestigeLevel = Math.max(1, state.prestigeLevel);
  state.totalPrestiges = Math.max(1, state.totalPrestiges);
  state.autoPowerEnabled = true;
  showToast("Prestige 1 granted");
  renderAll();
}

function developerUnlockVisibleNodes() {
  let changed = true;
  while (changed) {
    changed = false;
    for (const nodeConfig of Object.values(PRISM_TREE_NODES)) {
      if (!isPrismNodeUnlockedBySystem(nodeConfig)) continue;
      if (treeLevel(nodeConfig.id) > 0) continue;
      if (nodeConfig.prerequisites.every(id => treeLevel(id) > 0)) {
        state.treeLevels[nodeConfig.id] = 1;
        changed = true;
      }
    }
  }
  if (hasPrestige(1)) {
    let researchChanged = true;
    while (researchChanged) {
      researchChanged = false;
      for (const nodeConfig of Object.values(RESEARCH_NODES)) {
        if (state.purchasedResearchNodes.includes(nodeConfig.id)) continue;
        if (!nodeConfig.prerequisites.every(id => state.purchasedResearchNodes.includes(id))) continue;
        if (nodeConfig.exclusiveGroup && state.purchasedResearchNodes.some(id => RESEARCH_NODES[id]?.exclusiveGroup === nodeConfig.exclusiveGroup)) continue;
        state.purchasedResearchNodes.push(nodeConfig.id);
        researchChanged = true;
      }
    }
  }
  showToast("Visible node chains unlocked");
  renderAll();
}

function developerGiveRunes() {
  for (const id of Object.keys(RUNES)) state.ownedRunes[id] = { level: 10, exp: 0 };
  showToast("All Runes set to Level 10");
  renderAll();
}

/* --------------------------------- Events ---------------------------------- */

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach(button => button.addEventListener("click", () => setActivePage(button.dataset.page)));
  elements.mobileMenuButton.addEventListener("click", () => elements.sidebar.classList.toggle("open"));

  elements.rebirthButton.addEventListener("click", () => { performRebirth(); saveGame(false); renderAll(); });
  elements.prestigeButton.addEventListener("click", performPrestige);
  elements.purchasePrismNode.addEventListener("click", () => purchasePrismNode(selectedPrismNodeId));
  elements.purchaseResearchNode.addEventListener("click", () => purchaseResearchNode(selectedResearchNodeId));
  elements.buyWindTurbine.addEventListener("click", buyWindTurbine);
  elements.collectWindButton.addEventListener("click", () => { collectWind(); renderAll(); });
  elements.rollRuneButton.addEventListener("click", () => { attemptRuneRoll(); renderAll(); });

  elements.autoPowerToggle.addEventListener("change", () => { state.autoPowerEnabled = elements.autoPowerToggle.checked; });
  elements.autoRebirthToggle.addEventListener("change", () => { state.autoRebirthEnabled = elements.autoRebirthToggle.checked; });
  elements.autoRebirthUpgradeToggle.addEventListener("change", () => { state.autoRebirthUpgradesEnabled = elements.autoRebirthUpgradeToggle.checked; });
  elements.autoRuneToggle.addEventListener("change", () => { state.autoRuneEnabled = elements.autoRuneToggle.checked; });

  elements.saveNowButton.addEventListener("click", () => saveGame(true));
  elements.exportSaveButton.addEventListener("click", exportSave);
  elements.importSaveButton.addEventListener("click", importSave);
  elements.resetSaveButton.addEventListener("click", resetGame);
  elements.notationSelect.addEventListener("change", () => { state.notation = elements.notationSelect.value; renderAll(); });

  elements.unlockDeveloperButton.addEventListener("click", unlockDeveloper);
  elements.developerPasscode.addEventListener("keydown", event => { if (event.key === "Enter") unlockDeveloper(); });
  elements.applyDeveloperValue.addEventListener("click", applyDeveloperValue);
  elements.developerPrestige.addEventListener("click", developerGrantPrestige);
  elements.developerUnlockTrees.addEventListener("click", developerUnlockVisibleNodes);
  elements.developerGiveRunes.addEventListener("click", developerGiveRunes);
  elements.developerOffline.addEventListener("click", () => { const report = applyOfflineProgress(6 * 3600, true); pendingOfflineReport = report; renderAll(); });

  elements.closeOfflineButton.addEventListener("click", closeOfflineModal);
  elements.acceptOfflineButton.addEventListener("click", closeOfflineModal);

  window.addEventListener("beforeunload", () => saveGame(false));
  document.addEventListener("visibilitychange", () => {
    // Intentionally do nothing. Timers continue at full rate while the tab is merely
    // hidden. If the browser suspends the page, gameLoop sees the elapsed gap and
    // applies the offline efficiency/cap silently without opening the offline modal.
  });
}

/* ---------------------------------- Init ----------------------------------- */

function initialize() {
  cacheElements();
  const { offlineSeconds } = loadGame();
  bindEvents();

  if (sessionStorage.getItem("eonshift-dev") === "1") {
    elements.developerLocked.classList.add("hidden");
    elements.developerTools.classList.remove("hidden");
  }

  lastLoopTimestamp = Date.now();
  if (offlineSeconds >= 5) applyOfflineProgress(offlineSeconds, true);
  state.lastUpdate = Date.now();
  renderAll();
  setInterval(gameLoop, 100);
}

document.addEventListener("DOMContentLoaded", initialize);
