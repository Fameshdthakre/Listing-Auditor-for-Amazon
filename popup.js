document.addEventListener('DOMContentLoaded', () => {
  // --- Elements ---
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
  const loginBtn = document.getElementById('loginBtn');
  
  // Dashboard Elements
  const dashboardView = document.getElementById('dashboardView');
  const statTotal = document.getElementById('statTotal');
  const statLqs = document.getElementById('statLqs');
  const statIssues = document.getElementById('statIssues');

  // --- State ---
  let mode = 'current'; 
  let rawCsvLines = [];
  let IS_LOGGED_IN = false; 
  let USER_INFO = null;
  const GUEST_LIMIT = 10;
  let countdownInterval = null;
  
  // --- Initialization ---

  // 1. Auth Check
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token && !chrome.runtime.lastError) fetchUserInfo(token);
  });

  // 2. Initial State Load (Restores UI if scanning)
  chrome.storage.local.get(['auditState'], (data) => {
    if (data.auditState) {
      renderState(data.auditState);
      // Restore Mode UI
      if(data.auditState.mode === 'bulk' && data.auditState.isScanning) {
        // Force visual update if running
        mode = 'bulk';
        tabBulk.classList.add('active');
        tabCurrent.classList.remove('active');
        bulkSection.style.display = 'block';
      }
    }
  });

  // 3. Listen for Live Updates
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.auditState) {
      renderState(changes.auditState.newValue);
    }
  });

  // --- Auth Handlers ---
  loginBtn.addEventListener('click', () => {
      if (IS_LOGGED_IN) {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
              if (token) chrome.identity.removeCachedAuthToken({ token: token }, () => {
                  IS_LOGGED_IN = false;
                  USER_INFO = null;
                  updateUIForAuth();
                  statusDiv.textContent = "Logged out successfully.";
              });
              else { IS_LOGGED_IN = false; updateUIForAuth(); }
          });
      } else {
          chrome.identity.getAuthToken({ interactive: true }, (token) => {
              if (chrome.runtime.lastError) {
                  alert("Login failed: " + chrome.runtime.lastError.message);
                  return;
              }
              fetchUserInfo(token);
          });
      }
  });

  function fetchUserInfo(token) {
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: 'Bearer ' + token } })
      .then(res => res.json())
      .then(user => { IS_LOGGED_IN = true; USER_INFO = user; updateUIForAuth(); })
      .catch(err => { console.error(err); statusDiv.textContent = "Error fetching profile."; });
  }

  function updateUIForAuth() {
      if (IS_LOGGED_IN) {
          const name = USER_INFO ? (USER_INFO.given_name || 'User') : 'Pro User';
          loginBtn.textContent = `Logout (${name})`;
          loginBtn.style.borderColor = "#22c55e"; 
          tabBulk.classList.remove('disabled');
          tabBulk.querySelector('.lock-icon').style.display = 'none';
          document.querySelectorAll('.pro-feature').forEach(el => { el.disabled = false; el.checked = true; });
          selectAllCheckbox.disabled = false;
      } else {
          loginBtn.textContent = "Login with Google";
          loginBtn.style.borderColor = "#e2e8f0";
          if (mode === 'bulk' && !document.getElementById('stopBtn').offsetParent) { // Only switch if not currently running
            tabCurrent.click();
          }
          tabBulk.classList.add('disabled');
          tabBulk.querySelector('.lock-icon').style.display = 'inline';
          document.querySelectorAll('.pro-feature').forEach(el => { el.checked = false; el.disabled = true; });
          selectAllCheckbox.checked = false;
          selectAllCheckbox.disabled = true;
      }
  }

  // --- Marketplaces & inputs ---
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

  Object.keys(marketplaceData).forEach(domain => {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    domainSelect.appendChild(option);
  });
  if(marketplaceData['Amazon.com']) domainSelect.value = 'Amazon.com';

  batchSizeInput.addEventListener('input', () => {
      let val = parseInt(batchSizeInput.value, 10);
      if (val > 30) batchSizeInput.value = 30;
      else if (val < 1) batchSizeInput.value = 1;
  });

  // --- URL Normalizer ---
  const buildOrNormalizeUrl = (input) => {
    input = input.trim();
    if(!input) return null;
    const langPref = document.querySelector('input[name="langPref"]:checked').value;
    const config = marketplaceData[domainSelect.value];
    const langParam = (langPref === 'english') ? config.en : config.native;

    if (input.startsWith('http')) {
        return input; 
    } else if (/^[A-Z0-9]{10}$/.test(input)) {
        let root = config.root;
        if (!root.endsWith('/')) root += '/';
        return root + input + langParam;
    }
    return null;
  };

  // --- Tab Switching ---
  tabCurrent.addEventListener('click', () => {
    mode = 'current';
    tabCurrent.classList.add('active');
    tabBulk.classList.remove('active');
    bulkSection.style.display = 'none';
    scanBtn.textContent = 'Start Audit (Current Tabs)';
  });

  tabBulk.addEventListener('click', () => {
    if (!IS_LOGGED_IN) { alert("Please Login."); return; }
    mode = 'bulk';
    tabBulk.classList.add('active');
    tabCurrent.classList.remove('active');
    bulkSection.style.display = 'block';
    scanBtn.textContent = 'Start Bulk Audit';
  });

  csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      const text = event.target.result;
      rawCsvLines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      fileStatus.textContent = `Loaded ${rawCsvLines.length} lines.`;
    };
    reader.readAsText(file);
  });

  // --- Main Controls ---
  
  scanBtn.addEventListener('click', async () => {
    let urlsToProcess = [];

    if (mode === 'current') {
       const tabs = await chrome.tabs.query({ currentWindow: true });
       const validDomains = Object.keys(marketplaceData).map(d => d.toLowerCase());
       urlsToProcess = tabs.filter(tab => {
            if (!tab.url) return false;
            try { return validDomains.some(d => new URL(tab.url).hostname.includes(d)); } catch(e){return false;}
       }).map(t => t.url);
       
       if(!IS_LOGGED_IN && urlsToProcess.length > GUEST_LIMIT) urlsToProcess = urlsToProcess.slice(0, GUEST_LIMIT);
       if(urlsToProcess.length === 0) { statusDiv.textContent = "No Amazon tabs found."; return; }

    } else {
       if (!IS_LOGGED_IN) { alert("Login required."); return; }
       if (rawCsvLines.length === 0) { alert("No CSV loaded."); return; }
       urlsToProcess = rawCsvLines.map(line => buildOrNormalizeUrl(line)).filter(u => u !== null);
       if(urlsToProcess.length === 0) { alert("No valid URLs."); return; }
    }

    const settings = {
        disableImages: (mode === 'bulk' && disableImagesInput.checked)
    };
    
    // Start Background Scan
    chrome.runtime.sendMessage({
        action: 'START_SCAN',
        payload: { urls: urlsToProcess, mode, settings }
    });
  });

  stopBtn.addEventListener('click', () => {
     chrome.runtime.sendMessage({ action: 'STOP_SCAN' });
  });

  // --- Rendering & Logic Sync ---

  function renderState(state) {
      if (!state) return;
      
      const { isScanning, processedCount, urlsToProcess, results, statusMessage, nextActionTime } = state;
      const total = urlsToProcess.length;

      // 1. Controls Visibility
      if (isScanning) {
          scanBtn.style.display = 'none';
          stopBtn.style.display = 'block';
          progressContainer.style.display = 'block';
          popupWarning.style.display = 'block'; 
          popupWarning.textContent = "Running in Background... You can close this popup.";
          popupWarning.style.color = "#059669"; 
          popupWarning.style.backgroundColor = "#d1fae5";
          popupWarning.style.borderColor = "#a7f3d0";
          downloadBtn.style.display = 'none';
          dashboardView.style.display = 'none';
          copyBtn.style.display = 'none';
      } else {
          scanBtn.style.display = 'block';
          stopBtn.style.display = 'none';
          progressContainer.style.display = 'none';
          popupWarning.style.display = 'none';
          
          if (results && results.length > 0) {
              downloadBtn.style.display = 'block';
              copyBtn.style.display = 'block';
              updateDashboard(results);
          }
      }

      // 2. Status & Progress
      statusDiv.innerHTML = statusMessage;
      if (total > 0) {
          const pct = Math.round((processedCount / total) * 100);
          progressBar.style.width = `${pct}%`;
      }

      // 3. Countdown Timer (Visual only)
      if (countdownInterval) clearInterval(countdownInterval);
      
      if (isScanning && nextActionTime && nextActionTime > Date.now()) {
          const updateTimer = () => {
             const secondsLeft = Math.ceil((nextActionTime - Date.now()) / 1000);
             if (secondsLeft <= 0) {
                 clearInterval(countdownInterval);
                 statusDiv.innerHTML = "Processing next step...";
             } else {
                 const baseMsg = statusMessage.split('...')[0]; 
                 statusDiv.innerHTML = `${baseMsg}...<br>Next action in: <b>${secondsLeft}s</b>`;
             }
          };
          updateTimer(); // run once immediately
          countdownInterval = setInterval(updateTimer, 1000);
      }
  }

  // --- Dashboard & Reporting ---

  function updateDashboard(results) {
      let totalLqs = 0;
      let issueCount = 0;
      results.forEach(item => {
          if (item.attributes && item.attributes.lqs) {
              const score = parseInt(item.attributes.lqs.split('/')[0]);
              if (!isNaN(score)) totalLqs += score;
              if (score < 70) issueCount++;
          }
      });
      const avg = results.length ? Math.round(totalLqs / results.length) : 0;
      
      statTotal.textContent = results.length;
      statLqs.textContent = avg + '/100';
      statIssues.textContent = issueCount;
      
      resultsArea.style.display = 'none';
      dashboardView.style.display = 'grid';
  }

  // CSV Configuration
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
    'deliveryLocation': { type: 'attr' }, 
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
	'videoCount': { type: 'attr' },    
    'videos': { type: 'attr' },
    'imgVariantCount': { type: 'calc' },
    'imgVariantDetails': { type: 'calc' },
    'url': { type: 'root' }


  };

  const cleanAmazonUrl = (url) => {
    if (!url || url === 'none') return null;
    return url.replace(/\._[A-Z0-9,._-]+\./i, '.');
  };

  downloadBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('auditState');
    const results = data.auditState ? data.auditState.results : [];

    if (!results || results.length === 0) return;

    const checkedBoxes = Array.from(document.querySelectorAll('.attr-checkbox:checked'));
    let csvHeader = "Status," + checkedBoxes.map(cb => cb.parentNode.textContent.trim()).join(",") + "\n";
    let csvBody = "";

    const cleanField = (text) => {
      if (text === null || text === undefined || text === 'none') return '"none"';
      if (typeof text === 'object') return `"${JSON.stringify(text).replace(/"/g, '""')}"`;
      return `"${String(text).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    };

    results.forEach(tabData => {
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
            if (config.type === 'attr') val = tabData.attributes[id];
            else if (config.type === 'root') val = tabData[id];
            else if (config.type === 'calc') {
              if (id === 'imgVariantCount') val = tabData.data ? tabData.data.length : 0;
              else if (id === 'imgVariantDetails') {
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

	// 2. Filename Format
	const now = new Date();
	const pad = (num) => num.toString().padStart(2, '0');
	const fileName = `Listing-Auditor_Report_${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

    const blob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
  
  selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.attr-checkbox:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
  });
  
  copyBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get('auditState');
      const results = data.auditState ? data.auditState.results : [];
      navigator.clipboard.writeText(JSON.stringify(results, null, 2));
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy JSON Data', 1500);
  });
});
