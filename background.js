// background.js - Dual-Mode Batch Processor

importScripts('db.js');

const INITIAL_STATE = {
  isScanning: false,
  mode: 'current', 
  urlsToProcess: [], // For Scraper Mode
  auditTasks: [],    // For Auditor Mode (List of ASINs)
  processedCount: 0,
  settings: { disableImages: false },
  statusMessage: "Ready.",
  logs: ""
};

let stopRequested = false;

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
    if (request.payload.mode === 'auditor') {
        // New Auditor Flow
        startAuditorBatch(request.payload).then(() => sendResponse({ status: 'started_auditor' }));
    } else {
        // Legacy Scraper Flow (Existing logic, simplified)
        // For now, let's assume we focus on the Auditor Flow requested.
        // But to keep the app working for both, we branch here.
        startScraperScan(request.payload).then(() => sendResponse({ status: 'started_scraper' }));
    }
    return true;
  } 
  else if (request.action === 'STOP_SCAN') {
    stopRequested = true;
    updateState({ isScanning: false, statusMessage: "Stopping...", logs: "Stop requested." });
    sendResponse({ status: 'stopping' });
    return true;
  }
  else if (request.action === 'CLEAR_DATA') {
    clearData().then(() => sendResponse({ status: 'cleared' }));
    return true;
  }
});

// --- AUDITOR MODE LOGIC (The New Requirement) ---

async function startAuditorBatch(payload) {
    const { asins, domain, vcBaseUrl, batchSize } = payload;
    stopRequested = false;

    // Reset DB and State
    try { await clearResults(); } catch(e){}
    await updateState({
        ...INITIAL_STATE,
        isScanning: true,
        mode: 'auditor',
        auditTasks: asins,
        statusMessage: "Initializing Auditor...",
        logs: "Starting batch audit..."
    });

    const results = [];
    const size = batchSize || 5;

    for (let i = 0; i < asins.length; i += size) {
        if (stopRequested) break;

        const chunk = asins.slice(i, i + size);
        await updateState({
            processedCount: results.length,
            statusMessage: `Processing batch: ${i + 1} to ${Math.min(i + size, asins.length)}...`,
            logs: `Batch ${i/size + 1} started.`
        });

        const batchTabIds = [];
        const trackCreateTab = async (url) => {
            const tab = await createTab(url);
            if (tab) batchTabIds.push(tab.id);
            return tab;
        };

        try {
            const chunkPromises = chunk.map(asin => auditSingleAsin(asin, domain, vcBaseUrl, trackCreateTab));
            const chunkResults = await Promise.all(chunkPromises);

            // Save Results to DB immediately
            for (const res of chunkResults) {
                await addResult(res);
                results.push(res);
            }

        } catch (err) {
            console.error("Batch Error:", err);
        } finally {
            // Cleanup Tabs
            for (const tabId of batchTabIds) {
                try { await chrome.tabs.remove(tabId); } catch (e) {}
            }
        }

        if (stopRequested) break;
        await sleep(2000); // Cooldown
    }

    const finalMsg = stopRequested ? "Audit Stopped." : "Audit Complete!";
    await updateState({ isScanning: false, statusMessage: finalMsg, logs: finalMsg });
}

async function auditSingleAsin(queryAsin, domain, vcBaseUrl, trackCreateTab) {
    let vcTab = null, pdpTab = null;
    try {
        if (stopRequested) throw new Error("User Stopped");

        // Construct URLs
        const vcUrl = `${vcBaseUrl}${queryAsin}`;
        const pdpUrl = `https://www.amazon.${domain}/dp/${queryAsin}`; // Handles variations of domain passed from UI

        // Open Tabs
        [vcTab, pdpTab] = await Promise.all([trackCreateTab(vcUrl), trackCreateTab(pdpUrl)]);

        // Wait for VC Load (Specific Selector)
        const vcContainerSelector = 'div[class="imageGroup clearfix"]';
        // Note: The selector might change per marketplace or VC version, keeping the provided one.
        // We also need to be careful if VC requires login (redirects to login page).
        // Assuming user is logged in.

        let vcFound = await waitForElement(vcTab.id, vcContainerSelector, 20000);
        if (vcFound && !stopRequested) await sleep(3000);

        // Scrape VC
        let vcData = await scrapeTab(vcTab.id);

        // Refresh Retry Logic for VC
        if (!stopRequested && (!vcData || !vcData.data || vcData.data.length === 0)) {
            await reloadTab(vcTab.id);
            vcFound = await waitForElement(vcTab.id, vcContainerSelector, 20000);
            if (vcFound && !stopRequested) await sleep(4000);
            vcData = await scrapeTab(vcTab.id);
        }

        // Scrape PDP
        // PDP usually loads fast, but let's ensure we wait for body
        await waitForElement(pdpTab.id, 'body', 15000);
        const pdpData = await scrapeTab(pdpTab.id);

        // Close immediately to free resources
        await Promise.all([
            vcTab ? chrome.tabs.remove(vcTab.id).catch(()=>{}) : null,
            pdpTab ? chrome.tabs.remove(pdpTab.id).catch(()=>{}) : null
        ]);

        return processAudit(queryAsin, vcData, pdpData, vcUrl, pdpUrl);

    } catch (err) {
        return {
            error: err.message,
            queryASIN: queryAsin,
            url: `https://www.amazon.${domain}/dp/${queryAsin}`, // Fallback URL
            attributes: { mediaAsin: "none" } // Minimal structure to prevent UI break
        };
    }
}

function processAudit(queryAsin, vcRes, pdpRes, vcUrl, pdpUrl) {
    const filterSwch = (img) => img.variant !== 'SWCH';
    const vcImages = (vcRes?.data || []).filter(filterSwch);
    const pdpImages = (pdpRes?.data || []).filter(filterSwch);
    const pageAsin = pdpRes?.mediaAsin || "none";

    let status = "SUCCESS";
    if (!pdpRes || (pdpImages.length === 0 && !pdpRes.found)) {
        status = "PAGE_NOT_FOUND";
    } else if (pageAsin !== "none" && queryAsin.toUpperCase() !== pageAsin.toUpperCase()) {
        status = "ASIN_REDIRECTED";
    }

    const getImageId = (url) => {
        if (!url || url === "none") return null;
        const match = url.match(/\/I\/([a-zA-Z0-9\+\-]+)/);
        return match ? match[1] : null;
    };

    const vcMap = new Map();
    vcImages.forEach(img => {
        const id = getImageId(img.large);
        if (id) vcMap.set(id, img.variant);
    });

    const pdpMap = new Map();
    pdpImages.forEach(img => {
        const id = getImageId(img.large);
        if (id) pdpMap.set(id, img.variant);
    });

    let matches = [], missing = [], extra = [];
    vcMap.forEach((variant, id) => {
        if (pdpMap.has(id)) matches.push(`${variant} (${id})`);
        else missing.push(`${variant} (${id})`);
    });

    pdpMap.forEach((variant, id) => {
        if (!vcMap.has(id)) extra.push(`${variant} (${id})`);
    });

    let auditNote = "";
    if (status === "PAGE_NOT_FOUND") {
        auditNote = "Amazon PDP could not be loaded or is suppressed.";
    } else if (status === "ASIN_REDIRECTED") {
        auditNote = `Redirect detected. Showing data for ${pageAsin}. `;
        auditNote += (missing.length === 0 && extra.length === 0) ? "Images match redirected ASIN." : "Images do not match redirected ASIN.";
    } else {
        if (missing.length === 0 && extra.length === 0 && vcImages.length > 0) {
            auditNote = "Perfect Match: VC and PDP images are identical.";
        } else if (vcImages.length === 0 && pdpImages.length === 0) {
            auditNote = "No non-SWCH images found on either side.";
        } else {
            auditNote = `Discrepancy: ${matches.length} matches, ${missing.length} missing from Amazon, ${extra.length} extra on Amazon.`;
        }
    }

    // Return flattened object for easy DB storage and export
    return {
        queryASIN: queryAsin,
        status: status,
        auditNote: auditNote,

        // Attributes for UI/Export
        attributes: {
            mediaAsin: pageAsin,
            metaTitle: pdpRes?.attributes?.metaTitle || "none", // From scrape
            vcImages: vcImages, // Store Array
            pdpImages: pdpImages, // Store Array
            matches: matches.join('; '),
            missing: missing.join('; '),
            extra: extra.join('; '),
            vcUrl: vcUrl,
            pdpUrl: pdpUrl
        }
    };
}

// --- SCRAPER MODE LOGIC (Legacy / Single Tab) ---
// Kept simple for "Get All Offers" or single scraping if user chooses "Scraper Mode"
// This uses a stripped down version of previous logic just to maintain feature set if needed.
// For now, we stub it or assume "Auditor" is the main focus.
async function startScraperScan(payload) {
    // Placeholder: If user selects scraper mode, we might need the old queue logic.
    // For this task, we focus on Auditor.
    await updateState({ statusMessage: "Scraper Mode not fully refactored yet. Use Auditor Mode." });
}

// --- HELPERS ---

async function updateState(updates) {
    const data = await chrome.storage.local.get('auditState');
    const newState = { ...(data.auditState || INITIAL_STATE), ...updates };
    await chrome.storage.local.set({ auditState: newState });
}

function createTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: url, active: false }, (tab) => {
      // Wait for creation
      if(!tab) resolve(null);
      resolve(tab);
      // We don't wait for 'complete' here because we parallelize that in the batch loop
      // or handle it via waitForElement. The original code waited for complete.
      // Let's stick to the original code's logic of waiting for complete if possible to ensure PID.
    });
  });
}

function reloadTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.reload(tabId, {}, () => {
      // Simple timeout or listener
      setTimeout(resolve, 3000);
    });
  });
}

async function waitForElement(tabId, selector, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (stopRequested) return false;
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (sel) => {
          const el = document.querySelector(sel);
          return !!el; // Just existence
        },
        args: [selector]
      });
      if (result && result.result) return true;
    } catch (e) {}
    await sleep(1000);
  }
  return false;
}

function scrapeTab(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] })
    .then((r) => {
        resolve(r?.[0]?.result || null);
    })
    .catch(e => resolve(null));
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function clearData() {
    try { await clearResults(); } catch(e){}
    await updateState(INITIAL_STATE);
}
