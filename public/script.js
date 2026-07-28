const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const toast = document.getElementById('toast');

const adminToggle = document.getElementById('adminToggle');
const adminModal = document.getElementById('adminModal');
const adminPassword = document.getElementById('adminPassword');
const adminSubmit = document.getElementById('adminSubmit');
const adminCancel = document.getElementById('adminCancel');
const adminError = document.getElementById('adminError');

const deleteModal = document.getElementById('deleteModal');
const deleteFileName = document.getElementById('deleteFileName');
const deleteConfirm = document.getElementById('deleteConfirm');
const deleteCancel = document.getElementById('deleteCancel');

let isAdmin = false;
let adminPass = '';
let pendingDeleteId = null;
let pendingDeleteName = '';

// ---------- Helpers ----------

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 3000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- Fetch & render files ----------

async function loadFiles() {
  try {
    const res = await fetch('/api/files');
    const files = await res.json();
    renderFiles(files);
  } catch (err) {
    showToast('Could not load files', 'error');
  }
}

function renderFiles(files) {
  fileCount.textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;

  if (files.length === 0) {
    fileList.innerHTML = '<p class="empty-state">No files uploaded yet — be the first!</p>';
    return;
  }

  fileList.innerHTML = files.map(f => `
    <div class="file-item" data-id="${f._id}">
      <div class="file-icon">🗜️</div>
      <div class="file-info">
        <div class="file-name">${escapeHtml(f.originalName)}</div>
        <div class="file-meta">${formatBytes(f.size)} · ${formatDate(f.uploadedAt)}</div>
      </div>
      <div class="file-actions">
        <button class="icon-btn download-btn" title="Download" data-id="${f._id}">⬇️</button>
        ${isAdmin ? `<button class="icon-btn delete-btn" title="Delete" data-id="${f._id}" data-name="${escapeHtml(f.originalName)}">🗑️</button>` : ''}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = `/api/files/download/${btn.dataset.id}`;
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingDeleteId = btn.dataset.id;
      pendingDeleteName = btn.dataset.name;
      deleteFileName.textContent = pendingDeleteName;
      deleteModal.hidden = false;
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Upload ----------

function uploadFile(file) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    showToast('Only .zip files are allowed', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('zipfile', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/files/upload');

  progressWrap.hidden = false;
  progressBar.style.width = '0%';

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percent = (e.loaded / e.total) * 100;
      progressBar.style.width = `${percent}%`;
    }
  });

  xhr.onload = () => {
    progressWrap.hidden = true;
    if (xhr.status === 201) {
      showToast('File uploaded successfully!');
      loadFiles();
    } else {
      let msg = 'Upload failed';
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
      showToast(msg, 'error');
    }
  };

  xhr.onerror = () => {
    progressWrap.hidden = true;
    showToast('Upload failed — network error', 'error');
  };

  xhr.send(formData);
}

browseBtn.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click', (e) => {
  if (e.target === browseBtn) return;
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) uploadFile(fileInput.files[0]);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

// ---------- Admin unlock ----------

adminToggle.addEventListener('click', () => {
  if (isAdmin) {
    // Lock again
    isAdmin = false;
    adminPass = '';
    adminToggle.textContent = '🔐 Admin';
    adminToggle.classList.remove('unlocked');
    loadFiles();
    showToast('Admin mode disabled');
    return;
  }
  adminError.hidden = true;
  adminPassword.value = '';
  adminModal.hidden = false;
  adminPassword.focus();
});

adminCancel.addEventListener('click', () => { adminModal.hidden = true; });

adminSubmit.addEventListener('click', attemptAdminUnlock);
adminPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') attemptAdminUnlock();
});

async function attemptAdminUnlock() {
  const pass = adminPassword.value;
  if (!pass) return;

  // We verify by attempting a harmless check: try deleting a bogus id.
  // A wrong password returns 403; a right password (with fake id) returns 404 "File not found".
  try {
    const res = await fetch('/api/files/000000000000000000000000', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });

    if (res.status === 403) {
      adminError.hidden = false;
      return;
    }

    // 404 or anything other than 403 means the password was accepted
    isAdmin = true;
    adminPass = pass;
    adminToggle.textContent = '✅ Admin';
    adminToggle.classList.add('unlocked');
    adminModal.hidden = true;
    loadFiles();
    showToast('Admin mode enabled');
  } catch (err) {
    showToast('Could not verify password', 'error');
  }
}

// ---------- Delete ----------

deleteCancel.addEventListener('click', () => {
  deleteModal.hidden = true;
  pendingDeleteId = null;
});

deleteConfirm.addEventListener('click', async () => {
  if (!pendingDeleteId) return;

  try {
    const res = await fetch(`/api/files/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPass })
    });

    if (res.ok) {
      showToast('File deleted');
      loadFiles();
    } else {
      const data = await res.json();
      showToast(data.error || 'Delete failed', 'error');
    }
  } catch (err) {
    showToast('Delete failed — network error', 'error');
  } finally {
    deleteModal.hidden = true;
    pendingDeleteId = null;
  }
});

// ---------- Init ----------
loadFiles();
