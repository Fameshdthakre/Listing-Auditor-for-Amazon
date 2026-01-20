(async function() {
  try {
    // --- 0. Helper Functions ---
    const cleanImageUrl = (url) => {
      if (!url || url === "none") return "none";
      return url.replace(/\._[A-Z0-9,._-]+(\.[a-z]+)$/i, '$1');
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- Vendor Central Scraper Function ---
    const scrapeVendorCentral = async () => {
        const url = window.location.href;
        const result = { isVC: true, url };

        try {
            // 1. Image Manage Page
            if (url.includes("/imaging/manage")) {
                result.type = "images";
                result.images = [];

                // Selector: div[class*="imageGroup clearfix"]:eq(0) > div
                // In JS: document.querySelectorAll('.imageGroup.clearfix')[0].querySelectorAll('div')

                const group = document.querySelector('div[class*="imageGroup"]'); // first one
                if (group) {
                    const containers = group.children; // direct divs
                    for (let div of containers) {
                        // "div:eq(0) > img" -> div.querySelector('div > img') or just first img inside?
                        // "div:eq(0)" usually means first child.
                        // The structure is likely: Container > Wrapper > Img.
                        // Let's look for the first IMG in this container.
                        const img = div.querySelector('img');
                        if (img) {
                            result.images.push({
                                variant: img.alt || "none", // Variant Name (Alt)
                                src: img.src || "none"      // Image Link
                            });
                        }
                    }
                }
            }

            // 2. Catalog Edit Page
            else if (url.includes("/abis/listing/edit")) {
                result.type = "catalog";

                const getValue = (selector) => {
                    const el = document.querySelector(selector);
                    if (!el) return "none";
                    // Check standard value, then attribute, then shadow root if needed
                    if (el.value) return el.value;
                    if (el.getAttribute('value')) return el.getAttribute('value');
                    return "none";
                };

                // Item Name
                result.item_name = getValue('kat-textarea[name="item_name-0-value"]');

                // Description
                result.product_description = getValue('kat-textarea[name="rtip_product_description-0-value"]');

                // List Price
                result.list_price = getValue('kat-input[name="list_price-0-value"]');

                // Bullet Points (All found)
                result.bullet_points = [];
                const bullets = document.querySelectorAll('kat-textarea[name*="bullet_point"]');
                bullets.forEach(b => {
                    const val = b.value || b.getAttribute('value');
                    if (val) result.bullet_points.push(val);
                });
            }

            return result;

        } catch (e) {
            return { error: e.toString() };
        }
    };

    const extractJsonArray = (str, startSearchIndex) => {
        const openBracketIndex = str.indexOf('[', startSearchIndex);
        if (openBracketIndex === -1) return null;
        let bracketCount = 0;
        let endIndex = -1;
        let started = false;
        for (let i = openBracketIndex; i < str.length; i++) {
            const char = str[i];
            if (char === '[') { if (!started) started = true; bracketCount++; } 
            else if (char === ']') { bracketCount--; }
            if (started && bracketCount === 0) { endIndex = i + 1; break; }
        }
        return endIndex !== -1 ? str.substring(openBracketIndex, endIndex) : null;
    };

    // --- AOD Scraper Function ---
    const scrapeAOD = async () => {
        try {
            // 1. Open AOD
            const ingressBtn = document.querySelector('span[data-action="show-all-offers-display"] > a[id="aod-ingress-link"]');
            if (ingressBtn) {
                ingressBtn.click();
                await sleep(2000);
            } else {
                // If button not found, we might need to navigate, but let's assume we are on the page or it opened.
                // If strictly required, background logic should handle navigation to /gp/offer-listing/
            }

            // 2. Wait for Container
            let container = document.getElementById('all-offers-display-scroller');
            let attempts = 0;
            while (!container && attempts < 10) {
                await sleep(500);
                container = document.getElementById('all-offers-display-scroller');
                attempts++;
            }
            if (!container) return [];

            // 3. Scroll to Load All
            let lastHeight = container.scrollHeight;
            let noChangeCount = 0;
            while (noChangeCount < 3) {
                container.scrollTop = container.scrollHeight;
                await sleep(1500);
                let newHeight = container.scrollHeight;
                if (newHeight === lastHeight) {
                    noChangeCount++;
                } else {
                    noChangeCount = 0;
                    lastHeight = newHeight;
                }
            }

            // 4. Extract Offers
            const offers = [];
            const offerCards = document.querySelectorAll('div[id="aod-offer-list"] > div');

            offerCards.forEach(card => {
                try {
                    const priceEl = card.querySelector('span[id*="aod-price"] > div > span[class*="a-price"] > span[class*="a-offscreen"]');
                    const price = priceEl ? priceEl.textContent.trim() : "none";

                    const shipsFromEl = card.querySelector('div[id="aod-offer-shipsFrom"] .a-col-right .a-size-small');
                    const shipsFrom = shipsFromEl ? shipsFromEl.textContent.trim() : "none";

                    const soldByEl = card.querySelector('div[id="aod-offer-soldBy"] .a-col-right .a-size-small');
                    const soldBy = soldByEl ? soldByEl.textContent.trim() : "none";

                    // Rating & Reviews
                    const ratingEl = card.querySelector('div[id="aod-offer-seller-rating"] > i[class*="aod-seller-rating"] > span');
                    const rating = ratingEl ? ratingEl.textContent.trim() : "none";

                    const reviewsEl = card.querySelector('div[id="aod-offer-seller-rating"] > span[id*="seller-rating-count"] > span');
                    const reviews = reviewsEl ? reviewsEl.textContent.trim() : "none";

                    if (price !== "none") {
                        offers.push({ price, shipsFrom, soldBy, rating, reviews });
                    }
                } catch(e) {}
            });

            return offers;

        } catch (e) {
            console.error("AOD Scraping Error", e);
            return [];
        }
    };

    // --- 1. Determine Mode (VC or Amazon) ---
    if (window.location.hostname.includes("vendorcentral.amazon")) {
        return await scrapeVendorCentral();
    }

    // --- 1.5. Alert/Interstitial Page Handling (Unattended Mode) ---
    const alertElement = document.querySelector('html.a-no-js');
    if (alertElement) {
        // We are on the "no-js" alert page or similar interstitial
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            // Check retry count to prevent infinite loops
            const retryKey = 'alert_retry_' + window.location.href;
            let retries = parseInt(sessionStorage.getItem(retryKey) || '0', 10);

            if (retries < 5) {
                sessionStorage.setItem(retryKey, (retries + 1).toString());
                console.log(`Alert page detected. Clicking continue... (Attempt ${retries + 1}/5)`);
                submitBtn.click();
                // Return a specific status to keep the auditor waiting/retrying logic active if possible,
                // or just rely on the click to reload the page.
                // Since this script runs once per page load, we return a special status.
                return { found: false, error: "INTERSTITIAL_REDIRECT", url: window.location.href, status: "RETRYING" };
            } else {
                return { found: true, error: "INTERSTITIAL_FAILED", url: window.location.href, title: "Alert Page Stuck" };
            }
        }
    }

    // --- 2. Robust Page Detection ---
    if (document.title.includes("Robot Check") || document.querySelector("form[action*='/errors/validateCaptcha']")) {
      return { found: true, error: "CAPTCHA_DETECTED", url: window.location.href, title: "Captcha Block" };
    }
    
    if (document.title.includes("Page Not Found") || 
        document.querySelector("img[alt*='Dogs of Amazon']") || 
        document.querySelector('a[href*="/ref=cs_404_logo"]')) {
      return { found: true, error: "PAGE_NOT_FOUND_404", url: window.location.href, title: "Page Not Found" };
    }

    // const pageSource = document.documentElement.outerHTML; // Optimization: Removed global extraction
    // --- 2.5 Event-Driven Page Ready Detection ---
    // If we are just checking for readiness, return immediately.
    // The background script might inject this script twice: once to check readiness/trigger, once to extract.
    // Or we can do it in one go if we wait.
    // Current architecture: "extractFromTab" calls this script.
    // We want to notify background when we are ready.
    // But since this script is injected by executeScript, it runs ONCE.
    // To support "Smart Ready", we should probably have a separate light script or modify this one
    // to wait for the element if it's not there, then return.

    // However, the plan says: "Modify content.js to observe DOM... and send PAGE_READY".
    // AND "Remove fixed createAlarm".
    // So this script will now be injected *immediately* after tab creation (via a new mechanism or just loop).
    // Let's implement a wait-for-selector here before extraction.

    const waitForReady = async () => {
        const maxWait = 10000;
        const interval = 100;
        let elapsed = 0;
        while (elapsed < maxWait) {
            // Key indicators of a loaded product page
            if (document.querySelector('#productTitle') ||
                document.querySelector('#wayfinding-breadcrumbs_container') ||
                document.querySelector('#dp-container') ||
                document.title.includes("Page Not Found") ||
                document.title.includes("Robot Check")) {
                return true;
            }
            await sleep(interval);
            elapsed += interval;
        }
        return false; // Timeout, proceed anyway to scrape partial or error
    };

    await waitForReady();

    // --- 2.7. Check for AOD Mode request ---
    // If background requested AOD scrape specifically via a flag in URL or if we decide here.
    // Ideally, `extractFromTab` calls this script.
    // We can check a global var if we injected one, or just do it.
    // For now, let's look for a specific signal or just return a function to be called?
    // Chrome scripting executeScript returns the last value.
    // If we want to support AOD optionally, we need to know if we should run it.
    // Hack: We can check window.name or just do it if the container exists?
    // Better: Background injects a variable `window.SHOULD_SCRAPE_AOD = true` before file.

    let aodData = [];
    if (window.SHOULD_SCRAPE_AOD) {
        aodData = await scrapeAOD();
    }

    // --- 3. Extract Attributes (Lazy) ---
    // If we only need core data, we can skip heavy image parsing.
    // However, the current requirement is just to implement the structure.
    // Ideally, we'd pass a 'level' param to this script.
    // For now, we optimize by NOT iterating all scripts if we find data early.

    const scripts = document.querySelectorAll('script');

    // 3.0. GOLD MINE STRATEGY
    let goldMine = null;
    try {
        for (let script of scripts) {
            const content = script.textContent || "";
            if (content.length > 500 && content.includes('jQuery.parseJSON') && (content.includes('colorToAsin') || content.includes('mediaAsin'))) {
                const match = content.match(/jQuery\.parseJSON\(\s*'([\s\S]*?)'\s*\)/);
                if (match && match[1]) {
                    let jsonStr = match[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
                    try { goldMine = JSON.parse(jsonStr); break; } 
                    catch(jsonErr) { try { goldMine = JSON.parse(match[1]); break; } catch(e){} }
                }
            }
        }
    } catch(e) { console.log("GoldMine Extraction Error:", e); }

    // 3.0.1 IMAGE BLOCK STRATEGY
    let imagesFromData = null;
    try {
        for (let script of scripts) {
            const content = script.textContent || "";
            if (content.includes("colorImages") && content.includes("initial")) {
                let anchorIndex = content.indexOf("'colorImages'");
                if (anchorIndex === -1) anchorIndex = content.indexOf('"colorImages"');
                if (anchorIndex !== -1) {
                    let initialLabelIndex = content.indexOf("'initial'", anchorIndex);
                    if (initialLabelIndex === -1) initialLabelIndex = content.indexOf('"initial"', anchorIndex);
                    if (initialLabelIndex !== -1) {
                        const rawArray = extractJsonArray(content, initialLabelIndex);
                        if (rawArray) {
                            try {
                                const parsedImages = JSON.parse(rawArray);
                                if (Array.isArray(parsedImages)) {
                                    imagesFromData = parsedImages.map(img => ({
                                        variant: img.variant || "MAIN",
                                        hiRes: cleanImageUrl(img.hiRes),
                                        large: cleanImageUrl(img.large),
                                        thumb: cleanImageUrl(img.thumb)
                                    }));
                                    break; 
                                }
                            } catch (e) { console.log("ImageBlock JSON Parse Error", e); }
                        }
                    }
                }
            }
        }
    } catch(e) { console.log("ImageBlock Extraction Error:", e); }

    // --- 3.1 Data Population ---
    let items = [];
    if (imagesFromData) { items = imagesFromData; } 
    else if (goldMine && goldMine.colorImages) {
        Object.keys(goldMine.colorImages).forEach(variantName => {
            const imgs = goldMine.colorImages[variantName] || [];
            imgs.forEach(img => {
                items.push({ variant: variantName, hiRes: cleanImageUrl(img.hiRes), large: cleanImageUrl(img.large) });
            });
        });
    } else {
        // Fallback: search in innerHTML of specific containers if possible, or body
        const jsonRegex = /\[\s*\{"hiRes":.*?"variant":.*?\}\]/s;
        const match = document.body.innerHTML.match(jsonRegex);
        const rawData = match ? JSON.parse(match[0]) : [];
        items = rawData.map(item => ({ variant: item.variant || "none", hiRes: cleanImageUrl(item.hiRes), large: cleanImageUrl(item.large) }));
    }

    let mediaAsin = "none", parentAsin = "none", metaTitle = "";
    if (goldMine) {
        mediaAsin = goldMine.mediaAsin || "none";
        parentAsin = goldMine.parentAsin || "none";
        metaTitle = goldMine.title || document.title;
        const txt = document.createElement("textarea"); txt.innerHTML = metaTitle; metaTitle = txt.value.replace(/\\/g, "");
    } else {
        const mediaAsinEl = document.querySelector('input[name="ASIN"], input[id="ASIN"]');
        mediaAsin = mediaAsinEl ? mediaAsinEl.value : "none";

        const parentAsinEl = document.querySelector('input[name="parentASIN"], input[id="parentASIN"]');
        parentAsin = parentAsinEl ? parentAsinEl.value : "none";

        if (mediaAsin === "none") {
             const m = document.body.innerHTML.match(/"mediaAsin"\s*:\s*"([^"]+)"/);
             if(m) mediaAsin = m[1];
        }
        if (parentAsin === "none") {
             const m = document.body.innerHTML.match(/"parentAsin"\s*:\s*"([^"]+)"/);
             if(m) parentAsin = m[1];
        }

        const metaTitleEl = document.querySelector('meta[name="title"]');
        metaTitle = metaTitleEl ? metaTitleEl.getAttribute("content") : document.title;
    }

    let variationExists = "NO", variationTheme = "none", variationCount = "none", variationFamily = "none";
    if (goldMine && goldMine.colorToAsin) {
        const keys = Object.keys(goldMine.colorToAsin);
        if (keys.length > 0) {
            variationExists = "YES";
            variationCount = keys.length.toString();
            const asinList = Object.values(goldMine.colorToAsin).map(v => v.asin).sort();
            variationFamily = `[${asinList.join(", ")}]`;
            if (goldMine.visualDimensions && goldMine.visualDimensions.length > 0) variationTheme = goldMine.visualDimensions.join(", ");
        }
    } else {
        const dimMatch = document.body.innerHTML.match(/"dimensions"\s*:\s*(\[[^\]]*\])/);
        variationExists = dimMatch ? "YES" : "NO";
        variationTheme = dimMatch ? dimMatch[1] : "none";
        const countMatch = document.body.innerHTML.match(/"num_total_variations"\s*:\s*(\d+)/);
        variationCount = countMatch ? countMatch[1] : "none";
        for (let script of scripts) {
          if (script.textContent && script.textContent.includes('dimensionValuesDisplayData')) {
            const vMatch = script.textContent.match(/"dimensionValuesDisplayData"\s*:\s*(\{.*?\})\s*,/);
            if (vMatch) {
              try {
                  const familyObj = JSON.parse(vMatch[1]);
                  const sortedKeys = Object.keys(familyObj).sort();
                  variationFamily = JSON.stringify(sortedKeys); 
              } catch(e) { variationFamily = "Error Parsing Family Data"; }
              break;
            }
          }
        }
    }

    let videos = [];
    const hostname = window.location.hostname;
    const domain = hostname.replace(/^www\.amazon\./, '');
    if (goldMine && goldMine.videos) {
        videos = goldMine.videos.filter(v => v.groupType === "IB_G1").map(v => ({
            "video_title": v.title, "video_url": `https://www.amazon.${domain}/vdp/${v.mediaObjectId}`, "video_duration": v.durationSeconds, "video_languageCode": v.languageCode
        }));
    } else {
        const videoSet = new Set();
        // Optimization: Use DOM query first
        const videoElements = document.querySelectorAll('div[data-role="video-player"]');
        if(videoElements.length > 0) {
             videoElements.forEach(el => {
                 const json = el.getAttribute("data-video-url");
                 if(json) videoSet.add(json);
             });
        }
        // Fallback to regex on body HTML if needed, but safer
        const videoRegex = /"holderId"\s*:\s*"holder([^"]+)"/g;
        let vMatch;
        const bodyHTML = document.body.innerHTML;
        while ((vMatch = videoRegex.exec(bodyHTML)) !== null) { videoSet.add(vMatch[1]); }
        videos = Array.from(videoSet).map(id => ({ "video_url": id.startsWith('http') ? id : `https://www.amazon.${domain}/vdp/${id}` }));
    }
    const videoCount = videos.length;
    const hasVideo = videoCount > 0 ? "YES" : "NO";

    const marketplace = window.location.hostname.replace('www.', '');
    let deliveryLocation = "none";
    try {
        const glowLine2 = document.querySelector('div[id="glow-ingress-block"] > span[id="glow-ingress-line2"]');
        if (glowLine2) deliveryLocation = glowLine2.textContent.trim();
        if (deliveryLocation === "none" || !deliveryLocation) {
            const ingressLink = document.querySelector('a[id="contextualIngressPtLink"]');
            if (ingressLink) { const label = ingressLink.getAttribute("aria-label"); if (label) deliveryLocation = label.trim(); }
        }
        if (deliveryLocation && deliveryLocation !== "none") deliveryLocation = deliveryLocation.replace(/\u200c/g, '').replace(/&zwnj;/g, '').trim();
    } catch(e) {}

    const brandEl = document.querySelector('a[id="bylineInfo"]') || document.querySelector('div[id="bylineInfo"]');
    let brand = "none";
    if (brandEl) {
        brand = brandEl.textContent.trim();
        const prefixesToRemove = [/^Visit the\s+/i, /\s+Store$/i, /^Brand\s*:\s*/i, /^Marque\s*:\s*/i, /^Marke\s*:\s*/i, /^Marca\s*:\s*/i];
        prefixesToRemove.forEach(regex => { brand = brand.replace(regex, ''); });
        brand = brand.trim();
    }
    if (brand === "none" || brand === "") {
        try {
            const rhapsodyMatch = document.body.innerHTML.match(/rhapsodyARIngressViewModel\s*=\s*\{[\s\S]*?brand\s*:\s*["']([^"']+)["']/);
            if (rhapsodyMatch && rhapsodyMatch[1]) brand = rhapsodyMatch[1].trim();
        } catch (e) {}
    }

    // Optimization: Check visible price elements first
    const priceEl = document.querySelector('.a-price .a-offscreen') || document.querySelector('#priceblock_ourprice') || document.querySelector('#priceblock_dealprice');
    let displayPrice = "none";
    if (priceEl) {
        const txt = priceEl.textContent.trim();
        const num = txt.replace(/[^0-9.,]/g, '');
        if (num) displayPrice = num;
    }
    if (displayPrice === "none") {
        const priceMatch = document.body.innerHTML.match(/"priceAmount"\s*:\s*([\d.]+)/);
        if (priceMatch) displayPrice = priceMatch[1];
    }

    let stockStatus = "In Stock";
    const oosDiv = document.querySelector('div[id="outOfStockBuyBox_feature_div"]');
    const noFeaturedDiv = document.querySelector('div[id="a-popover-fod-cx-learnMore-popover-fodApi"]');
    const availabilitySpan = document.querySelector('#availability span');
    if (oosDiv) { stockStatus = "Out Of Stock"; } 
    else if (noFeaturedDiv) { const textSpan = noFeaturedDiv.querySelector('span.a-text-bold'); stockStatus = textSpan ? textSpan.textContent.trim() : "No featured offers available"; } 
    else if (availabilitySpan) {
        const availText = availabilitySpan.textContent.trim().toLowerCase();
        // Enhanced Multi-language "Out of Stock" checks
        const oosKeywords = ["currently unavailable", "out of stock", "unavailable", "actualmente no disponible", "non disponible", "nicht verfügbar", "non disponibile", "niet beschikbaar"];
        if (oosKeywords.some(kw => availText.includes(kw))) stockStatus = "Out Of Stock";
    }
    else { if (displayPrice === "none") stockStatus = "Unknown / No Price"; }

    let soldBy = "none";
    const sellerEl = document.querySelector('div[class*="offer-display-feature-text"] > span[class*="offer-display-feature-text-message"]') ||
                     document.querySelector('div[data-csa-c-slot-id="odf-feature-text-desktop-merchant-info"] > div[class*="offer-display-feature-text"]') ||
                     document.querySelector('#sellerProfileTriggerId') ||
                     document.querySelector('#merchant-info span');
    if (sellerEl) { soldBy = sellerEl.textContent.trim() || "none"; } 
    else { const merchantInfo = document.querySelector('#merchant-info'); if (merchantInfo) soldBy = merchantInfo.textContent.trim() || "none"; }

    const ratingEl = document.querySelector('a[class*="mvt-cm-cr-review-stars"] > span');
    const ratingRaw = ratingEl ? ratingEl.textContent.trim() : "none";
    const ratingVal = ratingRaw !== "none" ? parseFloat(ratingRaw.split(" ")[0].replace(/,/g, ".").replace(",", ".")) : 0;

    const reviewEl = document.querySelector('span[id="acrCustomerReviewText"]');
    let reviewsRaw = "none", reviewCount = 0;
    if (reviewEl) {
        reviewsRaw = reviewEl.textContent.trim().replace(/[()]/g, "").replace(/&nbsp;/g, "").replace(/Â/g, "").replace(/\s+/g, "").replace(/\./g, "");
        const digitStr = reviewsRaw.replace(/\D/g, ''); reviewCount = parseInt(digitStr) || 0;
    }

    let bsr = "none";
    try {
        let bsrParts = [];
        const cleanBsrText = (text) => text ? text.replace(/\(.*?See Top 100.*?\)/i, '').replace(/\(\s*\)/g, '').replace(/^:\s*/, '').replace(/\s+/g, ' ').trim() : "";
        const rankLabel = Array.from(document.querySelectorAll('span.a-text-bold')).find(el => el.textContent.includes('Best Sellers Rank'));
        if (rankLabel) {
            const container = rankLabel.closest('li');
            if (container) {
                const wrapper = container.querySelector('span.a-list-item') || container;
                let mainText = "";
                wrapper.childNodes.forEach(node => { if (node.nodeType === 1 && (node.classList.contains('a-text-bold') || node.nodeName === 'UL')) return; if (node.nodeType === 3) mainText += node.textContent; });
                let cleanedMain = cleanBsrText(mainText); if (cleanedMain) bsrParts.push(cleanedMain);
                const subList = wrapper.querySelector('ul'); if (subList) subList.querySelectorAll('li').forEach(li => { let t = cleanBsrText(li.textContent); if(t) bsrParts.push(t); });
            }
        }
        if (bsrParts.length === 0) {
            const bsrHeader = Array.from(document.querySelectorAll('th')).find(th => th.textContent.trim().includes('Best Sellers Rank'));
            if (bsrHeader) {
                const nextTd = bsrHeader.nextElementSibling;
                if (nextTd && nextTd.tagName === 'TD') {
                    const subList = nextTd.querySelector('ul');
                    if (subList) subList.querySelectorAll('li').forEach(li => { let t = cleanBsrText(li.textContent); if(t) bsrParts.push(t); });
                    else { let t = cleanBsrText(nextTd.textContent); if(t) bsrParts.push(t); }
                }
            }
        }
        if (bsrParts.length > 0) bsr = bsrParts.join(" | ");
    } catch(e) {}

    let freeDeliveryDate = "none", paidDeliveryDate = "none", primeOrFastestDeliveryDate = "none";
    const primaryDEX = document.querySelector('span[data-csa-c-type="element"][data-csa-c-content-id="DEXUnifiedCXPDM"]');
    if (primaryDEX) {
        const price = primaryDEX.getAttribute('data-csa-c-delivery-price');
        const time = primaryDEX.getAttribute('data-csa-c-delivery-time');
        if (price && time) {
            if (/\d/.test(price)) { paidDeliveryDate = `${price} - ${time}`; } 
            else { freeDeliveryDate = time; }
        }
    }
    const secondaryDEX = document.querySelector('span[data-csa-c-type="element"][data-csa-c-content-id="DEXUnifiedCXSDM"]');
    if (secondaryDEX) { const time = secondaryDEX.getAttribute('data-csa-c-delivery-time'); if (time) primeOrFastestDeliveryDate = time; }

    let bulletNodes = document.querySelectorAll('div[id="pqv-feature-bullets"] > ul > li');
    if (bulletNodes.length === 0) { bulletNodes = document.querySelectorAll('#feature-bullets li span.a-list-item, div[id*="productFactsDesktopExpander"] > div > ul > li > span[class*="a-list-item"]'); }
    const bulletsList = Array.from(bulletNodes).map(el => el.textContent.trim()).filter(text => text.length > 0);
    const bullets = bulletsList.join(" | ");
    const bulletCount = bulletsList.length;
    
    const descriptionEl = document.querySelector('div[id="pqv-description"]') || document.querySelector('div[id="productDescription"]');
    let description = "none";
    if (descriptionEl) {
        const clone = descriptionEl.cloneNode(true);
        const heading = clone.querySelector('h2'); if (heading) heading.remove();
        description = clone.textContent.trim();
    }
    const descLen = description !== "none" ? description.length : 0;

    const brandStoryImgs = Array.from(document.querySelectorAll('div[cel_widget_id="aplus-brand-story-card-2-media-asset"] img')).map(img => ({ "brand-story-image": cleanImageUrl(img.getAttribute('data-src') || img.src) }));
    const aPlusImgs = Array.from(document.querySelectorAll('div[class*="aplus-module-wrapper"] > img')).map(img => ({ "a-plus-image": cleanImageUrl(img.getAttribute('data-src') || img.src) }));
    const hasAplus = aPlusImgs.length > 0 ? "YES" : "NO";
    const hasBrandStory = brandStoryImgs.length > 0 ? "YES" : "NO";
    const hasBullets = bullets.length > 5 ? "YES" : "NO";
    const hasDescription = (description !== "none" && descLen > 5) ? "YES" : "NO";

    // --- Comparison Chart Extraction ---
    let comparisonAsins = [];
    try {
        const compTable = document.querySelector('table#HLCXComparisonTable');
        if (compTable) {
            const imageRow = compTable.querySelector('tr.comparison_table_image_row');
            if (imageRow) {
                const links = imageRow.querySelectorAll('a[href*="/dp/"]');
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    const match = href.match(/\/dp\/([A-Z0-9]{10})/);
                    if (match && !comparisonAsins.includes(match[1])) comparisonAsins.push(match[1]);
                });
            }
            if (comparisonAsins.length === 0) {
                const inputs = compTable.querySelectorAll('input[name="asin"]'); // Often hidden inputs
                inputs.forEach(inp => { if(inp.value && !comparisonAsins.includes(inp.value)) comparisonAsins.push(inp.value); });
            }
        }
    } catch(e) { console.log("Comparison Extraction Error", e); }

    // --- Enhanced LQS Calculation with Visual Breakdown ---
    let score = 0;
    let breakdown = []; // Stores strings like "Title Length OK (+10)" or "Missing Images (-15)"

    // Title
    if (metaTitle && metaTitle.length >= 80 && metaTitle.length <= 200) { 
        score += 10; 
        breakdown.push({ label: "Title Length (80-200)", score: 10, pass: true });
    } else {
        breakdown.push({ label: "Title Length (Rec: 80-200)", score: 0, pass: false });
    }

    // Images
    const imageCount = items.length;
    if (imageCount >= 7) {
        score += 15;
        breakdown.push({ label: "Images (7+)", score: 15, pass: true });
    } else {
        breakdown.push({ label: `Images Found: ${imageCount} (Rec: 7+)`, score: 0, pass: false });
    }

    // Bullets
    if (bulletCount >= 5) {
        score += 15;
        breakdown.push({ label: "Bullet Points (5+)", score: 15, pass: true });
    } else {
        breakdown.push({ label: `Bullet Points: ${bulletCount} (Rec: 5)`, score: 0, pass: false });
    }

    // Description
    if (descLen >= 100) {
        score += 5;
        breakdown.push({ label: "Description Length (100+ chars)", score: 5, pass: true });
    } else {
        breakdown.push({ label: "Description too short", score: 0, pass: false });
    }

    // Video
    if (videoCount > 0) {
        score += 15;
        breakdown.push({ label: "Video Content", score: 15, pass: true });
    } else {
        breakdown.push({ label: "Missing Video", score: 0, pass: false });
    }

    // A+ Content
    if (aPlusImgs.length > 0) {
        score += 20;
        breakdown.push({ label: "A+ Content", score: 20, pass: true });
    } else {
        breakdown.push({ label: "Missing A+ Content", score: 0, pass: false });
    }

    // Rating
    if (ratingVal >= 4.0) {
        score += 10;
        breakdown.push({ label: "Rating (4.0+)", score: 10, pass: true });
    } else {
        breakdown.push({ label: `Rating: ${ratingVal} (Rec: 4.0+)`, score: 0, pass: false });
    }

    // Reviews
    if (reviewCount > 15) {
        score += 10;
        breakdown.push({ label: "Review Count (15+)", score: 10, pass: true });
    } else {
        breakdown.push({ label: `Reviews: ${reviewCount} (Rec: 15+)`, score: 0, pass: false });
    }

    const lqs = score + "/100";

    return {
      found: true,
      url: window.location.href,
      title: document.title, 
      attributes: {
        marketplace, brand, metaTitle, mediaAsin, parentAsin, displayPrice, stockStatus, soldBy,
        rating: ratingRaw, reviews: reviewsRaw, bsr,
        freeDeliveryDate, paidDeliveryDate, primeOrFastestDeliveryDate,
        bulletsCount: bulletCount,
        bullets, description,
        variationExists, variationTheme, variationCount, variationFamily,
        brandStoryImgs, aPlusImgs, videos,
        hasAplus, hasBrandStory, hasVideo, hasBullets, hasDescription,
        lqs, lqsDetails: breakdown, // NEW: Export breakdown
        videoCount, deliveryLocation,
        aodData, // NEW: AOD Offers
        comparisonAsins
      },
      data: items
    };

  } catch (e) {
    console.error("Extraction error:", e);
    return { found: false, error: e.toString(), url: window.location.href };
  }
})();
