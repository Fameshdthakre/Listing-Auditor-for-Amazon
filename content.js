(async function() {
  try {
    // --- 0. Helper Functions ---
    const cleanImageUrl = (url) => {
      if (!url || url === "none") return "none";
      return url.replace(/\._[A-Z0-9,._-]+(\.[a-z]+)$/i, '$1');
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- 1. Expand Bullets (Async Interaction) ---
    const expander = document.querySelector('div[id*="feature-bullets"] .a-expander-prompt');
    if (expander) {
        expander.click();
        await sleep(500);
    }

    // --- 2. Robust Page Detection ---
    if (document.title.includes("Robot Check") || document.querySelector("form[action*='/errors/validateCaptcha']")) {
      return { found: true, error: "CAPTCHA_DETECTED", url: window.location.href, title: "Captcha Block" };
    }
    
    // Updated 404 Detection Logic
    if (document.title.includes("Page Not Found") || 
        document.querySelector("img[alt*='Dogs of Amazon']") || 
        document.querySelector('a[href*="/ref=cs_404_logo"]')) {
      return { found: true, error: "PAGE_NOT_FOUND_404", url: window.location.href, title: "Page Not Found" };
    }

    const pageSource = document.documentElement.outerHTML;

    // --- 3. Extract Attributes ---

    // Variants
    const jsonRegex = /\[\s*\{"hiRes":.*?"variant":.*?\}\]/s;
    const match = pageSource.match(jsonRegex);
    const rawData = match ? JSON.parse(match[0]) : [];
    // Applied cleanImageUrl here for Code Deduplication
    const items = rawData.map(item => ({
      variant: item.variant || "none",
      hiRes: cleanImageUrl(item.hiRes),
      large: cleanImageUrl(item.large)
    }));

    // New: Marketplace
    const marketplace = window.location.hostname.replace('www.', '');

													 // 3.1 Delivery Location (ZipCode extraction)
	let deliveryLocation = "none";
	try {
		// Attempt 1: Regex on page source for JSON data (most robust for hidden state)
		const zipMatch = pageSource.match(/"zipCode"\s*:\s*"([^"]+)"/);
		const countryMatch = pageSource.match(/"countryCode"\s*:\s*"([^"]+)"/);

		if (zipMatch && zipMatch[1] && countryMatch && countryMatch[1]) {
			deliveryLocation = `${countryMatch[1]} - ${zipMatch[1]}`;
		} else {
			// Attempt 2: Glow Ingress Line (Visual Element)
			const glowLine = document.querySelector('#glow-ingress-line2');
			if (glowLine) {
				deliveryLocation = glowLine.textContent.trim();
			}
		}
	} catch(e) {
		console.log("Loc extract error", e);
	}

    // Brand
    const brandEl = document.querySelector('a[id="bylineInfo"]') || document.querySelector('div[id="bylineInfo"]');
    let brand = "none";
    if (brandEl) {
        brand = brandEl.textContent.trim();
        const prefixesToRemove = [
            /^Visit the\s+/i,
            /\s+Store$/i,
            /^Brand\s*:\s*/i,
            /^Marque\s*:\s*/i,
            /^Marke\s*:\s*/i,
            /^Marca\s*:\s*/i
        ];
        prefixesToRemove.forEach(regex => {
            brand = brand.replace(regex, '');
        });
        brand = brand.trim();
    }

    // Fallback: Check rhapsodyARIngressViewModel for brand if DOM extraction failed
    if (brand === "none" || brand === "") {
        try {
            const rhapsodyMatch = pageSource.match(/rhapsodyARIngressViewModel\s*=\s*\{[\s\S]*?brand\s*:\s*["']([^"']+)["']/);
            if (rhapsodyMatch && rhapsodyMatch[1]) {
                brand = rhapsodyMatch[1].trim();
            }
        } catch (e) {
            // Ignore regex errors
        }
    }
    
    // Metadata
    const mediaAsinMatch = pageSource.match(/"mediaAsin"\s*:\s*"([^"]+)"/);
    const mediaAsin = mediaAsinMatch ? mediaAsinMatch[1] : "none";

    const parentAsinMatch = pageSource.match(/"parentAsin"\s*:\s*"([^"]+)"/);
    const parentAsin = parentAsinMatch ? parentAsinMatch[1] : "none";

    const metaTitleEl = document.querySelector('meta[name="title"]');
    const metaTitle = metaTitleEl ? metaTitleEl.getAttribute("content") : document.title;

    const priceMatch = pageSource.match(/"priceAmount"\s*:\s*([\d.]+)/);
    const displayPrice = priceMatch ? priceMatch[1] : "none";

    // Stock Status
    let stockStatus = "In Stock";
    const oosDiv = document.querySelector('div[id="outOfStockBuyBox_feature_div"]');
    const noFeaturedDiv = document.querySelector('div[id="a-popover-fod-cx-learnMore-popover-fodApi"]');
    const availabilitySpan = document.querySelector('#availability span');

    if (oosDiv) {
        stockStatus = "Out Of Stock";
    } else if (noFeaturedDiv) {
        const textSpan = noFeaturedDiv.querySelector('span.a-text-bold');
        stockStatus = textSpan ? textSpan.textContent.trim() : "No featured offers available";
    } else if (availabilitySpan) {
        const availText = availabilitySpan.textContent.trim().toLowerCase();
        if (availText.includes("currently unavailable") || availText.includes("out of stock")) {
             stockStatus = "Out Of Stock";
        }
    } else {
        if (displayPrice === "none") {
             stockStatus = "Unknown / No Price";
        }
    }

    // Sold By
    let soldBy = "none";
    const sellerEl = document.querySelector('div[class*="offer-display-feature-text"] > span[class*="offer-display-feature-text-message"]') ||
                     document.querySelector('div[data-csa-c-slot-id="odf-feature-text-desktop-merchant-info"] > div[class*="offer-display-feature-text"]') ||
                     document.querySelector('#sellerProfileTriggerId') ||
                     document.querySelector('#merchant-info span');
                     
    if (sellerEl) {
        soldBy = sellerEl.textContent.trim() || "none";
    } else {
        const merchantInfo = document.querySelector('#merchant-info');
        if (merchantInfo) {
            soldBy = merchantInfo.textContent.trim() || "none";
        }
    }

    // Ratings
    const ratingEl = document.querySelector('a[class*="mvt-cm-cr-review-stars"] > span');
    const ratingRaw = ratingEl ? ratingEl.textContent.trim() : "none";
    const ratingVal = ratingRaw !== "none" ? parseFloat(ratingRaw.split(" ")[0].replace(/,/g, ".").replace(",", ".")) : 0;

    // Reviews (Updated Logic)
    const reviewEl = document.querySelector('span[id="acrCustomerReviewText"]');
    let reviewsRaw = "none";
    let reviewCount = 0;
    if (reviewEl) {
        reviewsRaw = reviewEl.textContent.trim()
            .replace(/[()]/g, "")
            .replace(/&nbsp;/g, "")
            .replace(/Â/g, "")
            .replace(/\s+/g, "")
            .replace(/\./g, "");
            
        const digitStr = reviewsRaw.replace(/\D/g, ''); 
        reviewCount = parseInt(digitStr) || 0;
    }

    // Best Sellers Rank
    let bsr = "none";
    try {
        let bsrParts = [];
        const cleanBsrText = (text) => {
            if (!text) return "";
            return text.replace(/\(.*?See Top 100.*?\)/i, '').replace(/\(\s*\)/g, '').replace(/^:\s*/, '').replace(/\s+/g, ' ').trim();
        };

        const rankLabel = Array.from(document.querySelectorAll('span.a-text-bold')).find(el => el.textContent.includes('Best Sellers Rank'));
        if (rankLabel) {
            const container = rankLabel.closest('li');
            if (container) {
                const wrapper = container.querySelector('span.a-list-item') || container;
                let mainText = "";
                wrapper.childNodes.forEach(node => {
                    if (node.nodeType === 1 && (node.classList.contains('a-text-bold') || node.nodeName === 'UL')) return;
                    if (node.nodeType === 3) mainText += node.textContent;
                });
                let cleanedMain = cleanBsrText(mainText);
                if (cleanedMain) bsrParts.push(cleanedMain);

                const subList = wrapper.querySelector('ul');
                if (subList) {
                    subList.querySelectorAll('li').forEach(li => {
                        let cleanedSub = cleanBsrText(li.textContent);
                        if (cleanedSub) bsrParts.push(cleanedSub);
                    });
                }
            }
        }

        if (bsrParts.length === 0) {
            const tableHeaders = Array.from(document.querySelectorAll('th'));
            const bsrHeader = tableHeaders.find(th => th.textContent.trim().includes('Best Sellers Rank'));
            if (bsrHeader) {
                const nextTd = bsrHeader.nextElementSibling;
                if (nextTd && nextTd.tagName === 'TD') {
                    const subList = nextTd.querySelector('ul');
                    if (subList) {
                        subList.querySelectorAll('li').forEach(li => {
                            let cleanedSub = cleanBsrText(li.textContent);
                            if (cleanedSub) bsrParts.push(cleanedSub);
                        });
                    } else {
                        let cleanedText = cleanBsrText(nextTd.textContent);
                        if (cleanedText) bsrParts.push(cleanedText);
                    }
                }
            }
        }
        if (bsrParts.length > 0) bsr = bsrParts.join(" | ");
    } catch(e) { /* Ignore extraction errors */ }

    // Delivery Dates
    let freeDeliveryDate = "none";
    let primeDeliveryDate = "none";
    let fastestDeliveryDate = "none";

    const deliveryBlock = document.getElementById('mir-layout-DELIVERY_BLOCK');
    if (deliveryBlock) {
        // Pre-selectors for known locations
        
        // 1. PRIMARY MESSAGE (Updated for Paid logic)
        const primaryMessageSpan = deliveryBlock.querySelector('div[id*="mir-layout-DELIVERY_BLOCK"] > div[id*="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE"] > span[data-csa-c-delivery-price]');
        if (primaryMessageSpan) {
             const priceType = primaryMessageSpan.getAttribute('data-csa-c-delivery-price');
             const time = primaryMessageSpan.getAttribute('data-csa-c-delivery-time');
             
             if (time) {
                 if (priceType === "FREE") {
                     freeDeliveryDate = time;
                 } else if (/\d/.test(priceType)) {
                     // It's a price like "$6.99", treat as Paid Standard Delivery
                     freeDeliveryDate = `Pay: ${priceType}, ${time}`;
                 }
             }
        }
        
        // 2. SECONDARY MESSAGE
        const secondaryMessage = deliveryBlock.querySelector('div[id*="mir-layout-DELIVERY_BLOCK"] > div[id*="mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE"] > span[data-csa-c-delivery-price="FREE"]');
        if (secondaryMessage) {
             const time = secondaryMessage.getAttribute('data-csa-c-delivery-time');
             if(time) primeDeliveryDate = time;
        }

        // 3. TERTIARY MESSAGE (Fastest)
        const tertiaryMessage = deliveryBlock.querySelector('div[id*="mir-layout-DELIVERY_BLOCK"] > div[id*="mir-layout-DELIVERY_BLOCK-slot-SECONDARY_DELIVERY_MESSAGE"] > span[data-csa-c-delivery-price="fastest"]');
        if (tertiaryMessage) {
             const time = tertiaryMessage.getAttribute('data-csa-c-delivery-time');
             if(time) fastestDeliveryDate = time;
        }

        // Expanded Scan for all spans to capture new text formats or missed items
        const allDeliverySpans = Array.from(deliveryBlock.querySelectorAll('span'));
        
        const extractDate = (txt) => {
            // Regex to find patterns like "Wednesday, January 14" or "Wed, Jan 14"
            const dateRegex = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i;
            const match = txt.match(dateRegex);
            return match ? match[0] : null;
        };

        allDeliverySpans.forEach(span => {
            const text = span.textContent.trim();
            if (!text) return;
            
            const textLower = text.toLowerCase();
            let time = span.getAttribute('data-csa-c-delivery-time');
            
            // Fallback: If no attribute, try to extract date from text
            if (!time) {
                time = extractDate(text);
            }
            
            if (!time) return; // If we still have no date, skip

            // Free Delivery Logic
            if (textLower.includes("free delivery") && freeDeliveryDate === "none") {
                freeDeliveryDate = time;
            }
            
            // Prime Delivery Logic
            if (textLower.includes("prime members") && primeDeliveryDate === "none") {
                primeDeliveryDate = time;
            }
            
            // Fastest Delivery Logic (Case Insensitive)
            if (textLower.includes("fastest delivery") && fastestDeliveryDate === "none") {
                fastestDeliveryDate = time;
            }

            // Paid Standard Delivery Logic (e.g. "$6.99 delivery") fallback
            // Maps to freeDeliveryDate as the "Standard" slot if empty
            const paidMatch = text.match(/(\$\d+(?:\.\d{2})?)\s+delivery/i);
            if (paidMatch && freeDeliveryDate === "none") {
                 const price = paidMatch[1];
                 freeDeliveryDate = `Pay: ${price}, ${time}`;
            }
        });
    }

    // Bullets
    const bulletsList = Array.from(document.querySelectorAll('#feature-bullets li span.a-list-item, div[id*="productFactsDesktopExpander"] > div > ul > li > span[class*="a-list-item"]'))
      .map(el => el.textContent.trim())
      .filter(text => text.length > 0);
    const bullets = bulletsList.join(" | ");
    const bulletCount = bulletsList.length;
      
    // Description
    const descriptionEl = document.querySelector('div[id="productDescription"]');
    const description = descriptionEl ? descriptionEl.textContent.trim() : "none";
    const descLen = description !== "none" ? description.length : 0;

    // Variation Data
    const dimMatch = pageSource.match(/"dimensions"\s*:\s*(\[[^\]]*\])/);
    const variationExists = dimMatch ? "YES" : "NO";
    const variationTheme = dimMatch ? dimMatch[1] : "none";
    const countMatch = pageSource.match(/"num_total_variations"\s*:\s*(\d+)/);
    const variationCount = countMatch ? countMatch[1] : "none";

    // Robust Variation Family Parsing
    let variationFamily = "none";
    const scriptScripts = document.querySelectorAll('script');
    for (let script of scriptScripts) {
      if (script.textContent && script.textContent.includes('dimensionValuesDisplayData')) {
        const vMatch = script.textContent.match(/"dimensionValuesDisplayData"\s*:\s*(\{.*?\})\s*,/);
        if (vMatch) {
          try {
              const rawJson = vMatch[1];
              const parsedFamily = JSON.parse(rawJson);
              const asinList = Object.keys(parsedFamily);
              variationFamily = JSON.stringify(asinList);
          } catch(e) {
              variationFamily = "Error Parsing Family Data";
          }
          break;
        }
      }
    }

    const brandStoryImgs = Array.from(document.querySelectorAll('div[class="apm-brand-story-background-image"] > img'))
      .map(img => ({ "brand-story-image": cleanImageUrl(img.getAttribute('data-src') || img.src) }));

    const aPlusImgs = Array.from(document.querySelectorAll('div[class*="aplus-module-wrapper"] > img'))
      .map(img => ({ "a-plus-image": cleanImageUrl(img.getAttribute('data-src') || img.src) }));

    const videoSet = new Set();
    const videoRegex = /"holderId"\s*:\s*"holder([^"]+)"/g;
    let vMatch;
    while ((vMatch = videoRegex.exec(pageSource)) !== null) {
      videoSet.add(vMatch[1]);
    }


    
    const hostname = window.location.hostname;
    const domain = hostname.replace(/^www\.amazon\./, '');
    const videos = Array.from(videoSet).map(id => ({ 
      "video": `https://www.amazon.${domain}/vdp/${id}` 
    }));
    
	const videoCount = videos.length;
	
    // Auditor Alerts
    const hasAplus = aPlusImgs.length > 0 ? "YES" : "NO";
    const hasBrandStory = brandStoryImgs.length > 0 ? "YES" : "NO";
    const hasVideo = videos.length > 0 ? "YES" : "NO";
    const hasBullets = bullets.length > 5 ? "YES" : "NO";
    const hasDescription = (description !== "none" && descLen > 5) ? "YES" : "NO";

    // LQS
    let score = 0;
    if (metaTitle && metaTitle.length >= 80 && metaTitle.length <= 200) score += 10;
    const imageCount = items.length;
    if (imageCount >= 7) score += 15;
    if (bulletCount >= 5) score += 15;
    if (descLen >= 100) score += 5;
    if (videos.length > 0) score += 15;
    if (aPlusImgs.length > 0) score += 20;
    if (ratingVal >= 4.0) score += 10;
    if (reviewCount > 15) score += 10;
    const lqs = score + "/100";

    return {
      found: true,
      url: window.location.href,
      title: document.title,
      attributes: {
        marketplace,
        brand,
        metaTitle,
        mediaAsin,
        parentAsin,
        displayPrice,
        stockStatus,
        soldBy,
        rating: ratingRaw,
        reviews: reviewsRaw,
        bsr,
        freeDeliveryDate,
        primeDeliveryDate,
        fastestDeliveryDate,
        bullets,
        description,
        variationExists,
        variationTheme,
        variationCount,
        variationFamily,
        brandStoryImgs,
        aPlusImgs,
        videos,
        hasAplus,
        hasBrandStory,
        hasVideo,
        hasBullets,
        hasDescription,
        lqs
      },
      data: items
    };

  } catch (e) {
    console.error("Extraction error:", e);
    return { found: false, error: e.toString(), url: window.location.href };
  }
})();
