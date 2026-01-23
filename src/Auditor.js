import { processAudit, createErrorResult } from './Comparator.js';

export class Auditor {
  /**
   * @param {Object} config
   * @param {string} config.scraperPath - Path to the content script file (relative to extension root).
   * @param {Function} config.onProgress - Callback(current, total, logs, startTime, results)
   * @param {Function} config.onComplete - Callback(results, status, logs)
   * @param {Function} config.onError - Callback(error)
   */
  constructor(config = {}) {
    this.scraperPath = config.scraperPath || 'src/scraper.js';
    this.onProgress = config.onProgress || (() => {});
    this.onComplete = config.onComplete || (() => {});
    this.onError = config.onError || (() => {});

    this.isJobRunning = false;
    this.stopRequested = false;
    this.startTime = null;
  }

  start(asins, domain, vcBaseUrl, batchSize = 5, windowId = null) {
    if (this.isJobRunning) {
      return Promise.reject(new Error("Audit already running"));
    }
    this.stopRequested = false;
    this.startTime = Date.now();
    this.isJobRunning = true;

    // We don't await here because we want to return control to the caller (e.g. background listener)
    // while the async process continues.
    this.runAuditBatch(asins, domain, vcBaseUrl, batchSize, windowId)
      .catch(err => {
        console.error("Fatal Audit Error:", err);
        this.isJobRunning = false;
        this.onError(err);
      });

    return Promise.resolve({ status: "Started" });
  }

  stop() {
    if (this.isJobRunning) {
      this.stopRequested = true;
      return Promise.resolve({ status: "Stopping" });
    }
    return Promise.resolve({ status: "Not Running" });
  }

  async runAuditBatch(asins, domain, vcBaseUrl, batchSize, windowId) {
    const total = asins.length;
    let current = 0;
    const allResults = [];

    this.onProgress(current, total, "Starting batch audit...", this.startTime);

    for (let i = 0; i < asins.length; i += batchSize) {
      if (this.stopRequested) break;

      const chunk = asins.slice(i, i + batchSize);
      this.onProgress(current, total, `Processing batch: ${i + 1} to ${Math.min(i + batchSize, total)}...`, this.startTime);

      const batchTabIds = [];
      const trackCreateTab = async (url) => {
        const tab = await this.createTab(url, windowId);
        if (tab) batchTabIds.push(tab.id);
        return tab;
      };

      try {
        const chunkPromises = chunk.map(asin =>
          this.auditSingleAsin(asin, domain, vcBaseUrl, trackCreateTab)
        );
        const chunkResults = await Promise.all(chunkPromises);

        allResults.push(...chunkResults);
        current = allResults.length;

        // Progress update with partial results
        this.onProgress(current, total, `Batch completed.`, this.startTime, allResults);

      } catch (err) {
        console.error("Batch Error:", err);
        // We continue to next batch even if one fails
      } finally {
        for (const tabId of batchTabIds) {
          try { await chrome.tabs.remove(tabId); } catch (e) {}
        }
      }

      if (this.stopRequested) break;
      await this.sleep(2000);
    }

    this.isJobRunning = false;
    const finalStatus = this.stopRequested ? 'stopped' : 'complete';
    const finalLog = this.stopRequested ? "Audit Stopped. Partial data ready." : "Audit Complete!";

    this.onComplete(allResults, finalStatus, finalLog);
  }

  async auditSingleAsin(queryAsin, domain, vcBaseUrl, trackCreateTab) {
    let vcTab = null, pdpTab = null;
    try {
      if (this.stopRequested) throw new Error("User Stopped");

      const vcUrl = `${vcBaseUrl}${queryAsin}`;
      const pdpUrl = `https://www.amazon.${domain}/dp/${queryAsin}`;

      [vcTab, pdpTab] = await Promise.all([trackCreateTab(vcUrl), trackCreateTab(pdpUrl)]);

      const vcInitCheck = await this.checkPageState(vcTab.id);
      if (vcInitCheck.error) return createErrorResult(queryAsin, vcInitCheck.error, vcUrl, pdpUrl, domain);

      const pdpInitCheck = await this.checkPageState(pdpTab.id);
      if (pdpInitCheck.error) return createErrorResult(queryAsin, pdpInitCheck.error, vcUrl, pdpUrl, domain);

      const vcContainerSelector = 'div[class="imageGroup clearfix"]';
      let vcFound = await this.waitForElement(vcTab.id, vcContainerSelector, 20000);

      if (!vcFound && !this.stopRequested) {
        const state = await this.checkPageState(vcTab.id);
        if (state.error) return createErrorResult(queryAsin, state.error, vcUrl, pdpUrl, domain);

        await this.reloadTab(vcTab.id);
        vcFound = await this.waitForElement(vcTab.id, vcContainerSelector, 15000);
      }

      if (vcFound && !this.stopRequested) await this.sleep(3000);

      const vcData = await this.scrapeTab(vcTab.id);
      const pdpData = await this.scrapeTab(pdpTab.id);

      // Cleanup happens in batch loop, but we can close early if we want.
      // The original code closed them here.
      await Promise.all([
        vcTab ? chrome.tabs.remove(vcTab.id).catch(()=>{}) : null,
        pdpTab ? chrome.tabs.remove(pdpTab.id).catch(()=>{}) : null
      ]);

      if (!vcFound && (!vcData || vcData.data?.length === 0)) {
          return createErrorResult(queryAsin, "UI_SELECTOR_CHANGED", vcUrl, pdpUrl, domain);
      }

      return processAudit(queryAsin, vcData, pdpData, vcUrl, pdpUrl);
    } catch (err) {
      const errType = err.message === "TIMEOUT" ? "TIMEOUT" : (this.stopRequested ? "STOPPED" : "UNKNOWN_ERROR");
      return createErrorResult(queryAsin, errType, `${vcBaseUrl}${queryAsin}`, `https://www.amazon.${domain}/dp/${queryAsin}`, domain, err.message);
    }
  }

  async checkPageState(tabId) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const text = document.body.innerText;
          const html = document.documentElement.innerHTML;
          if (window.location.href.includes('signin') || window.location.href.includes('login')) return "VC_LOGIN_REQUIRED";
          if (text.includes("type the characters you see below") || text.includes("Enter the characters you see below")) return "CAPTCHA_DETECTED";
          if (text.includes("Page Not Found") || html.includes("404-error")) return "PAGE_NOT_FOUND";
          return null;
        }
      });
      return { error: result.result };
    } catch (e) { return { error: null }; }
  }

  createTab(url, windowId) {
    return new Promise((resolve) => {
      const props = { url: url, active: false };
      if (windowId) props.windowId = windowId;

      chrome.tabs.create(props, (tab) => {
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

  async waitForElement(tabId, selector, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.stopRequested) return false;
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
      await this.sleep(1000);
    }
    return false;
  }

  scrapeTab(tabId) {
    return new Promise((resolve) => {
      chrome.scripting.executeScript({ target: { tabId: tabId }, files: [this.scraperPath] },
      (r) => resolve(r?.[0]?.result || null));
    });
  }

  reloadTab(tabId) {
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

  sleep(ms) {
    return new Promise(r => {
      const checkInterval = setInterval(() => {
        if (this.stopRequested) {
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
}
