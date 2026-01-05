// Enhanced manager.js
const foldersDiv = document.getElementById("folders");
const listDiv = document.getElementById("list");
const searchInput = document.getElementById("search");
const folderSearchInput = document.getElementById("folderSearch");
const sortBySelect = document.getElementById("sortBy");
const filterDomainSelect = document.getElementById("filterDomain");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const emptyState = document.getElementById("emptyState");

let allBookmarks = [];
let currentFolder = null;
let currentView = 'grid';
let currentFilter = null;
let stats = null;

// Initialize
init();

async function init() {
  showLoading();
  await loadBookmarks();
  await loadStats();
  renderFolders();
  renderBookmarks();
  setupEventListeners();
}

function showLoading() {
  listDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

// Load bookmarks
function loadBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree(tree => {
      allBookmarks = [];
      walk(tree[0], []);
      resolve();
    });
  });
}

function walk(node, path) {
  if (node.url) {
    const domain = extractDomain(node.url);
    allBookmarks.push({
      id: node.id,
      title: node.title || node.url,
      url: node.url,
      domain: domain,
      folder: path.join("/") || "Root",
      dateAdded: node.dateAdded || Date.now()
    });
  }
  if (node.children) {
    let newPath = [...path];
    if (node.title) newPath.push(node.title);
    node.children.forEach(child => walk(child, newPath));
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return 'unknown';
  }
}

// Load stats from background
function loadStats() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getStats" }, (response) => {
      stats = response || { clicksByUrl: {}, searchCount: 0 };
      resolve();
    });
  });
}

// Render folders sidebar
function renderFolders() {
  const folderMap = new Map();
  
  allBookmarks.forEach(b => {
    const count = folderMap.get(b.folder) || 0;
    folderMap.set(b.folder, count + 1);
  });
  
  const folders = Array.from(folderMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  foldersDiv.innerHTML = "";
  
  // Add "All Bookmarks" option
  const allDiv = createFolderElement("📚 All Bookmarks", allBookmarks.length, null);
  foldersDiv.appendChild(allDiv);
  
  folders.forEach(({ name, count }) => {
    const div = createFolderElement(name, count, name);
    foldersDiv.appendChild(div);
  });
  
  // Populate domain filter
  const domains = [...new Set(allBookmarks.map(b => b.domain))].sort();
  filterDomainSelect.innerHTML = '<option value="">All Domains</option>';
  domains.forEach(domain => {
    const option = document.createElement("option");
    option.value = domain;
    option.textContent = domain;
    filterDomainSelect.appendChild(option);
  });
}

function createFolderElement(name, count, folderPath) {
  const div = document.createElement("div");
  div.className = "folder";
  if (folderPath === currentFolder) div.classList.add("active");
  
  div.innerHTML = `
    <span>${name}</span>
    <span class="folder-count">${count}</span>
  `;
  
  div.onclick = () => {
    currentFolder = folderPath;
    document.querySelectorAll('.folder').forEach(f => f.classList.remove('active'));
    div.classList.add('active');
    renderBookmarks();
  };
  
  return div;
}

// Render bookmarks
function renderBookmarks() {
  const query = searchInput.value.toLowerCase();
  const folderQuery = folderSearchInput.value.toLowerCase();
  const sortBy = sortBySelect.value;
  const domainFilter = filterDomainSelect.value;
  
  let filtered = allBookmarks.filter(b => {
    // Folder filter
    if (currentFolder && b.folder !== currentFolder) return false;
    
    // Search filter
    if (query && !b.title.toLowerCase().includes(query) && 
        !b.url.toLowerCase().includes(query) && 
        !b.domain.toLowerCase().includes(query)) {
      return false;
    }
    
    // Folder search filter
    if (folderQuery && !b.folder.toLowerCase().includes(folderQuery)) {
      return false;
    }
    
    // Domain filter
    if (domainFilter && b.domain !== domainFilter) return false;
    
    // Duplicates filter
    if (currentFilter === 'duplicates') {
      const dupes = allBookmarks.filter(other => other.url === b.url);
      if (dupes.length <= 1) return false;
    }
    
    return true;
  });
  
  // Sort
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title);
      case 'recent':
        return (b.dateAdded || 0) - (a.dateAdded || 0);
      case 'clicks':
        const aClicks = stats.clicksByUrl[a.url] || 0;
        const bClicks = stats.clicksByUrl[b.url] || 0;
        return bClicks - aClicks;
      case 'domain':
        return a.domain.localeCompare(b.domain);
      default:
        return 0;
    }
  });
  
  // Render
  listDiv.innerHTML = "";
  
  if (filtered.length === 0) {
    emptyState.classList.add('show');
    return;
  }
  
  emptyState.classList.remove('show');
  
  filtered.forEach(b => {
    const div = createBookmarkElement(b);
    listDiv.appendChild(div);
  });
  
  // Update search clear button
  document.getElementById('searchClear').style.display = query ? 'block' : 'none';
}

function createBookmarkElement(bookmark) {
  const div = document.createElement("div");
  div.className = "bookmark";
  
  const clicks = stats.clicksByUrl[bookmark.url] || 0;
  const age = Math.floor((Date.now() - bookmark.dateAdded) / (1000 * 60 * 60 * 24));
  
  // Find duplicates
  const duplicates = allBookmarks.filter(b => b.url === bookmark.url);
  const isDuplicate = duplicates.length > 1;
  
  div.innerHTML = `
    <img class="bookmark-favicon" 
         src="https://www.google.com/s2/favicons?domain=${bookmark.url}&sz=64"
         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22><text y=%2215%22 font-size=%2216%22>🔖</text></svg>'">
    <div class="bookmark-info">
      <a class="bookmark-title" href="${bookmark.url}" target="_blank" title="${bookmark.title}">
        ${bookmark.title}
      </a>
      <div class="bookmark-url" title="${bookmark.url}">${bookmark.url}</div>
      <div class="bookmark-meta">
        <span class="meta-tag">📁 ${bookmark.folder}</span>
        <span class="meta-tag">🌐 ${bookmark.domain}</span>
        ${clicks > 0 ? `<span class="meta-tag">👆 ${clicks} clicks</span>` : ''}
        ${age > 0 ? `<span class="meta-tag">📅 ${age}d ago</span>` : ''}
        ${isDuplicate ? `<span class="meta-tag" style="background:#dc2626">🔁 Duplicate</span>` : ''}
      </div>
    </div>
    <div class="bookmark-actions">
      <button class="action-btn" onclick="editBookmark('${bookmark.id}')" title="Edit">✏️</button>
      <button class="action-btn" onclick="deleteBookmark('${bookmark.id}')" title="Delete">🗑️</button>
      <button class="action-btn" onclick="copyUrl('${bookmark.url}')" title="Copy URL">📋</button>
    </div>
  `;
  
  div.onclick = (e) => {
    if (!e.target.closest('.bookmark-actions') && !e.target.closest('a')) {
      window.open(bookmark.url, '_blank');
    }
  };
  
  return div;
}

// Event listeners
function setupEventListeners() {
  searchInput.addEventListener("input", () => {
    renderBookmarks();
    chrome.runtime.sendMessage({ type: "incrementSearch" });
  });
  
  document.getElementById('searchClear').onclick = () => {
    searchInput.value = '';
    renderBookmarks();
  };
  
  folderSearchInput.addEventListener("input", renderBookmarks);
  sortBySelect.addEventListener("change", renderBookmarks);
  filterDomainSelect.addEventListener("change", renderBookmarks);
  
  document.getElementById("refresh").onclick = async () => {
    showLoading();
    await loadBookmarks();
    await loadStats();
    renderFolders();
    renderBookmarks();
  };
  
  document.getElementById("viewToggle").onclick = () => {
    currentView = currentView === 'grid' ? 'list' : 'grid';
    listDiv.className = currentView === 'list' ? 'list-view' : '';
    document.getElementById("viewToggle").textContent = 
      currentView === 'grid' ? '📊 Grid' : '📋 List';
  };
  
  document.getElementById("statsBtn").onclick = showStats;
  document.getElementById("exportBtn").onclick = showExportMenu;
  
  document.querySelector('.modal-close').onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
  
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.onclick = () => {
      const filter = chip.dataset.filter;
      if (currentFilter === filter) {
        currentFilter = null;
        chip.classList.remove('active');
      } else {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        currentFilter = filter;
        chip.classList.add('active');
      }
      renderBookmarks();
    };
  });
}

// Stats modal
async function showStats() {
  modalTitle.textContent = "📈 Bookmark Statistics";
  
  const urlMap = new Map();
  allBookmarks.forEach(b => {
    const arr = urlMap.get(b.url) || [];
    arr.push(b);
    urlMap.set(b.url, arr);
  });
  
  const duplicates = Array.from(urlMap.entries())
    .filter(([url, items]) => items.length > 1);
  
  const domainMap = new Map();
  allBookmarks.forEach(b => {
    domainMap.set(b.domain, (domainMap.get(b.domain) || 0) + 1);
  });
  
  const topDomains = Array.from(domainMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const oldest = allBookmarks.reduce((old, b) => 
    !old || b.dateAdded < old.dateAdded ? b : old, null);
  const newest = allBookmarks.reduce((n, b) => 
    !n || b.dateAdded > n.dateAdded ? b : n, null);
  
  const totalClicks = Object.values(stats.clicksByUrl).reduce((sum, c) => sum + c, 0);
  
  modalBody.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${allBookmarks.length}</div>
        <div class="stat-label">Total Bookmarks</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${duplicates.length}</div>
        <div class="stat-label">Duplicate URLs</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${domainMap.size}</div>
        <div class="stat-label">Unique Domains</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalClicks}</div>
        <div class="stat-label">Total Clicks</div>
      </div>
    </div>
    
    <h3 style="margin-top: 24px; margin-bottom: 12px;">📊 Top Domains</h3>
    ${topDomains.map(([domain, count]) => `
      <div style="background: #0a1220; padding: 10px; border-radius: 6px; margin-bottom: 6px; display: flex; justify-content: space-between;">
        <span>${domain}</span>
        <span style="color: #2563eb; font-weight: 600;">${count} bookmarks</span>
      </div>
    `).join('')}
    
    ${duplicates.length > 0 ? `
      <h3 style="margin-top: 24px; margin-bottom: 12px;">🔁 Duplicate Bookmarks</h3>
      <p style="color: #9ca3af; font-size: 14px; margin-bottom: 12px;">
        Found ${duplicates.length} URLs saved multiple times
      </p>
      <button onclick="deleteDuplicates()" style="background: #dc2626; color: white; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; margin-bottom: 12px;">
        🗑️ Delete Duplicates (Keep Oldest)
      </button>
      ${duplicates.slice(0, 5).map(([url, items]) => `
        <div class="duplicate-item">
          <div class="duplicate-url">${url}</div>
          <div class="duplicate-locations">
            Saved ${items.length} times: ${items.map(i => i.folder).join(', ')}
          </div>
        </div>
      `).join('')}
      ${duplicates.length > 5 ? `<p style="color: #6b7280; font-size: 13px;">... and ${duplicates.length - 5} more</p>` : ''}
    ` : ''}
  `;
  
  modal.classList.add('show');
}

// Export menu
function showExportMenu() {
  modalTitle.textContent = "💾 Export Bookmarks";
  modalBody.innerHTML = `
    <button onclick="exportJSON()" style="width: 100%; background: #2563eb; color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-size: 15px; margin-bottom: 12px;">
      📄 Export as JSON
    </button>
    <button onclick="exportCSV()" style="width: 100%; background: #059669; color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-size: 15px; margin-bottom: 12px;">
      📊 Export as CSV
    </button>
    <button onclick="exportHTML()" style="width: 100%; background: #7c3aed; color: white; border: none; padding: 14px; border-radius: 8px; cursor: pointer; font-size: 15px;">
      🌐 Export as HTML
    </button>
  `;
  modal.classList.add('show');
}

function closeModal() {
  modal.classList.remove('show');
}

// Global functions for buttons
window.editBookmark = function(id) {
  chrome.bookmarks.get(id, (results) => {
    if (results && results[0]) {
      const bookmark = results[0];
      const newTitle = prompt("Edit bookmark title:", bookmark.title);
      if (newTitle !== null && newTitle !== bookmark.title) {
        chrome.bookmarks.update(id, { title: newTitle }, () => {
          loadBookmarks().then(() => renderBookmarks());
        });
      }
    }
  });
};

window.deleteBookmark = function(id) {
  if (confirm("Delete this bookmark?")) {
    chrome.bookmarks.remove(id, () => {
      loadBookmarks().then(() => {
        renderFolders();
        renderBookmarks();
      });
    });
  }
};

window.copyUrl = function(url) {
  navigator.clipboard.writeText(url).then(() => {
    // Simple feedback
    const btn = event.target.closest('.action-btn');
    const original = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = original, 1000);
  });
};

window.exportJSON = function() {
  chrome.runtime.sendMessage({ type: "downloadJSON" }, (response) => {
    if (response && response.ok) {
      closeModal();
    }
  });
};

window.exportCSV = function() {
  chrome.runtime.sendMessage({ type: "exportCSV" }, (response) => {
    if (response && response.ok) {
      closeModal();
    }
  });
};

window.exportHTML = function() {
  const html = generateHTMLExport();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  closeModal();
};

function generateHTMLExport() {
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${allBookmarks.map(b => `    <DT><A HREF="${b.url}" ADD_DATE="${Math.floor(b.dateAdded / 1000)}">${b.title}</A>`).join('\n')}
</DL><p>`;
}

window.deleteDuplicates = function() {
  if (confirm("This will delete duplicate bookmarks, keeping only the oldest copy of each URL. Continue?")) {
    chrome.runtime.sendMessage({ type: "deleteDuplicates", keepFirst: true }, (response) => {
      if (response && response.ok) {
        alert(`Deleted ${response.deleted} duplicate bookmarks!`);
        closeModal();
        loadBookmarks().then(() => {
          renderFolders();
          renderBookmarks();
        });
      }
    });
  }
};