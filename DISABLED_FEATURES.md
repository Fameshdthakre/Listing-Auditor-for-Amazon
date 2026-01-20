# Disabled Features & Future Implementations

This repository contains features that are currently disabled or commented out for specific reasons (e.g., CSP compliance, future roadmap).

## 1. Firebase Analytics

**Status:** Disabled
**Reason:** Chrome Extensions V3 have strict Content Security Policies (CSP) that can make loading external analytics scripts difficult. To ensure the extension runs smoothly out-of-the-box, analytics has been disabled.

**How to Enable:**
1.  Open `firebase/firebase-config.js`.
2.  Uncomment the import line:
    ```javascript
    import { getAnalytics } from './firebase-analytics.js';
    ```
3.  Uncomment the initialization (or add it):
    ```javascript
    const analytics = getAnalytics(app);
    ```
4.  **Important:** You must update `manifest.json` to allow the Google Analytics script source in the `content_security_policy` field.

## 2. AOD Scraper (All Offers Display)

**Status:** Gated (Requires "Advanced Data" checkbox)
**Reason:** High load operation.
**Location:** `content.js` -> `scrapeAOD()` function.
**Trigger:** Checked via the UI options.

## 3. Microsoft Authentication (OneDrive Upload)

**Status:** Active
**Notes:** The `MS_CLIENT_ID` in `sidepanel.js` is set to a valid ID. Ensure the corresponding Azure App registration allows the redirect URI of your extension.
