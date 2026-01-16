document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const downloadXlsxBtn = document.getElementById('downloadXlsxBtn'); 
  const pushSheetBtn = document.getElementById('pushSheetBtn'); 
  const pushExcelBtn = document.getElementById('pushExcelBtn');
  const previewBtn = document.getElementById('previewBtn'); 
  const resultsPlaceholder = document.getElementById('resultsPlaceholder');
  const statusDiv = document.getElementById('status');
  const progressCountDiv = document.getElementById('progressCount'); 
  const selectAllCheckbox = document.getElementById('selectAll');
  const downloadErrorsBtn = document.getElementById('downloadErrorsBtn');
  
  // Tabs & Sections
  const tabCurrent = document.getElementById('tabCurrent');
  const tabBulk = document.getElementById('tabBulk');
  const tabWatchlist = document.getElementById('tabWatchlist'); 
  const bulkSection = document.getElementById('bulkSection');
  const currentSection = document.getElementById('currentSection'); 
  const watchlistSection = document.getElementById('watchlistSection'); 
  
  const pasteLinksBtn = document.getElementById('pasteLinksBtn'); 
  const snapshotBtn = document.getElementById('snapshotBtn'); 
  const pasteStatus = document.getElementById('pasteStatus'); 
  
  const csvInput = document.getElementById('csvInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const importWatchlistBtn = document.getElementById('importWatchlistBtn'); 
  const batchSizeInput = document.getElementById('batchSizeInput');
  const disableImagesInput = document.getElementById('disableImages');
  const fileStatus = document.getElementById('fileStatus');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const domainSelect = document.getElementById('domainSelect');
  const feedbackLink = document.getElementById('feedbackLink');
  
  // Watchlist Elements
  const watchlistItemsDiv = document.getElementById('watchlistItems');
  const watchlistCountDiv = document.getElementById('watchlistCount');
  const watchlistLimitMsg = document.getElementById('watchlistLimitMsg'); 
  const clearWatchlistBtn = document.getElementById('clearWatchlistBtn');
  const auditWatchlistBtn = document.getElementById('auditWatchlistBtn');

  // Clear Elements
  const clearSection = document.getElementById('clearSection');
  const clearBtn = document.getElementById('clearBtn');
  const clearConfirmMsg = document.getElementById('clearConfirmMsg');

  // Modal Elements
  const previewModal = document.getElementById('previewModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalBody = document.getElementById('modalBody');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');

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

  // --- State Variables ---
  let mode = 'current'; 
  let rawCsvData = []; 
  let IS_LOGGED_IN = false; 
  let USER_INFO = null;
  const GUEST_LIMIT = 10;
  const PRO_LIMIT = 10000; 
  const WATCHLIST_GUEST_LIMIT = 10; 
  const WATCHLIST_PRO_LIMIT = 10000; 
  let countdownInterval = null;
  let previousIsScanning = false;
  let clearConfirmationPending = false; 
  let currentIsScanning = false;

  // --- CONFIG: Microsoft Auth ---
  const MS_CLIENT_ID = "88f7ac32-e2ab-401f-8019-f1780e23685d"; 
  const MS_AUTH_URL = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`;
  const MS_SCOPES = "openid profile User.Read email Files.ReadWrite";

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

  // --- Feature: Watchlist Logic (Updated for Price & Separate Storage) ---
  const getWatchlistKey = () => IS_LOGGED_IN ? 'watchlist_pro' : 'watchlist';

  const loadWatchlist = () => {
      const key = getWatchlistKey();
      chrome.storage.local.get([key], (data) => {
          const list = data[key] || [];
          renderWatchlist(list);
          if (IS_LOGGED_IN) { watchlistLimitMsg.textContent = `Limit: Unlimited (Pro)`; watchlistLimitMsg.style.color = "var(--success)"; } 
          else { watchlistLimitMsg.textContent = `Limit: ${WATCHLIST_GUEST_LIMIT} (Free)`; watchlistLimitMsg.style.color = "var(--text-muted)"; }
      });
  };

  const addToWatchlist = (items) => {
      const key = getWatchlistKey();
      chrome.storage.local.get([key], (data) => {
          let list = data[key] || [];
          const limit = IS_LOGGED_IN ? WATCHLIST_PRO_LIMIT : WATCHLIST_GUEST_LIMIT;
          const newAsins = items.filter(newItem => !list.some(existing => existing.asin === newItem.asin));
          
          if (list.length + newAsins.length > limit) {
              alert(`Watchlist Limit Reached!\n\nPlease delete items or login.`);
              return;
          }

          let addedCount = 0;
          items.forEach(newItem => {
              const existingIndex = list.findIndex(i => i.asin === newItem.asin);
              if (existingIndex > -1) {
                  list[existingIndex] = { ...list[existingIndex], ...newItem };
              } else {
                  list.push(newItem);
                  addedCount++;
              }
          });
          
          chrome.storage.local.set({ [key]: list }, () => {
              loadWatchlist();
              if (mode === 'current') {
                  pasteStatus.textContent = `Saved to Watchlist!`;
                  pasteStatus.style.color = "var(--success)";
                  setTimeout(() => pasteStatus.textContent = "", 2000);
              } else if (mode === 'bulk') {
                  fileStatus.textContent = `Imported ${addedCount} items.`;
                  fileStatus.style.color = "var(--success)";
              }
          });
      });
  };

  const removeFromWatchlist = (asin) => {
      const key = getWatchlistKey();
      chrome.storage.local.get([key], (data) => {
          let list = data[key] || [];
          const newList = list.filter(item => item.asin !== asin);
          chrome.storage.local.set({ [key]: newList }, loadWatchlist);
      });
  };

  const clearWatchlist = () => {
      if (confirm("Are you sure you want to clear your entire watchlist?")) {
          const key = getWatchlistKey();
          chrome.storage.local.set({ [key]: [] }, loadWatchlist);
      }
  };

  const renderWatchlist = (list) => {
      watchlistCountDiv.textContent = `${list.length} Items`;
      watchlistItemsDiv.innerHTML = "";
      
      if (list.length === 0) {
          watchlistItemsDiv.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted); font-size:11px;">Watchlist is empty.</div>';
          auditWatchlistBtn.disabled = true;
          return;
      }
      
      auditWatchlistBtn.disabled = false;

      list.forEach(item => {
          const div = document.createElement('div');
          div.className = 'wl-item';
          div.innerHTML = `
              <div class="wl-info">
                  <span class="wl-asin">${item.asin}</span> 
                  <span class="wl-title">- ${item.expected.title ? item.expected.title.substring(0, 30) + "..." : "No Title"}</span>
              </div>
              <div class="wl-del" title="Remove">×</div>
          `;
          div.querySelector('.wl-del').addEventListener('click', () => removeFromWatchlist(item.asin));
          watchlistItemsDiv.appendChild(div);
      });
  };

  clearWatchlistBtn.addEventListener('click', clearWatchlist);

  auditWatchlistBtn.addEventListener('click', () => {
      const key = getWatchlistKey();
      chrome.storage.local.get([key], (data) => {
          const list = data[key] || [];
          if (list.length === 0) return;
          const urlsToProcess = list; 
          const settings = { disableImages: disableImagesInput.checked };
          chrome.runtime.sendMessage({ action: 'START_SCAN', payload: { urls: urlsToProcess, mode: 'watchlist', settings } });
      });
  });

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
                  initialPrice: data.attributes.displayPrice, // Save Price
                  expected: {
                      title: data.attributes.metaTitle,
                      bullets: data.attributes.bullets
                  }
              };
              
              if (newItem.asin === "none") {
                  pasteStatus.textContent = "Could not detect ASIN.";
                  pasteStatus.style.color = "var(--danger)";
                  return;
              }

              addToWatchlist([newItem]);
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

  importWatchlistBtn.addEventListener('click', () => {
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
                  expected: item.expected
              };
          }
      }).filter(i => i.url !== null);

      if (itemsToSave.length > 0) {
          addToWatchlist(itemsToSave);
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
          copyBtn.style.display = 'none'; 
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
      if (MS_CLIENT_ID === "YOUR_MICROSOFT_CLIENT_ID_HERE") {
          alert("Developer Config Error: Please add Microsoft Client ID in popup.js");
          return;
      }
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

  function handleLoginSuccess(session) {
      IS_LOGGED_IN = true;
      USER_INFO = session;
      chrome.storage.local.set({ userSession: session });
      updateUIForAuth();
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
      if (IS_LOGGED_IN) {
          googleBtn.style.display = 'none';
          msBtn.style.display = 'none';
          logoutBtn.style.display = 'flex';
          const name = USER_INFO ? (USER_INFO.name || 'User') : 'Pro User';
          logoutBtn.textContent = `Logout (${name})`;
          
          tabBulk.classList.remove('disabled');
          tabBulk.querySelector('.lock-icon').style.display = 'none';
          
          tabWatchlist.classList.remove('disabled');
          // No lock icon query here

          document.querySelectorAll('.pro-feature').forEach(el => { el.disabled = false; el.checked = true; });
          document.querySelectorAll('.group-select').forEach(el => el.disabled = false);
          selectAllCheckbox.disabled = false;
      } else {
          googleBtn.style.display = 'flex';
          msBtn.style.display = 'flex';
          logoutBtn.style.display = 'none';
          
          if (mode === 'bulk' && !document.getElementById('stopBtn').offsetParent) tabCurrent.click();
          
          tabBulk.classList.add('disabled');
          tabBulk.querySelector('.lock-icon').style.display = 'inline';
          
          tabWatchlist.classList.remove('disabled');
          // No lock icon query here

          document.querySelectorAll('.pro-feature').forEach(el => { el.checked = false; el.disabled = true; });
          document.querySelector('.group-select[data-group="advanced"]').disabled = true;
          document.querySelector('.group-select[data-group="content"]').disabled = true;
          selectAllCheckbox.checked = false;
          selectAllCheckbox.disabled = true;
      }
      loadCheckboxState(); 
      loadWatchlist();
  }

  // --- Logic Load ---
  chrome.storage.local.get(['auditState'], (data) => {
    if (data.auditState) {
      renderState(data.auditState);
      if(data.auditState.isScanning) {
          const m = data.auditState.mode;
          mode = m;
          currentSection.style.display = 'none';
          bulkSection.style.display = 'none';
          watchlistSection.style.display = 'none';
          document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
          if(m === 'current') tabCurrent.classList.add('active'); 
          else if(m === 'bulk') tabBulk.classList.add('active'); 
          else if(m === 'watchlist') tabWatchlist.classList.add('active');
      }
    }
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

  batchSizeInput.addEventListener('input', () => {
      let val = parseInt(batchSizeInput.value, 10);
      if (val > 30) batchSizeInput.value = 30;
      else if (val < 1) batchSizeInput.value = 1;
  });

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
    tabWatchlist.classList.remove('active');
    bulkSection.style.display = 'none';
    watchlistSection.style.display = 'none';
    currentSection.style.display = 'block'; 
    scanBtn.textContent = 'Start Audit (Current Tabs)';
  });

  tabBulk.addEventListener('click', () => {
    if (!IS_LOGGED_IN) { alert("Please Login."); return; }
    mode = 'bulk';
    tabBulk.classList.add('active');
    tabCurrent.classList.remove('active');
    tabWatchlist.classList.remove('active');
    bulkSection.style.display = 'block';
    currentSection.style.display = 'none'; 
    watchlistSection.style.display = 'none';
    scanBtn.textContent = 'Start Bulk Audit';
  });

  tabWatchlist.addEventListener('click', () => {
      mode = 'watchlist';
      tabWatchlist.classList.add('active');
      tabCurrent.classList.remove('active');
      tabBulk.classList.remove('active');
      watchlistSection.style.display = 'block';
      bulkSection.style.display = 'none';
      currentSection.style.display = 'none'; 
      loadWatchlist(); 
  });

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
  pasteLinksBtn.addEventListener('click', () => handlePaste(GUEST_LIMIT, pasteStatus));
  pasteBtn.addEventListener('click', () => handlePaste(PRO_LIMIT, fileStatus));

  csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      const text = event.target.result;
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length === 0) return;

      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes(',') && (firstLine.includes('url') || firstLine.includes('asin'))) {
          const headers = csvLineParser(lines[0]).map(h => h.toLowerCase().replace(/['"]+/g, ''));
          const urlIndex = headers.findIndex(h => h.includes('url') || h.includes('asin'));
          const titleIndex = headers.findIndex(h => h.includes('expected title'));
          const bulletIndex = headers.findIndex(h => h.includes('expected bullets'));

          if (urlIndex === -1) { fileStatus.textContent = "Error: Missing URL/ASIN column."; return; }

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
          fileStatus.textContent = `Loaded ${structuredData.length} structured rows.`;
      } else {
          rawCsvData = lines.map(line => line.trim());
          fileStatus.textContent = `Loaded ${lines.length} lines.`;
      }
      fileStatus.style.color = "var(--success)";
    };
    reader.readAsText(file);
  });

  scanBtn.addEventListener('click', async () => {
    let urlsToProcess = [];
    if (mode === 'current') {
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
       if (!IS_LOGGED_IN) { alert("Login required."); return; }
       if (rawCsvData.length === 0) { alert("No Data."); return; }
       urlsToProcess = rawCsvData.map(item => {
           if (typeof item === 'string') return buildOrNormalizeUrl(item);
           else {
               const normUrl = buildOrNormalizeUrl(item.url);
               return normUrl ? { ...item, url: normUrl } : null;
           }
       }).filter(u => u !== null);
       if(urlsToProcess.length === 0) { alert("No valid URLs."); return; }
    }

    const settings = { disableImages: (mode === 'bulk' && disableImagesInput.checked) };
    chrome.runtime.sendMessage({ action: 'START_SCAN', payload: { urls: urlsToProcess, mode, settings } });
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
          copyBtn.style.display = 'none';
          clearSection.style.display = 'none';
          dashboardView.style.display = 'none';
          resultsPlaceholder.style.display = 'block'; 
          
          if(currentSection) currentSection.style.display = 'none';
          if(bulkSection) bulkSection.style.display = 'none';
          if(watchlistSection) watchlistSection.style.display = 'none'; 
      } else {
          scanBtn.style.display = 'block';
          stopBtn.style.display = 'none';
          progressContainer.style.display = 'none';
          
          if (results && results.length > 0) {
              downloadBtn.style.display = 'block';
              downloadXlsxBtn.style.display = 'block'; 
              pushSheetBtn.style.display = 'block'; 
              pushExcelBtn.style.display = 'block'; 
              copyBtn.style.display = 'block';
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
              copyBtn.style.display = 'none';
              clearSection.style.display = 'none';
              resultsPlaceholder.style.display = 'block'; 
              
              if (mode === 'current') { if(currentSection) currentSection.style.display = 'block'; }
              else if (mode === 'bulk') { if(bulkSection) bulkSection.style.display = 'block'; }
              else if (mode === 'watchlist') { if(watchlistSection) watchlistSection.style.display = 'block'; }
          }
      }
      
      if (countdownInterval) clearInterval(countdownInterval);
      if (isScanning && state.nextActionTime && state.nextActionTime > Date.now()) {
          const updateTimer = () => {
             const secondsLeft = Math.ceil((state.nextActionTime - Date.now()) / 1000);
             if (secondsLeft <= 0) {
                 clearInterval(countdownInterval);
                 statusDiv.innerHTML = "Processing next step...";
             } else {
                 const baseMsg = state.statusMessage.split('...')[0]; 
                 statusDiv.innerHTML = `${baseMsg}... Next action in: <b>${secondsLeft}s</b>`;
             }
          };
          updateTimer(); 
          countdownInterval = setInterval(updateTimer, 1000);
      } else {
          statusDiv.innerHTML = state.statusMessage;
      }
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

  // --- Export Helpers ---
  const MASTER_COLUMNS = [
    { key: 'status', header: 'status' },
    { key: 'marketplace', header: 'marketPlace' },
    { key: 'deliveryLocation', header: 'deliveryLocation' },
    { key: 'url', header: 'pageURL' },
    { key: 'queryASIN', header: 'queryASIN' },
    { key: 'mediaAsin', header: 'pageASIN' },
    { key: 'parentAsin', header: 'parentAsin' },
    { key: 'lqs', header: 'lqs' },
    { key: 'displayPrice', header: 'displayPrice' },
    { key: 'stockStatus', header: 'stockStatus' },
    { key: 'freeDeliveryDate', header: 'freeDeliveryDate' },
    { key: 'paidDeliveryDate', header: 'paidDeliveryDate' },
    { key: 'primeOrFastestDeliveryDate', header: 'primeOrFastestDeliveryDate' },
    { key: 'soldBy', header: 'soldBy' },
    { key: 'rating', header: 'rating' },
    { key: 'reviews', header: 'reviews' },
    { key: 'bsr', header: 'bestSellersRank' },
    { key: 'brand', header: 'brand' },
    { key: 'metaTitle', header: 'metaTitle' },
    { key: 'hasBullets', header: 'hasBullets' },
    { key: 'bulletsCount', header: 'bulletsCount' },
    { key: 'bullets', header: 'bullets' },
    { key: 'hasDescription', header: 'hasDescription' },
    { key: 'description', header: 'description' },
    { key: 'variationExists', header: 'variationExists' },
    { key: 'variationTheme', header: 'variationTheme' },
    { key: 'variationCount', header: 'variationCount' },
    { key: 'variationFamily', header: 'variationFamily' },
    { key: 'hasBrandStory', header: 'hasBrandStory' },
    { key: 'brandStoryImgs', header: 'brandStoryImgs' },
    { key: 'hasAplus', header: 'hasAplus' },
    { key: 'aPlusImgs', header: 'aPlusImgs' },
    { key: 'hasVideo', header: 'hasVideo' },
    { key: 'videoCount', header: 'videoCount' },
    { key: 'videos', header: 'videos' },
    { key: 'imgVariantCount', header: 'imgVariantCount' },
    { key: 'imgVariantDetails', header: 'imgVariantDetails' }
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

  const cleanAmazonUrl = (url) => { if (!url || url === 'none') return null; return url.replace(/\._[A-Z0-9,._-]+\./i, '.'); };

  const getExportData = async () => {
    const data = await chrome.storage.local.get('auditState');
    const results = data.auditState ? data.auditState.results : [];
    if (!results || results.length === 0) return null;

    const checkedValues = Array.from(document.querySelectorAll('.attr-checkbox:checked')).map(cb => cb.value);
    const selectedFields = [...new Set([...forcedFields, ...checkedValues])];

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

    // Add expected headers if data exists
    const hasExpectedData = results.some(r => r.expected);
    if (hasExpectedData) {
        finalHeaders.push("Expected Title", "Title Match", "Expected Bullets", "Bullets Match", "Initial Price", "Price Change");
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
    if (selectedFields.includes('variationFamily')) tabMap.variationFamily = createTab('variationFamily', ['pageASIN']);
    if (selectedFields.includes('bullets')) tabMap.bullets = createTab('bullets', ['pageASIN']);
    if (selectedFields.includes('brandStoryImgs')) tabMap.brandStoryImgs = createTab('brandStoryImgs', ['pageASIN']);
    if (selectedFields.includes('aPlusImgs')) tabMap.aPlusImgs = createTab('aPlusImgs', ['pageASIN']);
    if (selectedFields.includes('videos')) tabMap.videos = createTab('videos', ['pageASIN']);
    if (selectedFields.includes('imgVariantDetails')) tabMap.imgVariantDetails = createTab('imgVariantDetails', ['pageASIN', 'variant', 'hiRes', 'large']);

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
                        if (config.type === 'attr') val = tabData.attributes[id];
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
                    const raw = tabData.attributes.variationFamily;
                    if (raw && raw !== 'none') vFamilies = JSON.parse(raw);
                } catch(e) {}
                if (Array.isArray(vFamilies) && vFamilies.length > 0) {
                    tabMap.variationFamily.rows.push([pageASIN, ...vFamilies]);
                }
            }
            if (tabMap.bullets) {
                const bText = tabData.attributes.bullets;
                if (bText && bText !== 'none') {
                    const bList = bText.split('|').map(s => s.trim());
                    tabMap.bullets.rows.push([pageASIN, ...bList]);
                }
            }
            if (tabMap.brandStoryImgs) {
                const bs = tabData.attributes.brandStoryImgs;
                if (Array.isArray(bs) && bs.length > 0) {
                    const urls = bs.map(item => item['brand-story-image']);
                    tabMap.brandStoryImgs.rows.push([pageASIN, ...urls]);
                }
            }
            if (tabMap.aPlusImgs) {
                const ap = tabData.attributes.aPlusImgs;
                if (Array.isArray(ap) && ap.length > 0) {
                    const urls = ap.map(item => item['a-plus-image']);
                    tabMap.aPlusImgs.rows.push([pageASIN, ...urls]);
                }
            }
            if (tabMap.videos) {
                const vids = tabData.attributes.videos;
                if (Array.isArray(vids) && vids.length > 0) {
                    const urls = vids.map(item => item['video_url']);
                    tabMap.videos.rows.push([pageASIN, ...urls]);
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
        }

        if (hasExpectedData) {
            if (tabData.expected && !tabData.error) {
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
                row['Expected Title'] = "";
                row['Title Match'] = "";
                row['Expected Bullets'] = "";
                row['Bullets Match'] = "";
                row['Initial Price'] = "";
                row['Price Change'] = "";
            }
        }
        
        // Generate CSV Line from row object using header order
        const rowStr = finalHeaders.map(h => cleanField(row[h])).join(",");
        return { rowObj: row, csvLine: rowStr };
    });

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
  
  copyBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get('auditState');
      const results = data.auditState ? data.auditState.results : [];
      navigator.clipboard.writeText(JSON.stringify(results, null, 2));
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy JSON Data', 1500);
  });
});
