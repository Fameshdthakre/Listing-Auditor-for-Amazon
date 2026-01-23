(function() {
  try {
    const url = window.location.href;
    const hostname = window.location.hostname;
    const pageSource = document.documentElement.innerHTML;

    // Helper to clean Amazon image URLs (remove dimension tags)
    const cleanImageUrl = (url) => {
      if (!url) return "none";
      return url.replace(/\._[A-Z]{2}[0-9]+_,?[0-9]*_/, '').replace(/\._.+_\./, '.');
    };

    // Extract mediaAsin from page source for redirect detection
    const mediaAsinMatch = pageSource.match(/"mediaAsin"\s*:\s*"([^"]+)"/);
    const mediaAsin = mediaAsinMatch ? mediaAsinMatch[1] : "none";

    // ==========================================
    // LOGIC 1: AMAZON PDP SCRAPER
    // ==========================================
    if (hostname.includes('amazon') && url.includes('/dp/')) {
      // Variants extraction using the requested regex logic
      const jsonRegex = /\[\s*\{"hiRes":.*?"variant":.*?\}\]/s;
      const match = pageSource.match(jsonRegex);
      const rawData = match ? JSON.parse(match[0]) : [];
      
      const extractedData = rawData.map(item => ({
        variant: item.variant || "none",
        large: cleanImageUrl(item.large)
      }));

      return {
        type: 'PDP',
        found: true,
        url: window.location.href,
        mediaAsin: mediaAsin,
        data: extractedData
      };
    }

    // ==========================================
    // LOGIC 2: VENDOR CENTRAL SCRAPER
    // ==========================================
    else {
      const h3TitleEl = document.querySelector('h3[id="title"]');
      const pageTitle = h3TitleEl ? h3TitleEl.innerText.trim() : document.title;

      const urlParams = new URLSearchParams(window.location.search);
      const asin = urlParams.get('asins') || "none";

      const selector = 'div[data-testid*="image-wrapper"] > img[class*="variantImage"]';
      const images = document.querySelectorAll(selector);
      const extractedData = [];

      images.forEach(img => {
        extractedData.push({
          variant: img.alt || "none", 
          large: cleanImageUrl(img.src)
        });
      });

      return {
        type: 'VC',
        found: extractedData.length > 0,
        url: window.location.href,
        title: pageTitle,
        asin: asin,
        mediaAsin: mediaAsin,
        data: extractedData
      };
    }

  } catch (e) {
    console.error("Scraping error:", e);
    return { found: false, error: e.toString(), url: window.location.href, mediaAsin: "none" };
  }
})();