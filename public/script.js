(() => {
  'use strict';

  const API = '/api';
  let isAdmin = false;
  let currentFilter = 'all';
  let currentParent = '';
  let searchDebounce = null;
  let uploadMode = 'files';
  let selectedFiles = []; // { file, relativePath }
  let activeItemPath = null; // for rename/edit modals

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const TYPE_MAP = {
    java: { label: 'JAVA', color: '#f89820' },
    py: { label: 'PY', color: '#3776ab' },
    c: { label: 'C', color: '#5c6bc0' },
    cpp: { label: 'C++', color: '#00599c' },
    h: { label: 'H', color: '#7986cb' },
    html: { label: 'HTML', color: '#e34c26' },
    css: { label: 'CSS', color: '#2965f1' },
    js: { label: 'JS', color: '#f0db4f' },
    json: { label: 'JSON', color: '#8bc34a' },
    pdf: { label: 'PDF', color: '#e53935' },
    doc: { label: 'DOC', color: '#2b579a' },
    docx: { label: 'DOC', color: '#2b579a' },
    ppt: { label: 'PPT', color: '#d24726' },
    pptx: { label: 'PPT', color: '#d24726' },
    zip: { label: 'ZIP', color: '#ffca28' },
    rar: { label: 'RAR', color: '#8d6e63' },
    png: { label: 'IMG', color: '#26a69a' },
    jpg: { label: 'IMG', color: '#26a69a' },
    jpeg: { label: 'IMG', color: '#26a69a' },
    gif: { label: 'IMG', color: '#26a69a' },
    mp4: { label: 'VID', color: '#ab47bc' },
    mov: { label: 'VID', color: '#ab47bc' },
    sql: { label: 'SQL', color: '#00758f' },
    md: { label: 'MD', color: '#607d8b' },
    txt: { label: 'TXT', color: '#90a4ae' },
  };

  function typeInfo(ext) {
    const key = (ext || '').toLowerCase();
    return TYPE_MAP[key] || { label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE', color: '#78909c' };
  }

  function fmtSize(bytes) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
    return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function fmtDate(d) {
    const date = new Date(d);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ============ TOASTS ============
  function toast(message, type = 'info') {
    const container = $('#toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ============ WELCOME SCREEN ============
  function initWelcome() {
    const savedTheme = localStorage.getItem('zipshare_theme');
    if (savedTheme) {
      applyTheme(savedTheme);
      $('#welcomeScreen').classList.add('hidden');
      $('#app').classList.remove('hidden');
      return;
    }

    const title = $('#typingTitle');
    const text = 'Welcome to ZipShare';
    let i = 0;
    const typeNext = () => {
      if (i <= text.length) {
        title.textContent = text.slice(0, i);
        i++;
        setTimeout(typeNext, 55);
      }
    };
    typeNext();

    $$('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        localStorage.setItem('zipshare_theme', theme);
        applyTheme(theme);
        $('#welcomeScreen').style.opacity = '0';
        setTimeout(() => {
          $('#welcomeScreen').classList.add('hidden');
          $('#app').classList.remove('hidden');
        }, 400);
      });
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('#themeToggle').textContent = theme === 'dark' ? '☀' : '🌙';
  }

  $('#themeToggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('zipshare_theme', next);
    applyTheme(next);
  });

  // ============ MOUSE GLOW ============
  document.addEventListener('mousemove', (e) => {
    const glow = $('#glowCursor');
    if (glow) {
      glow.style.left = `${e.clientX}px`;
      glow.style.top = `${e.clientY}px`;
    }
  });

  // ============ MODALS ============
  function openModal(id) { $(`#${id}`).classList.remove('hidden'); }
  function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

  $$('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  $$('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  $('#aboutBtn').addEventListener('click', () => openModal('aboutModal'));
  $('#devBadge').addEventListener('click', () => openModal('devModal'));

  // ============ AUTH ============
  async function checkAuthStatus() {
    try {
      const res = await fetch(`${API}/auth/status`);
      const data = await res.json();
      setAdminUI(data.isAdmin);
    } catch (e) {
      setAdminUI(false);
    }
  }

  function setAdminUI(admin) {
    isAdmin = admin;
    $$('.admin-only').forEach((el) => el.classList.toggle('hidden', !admin));
    $('#adminLoginBtn').classList.toggle('hidden', admin);
    $('#adminDashBtn').classList.toggle('hidden', !admin);
    $('#logoutBtn').classList.toggle('hidden', !admin);
    $('#uploadBtn').classList.toggle('hidden', !admin);
    renderFiles(lastItems);
  }

  $('#adminLoginBtn').addEventListener('click', () => {
    $('#passwordInput').value = '';
    $('#loginError').classList.add('hidden');
    openModal('loginModal');
    setTimeout(() => $('#passwordInput').focus(), 150);
  });

  async function submitLogin() {
    const password = $('#passwordInput').value;
    const errEl = $('#loginError');
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal('loginModal');
        setAdminUI(true);
        toast('Login Successful', 'success');
      } else {
        errEl.textContent = data.message || 'Access Denied. Incorrect password. Please try again.';
        errEl.classList.remove('hidden');
      }
    } catch (e) {
      errEl.textContent = 'Something went wrong. Please try again.';
      errEl.classList.remove('hidden');
    }
  }

  $('#loginSubmitBtn').addEventListener('click', submitLogin);
  $('#passwordInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });

  $('#logoutBtn').addEventListener('click', async () => {
    await fetch(`${API}/auth/logout`, { method: 'POST' });
    setAdminUI(false);
    toast('Logout Successful', 'success');
  });

  // ============ SEARCH ============
  const searchInput = $('#searchInput');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      loadFiles();
      renderSuggestions(searchInput.value);
    }, 280);
  });
  searchInput.addEventListener('focus', () => renderSuggestions(searchInput.value));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) $('#searchSuggestions').classList.remove('show');
  });

  let cachedSuggestions = [];
  async function loadSuggestions() {
    try {
      const res = await fetch(`${API}/suggestions`);
      const data = await res.json();
      cachedSuggestions = data.suggestions || [];
    } catch (e) { cachedSuggestions = []; }
  }

  function renderSuggestions(query) {
    const box = $('#searchSuggestions');
    const q = (query || '').toLowerCase().trim();
    const matches = q
      ? cachedSuggestions.filter((s) => s.text.toLowerCase().includes(q))
      : cachedSuggestions;

    if (!matches.length) { box.classList.remove('show'); return; }

    const trending = matches.filter((s) => s.category === 'trending');
    const recent = matches.filter((s) => s.category === 'recent');

    let html = '';
    if (trending.length) {
      html += `<div class="suggestion-group-label">Trending Searches</div>`;
      trending.forEach((s) => { html += `<div class="suggestion-item" data-text="${escapeHtml(s.text)}">${s.pinned ? '📌' : '🔥'} ${escapeHtml(s.text)}</div>`; });
    }
    if (recent.length) {
      html += `<div class="suggestion-group-label">Recently Uploaded</div>`;
      recent.forEach((s) => { html += `<div class="suggestion-item" data-text="${escapeHtml(s.text)}">🆕 ${escapeHtml(s.text)}</div>`; });
    }
    box.innerHTML = html;
    box.classList.add('show');

    $$('.suggestion-item', box).forEach((item) => {
      item.addEventListener('click', () => {
        searchInput.value = item.dataset.text;
        box.classList.remove('show');
        loadFiles();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============ FILTERS ============
  $$('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      $('#sectionTitle').textContent = chip.textContent;
      loadFiles();
    });
  });

  // ============ FILE LOADING & RENDERING ============
  let lastItems = [];

  async function loadFiles() {
    $('#loadingState').classList.remove('hidden');
    $('#fileGrid').classList.add('hidden');
    $('#emptyState').classList.add('hidden');
    try {
      const q = searchInput.value.trim();
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (currentFilter && currentFilter !== 'all') params.set('filter', currentFilter);
      if (!q && (currentFilter === 'all' || !currentFilter)) params.set('parent', currentParent);

      const res = await fetch(`${API}/files?${params.toString()}`);
      const data = await res.json();
      lastItems = data.items || [];
      renderFiles(lastItems);
    } catch (e) {
      toast('Could not load files.', 'error');
    } finally {
      $('#loadingState').classList.add('hidden');
    }
  }

  function renderFiles(items) {
    const grid = $('#fileGrid');
    $('#itemCount').textContent = items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : '';

    if (!items.length) {
      grid.classList.add('hidden');
      $('#emptyState').classList.remove('hidden');
      return;
    }
    $('#emptyState').classList.add('hidden');
    grid.classList.remove('hidden');

    grid.innerHTML = items.map(renderCard).join('');

    // Wire up actions
    $$('.file-card', grid).forEach((card) => {
      const relPath = card.dataset.path;
      const type = card.dataset.type;
      const item = items.find((i) => i.relativePath === relPath);

      card.querySelector('[data-action="open"]')?.addEventListener('click', () => {
        if (type === 'folder') { currentParent = relPath; searchInput.value = ''; loadFiles(); }
      });
      card.querySelector('[data-action="preview"]')?.addEventListener('click', () => openPreview(item));
      card.querySelector('[data-action="download"]')?.addEventListener('click', () => downloadItem(item));
      card.querySelector('[data-action="share"]')?.addEventListener('click', () => shareItem(item));
      card.querySelector('[data-action="pin"]')?.addEventListener('click', () => togglePin(item));
      card.querySelector('[data-action="rename"]')?.addEventListener('click', () => openRename(item));
      card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEdit(item));
      card.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteItem(item));
    });

    if (currentParent) {
      const backBtn = document.createElement('div');
      backBtn.className = 'chip';
      backBtn.textContent = '⬅ Back';
      backBtn.style.marginBottom = '14px';
      backBtn.addEventListener('click', () => {
        const parts = currentParent.split('/');
        parts.pop();
        currentParent = parts.join('/');
        loadFiles();
      });
      grid.parentElement.insertBefore(backBtn, grid);
    }
  }

  function renderCard(item) {
    const isFolder = item.type === 'folder';
    const info = isFolder ? { label: 'DIR', color: '#8b5cf6' } : typeInfo(item.extension);
    const tags = (item.tags || []).map((t) => `<span class="file-tag">${escapeHtml(t)}</span>`).join('');

    const adminButtons = isAdmin ? `
      <button data-action="pin" title="Pin/Unpin">${item.pinned ? '📌 Unpin' : '📌 Pin'}</button>
      <button data-action="rename" title="Rename">✏ Rename</button>
      <button data-action="edit" title="Edit details">🏷 Edit</button>
      <button data-action="delete" class="danger" title="Delete">🗑 Delete</button>
    ` : '';

    const primaryButtons = isFolder
      ? `<button data-action="open">📂 Open</button><button data-action="download">⬇ Download</button>`
      : `<button data-action="preview">👁 Preview</button><button data-action="download">⬇ Download</button><button data-action="share">🔗 Share</button>`;

    return `
      <div class="file-card" data-path="${escapeHtml(item.relativePath)}" data-type="${item.type}">
        ${item.pinned ? '<span class="pin-flag">📌</span>' : ''}
        <div class="file-icon" style="background:${info.color}">${isFolder ? '📁' : info.label}</div>
        <div class="file-name">${escapeHtml(item.name)}</div>
        <div class="file-meta">
          ${!isFolder ? `<span>${fmtSize(item.size)}</span>` : ''}
          <span>${fmtDate(item.uploadedAt)}</span>
          ${!isFolder ? `<span>⬇ ${item.downloads || 0}</span>` : ''}
        </div>
        ${item.description ? `<div class="file-desc">${escapeHtml(item.description)}</div>` : ''}
        ${tags ? `<div class="file-tags">${tags}</div>` : ''}
        <div class="file-actions">${primaryButtons}${adminButtons}</div>
      </div>
    `;
  }

  function downloadItem(item) {
    const url = item.type === 'folder'
      ? `${API}/files/download-folder/${encodeURIPathSegments(item.relativePath)}`
      : `${API}/files/download/${encodeURIPathSegments(item.relativePath)}`;
    toast('Download Started', 'success');
    window.location.href = url;
  }

  function encodeURIPathSegments(p) {
    return p.split('/').map(encodeURIComponent).join('/');
  }

  function shareItem(item) {
    const url = `${window.location.origin}${API}/files/download/${encodeURIPathSegments(item.relativePath)}`;
    navigator.clipboard?.writeText(url).then(
      () => toast('Share link copied to clipboard', 'success'),
      () => toast(url, 'info')
    );
  }

  async function togglePin(item) {
    try {
      const res = await fetch(`${API}/files/${encodeURIPathSegments(item.relativePath)}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !item.pinned }),
      });
      const data = await res.json();
      if (data.success) { toast(data.message, 'success'); loadFiles(); }
      else toast(data.message, 'error');
    } catch (e) { toast('Could not update pin.', 'error'); }
  }

  function openRename(item) {
    activeItemPath = item.relativePath;
    $('#renameInput').value = item.name;
    openModal('renameModal');
  }

  $('#renameSubmitBtn').addEventListener('click', async () => {
    const newName = $('#renameInput').value.trim();
    if (!newName || !activeItemPath) return;
    try {
      const res = await fetch(`${API}/files/${encodeURIPathSegments(activeItemPath)}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      });
      const data = await res.json();
      if (data.success) { toast(data.message, 'success'); closeModal('renameModal'); loadFiles(); }
      else toast(data.message, 'error');
    } catch (e) { toast('Rename failed.', 'error'); }
  });

  function openEdit(item) {
    activeItemPath = item.relativePath;
    $('#editDescription').value = item.description || '';
    $('#editTags').value = (item.tags || []).join(', ');
    openModal('editModal');
  }

  $('#editSubmitBtn').addEventListener('click', async () => {
    if (!activeItemPath) return;
    const description = $('#editDescription').value;
    const tags = $('#editTags').value.split(',').map((t) => t.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API}/files/${encodeURIPathSegments(activeItemPath)}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, tags }),
      });
      const data = await res.json();
      if (data.success) { toast(data.message, 'success'); closeModal('editModal'); loadFiles(); }
      else toast(data.message, 'error');
    } catch (e) { toast('Update failed.', 'error'); }
  });

  async function deleteItem(item) {
    const label = item.type === 'folder' ? 'this folder and everything inside it' : 'this file';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/files/${encodeURIPathSegments(item.relativePath)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast(data.message, 'success'); loadFiles(); }
      else toast(data.message, 'error');
    } catch (e) { toast('Delete failed.', 'error'); }
  }

  // ============ PREVIEW ============
  async function openPreview(item) {
    $('#previewTitle').textContent = item.name;
    const body = $('#previewBody');
    body.innerHTML = '<p>Loading preview…</p>';
    openModal('previewModal');

    const ext = (item.extension || '').toLowerCase();
    const url = `${API}/files/download/${encodeURIPathSegments(item.relativePath)}`;
    const codeExts = ['java', 'py', 'c', 'cpp', 'h', 'js', 'css', 'sql', 'md', 'txt', 'json'];

    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
      body.innerHTML = `<img src="${url}" alt="${escapeHtml(item.name)}" />`;
    } else if (ext === 'pdf') {
      body.innerHTML = `<iframe src="${url}"></iframe>`;
    } else if (ext === 'html') {
      body.innerHTML = `<iframe src="${url}"></iframe>`;
    } else if (codeExts.includes(ext)) {
      try {
        const res = await fetch(url);
        const text = await res.text();
        body.innerHTML = `<pre>${escapeHtml(text.slice(0, 20000))}</pre>`;
      } catch (e) {
        body.innerHTML = `<p>Preview unavailable. You can download the file instead.</p>`;
      }
    } else {
      body.innerHTML = `<p>Preview isn't available for this file type. Please download it instead.</p>`;
    }
  }

  // ============ UPLOAD ============
  $('#uploadBtn')?.addEventListener('click', openUploadModal);
  $('#emptyUploadBtn')?.addEventListener('click', openUploadModal);

  function openUploadModal() {
    selectedFiles = [];
    renderUploadFileList();
    $('#uploadSubmitBtn').disabled = true;
    $('#uploadProgress').classList.add('hidden');
    $('#uploadProgressBar').style.width = '0%';
    openModal('uploadModal');
  }

  $$('.upload-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.upload-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      uploadMode = tab.dataset.mode;
    });
  });

  $('#dropZone').addEventListener('click', () => {
    if (uploadMode === 'folder') $('#folderInput').click();
    else $('#fileInput').click();
  });

  ['dragover', 'dragleave', 'drop'].forEach((evt) => {
    $('#dropZone').addEventListener(evt, (e) => {
      e.preventDefault();
      $('#dropZone').classList.toggle('dragover', evt === 'dragover');
    });
  });
  $('#dropZone').addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer.files || []);
    addSelectedFiles(files.map((f) => ({ file: f, relativePath: f.name })));
  });

  $('#fileInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    addSelectedFiles(files.map((f) => ({ file: f, relativePath: f.name })));
    e.target.value = '';
  });

  $('#folderInput').addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    addSelectedFiles(files.map((f) => ({ file: f, relativePath: f.webkitRelativePath || f.name })));
    e.target.value = '';
  });

  function addSelectedFiles(entries) {
    selectedFiles = selectedFiles.concat(entries);
    renderUploadFileList();
    $('#uploadSubmitBtn').disabled = selectedFiles.length === 0;
  }

  function renderUploadFileList() {
    const list = $('#uploadFileList');
    list.innerHTML = selectedFiles.map((e) => `<div>📄 ${escapeHtml(e.relativePath)} (${fmtSize(e.file.size)})</div>`).join('');
  }

  $('#uploadSubmitBtn').addEventListener('click', async () => {
    if (!selectedFiles.length) return;
    const formData = new FormData();
    const paths = [];
    selectedFiles.forEach((entry) => {
      formData.append('files', entry.file);
      paths.push(entry.relativePath);
    });
    formData.append('paths', JSON.stringify(paths));

    $('#uploadProgress').classList.remove('hidden');
    $('#uploadSubmitBtn').disabled = true;

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}/upload`);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          $('#uploadProgressBar').style.width = `${pct}%`;
        }
      });
      xhr.onload = () => {
        $('#uploadSubmitBtn').disabled = false;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            toast('Upload Successful', 'success');
            closeModal('uploadModal');
            loadFiles();
          } else {
            toast(data.message || 'Upload failed.', 'error');
          }
        } catch (e) {
          toast('Upload failed.', 'error');
        }
      };
      xhr.onerror = () => { toast('Upload failed.', 'error'); $('#uploadSubmitBtn').disabled = false; };
      xhr.send(formData);
    } catch (e) {
      toast('Upload failed.', 'error');
      $('#uploadSubmitBtn').disabled = false;
    }
  });

  // ============ ADMIN DASHBOARD ============
  $('#adminDashBtn').addEventListener('click', async () => {
    openModal('dashboardModal');
    await loadStats();
    await loadSuggestions();
    renderSuggestionManager();
  });

  async function loadStats() {
    try {
      const res = await fetch(`${API}/files/stats`);
      const data = await res.json();
      if (!data.success) return;
      const s = data.stats;
      const cards = [
        { label: 'Total Files', value: s.totalFiles },
        { label: 'Total Folders', value: s.totalFolders },
        { label: 'Downloads', value: s.totalDownloads },
        { label: "Today's Uploads", value: s.todayUploads },
        { label: 'Pinned Files', value: s.pinned },
        { label: 'Storage Used', value: fmtSize(s.storageUsedBytes) },
      ];
      $('#statsGrid').innerHTML = cards.map((c) => `
        <div class="stat-card">
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      `).join('');
    } catch (e) { /* silent */ }
  }

  function renderSuggestionManager() {
    const list = $('#suggestionList');
    list.innerHTML = cachedSuggestions.map((s) => `
      <div class="suggestion-row" data-id="${s._id}">
        <span>${s.pinned ? '📌 ' : ''}${escapeHtml(s.text)} <em style="opacity:.6">(${s.category})</em></span>
        <div class="row-actions">
          <button data-act="pin">${s.pinned ? 'Unpin' : 'Pin'}</button>
          <button data-act="delete">Delete</button>
        </div>
      </div>
    `).join('');

    $$('.suggestion-row', list).forEach((row) => {
      const id = row.dataset.id;
      const s = cachedSuggestions.find((x) => x._id === id);
      row.querySelector('[data-act="pin"]').addEventListener('click', async () => {
        await fetch(`${API}/suggestions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: !s.pinned }),
        });
        await loadSuggestions();
        renderSuggestionManager();
      });
      row.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        await fetch(`${API}/suggestions/${id}`, { method: 'DELETE' });
        await loadSuggestions();
        renderSuggestionManager();
        toast('Deleted Successfully', 'success');
      });
    });
  }

  $('#addSuggestionBtn').addEventListener('click', async () => {
    const input = $('#newSuggestionInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      const res = await fetch(`${API}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, category: 'trending' }),
      });
      const data = await res.json();
      if (data.success) {
        input.value = '';
        await loadSuggestions();
        renderSuggestionManager();
        toast('Suggestion added', 'success');
      } else {
        toast(data.message, 'error');
      }
    } catch (e) { toast('Could not add suggestion.', 'error'); }
  });

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', async () => {
    initWelcome();
    await checkAuthStatus();
    await loadSuggestions();
    await loadFiles();
  });
})();
