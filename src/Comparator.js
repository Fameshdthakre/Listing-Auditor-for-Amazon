
/**
 * Compares the scraped data from Vendor Central (VC) and Product Detail Page (PDP).
 * @param {string} queryAsin - The ASIN requested.
 * @param {Object} vcRes - The result object from scraping VC.
 * @param {Object} pdpRes - The result object from scraping PDP.
 * @param {string} vcUrl - The URL of the VC page.
 * @param {string} pdpUrl - The URL of the PDP page.
 * @returns {Object} The audit result object.
 */
export function processAudit(queryAsin, vcRes, pdpRes, vcUrl, pdpUrl) {
  const filterSwch = (img) => img.variant !== 'SWCH';
  const vcImages = (vcRes?.data || []).filter(filterSwch);
  const pdpImages = (pdpRes?.data || []).filter(filterSwch);
  const pageAsin = pdpRes?.mediaAsin || "none";
  // Merge existing attributes if available
  const attributes = pdpRes?.attributes || {};

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
  const vcDuplicates = [];
  vcImages.forEach(img => {
    const id = getImageId(img.large);
    if (id) {
      if (vcMap.has(id)) vcDuplicates.push(`${img.variant} (${id})`);
      vcMap.set(id, img.variant);
    }
  });

  const pdpMap = new Map();
  const pdpDuplicates = [];
  pdpImages.forEach(img => {
    const id = getImageId(img.large);
    if (id) {
      if (pdpMap.has(id)) pdpDuplicates.push(`${img.variant} (${id})`);
      pdpMap.set(id, img.variant);
    }
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
    "Audit Note": auditNote,
    "Matches on Amazon PDP": matches.join('; ') || "None",
    "Missing on Amazon PDP": missing.join('; ') || "None",
    "Extra on Amazon PDP": extra.join('; ') || "None",
    "PDP Self-Duplicated": pdpDuplicates.join('; ') || "None",
    "VC Self-Duplicated": vcDuplicates.join('; ') || "None",
    "PDP Images": JSON.stringify(pdpImages),
    "PDP Images Count": pdpImages.length,
    "PDP PageURL": pdpUrl,
    "VC Images": JSON.stringify(vcImages),
    "VC Images Count": vcImages.length,
    "VC PageURL": vcUrl,
    "attributes": attributes
  };
}

export function createErrorResult(queryAsin, type, vcUrl, pdpUrl, domain, rawMsg = "") {
    return {
      "Status": type,
      "PageASIN": "none",
      "QueryASIN": queryAsin,
      "Audit Note": `Error: ${type} ${rawMsg ? '('+rawMsg+')' : ''}`,
      "Matches on Amazon PDP": "None",
      "Missing on Amazon PDP": "None",
      "Extra on Amazon PDP": "None",
      "PDP Self-Duplicated": "None",
      "VC Self-Duplicated": "None",
      "PDP Images": "[]",
      "PDP Images Count": 0,
      "PDP PageURL": pdpUrl,
      "VC Images": "[]",
      "VC Images Count": 0,
      "VC PageURL": vcUrl,
      "attributes": {}
    };
  }
