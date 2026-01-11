document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const resultsArea = document.getElementById('results');
  const statusDiv = document.getElementById('status');
  const selectAllCheckbox = document.getElementById('selectAll');
  const tabCurrent = document.getElementById('tabCurrent');
  const tabBulk = document.getElementById('tabBulk');
  const bulkSection = document.getElementById('bulkSection');
  const csvInput = document.getElementById('csvInput');
  const batchSizeInput = document.getElementById('batchSizeInput');
  const disableImagesInput = document.getElementById('disableImages');
  const fileStatus = document.getElementById('fileStatus');
  const popupWarning = document.getElementById('popupWarning');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const domainSelect = document.getElementById('domainSelect');
  
  // Dashboard Elements
  const dashboardView = document.getElementById('dashboardView');
  const statTotal = document.getElementById('statTotal');
  const statLqs = document.getElementById('statLqs');
  const statIssues = document.getElementById('statIssues');

  let allExtractedData = [];
  let isScanning = false;
  let mode = 'current'; // Default mode
  let rawCsvLines = []; // Store raw text for processing on Start
  
  // --- Multi-Marketplace Data ---
  const marketplaceData = {
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

  // Populate Dropdown
  Object.keys(marketplaceData).forEach(domain => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    domainSelect.appendChild(option);
  });
  if(marketplaceData['Amazon.com']) domainSelect.value = 'Amazon.com';

  // --- Input Validation for Batch Size ---
  batchSizeInput.addEventListener('input', () => {
      let val = parseInt(batchSizeInput.value, 10);
      if (val > 50) {
          batchSizeInput.value = 50;
      } else if (val < 1) {
          batchSizeInput.value = 1;
      }
  });

  // --- Helper: URL Builder & Normalizer ---
  const buildOrNormalizeUrl = (input) => {
    input = input.trim();
    if(!input) return null;

    const langPref = document.querySelector('input[name="langPref"]:checked').value;
    const selectedDomainKey = domainSelect.value;
    const config = marketplaceData[selectedDomainKey];
    
    const langParam = (langPref === 'english') ? config.en : config.native;

    if (input.startsWith('http://') || input.startsWith('https://')) {
        try {
            let url = new URL(input);
            const hostname = url.hostname.replace('www.', '');
            const matchingConfigKey = Object.keys(marketplaceData).find(key => hostname.endsWith(key.toLowerCase()));
            
            if (matchingConfigKey) {
                const domainConfig = marketplaceData[matchingConfigKey];
                const paramToApply = (langPref === 'english') ? domainConfig.en : domainConfig.native;
                
                if (!url.search.includes('language=') && !url.search.includes('currency=')) {
                    const separator = url.search ? '&' : '?';
                    let cleanHref = url.href.replace(/\/$/, "");
                    return cleanHref + separator + paramToApply.replace('?', '');
                }
            }
            return input;
        } catch(e) { return input; }
    } 
    else if (/^[A-Z0-9]{10}$/.test(input)) {
        let root = config.root;
        if (!root.endsWith('/')) root += '/';
        
        let finalUrl = root + input + langParam;
        return finalUrl;
    }
    
    return null;
  };

  // --- UI Switching ---
  tabCurrent.addEventListener('click', () => {
    mode = 'current';
    tabCurrent.classList.add('active');
    tabBulk.classList.remove('active');
    bulkSection.style.display = 'none';
    scanBtn.textContent = 'Start Audit (Current Tabs)';
    statusDiv.textContent = 'Ready to scan.';
  });

  tabBulk.addEventListener('click', () => {
    mode = 'bulk';
    tabBulk.classList.add('active');
    tabCurrent.classList.remove('active');
    bulkSection.style.display = 'block';
    scanBtn.textContent = 'Start Bulk Audit';
  });

  // --- File Reader ---
  csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const text = event.target.result;
      rawCsvLines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      fileStatus.textContent = `Loaded ${rawCsvLines.length} lines. Click Start to process.`;
    };
    reader.readAsText(file);
  });

  // --- Configuration ---
  const fieldConfig = {
    'lqs': { type: 'attr' },
    'marketplace': { type: 'attr' },
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
    'primeDeliveryDate': { type: 'attr' },
    'fastestDeliveryDate': { type: 'attr' },
    'hasBullets': { type: 'attr' },
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
    'videos': { type: 'attr' },
    'imgVariantCount': { type: 'calc' },
    'imgVariantDetails': { type: 'calc' },
    'url': { type: 'root' }
  };

  const cleanAmazonUrl = (url) => {
    if (!url || url === 'none') return null;
    return url.replace(/\._[A-Z0-9,._-]+\./i, '.');
  };

  selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.attr-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  });

  stopBtn.addEventListener('click', () => {
    isScanning = false;
    statusDiv.textContent = 'Stopping scan...';
    stopBtn.disabled = true;
  });

  // --- Main Scan Logic ---
  scanBtn.addEventListener('click', async () => {
    isScanning = true;
    scanBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    stopBtn.disabled = false;
    copyBtn.style.display = 'none';
    downloadBtn.style.display = 'none';
    popupWarning.style.display = 'block';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    resultsArea.style.display = 'block'; // Fallback view
    dashboardView.style.display = 'none'; // Hide dashboard until done
    resultsArea.value = '';
    allExtractedData = [];

    const shouldDisableImages = (mode === 'bulk' && disableImagesInput && disableImagesInput.checked);
    
    try {
      if (shouldDisableImages) {
        await chrome.contentSettings.images.set({
          primaryPattern: '*://*.amazon.com/*',
          setting: 'block'
        });
      }

      if (mode === 'current') {
        await processCurrentTabs();
      } else if (mode === 'bulk') {
        if (!rawCsvLines || rawCsvLines.length === 0) {
          throw new Error("No data loaded. Please upload a CSV/TXT file.");
        }
        
        const processedUrls = rawCsvLines
            .map(line => buildOrNormalizeUrl(line))
            .filter(url => url !== null);

        if (processedUrls.length === 0) {
             throw new Error("No valid URLs or ASINs found in file.");
        }

        await processBulkBatches(processedUrls);
      }

    } catch (error) {
      console.error(error);
      statusDiv.textContent = "Error: " + error.message;
    } finally {
        if (shouldDisableImages) {
            await chrome.contentSettings.images.set({
                primaryPattern: '*://*.amazon.com/*',
                setting: 'allow'
            });
        }
        finishScan();
    }
  });

  // --- 1. Process Current Tabs ---
  async function processCurrentTabs() {
    statusDiv.textContent = 'Identifying Amazon tabs...';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    // STRICT FILTERING APPLIED
    const validDomains = Object.keys(marketplaceData).map(d => d.toLowerCase());
    const amazonTabs = tabs.filter(tab => {
        if (!tab.url || tab.url.startsWith('chrome')) return false;
        try {
            const url = new URL(tab.url);
            const hostname = url.hostname.replace('www.', '').toLowerCase();
            return validDomains.some(d => hostname.endsWith(d));
        } catch(e) { return false; }
    });

    if (amazonTabs.length === 0) {
      statusDiv.textContent = "No valid Amazon tabs found.";
      return;
    }

    statusDiv.textContent = `Auditing ${amazonTabs.length} tabs...`;
    
    const promises = amazonTabs.map(async (tab, index) => {
       if (!isScanning) return null;
       const percent = Math.round(((index + 1) / amazonTabs.length) * 100);
       progressBar.style.width = `${percent}%`;
       return extractFromTab(tab.id, tab.url);
    });

    const results = await Promise.all(promises);
    allExtractedData = results.filter(r => r !== null && (r.found || r.error));
  }

  // --- Helper: Format Time ---
  function formatTime(ms) {
    if (!ms || ms < 0) return 'calculating...';
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)));

    if (hours > 0) return `${hours} hr ${minutes} min`;
    if (minutes > 0) return `${minutes} min ${seconds} sec`;
    return `${seconds} sec`;
  }

  // --- 2. Process Bulk Batches ---
  async function processBulkBatches(urlsToProcess) {
    let batchSize = parseInt(batchSizeInput.value, 10);
    if (isNaN(batchSize) || batchSize < 1) batchSize = 25;
    if (batchSize > 50) batchSize = 50; // Force cap at 50 per user request
    
    const total = urlsToProcess.length;
    let processedCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < total; i += batchSize) {
      if (!isScanning) break;

      const batch = urlsToProcess.slice(i, i + batchSize);
      const currentBatchNum = Math.ceil((i+1)/batchSize);
      const totalBatches = Math.ceil(total/batchSize);
      
      // Calculate Time Remaining
      let timeRemaining = 'calculating...';
      if (processedCount > 0) {
          const elapsedTime = Date.now() - startTime;
          const avgTimePerItem = elapsedTime / processedCount;
          const remainingItems = total - processedCount;
          const remainingMs = remainingItems * avgTimePerItem;
          timeRemaining = formatTime(remainingMs);
      }

      statusDiv.innerHTML = `Processing batch <b>${currentBatchNum} of ${totalBatches}</b>... (${processedCount}/${total})<br>Est. Completion in: <b>${timeRemaining}</b>`;
      
      const batchResults = await processSingleBatch(batch);
      allExtractedData.push(...batchResults);
      
      processedCount += batch.length;
      const percent = Math.round((processedCount / total) * 100);
      progressBar.style.width = `${percent}%`;

      if (i + batchSize < total) {
          await new Promise(r => setTimeout(r, 10000));
      }
    }
  }

  async function processSingleBatch(urls) {
    const tabs = [];
    for (const url of urls) {
      const tab = await chrome.tabs.create({ url: url, active: false });
      tabs.push(tab);
    }

    await new Promise(resolve => setTimeout(resolve, 10000)); 

    const extractionPromises = tabs.map(tab => extractFromTab(tab.id, tab.url)); 
    
    const results = await Promise.all(extractionPromises);
    
    const tabIds = tabs.map(t => t.id);
    await chrome.tabs.remove(tabIds);

    return results.filter(r => r !== null && (r.found || r.error));
  }

  async function extractFromTab(tabId, fallbackUrl) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      if (result && result.result) {
        return { tabId, ...result.result };
      }
    } catch (err) {
      return { error: "LOAD_TIMEOUT_OR_ERROR", url: fallbackUrl, title: "Error" };
    }
    return null;
  }

  function updateDashboard() {
      const total = allExtractedData.length;
      let totalLqs = 0;
      let issueCount = 0;

      allExtractedData.forEach(item => {
          if (item.attributes && item.attributes.lqs) {
              const score = parseInt(item.attributes.lqs.split('/')[0]);
              if (!isNaN(score)) totalLqs += score;
              
              // Count "Issues" (Low score or missing assets)
              if (score < 70) issueCount++;
          }
      });

      const avgLqs = total > 0 ? Math.round(totalLqs / total) : 0;

      statTotal.textContent = total;
      statLqs.textContent = avgLqs + '/100';
      statIssues.textContent = issueCount;
      
      // Show dashboard, hide raw text
      resultsArea.style.display = 'none';
      dashboardView.style.display = 'grid';
  }

  function finishScan(hasError = false) {
    isScanning = false;
    scanBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    popupWarning.style.display = 'none';
    progressContainer.style.display = 'none';

    if (allExtractedData.length > 0) {
        // Show Dashboard View instead of just JSON text
        updateDashboard();
        
        statusDiv.textContent = `Completed! Scanned ${allExtractedData.length} listings.`;
        copyBtn.style.display = 'block';
        downloadBtn.style.display = 'block';
        
        if (mode === 'bulk') {
          downloadBtn.click();
        }
    } else {
        if (!hasError) statusDiv.textContent = "Scan complete. No valid data found.";
    }
  }

  copyBtn.addEventListener('click', () => {
    // Copy the raw JSON to clipboard even if hidden
    const jsonStr = JSON.stringify(allExtractedData, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => copyBtn.textContent = originalText, 1500);
    });
  });

  downloadBtn.addEventListener('click', () => {
    if (allExtractedData.length === 0) return;

    const checkedBoxes = Array.from(document.querySelectorAll('.attr-checkbox:checked'));
    let csvHeader = "Status," + checkedBoxes.map(cb => cb.parentNode.textContent.trim()).join(",") + "\n";
    let csvBody = "";

    const cleanField = (text) => {
      if (text === null || text === undefined || text === 'none') return '"none"';
      if (typeof text === 'object') return `"${JSON.stringify(text).replace(/"/g, '""')}"`;
      return `"${String(text).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    };

    allExtractedData.forEach(tabData => {
      if (tabData.error) {
        csvBody += `${tabData.error} - ${tabData.title},"${tabData.url || 'Unknown'}"\n`;
        return;
      }

      let row = "SUCCESS,";
      checkedBoxes.forEach(cb => {
        const id = cb.value;
        const config = fieldConfig[id];
        let val = 'none';

        if (config) {
            if (config.type === 'attr') {
              val = tabData.attributes[id];
            } else if (config.type === 'root') {
              val = tabData[id];
            } else if (config.type === 'calc') {
              if (id === 'imgVariantCount') {
                val = tabData.data ? tabData.data.length : 0;
              } else if (id === 'imgVariantDetails') {
                val = tabData.data ? tabData.data.map(item => ({
                  variant: item.variant,
                  hiRes: cleanAmazonUrl(item.hiRes),
                  large: cleanAmazonUrl(item.large)
                })) : [];
              }
            }
        }
        row += cleanField(val) + ",";
      });
      csvBody += row.slice(0, -1) + "\n";
    });

    const csvContent = csvHeader + csvBody;
    const now = new Date();
    const pad = (num) => num.toString().padStart(2, '0');
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const year = now.getFullYear();
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const fileName = `Audit-Scraped_Data_Report_${month}-${day}-${year}_${hours}-${minutes}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
});
