(function () {
  const state = {
    isAdmin: false,
    csrfToken: null,
    pendingDeleteId: null,
    files: [],
    suggestions: [],
    searchQuery: '',
    failedAttemptsClient: 0
  };

  const el = {
    themeIntro: document.getElementById('themeIntro'),
    typedTitle: document.getElementById('typedTitle'),
    themeToggle: document.getElementById('themeToggle'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    suggestionChips: document.getElementById('suggestionChips'),
    adminControls: document.getElementById('adminControls'),
    logoutBtn: document.getElementById('logoutBtn'),
    uploadSection: document.getElementById('uploadSection'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    folderInput: document.getElementById('folderInput'),
    browseFilesBtn: document.getElementById('browseFilesBtn'),
    browseFolderBtn: document.getElementById('browseFolderBtn'),
    uploadProgressList: document.getElementById('uploadProgressList'),
    suggestionForm: document.getElementById('suggestionForm'),
    suggestionInput: document.getElementById('suggestionInput'),
    suggestionAdminList: document.getElementById('suggestionAdminList'),
    fileGrid: document.getElementById('fileGrid'),
    fileCount: document.getElementById('fileCount'),
    filesHeading: document.getElementById('filesHeading'),
    emptyState: document.getElementById('emptyState'),
    noResultsState: document.getElementById('noResultsState'),
    ownerTag: document.getElementById('ownerTag'),
    loginModal: document.getElementById('loginModal'),
    closeModal: document.getElementById('closeModal'),
    loginForm: document.getElementById('loginForm'),
    passwordInput: document.getElementById('passwordInput'),
    loginError: document.getElementById('loginError'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    lockoutModal: document.getElementById('lockoutModal'),
    lockoutTimer: document.getElementById('lockoutTimer'),
    confirmModal: document.getElementById('confirmModal'),
    confirmText: document.getElementById('confirmText'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmDelete: document.getElementById('confirmDelete'),
    toast: document.getElementById('toast')
  };

  function showToast(message, type) {
    el.toast.textContent = message;
    el.toast.className = 'toast' + (type ? ' ' + type : '');
    el.toast.hidden = false;
    setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const EXT_ICONS = {
    java: '☕', py: '🐍', c: '🔧', cpp: '🔧', h: '🔧',
    html: '🌐', css: '🎨', js: '📜', json: '🗂️',
    pdf: '📕', doc: '📄', docx: '📄', xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️', zip: '🗜️', rar: '🗜️', '7z': '🗜️',
    exe: '📦', apk: '📦', iso: '📦'
  };

  function iconFor(mime, name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (mime && mime.startsWith('image/')) return '🖼️';
    if (mime && mime.startsWith('video/')) return '🎬';
    if (mime && mime.startsWith('audio/')) return '🎵';
    return EXT_ICONS[ext] || '📁';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Theme ----------
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    el.themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  }

  function typeTitle(text, cb) {
    let i = 0;
    el.typedTitle.textContent = '';
    const timer = setInterval(() => {
      el.typedTitle.textContent += text[i];
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        if (cb) cb();
      }
    }, 45);
  }

  function initTheme() {
    const saved = localStorage.getItem('zipshare-theme');
    if (saved) {
      applyTheme(saved);
      return;
    }
    el.themeIntro.hidden = false;
    applyTheme('dark');
    typeTitle('Welcome to ZipShare');
  }

  el.themeIntro.querySelectorAll('.theme-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      localStorage.setItem('zipshare-theme', theme);
      applyTheme(theme);
      el.themeIntro.classList.add('closing');
      setTimeout(() => { el.themeIntro.hidden = true; }, 500);
    });
  });

  el.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('zipshare-theme', next);
  });

  // ---------- Floating particles ----------
  function spawnParticles() {
    const container = document.getElementById('particles');
    const count = window.innerWidth < 700 ? 14 : 28;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = 12 + Math.random() * 14 + 's';
      p.style.animationDelay = Math.random() * 12 + 's';
      container.appendChild(p);
    }
  }

  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    document.querySelectorAll('.blob').forEach((b, i) => {
      const factor = (i + 1) * 0.6;
      b.style.marginLeft = (x * factor) + 'px';
      b.style.marginTop = (y * factor) + 'px';
    });
  });

  // ---------- Auth ----------
  async function refreshAuthStatus() {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
      const data = await res.json();
      state.isAdmin = Boolean(data.isAdmin);
      state.csrfToken = data.csrfToken;
      applyAuthUI();
    } catch (err) {
      console.error('Auth status check failed', err);
    }
  }

  function applyAuthUI() {
    el.adminControls.hidden = !state.isAdmin;
    el.uploadSection.hidden = !state.isAdmin;
    el.ownerTag.textContent = state.isAdmin ? 'Welcome Admin' : 'Welcome Anonymous';
    renderFiles();
    renderSuggestionAdminList();
  }

  el.ownerTag.addEventListener('click', () => {
    if (state.isAdmin) return;
    el.loginModal.hidden = false;
    el.passwordInput.value = '';
    el.loginError.hidden = true;
    el.passwordInput.focus();
  });

  el.closeModal.addEventListener('click', () => { el.loginModal.hidden = true; });
  el.loginModal.addEventListener('click', (e) => {
    if (e.target === el.loginModal) el.loginModal.hidden = true;
  });

  function showLockout(retryAfterMs) {
    el.loginModal.hidden = true;
    el.lockoutModal.hidden = false;
    let remaining = Math.ceil((retryAfterMs || 30000) / 1000);
    el.lockoutTimer.textContent = `Try again in ${remaining}s`;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(timer);
        el.lockoutModal.hidden = true;
      } else {
        el.lockoutTimer.textContent = `Try again in ${remaining}s`;
      }
    }, 1000);
  }

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.loginError.hidden = true;
    el.loginSubmitBtn.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: el.passwordInput.value })
      });
      const data = await res.json();

      if (res.status === 423 || data.locked) {
        showLockout(data.retryAfterMs);
        return;
      }

      if (!res.ok) {
        el.loginError.textContent = data.error || 'Access Denied. Incorrect password.';
        el.loginError.hidden = false;
        el.passwordInput.value = '';
        el.passwordInput.focus();
        return;
      }

      state.isAdmin = true;
      state.csrfToken = data.csrfToken;
      el.loginModal.hidden = true;
      applyAuthUI();
      showToast('Welcome back, admin', 'success');
    } catch (err) {
      el.loginError.textContent = 'Network error - please try again';
      el.loginError.hidden = false;
    } finally {
      el.loginSubmitBtn.disabled = false;
    }
  });

  el.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    state.isAdmin = false;
    state.csrfToken = null;
    applyAuthUI();
    showToast('Logged out');
  });

  // ---------- Suggestions ----------
  async function loadSuggestions() {
    try {
      const res = await fetch('/api/suggestions', { credentials: 'same-origin' });
      state.suggestions = await res.json();
      renderSuggestionChips();
      renderSuggestionAdminList();
    } catch (err) {
      console.error('Failed to load suggestions', err);
    }
  }

  function renderSuggestionChips() {
    el.suggestionChips.innerHTML = '';
    state.suggestions.forEach((s) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (s.pinned ? ' pinned' : '');
      chip.textContent = s.text;
      chip.addEventListener('click', () => {
        el.searchInput.value = s.text;
        state.searchQuery = s.text.toLowerCase();
        el.clearSearch.hidden = false;
        renderFiles();
      });
      el.suggestionChips.appendChild(chip);
    });
  }

  function renderSuggestionAdminList() {
    if (!state.isAdmin) { el.suggestionAdminList.innerHTML = ''; return; }
    el.suggestionAdminList.innerHTML = '';
    state.suggestions.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'suggestion-admin-item';
      item.innerHTML = `
        <span>${escapeHtml(s.text)}</span>
        <button class="pin-btn ${s.pinned ? 'active' : ''}" title="Pin">📌</button>
        <button title="Delete">&times;</button>
      `;
      item.querySelector('.pin-btn').addEventListener('click', async () => {
        await fetch(`/api/suggestions/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken },
          credentials: 'same-origin',
          body: JSON.stringify({ pinned: !s.pinned })
        });
        loadSuggestions();
      });
      item.querySelector('button[title="Delete"]').addEventListener('click', async () => {
        await fetch(`/api/suggestions/${s.id}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': state.csrfToken },
          credentials: 'same-origin'
        });
        loadSuggestions();
      });
      el.suggestionAdminList.appendChild(item);
    });
  }

  el.suggestionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = el.suggestionInput.value.trim();
    if (!text) return;
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken },
        credentials: 'same-origin',
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error('Could not add suggestion');
      el.suggestionInput.value = '';
      loadSuggestions();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ---------- Search ----------
  let searchDebounce;
  el.searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    el.clearSearch.hidden = !el.searchInput.value;
    searchDebounce = setTimeout(() => {
      state.searchQuery = el.searchInput.value.trim().toLowerCase();
      renderFiles();
    }, 150);
  });
  el.clearSearch.addEventListener('click', () => {
    el.searchInput.value = '';
    el.clearSearch.hidden = true;
    state.searchQuery = '';
    renderFiles();
  });

  function matchesSearch(f) {
    if (!state.searchQuery) return true;
    const haystack = [f.originalName, f.relativePath, ...(f.tags || [])].join(' ').toLowerCase();
    return haystack.includes(state.searchQuery);
  }

  // ---------- File list ----------
  async function loadFiles() {
    try {
      const res = await fetch('/api/files', { credentials: 'same-origin' });
      state.files = await res.json();
      renderFiles();
    } catch (err) {
      console.error('Failed to load files', err);
      showToast('Could not load file list', 'error');
    }
  }

  function renderFiles() {
    const filtered = state.files.filter(matchesSearch);
    el.fileGrid.innerHTML = '';
    el.fileCount.textContent = `${filtered.length} file${filtered.length === 1 ? '' : 's'}`;
    el.filesHeading.textContent = state.searchQuery ? `Results for "${el.searchInput.value}"` : 'Available files';

    el.emptyState.hidden = state.files.length > 0;
    el.noResultsState.hidden = !(state.files.length > 0 && filtered.length === 0);

    filtered.forEach((f, idx) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.style.animationDelay = Math.min(idx * 0.03, 0.4) + 's';
      card.innerHTML = `
        <div class="file-icon">${iconFor(f.mimeType || '', f.originalName)}</div>
        ${f.relativePath ? `<div class="file-path">📁 ${escapeHtml(f.relativePath)}</div>` : ''}
        <div class="file-name">${escapeHtml(f.originalName)}</div>
        ${f.tags && f.tags.length ? `<div class="file-tags">${f.tags.map((t) => `<span class="file-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="file-meta">
          <span>${formatBytes(f.size)}</span>
          <span>${formatDate(f.uploadedAt)}</span>
        </div>
        <div class="file-actions">
          <a class="btn btn-primary btn-sm" href="/api/files/${f.id}/download">Download</a>
          ${state.isAdmin ? `<button class="btn btn-danger btn-sm" data-id="${f.id}" data-name="${escapeHtml(f.originalName)}">Delete</button>` : ''}
        </div>
      `;
      el.fileGrid.appendChild(card);
    });

    if (state.isAdmin) {
      el.fileGrid.querySelectorAll('button.btn-danger').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.pendingDeleteId = btn.dataset.id;
          el.confirmText.textContent = `Delete "${btn.dataset.name}"? This cannot be undone.`;
          el.confirmModal.hidden = false;
        });
      });
    }
  }

  el.confirmCancel.addEventListener('click', () => {
    el.confirmModal.hidden = true;
    state.pendingDeleteId = null;
  });

  el.confirmDelete.addEventListener('click', async () => {
    if (!state.pendingDeleteId) return;
    try {
      const res = await fetch(`/api/files/${state.pendingDeleteId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': state.csrfToken }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      showToast('File deleted', 'success');
      el.confirmModal.hidden = true;
      state.pendingDeleteId = null;
      loadFiles();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // ---------- Upload (drag & drop, files, folders) ----------
  el.browseFilesBtn.addEventListener('click', (e) => { e.stopPropagation(); el.fileInput.click(); });
  el.browseFolderBtn.addEventListener('click', (e) => { e.stopPropagation(); el.folderInput.click(); });
  el.dropzone.addEventListener('click', (e) => {
    if (e.target === el.dropzone || e.target.closest('.dropzone-inner')) {
      if (!e.target.closest('.dropzone-btns')) el.fileInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    el.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    el.dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('dragover');
    });
  });
  el.dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length) uploadFiles(Array.from(files).map((f) => ({ file: f, path: '' })));
  });

  el.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      uploadFiles(Array.from(e.target.files).map((f) => ({ file: f, path: '' })));
    }
    e.target.value = '';
  });

  el.folderInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      uploadFiles(Array.from(e.target.files).map((f) => ({ file: f, path: f.webkitRelativePath || '' })));
    }
    e.target.value = '';
  });

  function uploadFiles(items) {
    const formData = new FormData();
    items.forEach(({ file, path }) => {
      formData.append('files', file);
      formData.append('paths', path);
    });

    const progressItem = document.createElement('div');
    progressItem.className = 'progress-item';
    const label = items.length === 1 ? items[0].file.name : `${items.length} files`;
    progressItem.innerHTML = `
      <div class="pname"><span>${escapeHtml(label)}</span><span class="pct">0%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
    `;
    el.uploadProgressList.appendChild(progressItem);
    const fill = progressItem.querySelector('.progress-fill');
    const pct = progressItem.querySelector('.pct');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', state.csrfToken);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        fill.style.width = percent + '%';
        pct.textContent = percent + '%';
      }
    });

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        progressItem.classList.add('success');
        pct.textContent = 'Done';
        showToast('Upload complete', 'success');
        loadFiles();
      } else {
        let msg = 'Upload failed';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
        progressItem.classList.add('error');
        pct.textContent = 'Error';
        showToast(msg, 'error');
      }
      setTimeout(() => progressItem.remove(), 4000);
    };

    xhr.onerror = () => {
      progressItem.classList.add('error');
      pct.textContent = 'Error';
      showToast('Network error during upload', 'error');
    };

    xhr.send(formData);
  }

  // ---------- Init ----------
  initTheme();
  spawnParticles();
  refreshAuthStatus().then(loadFiles);
  loadSuggestions();
})();
