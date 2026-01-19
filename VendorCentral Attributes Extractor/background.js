let isJobRunning = false;
let stopRequested = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_AUDIT") {
    if (!isJobRunning) {
      stopRequested = false; 
      runAuditBatch(request.asins, request.domain, request.vcBaseUrl, request.batchSize || 5);
      sendResponse({ status: "Started" });
    } else {
      sendResponse({ status: "Already Running" });
    }
  } else if (request.action === "STOP_AUDIT") {
    if (isJobRunning) {
      stopRequested = true;
      sendResponse({ status: "Stopping" });
    } else {
      sendResponse({ status: "Not Running" });
    }
  }
  return true;
});

async function runAuditBatch(asins, domain, vcBaseUrl, batchSize) {
  isJobRunning = true;
  await chrome.storage.local.set({ jobStatus: 'processing', total: asins.length, current: 0, results: [], logs: "Starting batch audit..." });

  const allResults = [];
  
  for (let i = 0; i < asins.length; i += batchSize) {
    if (stopRequested) break;

    const chunk = asins.slice(i, i + batchSize);
    await chrome.storage.local.set({ logs: `Processing batch: ${i + 1} to ${Math.min(i + batchSize, asins.length)}...` });

    // Track tabs created in this specific batch to ensure they are all closed
    const batchTabIds = [];
    
    // Helper to create tabs and track them for cleanup
    const trackCreateTab = async (url) => {
      const tab = await createTab(url);
      if (tab) batchTabIds.push(tab.id);
      return tab;
    };

    try {
      // Parallel execution of the current batch
      const chunkPromises = chunk.map(asin => auditSingleAsin(asin, domain, vcBaseUrl, trackCreateTab));
      const chunkResults = await Promise.all(chunkPromises);
      
      allResults.push(...chunkResults);
      await chrome.storage.local.set({ current: allResults.length, results: allResults });
    } catch (err) {
      console.error("Batch Error:", err);
    } finally {
      // MANDATORY CLEANUP: Close any tabs from this batch that might still be open
      // This handles cases where a script might have crashed or hung
      for (const tabId of batchTabIds) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          // Tab might already be closed, which is fine
        }
      }
    }

    if (stopRequested) break;
    // Wait between batches
    await sleep(2000);
  }

  isJobRunning = false;
  const finalStatus = stopRequested ? 'stopped' : 'complete';
  const finalLog = stopRequested ? "Audit Stopped. Partial data ready." : "Audit Complete!";
  await chrome.storage.local.set({ jobStatus: finalStatus, logs: finalLog, results: allResults });
}

async function auditSingleAsin(queryAsin, domain, vcBaseUrl, trackCreateTab) {
  let vcTab = null, pdpTab = null;
  try {
    if (stopRequested) throw new Error("User Stopped");

    const vcUrl = `${vcBaseUrl}${queryAsin}`;
    const pdpUrl = `https://www.amazon.${domain}/dp/${queryAsin}`;

    // Use the tracking creator passed from the batch loop
    [vcTab, pdpTab] = await Promise.all([trackCreateTab(vcUrl), trackCreateTab(pdpUrl)]);
    
    const vcContainerSelector = 'div[class="imageGroup clearfix"]';
    let vcFound = await waitForElement(vcTab.id, vcContainerSelector, 20000);
    
    if (vcFound && !stopRequested) await sleep(3000); 

    let vcData = await scrapeTab(vcTab.id);

    // REFRESH LOGIC: If VC returns empty results, refresh and try one more time
    if (!stopRequested && (!vcData || !vcData.data || vcData.data.length === 0)) {
      await reloadTab(vcTab.id);
      vcFound = await waitForElement(vcTab.id, vcContainerSelector, 20000);
      if (vcFound && !stopRequested) await sleep(4000);
      vcData = await scrapeTab(vcTab.id);
    }

    const pdpData = await scrapeTab(pdpTab.id);
    
    // Attempt graceful removal immediately
    await Promise.all([
      vcTab ? chrome.tabs.remove(vcTab.id).catch(()=>{}) : null,
      pdpTab ? chrome.tabs.remove(pdpTab.id).catch(()=>{}) : null
    ]);

    return processAudit(queryAsin, vcData, pdpData, vcUrl, pdpUrl);
  } catch (err) {
    return { 
      Status: stopRequested ? "STOPPED" : "ERROR", 
      PageASIN: "none",
      QueryASIN: queryAsin, 
      "VC Images": "[]",
      "VC Images Count": 0,
      "VC PageURL": `${vcBaseUrl}${queryAsin}`,
      "PDP Images": "[]",
      "PDP Images Count": 0,
      "PDP PageURL": `https://www.amazon.${domain}/dp/${queryAsin}`,
      "Audit Note": stopRequested ? "Canceled by user" : `Process Error: ${err.message}`,
      "Matches on Amazon PDP": "None",
      "Missing on Amazon PDP": "None",
      "Extra on Amazon PDP": "None"
    };
  }
}

function reloadTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.reload(tabId, {}, () => {
      const listener = (tid, info) => {
        if (tid === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
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

  return {
    "Status": status,
    "PageASIN": pageAsin,
    "QueryASIN": queryAsin,
    "VC Images": JSON.stringify(vcImages),
    "VC Images Count": vcImages.length,
    "VC PageURL": vcUrl,
    "PDP Images": JSON.stringify(pdpImages),
    "PDP Images Count": pdpImages.length,
    "PDP PageURL": pdpUrl,
    "Audit Note": auditNote,
    "Matches on Amazon PDP": matches.join('; ') || "None",
    "Missing on Amazon PDP": missing.join('; ') || "None",
    "Extra on Amazon PDP": extra.join('; ') || "None"
  };
}

function createTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: url, active: false }, (tab) => {
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(tab);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
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
          return !!el && el.children.length > 0;
        },
        args: [selector]
      });
      if (result.result) return true;
    } catch (e) {}
    await sleep(1000);
  }
  return false;
}

function scrapeTab(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] }, 
    (r) => resolve(r?.[0]?.result || null));
  });
}

function sleep(ms) { 
  return new Promise(r => {
    const checkInterval = setInterval(() => {
      if (stopRequested) {
        clearInterval(checkInterval);
        r();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(checkInterval);
      r();
    }, ms);
  });
}