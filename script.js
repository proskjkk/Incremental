"use strict";

const SAVE_KEY = "the-world-incremental-save";
const SAVE_VERSION = 1;
const AUTOSAVE_INTERVAL_MS = 5000;
const MAX_OFFLINE_SECONDS = 28 * 24 * 60 * 60;
const BASE_POWER_PER_SECOND = 1;
const GENERATOR_BASE_COST = 10;
const GENERATOR_COST_SCALE = 1.15;

const defaultState = () => ({
  version: SAVE_VERSION,
  power: 0,
  totalPowerEarned: 0,
  generatorLevel: 0,
  totalGeneratorsBought: 0,
  lastSavedAt: Date.now(),
});

let gameState = defaultState();
let selectedBuyMode = "1";
let lastFrameTime = performance.now();
let sessionStartedAt = Date.now();
let autosaveTimer = null;
let saveStatusTimer = null;

const elements = {
  powerAmount: document.querySelector("#power-amount"),
  powerRate: document.querySelector("#power-rate"),
  generatorLevel: document.querySelector("#generator-level"),
  generatorOutput: document.querySelector("#generator-output"),
  generatorCost: document.querySelector("#generator-cost"),
  buyGeneratorButton: document.querySelector("#buy-generator-button"),
  purchasePreview: document.querySelector("#purchase-preview"),
  totalPowerEarned: document.querySelector("#total-power-earned"),
  totalGeneratorsBought: document.querySelector("#total-generators-bought"),
  sessionTime: document.querySelector("#session-time"),
  saveStatus: document.querySelector("#save-status"),
  resetSaveButton: document.querySelector("#reset-save-button"),
  resetDialog: document.querySelector("#reset-dialog"),
  cancelResetButton: document.querySelector("#cancel-reset-button"),
  confirmResetButton: document.querySelector("#confirm-reset-button"),
  offlineDialog: document.querySelector("#offline-dialog"),
  offlineMessage: document.querySelector("#offline-message"),
  closeOfflineDialog: document.querySelector("#close-offline-dialog"),
  purchaseModes: document.querySelectorAll("[data-buy-mode]"),
};

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sanitizeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function loadGame() {
  const rawSave = localStorage.getItem(SAVE_KEY);

  if (!rawSave) {
    gameState = defaultState();
    return 0;
  }

  try {
    const parsed = JSON.parse(rawSave);

    gameState = {
      version: SAVE_VERSION,
      power: sanitizeNumber(parsed.power),
      totalPowerEarned: sanitizeNumber(parsed.totalPowerEarned),
      generatorLevel: sanitizeInteger(parsed.generatorLevel),
      totalGeneratorsBought: sanitizeInteger(parsed.totalGeneratorsBought),
      lastSavedAt: sanitizeNumber(parsed.lastSavedAt, Date.now()),
    };

    const elapsedSeconds = Math.max(0, (Date.now() - gameState.lastSavedAt) / 1000);
    const creditedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
    const offlineGain = getPowerPerSecond() * creditedSeconds;

    if (offlineGain > 0.01) {
      addPower(offlineGain);
    }

    gameState.lastSavedAt = Date.now();
    return offlineGain;
  } catch (error) {
    console.error("The save file could not be loaded.", error);
    gameState = defaultState();
    return 0;
  }
}

function saveGame(showStatus = true) {
  gameState.lastSavedAt = Date.now();

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));

    if (showStatus) {
      flashSaveStatus("Saved");
    }
  } catch (error) {
    console.error("The game could not be saved.", error);
    flashSaveStatus("Save failed");
  }
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  gameState = defaultState();
  selectedBuyMode = "1";
  sessionStartedAt = Date.now();
  lastFrameTime = performance.now();

  updatePurchaseModeButtons();
  render();
  saveGame();
}

function getPowerPerSecond() {
  return BASE_POWER_PER_SECOND + gameState.generatorLevel;
}

function getGeneratorOutput() {
  return gameState.generatorLevel;
}

function getGeneratorCostAtLevel(level) {
  return Math.ceil(GENERATOR_BASE_COST * Math.pow(GENERATOR_COST_SCALE, level));
}

function getPurchaseQuote(mode) {
  if (mode === "max") {
    return getMaxAffordablePurchase();
  }

  const requestedAmount = Number(mode);
  let totalCost = 0;
  let amount = 0;

  for (let index = 0; index < requestedAmount; index += 1) {
    const cost = getGeneratorCostAtLevel(gameState.generatorLevel + index);

    if (totalCost + cost > gameState.power) {
      break;
    }

    totalCost += cost;
    amount += 1;
  }

  if (amount === 0) {
    totalCost = getGeneratorCostAtLevel(gameState.generatorLevel);
  }

  return {
    amount,
    totalCost,
    requestedAmount,
  };
}

function getMaxAffordablePurchase() {
  let remainingPower = gameState.power;
  let level = gameState.generatorLevel;
  let totalCost = 0;
  let amount = 0;

  while (amount < 100000) {
    const cost = getGeneratorCostAtLevel(level);

    if (!Number.isFinite(cost) || cost > remainingPower) {
      break;
    }

    remainingPower -= cost;
    totalCost += cost;
    level += 1;
    amount += 1;
  }

  return {
    amount,
    totalCost,
    requestedAmount: amount,
  };
}

function buyGenerator() {
  const quote = getPurchaseQuote(selectedBuyMode);

  if (quote.amount <= 0 || quote.totalCost > gameState.power) {
    return;
  }

  gameState.power -= quote.totalCost;
  gameState.generatorLevel += quote.amount;
  gameState.totalGeneratorsBought += quote.amount;

  render();
}

function addPower(amount) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  gameState.power += amount;
  gameState.totalPowerEarned += amount;
}

function updateGame(currentTime) {
  const elapsedSeconds = Math.min(Math.max((currentTime - lastFrameTime) / 1000, 0), 5);
  lastFrameTime = currentTime;

  addPower(getPowerPerSecond() * elapsedSeconds);
  render();

  requestAnimationFrame(updateGame);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "∞";
  }

  if (value < 1000) {
    const decimals = value < 10 ? 2 : value < 100 ? 1 : 0;
    return value.toLocaleString("en-US", {
      maximumFractionDigits: decimals,
    });
  }

  if (value < 1e6) {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 0,
    });
  }

  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No"];
  const exponentGroup = Math.floor(Math.log10(value) / 3);

  if (exponentGroup < suffixes.length) {
    const scaled = value / Math.pow(1000, exponentGroup);
    const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    return `${scaled.toFixed(decimals)} ${suffixes[exponentGroup]}`;
  }

  return value.toExponential(2).replace("+", "");
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function render() {
  const powerPerSecond = getPowerPerSecond();
  const nextGeneratorCost = getGeneratorCostAtLevel(gameState.generatorLevel);
  const quote = getPurchaseQuote(selectedBuyMode);
  const canAfford = quote.amount > 0 && quote.totalCost <= gameState.power;
  const sessionSeconds = (Date.now() - sessionStartedAt) / 1000;

  elements.powerAmount.textContent = formatNumber(gameState.power);
  elements.powerRate.textContent = `+${formatNumber(powerPerSecond)} Power/s`;
  elements.generatorLevel.textContent = `Level ${formatNumber(gameState.generatorLevel)}`;
  elements.generatorOutput.textContent = `+${formatNumber(getGeneratorOutput())} Power/s`;
  elements.generatorCost.textContent = `${formatNumber(nextGeneratorCost)} Power`;
  elements.totalPowerEarned.textContent = formatNumber(gameState.totalPowerEarned);
  elements.totalGeneratorsBought.textContent = formatNumber(gameState.totalGeneratorsBought);
  elements.sessionTime.textContent = formatDuration(sessionSeconds);

  elements.buyGeneratorButton.disabled = !canAfford;

  if (selectedBuyMode === "max") {
    elements.purchasePreview.textContent = canAfford
      ? `Purchase ${formatNumber(quote.amount)} levels for ${formatNumber(quote.totalCost)} Power.`
      : `You need ${formatNumber(nextGeneratorCost)} Power for the next level.`;
  } else {
    const requested = Number(selectedBuyMode);
    elements.purchasePreview.textContent = canAfford
      ? `Purchase ${formatNumber(quote.amount)} of ${requested} levels for ${formatNumber(quote.totalCost)} Power.`
      : `You need ${formatNumber(nextGeneratorCost)} Power for the next level.`;
  }
}

function updatePurchaseModeButtons() {
  elements.purchaseModes.forEach((button) => {
    button.classList.toggle("active", button.dataset.buyMode === selectedBuyMode);
  });
}

function flashSaveStatus(message) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.add("visible");

  window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    elements.saveStatus.classList.remove("visible");
  }, 1200);
}

function showOfflineDialog(offlineGain) {
  if (offlineGain <= 0.01) {
    return;
  }

  const elapsedSeconds = Math.min(
    Math.max(0, (Date.now() - gameState.lastSavedAt) / 1000),
    MAX_OFFLINE_SECONDS,
  );

  elements.offlineMessage.textContent = `You generated ${formatNumber(offlineGain)} Power while away.`;
  elements.offlineDialog.showModal();
}

function initializeEvents() {
  elements.buyGeneratorButton.addEventListener("click", buyGenerator);

  elements.purchaseModes.forEach((button) => {
    button.addEventListener("click", () => {
      selectedBuyMode = button.dataset.buyMode;
      updatePurchaseModeButtons();
      render();
    });
  });

  elements.resetSaveButton.addEventListener("click", () => {
    elements.resetDialog.showModal();
  });

  elements.cancelResetButton.addEventListener("click", () => {
    elements.resetDialog.close();
  });

  elements.confirmResetButton.addEventListener("click", () => {
    elements.resetDialog.close();
    resetGame();
  });

  elements.closeOfflineDialog.addEventListener("click", () => {
    elements.offlineDialog.close();
  });

  elements.resetDialog.addEventListener("click", (event) => {
    if (event.target === elements.resetDialog) {
      elements.resetDialog.close();
    }
  });

  elements.offlineDialog.addEventListener("click", (event) => {
    if (event.target === elements.offlineDialog) {
      elements.offlineDialog.close();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveGame(false);
      return;
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - gameState.lastSavedAt) / 1000);
    const creditedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
    const gainedPower = getPowerPerSecond() * creditedSeconds;

    addPower(gainedPower);
    gameState.lastSavedAt = now;
    lastFrameTime = performance.now();
    render();
  });

  window.addEventListener("beforeunload", () => {
    saveGame(false);
  });
}

function initializeGame() {
  initializeEvents();
  const offlineGain = loadGame();

  updatePurchaseModeButtons();
  render();

  autosaveTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") {
      saveGame();
    }
  }, AUTOSAVE_INTERVAL_MS);

  requestAnimationFrame(updateGame);

  if (offlineGain > 0.01) {
    elements.offlineMessage.textContent = `You generated ${formatNumber(offlineGain)} Power while away.`;
    elements.offlineDialog.showModal();
  }
}

initializeGame();
