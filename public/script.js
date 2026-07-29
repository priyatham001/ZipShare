// ---------------- state ----------------
let adminToken = localStorage.getItem('zipshare_token') || null;
let currentFilter = 'all';
let currentSearch = '';
let searchDebounce = null;

const ICONS = {
  java: { icon: '☕', color: '#f89820' }, py: { icon: '🐍', color: '#3776ab' },
  c: { icon: '📘', color: '#5c6bc0' }, cpp: { icon: '📗', color: '#00599c' },
  html: { icon: '🌐', color: '#e34c26' }, css: { icon: '🎨', color: '#264de4' },
  js: { icon: '📜', color: '#f0db4f' }, json: { icon: '🧾', color: '#8bc34a' },
  pdf: { icon: '📕', color: '#e53935' }, docx: { icon: '📄', color: '#2b579a' },
  ppt: { icon: '📊', color: '#d24726' }, zip: { icon: '🗜️', color: '#a67c52' },
  rar: { icon: '🗜️', color: '#a67c52' }, png: { icon: '🖼️', color: '#66bb6a' },
  jpg: { icon: '🖼️', color: '#66bb6a' }, jpeg: { icon: '🖼️', color: '#66bb6a' },
  mp4: { icon: '🎬', color: '#ab47bc' }, txt: { icon: '📝', color: '#90a4ae' },
  md: { icon: '📝', color: '#90a4ae' }, folder: { icon: '📁', color: '#facc15' },
  default: { icon: '📦', color: '#78909c' }
};

// ---------------- helpers ----------------
function $(id) { return document.getElementById(id); }
function fmtSize(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}
function fmtDate(d) { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }

function authHeaders() {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}

// ---------------- theme / intro ----------------
function typeTitle() {
  const text = 'Welcome to ZipShare';
  const el = $('introTitle');
  let i = 0;
  const interval = setInterval(() => {
    el.textContent = text.slice(0, i + 1);
    i++;
    if (i === text.length) clearInterval(interval);
  }, 60);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  $('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀';
  localStorage.setItem('zipshare_theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('zipshare_theme');
  typeTitle();

  if (saved) {
    applyTheme(saved);
    skipIntro();
    return;
  }

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      runIntroTransition();
    });
  });
}

function skipIntro() {
  $('introScreen').classList.add('hidden');
  $('app').classList.add('show');
}

function runIntroTransition() {
  $('introScreen').classList.add('hidden');
  $('welcomeSplash').classList.add('show');
  setTimeout(() => {
    $('welcomeSplash').classList.remove('show');
    $('app').classList.add('show');
  }, 1800);
}

$('themeToggle').addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(current);
});

document.addEventListener('mousemove', e => {
  const glow = $('glowCursor');
  glow.style.left = e.clientX + 'px';
  glow.style.top = e.clientY + 'px';
});

// ---------------- session badge ----------------
function refreshSessionBadge() {
  $('sessionBadge').textContent = adminToken ? 'Welcome Admin' : 'Welcome Anonymous';
  $('adminLoginBtn').textContent = adminToken ? 'Admin Panel' : 'Admin Login';
  renderFiles(lastFiles || []);
}

// ---------------- stats ----------------
async function loadStats() {
  try {
    const res = await fetch('/api/files/stats');
    const s = await res.json();
    $('statsBar').innerHTML = `
      <div class="stat-card"><b>${s.totalFiles}</b><span>Total Files</span></div>
      <div class="stat-card"><b>${s.todayUploads}</b><span>Today's Uploads</span></div>
      <div class="stat-card"><b>${s.pinned}</b><span>Pinned</span></div>
      <div class="stat-card"><b>${s.totalDownloads}</b><span>Downloads</span></div>
      <div class="stat-card"><b>${fmtSize(s.storageUsed)}</b><span>Storage Used</span></div>
    `;
  } catch { /* stats are non-critical */ }
}

// ---------------- suggestions ----------------
async function loadSuggestions() {
  try {
    const res = await fetch('/api/files/suggestions');
    const data = await res.json();
    const panel = $('suggestionsPanel');
    let html = '';
    if (data.trending?.length) {
      html += '<div class="suggestion-group-label">TRENDING SEARCHES</div>';
      html += data.trending.map(t => `<div class="suggestion-item">${escapeHtml(t)}</div>`).join('');
    }
    if (data.recent?.length) {
      html += '<div class="suggestion-group-label">RECENTLY UPLOADED</div>';
      html += data.recent.map(t => `<div class="suggestion-item">${escapeHtml(t)}</div>`).join('');
    }
    panel.innerHTML = html || '<div class="suggestion-group-label">Start typing to search...</div>';
    panel.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        $('searchInput').value = item.textContent;
        currentSearch = item.textContent;
        panel.classList.remove('show');
        loadFiles();
      });
    });
  } catch { /* non-critical */ }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

$('searchInput').addEventListener('focus', () => $('suggestionsPanel').classList.add('show'));
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) $('suggestionsPanel').classList.remove('show');
});
$('searchInput').addEventListener('input', e => {
  currentSearch = e.target.value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadFiles, 300);
});

// ---------------- filters ----------------
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    loadFiles();
  });
});

// ---------------- file list ----------------
let lastFiles = [];

async function loadFiles() {
  try {
    const params = new URLSearchParams();
    if (currentSearch) params.set('q', currentSearch);
    if (currentFilter && currentFilter !== 'all') params.set('filter', currentFilter);
    const res = await fetch(`/api/files?${params.toString()}`);
    if (!res.ok) throw new Error('bad response');
    const files = await res.json();
    lastFiles = files;
    renderFiles(files);
    if (currentSearch) loadSuggestions();
  } catch (err) {
    toast('Could not load file list.', 'error');
  }
}

function iconFor(ext, isFolder) {
  if (isFolder) return ICONS.folder;
  return ICONS[ext] || ICONS.default;
}

function renderFiles(files) {
  const grid = $('fileGrid');
  const empty = $('emptyState');

  // group folder-batch files into one card each
  const seenBatches = new Set();
  const cards = [];

  for (const f of files) {
    if (f.batchId) {
      if (seenBatches.has(f.batchId)) continue;
      seenBatches.add(f.batchId);
      const count = files.filter(x => x.batchId === f.batchId).length;
      cards.push(renderFolderCard(f, count));
    } else {
      cards.push(renderFileCard(f));
    }
  }

  grid.innerHTML = cards.join('');
  empty.style.display = cards.length ? 'none' : 'block';
  attachCardHandlers();
}

function renderFolderCard(f, count) {
  const meta = iconFor(null, true);
  return `
  <div class="file-card" data-batch="${f.batchId}">
    ${f.pinned ? '<span class="pin-badge">📌</span>' : ''}
    <div class="file-icon" style="color:${meta.color}">${meta.icon}</div>
    <div class="file-name">${escapeHtml(f.folderName)}</div>
    <div class="file-meta">${count} files</div>
    <div class="file-actions">
      <button class="btn-download-folder" data-batch="${f.batchId}" data-name="${escapeHtml(f.folderName)}">⬇ Download</button>
    </div>
  </div>`;
}

function renderFileCard(f) {
  const meta = iconFor(f.extension, false);
  const tags = (f.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');
  const adminButtons = adminToken ? `
      <button class="btn-edit" data-id="${f._id}">✏️ Edit</button>
      <button class="btn-pin" data-id="${f._id}" data-pinned="${f.pinned}">${f.pinned ? '📌 Unpin' : '📌 Pin'}</button>
      <button class="btn-delete danger" data-id="${f._id}">🗑️ Delete</button>` : '';

  return `
  <div class="file-card" data-id="${f._id}">
    ${f.pinned ? '<span class="pin-badge">📌</span>' : ''}
    <div class="file-icon" style="color:${meta.color}">${meta.icon}</div>
    <div class="file-name">${escapeHtml(f.originalName)}</div>
    <div class="file-meta">${fmtSize(f.size)} · ${fmtDate(f.uploadDate)} · ${f.downloads} downloads</div>
    ${f.description ? `<div class="file-desc">${escapeHtml(f.description)}</div>` : ''}
    <div class="file-tags">${tags}</div>
    <div class="file-actions">
      <button class="btn-preview" data-id="${f._id}" data-name="${escapeHtml(f.originalName)}">👁 Preview</button>
      <button class="btn-download" data-id="${f._id}">⬇ Download</button>
      ${adminButtons}
    </div>
  </div>`;
}

function attachCardHandlers() {
  document.querySelectorAll('.btn-download').forEach(b => b.addEventListener('click', () => {
    window.location = `/api/files/${b.dataset.id}/download`;
    toast('Download Started', 'success');
  }));
  document.querySelectorAll('.btn-download-folder').forEach(b => b.addEventListener('click', () => {
    window.location = `/api/files/folder/${b.dataset.batch}/download`;
    toast('Download Started', 'success');
  }));
  document.querySelectorAll('.btn-preview').forEach(b => b.addEventListener('click', () => openPreview(b.dataset.id, b.dataset.name)));
  document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', () => openDeleteConfirm(b.dataset.id)));
  document.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.id)));
  document.querySelectorAll('.btn-pin').forEach(b => b.addEventListener('click', () => togglePin(b.dataset.id, b.dataset.pinned === 'true')));
}

// ---------------- preview ----------------
async function openPreview(id, name) {
  $('previewTitle').textContent = name;
  $('previewBody').innerHTML = 'Loading preview...';
  openModal('previewModalOverlay');
  try {
    const res = await fetch(`/api/files/${id}/preview`);
    const data = await res.json();
    if (data.type === 'text') {
      $('previewBody').innerHTML = `<pre>${escapeHtml(data.content)}</pre>`;
    } else if (data.type === 'image') {
      $('previewBody').innerHTML = `<img src="${data.url}" alt="${escapeHtml(name)}" />`;
    } else if (data.type === 'pdf') {
      $('previewBody').innerHTML = `<iframe src="${data.url}" style="width:100%;height:60vh;border:none;border-radius:12px;"></iframe>`;
    } else {
      $('previewBody').innerHTML = '<p>Preview not available for this file type. Please download instead.</p>';
    }
  } catch {
    $('previewBody').innerHTML = '<p>Preview failed to load.</p>';
  }
}

// ---------------- delete ----------------
let pendingDeleteId = null;
function openDeleteConfirm(id) { pendingDeleteId = id; openModal('deleteModalOverlay'); }
$('deleteCancelBtn').addEventListener('click', () => { pendingDeleteId = null; closeModal('deleteModalOverlay'); });
$('deleteConfirmBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  try {
    const res = await fetch(`/api/files/${pendingDeleteId}`, { method: 'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Deleted Successfully', 'success');
    closeModal('deleteModalOverlay');
    loadFiles();
    loadStats();
  } catch (err) {
    toast(err.message || 'Delete failed.', 'error');
  }
  pendingDeleteId = null;
});

// ---------------- edit / rename / tags ----------------
let editingId = null;
function openEditModal(id) {
  const file = lastFiles.find(f => f._id === id);
  if (!file) return;
  editingId = id;
  $('editNameInput').value = file.originalName;
  $('editDescInput').value = file.description || '';
  $('editTagsInput').value = (file.tags || []).join(', ');
  openModal('editModalOverlay');
}
$('editSaveBtn').addEventListener('click', async () => {
  if (!editingId) return;
  try {
    const res = await fetch(`/api/files/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        originalName: $('editNameInput').value,
        description: $('editDescInput').value,
        tags: $('editTagsInput').value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Renamed Successfully', 'success');
    closeModal('editModalOverlay');
    loadFiles();
  } catch (err) {
    toast(err.message || 'Update failed.', 'error');
  }
});

async function togglePin(id, currentlyPinned) {
  try {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ pinned: !currentlyPinned })
    });
    if (!res.ok) throw new Error((await res.json()).error);
    loadFiles();
  } catch (err) {
    toast(err.message || 'Pin failed.', 'error');
  }
}

// ---------------- upload ----------------
async function doUpload(fileList, isFolder) {
  if (!fileList || !fileList.length) return;
  const formData = new FormData();
  Array.from(fileList).forEach(file => {
    formData.append('files', file);
    formData.append('paths', isFolder ? (file.webkitRelativePath || file.name) : file.name);
  });
  try {
    toast('Uploading...', 'warn');
    const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Upload Successful', 'success');
    loadFiles();
    loadStats();
    loadSuggestions();
  } catch (err) {
    toast(err.message || 'Upload failed.', 'error');
  }
}
$('fileInput').addEventListener('change', e => doUpload(e.target.files, false));
$('folderInput').addEventListener('change', e => doUpload(e.target.files, true));

// ---------------- admin login ----------------
$('adminLoginBtn').addEventListener('click', () => {
  if (adminToken) {
    // acts as logout when already logged in
    adminToken = null;
    localStorage.removeItem('zipshare_token');
    toast('Logout Successful', 'success');
    refreshSessionBadge();
  } else {
    openModal('loginModalOverlay');
  }
});

$('loginSubmitBtn').addEventListener('click', submitLogin);
$('adminPasswordInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(); });

async function submitLogin() {
  const password = $('adminPasswordInput').value;
  const msgEl = $('loginMessage');
  msgEl.textContent = '';
  msgEl.className = 'login-message';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.status === 429) {
      msgEl.textContent = `${data.message} ${data.emoji || ''}`;
      msgEl.className = 'login-message locked';
      toast(`${data.emoji || '😂'} ${data.message}`, 'warn');
      setTimeout(() => closeModal('loginModalOverlay'), 1500);
      return;
    }
    if (!res.ok) {
      msgEl.textContent = data.message || 'Access Denied. Incorrect password. Please try again.';
      msgEl.className = 'login-message error';
      return;
    }

    adminToken = data.token;
    localStorage.setItem('zipshare_token', adminToken);
    toast('Login Successful', 'success');
    closeModal('loginModalOverlay');
    $('adminPasswordInput').value = '';
    refreshSessionBadge();
  } catch {
    msgEl.textContent = 'Something went wrong. Please try again.';
    msgEl.className = 'login-message error';
  }
}

// ---------------- generic modal close handling ----------------
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
});
$('aboutBtn').addEventListener('click', () => openModal('aboutModalOverlay'));
$('devBadge').addEventListener('click', () => openModal('devModalOverlay'));

// ---------------- boot ----------------
initTheme();
refreshSessionBadge();
loadStats();
loadFiles();
loadSuggestions();
