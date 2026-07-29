// ZIPSHARE V3 - Master Application Script
let adminToken = localStorage.getItem('zipshare_token') || null;
let activeCategory = 'all';
let activeTheme = localStorage.getItem('zipshare_theme') || 'dark';
let searchSearchQuery = '';
let searchDebounceTimer = null;
let lastFiles = [];
let pendingDeleteId = null;
let editingFileId = null;
let previewingFile = null;
let subjectAnimFrame = null;

// Icon & Color Map per File Type
const ICONS = {
  java: { icon: '☕', color: '#f89820' },
  py: { icon: '🐍', color: '#3776ab' },
  c: { icon: '🔷', color: '#5c6bc0' },
  cpp: { icon: '⚙️', color: '#00599c' },
  html: { icon: '🌐', color: '#e34c26' },
  css: { icon: '🎨', color: '#264de4' },
  js: { icon: '📜', color: '#f0db4f' },
  sql: { icon: '🗄️', color: '#00838f' },
  pdf: { icon: '📕', color: '#e53935' },
  zip: { icon: '🗜️', color: '#a67c52' },
  png: { icon: '🖼️', color: '#66bb6a' },
  jpg: { icon: '🖼️', color: '#66bb6a' },
  jpeg: { icon: '🖼️', color: '#66bb6a' },
  folder: { icon: '📁', color: '#facc15' },
  default: { icon: '📄', color: '#8b5cf6' }
};

// DOM Helper
function $(id) { return document.getElementById(id); }

function fmtSize(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

function fmtDate(d) {
  if (!d) return 'Recent';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function toast(message, type = 'success') {
  const container = $('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function openModal(id) { $(id).classList.add('show'); }
function closeModal(id) { $(id).classList.remove('show'); }

function authHeaders() {
  return adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
}

function jsonAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    ...authHeaders()
  };
}

// ---------------- Theme & Welcome Intro ----------------
function applyTheme(theme) {
  activeTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  const toggleBtn = $('themeToggle');
  if (toggleBtn) {
    toggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
    toggleBtn.title = theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
  }
  localStorage.setItem('zipshare_theme', theme);

  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === theme);
  });
}

function initIntro() {
  applyTheme(activeTheme);

  // Setup theme selection in intro
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });

  // Category choice in intro
  document.querySelectorAll('.welcome-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.welcome-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
    });
  });

  $('enterAppBtn').addEventListener('click', () => {
    $('introScreen').classList.add('hidden');
    $('welcomeSplash').classList.add('show');
    
    setTimeout(() => {
      $('welcomeSplash').classList.remove('show');
      $('app').classList.add('show');
      switchCategory(activeCategory);
    }, 1200);
  });

  // Skip intro if already visited previously
  if (localStorage.getItem('zipshare_visited')) {
    $('introScreen').classList.add('hidden');
    $('app').classList.add('show');
  } else {
    localStorage.setItem('zipshare_visited', 'true');
  }
}

$('themeToggle').addEventListener('click', () => {
  const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
});

// ---------------- Mouse Cursor Particle Bubbles ----------------
function initParticles() {
  const canvas = $('particleCanvas');
  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];

  document.addEventListener('mousemove', e => {
    const glow = $('glowCursor');
    if (glow) {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    }

    if (Math.random() > 0.4) {
      particles.push({
        x: e.clientX,
        y: e.clientY,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 2 - 0.5,
        radius: Math.random() * 5 + 2,
        color: Math.random() > 0.5 ? '#8b5cf6' : '#06b6d4',
        alpha: 1
      });
    }
  });

  function render() {
    ctx.clearRect(0, 0, width, height);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.02;

      if (p.alpha <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
    requestAnimationFrame(render);
  }
  render();
}

// ---------------- Subject Animations ----------------
function renderSubjectAnimation(cat) {
  const canvas = $('subjectCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  if (subjectAnimFrame) cancelAnimationFrame(subjectAnimFrame);

  let frame = 0;

  function animate() {
    frame++;
    ctx.clearRect(0, 0, w, h);

    if (cat === 'python') {
      // 🐍 Animated snake
      ctx.beginPath();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#3776ab';
      ctx.lineCap = 'round';
      for (let x = 10; x < w - 10; x += 5) {
        const y = h / 2 + Math.sin((x + frame * 3) * 0.05) * 18;
        if (x === 10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Snake Head
      const headX = (w - 20) ;
      const headY = h / 2 + Math.sin((headX + frame * 3) * 0.05) * 18;
      ctx.beginPath();
      ctx.arc(headX, headY, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#f0db4f';
      ctx.fill();

    } else if (cat === 'java') {
      // ☕ Coffee mug with steam
      ctx.fillStyle = '#f89820';
      ctx.fillRect(w / 2 - 20, h / 2 - 10, 40, 35);
      ctx.strokeStyle = '#f89820';
      ctx.lineWidth = 4;
      ctx.strokeRect(w / 2 + 20, h / 2 - 5, 12, 20);

      // Rising steam particles
      for (let i = 0; i < 3; i++) {
        const sx = w / 2 - 12 + i * 12;
        const sy = h / 2 - 18 - ((frame * 1.5 + i * 15) % 25);
        ctx.beginPath();
        ctx.arc(sx + Math.sin(frame * 0.1 + i) * 4, sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }

    } else if (cat === 'c') {
      // 🔷 Rotating C Logo
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(frame * 0.02);
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0.4, Math.PI * 1.6);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#5c6bc0';
      ctx.stroke();
      ctx.restore();

    } else if (cat === 'cpp') {
      // ⚙️ Rotating Gear
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(frame * 0.03);
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#00599c';
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        ctx.fillRect(Math.cos(ang) * 22 - 3, Math.sin(ang) * 22 - 3, 8, 8);
      }
      ctx.restore();

    } else if (cat === 'adsa') {
      // 🌳 Growing BST / AVL Tree
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;

      const rootX = w / 2, rootY = 15;
      const leftX = w / 2 - 35, leftY = 45;
      const rightX = w / 2 + 35, rightY = 45;

      ctx.beginPath();
      ctx.moveTo(rootX, rootY);
      ctx.lineTo(leftX, leftY);
      ctx.moveTo(rootX, rootY);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();

      const pulse = Math.abs(Math.sin(frame * 0.05)) * 3;
      [
        { x: rootX, y: rootY },
        { x: leftX, y: leftY },
        { x: rightX, y: rightY }
      ].forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 7 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#8b5cf6';
        ctx.fill();
      });

    } else if (cat === 'dbms') {
      // 🗄️ Database Cylinder with Data Packets
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;

      // Cylinder top & bottom
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2 - 15, 30, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(w / 2, h / 2 + 15, 30, 10, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Data packet flow
      const packetY = h / 2 - 15 + ((frame * 2) % 30);
      ctx.beginPath();
      ctx.arc(w / 2, packetY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

    } else {
      // ⭐ All Categories particle wave
      for (let i = 0; i < 5; i++) {
        const px = (frame * 2 + i * 40) % w;
        const py = h / 2 + Math.sin(frame * 0.05 + i) * 12;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 === 0 ? '#8b5cf6' : '#06b6d4';
        ctx.fill();
      }
    }

    subjectAnimFrame = requestAnimationFrame(animate);
  }
  animate();
}

// ---------------- Category Switcher ----------------
function switchCategory(cat) {
  activeCategory = cat;

  // Update chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === cat);
  });

  // Stage details update
  const stages = {
    all: { icon: '⭐', title: 'All Files & Folders', desc: 'Browse all programming code, lab records, notes and project folders.' },
    python: { icon: '🐍', title: 'Python Programs', desc: 'Lab programs, logic problems, algorithms, and scripts.' },
    java: { icon: '☕', title: 'Java Projects', desc: 'Object Oriented Programming, Multithreading, and Data Structures in Java.' },
    c: { icon: '🔷', title: 'C Programming', desc: 'Core C lab exercises, pointers, matrix operations, and algorithms.' },
    cpp: { icon: '⚙️', title: 'C++ Programs', desc: 'OOPs concepts, template classes, STL, and C++ algorithms.' },
    adsa: { icon: '🌳', title: 'Advanced Data Structures (ADSA)', desc: 'AVL Trees, Graphs, Hash Tables, and Red-Black Tree implementations.' },
    dbms: { icon: '🗄️', title: 'Database Management Systems (DBMS)', desc: 'SQL DDL/DML queries, schema files, normalization, and joins.' },
    folders: { icon: '📁', title: 'Project Folders', desc: 'Multi-file student lab project directory structures.' },
    pinned: { icon: '📌', title: 'Pinned Highlights', desc: 'Important administrative releases and starred lab code.' }
  };

  const s = stages[cat] || stages.all;
  $('stageIcon').textContent = s.icon;
  $('stageTitle').textContent = s.title;
  $('stageDesc').textContent = s.desc;
  $('gridSectionTitle').textContent = `${s.title} (${lastFiles.length})`;

  renderSubjectAnimation(cat);
  loadFiles();
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => switchCategory(chip.dataset.category));
});

// ---------------- Search & Autocomplete ----------------
const searchInput = $('searchInput');
const searchClearBtn = $('searchClearBtn');
const suggestionsPanel = $('suggestionsPanel');

searchInput.addEventListener('focus', () => suggestionsPanel.classList.add('show'));
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) suggestionsPanel.classList.remove('show');
});

searchInput.addEventListener('input', e => {
  searchSearchQuery = e.target.value.trim();
  searchClearBtn.style.display = searchSearchQuery ? 'block' : 'none';
  
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(loadFiles, 250);
});

searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchSearchQuery = '';
  searchClearBtn.style.display = 'none';
  loadFiles();
});

async function loadSuggestions() {
  try {
    const res = await fetch('/api/files/suggestions');
    if (!res.ok) return;
    const data = await res.json();

    let html = '';
    if (data.trending?.length) {
      html += '<div class="suggestion-group-label">TRENDING SEARCHES</div>';
      data.trending.forEach(t => {
        html += `<div class="suggestion-item" data-q="${escapeHtml(t)}"><span>🔍 ${escapeHtml(t)}</span></div>`;
      });
    }
    if (data.recent?.length) {
      html += '<div class="suggestion-group-label">RECENTLY UPLOADED CODE</div>';
      data.recent.forEach(r => {
        html += `<div class="suggestion-item" data-q="${escapeHtml(r)}"><span>📄 ${escapeHtml(r)}</span></div>`;
      });
    }

    suggestionsPanel.innerHTML = html || '<div class="suggestion-group-label">Start typing to search...</div>';
    
    suggestionsPanel.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const q = item.dataset.q;
        searchInput.value = q;
        searchSearchQuery = q;
        searchClearBtn.style.display = 'block';
        suggestionsPanel.classList.remove('show');
        loadFiles();
      });
    });
  } catch { /* non-critical */ }
}

// ---------------- Load & Render Files ----------------
async function loadFiles() {
  try {
    const params = new URLSearchParams();
    if (searchSearchQuery) params.set('q', searchSearchQuery);
    if (activeCategory !== 'all') params.set('category', activeCategory);
    params.set('sort', $('sortSelect').value);

    const res = await fetch(`/api/files?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load');
    const files = await res.json();
    lastFiles = files;
    renderFiles(files);
    loadStats();
    loadSuggestions();
  } catch (err) {
    toast('Could not connect to server file index.', 'error');
  }
}

$('sortSelect').addEventListener('change', loadFiles);

function renderFiles(files) {
  const grid = $('fileGrid');
  const empty = $('emptyState');
  grid.innerHTML = '';

  if (!files || files.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const isAdmin = Boolean(adminToken);

  // Group items by batchId if present
  const folderBatches = new Map();
  const standaloneFiles = [];

  files.forEach(file => {
    if (file.batchId) {
      if (!folderBatches.has(file.batchId)) {
        folderBatches.set(file.batchId, []);
      }
      folderBatches.get(file.batchId).push(file);
    } else {
      standaloneFiles.push(file);
    }
  });

  // Render folder batch cards
  folderBatches.forEach((batchFiles, batchId) => {
    const topFolder = batchFiles[0].folderName || 'Uploaded Folder';
    const totalSize = batchFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const isPinned = batchFiles.some(f => f.pinned);
    const uploadDate = batchFiles[0].uploadDate;

    const card = document.createElement('div');
    card.className = `file-card ${isPinned ? 'pinned-card' : ''}`;

    let actionBtns = `
      <button class="card-btn" onclick="downloadFolder('${batchId}')">⬇ Download Zip</button>
      <button class="card-btn" onclick="toggleFolderDetails('${batchId}')">📁 View Files (${batchFiles.length})</button>
    `;

    if (isAdmin) {
      actionBtns += `
        ${isPinned ? `<button class="card-btn" onclick="togglePinFolder('${batchId}', false)">📌 Unpin</button>` : `<button class="card-btn" onclick="togglePinFolder('${batchId}', true)">📌 Pin</button>`}
        <button class="card-btn danger" onclick="deleteFolderBatch('${batchId}')">🗑️ Delete Folder</button>
      `;
    }

    const filesListHtml = batchFiles.map(f => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--card-border); font-size:0.82rem;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:65%;" title="${escapeHtml(f.relativePath || f.originalName)}">📄 ${escapeHtml(f.relativePath || f.originalName)}</span>
        <div>
          <button class="card-btn" style="padding:2px 6px; font-size:0.75rem;" onclick="previewFile('${f._id || f.id}')">👁 View</button>
          <button class="card-btn" style="padding:2px 6px; font-size:0.75rem;" onclick="downloadFile('${f._id || f.id}')">⬇</button>
        </div>
      </div>
    `).join('');

    card.innerHTML = `
      ${isPinned ? '<span class="pin-badge">📌</span>' : ''}
      <div>
        <div class="card-top">
          <div class="file-icon-box">📁</div>
          <div class="file-info">
            <h4 class="file-name">${escapeHtml(topFolder)}</h4>
            <div class="file-meta">
              <span>${batchFiles.length} file(s) · ${fmtSize(totalSize)}</span> · <span>${fmtDate(uploadDate)}</span>
            </div>
          </div>
        </div>
        <p class="file-desc">Folder containing ${batchFiles.length} file(s)</p>
        <div class="file-tags"><span class="tag-pill">#folder</span><span class="tag-pill">#zip</span></div>
        <div id="folder_files_${batchId}" style="display:none; margin-top:12px; background:var(--card); padding:10px; border-radius:10px; max-height:200px; overflow-y:auto;">
          ${filesListHtml}
        </div>
      </div>
      <div class="card-actions" style="margin-top:12px;">
        ${actionBtns}
      </div>
    `;

    grid.appendChild(card);
  });

  // Render standalone files
  standaloneFiles.forEach(file => {
    const ext = (file.extension || 'default').toLowerCase();
    const meta = ICONS[ext] || ICONS.default;

    const card = document.createElement('div');
    card.className = `file-card ${file.pinned ? 'pinned-card' : ''}`;

    let actionBtns = `
      <button class="card-btn" onclick="previewFile('${file._id || file.id}')">👁 View Code</button>
      <button class="card-btn" onclick="downloadFile('${file._id || file.id}')">⬇ Download</button>
    `;

    if (isAdmin) {
      actionBtns += `
        <button class="card-btn" onclick="openEditModal('${file._id || file.id}')">✏️ Edit</button>
        ${file.pinned ? `<button class="card-btn" onclick="togglePinFile('${file._id || file.id}', false)">📌 Unpin</button>` : `<button class="card-btn" onclick="togglePinFile('${file._id || file.id}', true)">📌 Pin</button>`}
        <button class="card-btn danger" onclick="confirmDeleteFile('${file._id || file.id}')">🗑️ Delete</button>
      `;
    }

    const tagsHtml = (file.tags || []).map(t => `<span class="tag-pill">#${escapeHtml(t)}</span>`).join('');

    card.innerHTML = `
      ${file.pinned ? '<span class="pin-badge">📌</span>' : ''}
      <div>
        <div class="card-top">
          <div class="file-icon-box">${meta.icon}</div>
          <div class="file-info">
            <h4 class="file-name">${escapeHtml(file.originalName)}</h4>
            <div class="file-meta">
              <span>${fmtSize(file.size)}</span> · <span>${fmtDate(file.uploadDate)}</span>
            </div>
          </div>
        </div>
        ${file.description ? `<p class="file-desc">${escapeHtml(file.description)}</p>` : ''}
        ${tagsHtml ? `<div class="file-tags">${tagsHtml}</div>` : ''}
      </div>
      <div class="card-actions">
        ${actionBtns}
      </div>
    `;

    grid.appendChild(card);
  });
}

function toggleFolderDetails(batchId) {
  const el = $(`folder_files_${batchId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function deleteFolderBatch(batchId) {
  if (!confirm('Are you sure you want to delete this entire folder and all its files?')) return;
  try {
    const res = await fetch(`/api/files/folder/${batchId}`, {
      method: 'DELETE',
      headers: jsonAuthHeaders()
    });
    if (!res.ok) throw new Error('Delete failed');
    toast('Folder deleted successfully.');
    loadFiles();
  } catch (err) {
    toast('Failed to delete folder.', 'error');
  }
}

async function togglePinFolder(batchId, pinned) {
  try {
    const files = lastFiles.filter(f => f.batchId === batchId);
    for (const f of files) {
      await fetch(`/api/files/${f._id || f.id}`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ pinned })
      });
    }
    toast(pinned ? 'Folder pinned to top! 📌' : 'Folder unpinned.');
    loadFiles();
  } catch (err) {
    toast('Failed to update folder pin status.', 'error');
  }
}

// ---------------- Stats ----------------
async function loadStats() {
  try {
    const res = await fetch('/api/files/stats');
    if (!res.ok) return;
    const s = await res.json();
    $('statsBar').innerHTML = `
      <div class="stat-card"><b>${s.totalFiles}</b><span>Total Files</span></div>
      <div class="stat-card"><b>${s.pinned}</b><span>Pinned Items</span></div>
      <div class="stat-card"><b>${s.totalDownloads}</b><span>Downloads</span></div>
      <div class="stat-card"><b>${fmtSize(s.storageUsed)}</b><span>Storage Used</span></div>
    `;
  } catch { /* non-critical */ }
}

// ---------------- File Downloads & Previews ----------------
function downloadFile(id) {
  window.open(`/api/files/${id}/download`, '_blank');
}

function downloadFolder(batchId) {
  window.open(`/api/files/folder/${batchId}/download`, '_blank');
}

async function previewFile(id) {
  try {
    const res = await fetch(`/api/files/${id}/preview`);
    if (!res.ok) throw new Error('Preview error');
    const data = await res.json();
    previewingFile = data.file;

    $('previewTitle').textContent = data.file.originalName;
    const ext = data.file.extension || 'default';
    $('previewFileIcon').textContent = (ICONS[ext] || ICONS.default).icon;

    const body = $('previewBody');
    const adminEditBtn = $('editContentBtn');

    if (adminToken && data.type === 'text') {
      adminEditBtn.style.display = 'inline-block';
      $('codeEditorTextarea').value = data.content || '';
    } else {
      adminEditBtn.style.display = 'none';
    }

    $('adminEditorSection').style.display = 'none';

    if (data.type === 'text') {
      body.innerHTML = `<pre><code class="language-${ext}">${escapeHtml(data.content)}</code></pre>`;
      hljs.highlightAll();
    } else if (data.type === 'image') {
      body.innerHTML = `<img src="${data.url}" style="max-width:100%; border-radius:12px; display:block; margin:0 auto;" />`;
    } else if (data.type === 'pdf') {
      body.innerHTML = `<iframe src="${data.url}" style="width:100%; height:450px; border:none; border-radius:12px;"></iframe>`;
    } else {
      body.innerHTML = `<p style="text-align:center; padding:30px;">Binary / Unsupported format. Please download to view on your system.</p>`;
    }

    openModal('previewModalOverlay');
  } catch (err) {
    toast('Could not load file preview.', 'error');
  }
}

$('copyCodeBtn').addEventListener('click', () => {
  const codeEl = document.querySelector('#previewBody code') || document.querySelector('#previewBody');
  if (codeEl) {
    navigator.clipboard.writeText(codeEl.textContent);
    toast('Code copied to clipboard! 📋');
  }
});

$('downloadPreviewBtn').addEventListener('click', () => {
  if (previewingFile) downloadFile(previewingFile._id || previewingFile.id);
});

$('editContentBtn').addEventListener('click', () => {
  $('adminEditorSection').style.display = 'block';
});

$('cancelEditContentBtn').addEventListener('click', () => {
  $('adminEditorSection').style.display = 'none';
});

$('saveContentBtn').addEventListener('click', async () => {
  if (!previewingFile) return;
  const content = $('codeEditorTextarea').value;
  try {
    const res = await fetch(`/api/files/${previewingFile._id || previewingFile.id}/content`, {
      method: 'PUT',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ content })
    });
    if (!res.ok) throw new Error('Save failed');
    toast('Code content updated successfully! 💾');
    closeModal('previewModalOverlay');
    loadFiles();
  } catch (err) {
    toast('Failed to save code content.', 'error');
  }
});

async function togglePinFile(id, pinned) {
  try {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ pinned })
    });
    if (!res.ok) throw new Error('Update failed');
    toast(pinned ? 'File pinned to top! 📌' : 'File unpinned.');
    loadFiles();
  } catch (err) {
    toast('Failed to update pin status.', 'error');
  }
}

// ---------------- Admin Auth & PPSK Lockout ----------------
let lockoutTimerInterval = null;

function startLockoutTimer(seconds) {
  if (lockoutTimerInterval) clearInterval(lockoutTimerInterval);
  
  let remaining = seconds;
  const pwdInput = $('adminPasswordInput');
  const submitBtn = $('loginSubmitBtn');
  const msgEl = $('loginMessage');
  const modalHeading = $('loginModalHeading');
  const modalIcon = $('loginModalIcon');

  pwdInput.disabled = true;
  pwdInput.classList.add('input-error');
  submitBtn.disabled = true;
  
  if (modalIcon) modalIcon.textContent = '😂';
  if (modalHeading) modalHeading.textContent = '😂 Nice Try!';

  function updateDisplay() {
    submitBtn.textContent = `Locked (${remaining}s)`;
    msgEl.textContent = `😂 Nice Try!\nProtected by PSK.\nTry again in ${remaining}s...`;
    msgEl.className = 'login-message error';
  }

  updateDisplay();

  lockoutTimerInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(lockoutTimerInterval);
      lockoutTimerInterval = null;
      pwdInput.disabled = false;
      pwdInput.value = '';
      pwdInput.classList.remove('input-error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
      msgEl.textContent = '';
      msgEl.className = 'login-message';
      if (modalIcon) modalIcon.textContent = '🔐';
      if (modalHeading) modalHeading.textContent = 'Admin Login';
    } else {
      updateDisplay();
    }
  }, 1000);
}

function updateSessionBadge() {
  const isAdmin = Boolean(adminToken);
  $('sessionBadge').textContent = isAdmin ? 'Welcome Admin' : 'Welcome Anonymous';
  $('adminLoginBtn').textContent = isAdmin ? '⚡ Admin Dashboard' : 'Admin Login';

  document.querySelectorAll('.admin-only-inline').forEach(el => {
    el.style.display = isAdmin ? 'inline-block' : 'none';
  });
  document.querySelectorAll('.admin-only-flex').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
  document.querySelectorAll('.admin-only-block').forEach(el => {
    el.style.display = isAdmin ? 'block' : 'none';
  });

  renderFiles(lastFiles);
  if (isAdmin) checkPendingRequests();
}

$('adminLoginBtn').addEventListener('click', () => {
  if (adminToken) {
    openModal('dashboardModalOverlay');
  } else {
    openModal('loginModalOverlay');
  }
});

$('loginSubmitBtn').addEventListener('click', handleAdminLogin);
$('adminPasswordInput').addEventListener('keyup', e => {
  if (e.key === 'Enter') handleAdminLogin();
});

async function handleAdminLogin() {
  if (lockoutTimerInterval) return;

  const pwdInput = $('adminPasswordInput');
  const password = pwdInput.value;
  const msgEl = $('loginMessage');
  const loginBox = $('loginBox');
  msgEl.textContent = '';
  msgEl.className = 'login-message';
  pwdInput.classList.remove('input-error');

  if (!password) {
    pwdInput.classList.add('input-error');
    msgEl.textContent = "❌ Wrong Password\nProtected by PSK.";
    msgEl.className = 'login-message error';
    loginBox.classList.add('shake');
    setTimeout(() => loginBox.classList.remove('shake'), 500);
    return;
  }

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await res.json();

    if (!res.ok) {
      loginBox.classList.add('shake');
      setTimeout(() => loginBox.classList.remove('shake'), 500);
      pwdInput.classList.add('input-error');

      if (res.status === 429 || data.error === 'locked') {
        const secs = data.retryAfter || 30;
        startLockoutTimer(secs);
        toast('😂 Nice Try. Protected by PSK Lockout Active!', 'warning');
      } else {
        msgEl.textContent = "❌ Wrong Password\nProtected by PSK.";
        msgEl.className = 'login-message error';
        toast('❌ Wrong Password. Protected by PSK.', 'error');
      }
      return;
    }

    // Success
    pwdInput.classList.remove('input-error');
    adminToken = data.token;
    localStorage.setItem('zipshare_token', adminToken);
    toast('Login successful! Welcome Admin 🚀');
    closeModal('loginModalOverlay');
    pwdInput.value = '';
    updateSessionBadge();
    
    // Redirect to Admin Dashboard
    openModal('dashboardModalOverlay');
  } catch (err) {
    toast('Server authentication error.', 'error');
  }
}

function setupDashboardBindings() {
  const navDash = $('navDashboardBtn');
  if (navDash) {
    navDash.addEventListener('click', () => {
      if (!adminToken) {
        openModal('loginModalOverlay');
      } else {
        openModal('dashboardModalOverlay');
      }
    });
  }

  const openReqs = $('dashOpenRequestsBtn');
  if (openReqs) {
    openReqs.addEventListener('click', () => {
      closeModal('dashboardModalOverlay');
      loadAdminRequestsList();
      openModal('requestsModalOverlay');
    });
  }

  const managePinned = $('dashManagePinnedBtn');
  if (managePinned) {
    managePinned.addEventListener('click', () => {
      closeModal('dashboardModalOverlay');
      switchCategory('pinned');
    });
  }

  const dashLogout = $('dashLogoutBtn');
  if (dashLogout) {
    dashLogout.addEventListener('click', () => {
      closeModal('dashboardModalOverlay');
      adminToken = null;
      localStorage.removeItem('zipshare_token');
      toast('Admin logged out.');
      updateSessionBadge();
    });
  }

  const dashFileInput = $('dashFileInput');
  const dashFolderInput = $('dashFolderInput');
  if (dashFileInput) {
    dashFileInput.addEventListener('change', () => {
      closeModal('dashboardModalOverlay');
      handleUpload(dashFileInput.files, []);
    });
  }
  if (dashFolderInput) {
    dashFolderInput.addEventListener('change', () => {
      closeModal('dashboardModalOverlay');
      const files = dashFolderInput.files;
      const paths = Array.from(files).map(f => f.webkitRelativePath || f.name);
      handleUpload(files, paths);
    });
  }
}

// ---------------- Upload Handlers ----------------
function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');

    if (adminToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${adminToken}`);
    }

    let toastEl = document.querySelector('.toast.upload-toast');
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast warning upload-toast';
      const container = $('toastContainer') || document.body;
      container.appendChild(toastEl);
    }
    toastEl.textContent = 'Uploading... 0%';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        toastEl.textContent = `Uploading... ${percent}%`;
      }
    };

    xhr.onload = () => {
      toastEl.remove();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (e) {
          reject(new Error('Invalid response from server'));
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      toastEl.remove();
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

function setupUploads() {
  const fileInput = $('fileInput');
  const folderInput = $('folderInput');

  if (fileInput) fileInput.addEventListener('change', () => handleUpload(fileInput.files, []));
  if (folderInput) folderInput.addEventListener('change', () => {
    const files = folderInput.files;
    const paths = Array.from(files).map(f => f.webkitRelativePath || f.name);
    handleUpload(files, paths);
  });
}

async function handleUpload(fileList, pathsList = []) {
  if (!fileList || fileList.length === 0) return;

  if (!adminToken) {
    toast('Admin authorization required to upload files or folders.', 'warning');
    openModal('loginModalOverlay');
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const relPath = (pathsList && pathsList[i]) ? pathsList[i] : (file.webkitRelativePath || file.name);
    formData.append('files', file);
    formData.append('paths', relPath);
  }

  try {
    const data = await uploadWithProgress(formData);
    toast(`Successfully uploaded ${data.files ? data.files.length : fileList.length} item(s)! 🚀`);
    loadFiles();
  } catch (err) {
    toast(err.message || 'Upload failed. Please check file sizes.', 'error');
  }
}

// ---------------- User Request System ----------------
$('programRequestForm').addEventListener('submit', async e => {
  e.preventDefault();
  const programName = $('reqProgramName').value;
  const subject = $('reqSubject').value;
  const description = $('reqDescription').value;

  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ programName, subject, description })
    });

    if (!res.ok) throw new Error('Submission failed');
    toast('Program request submitted to administrator! 💡');
    $('programRequestForm').reset();
  } catch (err) {
    toast('Could not submit request.', 'error');
  }
});

async function checkPendingRequests() {
  if (!adminToken) return;
  try {
    const res = await fetch('/api/requests', { headers: authHeaders() });
    if (!res.ok) return;
    const requests = await res.json();
    const badge = $('requestBadgeCount');
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch { /* non-critical */ }
}

$('navRequestsBtn').addEventListener('click', async () => {
  if (!adminToken) {
    toast('Program requests management requires Admin login.', 'warning');
    openModal('loginModalOverlay');
    return;
  }
  loadAdminRequestsList();
  openModal('requestsModalOverlay');
});

async function loadAdminRequestsList() {
  const container = $('requestsListContainer');
  try {
    const res = await fetch('/api/requests', { headers: authHeaders() });
    if (!res.ok) throw new Error('Load failed');
    const requests = await res.json();

    if (!requests || requests.length === 0) {
      container.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-dim);">No requests submitted yet.</p>';
      return;
    }

    container.innerHTML = requests.map(r => `
      <div class="request-item">
        <div class="request-item-top">
          <span class="request-item-title">${escapeHtml(r.programName)} (${escapeHtml(r.subject)})</span>
          <span class="request-status-badge status-${r.status}">${r.status}</span>
        </div>
        ${r.description ? `<p style="font-size:0.85rem; color:var(--text-dim); margin:4px 0 10px;">${escapeHtml(r.description)}</p>` : ''}
        <div class="card-actions">
          <button class="card-btn" onclick="updateRequestStatus('${r._id || r.id}', 'approved')">Approve</button>
          <button class="card-btn" onclick="updateRequestStatus('${r._id || r.id}', 'completed')">Mark Completed</button>
          <button class="card-btn danger" onclick="deleteUserRequest('${r._id || r.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<p style="color:var(--danger); text-align:center;">Failed to load requests.</p>';
  }
}

async function updateRequestStatus(id, status) {
  try {
    const res = await fetch(`/api/requests/${id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Update failed');
    toast(`Request status marked as ${status}.`);
    loadAdminRequestsList();
    checkPendingRequests();
  } catch (err) {
    toast('Failed to update request.', 'error');
  }
}

async function deleteUserRequest(id) {
  try {
    const res = await fetch(`/api/requests/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Delete failed');
    toast('Request deleted.');
    loadAdminRequestsList();
    checkPendingRequests();
  } catch (err) {
    toast('Failed to delete request.', 'error');
  }
}

// ---------------- Admin Edit Details & Delete File ----------------
function openEditModal(id) {
  editingFileId = id;
  const file = lastFiles.find(f => (f._id || f.id) === id);
  if (!file) return;

  $('editNameInput').value = file.originalName || '';
  $('editCategorySelect').value = file.category || 'all';
  $('editDescInput').value = file.description || '';
  $('editTagsInput').value = (file.tags || []).join(', ');
  $('editPinnedCheck').checked = Boolean(file.pinned);

  openModal('editModalOverlay');
}

$('editSaveBtn').addEventListener('click', async () => {
  if (!editingFileId) return;

  const payload = {
    originalName: $('editNameInput').value,
    category: $('editCategorySelect').value,
    description: $('editDescInput').value,
    tags: $('editTagsInput').value.split(',').map(t => t.trim()).filter(Boolean),
    pinned: $('editPinnedCheck').checked
  };

  try {
    const res = await fetch(`/api/files/${editingFileId}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Update failed');
    toast('File details updated successfully!');
    closeModal('editModalOverlay');
    loadFiles();
  } catch (err) {
    toast('Failed to update file details.', 'error');
  }
});

function confirmDeleteFile(id) {
  pendingDeleteId = id;
  openModal('deleteModalOverlay');
}

$('deleteCancelBtn').addEventListener('click', () => closeModal('deleteModalOverlay'));
$('deleteConfirmBtn').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  try {
    const res = await fetch(`/api/files/${pendingDeleteId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Delete error');
    toast('File deleted successfully.');
    closeModal('deleteModalOverlay');
    loadFiles();
  } catch (err) {
    toast('Failed to delete file.', 'error');
  }
});

// Modal close bindings
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.close;
    if (target) closeModal(target);
  });
});

$('navAboutBtn').addEventListener('click', () => openModal('aboutModalOverlay'));
$('navHomeBtn').addEventListener('click', () => switchCategory('all'));
$('navRecentBtn').addEventListener('click', () => {
  $('sortSelect').value = 'recent';
  loadFiles();
});
$('navPinnedBtn').addEventListener('click', () => switchCategory('pinned'));

// Global Init
window.addEventListener('DOMContentLoaded', () => {
  initIntro();
  initParticles();
  setupUploads();
  setupDashboardBindings();
  updateSessionBadge();
  renderSubjectAnimation('all');
  loadFiles();
});
