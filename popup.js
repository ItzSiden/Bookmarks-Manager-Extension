// popup.js
const statsDiv = document.getElementById('stats');
const statusDiv = document.getElementById('status');
const lastSyncSpan = document.getElementById('lastSync');

// Load and display stats
loadStats();

async function loadStats() {
  try {
    const storage = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "getStorage" }, resolve);
    });
    
    const stats = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "getStats" }, resolve);
    });
    
    if (storage && storage.items) {
      renderStats(storage, stats);
    } else {
      statsDiv.innerHTML = '<p style="text-align: center; color: #6b7280;">No data yet. Click Sync Now!</p>';
    }
  } catch (error) {
    statsDiv.innerHTML = '<p style="text-align: center; color: #dc2626;">Error loading stats</p>';
  }
}

function renderStats(storage, stats) {
  const duplicateCount = storage.duplicateGroups || 0;
  const totalBookmarks = storage.count || 0;
  const domains = storage.topDomains ? storage.topDomains.length : 0;
  const totalClicks = Object.values(stats.clicksByUrl || {}).reduce((sum, c) => sum + c, 0);
  
  statsDiv.innerHTML = `
    <div class="stat-row">
      <span class="stat-label">📚 Total Bookmarks</span>
      <span class="stat-value">${totalBookmarks}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">🔁 Duplicates</span>
      <span class="stat-value" style="color: ${duplicateCount > 0 ? '#dc2626' : '#059669'}">${duplicateCount}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">🌐 Unique Domains</span>
      <span class="stat-value">${domains}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">👆 Total Clicks</span>
      <span class="stat-value">${totalClicks}</span>
    </div>
  `;
  
  if (storage.timestamp) {
    const date = new Date(storage.timestamp);
    const now = Date.now();
    const diff = now - storage.timestamp;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) {
      lastSyncSpan.textContent = 'Just now';
    } else if (minutes < 60) {
      lastSyncSpan.textContent = `${minutes}m ago`;
    } else {
      const hours = Math.floor(minutes / 60);
      lastSyncSpan.textContent = `${hours}h ago`;
    }
  }
}

// Event listeners
document.getElementById('openManager').onclick = () => {
  chrome.tabs.create({ url: 'chrome://bookmarks' });
};

document.getElementById('syncNow').onclick = async () => {
  const btn = document.getElementById('syncNow');
  btn.textContent = '⏳ Syncing...';
  btn.disabled = true;
  
  chrome.runtime.sendMessage({ type: "manualSync" }, (response) => {
    if (response && response.ok) {
      btn.textContent = '✓ Synced!';
      setTimeout(() => {
        btn.textContent = '🔄 Sync Now';
        btn.disabled = false;
        loadStats();
      }, 1500);
    } else {
      btn.textContent = '✗ Failed';
      btn.disabled = false;
    }
  });
};

document.getElementById('exportJSON').onclick = () => {
  chrome.runtime.sendMessage({ type: "downloadJSON" }, (response) => {
    if (response && response.ok) {
      const btn = document.getElementById('exportJSON');
      btn.textContent = '✓ Exported!';
      setTimeout(() => {
        btn.textContent = '💾 Quick Export';
      }, 1500);
    }
  });
};

document.getElementById('findDupes').onclick = () => {
  chrome.tabs.create({ url: 'chrome://bookmarks' });
  // The manager will show duplicates
};