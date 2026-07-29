// State Management
let currentTheme = localStorage.getItem('zipshare_theme') || 'dark';
let adminToken = localStorage.getItem('zipshare_admin_token') || null;
let failedAttempts = 0;
let isLockedOut = false;
let activeFilter = 'All';

document.documentElement.setAttribute('data-theme', currentTheme);

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  runTypingEffect();
  setupEventListeners();
  loadSuggestions();
  loadFiles();
});

// Typing Animation on Welcome Screen
function runTypingEffect() {
  const text = "Welcome to ZipShare";
  const titleEl = document.getElementById('typingTitle');
  let i = 0;
  titleEl.innerHTML = "";
  
  function type() {
    if (i < text.length) {
      titleEl.innerHTML += text.charAt(i);
      i++;
      setTimeout(type, 80);
    }
  }
  type();
}

// Initial Theme Selection Handler
function selectInitialTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('zipshare_theme', theme);
  
  document.getElementById('landingScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
}

// Theme Toggle Button
document.getElementById('themeToggleBtn').addEventListener('click', () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('zipshare_theme', currentTheme);
});

// Event Listeners Configuration
function setupEventListeners() {
  // Folder & File Upload Handlers
  document.getElementById('fileInput').addEventListener('change', (e) => handleUpload(e.target.files));
  document.getElementById('folderInput').addEventListener('change', (e) => handleFolderUpload(e.target.files));

  // Search Input Debounced
  let searchTimeout;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadFiles(e.target.value, activeFilter), 300);
  });

  // Filter Buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFilter = e.target.getAttribute('data-filter');
      loadFiles(document.getElementById('searchInput').value, activeFilter);
    });
  });

  // Modals Setup
  document.getElementById('adminLoginBtn').addEventListener('click', openAdminModal);
  document.getElementById('devBadge').addEventListener('click', () => {
    document.getElementById('nomadModal').classList.remove('hidden');
  });
}

// Folder Upload Handler with Hierarchy Preservation
async function handleFolderUpload(files) {
  if (!files || files.length === 0) return;
  const formData = new FormData();
  
  for (let file of files) {
    formData.append('files', file);
    // Preserves internal folder relative path
    formData.append('relativePaths', file.webkitRelativePath || file.name);
  }

  showToast('Uploading folder structure...', 'info');
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      showToast('Folder uploaded successfully!', 'success');
      loadFiles();
    } else {
      showToast(data.message || 'Folder upload failed', 'error');
    }
  } catch (err) {
    showToast('Error uploading folder', 'error');
  }
}

// Fetch and Render Files Grid
async function loadFiles(searchQuery = '', filter = 'All') {
  try {
    const res = await fetch(`/api/files?query=${encodeURIComponent(searchQuery)}&filter=${encodeURIComponent(filter)}`);
    const data = await res.json();
    const grid = document.getElementById('fileGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    if (!data.files || data.files.length === 0) {
      empty.classList.remove('hidden');
      document.getElementById('fileCountBadge').innerText = '0 files';
      return;
    }

    empty.classList.add('hidden');
    document.getElementById('fileCountBadge').innerText = `${data.files.length} files`;

    data.files.forEach(file => {
      const card = document.createElement('div');
      card.className = 'file-card glass';
      
      const iconClass = getFileIconClass(file.originalName, file.isFolder);
      const formattedSize = (file.size / 1024 < 1024) ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      card.innerHTML = `
        <i class="${iconClass} file-icon"></i>
        <div class="file-title" title="${file.originalName}">${file.originalName}</div>
        <div class="file-meta">${formattedSize} • ${new Date(file.uploadDate).toLocaleDateString()}</div>
        <div class="card-actions">
          <button onclick="downloadFile('${file._id}')"><i class="fa-solid fa-download"></i></button>
          <button onclick="previewFile('${file._id}', '${file.originalName}')"><i class="fa-solid fa-eye"></i></button>
          ${adminToken ? `<button onclick="deleteFile('${file._id}')" style="color: #ef4444;"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    showToast('Failed to load files', 'error');
  }
}

// Admin Authentication & Lockout Security Logic
async function handleAdminLogin(e) {
  e.preventDefault();
  if (isLockedOut) return;

  const password = document.getElementById('adminPassword').value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      adminToken = password;
      localStorage.setItem('zipshare_admin_token', password);
      failedAttempts = 0;
      updateAdminStatus(true);
      closeAdminModal();
      showToast('Login Successful! Welcome Admin.', 'success');
      loadFiles();
    } else {
      failedAttempts++;
      if (failedAttempts >= 3) {
        triggerLockout();
      } else {
        showToast('Access Denied. Incorrect password. Please try again.', 'error');
      }
    }
  } catch (err) {
    showToast('Login processing error', 'error');
  }
}

function triggerLockout() {
  isLockedOut = true;
  let remaining = 30;
  const alertEl = document.getElementById('lockoutAlert');
  const timerEl = document.getElementById('lockoutTimer');
  const submitBtn = document.getElementById('loginSubmitBtn');

  alertEl.classList.remove('hidden');
  submitBtn.disabled = true;

  const interval = setInterval(() => {
    remaining--;
    timerEl.innerText = remaining;
    if (remaining <= 0) {
      clearInterval(interval);
      isLockedOut = false;
      failedAttempts = 0;
      alertEl.classList.add('hidden');
      submitBtn.disabled = false;
    }
  }, 1000);
}

function updateAdminStatus(isAdmin) {
  const statusText = document.getElementById('userStatusText');
  const adminControls = document.getElementById('adminSugControls');
  
  if (isAdmin) {
    statusText.innerText = 'Welcome Admin';
    if (adminControls) adminControls.classList.remove('hidden');
  } else {
    statusText.innerText = 'Welcome Anonymous';
    if (adminControls) adminControls.classList.add('hidden');
  }
}

// Extension & Folder Dynamic Icon Selector
function getFileIconClass(filename, isFolder) {
  if (isFolder) return 'fa-solid fa-folder-closed';
  const ext = filename.split('.').pop().toLowerCase();
  
  switch(ext) {
    case 'java': return 'fa-brands fa-java';
    case 'py': return 'fa-brands fa-python';
    case 'c': case 'cpp': return 'fa-solid fa-code';
    case 'js': case 'json': return 'fa-brands fa-js';
    case 'pdf': return 'fa-solid fa-file-pdf';
    case 'zip': case 'rar': return 'fa-solid fa-file-zipper';
    default: return 'fa-solid fa-file-code';
  }
}

// Modal Toggle Helpers
function openAdminModal() { document.getElementById('adminModal').classList.remove('hidden'); }
function closeAdminModal() { document.getElementById('adminModal').classList.add('hidden'); }
function closePreviewModal() { document.getElementById('previewModal').classList.add('hidden'); }
function closeNomadModal() { document.getElementById('nomadModal').classList.add('hidden'); }

// Toast Notifications Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast glass toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Background Particle Canvas Logic
function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  let particles = Array.from({ length: 35 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2 + 1,
    dx: (Math.random() - 0.5) * 0.5,
    dy: (Math.random() - 0.5) * 0.5
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    requestAnimationFrame(animate);
  }
  animate();
}