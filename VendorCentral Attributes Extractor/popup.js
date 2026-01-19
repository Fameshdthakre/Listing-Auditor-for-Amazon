document.addEventListener('DOMContentLoaded', async () => {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const statusDiv = document.getElementById('status');
    const csvInput = document.getElementById('csvFile');
    const domainSelect = document.getElementById('domainSelect');
    const vcBaseUrlInput = document.getElementById('vcBaseUrl');
    const batchSizeInput = document.getElementById('batchSize');
  
    let asinsToProcess = [];
    
    // Check state on load
    const state = await chrome.storage.local.get(['jobStatus', 'total', 'current', 'logs', 'results']);
    
    // Restore UI state
    if (state.jobStatus === 'processing') {
      lockUI();
      updateStatus(state.current, state.total, state.logs);
    } else if ((state.jobStatus === 'complete' || state.jobStatus === 'stopped') && state.results?.length > 0) {
      statusDiv.innerHTML = state.jobStatus === 'stopped' ? "<b>Audit Stopped.</b>" : "Previous audit complete.";
      downloadBtn.style.display = 'block';
    }
  
    csvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split(/\r\n|\n/);
        asinsToProcess = lines
          .map(line => line.split(',')[0].trim()) 
          .filter(asin => asin.match(/^[A-Z0-9]{10}$/)); 
        
        if (asinsToProcess.length > 0) {
          statusDiv.innerHTML = `Loaded <b>${asinsToProcess.length}</b> ASINs.`;
          startBtn.disabled = false;
        } else {
          statusDiv.textContent = "No valid ASINs.";
          startBtn.disabled = true;
        }
      };
      reader.readAsText(file);
    });
  
    startBtn.addEventListener('click', () => {
      const batchSize = parseInt(batchSizeInput.value) || 5;
      chrome.runtime.sendMessage({
        action: "START_AUDIT",
        asins: asinsToProcess,
        domain: domainSelect.value,
        vcBaseUrl: vcBaseUrlInput.value.trim(),
        batchSize: batchSize
      });
      lockUI();
      statusDiv.innerHTML = "Starting parallel audit...";
    });

    stopBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: "STOP_AUDIT" });
      stopBtn.disabled = true;
      stopBtn.textContent = "Stopping (finishing batch)...";
      statusDiv.textContent = "Stopping requested. Waiting for current batch to finish...";
    });
  
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        chrome.storage.local.get(['jobStatus', 'total', 'current', 'logs'], (data) => {
          if (data.jobStatus === 'complete' || data.jobStatus === 'stopped') {
            unlockUI();
            statusDiv.innerHTML = data.jobStatus === 'stopped' 
                ? "<b>Audit Stopped by User.</b>" 
                : "<b>Audit Complete!</b>";
            downloadBtn.style.display = 'block';
            stopBtn.style.display = 'none';
            stopBtn.textContent = "Stop & Export"; // Reset text
          } else if (data.jobStatus === 'processing') {
            updateStatus(data.current, data.total, data.logs);
          }
        });
      }
    });
  
    downloadBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['results']);
      const results = data.results || [];
      if (results.length === 0) return;

      const headers = Object.keys(results[0]);
      let csvContent = headers.join(",") + "\n";
      results.forEach(row => {
        csvContent += headers.map(h => `"${(row[h] || "").toString().replace(/"/g, '""')}"`).join(",") + "\n";
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Audit_Report_${new Date().toISOString().slice(0,10)}.csv`);
      link.click();
    });
  
    function lockUI() {
      startBtn.disabled = true;
      startBtn.style.display = 'none'; // Hide Start
      stopBtn.style.display = 'block'; // Show Stop
      stopBtn.disabled = false;
      
      downloadBtn.style.display = 'none';
      csvInput.disabled = true;
      batchSizeInput.disabled = true;
    }

    function unlockUI() {
      startBtn.disabled = false;
      startBtn.style.display = 'block'; // Show Start
      stopBtn.style.display = 'none'; // Hide Stop
      
      csvInput.disabled = false;
      batchSizeInput.disabled = false;
    }
  
    function updateStatus(current, total, log) {
      const percentage = Math.round((current / total) * 100);
      statusDiv.innerHTML = `
        <div style="margin-bottom:5px;">Batch Progress: ${current} / ${total}</div>
        <div style="font-size:10px; color:#666;">${log}</div>
        <div style="width:100%; background:#ddd; height:8px; border-radius:4px; margin-top:5px; overflow:hidden;">
          <div style="width:${percentage}%; background:#007bff; height:100%; transition: width 0.5s;"></div>
        </div>
      `;
    }
});