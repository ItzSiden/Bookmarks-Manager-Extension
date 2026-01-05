// background.js - Enhanced Version
const STORAGE_KEY = "auto_bookmark_sync_v1";
const SYNC_INTERVAL_MINUTES = 60;
const TAGS_KEY = "bookmark_tags";
const NOTES_KEY = "bookmark_notes";
const STATS_KEY = "bookmark_stats";

// Analytics tracking
let stats = {
  totalClicks: 0,
  clicksByUrl: {},
  lastSync: null,
  searchCount: 0
};

// Load stats on startup
chrome.storage.local.get(STATS_KEY, (res) => {
  if (res[STATS_KEY]) stats = res[STATS_KEY];
});

// Track bookmark clicks
chrome.bookmarks.onClicked = undefined; // Chrome doesn't support this
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    stats.totalClicks++;
    stats.clicksByUrl[tab.url] = (stats.clicksByUrl[tab.url] || 0) + 1;
    chrome.storage.local.set({ [STATS_KEY]: stats });
  }
});

// Read bookmarks with enhanced metadata
function readBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const out = [];
      function walk(node, path = [], depth = 0) {
        if (!node) return;
        if (node.url) {
          const domain = extractDomain(node.url);
          out.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            domain: domain,
            folderPath: path.join("/") || "Root",
            dateAdded: node.dateAdded || null,
            depth: depth,
            clicks: stats.clicksByUrl[node.url] || 0
          });
        }
        if (node.children) {
          const folderName = node.title || "Folder";
          node.children.forEach((child) => walk(child, [...path, folderName], depth + 1));
        }
      }
      tree.forEach(t => walk(t, [], 0));
      resolve(out);
    });
  });
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

async function doSync(reason = "manual") {
  try {
    const items = await readBookmarks();
    
    // Enhanced duplicate detection
    const urlMap = new Map();
    const domainMap = new Map();
    
    items.forEach(it => {
      const key = (it.url || "").trim();
      const arr = urlMap.get(key) || [];
      arr.push(it);
      urlMap.set(key, arr);
      
      // Track by domain
      const domainArr = domainMap.get(it.domain) || [];
      domainArr.push(it);
      domainMap.set(it.domain, domainArr);
    });
    
    const duplicates = Array.from(urlMap.entries())
      .filter(([url, items]) => items.length > 1)
      .map(([url, items]) => ({ url, items, count: items.length }));
    
    // Find broken bookmarks (optional - can be slow)
    const brokenUrls = [];
    
    // Domain statistics
    const topDomains = Array.from(domainMap.entries())
      .map(([domain, items]) => ({ domain, count: items.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    const payload = {
      timestamp: Date.now(),
      reason,
      count: items.length,
      duplicateGroups: duplicates.length,
      duplicates: duplicates,
      topDomains: topDomains,
      oldestBookmark: items.reduce((old, it) => 
        !old || (it.dateAdded && it.dateAdded < old.dateAdded) ? it : old, null),
      newestBookmark: items.reduce((newest, it) => 
        !newest || (it.dateAdded && it.dateAdded > newest.dateAdded) ? it : newest, null),
      items
    };
    
    await chrome.storage.local.set({ [STORAGE_KEY]: payload });
    stats.lastSync = Date.now();
    await chrome.storage.local.set({ [STATS_KEY]: stats });
    
    console.log("AutoBookmarkSync: synced", payload.count, "items. Dups:", duplicates.length);
    
    if (reason === "alarm") {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "Bookmarks Synced",
        message: `✓ ${payload.count} bookmarks synced\n⚠ ${duplicates.length} duplicates found`
      });
    }
  } catch (err) {
    console.error("AutoBookmarkSync sync error:", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Ultra Bookmark Manager Installed");
  chrome.alarms.create("autoBookmarkSyncAlarm", {
    periodInMinutes: SYNC_INTERVAL_MINUTES
  });
  doSync("install");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === "autoBookmarkSyncAlarm") {
    doSync("alarm");
  }
});

// Enhanced message handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "manualSync") {
    doSync("manual").then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  
  if (msg && msg.type === "getStorage") {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      sendResponse(res[STORAGE_KEY] || null);
    });
    return true;
  }
  
  if (msg && msg.type === "getStats") {
    sendResponse(stats);
    return true;
  }
  
  if (msg && msg.type === "incrementSearch") {
    stats.searchCount++;
    chrome.storage.local.set({ [STATS_KEY]: stats });
    return true;
  }
  
  if (msg && msg.type === "downloadJSON") {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const data = res[STORAGE_KEY] || { timestamp: Date.now(), items: [] };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `bookmarks-${new Date(data.timestamp).toISOString().slice(0,19).replace(/[:T]/g,"-")}.json`,
        saveAs: true
      }, (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        sendResponse({ ok: true, downloadId });
      });
    });
    return true;
  }
  
  if (msg && msg.type === "exportCSV") {
    chrome.storage.local.get(STORAGE_KEY, (res) => {
      const data = res[STORAGE_KEY] || { items: [] };
      const csv = convertToCSV(data.items);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `bookmarks-${Date.now()}.csv`,
        saveAs: true
      }, () => {
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        sendResponse({ ok: true });
      });
    });
    return true;
  }
  
  if (msg && msg.type === "deleteDuplicates") {
    handleDuplicateDeletion(msg.keepFirst).then(result => {
      sendResponse(result);
    });
    return true;
  }
});

function convertToCSV(items) {
  const headers = ['Title', 'URL', 'Folder', 'Date Added', 'Domain'];
  const rows = items.map(item => [
    `"${(item.title || '').replace(/"/g, '""')}"`,
    `"${item.url}"`,
    `"${item.folderPath}"`,
    item.dateAdded ? new Date(item.dateAdded).toISOString() : '',
    `"${item.domain || ''}"`
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

async function handleDuplicateDeletion(keepFirst) {
  const items = await readBookmarks();
  const urlMap = new Map();
  
  items.forEach(it => {
    const arr = urlMap.get(it.url) || [];
    arr.push(it);
    urlMap.set(it.url, arr);
  });
  
  let deleted = 0;
  for (const [url, duplicates] of urlMap.entries()) {
    if (duplicates.length > 1) {
      const sorted = duplicates.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      const toDelete = keepFirst ? sorted.slice(1) : sorted.slice(0, -1);
      
      for (const dup of toDelete) {
        await chrome.bookmarks.remove(dup.id);
        deleted++;
      }
    }
  }
  
  await doSync("cleanup");
  return { ok: true, deleted };
}