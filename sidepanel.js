// import { app, db } from './firebase/firebase-config.js';
//   import { doc, setDoc, getDoc } from './firebase/firebase-firestore.js';
//   import { GoogleAuthProvider, signInWithCredential } from './firebase/firebase-auth.js'; // Assuming auth is available
  import { MS_CLIENT_ID, MS_AUTH_URL, MS_SCOPES } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopBtn');
  // const copyBtn = document.getElementById('copyBtn'); // Removed from HTML
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadXlsxBtn = document.getElementById('downloadXlsxBtn'); 
  const pushSheetBtn = document.getElementById('pushSheetBtn'); 
  const pushExcelBtn = document.getElementById('pushExcelBtn');
  const previewBtn = document.getElementById('previewBtn'); 
  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const statusDiv = document.getElementById('status');
  const progressCountDiv = document.getElementById('progressCount'); 
  const selectAllCheckbox = document.getElementById('selectAll');
  const auditSelectAll = document.getElementById('auditSelectAll');
  const downloadErrorsBtn = document.getElementById('downloadErrorsBtn');
  
  // Tabs & Sections
  const tabCurrent = document.getElementById('tabCurrent');
  const tabBulk = document.getElementById('tabBulk');
  const tabCatalogueSetup = document.getElementById('tabCatalogueSetup');

  const bulkSection = document.getElementById('bulkSection');
  const currentSection = document.getElementById('currentSection'); 
  const catalogueSection = document.getElementById('catalogueSection');
  
  const pasteLinksBtn = document.getElementById('pasteLinksBtn'); 
  const snapshotBtn = document.getElementById('snapshotBtn'); 
  const pasteStatus = document.getElementById('pasteStatus'); 
  
  const csvInput = document.getElementById('csvInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const importCatalogueBtn = document.getElementById('importCatalogueBtn');
  const disableImagesInput = document.getElementById('disableImages');
  const fileStatus = document.getElementById('fileStatus');

  // Catalogue Setup / Auditor Elements
  const catalogueInput = document.getElementById('catalogueInput');
  const downloadCatalogueTemplateBtn = document.getElementById('downloadCatalogueTemplateBtn');
  const triggerImportBtn = document.getElementById('triggerImportBtn');
  const catalogueImportStatus = document.getElementById('catalogueImportStatus');
  const exportCatalogueBtn = document.getElementById('exportCatalogueBtn');

  // Trigger File Input logic
  if (triggerImportBtn && catalogueInput) {
      triggerImportBtn.addEventListener('click', () => catalogueInput.click());
      catalogueInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], catalogueImportStatus, 'auditor'));
  }

  // Export Catalogue Logic
  if (exportCatalogueBtn) {
      exportCatalogueBtn.addEventListener('click', () => {
          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              const container = data[key];
              if (!container || !container[currentCatalogueId]) return;
              const list = container[currentCatalogueId].items;
              if (list.length === 0) { alert("Catalogue is empty."); return; }

              if (typeof XLSX === 'undefined') { alert("XLSX library not found."); return; }

              const wb = XLSX.utils.book_new();
              const headers = [
                  "QueryASIN", "Marketplace",
                  "Brand", "Source Title", "Source Bullets", "Source Description",
                  "Reference Rating", "Reference Reviews",
                  "Approved Images", "Approved Video Count",
                  "Approved Brand Story Images", "Approved A+ Modules",
                  "Approved Comparison ASINs",
                  "Approved Variation Count", "Approved Variation Theme",
                  "Approved Seller", "Approved Price",
                  "Max Delivery Days"
              ];

              const rows = list.map(item => {
                  const comp = item.comparisonData || {};
                  return [
                      item.asin,
                      "", // Marketplace placeholder
                      item.expected?.brand || comp.expected_brand,
                      item.expected?.title || comp.expected_title,
                      item.expected?.bullets || comp.expected_bullets,
                      item.expected?.description || comp.expected_description,
                      comp.expected_rating,
                      comp.expected_reviews,
                      comp.expected_images,
                      comp.expected_video_count,
                      comp.expected_brand_story,
                      comp.expected_aplus,
                      comp.expected_comparison,
                      comp.expected_variation_count,
                      comp.expected_variation_theme,
                      comp.expected_seller,
                      comp.expected_price,
                      comp.expected_delivery_days
                  ];
              });

              const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
              XLSX.utils.book_append_sheet(wb, ws, "Data");
              XLSX.writeFile(wb, `${container[currentCatalogueId].name}_Export.xlsx`);
          });
      });
  }

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const domainSelect = document.getElementById('domainSelect');
  const feedbackLink = document.getElementById('feedbackLink');
  
  // Catalogue Elements
  const catalogueItemsDiv = document.getElementById('catalogueItems');
  const catalogueCountDiv = document.getElementById('catalogueCount');
  const catalogueLimitMsg = document.getElementById('catalogueLimitMsg');
  const clearCatalogueBtn = document.getElementById('clearCatalogueBtn');
  const auditCatalogueBtn = document.getElementById('auditCatalogueBtn');

  // New Catalogue Controls
  const catalogueSelect = document.getElementById('catalogueSelect');
  const newCatalogueBtn = document.getElementById('newCatalogueBtn');
  const renameCatalogueBtn = document.getElementById('renameCatalogueBtn');
  const deleteCatalogueBtn = document.getElementById('deleteCatalogueBtn');

  // Clear Elements
  const clearSection = document.getElementById('clearSection');
  const clearBtn = document.getElementById('clearBtn');
  const clearConfirmMsg = document.getElementById('clearConfirmMsg');

  // Modal Elements
  const previewModal = document.getElementById('previewModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalBody = document.getElementById('modalBody');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');

  // Import Modal Elements
  const saveToCatalogueModal = document.getElementById('saveToCatalogueModal');
  const closeSaveModalBtn = document.getElementById('closeSaveModalBtn');
  const newCatalogueNameInput = document.getElementById('newCatalogueNameInput');
  const appendCatalogueSelect = document.getElementById('appendCatalogueSelect');
  const confirmImportBtn = document.getElementById('confirmImportBtn');
  let pendingImportItems = [];

  // Auth Elements
  const googleBtn = document.getElementById('googleBtn');
  const msBtn = document.getElementById('msBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const themeToggle = document.getElementById('themeToggle'); 
  
  // Dashboard Elements
  const dashboardView = document.getElementById('dashboardView');
  const statTotal = document.getElementById('statTotal');
  const statLqs = document.getElementById('statLqs');
  const statIssues = document.getElementById('statIssues');
  const bulkHintText = document.getElementById('bulkHintText');
  const downloadAuditTemplateBtn = document.getElementById('downloadAuditTemplateBtn');

  // --- State Variables ---
  let MEGA_MODE = 'scraper'; // 'scraper' or 'auditor'
  let mode = 'current'; 
  let rawCsvData = []; 
  let IS_LOGGED_IN = false; 
  let USER_INFO = null;
  const GUEST_LIMIT = 10;
  const PRO_LIMIT = 10000; 
  const CATALOGUE_GUEST_LIMIT = 10;
  const CATALOGUE_PRO_LIMIT = 10000;
  let countdownInterval = null;
  let previousIsScanning = false;
  let clearConfirmationPending = false; 
  let currentIsScanning = false;

  // --- CONFIG: Firebase ---
  // Firebase initialized in firebase/firebase-config.js and imported at the top of this file.

  // --- Feature: Theme Toggle ---
  function initTheme() {
      chrome.storage.local.get(['theme'], (data) => {
          let theme = data.theme;
          if (!theme) {
              if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  theme = 'dark';
              } else {
                  theme = 'light';
              }
          }
          applyTheme(theme);
      });
  }

  function applyTheme(theme) {
      document.body.setAttribute('data-theme', theme);
      if(theme === 'dark') {
          themeToggle.textContent = '☀️'; 
          themeToggle.title = "Switch to Light Mode";
      } else {
          themeToggle.textContent = '🌙'; 
          themeToggle.title = "Switch to Dark Mode";
      }
      chrome.storage.local.set({ theme: theme });
  }

  themeToggle.addEventListener('click', () => {
      const current = document.body.getAttribute('data-theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
  });
  
  // Initialize on load
  initTheme();

  // --- Feature: Preview Table ---
  previewBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get('auditState');
      const results = data.auditState ? data.auditState.results : [];
      if (!results || results.length === 0) { alert("No results to preview."); return; }

      let html = '<table class="preview-table"><thead><tr><th>ASIN</th><th>Status</th><th>Title</th><th>LQS</th><th>Issues</th></tr></thead><tbody>';
      results.forEach(r => {
          let status = "OK";
          let statusClass = "status-good";
          let issues = "";
          
          if (r.error) { status = "ERR"; statusClass = "status-bad"; issues = r.error; }
          else if (r.queryASIN && r.attributes.mediaAsin && r.queryASIN !== r.attributes.mediaAsin) { status = "Redirect"; statusClass = "status-bad"; }
          
          if (!issues && r.attributes.lqsDetails) {
              const fails = r.attributes.lqsDetails.filter(d => !d.pass);
              if (fails.length > 0) issues = fails.length + " LQS Issues";
          }

          html += `<tr>
              <td>${r.attributes ? r.attributes.mediaAsin : 'N/A'}</td>
              <td class="${statusClass}">${status}</td>
              <td>${r.attributes ? (r.attributes.metaTitle ? r.attributes.metaTitle.substring(0, 30)+'...' : 'N/A') : '-'}</td>
              <td>${r.attributes ? r.attributes.lqs : '-'}</td>
              <td>${issues}</td>
          </tr>`;
      });
      html += '</tbody></table>';
      modalBody.innerHTML = html;
      previewModal.showModal();
  });

  closeModalBtn.addEventListener('click', () => previewModal.close());
  modalDownloadBtn.addEventListener('click', () => downloadXlsxBtn.click());

  // --- Feature: Catalogue Logic (Updated for Price & Separate Storage) ---
  const getCatalogueContainerKey = () => IS_LOGGED_IN ? 'catalogues_pro' : 'catalogues_guest';
  let currentCatalogueId = "default";

  // Init Catalogues structure if missing
  const initCatalogues = (cb) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key, 'catalogue', 'catalogue_pro'], (data) => {
          let container = data[key];

          if (!container) {
              container = { "default": { name: "Main Catalogue", items: [], template: [] } };
              // We do not migrate legacy watchlist data automatically to enforce "clean" break if desired,
              // or we could map old 'watchlist_pro' to this new key.
              // For now, initializing fresh as per "No trace of watchlist".
              chrome.storage.local.set({ [key]: container }, cb);
          } else {
              if (cb) cb();
          }
      });
  };

  const loadCatalogue = () => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key] || { "default": { name: "Main Catalogue", items: [], template: [] } };

          // Populate Select Dropdown
          catalogueSelect.innerHTML = "";

          Object.keys(container).forEach(id => {
              const opt = document.createElement("option");
              opt.value = id;
              opt.textContent = container[id].name;
              catalogueSelect.appendChild(opt);
          });

          if (!container[currentCatalogueId]) currentCatalogueId = "default";
          catalogueSelect.value = currentCatalogueId;

          const activeList = container[currentCatalogueId];
          renderCatalogue(activeList ? activeList.items : []);

          if (IS_LOGGED_IN) {
              catalogueLimitMsg.style.display = 'none';
          } else {
              catalogueLimitMsg.style.display = 'block';
              catalogueLimitMsg.textContent = `Limit: ${CATALOGUE_GUEST_LIMIT} (Free)`;
              catalogueLimitMsg.style.color = "var(--text-muted)";
          }
      });
  };

  catalogueSelect.addEventListener('change', (e) => {
      currentCatalogueId = e.target.value;
      loadCatalogue();
  });

  // --- Input Modal Logic ---
  const inputModal = document.getElementById('inputModal');
  const inputModalTitle = document.getElementById('inputModalTitle');
  const closeInputModalBtn = document.getElementById('closeInputModalBtn');
  const catalogueNameInput = document.getElementById('catalogueNameInput');
  const saveInputBtn = document.getElementById('saveInputBtn');

  let inputModalAction = null; // 'create' or 'rename'

  closeInputModalBtn.addEventListener('click', () => inputModal.close());

  // --- Import Modal Logic ---
  closeSaveModalBtn.addEventListener('click', () => saveToCatalogueModal.close());

  const toggleImportOptions = () => {
      const isNew = document.querySelector('input[name="saveOption"][value="new"]').checked;
      newCatalogueNameInput.disabled = !isNew;
      appendCatalogueSelect.disabled = isNew;
  };

  document.querySelectorAll('input[name="saveOption"]').forEach(r => r.addEventListener('change', toggleImportOptions));

  const openSaveToCatalogueModal = (items) => {
      pendingImportItems = items;
      // Populate Append Select
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key] || {};
          appendCatalogueSelect.innerHTML = "";
          Object.keys(container).forEach(id => {
              const opt = document.createElement("option");
              opt.value = id;
              opt.textContent = container[id].name;
              appendCatalogueSelect.appendChild(opt);
          });

          if (Object.keys(container).length === 0) {
              // If no existing catalogues, force new
              document.querySelector('input[name="saveOption"][value="new"]').checked = true;
              document.querySelector('input[name="saveOption"][value="append"]').disabled = true;
          } else {
              document.querySelector('input[name="saveOption"][value="append"]').disabled = false;
          }

          toggleImportOptions();
          saveToCatalogueModal.showModal();
      });
  };

  confirmImportBtn.addEventListener('click', () => {
      const isNew = document.querySelector('input[name="saveOption"][value="new"]').checked;
      const key = getCatalogueContainerKey();

      chrome.storage.local.get([key], (data) => {
          let container = data[key] || { "default": { name: "Main Catalogue", items: [], template: [] } };

          let targetId = null;

          if (isNew) {
              const name = newCatalogueNameInput.value.trim();
              if (!name) { alert("Please enter a name for the new catalogue."); return; }
              targetId = "cat_" + Date.now();
              container[targetId] = { name: name, items: [], template: [] };
          } else {
              targetId = appendCatalogueSelect.value;
              if (!container[targetId]) { alert("Selected catalogue not found."); return; }
          }

          // Save container with new/existing catalogue ref
          chrome.storage.local.set({ [key]: container }, () => {
              // Switch to target catalogue
              currentCatalogueId = targetId;

              // Add items using existing logic (which handles overwrite)
              addToCatalogue(pendingImportItems); // This saves again, but ensures consistency logic is reused.

              // Load into Auditor
              // Wait for addToCatalogue to finish? addToCatalogue is async but doesn't return promise.
              // We can rely on 'fileStatus' update or just set rawCsvData here directly.

              // Convert pending items to structure expected by Auditor (rawCsvData) if needed
              // But Auditor runs from rawCsvData.
              // Wait, if we are in Auditor Mode, we want to run the audit on THESE items.
              // So we should set rawCsvData to these items.

              rawCsvData = pendingImportItems;
              if(catalogueImportStatus) {
                  catalogueImportStatus.textContent = `Loaded ${pendingImportItems.length} items from Catalogue. Ready to Audit.`;
                  catalogueImportStatus.style.color = "var(--success)";
              }

              saveToCatalogueModal.close();
              loadCatalogue(); // Refresh UI
          });
      });
  });

  newCatalogueBtn.addEventListener('click', () => {
      inputModalTitle.textContent = "Create New Catalogue";
      catalogueNameInput.value = "";
      inputModalAction = 'create';
      inputModal.showModal();
  });

  renameCatalogueBtn.addEventListener('click', () => {
      // Need to fetch current name to pre-fill
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if (container && container[currentCatalogueId]) {
             inputModalTitle.textContent = "Rename Catalogue";
             catalogueNameInput.value = container[currentCatalogueId].name;
             inputModalAction = 'rename';
             inputModal.showModal();
          }
      });
  });

  saveInputBtn.addEventListener('click', () => {
      const name = catalogueNameInput.value.trim();
      if (!name) { alert("Please enter a name."); return; }

      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key] || {};

          if (inputModalAction === 'create') {
              const id = "cat_" + Date.now();
              container[id] = { name: name, items: [], template: [] };
              chrome.storage.local.set({ [key]: container }, () => {
                  currentCatalogueId = id;
                  inputModal.close();
                  // Open Template Selection (if implemented later) or just refresh
                  loadCatalogue();
              });
          } else if (inputModalAction === 'rename') {
              if (container[currentCatalogueId]) {
                  container[currentCatalogueId].name = name;
                  chrome.storage.local.set({ [key]: container }, () => {
                      loadCatalogue();
                      inputModal.close();
                  });
              }
          }
      });
  });

  deleteCatalogueBtn.addEventListener('click', () => {
      if (Object.keys(catalogueSelect.options).length <= 1) {
          alert("Cannot delete the last catalogue.");
          return;
      }
      if (confirm("Delete this catalogue?")) {
          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              const container = data[key];
              delete container[currentCatalogueId];
              currentCatalogueId = Object.keys(container)[0];
              chrome.storage.local.set({ [key]: container }, loadCatalogue);
          });
      }
  });

  const addToCatalogue = (items) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          let container = data[key] || { "default": { name: "Main Catalogue", items: [], template: [] } };
          if(!container[currentCatalogueId]) container[currentCatalogueId] = { name: "Default", items: [], template: [] };

          let list = container[currentCatalogueId].items;
          const limit = IS_LOGGED_IN ? CATALOGUE_PRO_LIMIT : CATALOGUE_GUEST_LIMIT;
          
          let addedCount = 0;

          // Process items with overwrite logic as requested
          items.forEach(newItem => {
              const existingIndex = list.findIndex(i => i.asin === newItem.asin);

              // Only check limit if adding a NEW item
              if (existingIndex === -1 && list.length >= limit) {
                  // Skip if limit reached
                  return;
              }

              const timestamp = Date.now();
              const historyEntry = { 
                  date: timestamp, 
                  price: newItem.initialPrice, 
                  title: newItem.expected ? newItem.expected.title : null 
              };

              if (existingIndex > -1) {
                  // OVERWRITE Logic: Update attributes fully for existing ASIN
                  const existing = list[existingIndex];
                  const newHistory = existing.history ? [...existing.history, historyEntry] : [historyEntry];
                  if (newHistory.length > 5) newHistory.shift();

                  list[existingIndex] = { 
                      ...existing, 
                      ...newItem, // Overwrite new data
                      history: newHistory,
                      lastScan: existing.lastScan || null // Preserve scan status if any
                  };
              } else {
                  // New Item
                  list.push({
                      ...newItem,
                      history: [historyEntry],
                      lastScan: null
                  });
                  addedCount++;
              }
          });
          
          container[currentCatalogueId].items = list;

          chrome.storage.local.set({ [key]: container }, () => {
              loadCatalogue();
              // syncToFirestore(container);
              if (mode === 'current') {
                  pasteStatus.textContent = `Saved to Catalogue!`;
                  pasteStatus.style.color = "var(--success)";
                  setTimeout(() => pasteStatus.textContent = "", 2000);
              } else if (mode === 'bulk') {
                  fileStatus.textContent = `Imported ${addedCount} new items.`;
                  fileStatus.style.color = "var(--success)";
              }
          });
      });
  };

  const removeFromCatalogue = (asin) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          let container = data[key];
          if(container && container[currentCatalogueId]) {
              container[currentCatalogueId].items = container[currentCatalogueId].items.filter(item => item.asin !== asin);
              chrome.storage.local.set({ [key]: container }, () => {
                  loadCatalogue();
                  // syncToFirestore(container);
              });
          }
      });
  };

  const clearCatalogue = () => {
      if (confirm("Are you sure you want to clear items in this catalogue?")) {
          const key = getCatalogueContainerKey();
          chrome.storage.local.get([key], (data) => {
              let container = data[key];
              if(container && container[currentCatalogueId]) {
                  container[currentCatalogueId].items = [];
                  chrome.storage.local.set({ [key]: container }, () => {
                      loadCatalogue();
                      // syncToFirestore(container);
                  });
              }
          });
      }
  };

  const renderCatalogue = (list) => {
      catalogueCountDiv.textContent = `${list.length} Items`;
      catalogueItemsDiv.innerHTML = "";
      
      if (list.length === 0) {
          catalogueItemsDiv.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:11px;">Catalogue is empty.</div>';
          auditCatalogueBtn.disabled = true;
          return;
      }
      
      auditCatalogueBtn.disabled = false;

      list.forEach(item => {
          const div = document.createElement('div');
          div.className = 'wl-item';
          
          // Determine Status
          let statusIcon = '⚪'; // Default/Pending
          let statusTitle = "Not audited yet";
          if (item.lastScan) {
              if (item.lastScan.status === 'OK') statusIcon = '🟢';
              else if (item.lastScan.status === 'ISSUE') statusIcon = '🟠';
              else if (item.lastScan.status === 'ERROR') statusIcon = '🔴';
              
              if (item.lastScan.priceChange) statusIcon += ' 💲'; // Price changed
          }

          const lastScanDate = item.lastScan ? new Date(item.lastScan.date).toLocaleDateString() : '-';

          div.innerHTML = `
              <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; align-items:center; width:100%;">
                  <div class="wl-info" style="font-size:11px;">
                      <a href="${item.url}" target="_blank" style="color:var(--primary); font-weight:700; text-decoration:none;">${item.asin}</a>
                      <div class="wl-title" style="font-size:9px; color:var(--text-muted);">${item.expected.title ? item.expected.title.substring(0, 20) + "..." : "No Baseline"}</div>
                  </div>
                  <div style="text-align:center; font-size:10px; color:var(--text-muted);">
                      ${lastScanDate}
                  </div>
                  <div style="text-align:right; font-size:14px; cursor:default;" title="${statusTitle}">
                      ${statusIcon}
                      <span class="wl-chart" title="View History" style="margin-left:4px; cursor:pointer;">📈</span>
                      <span class="wl-del" title="Remove" style="margin-left:4px; cursor:pointer;">&times;</span>
                  </div>
              </div>
          `;
          
          div.querySelector('.wl-del').addEventListener('click', (e) => {
              e.stopPropagation();
              removeFromCatalogue(item.asin);
          });

          div.querySelector('.wl-chart').addEventListener('click', (e) => {
              e.stopPropagation();
              // showHistoryChart(item); // Ensure this function exists or is updated
          });
          
          catalogueItemsDiv.appendChild(div);
      });
  };

  clearCatalogueBtn.addEventListener('click', clearCatalogue);

  auditCatalogueBtn.addEventListener('click', () => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if(!container || !container[currentCatalogueId]) return;
          const list = container[currentCatalogueId].items;

          if (list.length === 0) return;
          const urlsToProcess = list.map(item => item.url); 
          const settings = { disableImages: disableImagesInput.checked };
          chrome.runtime.sendMessage({ action: 'START_SCAN', payload: { urls: urlsToProcess, mode: 'catalogue', settings } });
      });
  });

  // Listen for Audit Completion to Update Catalogue Status
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'SCAN_COMPLETE' && request.mode === 'catalogue') {
          updateCatalogueAfterScan(request.results);
      }
  });

  const updateCatalogueAfterScan = (results) => {
      const key = getCatalogueContainerKey();
      chrome.storage.local.get([key], (data) => {
          const container = data[key];
          if(!container || !container[currentCatalogueId]) return;
          let list = container[currentCatalogueId].items;
          
          list = list.map(item => {
              const result = results.find(r => r.url === item.url || (r.attributes && r.attributes.mediaAsin === item.asin));
              if (result) {
                  const now = Date.now();
                  let status = 'OK';
                  let priceChange = false;

                  if (result.error) status = 'ERROR';
                  else {
                      // Check LQS
                      const lqs = parseInt(result.attributes.lqs);
                      if (lqs < 70) status = 'ISSUE';

                      // Check Title Match
                      if (item.expected && item.expected.title && result.attributes.metaTitle !== item.expected.title) {
                          status = 'ISSUE';
                      }

                      // Check Price
                      if (item.initialPrice && result.attributes.displayPrice !== 'none' && result.attributes.displayPrice !== item.initialPrice) {
                          priceChange = true;
                      }
                  }

                  return {
                      ...item,
                      lastScan: {
                          date: now,
                          status: status,
                          priceChange: priceChange,
                          lastLqs: result.attributes.lqs
                      }
                  };
              }
              return item;
          });

          container[currentCatalogueId].items = list;
          chrome.storage.local.set({ [key]: container }, loadCatalogue);
      });
  };

  snapshotBtn.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url.includes('.amazon.')) {
          pasteStatus.textContent = "Not an Amazon page.";
          pasteStatus.style.color = "var(--danger)";
          return;
      }

      try {
          const [result] = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
          });
          
          if (result && result.result && result.result.found) {
              const data = result.result;
              const newItem = {
                  asin: data.attributes.mediaAsin,
                  url: data.url,
                  initialPrice: data.attributes.displayPrice,
                  expected: {
                      brand: data.attributes.brand,
                      title: data.attributes.metaTitle,
                      bullets: data.attributes.bullets,
                      description: data.attributes.description
                  }
              };
              
              if (newItem.asin === "none") {
                  pasteStatus.textContent = "Could not detect ASIN.";
                  pasteStatus.style.color = "var(--danger)";
                  return;
              }

              addToCatalogue([newItem]);
          } else {
              pasteStatus.textContent = "Failed to snapshot data.";
              pasteStatus.style.color = "var(--danger)";
          }
      } catch (e) {
          console.error(e);
          pasteStatus.textContent = "Error: " + e.message;
          pasteStatus.style.color = "var(--danger)";
      }
  });

  importCatalogueBtn.addEventListener('click', () => {
      if (rawCsvData.length === 0) {
          fileStatus.textContent = "No data to import.";
          fileStatus.style.color = "var(--danger)";
          return;
      }
      
      const itemsToSave = rawCsvData.map(item => {
          if (typeof item === 'string') {
              const url = buildOrNormalizeUrl(item);
              const asinMatch = url ? url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i) : null;
              const asin = asinMatch ? asinMatch[1].toUpperCase() : "UNKNOWN_" + Math.random().toString(36).substr(2, 5);
              return {
                  asin: asin,
                  url: url,
                  expected: { title: "", bullets: "" } 
              };
          } else {
              const url = buildOrNormalizeUrl(item.url);
              const asinMatch = url ? url.match(/(?:\/dp\/|\/gp\/product\/|\/product\/)([a-zA-Z0-9]{10})/i) : null;
              const asin = asinMatch ? asinMatch[1].toUpperCase() : "UNKNOWN_" + Math.random().toString(36).substr(2, 5);
              return {
                  asin: asin,
                  url: url,
                  expected: {
                      brand: item.expected?.brand || "",
                      title: item.expected?.title || "",
                      bullets: item.expected?.bullets || "",
                      description: item.expected?.description || ""
                  }
              };
          }
      }).filter(i => i.url !== null);

      if (itemsToSave.length > 0) {
          addToCatalogue(itemsToSave);
      } else {
          fileStatus.textContent = "No valid URLs found.";
          fileStatus.style.color = "var(--danger)";
      }
  });


  // --- Feature: Checkbox Lock & Group Select ---
  const saveCheckboxState = () => {
      const state = {};
      document.querySelectorAll('.attr-checkbox').forEach(cb => {
          state[cb.value] = cb.checked;
      });
      chrome.storage.local.set({ checkboxLock: state });
  };

  const loadCheckboxState = () => {
      chrome.storage.local.get(['checkboxLock'], (data) => {
          if (data.checkboxLock) {
              const state = data.checkboxLock;
              document.querySelectorAll('.attr-checkbox').forEach(cb => {
                  if (!cb.disabled && state.hasOwnProperty(cb.value)) {
                      cb.checked = state[cb.value];
                  }
              });
              updateGroupCheckboxes();
          }
      });
  };

  document.querySelectorAll('.group-select').forEach(groupCb => {
      groupCb.addEventListener('change', (e) => {
          const group = e.target.dataset.group;
          const isChecked = e.target.checked;
          document.querySelectorAll(`.attr-checkbox.group-${group}`).forEach(cb => {
              if (!cb.disabled) cb.checked = isChecked;
          });
          saveCheckboxState();
      });
  });

  function updateGroupCheckboxes() {
      ['core', 'advanced', 'content'].forEach(group => {
          const groupCb = document.querySelector(`.group-select[data-group="${group}"]`);
          const items = Array.from(document.querySelectorAll(`.attr-checkbox.group-${group}:not(:disabled)`));
          if (items.length > 0 && groupCb) {
              groupCb.checked = items.every(cb => cb.checked);
          }
      });
      const all = Array.from(document.querySelectorAll('.attr-checkbox:not(:disabled)'));
      selectAllCheckbox.checked = all.every(cb => cb.checked);
  }

  document.querySelectorAll('.attr-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
          saveCheckboxState();
          updateGroupCheckboxes();
      });
  });

  if (auditSelectAll) {
      auditSelectAll.addEventListener('change', (e) => {
          document.querySelectorAll('.audit-checkbox').forEach(cb => cb.checked = e.target.checked);
      });
  }

  const lqsCheckbox = document.querySelector('input[value="lqs"]');
  if (lqsCheckbox) {
      lqsCheckbox.addEventListener('change', (e) => {
          if (e.target.checked) {
              const requiredForLQS = ['metaTitle', 'imgVariantCount', 'bulletsCount', 'description', 'videoCount', 'aPlusImgs', 'rating', 'reviews'];
              requiredForLQS.forEach(val => {
                  const cb = document.querySelector(`input[value="${val}"]`);
                  if (cb && !cb.disabled) cb.checked = true;
              });
              saveCheckboxState();
              updateGroupCheckboxes();
          }
      });
  }

  clearBtn.addEventListener('click', () => {
      if (!clearConfirmationPending) {
          clearConfirmationPending = true;
          clearBtn.textContent = "Confirm: Clear All Results?";
          clearBtn.style.background = "#fee2e2";
          clearConfirmMsg.style.display = "block";
      } else {
          chrome.runtime.sendMessage({ action: 'CLEAR_DATA' });
          clearConfirmationPending = false;
          clearBtn.textContent = "Clear Output / Reset";
          clearBtn.style.background = "var(--surface)";
          clearConfirmMsg.style.display = "none";
          statusDiv.textContent = "Data cleared.";
          progressCountDiv.style.display = 'none'; // Fix: Hide processed count
          fileStatus.textContent = "";
          pasteStatus.textContent = ""; 
          rawCsvData = []; 
          csvInput.value = "";
          
          // Reset UI
          resultsPlaceholder.style.display = 'block'; 
          dashboardView.style.display = 'none'; 
          downloadBtn.style.display = 'none'; 
          downloadXlsxBtn.style.display = 'none'; 
          pushSheetBtn.style.display = 'none'; 
          pushExcelBtn.style.display = 'none'; 
          // if(copyBtn) copyBtn.style.display = 'none';
          clearSection.style.display = 'none'; 
      }
  });

  if (feedbackLink) {
    feedbackLink.addEventListener('click', () => {
        const version = chrome.runtime.getManifest().version;
        const baseUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSeZ4zNH3_Jiov3JnTa5K2VXffCCkDSsh-KvK_h3kIxmbejoIg/viewform';
        const versionFieldId = 'entry.2030262534'; 
        const emailFieldId = 'entry.1847764537'; 
        const params = new URLSearchParams();
        params.append('usp', 'pp_url'); 
        if (versionFieldId) params.append(versionFieldId, version);
        if (IS_LOGGED_IN && USER_INFO && USER_INFO.email && emailFieldId) {
            params.append(emailFieldId, USER_INFO.email);
        }
        const finalUrl = `${baseUrl}?${params.toString()}`;
        chrome.tabs.create({ url: finalUrl });
    });
  }

  // --- Auth Handlers ---
  chrome.storage.local.get(['userSession'], (data) => {
      if (data.userSession) {
          IS_LOGGED_IN = true;
          USER_INFO = data.userSession;
          updateUIForAuth();
      } else {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
              if (token && !chrome.runtime.lastError) {
                  fetchGoogleUserInfo(token);
              }
          });
      }
  });

  googleBtn.addEventListener('click', () => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
              alert("Google Login failed: " + chrome.runtime.lastError.message);
              return;
          }
          fetchGoogleUserInfo(token);
      });
  });

  function fetchGoogleUserInfo(token) {
      fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(user => {
          const session = {
              provider: 'google',
              name: user.given_name || 'User',
              email: user.email,
              token: token
          };
          handleLoginSuccess(session);
      })
      .catch(err => {
          console.error("User Info Fetch Error:", err);
          statusDiv.textContent = "Error fetching Google profile.";
      });
  }

  msBtn.addEventListener('click', () => {
      const redirectUri = chrome.identity.getRedirectURL();
      const scope = "openid profile User.Read email";
      const nonce = Math.random().toString(36).substring(2, 15);
      const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&nonce=${nonce}`;

      chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: true
      }, (responseUrl) => {
          if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message || "Unknown error";
              if (errMsg.includes("User cancelled") || errMsg.includes("did not approve")) {
                  console.log("User cancelled login.");
                  statusDiv.textContent = "Login cancelled.";
              } else {
                  console.error("Auth Flow Error:", errMsg);
                  alert("Login Error: " + errMsg);
              }
              return; 
          }
          if (!responseUrl) return;
          try {
              const url = new URL(responseUrl);
              const urlParams = new URLSearchParams(url.hash.substring(1)); 
              const accessToken = urlParams.get("access_token");
              if (accessToken) {
                  fetchMicrosoftUserInfo(accessToken);
              }
          } catch(e) {}
      });
  });

  function fetchMicrosoftUserInfo(token) {
      fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(user => {
          const session = {
              provider: 'microsoft',
              name: user.givenName || 'User',
              email: user.mail || user.userPrincipalName,
              token: token
          };
          handleLoginSuccess(session);
      })
      .catch(err => {});
  }

  async function handleLoginSuccess(session) {
      IS_LOGGED_IN = true;
      USER_INFO = session;
      chrome.storage.local.set({ userSession: session });

      // Update UI immediately
      updateUIForAuth();
      statusDiv.textContent = "Logged in."; // Fix: Update status message

      // Attempt Firebase Sign-in to enable Firestore access
      try {
          // Note: In a real extension, we would use signInWithCredential(auth, GoogleAuthProvider.credential(session.token))
          // But since we are using a custom/hybrid auth flow without the full Firebase Auth instance wired to the identity provider here,
          // and relying on the "users" collection having relaxed rules or using the email as key (as per previous step),
          // we just proceed to sync.
          // Ideally: await signInWithCredential(auth, GoogleAuthProvider.credential(null, session.token));
          // await fetchFromFirestore(); // Disabled for now
      } catch (e) {
          console.error("Firebase Login Sync Error:", e);
      }
  }

  logoutBtn.addEventListener('click', () => {
      if (currentIsScanning) {
          const confirmLogout = confirm("A scan is currently running. Logging out will STOP the scan.\n\nAre you sure you want to continue?");
          if (!confirmLogout) return;
          chrome.runtime.sendMessage({ action: 'STOP_SCAN' });
      }
      chrome.storage.local.remove('userSession');
      IS_LOGGED_IN = false;
      USER_INFO = null;
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (token) chrome.identity.removeCachedAuthToken({ token: token }, () => {});
      });
      updateUIForAuth();
      statusDiv.textContent = "Logged out.";
  });

  function updateUIForAuth() {
      const megaModeSwitch = document.getElementById('megaModeSwitch');

      if (IS_LOGGED_IN) {
          googleBtn.style.display = 'none';
          msBtn.style.display = 'none';
          logoutBtn.style.display = 'flex';
          const name = USER_INFO ? (USER_INFO.name || 'User') : 'Pro User';
          logoutBtn.textContent = `Logout (${name})`;
          
          // Show Mega Mode Switch
          if (megaModeSwitch) megaModeSwitch.style.display = 'flex';

          tabBulk.classList.remove('disabled');
          tabBulk.querySelector('.lock-icon').style.display = 'none';
          
          if(tabCatalogueSetup) tabCatalogueSetup.classList.remove('disabled');

          document.querySelectorAll('.pro-feature').forEach(el => { el.disabled = false; el.checked = true; });
          document.querySelectorAll('.group-select').forEach(el => el.disabled = false);
          document.querySelectorAll('.tpl-group-select').forEach(el => el.disabled = false);
          selectAllCheckbox.disabled = false;
      } else {
          googleBtn.style.display = 'flex';
          msBtn.style.display = 'flex';
          logoutBtn.style.display = 'none';
          
          // Hide Mega Mode Switch & Force Scraper
          if (megaModeSwitch) megaModeSwitch.style.display = 'none';
          document.querySelector('input[name="megaMode"][value="scraper"]').checked = true;
          MEGA_MODE = 'scraper';
          updateMegaModeUI(); // Ensure UI reflects force switch

          // Ensure Catalogue Setup is hidden/disabled logic handled by Mega Mode UI update mostly,
          // but we also disable the tab physically here.

          if ((mode === 'bulk' || mode === 'catalogue') && !document.getElementById('stopBtn').offsetParent) tabCurrent.click();
          
          tabBulk.classList.add('disabled');
          tabBulk.querySelector('.lock-icon').style.display = 'inline';
          
          if(tabCatalogueSetup) tabCatalogueSetup.classList.add('disabled'); // Disable for guests? User said "Without Login User should only see Scrapper Mode"

          document.querySelectorAll('.pro-feature').forEach(el => { el.checked = false; el.disabled = true; });
          document.querySelector('.group-select[data-group="advanced"]').disabled = true;
          document.querySelector('.group-select[data-group="content"]').disabled = true;
          document.querySelector('.tpl-group-select[data-group="advanced"]').disabled = true;
          document.querySelector('.tpl-group-select[data-group="content"]').disabled = true;
          selectAllCheckbox.checked = false;
          selectAllCheckbox.disabled = true;
      }
      loadCheckboxState(); 
      loadCatalogue();
  }

  // --- Mega Mode Switch Logic ---
  const updateMegaModeUI = () => {
      document.querySelectorAll('input[name="megaMode"]').forEach(r => {
          if (r.checked) MEGA_MODE = r.value;
      });

      // UI Elements for Config
      const scrapingConfig = document.getElementById('scrapingConfig');
      const auditConfig = document.getElementById('auditConfig');

      // Hide Catalogue Setup Everywhere for now, then show based on mode
      if (tabCatalogueSetup) tabCatalogueSetup.style.display = 'none';

      if (MEGA_MODE === 'scraper') {
          // Tabs: Show Current, Bulk. Hide Catalogue Setup
          tabCurrent.style.display = 'flex';
          tabBulk.style.display = 'flex';
          if(tabCatalogueSetup) tabCatalogueSetup.style.display = 'none';

          // Config Visibility
          if(scrapingConfig) scrapingConfig.style.display = 'block';
          if(auditConfig) auditConfig.style.display = 'none';

          // Bulk: Hints
          bulkHintText.textContent = "Upload CSV (Headers: URL) or Paste Links";

          // Force valid tab
          if (mode === 'catalogue') tabCurrent.click();
          else if (mode === 'bulk' || mode === 'current') {
              // Stay on current or bulk
          } else {
              tabCurrent.click();
          }

      } else {
          // Auditor Mode
          // Tabs: Hide Current, Bulk. Show Catalogue Setup
          tabCurrent.style.display = 'none';
          tabBulk.style.display = 'none';
          if(tabCatalogueSetup) tabCatalogueSetup.style.display = 'flex';

          // Config Visibility
          if(scrapingConfig) scrapingConfig.style.display = 'none';
          if(auditConfig) auditConfig.style.display = 'block';

          // Force valid tab
          if (mode !== 'catalogue') tabCatalogueSetup.click();
      }
  };

  document.querySelectorAll('input[name="megaMode"]').forEach(radio => {
      radio.addEventListener('change', updateMegaModeUI);
  });

  // --- Logic Load ---
  chrome.storage.local.get(['auditState'], (data) => {
    if (data.auditState) {
      renderState(data.auditState);
      if(data.auditState.isScanning) {
          const m = data.auditState.mode;
          mode = m;
          // Infer Mega Mode from stored state or context if needed,
          // but for now let's just respect the UI default or last selection
          // If scanning, hide sections
          currentSection.style.display = 'none';
          bulkSection.style.display = 'none';
          catalogueSection.style.display = 'none';
          vendorSection.style.display = 'none';
          document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
          if(m === 'current') tabCurrent.classList.add('active'); 
          else if(m === 'bulk') tabBulk.classList.add('active'); 
          else if(m === 'catalogue') tabCatalogue.classList.add('active');
          else if(m === 'auditor') tabAuditor.classList.add('active');
      }
    }
    updateMegaModeUI();
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.auditState) {
      renderState(changes.auditState.newValue);
    }
  });

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

  const buildOrNormalizeUrl = (input) => {
    input = input.trim();
    if(!input) return null;
    const langPref = document.querySelector('input[name="langPref"]:checked').value;
    const config = marketplaceData[domainSelect.value];
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

  const csvLineParser = (str) => {
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

  tabCurrent.addEventListener('click', () => {
    mode = 'current';
    tabCurrent.classList.add('active');
    tabBulk.classList.remove('active');
    if(tabCatalogueSetup) tabCatalogueSetup.classList.remove('active');
    bulkSection.style.display = 'none';
    catalogueSection.style.display = 'none';
    currentSection.style.display = 'block'; 

    scanBtn.style.display = 'block'; // Show Scan Btn in Scraper Mode
    scanBtn.textContent = 'Start Audit (Current Tabs)';
  });

  tabBulk.addEventListener('click', () => {
    if (!IS_LOGGED_IN) { alert("Please Login."); return; }
    mode = 'bulk';
    tabBulk.classList.add('active');
    tabCurrent.classList.remove('active');
    if(tabCatalogueSetup) tabCatalogueSetup.classList.remove('active');
    bulkSection.style.display = 'block';
    currentSection.style.display = 'none'; 
    catalogueSection.style.display = 'none';

    scanBtn.style.display = 'block'; // Show Scan Btn in Scraper Mode
    scanBtn.textContent = 'Start Bulk Audit';
  });

  if (tabCatalogueSetup) {
      tabCatalogueSetup.addEventListener('click', () => {
          if (!IS_LOGGED_IN) { alert("Please Login."); return; }
          mode = 'catalogue'; // Mode 'catalogue' now drives Auditor workflow
          tabCatalogueSetup.classList.add('active');
          tabCurrent.classList.remove('active');
          tabBulk.classList.remove('active');

          catalogueSection.style.display = 'block';
          bulkSection.style.display = 'none';
          currentSection.style.display = 'none';

          scanBtn.style.display = 'none'; // Hide general Scan Btn in Auditor Mode

          loadCatalogue();
      });
  }

  const handlePaste = async (limit, statusEl) => {
      try {
          const text = await navigator.clipboard.readText();
          if (!text) { statusEl.textContent = "Clipboard is empty."; return; }
          let lines = text.split(/[\r\n\s]+/).map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 0) {
              const effectiveLines = lines.slice(0, limit);
              rawCsvData = effectiveLines; 
              statusEl.textContent = `Loaded ${effectiveLines.length} links.`;
              statusEl.style.color = "var(--success)";
              if(csvInput) csvInput.value = ""; 
          } else {
              statusEl.textContent = "No valid data.";
              statusEl.style.color = "var(--danger)";
          }
      } catch (err) {
          console.error("Clipboard Error:", err);
          statusEl.textContent = "Failed to read clipboard.";
      }
  };
  pasteLinksBtn.addEventListener('click', () => handlePaste(PRO_LIMIT, pasteStatus));
  pasteBtn.addEventListener('click', () => handlePaste(PRO_LIMIT, fileStatus));


  const getVendorCentralDomain = (marketplace) => {
      const na = ['Amazon.com', 'Amazon.ca'];
      const eu = ['Amazon.co.uk', 'Amazon.de', 'Amazon.fr', 'Amazon.it', 'Amazon.es', 'Amazon.nl', 'Amazon.se', 'Amazon.com.be', 'Amazon.pl'];
      const au = ['Amazon.com.au'];

      if (na.includes(marketplace)) return 'vendorcentral.amazon.com';
      if (eu.includes(marketplace)) return 'vendorcentral.amazon.co.uk';
      if (au.includes(marketplace)) return 'vendorcentral.amazon.com.au';

      return 'vendorcentral.amazon.com'; // Default
  };

  const handleFileSelect = (file, statusEl, modeType) => {
      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

      if (modeType === 'auditor' && !isXlsx) {
          statusEl.textContent = "Error: Only .xlsx files are supported in Auditor Mode.";
          statusEl.style.color = "var(--danger)";
          return;
      }

      if (isXlsx) {
          if (typeof XLSX === 'undefined') {
              statusEl.textContent = "Error: XLSX library not loaded.";
              statusEl.style.color = "var(--danger)";
              return;
          }
          const reader = new FileReader();
          reader.onload = function(e) {
              try {
                  const data = new Uint8Array(e.target.result);
                  const workbook = XLSX.read(data, {type: 'array'});

                  const sheetName = workbook.SheetNames.find(n => n === 'Data') || workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[sheetName];
                  const json = XLSX.utils.sheet_to_json(worksheet, {defval: ""});

                  if (json.length === 0) {
                      statusEl.textContent = "Empty file.";
                      statusEl.style.color = "var(--danger)";
                      return;
                  }

                  if (modeType === 'auditor') {
                      // Auditor Mode Import -> Catalogue
                      const items = json.map(row => {
                          // Map new headers: QueryASIN, Brand, Source Title, etc.
                          const asin = row['QueryASIN'] || row['ASIN'] || row['asin'];
                          const url = row['URL'] || row['url'];

                          let finalAsin = asin;
                          let finalUrl = url ? buildOrNormalizeUrl(url) : null;

                          if (!finalAsin && finalUrl) {
                              const m = finalUrl.match(/([a-zA-Z0-9]{10})(?:[/?]|$)/);
                              if (m) finalAsin = m[1];
                          } else if (finalAsin && !finalUrl) {
                              finalUrl = `https://www.amazon.com/dp/${finalAsin}`; // Default fallback
                          }

                          if (!finalAsin) return null;

                          return {
                              asin: finalAsin,
                              url: finalUrl,
                              auditType: 'type2',
                              expected: {
                                  brand: row['Brand'] || "",
                                  title: row['Source Title'] || row['Title'] || "",
                                  bullets: row['Source Bullets'] || row['Bullets'] || "",
                                  description: row['Source Description'] || row['Description'] || ""
                              },
                              comparisonData: {
                                  expected_title: row['Source Title'] || row['Title'],
                                  expected_bullets: row['Source Bullets'] || row['Bullets'],
                                  expected_description: row['Source Description'] || row['Description'],
                                  expected_brand: row['Brand'],
                                  expected_rating: row['Reference Rating'],
                                  expected_reviews: row['Reference Reviews'],
                                  expected_images: row['Approved Images'],
                                  expected_video_count: row['Approved Video Count'],
                                  expected_brand_story: row['Approved Brand Story Images'],
                                  expected_aplus: row['Approved A+ Modules'],
                                  expected_comparison: row['Approved Comparison ASINs'],
                                  expected_variation_count: row['Approved Variation Count'],
                                  expected_variation_theme: row['Approved Variation Theme'],
                                  expected_seller: row['Approved Seller'],
                                  expected_price: row['Approved Price'],
                                  expected_delivery_days: row['Max Delivery Days']
                              }
                          };
                      }).filter(Boolean);

                      if (items.length > 0) {
                          openSaveToCatalogueModal(items);
                          statusEl.textContent = `File parsed (${items.length} items). Please confirm save.`;
                          statusEl.style.color = "var(--primary)";
                      } else {
                          statusEl.textContent = "No valid ASIN/URL found in file.";
                          statusEl.style.color = "var(--danger)";
                      }

                  } else {
                      // Bulk Scraper Mode (Simple List)
                      const list = json.map(r => r['URL'] || r['ASIN'] || r['url'] || r['asin']).filter(Boolean);
                      rawCsvData = list;
                      statusEl.textContent = `Loaded ${list.length} items from XLSX.`;
                      statusEl.style.color = "var(--success)";
                  }
              } catch(err) {
                  console.error(err);
                  statusEl.textContent = "Error parsing XLSX.";
                  statusEl.style.color = "var(--danger)";
              }
          };
          reader.readAsArrayBuffer(file);
      } else {
          // Legacy CSV Logic (Scraper Mode Only)
          const reader = new FileReader();
          reader.onload = function(event) {
              const text = event.target.result;
              const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
              if (lines.length === 0) return;

              const firstLine = lines[0].toLowerCase();

              // Scraper Bulk CSV
              if (firstLine.includes(',') && (firstLine.includes('url') || firstLine.includes('asin'))) {
                  const headers = csvLineParser(lines[0]).map(h => h.toLowerCase().replace(/['"]+/g, ''));
                  const urlIndex = headers.findIndex(h => h.includes('url') || h.includes('asin'));
                  const titleIndex = headers.findIndex(h => h.includes('expected title'));
                  const bulletIndex = headers.findIndex(h => h.includes('expected bullets'));

                  if (urlIndex === -1) { statusEl.textContent = "Error: Missing URL/ASIN column."; return; }

                  const structuredData = [];
                  for (let i = 1; i < lines.length; i++) {
                      const cols = csvLineParser(lines[i]);
                      if (cols[urlIndex]) {
                          structuredData.push({
                              url: cols[urlIndex].replace(/['"]+/g, ''),
                              expected: {
                                  title: titleIndex !== -1 ? cols[titleIndex].replace(/['"]+/g, '') : null,
                                  bullets: bulletIndex !== -1 ? cols[bulletIndex].replace(/['"]+/g, '') : null
                              }
                          });
                      }
                  }
                  rawCsvData = structuredData;
                  statusEl.textContent = `Loaded ${structuredData.length} structured rows.`;
              } else {
                  rawCsvData = lines.map(line => line.trim());
                  statusEl.textContent = `Loaded ${lines.length} lines.`;
              }
              statusEl.style.color = "var(--success)";
          };
          reader.readAsText(file);
      }
  };

  csvInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], fileStatus, 'bulk'));
  // auditorInput removed in favor of catalogueInput, removing listener to fix ReferenceError
  // if (auditorInput) auditorInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], auditorFileStatus, 'auditor'));

  // loadFromCatalogueBtn logic is removed as it's no longer in the UI (integrated into main flow)

  // --- Template Downloads ---

  if (downloadCatalogueTemplateBtn) {
      downloadCatalogueTemplateBtn.addEventListener('click', () => {
          if (typeof XLSX === 'undefined') { alert("XLSX library not found."); return; }

          const wb = XLSX.utils.book_new();

          // Sheet 1: Instructions
          const instructions = [
              ["Catalogue Template Instructions"],
              [""],
              ["Fill out the 'Data' sheet with your product details."],
              ["Required Columns (for matching):"],
              [" - QueryASIN: The ASIN to audit."],
              [" - Brand: Approved Brand Name."],
              [" - Source Title: The expected/approved title."],
              [" - Source Bullets: The expected/approved bullet points."],
              [" - Source Description: The expected/approved description."],
              [""],
              ["Optional Columns (for advanced audit):"],
              [" - Marketplace: e.g. Amazon.com"],
              [" - Reference Rating, Reference Reviews, Approved Images, etc."]
          ];
          const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
          XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

          // Sheet 2: Data
          const headers = [
              "QueryASIN", "Marketplace",
              "Brand", "Source Title", "Source Bullets", "Source Description",
              "Reference Rating", "Reference Reviews",
              "Approved Images", "Approved Video Count",
              "Approved Brand Story Images", "Approved A+ Modules",
              "Approved Comparison ASINs",
              "Approved Variation Count", "Approved Variation Theme",
              "Approved Seller", "Approved Price",
              "Max Delivery Days"
          ];

          const wsData = XLSX.utils.aoa_to_sheet([headers]);
          // Add a sample row
          const sample = ["B000000000", "Amazon.com", "My Brand", "Sample Title", "Feature 1 | Feature 2", "Sample Desc", "4.5", "100", "http://img.com/1.jpg, http://img.com/2.jpg", "1", "http://brand.com/1.jpg", "http://aplus.com/1.jpg", "B001, B002", "3", "Color", "Amazon", "19.99", "2"];
          XLSX.utils.sheet_add_aoa(wsData, [sample], {origin: -1});

          XLSX.utils.book_append_sheet(wb, wsData, "Data");
          XLSX.writeFile(wb, "Catalogue_Template.xlsx");
      });
  }

  if (downloadAuditTemplateBtn) { // Bulk Type 2 Template
      downloadAuditTemplateBtn.addEventListener('click', () => {
          if (typeof XLSX === 'undefined') { alert("XLSX library not found."); return; }
          const headers = ["URL", "Expected Title", "Expected Bullets"];
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet([headers]);
          XLSX.utils.book_append_sheet(wb, ws, "Bulk Template");
          XLSX.writeFile(wb, "Bulk_Comparison_Template.xlsx");
      });
  }

  scanBtn.addEventListener('click', async () => {
    let urlsToProcess = [];

    if (mode === 'auditor') {
        if (!IS_LOGGED_IN) { alert("Login required."); return; }
        if (rawCsvData.length === 0) { alert("No Data Loaded."); return; }

        // Use rawCsvData which should be populated by the auditor input parser
        urlsToProcess = rawCsvData.map(d => {
             if (d.auditType === 'type2') {
                 return d;
             }
             return d;
        }).flat().filter(Boolean);

        // --- Auto-Enable Scraping Fields based on Audit Selection ---
        // Get selected audit types
        const selectedAudits = Array.from(document.querySelectorAll('.audit-checkbox:checked')).map(cb => cb.value);

        // Map NEW Audit Checkboxes to Scraping Fields
        const auditMap = {
            'auditContent': ['metaTitle', 'bullets', 'bulletsCount', 'hasBullets', 'description', 'hasDescription'],
            'auditGrowth': ['rating', 'reviews', 'bsr'],
            'auditImage': ['imgVariantCount', 'imgVariantDetails'],
            'auditVideo': ['videoCount', 'hasVideo', 'videos'],
            'auditBrandStory': ['hasBrandStory', 'brandStoryImgs'],
            'auditAplus': ['hasAplus', 'aPlusImgs'],
            'auditComparison': ['comparisonAsins'],
            'auditVariation': ['variationExists', 'variationCount', 'variationTheme', 'variationFamily'],
            'auditBuyBox': ['displayPrice', 'soldBy'],
            'auditDelivery': ['deliveryLocation', 'primeOrFastestDeliveryDate', 'freeDeliveryDate', 'paidDeliveryDate']
        };

        // Ensure required fields are checked

        // We modify the DOM checkboxes so `getExportData` and logic picks them up
        Object.keys(auditMap).forEach(auditKey => {
            if (selectedAudits.includes(auditKey)) {
                auditMap[auditKey].forEach(field => {
                    const cb = document.querySelector(`.attr-checkbox[value="${field}"]`);
                    if (cb) {
                        cb.checked = true;
                        cb.disabled = false; // Ensure enabled
                    }
                });
            }
        });
        // Save state so it persists
        saveCheckboxState();

    } else if (mode === 'current') {
       if (rawCsvData.length > 0) {
           let validUrls = rawCsvData.map(line => buildOrNormalizeUrl(line)).filter(u => u !== null);
           urlsToProcess = validUrls;
       } else {
           const tabs = await chrome.tabs.query({ currentWindow: true });
           urlsToProcess = tabs.filter(tab => tab.url && tab.url.includes('.amazon.')).map(t => t.url);
       }
       if(!IS_LOGGED_IN && urlsToProcess.length > GUEST_LIMIT) urlsToProcess = urlsToProcess.slice(0, GUEST_LIMIT);
       if(urlsToProcess.length === 0) { statusDiv.textContent = "No Amazon tabs found."; return; }
    } else {
       // Bulk / Watchlist
       if (!IS_LOGGED_IN) { alert("Login required."); return; }
       if (rawCsvData.length === 0) { alert("No Data."); return; }

       urlsToProcess = rawCsvData.map(item => {
           if (typeof item === 'string') return buildOrNormalizeUrl(item);
           else {
               // Handle Structured Data (Type 2 from Bulk Tab)
               if (item.auditType === 'type2' && MEGA_MODE === 'auditor') {
                   const url = buildOrNormalizeUrl(item.url);
                   const asin = url ? url.match(/([A-Z0-9]{10})/)?.[1] : null;
                   if (asin) {
                       const vcDomain = getVendorCentralDomain(domainSelect.value);
                       const vcUrl = `https://${vcDomain}/imaging/manage?asins=${asin}`;
                       return [
                           { url: url, type: 'pdp', id: asin, comparisonData: item.comparisonData },
                           { url: vcUrl, type: 'vc', id: asin }
                       ];
                   }
                   return { ...item, url };
               }

               const normUrl = buildOrNormalizeUrl(item.url);
               return normUrl ? { ...item, url: normUrl } : null;
           }
       }).flat().filter(u => u !== null);
       if(urlsToProcess.length === 0) { alert("No valid URLs."); return; }
    }

    const scrapeAODCb = document.querySelector('.attr-checkbox[value="scrapeAOD"]');
    const currentWindow = await chrome.windows.getCurrent();
    const settings = {
        disableImages: (mode !== 'current' && disableImagesInput.checked),
        scrapeAOD: scrapeAODCb ? scrapeAODCb.checked : false
    };
    chrome.runtime.sendMessage({ 
        action: 'START_SCAN', 
        payload: { 
            urls: urlsToProcess, 
            mode, 
            settings,
            targetWindowId: currentWindow.id 
        } 
    });
  });

  stopBtn.addEventListener('click', () => { chrome.runtime.sendMessage({ action: 'STOP_SCAN' }); });

  function renderState(state) {
      if (!state) return;
      const { isScanning, processedCount, results } = state;
      const total = state.urlsToProcess.length;
      
      currentIsScanning = isScanning;

      if (total > 0) {
          progressCountDiv.style.display = 'block';
          progressCountDiv.textContent = `Processed: ${processedCount} / ${total}`;
      }

      if (previousIsScanning && !isScanning && results && results.length > 0) {
          setTimeout(() => downloadBtn.click(), 500); 
      }
      previousIsScanning = isScanning;

      if (isScanning) {
          scanBtn.style.display = 'none';
          stopBtn.style.display = 'block';
          progressContainer.style.display = 'block';
          downloadBtn.style.display = 'none';
          downloadXlsxBtn.style.display = 'none'; 
          pushSheetBtn.style.display = 'none'; 
          pushExcelBtn.style.display = 'none'; 
          downloadErrorsBtn.style.display = 'none';
          // if(copyBtn) copyBtn.style.display = 'none';
          clearSection.style.display = 'none';
          dashboardView.style.display = 'none';
          resultsPlaceholder.style.display = 'block'; 
          
          if(currentSection) currentSection.style.display = 'none';
          if(bulkSection) bulkSection.style.display = 'none';
          if(catalogueSection) catalogueSection.style.display = 'none';
      } else {
          scanBtn.style.display = 'block';
          stopBtn.style.display = 'none';
          progressContainer.style.display = 'none';
          
          if (results && results.length > 0) {
              downloadBtn.style.display = 'block';
              downloadXlsxBtn.style.display = 'block'; 
              pushSheetBtn.style.display = 'block'; 
              pushExcelBtn.style.display = 'block'; 
              // if(copyBtn) copyBtn.style.display = 'block';
              clearSection.style.display = 'block';
              resultsPlaceholder.style.display = 'none'; 

              // Check for errors to show/hide the error download button
              const hasErrors = results.some(r => r.error);
              if (hasErrors) {
                  downloadErrorsBtn.style.display = 'block';
              } else {
                  downloadErrorsBtn.style.display = 'none';
              }

              updateDashboard(results);
          } else {
              downloadBtn.style.display = 'none';
              downloadXlsxBtn.style.display = 'none';
              pushSheetBtn.style.display = 'none';
              pushExcelBtn.style.display = 'none';
              downloadErrorsBtn.style.display = 'none';
              // if(copyBtn) copyBtn.style.display = 'none';
              clearSection.style.display = 'none';
              resultsPlaceholder.style.display = 'block'; 
              
              if (mode === 'current') { if(currentSection) currentSection.style.display = 'block'; }
              else if (mode === 'bulk') { if(bulkSection) bulkSection.style.display = 'block'; }
              else if (mode === 'catalogue') { if(catalogueSection) catalogueSection.style.display = 'block'; }
          }
      }
      
      if (countdownInterval) clearInterval(countdownInterval);
      // If status message indicates waiting or processing, visually enhance it
      statusDiv.innerHTML = state.statusMessage;

      // Legacy timer logic removed as delays are now handled in background async flow
      // We can rely on background status updates which now include "Processing X - Y..."
  }

  function updateDashboard(results) {
      let totalLqs = 0; let issueCount = 0; let mismatchCount = 0;
      results.forEach(item => {
          if (item.attributes && item.attributes.lqs) {
              const score = parseInt(item.attributes.lqs.split('/')[0]);
              if (!isNaN(score)) totalLqs += score;
              if (score < 70) issueCount++;
          }
          if (item.expected && item.attributes.metaTitle !== item.expected.title) mismatchCount++;
      });
      const avg = results.length ? Math.round(totalLqs / results.length) : 0;
      statTotal.textContent = results.length;
      statLqs.textContent = avg + '/100';
      statIssues.textContent = mismatchCount > 0 ? `${mismatchCount} Diff` : issueCount;
      resultsPlaceholder.style.display = 'none';
      dashboardView.style.display = 'grid';
  }

  // --- Export Helpers & Strict Column Definitions ---

  // 1. Scraping Mode Columns (Strict)
  const SCRAPING_COLUMNS = [
      'marketplace', 'deliveryLocation', 'queryASIN', 'mediaAsin', 'url', 'parentAsin', 'brand', 'metaTitle',
      'bullets', 'bulletsCount', 'description', 'displayPrice', 'soldBy',
      'freeDeliveryDate', 'primeOrFastestDeliveryDate', 'paidDeliveryDate',
      'rating', 'reviews', 'bsr', 'imgVariantCount', 'imgVariantDetails',
      'aPlusImgs', 'brandStoryImgs', 'hasAplus', 'hasBrandStory', 'hasBullets', 'hasDescription',
      'variationExists', 'hasVideo', 'lqs', 'stockStatus',
      'variationFamily', 'variationCount', 'variationTheme', 'videos', 'videoCount'
      // Note: 'full list of sellers' is handled via secondary tab 'offers' if AOD data exists
  ];

  // 2. Audit Mode Columns (Superset including booleans and counts)
  const AUDIT_COLUMNS = [...SCRAPING_COLUMNS];

  const MASTER_COLUMNS = [
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
    { key: 'videos', header: 'videos' }
  ];

  const forcedFields = ['marketplace', 'deliveryLocation', 'mediaAsin', 'url', 'queryASIN'];
  const fieldConfig = {
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
    'brandStoryImgs': { type: 'attr' }, // Added to ensure main sheet export
    'hasAplus': { type: 'attr' },
    'aPlusImgs': { type: 'attr' }, // Added to ensure main sheet export
    'hasVideo': { type: 'attr' },
    'videoCount': { type: 'attr' },    
    'videos': { type: 'attr' }, // Added to ensure main sheet export
    'imgVariantCount': { type: 'calc' },
    'imgVariantDetails': { type: 'calc' },
    'url': { type: 'root' }
  };

  const cleanAmazonUrl = (url) => { if (!url || url === 'none') return null; return url.replace(/\._[A-Z0-9,._-]+\./i, '.'); };

  const getExportData = async () => {
    const data = await chrome.storage.local.get('auditState');
    let results = data.auditState ? data.auditState.results : [];
    if (!results || results.length === 0) return null;

    // --- Type 2 Audit Merge Logic ---
    // If multiple results exist for same ID (one PDP, one VC), merge them.
    if (MEGA_MODE === 'auditor') {
        const mergedMap = new Map();
        results.forEach(res => {
            const id = res.id || res.queryASIN || res.attributes?.mediaAsin || res.url; // Use ID from dual-task if available
            if (!mergedMap.has(id)) mergedMap.set(id, {});

            const existing = mergedMap.get(id);

            if (res.isVC) {
                existing.vcData = res; // Store VC result
            } else {
                existing.pdpData = res; // Store PDP result
            }
            // Preserve comparison inputs if attached to either
            if (res.comparisonData) existing.comparisonData = res.comparisonData;
        });

        // Flatten back to array, using PDP as base if exists, else VC
        results = Array.from(mergedMap.values()).map(merged => {
            const base = merged.pdpData || merged.vcData;
            if (!base) return null;
            // Attach merged parts
            base.vcData = merged.vcData;
            base.comparisonData = merged.comparisonData;
            return base;
        }).filter(Boolean);
    }

    const checkedValues = Array.from(document.querySelectorAll('.attr-checkbox:checked')).map(cb => cb.value);
    let selectedFields = [...new Set([...forcedFields, ...checkedValues])];
    
    // Filter based on Mega Mode Strictness
    const ALLOWED_SET = (MEGA_MODE === 'scraper') ? SCRAPING_COLUMNS : AUDIT_COLUMNS;
    selectedFields = selectedFields.filter(f => ALLOWED_SET.includes(f) || forcedFields.includes(f));

    // Sort fields based on MASTER_COLUMNS sequence
    const finalFields = [];
    MASTER_COLUMNS.forEach(col => {
        if (selectedFields.includes(col.key)) {
            finalFields.push(col.key);
        }
    });

    const now = new Date();
    const pad = (num) => num.toString().padStart(2, '0');
    const fileName = `Listing-Auditor_Report_${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}_${pad(now.getHours())}-${pad(now.getMinutes())}`;

    // Helper map for quick header lookup
    const keyToHeader = {};
    MASTER_COLUMNS.forEach(c => keyToHeader[c.key] = c.header);

    // Construct Header list with correct order
    const finalHeaders = finalFields.map(f => keyToHeader[f] || f);
    
    // Add Comparison Headers if Audit Mode
    if (MEGA_MODE === 'auditor') {
        const auditFields = [
            "Title", "Bullets", "Description",
            "Rating", "Reviews",
            "Images", "Video Count",
            "Brand Story", "A+ Modules",
            "Comparison ASINs",
            "Variation Count", "Variation Theme",
            "Seller", "Price"
        ];
        auditFields.forEach(f => {
            finalHeaders.push(`Expected ${f}`, `Match ${f}`);
        });
        finalHeaders.push("Expected Max Days", "Actual Delivery", "Match Delivery");
    } else {
        // Legacy Catalogue Comparison (if scraping mode but catalogue used)
        const hasExpectedData = results.some(r => r.expected);
        if (hasExpectedData) {
            finalHeaders.push("Expected Title", "Title Match", "Expected Bullets", "Bullets Match", "Initial Price", "Price Change");
        }
    }

    let csvHeader = finalHeaders.join(",") + "\n";

    const cleanField = (text) => {
      if (text === null || text === undefined || text === 'none') return '"none"';
      if (typeof text === 'object') return `"${JSON.stringify(text).replace(/"/g, '""')}"`;
      return `"${String(text).replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    };

    // --- Tab Data Containers ---
    const tabsData = [];
    const createTab = (name, headers) => ({ name, headers, rows: [] });

    // Only create tabs if the parent field is selected
    const tabMap = {};
    const countTrackers = { variationFamily: 0, bullets: 0, brandStoryImgs: 0, aPlusImgs: 0, videos: 0 };

    if (selectedFields.includes('variationFamily')) tabMap.variationFamily = createTab('variationFamily', ['pageASIN', 'variation_family_count']);
    if (selectedFields.includes('bullets')) tabMap.bullets = createTab('bullets', ['pageASIN', 'bullet_count']);
    if (selectedFields.includes('brandStoryImgs')) tabMap.brandStoryImgs = createTab('brandStoryImgs', ['pageASIN', 'brand_story_image_count']);
    if (selectedFields.includes('aPlusImgs')) tabMap.aPlusImgs = createTab('aPlusImgs', ['pageASIN', 'aplus_image_count']);
    if (selectedFields.includes('videos')) tabMap.videos = createTab('videos', ['pageASIN', 'video_count']);
    if (selectedFields.includes('imgVariantDetails')) tabMap.imgVariantDetails = createTab('imgVariantDetails', ['pageASIN', 'variant', 'hiRes', 'large']);

    // Always create Offers tab if data exists, or conditionally? Let's check results first.
    // If ANY result has aodData, we create the Offers tab.
    const hasAOD = results.some(r => r.attributes && r.attributes.aodData && r.attributes.aodData.length > 0);
    if (hasAOD) tabMap.offers = createTab('offers', ['pageASIN', 'price', 'ships_from', 'sold_by', 'rating', 'reviews', 'delivery_time']);

    const rows = results.map(tabData => {
        let rowStatus = "SUCCESS";
        if (tabData.error) {
            rowStatus = "ERROR";
        } else {
            const qAsin = tabData.queryASIN || 'none';
            const pAsin = tabData.attributes.mediaAsin || 'none';
            if (qAsin !== 'none' && pAsin !== 'none' && qAsin !== pAsin) rowStatus = "ASIN Redirect";
        }

        const row = {};
        
        if (tabData.error) {
             finalFields.forEach(f => {
                 let val = '';
                 if (f === 'status') val = "ERROR";
                 else if (f === 'url') val = tabData.url || '';
                 else if (f === 'marketplace') val = tabData.error;
                 row[keyToHeader[f] || f] = val;
             });
        } else {
            const pageASIN = tabData.attributes.mediaAsin || 'none';
            
            finalFields.forEach(id => {
                let val = 'none';
                if (id === 'status') {
                    val = rowStatus;
                } else {
                    const config = fieldConfig[id];
                    if (config) {
                        if (config.type === 'attr') {
                            val = tabData.attributes[id];
                            // Ensure objects/arrays are stringified for CSV/Main Sheet
                            if (val && typeof val === 'object') {
                                val = JSON.stringify(val);
                            }
                        }
                        else if (config.type === 'root') val = tabData[id];
                        else if (config.type === 'calc') {
                          if (id === 'imgVariantCount') val = tabData.data ? tabData.data.length : 0;
                          else if (id === 'imgVariantDetails') {
                            val = tabData.data ? JSON.stringify(tabData.data.map(item => ({
                                variant: item.variant,
                                hiRes: cleanAmazonUrl(item.hiRes),
                                large: cleanAmazonUrl(item.large)
                            }))) : [];
                          }
                        }
                    }
                }
                row[keyToHeader[id] || id] = val;
            });

            // --- Populate Extra Tabs ---
            if (tabMap.variationFamily) {
                let vFamilies = [];
                try {
                    let raw = tabData.attributes.variationFamily;
                    if (raw && raw !== 'none') {
                        // Fix for format: [ASIN1, ASIN2, ...] which might not be valid JSON if not quoted
                        if (raw.startsWith('[') && raw.endsWith(']')) {
                            // Strip brackets and split by comma
                            const cleanContent = raw.slice(1, -1);
                            vFamilies = cleanContent.split(',').map(s => s.trim().replace(/['"]+/g, '')).filter(s => s.length > 0);
                        } else {
                            vFamilies = JSON.parse(raw);
                        }
                    }
                } catch(e) { console.error("Error parsing variationFamily:", e); }

                if (Array.isArray(vFamilies) && vFamilies.length > 0) {
                    if (vFamilies.length > countTrackers.variationFamily) countTrackers.variationFamily = vFamilies.length;
                    tabMap.variationFamily.rows.push([pageASIN, vFamilies.length, ...vFamilies]);
                }
            }
            if (tabMap.bullets) {
                const bText = tabData.attributes.bullets;
                if (bText && bText !== 'none') {
                    const bList = bText.split('|').map(s => s.trim());
                    if (bList.length > countTrackers.bullets) countTrackers.bullets = bList.length;
                    tabMap.bullets.rows.push([pageASIN, bList.length, ...bList]);
                }
            }
            if (tabMap.brandStoryImgs) {
                const bs = tabData.attributes.brandStoryImgs;
                if (Array.isArray(bs) && bs.length > 0) {
                    const urls = bs.map(item => item['brand-story-image']);
                    if (urls.length > countTrackers.brandStoryImgs) countTrackers.brandStoryImgs = urls.length;
                    tabMap.brandStoryImgs.rows.push([pageASIN, urls.length, ...urls]);
                }
            }
            if (tabMap.aPlusImgs) {
                const ap = tabData.attributes.aPlusImgs;
                if (Array.isArray(ap) && ap.length > 0) {
                    const urls = ap.map(item => item['a-plus-image']);
                    if (urls.length > countTrackers.aPlusImgs) countTrackers.aPlusImgs = urls.length;
                    tabMap.aPlusImgs.rows.push([pageASIN, urls.length, ...urls]);
                }
            }
            if (tabMap.videos) {
                const vids = tabData.attributes.videos;
                if (Array.isArray(vids) && vids.length > 0) {
                    const urls = vids.map(item => item['video_url']);
                    if (urls.length > countTrackers.videos) countTrackers.videos = urls.length;
                    tabMap.videos.rows.push([pageASIN, urls.length, ...urls]);
                }
            }
            if (tabMap.imgVariantDetails) {
                if (tabData.data && Array.isArray(tabData.data)) {
                    tabData.data.forEach(d => {
                        tabMap.imgVariantDetails.rows.push([
                            pageASIN, 
                            d.variant, 
                            cleanAmazonUrl(d.hiRes), 
                            cleanAmazonUrl(d.large)
                        ]);
                    });
                }
            }
            if (tabMap.offers && tabData.attributes.aodData) {
                tabData.attributes.aodData.forEach(offer => {
                    tabMap.offers.rows.push([
                        pageASIN,
                        offer.price || 'none',
                        offer.shipsFrom || 'none',
                        offer.soldBy || 'unknown',
                        offer.rating || 'none',
                        offer.reviews || 'none',
                        offer.sellerDeliveryTime || 'none'
                    ]);
                });
            }
        }

        // --- Audit Mode Comparisons (10 Audits) ---
        if (MEGA_MODE === 'auditor') {
            const comp = tabData.comparisonData || {};
            const attrs = tabData.attributes;

            const setMatch = (label, expected, actual, type='exact') => {
                if (!expected) {
                    row[`Expected ${label}`] = "N/A";
                    row[`Match ${label}`] = "N/A";
                    return;
                }
                row[`Expected ${label}`] = expected;

                let match = false;
                if (type === 'exact') match = (String(actual).trim() === String(expected).trim());
                else if (type === 'contains') match = (String(actual).includes(String(expected)));
                else if (type === 'gte') match = (parseFloat(actual) >= parseFloat(expected));
                else if (type === 'lte') match = (parseFloat(actual) <= parseFloat(expected));
                else if (type === 'list') {
                    const expList = String(expected).split(',').map(s => s.trim());
                    const actStr = JSON.stringify(actual);
                    match = expList.every(item => actStr.includes(item));
                }

                row[`Match ${label}`] = match ? "TRUE" : "FALSE";
            };

            setMatch("Title", comp.expected_title, attrs.metaTitle);
            setMatch("Bullets", comp.expected_bullets, attrs.bullets, 'contains');
            setMatch("Description", comp.expected_description, attrs.description, 'contains');
            setMatch("Rating", comp.expected_rating, attrs.rating, 'gte');
            setMatch("Reviews", comp.expected_reviews, attrs.reviews, 'gte');
            setMatch("Images", comp.expected_images, tabData.data, 'list');
            setMatch("Video Count", comp.expected_video_count, attrs.videoCount, 'gte');
            setMatch("Brand Story", comp.expected_brand_story, attrs.brandStoryImgs, 'list');
            setMatch("A+ Modules", comp.expected_aplus, attrs.aPlusImgs, 'list');
            setMatch("Comparison ASINs", comp.expected_comparison, attrs.comparisonAsins, 'list');
            setMatch("Variation Count", comp.expected_variation_count, attrs.variationCount, 'exact');
            setMatch("Variation Theme", comp.expected_variation_theme, attrs.variationTheme, 'exact');
            setMatch("Seller", comp.expected_seller, attrs.soldBy);
            setMatch("Price", comp.expected_price, attrs.displayPrice, 'exact');

            row["Expected Max Days"] = comp.expected_delivery_days || "N/A";
            row["Actual Delivery"] = attrs.primeOrFastestDeliveryDate || attrs.freeDeliveryDate || "N/A";
            row["Match Delivery"] = (comp.expected_delivery_days) ? "MANUAL" : "N/A";

        } else if (tabData.expected && !tabData.error) {
            // Legacy Watchlist Comparison
            const expTitle = tabData.expected.title || "none";
            const actTitle = tabData.attributes.metaTitle || "none";
            const titleMatch = (expTitle !== "none" && expTitle === actTitle) ? "TRUE" : (expTitle === "none" ? "-" : "FALSE");
            row['Expected Title'] = expTitle;
            row['Title Match'] = titleMatch;

            const expBullets = tabData.expected.bullets || "none";
            const actBullets = tabData.attributes.bullets || "none";
            const bulletMatch = (expBullets !== "none" && expBullets === actBullets) ? "TRUE" : (expBullets === "none" ? "-" : "FALSE");
            row['Expected Bullets'] = expBullets;
            row['Bullets Match'] = bulletMatch;

            const initPrice = tabData.expected.price || "none";
            const currPrice = tabData.attributes.displayPrice || "none";
            const priceChange = (initPrice !== "none" && initPrice !== currPrice) ? "CHANGED" : "-";
            row['Initial Price'] = initPrice;
            row['Price Change'] = priceChange;
        } else {
            // Fill empty if needed, or leave undefined
        }
        
        // Generate CSV Line from row object using header order
        const rowStr = finalHeaders.map(h => cleanField(row[h])).join(",");
        return { rowObj: row, csvLine: rowStr };
    });

    // --- Update Dynamic Headers for Tabs ---
    if (tabMap.variationFamily) {
        for(let i=1; i<=countTrackers.variationFamily; i++) tabMap.variationFamily.headers.push(`child_ASIN${i}`);
    }
    if (tabMap.bullets) {
        for(let i=1; i<=countTrackers.bullets; i++) tabMap.bullets.headers.push(`bullet_${i}`);
    }
    if (tabMap.brandStoryImgs) {
        for(let i=1; i<=countTrackers.brandStoryImgs; i++) tabMap.brandStoryImgs.headers.push(`image_${i}`);
    }
    if (tabMap.aPlusImgs) {
        for(let i=1; i<=countTrackers.aPlusImgs; i++) tabMap.aPlusImgs.headers.push(`image_${i}`);
    }
    if (tabMap.videos) {
        for(let i=1; i<=countTrackers.videos; i++) tabMap.videos.headers.push(`video_url_${i}`);
    }

    Object.values(tabMap).forEach(tab => tabsData.push(tab));

    return { 
        rows: rows.map(r => r.rowObj), 
        fileName, 
        csvContent: csvHeader + rows.map(r => r.csvLine).join("\n"),
        headers: finalHeaders,
        tabsData // Secondary tabs
    };
  };

  downloadBtn.addEventListener('click', async () => {
    const exportData = await getExportData();
    if (!exportData) return;
    const blob = new Blob([exportData.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", exportData.fileName + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  downloadErrorsBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('auditState');
    const results = data.auditState ? data.auditState.results : [];
    if (!results || results.length === 0) return;

    const failedItems = results.filter(r => r.error);
    if (failedItems.length === 0) {
        alert("No errors to export.");
        return;
    }

    const headers = ["URL", "ASIN", "Error Message"];
    let csvContent = headers.join(",") + "\n";

    failedItems.forEach(item => {
        const url = item.url || "none";
        const asin = item.queryASIN || (item.attributes ? item.attributes.mediaAsin : "none");
        const errorMsg = item.error ? item.error.replace(/,/g, " ") : "Unknown Error";

        csvContent += `"${url}","${asin}","${errorMsg}"\n`;
    });

    const now = new Date();
    const pad = (num) => num.toString().padStart(2, '0');
    const fileName = `Listing-Auditor_Errors_${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${now.getFullYear()}.csv`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  downloadXlsxBtn.addEventListener('click', async () => {
      const exportData = await getExportData();
      if (!exportData) return;
      if (typeof XLSX === 'undefined') {
          alert("XLSX library not loaded. Please ensure xlsx.full.min.js is in the extension folder.");
          return;
      }
      const wb = XLSX.utils.book_new();
      const dashData = [
          ["Audit Summary", ""],
          ["Total Audited", document.getElementById('statTotal').textContent],
          ["Average LQS", document.getElementById('statLqs').textContent],
          ["Issues / Mismatches", document.getElementById('statIssues').textContent],
          ["Date", new Date().toLocaleString()]
      ];
      const wsDash = XLSX.utils.aoa_to_sheet(dashData);
      XLSX.utils.book_append_sheet(wb, wsDash, "Dashboard");
      const wsData = XLSX.utils.json_to_sheet(exportData.rows, { header: exportData.headers });
      XLSX.utils.book_append_sheet(wb, wsData, "Audit Data");

      // Append Secondary Tabs
      if (exportData.tabsData) {
          exportData.tabsData.forEach(tab => {
              const ws = XLSX.utils.aoa_to_sheet([tab.headers, ...tab.rows]);
              XLSX.utils.book_append_sheet(wb, ws, tab.name);
          });
      }

      XLSX.writeFile(wb, exportData.fileName + ".xlsx");
  });

  // --- Google Sheets Logic ---
  pushSheetBtn.addEventListener('click', () => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) { alert("Google Auth failed."); return; }
        createAndPushSheet(token);
    });
  });
  async function createAndPushSheet(token) {
      statusDiv.textContent = "Creating Google Sheet...";
      try {
          const exportData = await getExportData(); if(!exportData) return;
          
          // Prepare Sheets array for creation
          const sheets = [{ properties: { title: 'Audit Data' } }];
          const dataToPush = [];

          // Main Data
          const mainValues = [exportData.headers]; 
          exportData.rows.forEach(r => { mainValues.push(exportData.headers.map(h => r[h])); });
          dataToPush.push({ range: "'Audit Data'!A1", values: mainValues });

          // Secondary Tabs
          if (exportData.tabsData) {
              exportData.tabsData.forEach(tab => {
                  sheets.push({ properties: { title: tab.name } });
                  const tabValues = [tab.headers, ...tab.rows];
                  dataToPush.push({ range: `'${tab.name}'!A1`, values: tabValues });
              });
          }

          // Create Spreadsheet with all sheets
          const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', { 
              method: 'POST', 
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ 
                  properties: { title: exportData.fileName },
                  sheets: sheets
              }) 
          });
          
          if(!createRes.ok) throw new Error("Failed to create sheet");
          const sheetData = await createRes.json();
          const spreadsheetId = sheetData.spreadsheetId; 
          const sheetUrl = sheetData.spreadsheetUrl;

          statusDiv.textContent = "Pushing data...";
          
          // Batch Update Values
          const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, { 
              method: 'POST', 
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ 
                  valueInputOption: 'USER_ENTERED',
                  data: dataToPush
              }) 
          });

          if(!updateRes.ok) throw new Error("Failed to append data");
          statusDiv.textContent = "Success! Opening Sheet..."; window.open(sheetUrl, '_blank');
      } catch(e) { console.error(e); alert("Error pushing to Google Sheet: " + e.message); statusDiv.textContent = "Error."; }
  }

  // --- NEW: Push to Excel Online Logic ---

  function getMicrosoftToken(interactive, callback) {
      const redirectUri = chrome.identity.getRedirectURL();
      const scope = MS_SCOPES;
      const nonce = Math.random().toString(36).substring(2, 15);
      const authUrl = `${MS_AUTH_URL}?client_id=${MS_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&nonce=${nonce}`;

      chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive: interactive
      }, (responseUrl) => {
          if (chrome.runtime.lastError) {
              callback(null);
              return;
          }
          if (!responseUrl) {
              callback(null);
              return;
          }
          try {
              const url = new URL(responseUrl);
              const urlParams = new URLSearchParams(url.hash.substring(1));
              const accessToken = urlParams.get("access_token");
              callback(accessToken);
          } catch(e) {
              callback(null);
          }
      });
  }

  pushExcelBtn.addEventListener('click', () => {
      // If already logged in with Microsoft, try using that token first
      if (IS_LOGGED_IN && USER_INFO && USER_INFO.provider === 'microsoft' && USER_INFO.token) {
          uploadToOneDrive(USER_INFO.token, true); // Add retry flag
          return;
      }

      // Otherwise (Google login or not logged in), force MS Auth
      getMicrosoftToken(true, (token) => {
          if (!token) { alert("Microsoft Auth failed. Cannot push to Excel."); return; }
          uploadToOneDrive(token);
      });
  });

  async function uploadToOneDrive(token, retry = false) {
      statusDiv.textContent = "Preparing Excel file...";
      try {
          const exportData = await getExportData();
          if(!exportData) return;

          // 1. Generate Excel Binary using SheetJS (Same as download logic)
          if (typeof XLSX === 'undefined') { alert("SheetJS not loaded."); return; }
          const wb = XLSX.utils.book_new();
          const dashData = [ ["Audit Summary", ""], ["Total Audited", document.getElementById('statTotal').textContent], ["Average LQS", document.getElementById('statLqs').textContent], ["Issues", document.getElementById('statIssues').textContent], ["Date", new Date().toLocaleString()] ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dashData), "Dashboard");
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportData.rows, { header: exportData.headers }), "Audit Data");
          
          // Append Secondary Tabs
          if (exportData.tabsData) {
              exportData.tabsData.forEach(tab => {
                  const ws = XLSX.utils.aoa_to_sheet([tab.headers, ...tab.rows]);
                  XLSX.utils.book_append_sheet(wb, ws, tab.name);
              });
          }

          // Generate ArrayBuffer
          const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          
          // 2. Upload to OneDrive App Folder (or Root if App Folder not accessible)
          statusDiv.textContent = "Uploading to OneDrive...";
          const fileName = exportData.fileName + ".xlsx";
          const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`;
          
          const response = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              },
              body: wbOut
          });

          if (response.status === 401 && retry) {
              // Token expired or invalid, try refreshing via interactive auth
              console.log("Token expired, refreshing...");
              getMicrosoftToken(true, (newToken) => {
                  if (newToken) {
                      // Update global session if it was MS
                      if (IS_LOGGED_IN && USER_INFO.provider === 'microsoft') {
                          USER_INFO.token = newToken;
                          chrome.storage.local.set({ userSession: USER_INFO });
                      }
                      uploadToOneDrive(newToken, false);
                  } else {
                      alert("Microsoft Auth session expired. Please log in again.");
                      statusDiv.textContent = "Auth Error.";
                  }
              });
              return;
          }

          if (!response.ok) {
              const err = await response.json();
              throw new Error(err.error ? err.error.message : "Upload failed");
          }

          const fileData = await response.json();
          // 3. Open in Excel Online
          if (fileData.webUrl) {
              statusDiv.textContent = "Success! Opening Excel...";
              window.open(fileData.webUrl, '_blank');
          } else {
              alert("Upload successful, but no Web URL returned.");
          }

      } catch(e) {
          console.error(e);
          alert("Error pushing to Excel: " + e.message);
          statusDiv.textContent = "Error.";
      }
  }

  selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.attr-checkbox:not(:disabled)').forEach(cb => cb.checked = e.target.checked);
    saveCheckboxState();
    updateGroupCheckboxes();
  });

  // Init Catalogues
  initCatalogues(() => {
      loadCatalogue();
  });
});
