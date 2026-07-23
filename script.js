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

const DEFAULT_STATE = Object.freeze({
  version: GAME_VERSION,
  power: 0,
  prisms: 0,
  rebirthPoints: 0,
  powerUpgradeLevel: 0,
  powerResonatorLevel: 0,
  rebirthUpgradeLevel: 0,
  rebirthCoreLevel: 0,
  prismProgress: 0,
  prismYieldRemainder: 0,
  purchasedTreeNodes: [],
  totalRebirths: 0,
  totalPlayTime: 0,
  lastUpdateAt: Date.now()
});

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

const TREE_NODES = {
  originLens: {
    id: "originLens",
    name: "Origin Lens",
    category: "ROOT NODE",
    branch: "root",
    icon: "◇",
    x: 48,
    y: 52,
    cost: 1,
    prerequisites: [],
    description: "Stabilize the first junction of the Prism network.",
    effectText: "×1.10 total Power generation",
    effect: "powerMultiplier",
    value: 1.1
  },

  currentChannel: {
    id: "currentChannel",
    name: "Current Channel",
    category: "POWER BRANCH",
    branch: "power",
    icon: "⚡",
    x: 33,
    y: 42,
    cost: 3,
    prerequisites: ["originLens"],
    description: "Redirect Prism energy into the Power stream.",
    effectText: "×1.25 total Power generation",
    effect: "powerMultiplier",
    value: 1.25
  },
  compressedFlow: {
    id: "compressedFlow",
    name: "Compressed Flow",
    category: "POWER BRANCH",
    branch: "power",
    icon: "↯",
    x: 19,
    y: 31,
    cost: 8,
    prerequisites: ["currentChannel"],
    description: "Compress the stream into a denser production cycle.",
    effectText: "×1.50 total Power generation",
    effect: "powerMultiplier",
    value: 1.5
  },
  overdriveArray: {
    id: "overdriveArray",
    name: "Overdrive Array",
    category: "POWER CAPSTONE",
    branch: "power",
    icon: "✦",
    x: 10,
    y: 48,
    cost: 18,
    prerequisites: ["compressedFlow"],
    description: "Push the Power stream beyond its normal operating range.",
    effectText: "×2 total Power generation",
    effect: "powerMultiplier",
    value: 2
  },

  pulseTuning: {
    id: "pulseTuning",
    name: "Pulse Tuning",
    category: "PRISM SPEED",
    branch: "prism-speed",
    icon: "◷",
    x: 50,
    y: 31,
    cost: 4,
    prerequisites: ["originLens"],
    description: "Shorten the time needed to form each Prism.",
    effectText: "Prism cycles are 10% faster",
    effect: "prismIntervalMultiplier",
    value: 0.9
  },
  chromaticFrequency: {
    id: "chromaticFrequency",
    name: "Chromatic Frequency",
    category: "PRISM SPEED",
    branch: "prism-speed",
    icon: "⌁",
    x: 63,
    y: 19,
    cost: 10,
    prerequisites: ["pulseTuning"],
    description: "Synchronize the Prism cycle with a higher frequency.",
    effectText: "Prism cycles are another 10% faster",
    effect: "prismIntervalMultiplier",
    value: 0.9
  },
  rapidSpectrum: {
    id: "rapidSpectrum",
    name: "Rapid Spectrum",
    category: "PRISM SPEED CAPSTONE",
    branch: "prism-speed",
    icon: "»",
    x: 79,
    y: 14,
    cost: 22,
    prerequisites: ["chromaticFrequency"],
    description: "Collapse the final delay between Prism formations.",
    effectText: "Prism cycles are 15% faster",
    effect: "prismIntervalMultiplier",
    value: 0.85
  },

  splitSpectrum: {
    id: "splitSpectrum",
    name: "Split Spectrum",
    category: "PRISM MULTIPLIER",
    branch: "prism-multi",
    icon: "◆",
    x: 63,
    y: 45,
    cost: 5,
    prerequisites: ["originLens"],
    description: "Split each completed cycle into two stable Prisms.",
    effectText: "×2 Prisms gained per cycle",
    effect: "prismGainMultiplier",
    value: 2
  },
  mirroredYield: {
    id: "mirroredYield",
    name: "Mirrored Yield",
    category: "PRISM MULTIPLIER",
    branch: "prism-multi",
    icon: "◈",
    x: 77,
    y: 35,
    cost: 14,
    prerequisites: ["splitSpectrum"],
    description: "Mirror the output produced by every Prism cycle.",
    effectText: "×2 Prisms gained per cycle",
    effect: "prismGainMultiplier",
    value: 2
  },
  spectrumBloom: {
    id: "spectrumBloom",
    name: "Spectrum Bloom",
    category: "PRISM MULTIPLIER CAPSTONE",
    branch: "prism-multi",
    icon: "✺",
    x: 91,
    y: 24,
    cost: 30,
    prerequisites: ["mirroredYield"],
    description: "Expand every Prism cycle into a larger chromatic bloom.",
    effectText: "×3 Prisms gained per cycle",
    effect: "prismGainMultiplier",
    value: 3
  },

  recoveryCalibration: {
    id: "recoveryCalibration",
    name: "Recovery Calibration",
    category: "OFFLINE EFFICIENCY",
    branch: "offline-efficiency",
    icon: "85",
    x: 42,
    y: 71,
    cost: 6,
    prerequisites: ["originLens"],
    description: "Reduce the production loss that occurs while the game is closed.",
    effectText: "Offline efficiency: 85% → 90%",
    effect: "offlineEfficiency",
    value: 0.9
  },
  deepRecovery: {
    id: "deepRecovery",
    name: "Deep Recovery",
    category: "OFFLINE EFFICIENCY",
    branch: "offline-efficiency",
    icon: "98",
    x: 28,
    y: 82,
    cost: 16,
    prerequisites: ["recoveryCalibration"],
    description: "Preserve nearly all production while the game is closed.",
    effectText: "Offline efficiency: 90% → 98%",
    effect: "offlineEfficiency",
    value: 0.98
  },
  perfectRecovery: {
    id: "perfectRecovery",
    name: "Perfect Recovery",
    category: "OFFLINE EFFICIENCY CAPSTONE",
    branch: "offline-efficiency",
    icon: "100",
    x: 13,
    y: 72,
    cost: 36,
    prerequisites: ["deepRecovery"],
    description: "Remove the remaining offline production penalty.",
    effectText: "Offline efficiency: 98% → 100%",
    effect: "offlineEfficiency",
    value: 1
  },

  extendedMemory: {
    id: "extendedMemory",
    name: "Extended Memory",
    category: "OFFLINE DURATION",
    branch: "offline-duration",
    icon: "12h",
    x: 59,
    y: 69,
    cost: 6,
    prerequisites: ["originLens"],
    description: "Store a longer period of closed-game progression.",
    effectText: "Offline limit: 6 hours → 12 hours",
    effect: "offlineLimit",
    value: 12 * 60 * 60
  },
  persistentMemory: {
    id: "persistentMemory",
    name: "Persistent Memory",
    category: "OFFLINE DURATION",
    branch: "offline-duration",
    icon: "24h",
    x: 73,
    y: 81,
    cost: 18,
    prerequisites: ["extendedMemory"],
    description: "Preserve a full day of closed-game progression.",
    effectText: "Offline limit: 12 hours → 24 hours",
    effect: "offlineLimit",
    value: 24 * 60 * 60
  },
  timelessArchive: {
    id: "timelessArchive",
    name: "Timeless Archive",
    category: "OFFLINE DURATION CAPSTONE",
    branch: "offline-duration",
    icon: "∞",
    x: 89,
    y: 68,
    cost: 40,
    prerequisites: ["persistentMemory"],
    description: "Store all closed-game progression without a time limit.",
    effectText: "Offline progression has no time limit",
    effect: "offlineLimit",
    value: Infinity
  }
};

const TREE_CONNECTIONS = [
  ["originLens", "currentChannel"],
  ["currentChannel", "compressedFlow"],
  ["compressedFlow", "overdriveArray"],

  ["originLens", "pulseTuning"],
  ["pulseTuning", "chromaticFrequency"],
  ["chromaticFrequency", "rapidSpectrum"],

  ["originLens", "splitSpectrum"],
  ["splitSpectrum", "mirroredYield"],
  ["mirroredYield", "spectrumBloom"],

  ["originLens", "recoveryCalibration"],
  ["recoveryCalibration", "deepRecovery"],
  ["deepRecovery", "perfectRecovery"],

  ["originLens", "extendedMemory"],
  ["extendedMemory", "persistentMemory"],
  ["persistentMemory", "timelessArchive"]
];

const elements = {};

function createFreshState() {
  return {
    ...DEFAULT_STATE,
    purchasedTreeNodes: [],
    lastUpdateAt: Date.now()
  };
}

function cacheElements() {
  const ids = [
    "headerPower", "headerPowerRate", "headerPrism", "headerPrismTimer",
    "headerRebirthPoints", "saveStatus", "powerAmount", "powerPerSecond",

    "powerUpgradeLevel", "powerUpgradeEffect", "powerUpgradeNextEffect",
    "powerUpgradeCost", "buyPowerUpgrade", "buyMaxPowerUpgrade",
    "powerResonatorLevel", "powerResonatorEffect", "powerResonatorNextEffect",
    "powerResonatorCost", "buyPowerResonator", "buyMaxPowerResonator",

    "rebirthGain", "rebirthRequirementText", "rebirthButton",
    "rebirthUpgradeLevel", "rebirthUpgradeEffect", "rebirthUpgradeNextEffect",
    "rebirthUpgradeCost", "buyRebirthUpgrade", "buyMaxRebirthUpgrade",
    "rebirthCoreLevel", "rebirthCoreEffect", "rebirthCoreNextEffect",
    "rebirthCoreCost", "buyRebirthCore", "buyMaxRebirthCore",

    "treePrismBalance", "treeNodes", "treeLines", "nodePlaceholder",
    "nodeDetails", "selectedNodeIcon", "selectedNodeCategory", "selectedNodeName",
    "selectedNodeDescription", "selectedNodeEffect", "selectedNodeCost",
    "selectedNodeStatus", "selectedNodeRequirement", "purchaseTreeNode",

    "settingsButton", "settingsModal", "closeSettingsButton", "saveNowButton",
    "exportSaveButton", "importSaveButton", "resetSaveButton", "saveTextarea",
    "saveTextareaActions", "confirmImportButton", "cancelSaveTextButton",

    "developerStatus", "developerLogin", "developerPasscode", "unlockDeveloperButton",
    "developerTools", "developerResourceSelect", "developerResourceAmount",
    "developerAddResource", "developerSetResource", "developerUpgradeSelect",
    "developerUpgradeAmount", "developerAddUpgrade", "developerSetUpgrade",
    "developerUnlockTree", "developerResetTree", "developerOfflineHours",
    "developerSimulateOffline",

    "offlineModal", "closeOfflineButton", "offlineContinueButton", "offlineElapsedText",
    "offlineAppliedText", "offlineEfficiencyText", "offlinePowerGain", "offlinePrismGain",
    "offlineLimitNote", "offlineChart", "toast"
  ];

  for (const id of ids) {
    elements[id] = document.getElementById(id);
  }
}

/* ------------------------------ Formatting ------------------------------ */

function getDisplayDecimals(value, maximumFractionDigits = 2) {
  if (value >= 100) return 0;
  if (value >= 10) return 1;
  return maximumFractionDigits;
}

function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "∞";
  if (value < 0) return `-${formatNumber(Math.abs(value), maximumFractionDigits)}`;

  const suffixes = ["K", "M", "B", "T", "Qa", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];

  if (value < 1_000) {
    const decimals = value < 10 ? maximumFractionDigits : 1;
    const rounded = Number(value.toFixed(decimals));
    if (rounded < 1_000) {
      return rounded.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
      });
    }
  }

  let tier = Math.max(1, Math.floor(Math.log10(value) / 3));
  if (tier > suffixes.length) return value.toExponential(2).replace("+", "");

  let scaled = value / Math.pow(1_000, tier);
  let decimals = getDisplayDecimals(scaled, maximumFractionDigits);
  let rounded = Number(scaled.toFixed(decimals));

  // Prevent values such as 999,999.9 from displaying as "1000 K".
  if (rounded >= 1_000) {
    tier += 1;
    if (tier > suffixes.length) return value.toExponential(2).replace("+", "");
    scaled = value / Math.pow(1_000, tier);
    decimals = getDisplayDecimals(scaled, maximumFractionDigits);
    rounded = Number(scaled.toFixed(decimals));
  }

  return `${rounded.toFixed(decimals)} ${suffixes[tier - 1]}`;
}

function formatInteger(value) {
  if (!Number.isFinite(value)) return "∞";
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
  return Math.abs(value - 1) < Number.EPSILON ? singular : plural;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/* ------------------------------- Formulas ------------------------------- */

function hasTreeNode(nodeId) {
  return state.purchasedTreeNodes.includes(nodeId);
}

function getTreeProduct(effectName) {
  return state.purchasedTreeNodes.reduce((total, nodeId) => {
    const node = TREE_NODES[nodeId];
    if (node?.effect === effectName) return total * node.value;
    return total;
  }, 1);
}

function getTreeMaximum(effectName, fallbackValue) {
  return state.purchasedTreeNodes.reduce((maximum, nodeId) => {
    const node = TREE_NODES[nodeId];
    if (node?.effect !== effectName) return maximum;
    if (node.value === Infinity) return Infinity;
    return Math.max(maximum, node.value);
  }, fallbackValue);
}

function getPowerUpgradeCost(level = state.powerUpgradeLevel) {
  return 5 * Math.pow(1.45, level);
}

function getPowerResonatorCost(level = state.powerResonatorLevel) {
  return 20 * Math.pow(1.58, level);
}

function getRebirthUpgradeCost(level = state.rebirthUpgradeLevel) {
  return Math.max(1, Math.ceil(Math.pow(1.75, level)));
}

function getRebirthCoreCost(level = state.rebirthCoreLevel) {
  return Math.max(2, Math.ceil(2 * Math.pow(1.9, level)));
}

function getFluxBaseBonus() {
  return state.powerUpgradeLevel;
}

function getRebirthCoreBaseBonus() {
  return state.rebirthCoreLevel * 2;
}

function getBasePowerPerSecond() {
  return 1 + getFluxBaseBonus() + getRebirthCoreBaseBonus();
}

function getPowerResonatorMultiplier() {
  return Math.pow(1.25, state.powerResonatorLevel);
}

function getRebirthPowerMultiplier() {
  return Math.pow(1.5, state.rebirthUpgradeLevel);
}

function getPowerPerSecond() {
  return getBasePowerPerSecond()
    * getPowerResonatorMultiplier()
    * getRebirthPowerMultiplier()
    * getTreeProduct("powerMultiplier");
}

function getPrismInterval() {
  return Math.max(5, BASE_PRISM_INTERVAL * getTreeProduct("prismIntervalMultiplier"));
}

function getPrismGainPerCycle() {
  return Math.max(1, getTreeProduct("prismGainMultiplier"));
}

function getOfflineEfficiency() {
  return getTreeMaximum("offlineEfficiency", BASE_OFFLINE_EFFICIENCY);
}

function getOfflineLimitSeconds() {
  return getTreeMaximum("offlineLimit", BASE_OFFLINE_LIMIT_SECONDS);
}

function getRebirthGain() {
  if (state.power < BASE_REBIRTH_REQUIREMENT) return 0;
  return Math.floor(state.power / BASE_REBIRTH_REQUIREMENT);
}

/* ------------------------------ Game Systems ----------------------------- */

function canAfford(currency, cost) {
  return Number.isFinite(currency)
    && Number.isFinite(cost)
    && currency + 1e-9 >= cost;
}

function buyRepeatableUpgrade({ amount, getCost, levelField, currencyField, toastName }) {
  let purchased = 0;
  const maximum = amount === Infinity
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(amount));

  while (purchased < maximum) {
    const cost = getCost(state[levelField]);
    if (!canAfford(state[currencyField], cost)) break;
    state[currencyField] -= cost;
    state[levelField] += 1;
    purchased += 1;
  }

  if (purchased > 0) {
    showToast(`${toastName} +${purchased}`);
    renderAll();
  }
}

function buyPowerUpgrade(amount = 1) {
  buyRepeatableUpgrade({
    amount,
    getCost: getPowerUpgradeCost,
    levelField: "powerUpgradeLevel",
    currencyField: "power",
    toastName: "Flux Condenser"
  });
}

function buyPowerResonator(amount = 1) {
  buyRepeatableUpgrade({
    amount,
    getCost: getPowerResonatorCost,
    levelField: "powerResonatorLevel",
    currencyField: "power",
    toastName: "Power Resonator"
  });
}

function buyRebirthUpgrade(amount = 1) {
  buyRepeatableUpgrade({
    amount,
    getCost: getRebirthUpgradeCost,
    levelField: "rebirthUpgradeLevel",
    currencyField: "rebirthPoints",
    toastName: "Rebirth Amplifier"
  });
}

function buyRebirthCore(amount = 1) {
  buyRepeatableUpgrade({
    amount,
    getCost: getRebirthCoreCost,
    levelField: "rebirthCoreLevel",
    currencyField: "rebirthPoints",
    toastName: "Rebirth Core"
  });
}

function performRebirth() {
  const gain = getRebirthGain();
  if (gain <= 0) return;

  state.rebirthPoints += gain;
  state.totalRebirths += 1;
  state.power = 0;
  state.powerUpgradeLevel = 0;
  state.powerResonatorLevel = 0;

  showToast(`Rebirth complete: +${formatInteger(gain)} RP`);
  saveGame(false);
  renderAll();
}

function getTreeNodeState(node) {
  if (hasTreeNode(node.id)) return "purchased";
  if (node.prerequisites.every(hasTreeNode)) return "available";
  return "locked";
}

function isTreeNodeDiscovered(node) {
  if (node.id === "originLens" || hasTreeNode(node.id)) return true;
  if (node.prerequisites.some(hasTreeNode)) return true;

  // Show one locked question-mark step beyond the currently available nodes.
  return node.prerequisites.some(prerequisiteId => {
    const prerequisite = TREE_NODES[prerequisiteId];
    return prerequisite && prerequisite.prerequisites.every(hasTreeNode);
  });
}

function purchaseSelectedTreeNode() {
  const node = TREE_NODES[selectedTreeNodeId];
  if (!node) return;
  if (getTreeNodeState(node) !== "available") return;
  if (!canAfford(state.prisms, node.cost)) return;

  state.prisms -= node.cost;
  state.purchasedTreeNodes.push(node.id);
  resolvePrismGeneration(false);
  showToast(`${node.name} purchased`);
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

  if (showFeedback && generated > 0) {
    showToast(`+${generated} ${pluralize(generated, "Prism")}`);
  }

  if (activePage === "tree" && elements.treeNodes) renderTree();
  return generated;
}

function applyProgress(seconds, efficiency = 1) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const safeEfficiency = clamp(Number(efficiency) || 0, 0, 1);
  if (safeSeconds <= 0 || safeEfficiency <= 0) {
    return { powerGain: 0, prismGain: 0 };
  }

  const powerBefore = state.power;
  const prismBefore = state.prisms;
  state.power += getPowerPerSecond() * safeSeconds * safeEfficiency;
  state.prismProgress += safeSeconds * safeEfficiency;
  resolvePrismGeneration(false);
  state.totalPlayTime += safeSeconds;

  return {
    powerGain: state.power - powerBefore,
    prismGain: state.prisms - prismBefore
  };
}

function applyOfflineProgress(elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const efficiency = getOfflineEfficiency();
  const limitSeconds = getOfflineLimitSeconds();
  const appliedSeconds = Number.isFinite(limitSeconds)
    ? Math.min(elapsed, limitSeconds)
    : elapsed;
  const powerBefore = state.power;
  const prismBefore = state.prisms;
  const gains = applyProgress(appliedSeconds, efficiency);

  return {
    elapsedSeconds: elapsed,
    appliedSeconds,
    efficiency,
    limitSeconds,
    capped: Number.isFinite(limitSeconds) && elapsed > limitSeconds,
    powerBefore,
    powerAfter: state.power,
    powerGain: gains.powerGain,
    prismBefore,
    prismAfter: state.prisms,
    prismGain: gains.prismGain
  };
}

function applySuspendedBackgroundProgress(elapsedSeconds, trackHiddenSession) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const efficiency = getOfflineEfficiency();
  const limitSeconds = getOfflineLimitSeconds();
  const consumed = trackHiddenSession ? hiddenOfflineConsumedSeconds : 0;
  const remaining = Number.isFinite(limitSeconds)
    ? Math.max(0, limitSeconds - consumed)
    : Infinity;
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

    if (eventLoopWasSuspended) {
      // Long timer gaps usually mean the browser throttled the tab or the device
      // slept. Apply the offline efficiency and duration cap without opening the
      // offline report. Normal short background ticks still run at full speed.
      applySuspendedBackgroundProgress(elapsedSeconds, treatAsHidden);
    } else {
      applyProgress(elapsedSeconds, 1);
    }

    autosaveAccumulator += elapsedSeconds * 1_000;
  }

  return elapsedSeconds;
}

/* ---------------------------------- UI ---------------------------------- */

function setActivePage(pageName) {
  activePage = pageName;
  document.querySelectorAll(".nav-button").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageName);
  });
  document.querySelectorAll("[data-page-panel]").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.pagePanel === pageName);
  });

  if (pageName === "tree") renderTree();
}

function renderHeader() {
  const pps = getPowerPerSecond();
  const prismInterval = getPrismInterval();
  const remaining = Math.max(0, prismInterval - state.prismProgress);
  const prismCycleGain = getPrismGainPerCycle();

  elements.headerPower.textContent = formatNumber(state.power);
  elements.headerPowerRate.textContent = `+${formatNumber(pps)}/s`;
  elements.headerPrism.textContent = formatInteger(state.prisms);
  elements.headerPrismTimer.textContent = `+${formatNumber(prismCycleGain)} in ${remaining.toFixed(1)}s`;
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
  elements.powerUpgradeNextEffect.textContent = `+${formatNumber(getFluxBaseBonus() + 1)}/s`;
  elements.powerUpgradeCost.textContent = `${formatNumber(fluxCost)} Power`;
  elements.buyPowerUpgrade.disabled = !canAfford(state.power, fluxCost);
  elements.buyMaxPowerUpgrade.disabled = !canAfford(state.power, fluxCost);

  elements.powerResonatorLevel.textContent = formatInteger(state.powerResonatorLevel);
  elements.powerResonatorEffect.textContent = `×${formatNumber(resonatorMultiplier)}`;
  elements.powerResonatorNextEffect.textContent = `×${formatNumber(resonatorMultiplier * 1.25)}`;
  elements.powerResonatorCost.textContent = `${formatNumber(resonatorCost)} Power`;
  elements.buyPowerResonator.disabled = !canAfford(state.power, resonatorCost);
  elements.buyMaxPowerResonator.disabled = !canAfford(state.power, resonatorCost);
}

function renderRebirthPage() {
  const gain = getRebirthGain();
  const ampCost = getRebirthUpgradeCost();
  const coreCost = getRebirthCoreCost();
  const currentMultiplier = getRebirthPowerMultiplier();
  const requirementRemaining = Math.max(0, BASE_REBIRTH_REQUIREMENT - state.power);

  elements.rebirthGain.textContent = `${formatInteger(gain)} ${pluralize(gain, "Rebirth Point")}`;
  elements.rebirthButton.disabled = gain <= 0;

  if (gain > 0) {
    elements.rebirthRequirementText.textContent = `Ready. ${formatInteger(Math.floor(state.power))} Power grants ${formatInteger(gain)} RP.`;
  } else {
    elements.rebirthRequirementText.textContent = `${formatNumber(requirementRemaining)} more Power required.`;
  }

  elements.rebirthUpgradeLevel.textContent = formatInteger(state.rebirthUpgradeLevel);
  elements.rebirthUpgradeEffect.textContent = `×${formatNumber(currentMultiplier)}`;
  elements.rebirthUpgradeNextEffect.textContent = `×${formatNumber(currentMultiplier * 1.5)}`;
  elements.rebirthUpgradeCost.textContent = `${formatInteger(ampCost)} RP`;
  elements.buyRebirthUpgrade.disabled = !canAfford(state.rebirthPoints, ampCost);
  elements.buyMaxRebirthUpgrade.disabled = !canAfford(state.rebirthPoints, ampCost);

  elements.rebirthCoreLevel.textContent = formatInteger(state.rebirthCoreLevel);
  elements.rebirthCoreEffect.textContent = `+${formatNumber(getRebirthCoreBaseBonus())}/s`;
  elements.rebirthCoreNextEffect.textContent = `+${formatNumber(getRebirthCoreBaseBonus() + 2)}/s`;
  elements.rebirthCoreCost.textContent = `${formatInteger(coreCost)} RP`;
  elements.buyRebirthCore.disabled = !canAfford(state.rebirthPoints, coreCost);
  elements.buyMaxRebirthCore.disabled = !canAfford(state.rebirthPoints, coreCost);
}

function renderTree() {
  elements.treePrismBalance.textContent = formatInteger(state.prisms);
  elements.treeNodes.innerHTML = "";
  elements.treeLines.innerHTML = "";

  for (const [fromId, toId] of TREE_CONNECTIONS) {
    const from = TREE_NODES[fromId];
    const to = TREE_NODES[toId];
    const fromDiscovered = isTreeNodeDiscovered(from);
    const toDiscovered = isTreeNodeDiscovered(to);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(from.x * 10));
    line.setAttribute("y1", String(from.y * 7.6));
    line.setAttribute("x2", String(to.x * 10));
    line.setAttribute("y2", String(to.y * 7.6));
    line.classList.add("tree-line");

    if (!fromDiscovered || !toDiscovered) line.classList.add("hidden-line");
    if (hasTreeNode(fromId) && (hasTreeNode(toId) || getTreeNodeState(to) === "available")) {
      line.classList.add("active");
    }

    elements.treeLines.appendChild(line);
  }

  for (const node of Object.values(TREE_NODES)) {
    const discovered = isTreeNodeDiscovered(node);
    const nodeState = getTreeNodeState(node);
    const affordable = nodeState === "available" && state.prisms >= node.cost;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tree-node ${node.branch} ${nodeState}${affordable ? " affordable" : ""}${selectedTreeNodeId === node.id ? " selected" : ""}${discovered ? "" : " hidden-node"}`;
    button.style.left = `${node.x}%`;
    button.style.top = `${node.y}%`;
    button.dataset.nodeId = node.id;
    button.setAttribute("aria-label", discovered ? `${node.name}, ${nodeState}` : "Hidden tree node");

    const shownIcon = nodeState === "locked" ? "?" : node.icon;
    const shownCost = nodeState === "purchased" ? "Owned" : nodeState === "locked" ? "Locked" : `${node.cost} ◇`;

    button.innerHTML = `
      <span class="hex-border"></span>
      <span class="hex-fill"></span>
      <span class="hex-inner">
        <span class="node-tier-mini">1/1</span>
        <span class="node-icon">${shownIcon}</span>
        <span class="node-cost-mini">${shownCost}</span>
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
  if (!node || !isTreeNodeDiscovered(node)) {
    elements.nodePlaceholder.classList.remove("hidden");
    elements.nodeDetails.classList.add("hidden");
    return;
  }

  elements.nodePlaceholder.classList.add("hidden");
  elements.nodeDetails.classList.remove("hidden");

  const nodeState = getTreeNodeState(node);
  const locked = nodeState === "locked";
  const prerequisiteNames = node.prerequisites.length
    ? node.prerequisites.map(id => TREE_NODES[id].name).join(" + ")
    : "None";

  elements.selectedNodeIcon.textContent = locked ? "?" : node.icon;
  elements.selectedNodeCategory.textContent = locked ? "LOCKED NODE" : node.category;
  elements.selectedNodeName.textContent = locked ? "Undiscovered Node" : node.name;
  elements.selectedNodeDescription.textContent = locked
    ? "Purchase the connected prerequisite node to reveal this upgrade."
    : node.description;
  elements.selectedNodeEffect.textContent = locked ? "Unknown" : node.effectText;
  elements.selectedNodeCost.textContent = locked ? "Unknown" : `${node.cost} ${pluralize(node.cost, "Prism")}`;
  elements.selectedNodeStatus.textContent = nodeState.charAt(0).toUpperCase() + nodeState.slice(1);
  elements.selectedNodeRequirement.textContent = prerequisiteNames;

  elements.purchaseTreeNode.disabled = nodeState !== "available" || state.prisms < node.cost;
  elements.purchaseTreeNode.textContent = nodeState === "purchased"
    ? "Purchased"
    : nodeState === "locked"
      ? "Locked"
      : state.prisms < node.cost
        ? `Need ${node.cost - state.prisms} more ${pluralize(node.cost - state.prisms, "Prism")}`
        : "Purchase node";
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
  const background = "#07111a";
  const grid = computed.getPropertyValue("--line-strong").trim() || "rgba(157,196,232,.28)";
  const text = computed.getPropertyValue("--muted").trim() || "#8fa5b8";
  const accent = computed.getPropertyValue("--warning").trim() || "#ffc65c";
  const axis = "rgba(244,248,252,.88)";

  context.fillStyle = background;
  context.fillRect(0, 0, cssWidth, cssHeight);

  const margin = { left: 78, right: 24, top: 18, bottom: 54 };
  const plotWidth = cssWidth - margin.left - margin.right;
  const plotHeight = cssHeight - margin.top - margin.bottom;
  const yMin = report.powerBefore;
  const yMax = Math.max(report.powerAfter, yMin + 1);
  const ySpan = Math.max(1e-9, yMax - yMin);

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

    const seconds = (report.appliedSeconds * i) / xTicks;
    const label = formatDuration(seconds);
    context.textAlign = i === 0 ? "left" : i === xTicks ? "right" : "center";
    context.fillText(label, x, cssHeight - 22);
  }

  for (let i = 0; i <= yTicks; i += 1) {
    const y = margin.top + plotHeight - (plotHeight * i) / yTicks;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(margin.left + plotWidth, y);
    context.stroke();

    const value = yMin + (ySpan * i) / yTicks;
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

  const sampleCount = 48;
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  for (let i = 0; i <= sampleCount; i += 1) {
    const progress = i / sampleCount;
    const value = report.powerBefore + report.powerGain * progress;
    const x = margin.left + plotWidth * progress;
    const y = margin.top + plotHeight - ((value - yMin) / ySpan) * plotHeight;
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

function sanitizeLoadedState(candidate) {
  const clean = createFreshState();
  if (!candidate || typeof candidate !== "object") return clean;

  const finiteNonNegativeFields = [
    "power", "prisms", "rebirthPoints", "powerUpgradeLevel",
    "powerResonatorLevel", "rebirthUpgradeLevel", "rebirthCoreLevel",
    "prismProgress", "prismYieldRemainder", "totalRebirths",
    "totalPlayTime", "lastUpdateAt"
  ];

  for (const field of finiteNonNegativeFields) {
    const value = Number(candidate[field]);
    if (Number.isFinite(value) && value >= 0) clean[field] = value;
  }

  const integerFields = [
    "prisms", "rebirthPoints", "powerUpgradeLevel", "powerResonatorLevel",
    "rebirthUpgradeLevel", "rebirthCoreLevel", "totalRebirths"
  ];
  for (const field of integerFields) clean[field] = Math.floor(clean[field]);

  if (Array.isArray(candidate.purchasedTreeNodes)) {
    const requestedNodes = new Set(
      candidate.purchasedTreeNodes.filter(nodeId => Object.hasOwn(TREE_NODES, nodeId))
    );
    const acceptedNodes = new Set();
    let addedNode = true;

    // Rebuild the tree in dependency order. Invalid descendants are discarded,
    // while legitimate saves still load even when their node IDs are unordered.
    while (addedNode) {
      addedNode = false;
      for (const nodeId of Object.keys(TREE_NODES)) {
        if (!requestedNodes.has(nodeId) || acceptedNodes.has(nodeId)) continue;
        const node = TREE_NODES[nodeId];
        if (node.prerequisites.every(prerequisiteId => acceptedNodes.has(prerequisiteId))) {
          acceptedNodes.add(nodeId);
          addedNode = true;
        }
      }
    }

    clean.purchasedTreeNodes = [...acceptedNodes];
  }

  clean.version = GAME_VERSION;
  return clean;
}

function saveGame(showFeedback = true) {
  try {
    state.lastUpdateAt = Date.now();
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
    showToast("Save could not be loaded; a new game was started");
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeSave() {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(state));
  return bytesToBase64(jsonBytes);
}

function decodeSave(encoded) {
  const jsonBytes = base64ToBytes(encoded.trim());
  const json = new TextDecoder("utf-8", { fatal: true }).decode(jsonBytes);
  return sanitizeLoadedState(JSON.parse(json));
}

function showSaveTextarea(mode) {
  elements.saveTextarea.classList.remove("hidden");
  elements.saveTextareaActions.classList.remove("hidden");
  elements.saveTextarea.dataset.mode = mode;

  if (mode === "export") {
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
    state.lastUpdateAt = Date.now();
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
  const confirmed = window.confirm("Reset all Eonshift progress? This cannot be undone unless you exported a backup.");
  if (!confirmed) return;

  state = createFreshState();
  selectedTreeNodeId = null;
  lastTickAt = Date.now();
  localStorage.removeItem(SAVE_KEY);
  saveGame(false);
  closeSettings();
  renderAll();
  showToast("Progress reset");
}

/* ------------------------------- Settings -------------------------------- */

function openSettings() {
  elements.settingsModal.classList.remove("hidden");
  updateDeveloperAccessUI();
  elements.closeSettingsButton.focus();
}

function closeSettings() {
  elements.settingsModal.classList.add("hidden");
  hideSaveTextarea();
  elements.settingsButton.focus();
}

/* ---------------------------- Developer Tools ---------------------------- */

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

function getDeveloperNumericInput(element, integerOnly = false) {
  const value = Number(element.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return integerOnly ? Math.floor(value) : value;
}

function developerChangeResource(mode) {
  if (!isDeveloperUnlocked()) return;
  const field = elements.developerResourceSelect.value;
  const amount = getDeveloperNumericInput(elements.developerResourceAmount, field !== "power");
  if (amount === null || !Object.hasOwn(state, field)) {
    showToast("Enter a valid resource amount");
    return;
  }

  state[field] = mode === "add" ? state[field] + amount : amount;
  if (field !== "power") state[field] = Math.floor(state[field]);
  saveGame(false);
  renderAll();
  showToast(`${field} ${mode === "add" ? "increased" : "set"}`);
}

function developerChangeUpgrade(mode) {
  if (!isDeveloperUnlocked()) return;
  const field = elements.developerUpgradeSelect.value;
  const amount = getDeveloperNumericInput(elements.developerUpgradeAmount, true);
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
  state.purchasedTreeNodes = Object.keys(TREE_NODES);
  resolvePrismGeneration(false);
  saveGame(false);
  renderAll();
  showToast("All Prism Tree nodes unlocked");
}

function developerResetTree() {
  if (!isDeveloperUnlocked()) return;
  state.purchasedTreeNodes = [];
  selectedTreeNodeId = null;
  saveGame(false);
  renderAll();
  showToast("Prism Tree reset");
}

function developerSimulateOffline() {
  if (!isDeveloperUnlocked()) return;
  const hours = getDeveloperNumericInput(elements.developerOfflineHours, false);
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
  document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => setActivePage(button.dataset.page));
  });

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
  elements.settingsModal.addEventListener("click", event => {
    if (event.target === elements.settingsModal) closeSettings();
  });

  elements.saveNowButton.addEventListener("click", () => {
    processRealTime();
    saveGame(true);
  });
  elements.exportSaveButton.addEventListener("click", () => showSaveTextarea("export"));
  elements.importSaveButton.addEventListener("click", () => showSaveTextarea("import"));
  elements.confirmImportButton.addEventListener("click", importSave);
  elements.cancelSaveTextButton.addEventListener("click", hideSaveTextarea);
  elements.resetSaveButton.addEventListener("click", resetGame);

  elements.unlockDeveloperButton.addEventListener("click", unlockDeveloperAccess);
  elements.developerPasscode.addEventListener("keydown", event => {
    if (event.key === "Enter") unlockDeveloperAccess();
  });
  elements.developerAddResource.addEventListener("click", () => developerChangeResource("add"));
  elements.developerSetResource.addEventListener("click", () => developerChangeResource("set"));
  elements.developerAddUpgrade.addEventListener("click", () => developerChangeUpgrade("add"));
  elements.developerSetUpgrade.addEventListener("click", () => developerChangeUpgrade("set"));
  elements.developerUnlockTree.addEventListener("click", developerUnlockTree);
  elements.developerResetTree.addEventListener("click", developerResetTree);
  elements.developerSimulateOffline.addEventListener("click", developerSimulateOffline);

  elements.closeOfflineButton.addEventListener("click", closeOfflineReport);
  elements.offlineContinueButton.addEventListener("click", closeOfflineReport);
  elements.offlineModal.addEventListener("click", event => {
    if (event.target === elements.offlineModal) closeOfflineReport();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!elements.offlineModal.classList.contains("hidden")) closeOfflineReport();
    else if (!elements.settingsModal.classList.contains("hidden")) closeSettings();
  });

  document.addEventListener("visibilitychange", () => {
    // Process the elapsed interval using the visibility state that was active
    // before this event. This prevents a long hidden/suspended gap from being
    // granted at full rate when the tab becomes visible again.
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
    if (lastOfflineReport && !elements.offlineModal.classList.contains("hidden")) {
      drawOfflineChart(lastOfflineReport);
    }
  });

  window.addEventListener("pagehide", () => {
    processRealTime(visibilityWasHidden);
    saveGame(false);
  });

  window.addEventListener("beforeunload", () => {
    processRealTime(visibilityWasHidden);
    saveGame(false);
  });
}

function init() {
  cacheElements();

  const sameTabSession = sessionStorage.getItem(SESSION_KEY) === "active";
  sessionStorage.setItem(SESSION_KEY, "active");

  const loaded = loadGame();
  const now = Date.now();
  const elapsedSinceSave = loaded
    ? Math.max(0, (now - state.lastUpdateAt) / 1_000)
    : 0;

  lastTickAt = now;
  visibilityWasHidden = document.hidden;
  hiddenOfflineConsumedSeconds = 0;
  bindEvents();
  updateDeveloperAccessUI();

  if (elapsedSinceSave > 1) {
    if (sameTabSession) {
      // Reloads and restored open tabs never show the offline report. Brief
      // reload gaps stay at full speed; long suspended gaps use offline rules.
      if (elapsedSinceSave > BACKGROUND_SUSPEND_THRESHOLD_SECONDS) {
        applyOfflineProgress(elapsedSinceSave);
      } else {
        applyProgress(elapsedSinceSave, 1);
      }
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
