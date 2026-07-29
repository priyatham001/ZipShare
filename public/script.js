(function () {
  const state = {
    isAdmin: false,
    csrfToken: null,
    pendingDeleteId: null
  };

  const el = {
    adminControls: document.getElementById('adminControls'),
    logoutBtn: document.getElementById('logoutBtn'),
    uploadSection: document.getElementById('uploadSection'),
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    uploadProgressList: document.getElementById('uploadProgressList'),
    fileGrid: document.getElementById('fileGrid'),
    fileCount: document.getElementById('fileCount'),
    emptyState: document.getElementById('emptyState'),
    ownerTag: document.getElementById('ownerTag'),
    loginModal: document.getElementById('loginModal'),
    closeModal: document.getElementById('closeModal'),
    loginForm: document.getElementById('loginForm'),
    passwordInput: document.getElementById('passwordInput'),
    loginError: document.getElementById('loginError'),
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

  function iconFor(mime, name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
    if (['pdf'].includes(ext)) return '📕';
    if (['doc', 'docx'].includes(ext)) return '📄';
    if (['xls', 'xlsx'].includes(ext)) return '📊';
    if (['ppt', 'pptx'].includes(ext)) return '📽️';
    if (['exe', 'apk', 'iso'].includes(ext)) return '📦';
    return '📁';
  }

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
    renderFiles(cachedFiles);
  }

  el.ownerTag.addEventListener('click', () => {
    el.loginModal.hidden = false;
    el.passwordInput.value = '';
    el.loginError.hidden = true;
    el.passwordInput.focus();
  });

  el.closeModal.addEventListener('click', () => { el.loginModal.hidden = true; });
  el.loginModal.addEventListener('click', (e) => {
    if (e.target === el.loginModal) el.loginModal.hidden = true;
  });

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.loginError.hidden = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: el.passwordInput.value })
      });
      const data = await res.json();
      if (!res.ok) {
        el.loginError.textContent = data.error || 'Login failed';
        el.loginError.hidden = false;
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
    }
  });

  el.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    state.isAdmin = false;
    state.csrfToken = null;
    applyAuthUI();
    showToast('Logged out');
  });

  // ---------- File list ----------
  let cachedFiles = [];

  async function loadFiles() {
    try {
      const res = await fetch('/api/files', { credentials: 'same-origin' });
      cachedFiles = await res.json();
      renderFiles(cachedFiles);
    } catch (err) {
      console.error('Failed to load files', err);
      showToast('Could not load file list', 'error');
    }
  }

  function renderFiles(files) {
    el.fileGrid.innerHTML = '';
    el.fileCount.textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
    el.emptyState.hidden = files.length > 0;

    files.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.innerHTML = `
        <div class="file-icon">${iconFor(f.mimeType || '', f.originalName)}</div>
        <div class="file-name">${escapeHtml(f.originalName)}</div>
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // ---------- Upload (drag & drop + click) ----------
  el.dropzone.addEventListener('click', () => el.fileInput.click());

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
    if (files && files.length) uploadFiles(files);
  });
  el.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) uploadFiles(e.target.files);
    e.target.value = '';
  });

  function uploadFiles(fileList) {
    const formData = new FormData();
    Array.from(fileList).forEach((f) => formData.append('files', f));

    const progressItem = document.createElement('div');
    progressItem.className = 'progress-item';
    const label = Array.from(fileList).length === 1 ? fileList[0].name : `${fileList.length} files`;
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
  refreshAuthStatus().then(loadFiles);
})();
