// background.js - Robust Alarm-Based Batch Processing

const INITIAL_STATE = {
  isScanning: false,
  mode: 'current', 
  urlsToProcess: [],
  results: [],
  processedCount: 0,
  currentBatchIndex: 0,
  batchTabIds: [],      // Store IDs of tabs currently open
  settings: { disableImages: false },
  statusMessage: "Ready.",
  nextActionTime: null  // For UI Countdown
};

// --- Event Listeners ---

// 1. Message Handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_SCAN') {
    startScan(request.payload).then(() => sendResponse({ status: 'started' }));
    return true;
  } 
  else if (request.action === 'STOP_SCAN') {
    stopScan().then(() => sendResponse({ status: 'stopped' }));
    return true;
  }
});

// 2. Alarm Handling (The Engine)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const data = await chrome.storage.local.get('auditState');
  const state = data.auditState;

  if (!state || !state.isScanning) return;

  if (alarm.name === 'BATCH_OPEN') {
    await openBatchTabs(state);
  } 
  else if (alarm.name === 'BATCH_EXTRACT') {
    await extractBatchData(state);
  }
});

// --- Core Functions ---

async function startScan(payload) {
  const { urls, mode, settings } = payload;
  
  const newState = {
    ...INITIAL_STATE,
    isScanning: true,
    mode,
    urlsToProcess: urls,
    settings,
    statusMessage: "Initializing..."
  };

  await chrome.storage.local.set({ auditState: newState });

  if (settings.disableImages) {
    await chrome.contentSettings.images.set({
      primaryPattern: '*://*.amazon.com/*',
      setting: 'block'
    });
  }

  // Trigger first batch immediately (or with tiny delay to allow UI update)
  createAlarm('BATCH_OPEN', 100); 
}

async function stopScan() {
  // 1. Clear Alarms
  await chrome.alarms.clearAll();

  // 2. Load State to close tabs
  const data = await chrome.storage.local.get('auditState');
  const state = data.auditState;

  if (state) {
    // Close any tabs that were left open
    if (state.batchTabIds && state.batchTabIds.length > 0) {
      try { await chrome.tabs.remove(state.batchTabIds); } catch(e) {}
    }
    
    state.isScanning = false;
    state.statusMessage = "Stopped by user.";
    state.batchTabIds = [];
    state.nextActionTime = null;
    await chrome.storage.local.set({ auditState: state });
  }

  // 3. Reset Settings
  await chrome.contentSettings.images.set({
    primaryPattern: '*://*.amazon.com/*',
    setting: 'allow'
  });
}

// Phase 1: Open Tabs
async function openBatchTabs(state) {
  const total = state.urlsToProcess.length;
  
  if (state.processedCount >= total) {
    await finishScan(state);
    return;
  }

  // 1. Determine Batch Size
  let currentBatchSize = getRandomDivisible(10, 30, 5); // Max 30 as requested
  if (state.processedCount + currentBatchSize > total) {
    currentBatchSize = total - state.processedCount;
  }

  // 2. Update State
  const batchUrls = state.urlsToProcess.slice(state.processedCount, state.processedCount + currentBatchSize);
  
  // Set time for UI countdown (5 seconds load time)
  const extractionTime = Date.now() + 5000;
  
  state.statusMessage = `Opening batch #${state.currentBatchIndex + 1} (${currentBatchSize} tabs)... Waiting for load.`;
  state.nextActionTime = extractionTime; 
  await chrome.storage.local.set({ auditState: state });

  // 3. Open Tabs
  const tabIds = [];
  for (const url of batchUrls) {
    try {
      const tab = await chrome.tabs.create({ url: url, active: false });
      tabIds.push(tab.id);
    } catch(e) { console.error(e); }
  }

  // 4. Save IDs so we can find them later
  state.batchTabIds = tabIds;
  await chrome.storage.local.set({ auditState: state });

  // 5. Schedule Extraction (The "Wait" phase)
  // We set an alarm for 5 seconds. The SW can die now; the alarm will wake it up.
  createAlarm('BATCH_EXTRACT', 5000); 
}

// Phase 2: Extract & Close
async function extractBatchData(state) {
  state.statusMessage = "Extracting data...";
  state.nextActionTime = null;
  await chrome.storage.local.set({ auditState: state });

  const tabIds = state.batchTabIds || [];
  const results = [];

  // 1. Run Scripts
  const scriptPromises = tabIds.map(tabId => extractFromTab(tabId));
  const batchResults = await Promise.all(scriptPromises);
  
  // Filter valid results
  batchResults.forEach(res => {
    if (res && (res.found || res.error)) results.push(res);
  });

  // 2. Close Tabs
  if (tabIds.length > 0) {
    try { await chrome.tabs.remove(tabIds); } catch(e) {}
  }

  // 3. Update State
  state.results.push(...results);
  state.processedCount += results.length; // Or batchUrls.length if we want to count failures
  state.currentBatchIndex++;
  state.batchTabIds = []; // Clear current batch

  // 4. Check if Done or Schedule Next
  const total = state.urlsToProcess.length;
  if (state.processedCount < total) {
    // Schedule Cool Down
    const delaySeconds = getRandomDivisible(5, 30, 5); // 5 to 60s cool down
    const nextRunTime = Date.now() + (delaySeconds * 1000);

    state.statusMessage = `Cooling down for ${delaySeconds}s...`;
    state.nextActionTime = nextRunTime;
    await chrome.storage.local.set({ auditState: state });

    createAlarm('BATCH_OPEN', delaySeconds * 1000);
  } else {
    await finishScan(state);
  }
}

async function finishScan(state) {
  state.isScanning = false;
  state.statusMessage = "Scan complete.";
  state.nextActionTime = null;
  await chrome.storage.local.set({ auditState: state });

  if (state.settings.disableImages) {
    await chrome.contentSettings.images.set({
      primaryPattern: '*://*.amazon.com/*',
      setting: 'allow'
    });
  }
}

// --- Helpers ---

function createAlarm(name, delayMs) {
  // Use 'when' for precise absolute time triggering
  chrome.alarms.create(name, { when: Date.now() + delayMs });
}

async function extractFromTab(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    if (result && result.result) {
      return { tabId, ...result.result };
    }
  } catch (err) {
    // Tab might have failed to load or closed
    return { error: " extraction_failed", tabId };
  }
  return null;
}

function getRandomDivisible(min, max, step) {
  const steps = Math.floor((max - min) / step);
  const randomStep = Math.floor(Math.random() * (steps + 1));
  return min + (randomStep * step);
}
