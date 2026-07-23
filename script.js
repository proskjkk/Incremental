"use strict";

/*
  Eonshift V0.0.1
  The code is intentionally kept in one file during the prototype phase.
  The data, formulas, systems, UI, and save logic are separated into sections
  so they can be moved into modules later without rewriting the game.
*/

const GAME_VERSION = "0.0.1";
const SAVE_KEY = "eonshift-save-v001";
const AUTOSAVE_INTERVAL_MS = 10_000;
const BASE_PRISM_INTERVAL = 40;
const BASE_REBIRTH_REQUIREMENT = 1_000;

const DEFAULT_STATE = Object.freeze({
  version: GAME_VERSION,
  power: 0,
  prisms: 0,
  rebirthPoints: 0,
  powerUpgradeLevel: 0,
  powerUpgrade2Level: 0,
  rebirthUpgradeLevel: 0,
  rebirthUpgrade2Level: 0,
  prismProgress: 0,
  purchasedTreeNodes: [],
  totalRebirths: 0,
  totalPlayTime: 0
});

let state = createFreshState();
let selectedTreeNodeId = null;
let activePage = "power";
let lastFrameTime = performance.now();
let autosaveAccumulator = 0;
let toastTimeout = null;

const TREE_NODES = {
  originLens: {
    id: "originLens",
    name: "Origin Lens",
    category: "ROOT NODE",
    icon: "◇",
    x: 50,
    y: 50,
    cost: 1,
    prerequisites: [],
    description: "The first stable lens in the Prism network.",
    effectText: "×1.25 total Power generation",
    effect: "powerMultiplier",
    value: 1.25
  },
  powerRefraction: {
    id: "powerRefraction",
    name: "Power Refraction",
    category: "POWER BRANCH",
    icon: "P",
    x: 28,
    y: 34,
    cost: 2,
    prerequisites: ["originLens"],
    description: "Split the current into a denser Power stream.",
    effectText: "×1.50 total Power generation",
    effect: "powerMultiplier",
    value: 1.5
  },
  efficientCircuit: {
    id: "efficientCircuit",
    name: "Efficient Circuit",
    category: "POWER BRANCH",
    icon: "−",
    x: 28,
    y: 66,
    cost: 2,
    prerequisites: ["originLens"],
    description: "Reduce material loss across both Power Upgrades.",
    effectText: "All Power Upgrade costs are 10% cheaper",
    effect: "powerCostMultiplier",
    value: 0.9
  },
  rebirthFocus: {
    id: "rebirthFocus",
    name: "Rebirth Focus",
    category: "REBIRTH BRANCH",
    icon: "R",
    x: 72,
    y: 34,
    cost: 2,
    prerequisites: ["originLens"],
    description: "Preserve more upgrade structure during a Rebirth.",
    effectText: "All Rebirth Upgrade costs are 10% cheaper",
    effect: "rebirthCostMultiplier",
    value: 0.9
  },
  prismPulse: {
    id: "prismPulse",
    name: "Prism Pulse",
    category: "PRISM BRANCH",
    icon: "⌁",
    x: 72,
    y: 66,
    cost: 2,
    prerequisites: ["originLens"],
    description: "Shorten the natural Prism generation cycle.",
    effectText: "Prism interval: 40s → 35s",
    effect: "prismIntervalReduction",
    value: 5
  },
  overload: {
    id: "overload",
    name: "Convergent Overload",
    category: "POWER CAPSTONE",
    icon: "+",
    x: 12,
    y: 50,
    cost: 4,
    prerequisites: ["powerRefraction", "efficientCircuit"],
    description: "Merge both Power branches into one unstable output channel.",
    effectText: "×2 total Power generation",
    effect: "powerMultiplier",
    value: 2
  },
  recursiveMemory: {
    id: "recursiveMemory",
    name: "Recursive Memory",
    category: "REBIRTH CAPSTONE",
    icon: "↻",
    x: 88,
    y: 22,
    cost: 4,
    prerequisites: ["rebirthFocus"],
    description: "Carry a deeper upgrade imprint from one cycle into the next.",
    effectText: "All Rebirth Upgrade costs are another 20% cheaper",
    effect: "rebirthCostMultiplier",
    value: 0.8
  },
  chromaticClock: {
    id: "chromaticClock",
    name: "Chromatic Clock",
    category: "PRISM CAPSTONE",
    icon: "◷",
    x: 88,
    y: 78,
    cost: 5,
    prerequisites: ["prismPulse"],
    description: "Synchronize Prism formation with a faster chromatic cycle.",
    effectText: "Prism interval: 35s → 30s",
    effect: "prismIntervalReduction",
    value: 5
  }
};

const TREE_CONNECTIONS = [
  ["originLens", "powerRefraction"],
  ["originLens", "efficientCircuit"],
  ["originLens", "rebirthFocus"],
  ["originLens", "prismPulse"],
  ["powerRefraction", "overload"],
  ["efficientCircuit", "overload"],
  ["rebirthFocus", "recursiveMemory"],
  ["prismPulse", "chromaticClock"]
];

const elements = {};

function createFreshState() {
  return {
    ...DEFAULT_STATE,
    purchasedTreeNodes: []
  };
}

function cacheElements() {
  const ids = [
    "headerPower", "headerPowerRate", "headerPrism", "headerPrismTimer",
    "headerRebirthPoints", "saveStatus", "powerAmount", "powerPerSecond",
    "powerUpgradeLevel", "powerUpgradeEffect", "powerUpgradeNextEffect",
    "powerUpgradeCost", "buyPowerUpgrade", "buyMaxPowerUpgrade",
    "powerUpgrade2Level", "powerUpgrade2Effect", "powerUpgrade2NextEffect",
    "powerUpgrade2Cost", "buyPowerUpgrade2", "buyMaxPowerUpgrade2",
    "rebirthGain", "rebirthRequirementText", "rebirthButton",
    "rebirthUpgradeLevel", "rebirthUpgradeEffect", "rebirthUpgradeNextEffect",
    "rebirthUpgradeCost", "buyRebirthUpgrade", "buyMaxRebirthUpgrade",
    "rebirthUpgrade2Level", "rebirthUpgrade2Effect", "rebirthUpgrade2NextEffect",
    "rebirthUpgrade2Cost", "buyRebirthUpgrade2", "buyMaxRebirthUpgrade2",
    "treePrismBalance", "treeNodes", "treeLines", "nodePlaceholder",
    "nodeDetails", "selectedNodeIcon", "selectedNodeCategory", "selectedNodeName",
    "selectedNodeDescription", "selectedNodeEffect", "selectedNodeCost",
    "selectedNodeStatus", "selectedNodeRequirement", "purchaseTreeNode",
    "settingsButton", "settingsModal", "closeSettingsButton", "saveNowButton",
    "exportSaveButton", "importSaveButton", "resetSaveButton", "saveTextarea",
    "saveTextareaActions", "confirmImportButton", "cancelSaveTextButton", "toast"
  ];

  for (const id of ids) {
    elements[id] = document.getElementById(id);
  }
}

/* ------------------------------ Formatting ------------------------------ */

function formatNumber(value, maximumFractionDigits = 2) {
  if (!Number.isFinite(value)) return "∞";
  if (value < 0) return `-${formatNumber(Math.abs(value), maximumFractionDigits)}`;
  if (value < 1_000) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: value < 10 ? maximumFractionDigits : 1
    });
  }

  const suffixes = ["K", "M", "B", "T", "Qa", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];
  const tier = Math.floor(Math.log10(value) / 3);
  if (tier <= suffixes.length) {
    const scaled = value / Math.pow(1_000, tier);
    return `${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)} ${suffixes[tier - 1]}`;
  }

  return value.toExponential(2).replace("+", "");
}

function formatInteger(value) {
  return Math.floor(value).toLocaleString();
}

function pluralize(value, singular, plural = `${singular}s`) {
  return Math.abs(value - 1) < Number.EPSILON ? singular : plural;
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

function getTreeSum(effectName) {
  return state.purchasedTreeNodes.reduce((total, nodeId) => {
    const node = TREE_NODES[nodeId];
    if (node?.effect === effectName) return total + node.value;
    return total;
  }, 0);
}

function getPowerUpgradeBaseCost() {
  return 5;
}

function getPowerUpgradeCost(level = state.powerUpgradeLevel) {
  const treeDiscount = getTreeProduct("powerCostMultiplier");
  return getPowerUpgradeBaseCost() * Math.pow(1.35, level) * treeDiscount;
}

function getPowerUpgrade2Cost(level = state.powerUpgrade2Level) {
  const treeDiscount = getTreeProduct("powerCostMultiplier");
  return 20 * Math.pow(1.45, level) * treeDiscount;
}

function getRebirthUpgradeCost(level = state.rebirthUpgradeLevel) {
  const treeDiscount = getTreeProduct("rebirthCostMultiplier");
  return Math.max(1, Math.floor((1 + level) * treeDiscount));
}

function getRebirthUpgrade2Cost(level = state.rebirthUpgrade2Level) {
  const treeDiscount = getTreeProduct("rebirthCostMultiplier");
  return Math.max(1, Math.floor((2 + (2 * level)) * treeDiscount));
}

function getBasePowerPerSecond() {
  return 1 + state.powerUpgradeLevel + (state.rebirthUpgrade2Level * 2);
}

function getPowerUpgradeMultiplier() {
  return Math.pow(1.25, state.powerUpgrade2Level);
}

function getRebirthPowerMultiplier() {
  return Math.pow(1.5, state.rebirthUpgradeLevel);
}

function getPowerPerSecond() {
  return getBasePowerPerSecond()
    * getPowerUpgradeMultiplier()
    * getRebirthPowerMultiplier()
    * getTreeProduct("powerMultiplier");
}

function getPrismInterval() {
  return Math.max(5, BASE_PRISM_INTERVAL - getTreeSum("prismIntervalReduction"));
}

function getRebirthGain() {
  if (state.power < BASE_REBIRTH_REQUIREMENT) return 0;
  return Math.floor(state.power / BASE_REBIRTH_REQUIREMENT);
}

/* ------------------------------ Game Systems ----------------------------- */

function buyPowerUpgrade(amount = 1) {
  let purchased = 0;
  const maximum = amount === Infinity ? 100_000 : amount;

  while (purchased < maximum) {
    const cost = getPowerUpgradeCost();
    if (state.power + 1e-9 < cost) break;
    state.power -= cost;
    state.powerUpgradeLevel += 1;
    purchased += 1;
  }

  if (purchased > 0) {
    showToast(`Flux Condenser +${purchased}`);
    renderAll();
  }
}

function buyPowerUpgrade2(amount = 1) {
  let purchased = 0;
  const maximum = amount === Infinity ? 100_000 : amount;

  while (purchased < maximum) {
    const cost = getPowerUpgrade2Cost();
    if (state.power + 1e-9 < cost) break;
    state.power -= cost;
    state.powerUpgrade2Level += 1;
    purchased += 1;
  }

  if (purchased > 0) {
    showToast(`Power Resonator +${purchased}`);
    renderAll();
  }
}

function buyRebirthUpgrade(amount = 1) {
  let purchased = 0;
  const maximum = amount === Infinity ? 100_000 : amount;

  while (purchased < maximum) {
    const cost = getRebirthUpgradeCost();
    if (state.rebirthPoints < cost) break;
    state.rebirthPoints -= cost;
    state.rebirthUpgradeLevel += 1;
    purchased += 1;
  }

  if (purchased > 0) {
    showToast(`Rebirth Amplifier +${purchased}`);
    renderAll();
  }
}

function buyRebirthUpgrade2(amount = 1) {
  let purchased = 0;
  const maximum = amount === Infinity ? 100_000 : amount;

  while (purchased < maximum) {
    const cost = getRebirthUpgrade2Cost();
    if (state.rebirthPoints < cost) break;
    state.rebirthPoints -= cost;
    state.rebirthUpgrade2Level += 1;
    purchased += 1;
  }

  if (purchased > 0) {
    showToast(`Rebirth Core +${purchased}`);
    renderAll();
  }
}

function performRebirth() {
  const gain = getRebirthGain();
  if (gain <= 0) return;

  state.rebirthPoints += gain;
  state.totalRebirths += 1;
  state.power = 0;
  state.powerUpgradeLevel = 0;
  state.powerUpgrade2Level = 0;

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

  // Reveal one dark question-mark layer beyond currently available nodes.
  return node.prerequisites.some(prerequisiteId => {
    const prerequisite = TREE_NODES[prerequisiteId];
    return prerequisite && prerequisite.prerequisites.every(hasTreeNode);
  });
}

function purchaseSelectedTreeNode() {
  const node = TREE_NODES[selectedTreeNodeId];
  if (!node) return;
  if (getTreeNodeState(node) !== "available") return;
  if (state.prisms < node.cost) return;

  state.prisms -= node.cost;
  state.purchasedTreeNodes.push(node.id);

  // A reduced Prism interval may immediately complete the current cycle.
  resolvePrismGeneration();
  showToast(`${node.name} purchased`);
  saveGame(false);
  renderAll();
}

function resolvePrismGeneration() {
  const interval = getPrismInterval();
  if (state.prismProgress < interval) return;

  const generated = Math.floor(state.prismProgress / interval);
  state.prisms += generated;
  state.prismProgress -= generated * interval;
  showToast(`+${generated} ${pluralize(generated, "Prism")}`);
  if (activePage === "tree" && elements.treeNodes) renderTree();
}

function updateGame(deltaSeconds) {
  const clampedDelta = Math.min(deltaSeconds, 1);
  state.power += getPowerPerSecond() * clampedDelta;
  state.prismProgress += clampedDelta;
  state.totalPlayTime += clampedDelta;
  resolvePrismGeneration();
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

  elements.headerPower.textContent = formatNumber(state.power);
  elements.headerPowerRate.textContent = `+${formatNumber(pps)}/s`;
  elements.headerPrism.textContent = formatInteger(state.prisms);
  elements.headerPrismTimer.textContent = `${remaining.toFixed(1)}s`;
  elements.headerRebirthPoints.textContent = formatInteger(state.rebirthPoints);
}

function renderPowerPage() {
  const pps = getPowerPerSecond();
  const upgradeCost = getPowerUpgradeCost();
  const upgrade2Cost = getPowerUpgrade2Cost();
  const currentBase = getBasePowerPerSecond();
  const currentUpgradeMultiplier = getPowerUpgradeMultiplier();

  elements.powerAmount.textContent = formatNumber(state.power);
  elements.powerPerSecond.textContent = `${formatNumber(pps)} Power per second`;

  elements.powerUpgradeLevel.textContent = formatInteger(state.powerUpgradeLevel);
  elements.powerUpgradeEffect.textContent = `${formatNumber(currentBase)}/s`;
  elements.powerUpgradeNextEffect.textContent = `${formatNumber(currentBase + 1)}/s`;
  elements.powerUpgradeCost.textContent = `${formatNumber(upgradeCost)} Power`;
  elements.buyPowerUpgrade.disabled = state.power + 1e-9 < upgradeCost;
  elements.buyMaxPowerUpgrade.disabled = state.power + 1e-9 < upgradeCost;

  elements.powerUpgrade2Level.textContent = formatInteger(state.powerUpgrade2Level);
  elements.powerUpgrade2Effect.textContent = `×${formatNumber(currentUpgradeMultiplier)}`;
  elements.powerUpgrade2NextEffect.textContent = `×${formatNumber(currentUpgradeMultiplier * 1.25)}`;
  elements.powerUpgrade2Cost.textContent = `${formatNumber(upgrade2Cost)} Power`;
  elements.buyPowerUpgrade2.disabled = state.power + 1e-9 < upgrade2Cost;
  elements.buyMaxPowerUpgrade2.disabled = state.power + 1e-9 < upgrade2Cost;
}

function renderRebirthPage() {
  const gain = getRebirthGain();
  const upgradeCost = getRebirthUpgradeCost();
  const upgrade2Cost = getRebirthUpgrade2Cost();
  const currentMultiplier = getRebirthPowerMultiplier();
  const currentBaseBonus = state.rebirthUpgrade2Level * 2;
  const requirementRemaining = Math.max(0, BASE_REBIRTH_REQUIREMENT - state.power);

  elements.rebirthGain.textContent = `${formatInteger(gain)} ${pluralize(gain, "Rebirth Point")}`;
  elements.rebirthButton.disabled = gain <= 0;

  if (gain > 0) {
    elements.rebirthRequirementText.textContent = `Ready. Every 1,000 Power grants exactly 1 RP.`;
  } else {
    elements.rebirthRequirementText.textContent = `${formatNumber(requirementRemaining)} more Power required.`;
  }

  elements.rebirthUpgradeLevel.textContent = formatInteger(state.rebirthUpgradeLevel);
  elements.rebirthUpgradeEffect.textContent = `×${formatNumber(currentMultiplier)}`;
  elements.rebirthUpgradeNextEffect.textContent = `×${formatNumber(currentMultiplier * 1.5)}`;
  elements.rebirthUpgradeCost.textContent = `${formatInteger(upgradeCost)} RP`;
  elements.buyRebirthUpgrade.disabled = state.rebirthPoints < upgradeCost;
  elements.buyMaxRebirthUpgrade.disabled = state.rebirthPoints < upgradeCost;

  elements.rebirthUpgrade2Level.textContent = formatInteger(state.rebirthUpgrade2Level);
  elements.rebirthUpgrade2Effect.textContent = `+${formatNumber(currentBaseBonus)}/s`;
  elements.rebirthUpgrade2NextEffect.textContent = `+${formatNumber(currentBaseBonus + 2)}/s`;
  elements.rebirthUpgrade2Cost.textContent = `${formatInteger(upgrade2Cost)} RP`;
  elements.buyRebirthUpgrade2.disabled = state.rebirthPoints < upgrade2Cost;
  elements.buyMaxRebirthUpgrade2.disabled = state.rebirthPoints < upgrade2Cost;
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
    line.setAttribute("y1", String(from.y * 6.8));
    line.setAttribute("x2", String(to.x * 10));
    line.setAttribute("y2", String(to.y * 6.8));
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
    button.className = `tree-node ${nodeState}${affordable ? " affordable" : ""}${selectedTreeNodeId === node.id ? " selected" : ""}${discovered ? "" : " hidden-node"}`;
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

/* ------------------------------- Save Data ------------------------------- */

function sanitizeLoadedState(candidate) {
  const clean = createFreshState();
  if (!candidate || typeof candidate !== "object") return clean;

  const finiteNonNegativeFields = [
    "power", "prisms", "rebirthPoints", "powerUpgradeLevel", "powerUpgrade2Level",
    "rebirthUpgradeLevel", "rebirthUpgrade2Level", "prismProgress", "totalRebirths", "totalPlayTime"
  ];

  for (const field of finiteNonNegativeFields) {
    const value = Number(candidate[field]);
    if (Number.isFinite(value) && value >= 0) clean[field] = value;
  }

  clean.powerUpgradeLevel = Math.floor(clean.powerUpgradeLevel);
  clean.powerUpgrade2Level = Math.floor(clean.powerUpgrade2Level);
  clean.rebirthUpgradeLevel = Math.floor(clean.rebirthUpgradeLevel);
  clean.rebirthUpgrade2Level = Math.floor(clean.rebirthUpgrade2Level);
  clean.prisms = Math.floor(clean.prisms);
  clean.rebirthPoints = Math.floor(clean.rebirthPoints);
  clean.totalRebirths = Math.floor(clean.totalRebirths);

  if (Array.isArray(candidate.purchasedTreeNodes)) {
    clean.purchasedTreeNodes = [...new Set(candidate.purchasedTreeNodes)]
      .filter(nodeId => Object.hasOwn(TREE_NODES, nodeId));
  }

  clean.version = GAME_VERSION;
  return clean;
}

function saveGame(showFeedback = true) {
  try {
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
    if (!rawSave) return;
    state = sanitizeLoadedState(JSON.parse(rawSave));
  } catch (error) {
    console.error("Failed to load Eonshift:", error);
    state = createFreshState();
    showToast("Save could not be loaded; a new game was started");
  }
}

function encodeSave() {
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeSave(encoded) {
  const json = decodeURIComponent(escape(atob(encoded.trim())));
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
    selectedTreeNodeId = null;
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
  localStorage.removeItem(SAVE_KEY);
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

/* ------------------------------- Game Loop -------------------------------- */

function gameLoop(currentTime) {
  const deltaSeconds = Math.max(0, (currentTime - lastFrameTime) / 1_000);
  lastFrameTime = currentTime;
  autosaveAccumulator += deltaSeconds * 1_000;

  updateGame(deltaSeconds);
  renderHeader();
  renderPowerPage();
  renderRebirthPage();
  if (activePage === "tree") {
    elements.treePrismBalance.textContent = formatInteger(state.prisms);
    renderSelectedTreeNode();
  }

  if (autosaveAccumulator >= AUTOSAVE_INTERVAL_MS) {
    autosaveAccumulator = 0;
    saveGame(false);
  }

  requestAnimationFrame(gameLoop);
}

/* ------------------------------ Event Setup ------------------------------ */

function bindEvents() {
  document.querySelectorAll(".nav-button").forEach(button => {
    button.addEventListener("click", () => setActivePage(button.dataset.page));
  });

  elements.buyPowerUpgrade.addEventListener("click", () => buyPowerUpgrade(1));
  elements.buyMaxPowerUpgrade.addEventListener("click", () => buyPowerUpgrade(Infinity));
  elements.buyPowerUpgrade2.addEventListener("click", () => buyPowerUpgrade2(1));
  elements.buyMaxPowerUpgrade2.addEventListener("click", () => buyPowerUpgrade2(Infinity));
  elements.rebirthButton.addEventListener("click", performRebirth);
  elements.buyRebirthUpgrade.addEventListener("click", () => buyRebirthUpgrade(1));
  elements.buyMaxRebirthUpgrade.addEventListener("click", () => buyRebirthUpgrade(Infinity));
  elements.buyRebirthUpgrade2.addEventListener("click", () => buyRebirthUpgrade2(1));
  elements.buyMaxRebirthUpgrade2.addEventListener("click", () => buyRebirthUpgrade2(Infinity));
  elements.purchaseTreeNode.addEventListener("click", purchaseSelectedTreeNode);

  elements.settingsButton.addEventListener("click", openSettings);
  elements.closeSettingsButton.addEventListener("click", closeSettings);
  elements.settingsModal.addEventListener("click", event => {
    if (event.target === elements.settingsModal) closeSettings();
  });

  elements.saveNowButton.addEventListener("click", () => saveGame(true));
  elements.exportSaveButton.addEventListener("click", () => showSaveTextarea("export"));
  elements.importSaveButton.addEventListener("click", () => showSaveTextarea("import"));
  elements.confirmImportButton.addEventListener("click", importSave);
  elements.cancelSaveTextButton.addEventListener("click", hideSaveTextarea);
  elements.resetSaveButton.addEventListener("click", resetGame);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !elements.settingsModal.classList.contains("hidden")) {
      closeSettings();
    }
  });

  window.addEventListener("beforeunload", () => saveGame(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame(false);
    lastFrameTime = performance.now();
  });
}

function init() {
  cacheElements();
  loadGame();
  bindEvents();
  renderAll();
  renderTree();
  requestAnimationFrame(gameLoop);
}

document.addEventListener("DOMContentLoaded", init);
