// background.js - Robust Alarm-Based Batch Processing

const INITIAL_STATE = {
  isScanning: false,
  mode: 'current', 
  urlsToProcess: [],
  results: [],
  processedCount: 0,
  currentBatchIndex: 0,
  batchTabIds: [],      
  settings: { disableImages: false },
  statusMessage: "Ready.",
  nextActionTime: null 
};

// --- Event Listeners ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_SCAN') {
    startScan(request.payload).then(() => sendResponse({ status: 'started' }));
    return true;
  } 
  else if (request.action === 'STOP_SCAN') {
    stopScan().then(() => sendResponse({ status: 'stopped' }));
    return true;
  }
  else if (request.action === 'CLEAR_DATA') {
    clearData().then(() => sendResponse({ status: 'cleared' }));
    return true;
  }
});

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

  createAlarm('BATCH_OPEN', 100); 
}

async function stopScan() {
  await chrome.alarms.clearAll();

  const data = await chrome.storage.local.get('auditState');
  const state = data.auditState;

  if (state) {
    if (state.batchTabIds && state.batchTabIds.length > 0) {
      const validIds = state.batchTabIds.filter(id => id !== null);
      if (validIds.length > 0) {
        try { await chrome.tabs.remove(validIds); } catch(e) {}
      }
    }
    
    state.isScanning = false;
    state.statusMessage = "Stopped by user.";
    state.batchTabIds = [];
    state.nextActionTime = null;
    await chrome.storage.local.set({ auditState: state });
  }

  await chrome.contentSettings.images.set({
    primaryPattern: '*://*.amazon.com/*',
    setting: 'allow'
  });
}

async function clearData() {
  const data = await chrome.storage.local.get('auditState');
  let currentState = data.auditState || { ...INITIAL_STATE };

  const clearedState = {
    ...currentState,
    isScanning: false,
    urlsToProcess: [],
    results: [],
    processedCount: 0,
    currentBatchIndex: 0,
    batchTabIds: [],
    statusMessage: "Results cleared. Ready.",
    nextActionTime: null
  };

  await chrome.storage.local.set({ auditState: clearedState });
}

async function openBatchTabs(state) {
  const total = state.urlsToProcess.length;
  
  if (state.processedCount >= total) {
    await finishScan(state);
    return;
  }

  let currentBatchSize = getRandomDivisible(10, 30, 5); 
  if (state.processedCount + currentBatchSize > total) {
    currentBatchSize = total - state.processedCount;
  }

  const batchItems = state.urlsToProcess.slice(state.processedCount, state.processedCount + currentBatchSize);
  const extractionTime = Date.now() + 5000;
  
  state.statusMessage = `Opening batch #${state.currentBatchIndex + 1} (${currentBatchSize} tabs)... Waiting for load.`;
  state.nextActionTime = extractionTime; 
  await chrome.storage.local.set({ auditState: state });

  const tabPromises = batchItems.map(async (item) => {
    try {
      const url = item.url || item;
      const tab = await chrome.tabs.create({ url: url, active: false });
      return tab.id;
    } catch (e) {
      console.error(e);
      return null;
    }
  });

  const tabIds = await Promise.all(tabPromises);
  state.batchTabIds = tabIds;
  await chrome.storage.local.set({ auditState: state });

  createAlarm('BATCH_EXTRACT', 5000); 
}

function getAsinFromUrl(url) {
    if(!url) return "none";
    const match = url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : "none";
}

async function extractBatchData(state) {
  state.statusMessage = "Extracting data...";
  state.nextActionTime = null;
  await chrome.storage.local.set({ auditState: state });

  const tabIds = state.batchTabIds || [];
  const results = [];
  const currentBatchSize = tabIds.length;
  const batchItems = state.urlsToProcess.slice(state.processedCount, state.processedCount + currentBatchSize);

  let captchaDetected = false;
  let captchaTabId = null;

  const scriptPromises = tabIds.map(async (tabId, index) => {
      const item = batchItems[index];
      const originalUrl = item.url || item;

      if (!tabId) {
        return {
          error: "tab_creation_failed",
          url: originalUrl,
          queryASIN: getAsinFromUrl(originalUrl)
        };
      }

      const res = await extractFromTab(tabId);
      
      if (res) {
          if (res.error === "CAPTCHA_DETECTED") {
              captchaDetected = true;
              captchaTabId = tabId;
              return null; // Don't add to results yet
          }

          res.queryASIN = getAsinFromUrl(originalUrl);
          
          if (item.expected) {
              res.expected = item.expected;
          }
          if (res.error && !res.url) {
              res.url = originalUrl;
          }
      }
      return res;
  });
  
  const batchResults = await Promise.all(scriptPromises);
  
  // Smart Captcha Handling
  if (captchaDetected && captchaTabId) {
      // 1. Pause State
      state.statusMessage = "CAPTCHA DETECTED! Paused. Please solve the captcha in the open tab to resume.";
      state.isScanning = false; // Soft pause
      await chrome.storage.local.set({ auditState: state });

      // 2. Focus the Tab
      await chrome.tabs.update(captchaTabId, { active: true });

      // 3. Monitor for Resolution (Resume logic)
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
          if (tabId === captchaTabId && changeInfo.status === 'complete') {
              if (!tab.title.includes("Robot Check")) {
                  // Captcha solved!
                  chrome.tabs.onUpdated.removeListener(listener);
                  
                  // Resume: Set scanning true and re-trigger extraction for this batch immediately
                  state.isScanning = true;
                  state.statusMessage = "Captcha solved! Resuming...";
                  chrome.storage.local.set({ auditState: state });
                  
                  // Give it 2 seconds to settle then extract
                  createAlarm('BATCH_EXTRACT', 2000); 
              }
          }
      });
      
      return; // Stop processing this batch until solved
  }

  // Normal Processing
  batchResults.forEach(res => {
    if (res && (res.found || res.error)) results.push(res);
  });

  const validTabIds = tabIds.filter(id => id !== null);
  if (validTabIds.length > 0) {
    try { await chrome.tabs.remove(validTabIds); } catch(e) {}
  }

  state.results.push(...results);
  state.processedCount += results.length; 
  state.currentBatchIndex++;
  state.batchTabIds = []; 

  const total = state.urlsToProcess.length;
  if (state.processedCount < total) {
    const delaySeconds = getRandomDivisible(5, 30, 5); 
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

function createAlarm(name, delayMs) {
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
    return { error: " extraction_failed", tabId };
  }
  return null;
}

function getRandomDivisible(min, max, step) {
  const steps = Math.floor((max - min) / step);
  const randomStep = Math.floor(Math.random() * (steps + 1));
  return min + (randomStep * step);
}
