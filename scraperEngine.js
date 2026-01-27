
// scraperEngine.js - Core Scraping Utilities & Data Processing

export const marketplaceData = {
    'Amazon.com': { root: 'https://www.amazon.com/dp/', en: '?language=en_US', native: '?language=en_US' },
    'Amazon.ca': { root: 'https://www.amazon.ca/dp/', en: '?language=en_CA', native: '?language=en_CA' },
    'Amazon.co.uk': { root: 'https://www.amazon.co.uk/dp/', en: '?currency=USD', native: '?currency=GBP' },
    'Amazon.de': { root: 'https://www.amazon.de/dp/', en: '?language=en_GB', native: '?language=de_DE' },
    'Amazon.fr': { root: 'https://www.amazon.fr/dp/', en: '?language=en_GB', native: '?language=fr_FR' },
    'Amazon.it': { root: 'https://www.amazon.it/dp/', en: '?language=en_GB', native: '?language=it_IT' },
    'Amazon.es': { root: 'https://www.amazon.es/dp/', en: '?language=en_GB', native: '?language=es_ES' },
    'Amazon.nl': { root: 'https://www.amazon.nl/dp/', en: '?language=en_GB', native: '?language=nl_NL' },
    'Amazon.se': { root: 'https://www.amazon.se/dp/', en: '?language=en_GB', native: '?language=sv_SE' },
    'Amazon.com.be': { root: 'https://www.amazon.com.be/dp/', en: '?language=en_GB', native: '?language=fr_BE' },
    'Amazon.com.au': { root: 'https://www.amazon.com.au/dp/', en: '?currency=AUD', native: '?currency=AUD' },
    'Amazon.sg': { root: 'https://www.amazon.sg/dp/', en: '?currency=SGD', native: '?currency=SGD' },
    'Amazon.ae': { root: 'https://www.amazon.ae/dp/', en: '?language=en_AE', native: '?language=ar_AE' },
    'Amazon.sa': { root: 'https://www.amazon.sa/dp/', en: '?language=en_AE', native: '?language=ar_AE' },
    'Amazon.eg': { root: 'https://www.amazon.eg/dp/', en: '?language=en_AE', native: '?language=ar_AE' },
    'Amazon.in': { root: 'https://www.amazon.in/dp/', en: '?language=en_IN', native: '?language=hi_IN' },
    'Amazon.co.jp': { root: 'https://www.amazon.co.jp/dp/', en: '?language=en_US', native: '?language=ja_JP' }
};

export const getVendorCentralDomain = (marketplace) => {
    const na = ['Amazon.com', 'Amazon.ca'];
    const eu = ['Amazon.co.uk', 'Amazon.de', 'Amazon.fr', 'Amazon.it', 'Amazon.es', 'Amazon.nl', 'Amazon.se', 'Amazon.com.be', 'Amazon.pl'];
    const au = ['Amazon.com.au'];

    if (na.includes(marketplace)) return 'vendorcentral.amazon.com';
    if (eu.includes(marketplace)) return 'vendorcentral.amazon.co.uk';
    if (au.includes(marketplace)) return 'vendorcentral.amazon.com.au';

    return 'vendorcentral.amazon.com'; // Default
};

export const buildOrNormalizeUrl = (input, domain = 'Amazon.com', langPref = 'english') => {
    input = input.trim();
    if(!input) return null;
    const config = marketplaceData[domain] || marketplaceData['Amazon.com'];
    const langParam = (langPref === 'english') ? config.en : config.native;

    if (input.startsWith('http')) {
        if (!input.includes(langParam)) {
            const separator = input.includes('?') ? '&' : '?';
            const cleanParam = separator === '&' ? langParam.replace('?', '') : langParam;
            return input + separator + cleanParam;
        }
        return input;
    } else if (/^[A-Z0-9]{10}$/.test(input)) {
        let root = config.root;
        if (!root.endsWith('/')) root += '/';
        return root + input + langParam;
    }
    return null;
};

export const csvLineParser = (str) => {
    const arr = [];
    let quote = false;
    let col = '';
    for (let c of str) {
        if (c === '"') { quote = !quote; }
        else if (c === ',' && !quote) { arr.push(col.trim()); col = ''; }
        else { col += c; }
    }
    arr.push(col.trim());
    return arr;
};

export const parseAuditType2Csv = (lines) => {
    const headers = csvLineParser(lines[0]).map(h => h.toLowerCase().replace(/['"]+/g, '').trim());
    const required = ['item_name', 'bullet_point', 'product_description', 'videos', 'aplus_image_modules', 'brand_story_images'];

    // Determine if this is likely a Type 2 Audit
    const hasComparisonData = required.some(r => headers.includes(r));
    const asinIndex = headers.findIndex(h => h === 'asin' || h === 'url' || h === 'query_asin');

    if (asinIndex === -1) return null; // Must have ASIN/URL

    const structuredData = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = csvLineParser(lines[i]);
        if (!cols[asinIndex]) continue;

        const rowData = {
            url: cols[asinIndex].replace(/['"]+/g, ''),
            auditType: hasComparisonData ? 'type2' : 'type1',
            comparisonData: {}
        };

        if (hasComparisonData) {
            required.forEach(field => {
                const idx = headers.indexOf(field);
                if (idx !== -1) {
                    let val = cols[idx];
                    // Attempt to parse JSON/Array strings like "[link1, link2]"
                    if (val && (val.startsWith('[') || val.includes(',')) && (field.includes('videos') || field.includes('images'))) {
                        try {
                            // If wrapped in [], parse as JSON, else split by comma
                            if (val.startsWith('[') && val.endsWith(']')) {
                                // Fix non-quoted items if necessary or just try parse
                                rowData.comparisonData[field] = JSON.parse(val.replace(/'/g, '"'));
                            } else {
                                rowData.comparisonData[field] = val.split(',').map(s => s.trim());
                            }
                        } catch(e) {
                            rowData.comparisonData[field] = val; // Fallback to raw string
                        }
                    } else {
                        rowData.comparisonData[field] = val;
                    }
                }
            });
        }
        structuredData.push(rowData);
    }
    return structuredData;
};

export const cleanAmazonUrl = (url) => { if (!url || url === 'none') return null; return url.replace(/\._[A-Z0-9,._-]+\./i, '.'); };

export const cleanField = (text) => {
    if (text === null || text === undefined || text === 'none') return '"none"';
    if (typeof text === 'object') return `"${JSON.stringify(text).replace(/"/g, '""')}"`;
    return `"${String(text).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
};

// Export Helpers & Strict Column Definitions

// 1. Scraping Mode Columns (Strict)
export const SCRAPING_COLUMNS = [
    'marketplace', 'deliveryLocation', 'queryASIN', 'mediaAsin', 'url', 'parentAsin', 'brand', 'metaTitle',
    'bullets', 'bulletsCount', 'description', 'displayPrice', 'soldBy',
    'freeDeliveryDate', 'primeOrFastestDeliveryDate', 'paidDeliveryDate',
    'rating', 'reviews', 'bsr', 'imgVariantCount', 'imgVariantDetails',
    'aPlusImgs', 'brandStoryImgs', 'hasAplus', 'hasBrandStory', 'hasBullets', 'hasDescription',
    'variationExists', 'hasVideo', 'lqs', 'stockStatus',
    'variationFamily', 'variationCount', 'variationTheme', 'videos', 'videoCount'
];

// 2. Audit Mode Columns (Superset including booleans and counts)
export const AUDIT_COLUMNS = [
    ...SCRAPING_COLUMNS,
    // Add new Auditor fields
    'Status', 'Audit Note',
    'Matches on Amazon PDP', 'Missing on Amazon PDP', 'Extra on Amazon PDP',
    'PDP Self-Duplicated', 'VC Self-Duplicated',
    'VC Images Count', 'PDP Images Count', 'VC PageURL'
];

export const MASTER_COLUMNS = [
  { key: 'status', header: 'status' },
  { key: 'marketplace', header: 'marketplace' },
  { key: 'deliveryLocation', header: 'delivery_location' },
  { key: 'url', header: 'page_url' },
  { key: 'queryASIN', header: 'query_asin' },
  { key: 'mediaAsin', header: 'page_asin' },
  { key: 'parentAsin', header: 'parent_asin' },
  { key: 'brand', header: 'brand' },
  { key: 'metaTitle', header: 'item_name' },
  { key: 'bullets', header: 'bullet_point' },
  { key: 'bulletsCount', header: 'bullet_point_count' },
  { key: 'description', header: 'product_description' },
  { key: 'displayPrice', header: 'list_price' },
  { key: 'soldBy', header: 'sold_by' },
  { key: 'freeDeliveryDate', header: 'free_delivery_date' },
  { key: 'primeOrFastestDeliveryDate', header: 'prime_fastest_delivery_date' },
  { key: 'paidDeliveryDate', header: 'paid_delivery_date' },
  { key: 'rating', header: 'rating' },
  { key: 'reviews', header: 'reviews' },
  { key: 'bsr', header: 'best_sellers_rank' },
  { key: 'imgVariantCount', header: 'product_image_count' },
  { key: 'imgVariantDetails', header: 'product_image_details' },
  // Audit Specific Below
  { key: 'lqs', header: 'listing_quality_score' },
  { key: 'stockStatus', header: 'stock_status' },
  { key: 'hasBullets', header: 'has_bullet_point' },
  { key: 'hasDescription', header: 'has_product_description' },
  { key: 'hasVariation', header: 'has_variation' }, // mapped from variationExists
  { key: 'variationTheme', header: 'variation_theme' },
  { key: 'variationCount', header: 'variation_family_count' },
  { key: 'variationFamily', header: 'variation_family' },
  { key: 'hasBrandStory', header: 'has_brand_story' },
  { key: 'brandStoryImgs', header: 'brand_story_images' },
  { key: 'hasAplus', header: 'has_aplus_modules' },
  { key: 'aPlusImgs', header: 'aplus_image_modules' },
  { key: 'hasVideo', header: 'has_video' },
  { key: 'videoCount', header: 'videos_count' },
  { key: 'videos', header: 'videos' },
  // New Auditor Fields
  { key: 'Status', header: 'audit_status' },
  { key: 'Audit Note', header: 'audit_note' },
  { key: 'Matches on Amazon PDP', header: 'matches_on_pdp' },
  { key: 'Missing on Amazon PDP', header: 'missing_on_pdp' },
  { key: 'Extra on Amazon PDP', header: 'extra_on_pdp' },
  { key: 'PDP Self-Duplicated', header: 'pdp_duplicates' },
  { key: 'VC Self-Duplicated', header: 'vc_duplicates' },
  { key: 'VC Images Count', header: 'vc_image_count' },
  { key: 'PDP Images Count', header: 'pdp_image_count' },
  { key: 'VC PageURL', header: 'vc_url' }
];

export const forcedFields = ['marketplace', 'deliveryLocation', 'mediaAsin', 'url', 'queryASIN'];
export const fieldConfig = {
  'lqs': { type: 'attr' },
  'marketplace': { type: 'attr' },
  'queryASIN': { type: 'root' },
  'deliveryLocation': { type: 'attr' },
  'brand': { type: 'attr' },
  'metaTitle': { type: 'attr' },
  'mediaAsin': { type: 'attr' },
  'parentAsin': { type: 'attr' },
  'displayPrice': { type: 'attr' },
  'stockStatus': { type: 'attr' },
  'soldBy': { type: 'attr' },
  'rating': { type: 'attr' },
  'reviews': { type: 'attr' },
  'bsr': { type: 'attr' },
  'freeDeliveryDate': { type: 'attr' },
  'paidDeliveryDate': { type: 'attr' },
  'primeOrFastestDeliveryDate': { type: 'attr' },
  'hasBullets': { type: 'attr' },
  'bulletsCount': { type: 'attr' },
  'bullets': { type: 'attr' },
  'hasDescription': { type: 'attr' },
  'description': { type: 'attr' },
  'variationExists': { type: 'attr' },
  'variationTheme': { type: 'attr' },
  'variationCount': { type: 'attr' },
  'variationFamily': { type: 'attr' },
  'hasBrandStory': { type: 'attr' },
  'brandStoryImgs': { type: 'attr' },
  'hasAplus': { type: 'attr' },
  'aPlusImgs': { type: 'attr' },
  'hasVideo': { type: 'attr' },
  'videoCount': { type: 'attr' },
  'videos': { type: 'attr' },
  'imgVariantCount': { type: 'calc' },
  'imgVariantDetails': { type: 'calc' },
  'url': { type: 'root' },
  'Status': { type: 'root' },
  'Audit Note': { type: 'root' },
  'Matches on Amazon PDP': { type: 'root' },
  'Missing on Amazon PDP': { type: 'root' },
  'Extra on Amazon PDP': { type: 'root' },
  'PDP Self-Duplicated': { type: 'root' },
  'VC Self-Duplicated': { type: 'root' },
  'VC Images Count': { type: 'root' },
  'PDP Images Count': { type: 'root' },
  'VC PageURL': { type: 'root' }
};
