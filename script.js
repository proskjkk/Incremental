"use strict";

const SAVE_KEY = "the-world-incremental-save";
const SAVE_VERSION = 2;
const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_OFFLINE_SECONDS = 28 * 24 * 60 * 60;
const REBIRTH_REQUIREMENT = 1e3;
const PRESTIGE_REQUIREMENT = 1e18;

const COSTS = {
  generator: { base: 10, scale: 1.15 },
  sparkCollector: { base: 100, scale: 1.8 },
  voltage: { base: 10, scale: 3 },
  rebirthPower: { base: 1, scale: 3 },
  generatorMemory: { base: 2, scale: 4 },
  soulHarvester: { base: 10, scale: 1.8 },
  soulPower: { base: 25, scale: 4 },
  soulCatalyst: { base: 100, scale: 5 },
  prestigePower: { base: 1, scale: 3 },
  aetherCondenser: { base: 10, scale: 2 },
  celestialPower: { base: 25, scale: 4 },
  skyResonance: { base: 100, scale: 5 },
};

const MILESTONES = [
  {
    id: "firstCurrent",
    title: "First Current",
    description: "Reach 100 Power.",
    reward: "×1.5 Power",
    multiplier: 1.5,
    condition: (state) => state.power >= 100 || state.rebirthCount > 0 || state.prestigeCount > 0,
  },
  {
    id: "reborn",
    title: "Reborn",
    description: "Perform your first Rebirth.",
    reward: "×2 Power",
    multiplier: 2,
    condition: (state) => state.rebirthCount > 0 || state.prestigeCount > 0,
  },
  {
    id: "soulKeeper",
    title: "Soul Keeper",
    description: "Hold 100 Souls.",
    reward: "×2 Power",
    multiplier: 2,
    condition: (state) => state.souls >= 100 || state.prestigeCount > 0,
  },
  {
    id: "billionCircuit",
    title: "Billion-Circuit World",
    description: "Reach 1 B Power.",
    reward: "×3 Power",
    multiplier: 3,
    condition: (state) => state.power >= 1e9 || state.prestigeCount > 0,
  },
  {
    id: "ascended",
    title: "Ascended",
    description: "Perform your first Prestige.",
    reward: "×10 Power",
    multiplier: 10,
    condition: (state) => state.prestigeCount > 0,
  },
];

const defaultState = () => ({
  version: SAVE_VERSION,
  power: 0,
  generatorLevel: 0,
  sparks: 0,
  sparkCollectorLevel: 0,
  voltageLevel: 0,
  rebirthPoints: 0,
  rebirthCount: 0,
  rebirthPowerLevel: 0,
  generatorMemoryLevel: 0,
  souls: 0,
  soulHarvesterLevel: 0,
  soulPowerLevel: 0,
  soulCatalystLevel: 0,
  prestigePoints: 0,
  prestigeCount: 0,
  prestigePowerLevel: 0,
  aether: 0,
  aetherCondenserLevel: 0,
  celestialPowerLevel: 0,
  skyResonanceLevel: 0,
  achievements: {},
  settings: {
    notation: "standard",
  },
  lastSavedAt: Date.now(),
});

let gameState = defaultState();
let selectedBuyMode = "1";
let activeLayer = "overworld";
let lastFrameTime = performance.now();
let lastRenderTime = 0;
let sessionStartedAt = Date.now();
let saveStatusTimer = null;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const elements = {
  navButtons: $$('[data-layer]'),
  layerViews: $$('[data-layer-view]'),
  underworldNav: $("#underworld-nav"),
  skyNav: $("#sky-nav"),
  buyModes: $$('[data-buy-mode]'),
  saveStatus: $("#save-status"),
  toast: $("#toast"),

  headerPower: $("#header-power"),
  headerSparks: $("#header-sparks"),
  headerRebirthPoints: $("#header-rebirth-points"),
  headerSoulsChip: $("#header-souls-chip"),
  headerSouls: $("#header-souls"),
  headerPrestigePoints: $("#header-prestige-points"),
  headerAetherChip: $("#header-aether-chip"),
  headerAether: $("#header-aether"),

  powerAmount: $("#power-amount"),
  powerRate: $("#power-rate"),
  powerMultiplier: $("#power-multiplier"),
  generatorLevel: $("#generator-level"),
  generatorOutput: $("#generator-output"),
  generatorCost: $("#generator-cost"),
  generatorPreview: $("#generator-preview"),
  buyGeneratorButton: $("#buy-generator-button"),

  sparkCollectorLevel: $("#spark-collector-level"),
  sparkRate: $("#spark-rate"),
  sparkCollectorCost: $("#spark-collector-cost"),
  sparkCollectorPreview: $("#spark-collector-preview"),
  buySparkCollectorButton: $("#buy-spark-collector-button"),
  voltageLevel: $("#voltage-level"),
  voltageEffect: $("#voltage-effect"),
  voltageCost: $("#voltage-cost"),
  buyVoltageButton: $("#buy-voltage-button"),

  rebirthGain: $("#rebirth-gain"),
  rebirthButton: $("#rebirth-button"),
  rebirthRequirement: $("#rebirth-requirement"),
  rebirthPowerLevel: $("#rebirth-power-level"),
  rebirthPowerEffect: $("#rebirth-power-effect"),
  rebirthPowerCost: $("#rebirth-power-cost"),
  buyRebirthPowerButton: $("#buy-rebirth-power-button"),
  generatorMemoryLevel: $("#generator-memory-level"),
  generatorMemoryEffect: $("#generator-memory-effect"),
  generatorMemoryCost: $("#generator-memory-cost"),
  buyGeneratorMemoryButton: $("#buy-generator-memory-button"),

  prestigeGain: $("#prestige-gain"),
  prestigeButton: $("#prestige-button"),
  prestigeRequirement: $("#prestige-requirement"),

  soulsAmount: $("#souls-amount"),
  soulsRate: $("#souls-rate"),
  soulsPassiveEffect: $("#souls-passive-effect"),
  soulHarvesterLevel: $("#soul-harvester-level"),
  soulHarvesterEffect: $("#soul-harvester-effect"),
  soulHarvesterCost: $("#soul-harvester-cost"),
  buySoulHarvesterButton: $("#buy-soul-harvester-button"),
  soulPowerLevel: $("#soul-power-level"),
  soulPowerEffect: $("#soul-power-effect"),
  soulPowerCost: $("#soul-power-cost"),
  buySoulPowerButton: $("#buy-soul-power-button"),
  soulCatalystLevel: $("#soul-catalyst-level"),
  soulCatalystEffect: $("#soul-catalyst-effect"),
  soulCatalystCost: $("#soul-catalyst-cost"),
  buySoulCatalystButton: $("#buy-soul-catalyst-button"),

  aetherAmount: $("#aether-amount"),
  aetherRate: $("#aether-rate"),
  aetherPassiveEffect: $("#aether-passive-effect"),
  aetherCondenserLevel: $("#aether-condenser-level"),
  aetherCondenserEffect: $("#aether-condenser-effect"),
  aetherCondenserCost: $("#aether-condenser-cost"),
  buyAetherCondenserButton: $("#buy-aether-condenser-button"),
  celestialPowerLevel: $("#celestial-power-level"),
  celestialPowerEffect: $("#celestial-power-effect"),
  celestialPowerCost: $("#celestial-power-cost"),
  buyCelestialPowerButton: $("#buy-celestial-power-button"),
  skyResonanceLevel: $("#sky-resonance-level"),
  skyResonanceEffect: $("#sky-resonance-effect"),
  skyResonanceCost: $("#sky-resonance-cost"),
  buySkyResonanceButton: $("#buy-sky-resonance-button"),
  prestigePowerLevel: $("#prestige-power-level"),
  prestigePowerEffect: $("#prestige-power-effect"),
  prestigePowerCost: $("#prestige-power-cost"),
  buyPrestigePowerButton: $("#buy-prestige-power-button"),

  milestoneList: $("#milestone-list"),
  rebirthCount: $("#rebirth-count"),
  prestigeCount: $("#prestige-count"),
  sessionTime: $("#session-time"),
  achievementMultiplier: $("#achievement-multiplier"),
  notationSelect: $("#notation-select"),

  manualSaveButton: $("#manual-save-button"),
  exportSaveButton: $("#export-save-button"),
  importSaveButton: $("#import-save-button"),
  resetSaveButton: $("#reset-save-button"),
  resetDialog: $("#reset-dialog"),
  cancelResetButton: $("#cancel-reset-button"),
  confirmResetButton: $("#confirm-reset-button"),
  offlineDialog: $("#offline-dialog"),
  offlineResults: $("#offline-results"),
  closeOfflineDialog: $("#close-offline-dialog"),
  saveDataDialog: $("#save-data-dialog"),
  saveDataTitle: $("#save-data-title"),
  saveDataDescription: $("#save-data-description"),
  saveDataTextarea: $("#save-data-textarea"),
  saveDataError: $("#save-data-error"),
  closeSaveDataButton: $("#close-save-data-button"),
  applyImportButton: $("#apply-import-button"),
};

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function wholeNumber(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function hydrateState(raw = {}) {
  const fallback = defaultState();

  return {
    version: SAVE_VERSION,
    power: finiteNumber(raw.power),
    generatorLevel: wholeNumber(raw.generatorLevel),
    sparks: finiteNumber(raw.sparks),
    sparkCollectorLevel: wholeNumber(raw.sparkCollectorLevel),
    voltageLevel: wholeNumber(raw.voltageLevel),
    rebirthPoints: finiteNumber(raw.rebirthPoints),
    rebirthCount: wholeNumber(raw.rebirthCount),
    rebirthPowerLevel: wholeNumber(raw.rebirthPowerLevel),
    generatorMemoryLevel: wholeNumber(raw.generatorMemoryLevel),
    souls: finiteNumber(raw.souls),
    soulHarvesterLevel: wholeNumber(raw.soulHarvesterLevel),
    soulPowerLevel: wholeNumber(raw.soulPowerLevel),
    soulCatalystLevel: wholeNumber(raw.soulCatalystLevel),
    prestigePoints: finiteNumber(raw.prestigePoints),
    prestigeCount: wholeNumber(raw.prestigeCount),
    prestigePowerLevel: wholeNumber(raw.prestigePowerLevel),
    aether: finiteNumber(raw.aether),
    aetherCondenserLevel: wholeNumber(raw.aetherCondenserLevel),
    celestialPowerLevel: wholeNumber(raw.celestialPowerLevel),
    skyResonanceLevel: wholeNumber(raw.skyResonanceLevel),
    achievements: raw.achievements && typeof raw.achievements === "object" ? raw.achievements : {},
    settings: {
      notation: raw.settings?.notation === "scientific" ? "scientific" : fallback.settings.notation,
    },
    lastSavedAt: finiteNumber(raw.lastSavedAt, Date.now()),
  };
}

function underworldUnlocked() {
  return gameState.rebirthCount > 0 || gameState.prestigeCount > 0;
}

function skyUnlocked() {
  return gameState.prestigeCount > 0;
}

function getCost(type, level) {
  const config = COSTS[type];
  return Math.ceil(config.base * Math.pow(config.scale, level));
}

function getAchievementMultiplier() {
  return MILESTONES.reduce((total, milestone) => {
    return gameState.achievements[milestone.id] ? total * milestone.multiplier : total;
  }, 1);
}

function getSparkPassiveMultiplier() {
  return Math.max(1, 1 + Math.sqrt(gameState.sparks) / 10);
}

function getSoulPassiveMultiplier() {
  return Math.max(1, 1 + Math.log10(gameState.souls + 1));
}

function getAetherPassiveMultiplier() {
  return Math.max(1, 1 + Math.sqrt(gameState.aether));
}

function getPowerMultiplier() {
  const rebirthCountEffect = Math.pow(2, gameState.rebirthCount);
  const rebirthUpgradeEffect = Math.pow(3, gameState.rebirthPowerLevel);
  const prestigeCountEffect = Math.pow(100, gameState.prestigeCount);
  const prestigeUpgradeEffect = Math.pow(10, gameState.prestigePowerLevel);
  const voltageEffect = Math.pow(2, gameState.voltageLevel);
  const soulPowerEffect = Math.pow(3, gameState.soulPowerLevel);
  const celestialEffect = Math.pow(10, gameState.celestialPowerLevel);

  return (
    rebirthCountEffect *
    rebirthUpgradeEffect *
    prestigeCountEffect *
    prestigeUpgradeEffect *
    voltageEffect *
    soulPowerEffect *
    celestialEffect *
    getSparkPassiveMultiplier() *
    getSoulPassiveMultiplier() *
    getAetherPassiveMultiplier() *
    getAchievementMultiplier()
  );
}

function getBaseGeneratorOutput() {
  return 1 + gameState.generatorLevel + gameState.generatorMemoryLevel * 5;
}

function getPowerPerSecond() {
  return getBaseGeneratorOutput() * getPowerMultiplier();
}

function getGlobalCurrencyRateMultiplier() {
  return Math.pow(2, gameState.skyResonanceLevel);
}

function getSparkPerSecond() {
  return gameState.sparkCollectorLevel * (1 + gameState.prestigeCount) * getGlobalCurrencyRateMultiplier();
}

function getSoulPerSecond() {
  if (!underworldUnlocked()) return 0;

  return (
    0.25 *
    (1 + gameState.soulHarvesterLevel) *
    Math.max(1, gameState.rebirthCount + gameState.prestigeCount) *
    getGlobalCurrencyRateMultiplier()
  );
}

function getAetherPerSecond() {
  if (!skyUnlocked()) return 0;

  return (
    0.1 *
    (1 + gameState.aetherCondenserLevel) *
    Math.max(1, gameState.prestigeCount) *
    getGlobalCurrencyRateMultiplier()
  );
}

function getRebirthGain() {
  if (gameState.power < REBIRTH_REQUIREMENT) return 0;

  const baseGain = Math.pow(gameState.power / REBIRTH_REQUIREMENT, 0.35);
  return Math.max(1, Math.floor(baseGain * Math.pow(2, gameState.soulCatalystLevel)));
}

function getPrestigeGain() {
  if (gameState.power < PRESTIGE_REQUIREMENT) return 0;

  return Math.max(1, Math.floor(Math.pow(gameState.power / PRESTIGE_REQUIREMENT, 0.2)));
}

function getPurchaseQuote(level, currency, costType, mode = selectedBuyMode) {
  const targetAmount = mode === "max" ? 100000 : Number(mode);
  let amount = 0;
  let totalCost = 0;

  while (amount < targetAmount) {
    const nextCost = getCost(costType, level + amount);
    if (!Number.isFinite(nextCost) || totalCost + nextCost > currency) break;
    totalCost += nextCost;
    amount += 1;
  }

  return {
    amount,
    totalCost: amount > 0 ? totalCost : getCost(costType, level),
  };
}

function spendAndIncrease({ currencyKey, levelKey, costType, buttonName }) {
  const quote = getPurchaseQuote(gameState[levelKey], gameState[currencyKey], costType);
  if (quote.amount <= 0 || gameState[currencyKey] < quote.totalCost) return;

  gameState[currencyKey] -= quote.totalCost;
  gameState[levelKey] += quote.amount;
  showToast(`${buttonName}: +${formatNumber(quote.amount)} level${quote.amount === 1 ? "" : "s"}`);
  render(true);
}

function buySingleUpgrade(currencyKey, levelKey, costType, name) {
  const cost = getCost(costType, gameState[levelKey]);
  if (gameState[currencyKey] < cost) return;

  gameState[currencyKey] -= cost;
  gameState[levelKey] += 1;
  showToast(`${name} upgraded to level ${formatNumber(gameState[levelKey])}.`);
  render(true);
}

function performRebirth() {
  const gain = getRebirthGain();
  if (gain <= 0) return;

  gameState.rebirthPoints += gain;
  gameState.rebirthCount += 1;
  resetOverworldProgress();
  showToast(`Rebirth complete. Gained ${formatNumber(gain)} RP.`);
  switchLayer("underworld");
  render(true);
  saveGame(false);
}

function resetOverworldProgress() {
  gameState.power = 0;
  gameState.generatorLevel = 0;
  gameState.sparks = 0;
  gameState.sparkCollectorLevel = 0;
  gameState.voltageLevel = 0;
}

function performPrestige() {
  const gain = getPrestigeGain();
  if (gain <= 0) return;

  gameState.prestigePoints += gain;
  gameState.prestigeCount += 1;

  resetOverworldProgress();
  gameState.rebirthPoints = 0;
  gameState.rebirthCount = 0;
  gameState.rebirthPowerLevel = 0;
  gameState.generatorMemoryLevel = 0;
  gameState.souls = 0;
  gameState.soulHarvesterLevel = 0;
  gameState.soulPowerLevel = 0;
  gameState.soulCatalystLevel = 0;

  showToast(`Prestige complete. Gained ${formatNumber(gain)} PP.`);
  switchLayer("sky");
  render(true);
  saveGame(false);
}

function checkMilestones() {
  let unlockedSomething = false;

  MILESTONES.forEach((milestone) => {
    if (!gameState.achievements[milestone.id] && milestone.condition(gameState)) {
      gameState.achievements[milestone.id] = true;
      unlockedSomething = true;
      showToast(`Milestone unlocked: ${milestone.title}`);
    }
  });

  return unlockedSomething;
}

function processProduction(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  gameState.power += getPowerPerSecond() * seconds;
  gameState.sparks += getSparkPerSecond() * seconds;
  gameState.souls += getSoulPerSecond() * seconds;
  gameState.aether += getAetherPerSecond() * seconds;
}

function calculateOfflineProgress(seconds) {
  const creditedSeconds = Math.min(Math.max(seconds, 0), MAX_OFFLINE_SECONDS);
  const gains = {
    Power: getPowerPerSecond() * creditedSeconds,
    Sparks: getSparkPerSecond() * creditedSeconds,
    Souls: getSoulPerSecond() * creditedSeconds,
    Aether: getAetherPerSecond() * creditedSeconds,
  };

  gameState.power += gains.Power;
  gameState.sparks += gains.Sparks;
  gameState.souls += gains.Souls;
  gameState.aether += gains.Aether;

  return { creditedSeconds, gains };
}

function loadGame() {
  const rawSave = localStorage.getItem(SAVE_KEY);
  if (!rawSave) {
    gameState = defaultState();
    return null;
  }

  try {
    gameState = hydrateState(JSON.parse(rawSave));
    const elapsedSeconds = Math.max(0, (Date.now() - gameState.lastSavedAt) / 1000);
    const offline = calculateOfflineProgress(elapsedSeconds);
    gameState.lastSavedAt = Date.now();
    return offline;
  } catch (error) {
    console.error("The save file could not be loaded.", error);
    gameState = defaultState();
    return null;
  }
}

function saveGame(showStatus = true) {
  gameState.lastSavedAt = Date.now();

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    if (showStatus) flashSaveStatus("Saved");
  } catch (error) {
    console.error("The game could not be saved.", error);
    flashSaveStatus("Save failed");
  }
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  gameState = defaultState();
  selectedBuyMode = "1";
  activeLayer = "overworld";
  sessionStartedAt = Date.now();
  lastFrameTime = performance.now();
  updateBuyModeButtons();
  switchLayer("overworld");
  render(true);
  saveGame();
}

function updateGame(currentTime) {
  const elapsedSeconds = Math.min(Math.max((currentTime - lastFrameTime) / 1000, 0), 5);
  lastFrameTime = currentTime;

  processProduction(elapsedSeconds);
  checkMilestones();

  if (currentTime - lastRenderTime >= 100) {
    render();
    lastRenderTime = currentTime;
  }

  requestAnimationFrame(updateGame);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "∞";
  if (value === 0) return "0";

  if (gameState.settings.notation === "scientific" && Math.abs(value) >= 1e6) {
    return value.toExponential(2).replace("+", "");
  }

  if (Math.abs(value) < 1000) {
    const decimals = Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0;
    return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
  }

  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qn", "Sx", "Sp", "Oc", "No", "Dc"];
  const group = Math.floor(Math.log10(Math.abs(value)) / 3);

  if (group < suffixes.length) {
    const scaled = value / Math.pow(1000, group);
    const decimals = Math.abs(scaled) < 10 ? 2 : Math.abs(scaled) < 100 ? 1 : 0;
    return `${scaled.toFixed(decimals)} ${suffixes[group]}`;
  }

  return value.toExponential(2).replace("+", "");
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function renderMilestones() {
  elements.milestoneList.innerHTML = MILESTONES.map((milestone) => {
    const unlocked = Boolean(gameState.achievements[milestone.id]);
    return `
      <div class="milestone ${unlocked ? "unlocked" : ""}">
        <span class="milestone-icon">${unlocked ? "✓" : "·"}</span>
        <div>
          <strong>${milestone.title}</strong>
          <p>${milestone.description}</p>
        </div>
        <span>${milestone.reward}</span>
      </div>
    `;
  }).join("");
}

function render(force = false) {
  if (force) checkMilestones();

  const generatorQuote = getPurchaseQuote(gameState.generatorLevel, gameState.power, "generator");
  const sparkCollectorQuote = getPurchaseQuote(gameState.sparkCollectorLevel, gameState.power, "sparkCollector");
  const rebirthGain = getRebirthGain();
  const prestigeGain = getPrestigeGain();
  const underworldIsUnlocked = underworldUnlocked();
  const skyIsUnlocked = skyUnlocked();

  elements.headerPower.textContent = formatNumber(gameState.power);
  elements.headerSparks.textContent = formatNumber(gameState.sparks);
  elements.headerRebirthPoints.textContent = formatNumber(gameState.rebirthPoints);
  elements.headerSoulsChip.hidden = !underworldIsUnlocked;
  elements.headerSouls.textContent = formatNumber(gameState.souls);
  elements.headerPrestigePoints.textContent = formatNumber(gameState.prestigePoints);
  elements.headerAetherChip.hidden = !skyIsUnlocked;
  elements.headerAether.textContent = formatNumber(gameState.aether);

  elements.powerAmount.textContent = formatNumber(gameState.power);
  elements.powerRate.textContent = `+${formatNumber(getPowerPerSecond())} Power/s`;
  elements.powerMultiplier.textContent = `×${formatNumber(getPowerMultiplier())}`;
  elements.generatorLevel.textContent = `Level ${formatNumber(gameState.generatorLevel)}`;
  elements.generatorOutput.textContent = `+${formatNumber(gameState.generatorLevel)} base/s`;
  elements.generatorCost.textContent = `${formatNumber(getCost("generator", gameState.generatorLevel))} Power`;
  elements.generatorPreview.textContent = purchasePreview(generatorQuote, "Power", getCost("generator", gameState.generatorLevel));
  elements.buyGeneratorButton.disabled = generatorQuote.amount <= 0;

  elements.sparkCollectorLevel.textContent = `Level ${formatNumber(gameState.sparkCollectorLevel)}`;
  elements.sparkRate.textContent = `+${formatNumber(getSparkPerSecond())}/s`;
  elements.sparkCollectorCost.textContent = `${formatNumber(getCost("sparkCollector", gameState.sparkCollectorLevel))} Power`;
  elements.sparkCollectorPreview.textContent = purchasePreview(sparkCollectorQuote, "Power", getCost("sparkCollector", gameState.sparkCollectorLevel));
  elements.buySparkCollectorButton.disabled = sparkCollectorQuote.amount <= 0;
  elements.voltageLevel.textContent = `Level ${formatNumber(gameState.voltageLevel)}`;
  elements.voltageEffect.textContent = `×${formatNumber(Math.pow(2, gameState.voltageLevel))} Power`;
  elements.voltageCost.textContent = `Cost: ${formatNumber(getCost("voltage", gameState.voltageLevel))} Sparks`;
  elements.buyVoltageButton.disabled = gameState.sparks < getCost("voltage", gameState.voltageLevel);

  elements.rebirthGain.textContent = formatNumber(rebirthGain);
  elements.rebirthButton.disabled = rebirthGain <= 0;
  elements.rebirthRequirement.textContent = rebirthGain > 0
    ? `Reset now for ${formatNumber(rebirthGain)} RP.`
    : `Reach 1 K Power to Rebirth.`;
  elements.rebirthPowerLevel.textContent = `Level ${formatNumber(gameState.rebirthPowerLevel)}`;
  elements.rebirthPowerEffect.textContent = `×${formatNumber(Math.pow(3, gameState.rebirthPowerLevel))} Power`;
  elements.rebirthPowerCost.textContent = `Cost: ${formatNumber(getCost("rebirthPower", gameState.rebirthPowerLevel))} RP`;
  elements.buyRebirthPowerButton.disabled = gameState.rebirthPoints < getCost("rebirthPower", gameState.rebirthPowerLevel);
  elements.generatorMemoryLevel.textContent = `Level ${formatNumber(gameState.generatorMemoryLevel)}`;
  elements.generatorMemoryEffect.textContent = `+${formatNumber(gameState.generatorMemoryLevel * 5)} base levels`;
  elements.generatorMemoryCost.textContent = `Cost: ${formatNumber(getCost("generatorMemory", gameState.generatorMemoryLevel))} RP`;
  elements.buyGeneratorMemoryButton.disabled = gameState.rebirthPoints < getCost("generatorMemory", gameState.generatorMemoryLevel);

  elements.prestigeGain.textContent = formatNumber(prestigeGain);
  elements.prestigeButton.disabled = prestigeGain <= 0;
  elements.prestigeRequirement.textContent = prestigeGain > 0
    ? `Reset now for ${formatNumber(prestigeGain)} PP.`
    : `Reach 1 Qn Power.`;

  elements.underworldNav.disabled = !underworldIsUnlocked;
  elements.underworldNav.classList.toggle("locked", !underworldIsUnlocked);
  elements.skyNav.disabled = !skyIsUnlocked;
  elements.skyNav.classList.toggle("locked", !skyIsUnlocked);

  elements.soulsAmount.textContent = formatNumber(gameState.souls);
  elements.soulsRate.textContent = `+${formatNumber(getSoulPerSecond())} Souls/s`;
  elements.soulsPassiveEffect.textContent = `×${formatNumber(getSoulPassiveMultiplier())}`;
  elements.soulHarvesterLevel.textContent = `Lv. ${formatNumber(gameState.soulHarvesterLevel)}`;
  elements.soulHarvesterEffect.textContent = `+${formatNumber(getSoulPerSecond())} Souls/s`;
  elements.soulHarvesterCost.textContent = `Cost: ${formatNumber(getCost("soulHarvester", gameState.soulHarvesterLevel))} Souls`;
  elements.buySoulHarvesterButton.disabled = gameState.souls < getCost("soulHarvester", gameState.soulHarvesterLevel);
  elements.soulPowerLevel.textContent = `Lv. ${formatNumber(gameState.soulPowerLevel)}`;
  elements.soulPowerEffect.textContent = `×${formatNumber(Math.pow(3, gameState.soulPowerLevel))} Power`;
  elements.soulPowerCost.textContent = `Cost: ${formatNumber(getCost("soulPower", gameState.soulPowerLevel))} Souls`;
  elements.buySoulPowerButton.disabled = gameState.souls < getCost("soulPower", gameState.soulPowerLevel);
  elements.soulCatalystLevel.textContent = `Lv. ${formatNumber(gameState.soulCatalystLevel)}`;
  elements.soulCatalystEffect.textContent = `×${formatNumber(Math.pow(2, gameState.soulCatalystLevel))} RP`;
  elements.soulCatalystCost.textContent = `Cost: ${formatNumber(getCost("soulCatalyst", gameState.soulCatalystLevel))} Souls`;
  elements.buySoulCatalystButton.disabled = gameState.souls < getCost("soulCatalyst", gameState.soulCatalystLevel);

  elements.aetherAmount.textContent = formatNumber(gameState.aether);
  elements.aetherRate.textContent = `+${formatNumber(getAetherPerSecond())} Aether/s`;
  elements.aetherPassiveEffect.textContent = `×${formatNumber(getAetherPassiveMultiplier())}`;
  elements.aetherCondenserLevel.textContent = `Lv. ${formatNumber(gameState.aetherCondenserLevel)}`;
  elements.aetherCondenserEffect.textContent = `+${formatNumber(getAetherPerSecond())} Aether/s`;
  elements.aetherCondenserCost.textContent = `Cost: ${formatNumber(getCost("aetherCondenser", gameState.aetherCondenserLevel))} Aether`;
  elements.buyAetherCondenserButton.disabled = gameState.aether < getCost("aetherCondenser", gameState.aetherCondenserLevel);
  elements.celestialPowerLevel.textContent = `Lv. ${formatNumber(gameState.celestialPowerLevel)}`;
  elements.celestialPowerEffect.textContent = `×${formatNumber(Math.pow(10, gameState.celestialPowerLevel))} Power`;
  elements.celestialPowerCost.textContent = `Cost: ${formatNumber(getCost("celestialPower", gameState.celestialPowerLevel))} Aether`;
  elements.buyCelestialPowerButton.disabled = gameState.aether < getCost("celestialPower", gameState.celestialPowerLevel);
  elements.skyResonanceLevel.textContent = `Lv. ${formatNumber(gameState.skyResonanceLevel)}`;
  elements.skyResonanceEffect.textContent = `×${formatNumber(getGlobalCurrencyRateMultiplier())} currencies`;
  elements.skyResonanceCost.textContent = `Cost: ${formatNumber(getCost("skyResonance", gameState.skyResonanceLevel))} Aether`;
  elements.buySkyResonanceButton.disabled = gameState.aether < getCost("skyResonance", gameState.skyResonanceLevel);
  elements.prestigePowerLevel.textContent = `Level ${formatNumber(gameState.prestigePowerLevel)}`;
  elements.prestigePowerEffect.textContent = `×${formatNumber(Math.pow(10, gameState.prestigePowerLevel))} Power`;
  elements.prestigePowerCost.textContent = `Cost: ${formatNumber(getCost("prestigePower", gameState.prestigePowerLevel))} PP`;
  elements.buyPrestigePowerButton.disabled = gameState.prestigePoints < getCost("prestigePower", gameState.prestigePowerLevel);

  elements.rebirthCount.textContent = formatNumber(gameState.rebirthCount);
  elements.prestigeCount.textContent = formatNumber(gameState.prestigeCount);
  elements.sessionTime.textContent = formatDuration((Date.now() - sessionStartedAt) / 1000);
  elements.achievementMultiplier.textContent = `×${formatNumber(getAchievementMultiplier())}`;
  elements.notationSelect.value = gameState.settings.notation;

  renderMilestones();
}

function purchasePreview(quote, currencyName, nextCost) {
  if (quote.amount <= 0) return `Need ${formatNumber(nextCost)} ${currencyName} for the next level.`;
  return `Buy ${formatNumber(quote.amount)} level${quote.amount === 1 ? "" : "s"} for ${formatNumber(quote.totalCost)} ${currencyName}.`;
}

function switchLayer(layer) {
  if (layer === "underworld" && !underworldUnlocked()) return;
  if (layer === "sky" && !skyUnlocked()) return;

  activeLayer = layer;
  elements.navButtons.forEach((button) => {
    const isActive = button.dataset.layer === layer;
    button.classList.toggle("active", isActive);
    if (isActive) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  elements.layerViews.forEach((view) => {
    const isActive = view.dataset.layerView === layer;
    view.hidden = !isActive;
    view.classList.toggle("active", isActive);
  });
}

function updateBuyModeButtons() {
  elements.buyModes.forEach((button) => {
    button.classList.toggle("active", button.dataset.buyMode === selectedBuyMode);
  });
}

function flashSaveStatus(message) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.add("visible");
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => elements.saveStatus.classList.remove("visible"), 1300);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2200);
}

function showOfflineDialog(offline) {
  if (!offline || offline.creditedSeconds < 1) return;

  const visibleGains = Object.entries(offline.gains).filter(([, amount]) => amount > 0.01);
  if (visibleGains.length === 0) return;

  elements.offlineResults.innerHTML = `
    <div class="offline-result"><span>Time credited</span><strong>${formatDuration(offline.creditedSeconds)}</strong></div>
    ${visibleGains.map(([name, amount]) => `
      <div class="offline-result"><span>${name}</span><strong>+${formatNumber(amount)}</strong></div>
    `).join("")}
  `;
  elements.offlineDialog.showModal();
}

function encodeSave(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeSave(encoded) {
  const binary = atob(encoded.trim());
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function openExportDialog() {
  saveGame(false);
  elements.saveDataTitle.textContent = "Export save";
  elements.saveDataDescription.textContent = "Copy this text and store it somewhere safe.";
  elements.saveDataTextarea.value = encodeSave(gameState);
  elements.saveDataTextarea.readOnly = true;
  elements.applyImportButton.hidden = true;
  elements.saveDataError.textContent = "";
  elements.saveDataDialog.showModal();
  elements.saveDataTextarea.select();
}

function openImportDialog() {
  elements.saveDataTitle.textContent = "Import save";
  elements.saveDataDescription.textContent = "Paste an exported save below. Importing replaces the current save.";
  elements.saveDataTextarea.value = "";
  elements.saveDataTextarea.readOnly = false;
  elements.applyImportButton.hidden = false;
  elements.saveDataError.textContent = "";
  elements.saveDataDialog.showModal();
  elements.saveDataTextarea.focus();
}

function applyImport() {
  try {
    gameState = hydrateState(decodeSave(elements.saveDataTextarea.value));
    gameState.lastSavedAt = Date.now();
    saveGame(false);
    elements.saveDataDialog.close();
    switchLayer("overworld");
    render(true);
    showToast("Save imported successfully.");
  } catch (error) {
    console.error("Import failed.", error);
    elements.saveDataError.textContent = "Invalid save data. Check that the full export text was pasted.";
  }
}

function initializeEvents() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => switchLayer(button.dataset.layer));
  });

  elements.buyModes.forEach((button) => {
    button.addEventListener("click", () => {
      selectedBuyMode = button.dataset.buyMode;
      updateBuyModeButtons();
      render(true);
    });
  });

  elements.buyGeneratorButton.addEventListener("click", () => spendAndIncrease({
    currencyKey: "power", levelKey: "generatorLevel", costType: "generator", buttonName: "Power Generator",
  }));
  elements.buySparkCollectorButton.addEventListener("click", () => spendAndIncrease({
    currencyKey: "power", levelKey: "sparkCollectorLevel", costType: "sparkCollector", buttonName: "Spark Collector",
  }));
  elements.buyVoltageButton.addEventListener("click", () => buySingleUpgrade("sparks", "voltageLevel", "voltage", "Voltage"));
  elements.rebirthButton.addEventListener("click", performRebirth);
  elements.buyRebirthPowerButton.addEventListener("click", () => buySingleUpgrade("rebirthPoints", "rebirthPowerLevel", "rebirthPower", "Rebirth Power"));
  elements.buyGeneratorMemoryButton.addEventListener("click", () => buySingleUpgrade("rebirthPoints", "generatorMemoryLevel", "generatorMemory", "Generator Memory"));
  elements.prestigeButton.addEventListener("click", performPrestige);

  elements.buySoulHarvesterButton.addEventListener("click", () => buySingleUpgrade("souls", "soulHarvesterLevel", "soulHarvester", "Soul Harvester"));
  elements.buySoulPowerButton.addEventListener("click", () => buySingleUpgrade("souls", "soulPowerLevel", "soulPower", "Tormented Power"));
  elements.buySoulCatalystButton.addEventListener("click", () => buySingleUpgrade("souls", "soulCatalystLevel", "soulCatalyst", "Dark Catalyst"));

  elements.buyAetherCondenserButton.addEventListener("click", () => buySingleUpgrade("aether", "aetherCondenserLevel", "aetherCondenser", "Aether Condenser"));
  elements.buyCelestialPowerButton.addEventListener("click", () => buySingleUpgrade("aether", "celestialPowerLevel", "celestialPower", "Celestial Power"));
  elements.buySkyResonanceButton.addEventListener("click", () => buySingleUpgrade("aether", "skyResonanceLevel", "skyResonance", "Sky Resonance"));
  elements.buyPrestigePowerButton.addEventListener("click", () => buySingleUpgrade("prestigePoints", "prestigePowerLevel", "prestigePower", "Cosmic Amplifier"));

  elements.notationSelect.addEventListener("change", () => {
    gameState.settings.notation = elements.notationSelect.value === "scientific" ? "scientific" : "standard";
    render(true);
    saveGame(false);
  });

  elements.manualSaveButton.addEventListener("click", () => saveGame());
  elements.exportSaveButton.addEventListener("click", openExportDialog);
  elements.importSaveButton.addEventListener("click", openImportDialog);
  elements.resetSaveButton.addEventListener("click", () => elements.resetDialog.showModal());
  elements.cancelResetButton.addEventListener("click", () => elements.resetDialog.close());
  elements.confirmResetButton.addEventListener("click", () => {
    elements.resetDialog.close();
    resetGame();
  });

  elements.closeOfflineDialog.addEventListener("click", () => elements.offlineDialog.close());
  elements.closeSaveDataButton.addEventListener("click", () => elements.saveDataDialog.close());
  elements.applyImportButton.addEventListener("click", applyImport);

  [elements.resetDialog, elements.offlineDialog, elements.saveDataDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveGame(false);
      return;
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - gameState.lastSavedAt) / 1000);
    const offline = calculateOfflineProgress(elapsedSeconds);
    gameState.lastSavedAt = now;
    lastFrameTime = performance.now();
    render(true);
    if (elapsedSeconds >= 5) showOfflineDialog(offline);
  });

  window.addEventListener("beforeunload", () => saveGame(false));
}

function initializeGame() {
  initializeEvents();
  const offline = loadGame();
  checkMilestones();
  updateBuyModeButtons();
  switchLayer("overworld");
  render(true);

  setInterval(() => {
    if (document.visibilityState === "visible") saveGame();
  }, AUTOSAVE_INTERVAL_MS);

  requestAnimationFrame(updateGame);
  showOfflineDialog(offline);
}

initializeGame();
