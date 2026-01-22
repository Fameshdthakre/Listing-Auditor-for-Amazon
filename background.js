// background.js - Robust Batch Processing (Current Window)

const INITIAL_STATE = {
  isScanning: false,
  mode: 'current', 
  urlsToProcess: [],
  results: [],
  processedCount: 0,
  settings: { disableImages: false },
  statusMessage: "Ready.",
  nextActionTime: null,
  targetWindowId: null
};

// --- Initialization ---

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
          .catch((error) => console.error("SidePanel Error:", error));
  }
});

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

  if (alarm.name === 'QUEUE_PROCESS') {
    await processBatch(state);
  }
});

// --- Core Functions ---

async function startScan(payload) {
  const { urls, mode, settings, targetWindowId } = payload;
  
  const newState = {
    ...INITIAL_STATE,
    isScanning: true,
    mode,
    urlsToProcess: urls,
    settings,
    processedCount: 0,
    statusMessage: "Initializing...",
    targetWindowId
  };

  await chrome.storage.local.set({ auditState: newState });

  // DNR Logic (Simplified: Enable/Disable Rules based on settings)
  if (settings.disableImages) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
          enableRulesetIds: ["ruleset_1"]
      });
  } else {
      // Ensure we don't accidentally block if not requested, though we might want to block ads
      // For now, sticking to user setting toggling ruleset
      await chrome.declarativeNetRequest.updateEnabledRulesets({
          disableRulesetIds: ["ruleset_1"]
      });
  }

  createAlarm('QUEUE_PROCESS', 100);
}

async function stopScan() {
  await chrome.alarms.clearAll();

  const data = await chrome.storage.local.get('auditState');
  const state = data.auditState;

  if (state) {
    state.isScanning = false;
    // Don't clear results, just mark as stopped so UI can render what we have
    state.statusMessage = "Stopped by user.";
    state.nextActionTime = null;
    await chrome.storage.local.set({ auditState: state });

    if (state.settings && state.settings.disableImages) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
            disableRulesetIds: ["ruleset_1"]
        });
    }
  }
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
    statusMessage: "Results cleared. Ready.",
    nextActionTime: null
  };

  await chrome.storage.local.set({ auditState: clearedState });
}

function getAsinFromUrl(url) {
    if(!url) return "none";
    const match = url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i);
    return match ? match[1].toUpperCase() : "none";
}

// --- BATCH PROCESSOR ---

async function processBatch(state) {
    if (!state.isScanning) return;

    const total = state.urlsToProcess.length;
    const startIdx = state.processedCount;

    // Check if finished
    if (startIdx >= total) {
        await finishScan(state);
        return;
    }

    // Random Batch Size (5-30)
    const minBatch = 5;
    const maxBatch = 30;
    const batchSize = Math.floor(Math.random() * (maxBatch - minBatch + 1)) + minBatch;

    // Get Chunk
    const endIdx = Math.min(startIdx + batchSize, total);
    const chunk = state.urlsToProcess.slice(startIdx, endIdx);

    state.statusMessage = `Processing ${startIdx + 1} - ${endIdx} of ${total} (Batch Size: ${batchSize})...`;
    await chrome.storage.local.set({ auditState: state });

    // Track tabs created in this specific batch to ensure they are all closed
    const batchTabIds = [];

    // Helper to create tabs and track them for cleanup
    const trackCreateTab = async (url) => {
        try {
            const createProps = { url: url, active: false };
            if (state.targetWindowId) createProps.windowId = state.targetWindowId;
            
            const tab = await chrome.tabs.create(createProps);
            if (tab) batchTabIds.push(tab.id);
            return tab;
        } catch (e) {
            console.error("Tab Create Error:", e);
            return null;
        }
    };

    try {
        // Parallel execution of the current batch
        // We map the chunk items to auditSingleAsin promises
        const chunkPromises = chunk.map(item => auditSingleAsin(item, state, trackCreateTab));
        const chunkResults = await Promise.all(chunkPromises);

        // Update State with Results
        state.results.push(...chunkResults);
        state.processedCount += chunkResults.length;

        await chrome.storage.local.set({ auditState: state });

    } catch (err) {
        console.error("Batch Error:", err);
    } finally {
        // MANDATORY CLEANUP: Close any tabs from this batch that might still be open
        // This handles cases where a script might have crashed or hung
        if (batchTabIds.length > 0) {
            try {
                // We attempt to remove any remaining tabs from this batch
                // Most should be closed by auditSingleAsin, but this is a safety net
                const currentTabs = await chrome.tabs.query({}); // Get all tabs to check existence
                const existingIds = batchTabIds.filter(id => currentTabs.some(t => t.id === id));
                if (existingIds.length > 0) await chrome.tabs.remove(existingIds);
            } catch (e) {
                // Tabs might already be closed, which is fine
            }
        }

        // Schedule next batch
        if (state.isScanning) {
             createAlarm('QUEUE_PROCESS', 1000);
        }
    }
}

// --- Single Item Audit Logic ---

async function auditSingleAsin(item, state, trackCreateTab) {
    // Determine URL and Metadata
    let url = (typeof item === 'string') ? item : (item.url || item);
    let isVC = false;
    let comparisonData = null;
    let itemId = null;
    let originalItem = item;

    if (typeof item === 'object') {
        if (item.type === 'vc') isVC = true;
        // Legacy Vendor Logic
        else if (state.mode === 'vendor' && item.asin && item.sku && item.vendorCode) {
            isVC = true;
            url = `https://vendorcentral.amazon.com/abis/listing/edit?sku=${item.sku}&asin=${item.asin}&vendorCode=${item.vendorCode}`;
        }
        comparisonData = item.comparisonData;
        itemId = item.id;
    }

    // 1. Create Tab
    const tab = await trackCreateTab(url);
    if (!tab) return { error: "tab_create_failed", url: url };

    try {
        // 2. Wait for Load
        await waitForTabLoad(tab.id);

        // 3. Inject Flags (AOD, etc) if needed
        if (state.settings && state.settings.scrapeAOD && !isVC) {
            const strategy = state.settings.aodStrategy || 'all';
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (strat) => {
                    window.SHOULD_SCRAPE_AOD = true;
                    window.AOD_STRATEGY = strat;
                },
                args: [strategy]
            }).catch(() => {}); // Ignore error if injection fails (e.g. closed tab)
        }

        // 4. Extract Data
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Close tab immediately after extraction to free memory
        chrome.tabs.remove(tab.id).catch(() => {}); 

        if (result && result.result) {
            const res = result.result;

            // Handle Captcha
            if (res.error === "CAPTCHA_DETECTED") {
                return { error: "CAPTCHA_DETECTED", url: url };
            }

            // Attach Metadata
            res.isVC = isVC;
            res.comparisonData = comparisonData;
            res.id = itemId;

            if (isVC) {
                if (originalItem && originalItem.asin && !originalItem.id) {
                    res.vcData = originalItem;
                }
            } else {
                res.queryASIN = getAsinFromUrl(url);
                if (originalItem.expected) res.expected = originalItem.expected;
            }

            if (res.error && !res.url) res.url = url;
            return res;
        }

        return { error: "no_result", url: url, queryASIN: getAsinFromUrl(url) };

    } catch (e) {
        // Attempt to close tab if crash occurred
        chrome.tabs.remove(tab.id).catch(() => {}); 
        return { error: "extraction_crash", url: url, details: e.toString() };
    }
}

function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        // Timeout to prevent hanging forever
        const timeout = setTimeout(() => resolve(), 30000);

        const listener = (tid, changeInfo, tab) => {
            if (tid === tabId && changeInfo.status === 'complete') {
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
}

async function finishScan(state) {
  state.isScanning = false;
  state.statusMessage = "Scan complete.";
  state.nextActionTime = null;
  await chrome.storage.local.set({ auditState: state });

  // Notify frontend to update Catalogue status if applicable
  try {
      chrome.runtime.sendMessage({
          action: 'SCAN_COMPLETE',
          mode: state.mode,
          results: state.results
      }).catch(() => {}); // Ignore if no listener (e.g. sidepanel closed)
  } catch(e) {}

  if (state.settings.disableImages) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: ["ruleset_1"]
    });
  }
}

function createAlarm(name, delayMs) {
  chrome.alarms.create(name, { when: Date.now() + delayMs });
}
