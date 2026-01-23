# Integration Guide: VC-PDP Image Auditor

This guide explains how to integrate the VC-PDP Image Audit logic into your existing Chrome Extension.

## 1. Copy Resources

Copy the entire `src/` directory from this repository into your extension's root (or appropriate subfolder).

The `src/` folder contains:
*   `Auditor.js`: The main class managing the audit process.
*   `Comparator.js`: Pure logic for comparing Vendor Central vs PDP data.
*   `scraper.js`: The content script injected into Amazon pages.

## 2. Manifest Configuration

Ensure your `manifest.json` includes the necessary permissions and configuration.

### Permissions
Your extension requires the following permissions to manage tabs and inject scripts:

```json
{
  "permissions": [
    "tabs",
    "scripting"
  ],
  "host_permissions": [
    "https://*.amazon.com/*",
    "https://*.amazon.ca/*",
    "https://*.amazon.co.uk/*",
    "https://*.amazon.de/*",
    "https://vendorcentral.amazon.com/*"
  ]
}
```
*Note: Add any other regional domains you support to `host_permissions`.*

### Service Worker (Background Script)
To import the `Auditor` class, your background script must be an ES Module.

```json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

## 3. Usage in Background Script

In your background service worker (e.g., `background.js`), import and initialize the `Auditor`.

```javascript
import { Auditor } from './src/Auditor.js';

// Singleton instance recommended
let auditor = null;

function getAuditor() {
  if (!auditor) {
    auditor = new Auditor({
      // Path to the scraper file relative to extension root
      scraperPath: 'src/scraper.js',

      // Callback for progress updates
      // current: number of ASINs processed so far
      // total: total number of ASINs
      // logs: string message (e.g., "Processing batch...")
      // startTime: timestamp when audit started
      // results: array of result objects (optional, updated per batch)
      onProgress: async (current, total, logs, startTime, results) => {
        console.log(`Progress: ${current}/${total} - ${logs}`);
        // Example: Send to your frontend
        // chrome.runtime.sendMessage({ type: 'AUDIT_PROGRESS', current, total });
      },

      // Callback when audit completes (or is stopped)
      onComplete: async (results, status, logs) => {
        console.log(`Audit Finished: ${status}`);
        console.log(results);
        // Save results to database or storage
      },

      // Callback for fatal errors
      onError: async (err) => {
        console.error("Audit Failed:", err);
      }
    });
  }
  return auditor;
}

// Example: Listen for a message from your UI
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_MY_AUDIT") {
    const aud = getAuditor();

    // Check if already running
    if (aud.isJobRunning) {
      sendResponse({ status: "busy" });
      return;
    }

    // Start the audit
    // asins: Array of strings ["B0...", "B0..."]
    // domain: Amazon domain suffix (e.g., "com", "co.uk")
    // vcBaseUrl: The base URL for Vendor Central imaging page
    const vcBaseUrl = "https://vendorcentral.amazon.com/imaging/manage?asins=";

    aud.start(request.asins, "com", vcBaseUrl, 5) // 5 is batch size
      .then(() => console.log("Audit started"))
      .catch(err => console.error("Start failed", err));

    sendResponse({ status: "started" });
  }

  if (request.action === "STOP_AUDIT") {
    getAuditor().stop();
    sendResponse({ status: "stopping" });
  }
});
```

## 4. Customizing Logic

*   **Comparison Logic**: If you need to change how images are matched (e.g., ignore certain variants), edit `src/Comparator.js`.
*   **Scraping Logic**: If Amazon's DOM changes, edit `src/scraper.js`. The `Auditor` automatically injects this file.

## 5. Handling Auth
The `Auditor` expects the user to be logged into Amazon Vendor Central in the browser. It checks for login pages and will report an error (`VC_LOGIN_REQUIRED`) if not authenticated. Your app should handle this by prompting the user to log in.
