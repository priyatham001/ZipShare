(() => {
  const API = '/api/files';

  // ---------- Elements ----------
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');

  const fileList = document.getElementById('fileList');
  const fileCount = document.getElementById('fileCount');

  const adminToggle = document.getElementById('adminToggle');
  const adminDot = document.getElementById('adminDot');
  const adminModal = document.getElementById('adminModal');
  const adminPassword = document.getElementById('adminPassword');
  const adminError = document.getElementById('adminError');
  const adminCancel = document.getElementById('adminCancel');
  const adminSubmit = document.getElementById('adminSubmit');

  const deleteModal = document.getElementById('deleteModal');
  const deleteFileName = document.getElementById('deleteFileName');
  const deleteCancel = document.getElementById('deleteCancel');
  const deleteConfirm = document.getElementById('deleteConfirm');

  const toast = document.getElementById('toast');

  let pendingDeleteId = null;
  let adminUnlockedPassword = sessionStorage.getItem('zs_admin') || null;

  // ---------- Helpers ----------
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function showToast(message, type = '') {
    toast.textContent = message;
    toast.className = 'toast' + (type ? ` toast-${type}` : '');
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function isAdminUnlocked() {
    return Boolean(adminUnlockedPassword);
  }

  function setAdminUnlocked(password) {
    adminUnlockedPassword = password;
    sessionStorage.setItem('zs_admin', password);
    adminDot.classList.add('unlocked');
    renderFiles(currentFiles);
  }

  function lockAdmin() {
    adminUnlockedPassword = null;
    sessionStorage.removeItem('zs_admin');
    adminDot.classList.remove('unlocked');
    renderFiles(currentFiles);
  }

  // ---------- Fetch + render file list ----------
  let currentFiles = [];

  async function loadFiles() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error('Failed to load files');
      currentFiles = await res.json();
      renderFiles(currentFiles);
    } catch (e) {
      showToast('Could not load the manifest', 'error');
    }
  }

  function renderFiles(files) {
    fileCount.textContent = `${files.length} parcel${files.length === 1 ? '' : 's'}`;

    if (!files.length) {
      fileList.innerHTML = '<p class="empty-state">The dock is empty &mdash; be the first to ship something.</p>';
      return;
    }

    fileList.innerHTML = files.map(f => `
      <div class="file-tag" data-id="${f._id}">
        <div class="file-tag-icon">🗂️</div>
        <div class="file-tag-main">
          <div class="file-tag-name">${escapeHtml(f.originalName)}</div>
          <div class="file-tag-meta">${formatBytes(f.size)}<span class="dot">&middot;</span>${formatDate(f.uploadDate)}</div>
        </div>
        <div class="file-tag-actions">
          <button class="icon-btn download-btn" title="Download" data-id="${f._id}">⬇</button>
          <button class="icon-btn danger-btn delete-btn" title="Delete" data-id="${f._id}" data-name="${escapeHtml(f.originalName)}" ${isAdminUnlocked() ? '' : 'hidden'}>🗑</button>
        </div>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  fileList.addEventListener('click', (e) => {
    const dlBtn = e.target.closest('.download-btn');
    if (dlBtn) {
      window.location.href = `${API}/${dlBtn.dataset.id}/download`;
      return;
    }
    const delBtn = e.target.closest('.delete-btn');
    if (delBtn) {
      pendingDeleteId = delBtn.dataset.id;
      deleteFileName.textContent = delBtn.dataset.name;
      openModal(deleteModal);
    }
  });

  // ---------- Upload ----------
  function uploadFile(file) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showToast('Only .zip files are accepted', 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast('File is over the 100MB limit', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API);

    progressWrap.hidden = false;
    progressBar.style.width = '0%';
    progressLabel.textContent = 'Loading cargo… 0%';

    xhr.upload.addEventListener('progress', (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      progressBar.style.width = `${pct}%`;
      progressLabel.textContent = `Loading cargo… ${pct}%`;
    });

    xhr.onload = () => {
      progressWrap.hidden = true;
      if (xhr.status === 201) {
        showToast('Parcel shipped', 'success');
        loadFiles();
      } else {
        let msg = 'Upload failed';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (_) {}
        showToast(msg, 'error');
      }
    };

    xhr.onerror = () => {
      progressWrap.hidden = true;
      showToast('Upload failed — check your connection', 'error');
    };

    xhr.send(formData);
  }

  browseBtn.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('click', (e) => {
    if (e.target === browseBtn) return;
    fileInput.click();
  });
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadFile(fileInput.files[0]);
    fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(evt =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    })
  );

  ['dragleave', 'drop'].forEach(evt =>
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    })
  );

  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });

  // ---------- Modal helpers ----------
  function openModal(modal) {
    modal.hidden = false;
  }
  function closeModal(modal) {
    modal.hidden = true;
  }

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(adminModal);
      closeModal(deleteModal);
    }
  });

  // ---------- Admin unlock ----------
  adminToggle.addEventListener('click', () => {
    if (isAdminUnlocked()) {
      lockAdmin();
      showToast('Admin locked');
      return;
    }
    adminError.hidden = true;
    adminPassword.value = '';
    openModal(adminModal);
    setTimeout(() => adminPassword.focus(), 50);
  });

  adminCancel.addEventListener('click', () => closeModal(adminModal));

  async function submitAdminPassword() {
    const pwd = adminPassword.value;
    if (!pwd) return;
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      if (res.ok) {
        setAdminUnlocked(pwd);
        closeModal(adminModal);
        showToast('Admin unlocked', 'success');
      } else {
        adminError.hidden = false;
      }
    } catch (e) {
      adminError.hidden = false;
    }
  }

  adminSubmit.addEventListener('click', submitAdminPassword);
  adminPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAdminPassword();
  });

  // ---------- Delete flow ----------
  deleteCancel.addEventListener('click', () => {
    pendingDeleteId = null;
    closeModal(deleteModal);
  });

  deleteConfirm.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      const res = await fetch(`${API}/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminUnlockedPassword })
      });
      if (res.ok) {
        showToast('Parcel removed', 'success');
        closeModal(deleteModal);
        loadFiles();
      } else if (res.status === 401) {
        showToast('Admin session expired — unlock again', 'error');
        lockAdmin();
        closeModal(deleteModal);
      } else {
        showToast('Delete failed', 'error');
      }
    } catch (e) {
      showToast('Delete failed — check your connection', 'error');
    }
    pendingDeleteId = null;
  });

  // ---------- Init ----------
  if (isAdminUnlocked()) adminDot.classList.add('unlocked');
  loadFiles();
})();
