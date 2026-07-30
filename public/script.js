// ---------------- State & Constants ----------------
let adminToken = localStorage.getItem('zipshare_token') || null;
let currentFilter = 'all';
let currentSubjectFilter = localStorage.getItem('zipshare_selected_subject') || localStorage.getItem('srkr_selected_subject') || null;
let currentSearch = '';
let searchDebounce = null;
let lastFiles = [];
let typingTimeout = null;
let mouseIdleTimer = null;

const EXECUTABLE_EXTENSIONS = new Set([
  'c', 'cpp', 'cc', 'cxx', 'java', 'py', 'js', 'ts',
  'go', 'rs', 'cs', 'kt', 'kts', 'php', 'rb', 'swift', 'scala', 'sql'
]);

const ICONS = {
  java: { icon: '☕', color: '#f89820' }, py: { icon: '🐍', color: '#3776ab' },
  c: { icon: '⚡', color: '#5c6bc0' }, cpp: { icon: '🚀', color: '#00599c' },
  sql: { icon: '🗄️', color: '#00758f' }, html: { icon: '🌐', color: '#e34c26' },
  css: { icon: '🎨', color: '#264de4' }, js: { icon: '📜', color: '#f0db4f' },
  json: { icon: '🧾', color: '#8bc34a' }, pdf: { icon: '📕', color: '#e53935' },
  docx: { icon: '📄', color: '#2b579a' }, ppt: { icon: '📊', color: '#d24726' },
  zip: { icon: '🗜️', color: '#a67c52' }, rar: { icon: '🗜️', color: '#a67c52' },
  png: { icon: '🖼️', color: '#66bb6a' }, jpg: { icon: '🖼️', color: '#66bb6a' },
  jpeg: { icon: '🖼️', color: '#66bb6a' }, mp4: { icon: '🎬', color: '#ab47bc' },
  txt: { icon: '📝', color: '#90a4ae' }, md: { icon: '📝', color: '#90a4ae' },
  folder: { icon: '📁', color: '#facc15' }, default: { icon: '📦', color: '#78909c' }
};

// ---------------- Helper Functions ----------------
function $(id) { return document.getElementById(id); }

function getCleanName(pathOrName) {
  if (!pathOrName) return 'Untitled';
  const clean = pathOrName.replace(/\\/g, '/');
  return clean.split('/').pop() || clean;
}

function getCleanTitle(pathOrName) {
  if (!pathOrName) return 'Untitled Program';
  const clean = pathOrName.replace(/\\/g, '/');
  const baseName = clean.split('/').pop() || clean;
  // strip extension
  const dotIndex = baseName.lastIndexOf('.');
  const nameWithoutExt = dotIndex > 0 ? baseName.slice(0, dotIndex) : baseName;
  
  // replace underscores and hyphens with spaces
  let spaced = nameWithoutExt.replace(/[_-]+/g, ' ');
  // insert space before capital letters if camelCase
  spaced = spaced.replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Capitalize words
  return spaced.split(' ').map(w => w ? (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) : '').join(' ').trim() || baseName;
}

function fmtSize(bytes) {
  if (!bytes) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function toast(message, type = 'success') {
  const container = $('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function openModal(id) {
  const el = $(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = $(id);
  if (el) el.classList.remove('show');
}

function authHeaders() {
  return adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function iconFor(ext, isFolder) {
  if (isFolder) return ICONS.folder;
  const cleanExt = (ext || '').toLowerCase().replace('.', '');
  return ICONS[cleanExt] || ICONS.default;
}

function isExecutableFile(file) {
  if (!file) return false;
  if (file.batchId || file.folderName) return false; // Folders must NEVER display Run Online
  if (!file.extension) return false;
  return EXECUTABLE_EXTENSIONS.has(file.extension.toLowerCase());
}

function monacoLanguageFor(ext) {
  const map = {
    c: 'cpp', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    java: 'java', py: 'python', js: 'javascript', ts: 'typescript',
    go: 'go', rs: 'rust', cs: 'csharp', kt: 'kotlin', kts: 'kotlin',
    php: 'php', rb: 'ruby', swift: 'swift', scala: 'scala', sql: 'sql'
  };
  return map[(ext || '').toLowerCase()] || 'plaintext';
}

// ---------------- PART 12: PARTICLE CANVAS ----------------
function initParticleCanvas() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = Array.from({ length: 35 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    radius: Math.random() * 2.5 + 1,
    alpha: Math.random() * 0.5 + 0.2
  }));

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const color = isDark ? '139, 92, 246' : '124, 58, 237';

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color}, ${p.alpha})`;
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p.x - p2.x;
        const dy = p.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${color}, ${0.15 * (1 - dist / 110)})`;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ---------------- PART 6: ANIMATED CUTE MASCOT WITH EXPRESSIONS ----------------
let currentMascotMood = 'normal';

function setMascotMood(mood, labelText) {
  currentMascotMood = mood;
  const moodLabel = $('mascotMoodLabel');
  const mascotFace = $('mascotFace');
  const smilePath = $('mascotSmile');

  if (moodLabel && labelText) {
    moodLabel.textContent = labelText;
  }

  if (smilePath) {
    if (mood === 'happy' || mood === 'excited') {
      smilePath.setAttribute('d', 'M 5,2 Q 25,20 45,2');
    } else if (mood === 'sad') {
      smilePath.setAttribute('d', 'M 5,14 Q 25,2 45,14');
    } else if (mood === 'surprised') {
      smilePath.setAttribute('d', 'M 18,8 Q 25,16 32,8 Q 25,0 18,8');
    } else {
      smilePath.setAttribute('d', 'M 5,3 Q 25,15 45,3');
    }
  }

  if (mascotFace) {
    mascotFace.style.borderColor = mood === 'excited' ? 'var(--accent-2)' : 'var(--card-border)';
  }
}

function initMascot() {
  const leftPupil = $('leftPupil');
  const rightPupil = $('rightPupil');
  const mascotContainer = $('mascotContainer');

  if (!leftPupil || !rightPupil) return;

  function updateEyes(clientX, clientY) {
    [leftPupil, rightPupil].forEach(pupil => {
      const rect = pupil.parentElement.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;

      const angle = Math.atan2(clientY - eyeCenterY, clientX - eyeCenterX);
      const dist = Math.min(Math.hypot(clientX - eyeCenterX, clientY - eyeCenterY) / 12, 5);

      const offsetX = Math.cos(angle) * dist;
      const offsetY = Math.sin(angle) * dist;

      pupil.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    // Reset sleep timer on mouse activity
    resetSleepTimer();
  }

  function resetSleepTimer() {
    clearTimeout(mouseIdleTimer);
    if (currentMascotMood === 'sleepy') {
      setMascotMood('normal', 'ZipShare Robo Companion 🤖');
      document.querySelectorAll('.eye').forEach(e => e.style.transform = 'scaleY(1)');
    }
    mouseIdleTimer = setTimeout(() => {
      setMascotMood('sleepy', 'ZipShare Robo Zzz... 💤');
      document.querySelectorAll('.eye').forEach(e => e.style.transform = 'scaleY(0.3)');
    }, 12000);
  }

  document.addEventListener('mousemove', e => updateEyes(e.clientX, e.clientY));
  document.addEventListener('touchmove', e => {
    if (e.touches[0]) updateEyes(e.touches[0].clientX, e.touches[0].clientY);
  });

  // Wink / Click Interaction
  if (mascotContainer) {
    mascotContainer.addEventListener('click', () => {
      const leftEye = document.querySelector('.left-eye');
      if (leftEye) {
        leftEye.classList.add('wink');
        setMascotMood('happy', 'Hi Friend! Happy Coding! ✨');
        setTimeout(() => {
          leftEye.classList.remove('wink');
          setMascotMood('normal', 'ZipShare Robo Companion 🤖');
        }, 1200);
      }
      toast('ZipShare Robo says hello! 🤖✨', 'success');
    });
  }

  // Interactive Target Hovering for Mascot
  const hoverTargets = [
    { sel: '#searchInput', mood: 'surprised', label: 'Robo watching you search... 🔍' },
    { sel: '#uploadBtn', mood: 'excited', label: 'Upload your programs! ⬆' },
    { sel: '#uploadFolderBtn', mood: 'excited', label: 'Upload whole code folder! 📁' },
    { sel: '#btnRunCode', mood: 'excited', label: 'Ready to execute online! 🚀' }
  ];

  hoverTargets.forEach(t => {
    const el = document.querySelector(t.sel);
    if (el) {
      el.addEventListener('mouseenter', () => setMascotMood(t.mood, t.label));
      el.addEventListener('mouseleave', () => setMascotMood('normal', 'ZipShare Robo Companion 🤖'));
    }
  });

  resetSleepTimer();
}

// ---------------- PART 5: 4-STEP ONBOARDING EXPERIENCE ----------------
let currentOnboardStep = 1;

function showOnboardStep(step) {
  currentOnboardStep = step;

  // Update step contents visibility
  [1, 2, 3, 4].forEach(s => {
    const el = $(`onboardStep${s}`);
    if (el) el.style.display = s === step ? 'block' : 'none';
  });

  // Update stepper dots
  document.querySelectorAll('.onboarding-stepper .step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.toggle('active', s === step);
  });

  // Step specific actions
  if (step === 1) {
    startWelcomeTyping();
  } else if (step === 4) {
    setMascotMood('happy', 'All Set! Let\'s Launch ZipShare! 🎉');
  }
}

function startWelcomeTyping() {
  const target = $('welcomeTypingText');
  if (!target) return;

  const phrase = "Welcome to ZipShare Student Hub! Your executable programming companion for Java, Python, C, C++, and SQL.";
  target.textContent = "";
  let i = 0;

  clearTimeout(typingTimeout);
  function typeChar() {
    if (i < phrase.length) {
      target.textContent += phrase.charAt(i);
      i++;
      typingTimeout = setTimeout(typeChar, 30);
    }
  }
  typeChar();
}

function initOnboarding() {
  const overlay = $('startupModalOverlay');
  const visited = localStorage.getItem('zipshare_visited') || localStorage.getItem('srkr_visited');

  if (!visited && overlay) {
    overlay.classList.remove('hidden');
    showOnboardStep(1);
  } else if (overlay) {
    overlay.classList.add('hidden');
  }

  // Next / Back buttons
  const btnNext1 = $('btnNextStep1');
  if (btnNext1) btnNext1.addEventListener('click', () => showOnboardStep(2));

  const btnBack2 = $('btnBackStep2');
  if (btnBack2) btnBack2.addEventListener('click', () => showOnboardStep(1));

  const btnNext2 = $('btnNextStep2');
  if (btnNext2) btnNext2.addEventListener('click', () => showOnboardStep(3));

  const btnBack3 = $('btnBackStep3');
  if (btnBack3) btnBack3.addEventListener('click', () => showOnboardStep(2));

  const btnNext3 = $('btnNextStep3');
  if (btnNext3) btnNext3.addEventListener('click', () => showOnboardStep(4));

  const btnBack4 = $('btnBackStep4');
  if (btnBack4) btnBack4.addEventListener('click', () => showOnboardStep(3));

  // Enter Portal Button
  const btnEnter = $('btnEnterPortal');
  if (btnEnter) {
    btnEnter.addEventListener('click', () => {
      localStorage.setItem('zipshare_visited', 'true');
      if (overlay) overlay.classList.add('hidden');
      if (currentSubjectFilter) {
        setSubjectFilter(currentSubjectFilter);
      } else {
        loadFiles();
      }
      toast('Welcome to ZipShare Student Hub! 🚀', 'success');
      setMascotMood('happy', 'Enjoy your programming hub! 💻');
    });
  }

  // Stepper dots click
  document.querySelectorAll('.onboarding-stepper .step-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step);
      showOnboardStep(step);
    });
  });

  // Reopen onboarding from navbar mascot button
  const mascotReopenBtn = $('mascotReopenBtn');
  if (mascotReopenBtn) {
    mascotReopenBtn.addEventListener('click', () => {
      if (overlay) {
        overlay.classList.remove('hidden');
        showOnboardStep(1);
      }
    });
  }

  // Theme cards in onboarding
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      applyTheme(card.dataset.setTheme);
    });
  });

  // Subject cards in onboarding
  document.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.subject-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentSubjectFilter = card.dataset.subject;
      localStorage.setItem('zipshare_selected_subject', currentSubjectFilter);
    });
  });
}

// ---------------- Theme Management ----------------
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  $('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('zipshare_theme', theme);

  if (monacoEditorInstance && window.monaco) {
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('zipshare_theme') || 'dark';
  applyTheme(savedTheme);
}

$('themeToggle').addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(current);
});

document.addEventListener('mousemove', e => {
  const glow = $('glowCursor');
  if (glow) {
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
  }
});

// ---------------- Session & Badges ----------------
function refreshSessionBadge() {
  const badge = $('sessionBadge');
  if (badge) badge.textContent = adminToken ? 'Welcome Admin' : 'Welcome Student';
  const loginBtn = $('adminLoginBtn');
  if (loginBtn) loginBtn.textContent = adminToken ? 'Admin Logout' : 'Admin Login';
  updateWelcomeCapsule();
  renderFiles(lastFiles || []);
}

// ---------------- Stats Bar ----------------
async function loadStats() {
  try {
    const res = await fetch('/api/files/stats');
    const s = await res.json();
    $('statsBar').innerHTML = `
      <div class="stat-card"><b>${s.totalFiles}</b><span>Total Programs</span></div>
      <div class="stat-card"><b>${s.todayUploads}</b><span>Today's Uploads</span></div>
      <div class="stat-card"><b>${s.pinned}</b><span>Pinned Items</span></div>
      <div class="stat-card"><b>${s.totalDownloads}</b><span>Downloads</span></div>
      <div class="stat-card"><b>${fmtSize(s.storageUsed)}</b><span>Storage Used</span></div>
    `;
  } catch { /* stats non-critical */ }
}

// ---------------- Search & Suggestions ----------------
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

$('searchInput').addEventListener('focus', () => $('suggestionsPanel').classList.add('show'));
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) $('suggestionsPanel').classList.remove('show');
});
$('searchInput').addEventListener('input', e => {
  currentSearch = e.target.value;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadFiles, 300);
});

// ---------------- PART 8: LAB EXPLORER SIDEBAR ----------------
function initLabExplorer() {
  const sidebar = $('labExplorerSidebar');
  const toggleBtn = $('btnToggleSidebar');
  const mobileOpenBtn = $('btnMobileSidebarOpen');
  const explorerSearch = $('explorerSearchInput');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
    });
  }

  if (mobileOpenBtn && sidebar) {
    mobileOpenBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  if (explorerSearch) {
    explorerSearch.addEventListener('input', e => {
      const term = e.target.value.toLowerCase();
      document.querySelectorAll('.tree-file-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(term) ? 'flex' : 'none';
      });
    });
  }
}

function renderExplorerTree(files) {
  const container = $('explorerTree');
  if (!container) return;

  const subjectsMap = {};

  files.forEach(f => {
    const subj = f.subject || 'General / Other';
    const ex = f.exercise || 'Main Programs';

    if (!subjectsMap[subj]) subjectsMap[subj] = {};
    if (!subjectsMap[subj][ex]) subjectsMap[subj][ex] = [];

    subjectsMap[subj][ex].push(f);
  });

  let html = '';

  for (const [subjName, exercises] of Object.entries(subjectsMap)) {
    let exHtml = '';
    for (const [exName, exFiles] of Object.entries(exercises)) {
      const filesList = exFiles.map(file => {
        const cleanName = getCleanName(file.originalName);
        const meta = iconFor(file.extension, !!file.batchId);
        return `
          <div class="tree-file-item" data-id="${file._id}" data-name="${escapeHtml(cleanName)}">
            <span style="color:${meta.color}">${meta.icon}</span>
            <span>${escapeHtml(cleanName)}</span>
          </div>
        `;
      }).join('');

      exHtml += `
        <div class="tree-exercise-node expanded">
          <div class="tree-exercise-header">
            <span>📁</span>
            <span>${escapeHtml(exName)}</span>
          </div>
          <div class="tree-exercise-children">${filesList}</div>
        </div>
      `;
    }

    html += `
      <div class="tree-subject-node expanded">
        <div class="tree-subject-header" data-subject="${escapeHtml(subjName)}">
          <span class="arrow">▶</span>
          <span>📚 ${escapeHtml(subjName)}</span>
        </div>
        <div class="tree-children">${exHtml}</div>
      </div>
    `;
  }

  container.innerHTML = html || '<div style="padding:10px;color:var(--text-dim);font-size:0.8rem;">No subjects loaded</div>';

  // Attach tree handlers
  container.querySelectorAll('.tree-subject-header').forEach(header => {
    header.addEventListener('click', e => {
      e.stopPropagation();
      const node = header.closest('.tree-subject-node');
      node.classList.toggle('expanded');
    });
  });

  container.querySelectorAll('.tree-exercise-header').forEach(header => {
    header.addEventListener('click', e => {
      e.stopPropagation();
      const node = header.closest('.tree-exercise-node');
      node.classList.toggle('expanded');
    });
  });

  container.querySelectorAll('.tree-file-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.tree-file-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const fileId = item.dataset.id;
      const file = lastFiles.find(f => f._id === fileId);
      if (file) {
        openSolutionModal(file);
      }
    });
  });
}

// ---------------- Subject & Filter Handlers ----------------
function setSubjectFilter(subject) {
  currentSubjectFilter = subject;
  localStorage.setItem('zipshare_selected_subject', subject);

  const banner = $('activeFilterBanner');
  const bannerText = $('activeFilterText');
  if (banner && bannerText) {
    bannerText.textContent = `Filtered by Subject: ${subject}`;
    banner.style.display = 'flex';
  }
  loadFiles();
}

function clearSubjectFilter() {
  currentSubjectFilter = null;
  localStorage.removeItem('zipshare_selected_subject');
  const banner = $('activeFilterBanner');
  if (banner) banner.style.display = 'none';
  loadFiles();
}

const btnClearFilter = $('btnClearActiveFilter');
if (btnClearFilter) btnClearFilter.addEventListener('click', clearSubjectFilter);

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    loadFiles();
  });
});

// ---------------- File List & Data Rendering ----------------
async function loadFiles() {
  try {
    const params = new URLSearchParams();
    if (currentSearch) params.set('q', currentSearch);
    if (currentFilter && currentFilter !== 'all') params.set('filter', currentFilter);
    if (currentSubjectFilter) params.set('subject', currentSubjectFilter);

    const res = await fetch(`/api/files?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch files');
    const files = await res.json();
    lastFiles = files;

    renderFiles(files);
    renderExplorerTree(files);

    if (currentSearch) loadSuggestions();
  } catch (err) {
    toast('Could not load program files.', 'error');
  }
}

function renderFiles(files) {
  const grid = $('fileGrid');
  const pinnedGrid = $('pinnedFileGrid');
  const pinnedSection = $('pinnedSection');
  const empty = $('emptyState');

  const pinnedCards = [];
  const normalCards = [];

  const seenBatches = new Set();

  for (const f of files) {
    if (f.batchId) {
      if (seenBatches.has(f.batchId)) continue;
      seenBatches.add(f.batchId);
      const folderFiles = files.filter(x => x.batchId === f.batchId);
      const folderCardHtml = renderFolderCard(f, folderFiles);

      if (f.pinned) pinnedCards.push(folderCardHtml);
      else normalCards.push(folderCardHtml);
    } else {
      const cardHtml = renderFileCard(f);
      if (f.pinned) pinnedCards.push(cardHtml);
      else normalCards.push(cardHtml);
    }
  }

  if (pinnedCards.length > 0) {
    pinnedSection.style.display = 'block';
    pinnedGrid.innerHTML = pinnedCards.join('');
  } else {
    pinnedSection.style.display = 'none';
  }

  grid.innerHTML = normalCards.join('');
  empty.style.display = (pinnedCards.length + normalCards.length) ? 'none' : 'block';

  attachCardHandlers();
}

function renderFolderCard(f, folderFiles) {
  const meta = iconFor(null, true);
  const folderName = getCleanName(f.folderName || f.originalName);
  const totalFolderSize = folderFiles.reduce((sum, item) => sum + (item.size || 0), 0);

  const programListHtml = folderFiles.map(file => {
    const cleanTitle = getCleanTitle(file.originalName);
    const cleanName = getCleanName(file.originalName);
    const itemMeta = iconFor(file.extension, false);
    const runBtn = isExecutableFile(file) ? `
      <button class="btn-run" data-id="${file._id}" data-name="${escapeHtml(cleanName)}">▶ Run Online</button>` : '';

    return `
      <div class="folder-program-item">
        <div class="prog-item-left">
          <span class="prog-icon" style="color:${itemMeta.color}">${itemMeta.icon}</span>
          <div>
            <div class="prog-clean-name">${escapeHtml(cleanTitle)}</div>
            <div class="prog-meta-sub">${fmtSize(file.size)} • ${fmtDate(file.uploadDate)}</div>
          </div>
        </div>
        <div class="prog-item-actions">
          ${runBtn}
          <button class="btn-solution" data-id="${file._id}">💡 Solution</button>
          <button class="btn-download" data-id="${file._id}">⬇ Download</button>
        </div>
      </div>
    `;
  }).join('');

  const adminFolderButtons = adminToken ? `
    <button class="btn-delete-folder upload-btn danger ghost" data-batch="${f.batchId || f.folderName}" data-name="${escapeHtml(folderName)}" data-count="${folderFiles.length}" data-size="${fmtSize(totalFolderSize)}">🗑️ Delete Folder</button>` : '';

  return `
    <div class="folder-expanded-section" data-batch="${f.batchId || f.folderName}">
      <div class="folder-expanded-header">
        <div class="folder-info-title">
          <span style="font-size:1.5rem;color:${meta.color}">${meta.icon}</span>
          <div>
            <h3>${escapeHtml(folderName)}</h3>
            <span class="badge-tag">${f.subject || 'Lab Folder'} • ${folderFiles.length} Programs • ${fmtSize(totalFolderSize)}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-download-folder upload-btn ghost" data-batch="${f.batchId || f.folderName}" data-name="${escapeHtml(folderName)}">⬇ Download Folder Zip</button>
          ${adminFolderButtons}
        </div>
      </div>
      <div class="folder-program-list">
        ${programListHtml}
      </div>
    </div>
  `;
}

function renderFileCard(f) {
  const cleanTitle = getCleanTitle(f.originalName);
  const cleanName = getCleanName(f.originalName);
  const meta = iconFor(f.extension, false);
  const tags = (f.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');

  const adminButtons = adminToken ? `
    <button class="btn-edit" data-id="${f._id}">✏️ Edit</button>
    <button class="btn-pin" data-id="${f._id}" data-pinned="${f.pinned}">${f.pinned ? '📌 Unpin' : '📌 Pin'}</button>
    <button class="btn-delete danger" data-id="${f._id}">🗑️ Delete</button>` : '';

  const runBtn = isExecutableFile(f) ? `
    <button class="btn-run" data-id="${f._id}" data-name="${escapeHtml(cleanName)}">▶ Run Online</button>` : '';

  const subjBadge = f.subject ? `<span class="card-subj-badge">${escapeHtml(f.subject)}</span>` : '';
  const exBadge = f.exercise ? `<span class="card-ex-badge">${escapeHtml(f.exercise)}</span>` : '';

  return `
    <div class="file-card" data-id="${f._id}">
      ${f.pinned ? '<span class="pin-badge">📌</span>' : ''}
      <div>${subjBadge}${exBadge}</div>
      <div class="file-icon" style="color:${meta.color}">${meta.icon}</div>
      <div class="file-name">${escapeHtml(cleanTitle)}</div>
      <div class="file-meta">${fmtSize(f.size)} • ${fmtDate(f.uploadDate)} • ${f.downloads} downloads</div>
      ${f.description ? `<div class="file-desc">${escapeHtml(f.description)}</div>` : ''}
      <div class="file-tags">${tags}</div>
      <div class="file-actions">
        ${runBtn}
        <button class="btn-solution" data-id="${f._id}">💡 Solution</button>
        <button class="btn-download" data-id="${f._id}">⬇ Download</button>
        ${adminButtons}
      </div>
    </div>`;
}

function attachCardHandlers() {
  document.querySelectorAll('.btn-run').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openCompilerModal(b.dataset.id, b.dataset.name);
  }));

  document.querySelectorAll('.btn-solution').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const file = lastFiles.find(f => f._id === b.dataset.id);
    if (file) openSolutionModal(file);
  }));

  document.querySelectorAll('.btn-download').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location = `/api/files/${b.dataset.id}/download`;
    toast('Download Started', 'success');
  }));

  document.querySelectorAll('.btn-download-folder').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    window.location = `/api/files/folder/${encodeURIComponent(b.dataset.batch)}/download`;
    toast('Folder Download Started', 'success');
  }));

  document.querySelectorAll('.btn-delete-folder').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteFolderConfirm(b.dataset.batch, b.dataset.name, b.dataset.count, b.dataset.size);
  }));

  document.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteConfirm(b.dataset.id);
  }));

  document.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(b.dataset.id);
  }));

  document.querySelectorAll('.btn-pin').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(b.dataset.id, b.dataset.pinned === 'true');
  }));
}

// ---------------- PART 10: SOLUTION PANEL SPLIT VIEW ----------------
let currentSolutionFile = null;

async function openSolutionModal(file) {
  currentSolutionFile = file;
  const cleanName = getCleanName(file.originalName);

  $('solutionProgramTitle').textContent = cleanName;
  $('solutionSubjBadge').textContent = `${file.subject || 'General'} • ${file.exercise || 'Lab Program'}`;

  $('solMetaSubjectEx').textContent = `${file.subject || 'General'} • ${file.exercise || 'N/A'}`;
  $('solMetaQuestion').textContent = file.question || cleanName;
  $('solMetaDesc').textContent = file.description || 'Student Lab Exercise Program';
  $('solMetaOutput').textContent = file.expectedOutput || 'Program execution output will be displayed here upon running.';
  $('solMetaAlgorithm').textContent = file.algorithm || 'Standard algorithm logic for ' + cleanName;
  $('solMetaComplexity').textContent = file.complexity || 'O(N)';
  $('solMetaDifficulty').textContent = file.difficulty || 'Medium';

  const runBtn = $('btnRunFromSolution');
  if (isExecutableFile(file)) {
    runBtn.style.display = 'inline-flex';
    runBtn.onclick = () => {
      closeModal('solutionModalOverlay');
      openCompilerModal(file._id, cleanName);
    };
  } else {
    runBtn.style.display = 'none';
  }

  $('solutionCodeDisplay').textContent = 'Loading source code...';
  openModal('solutionModalOverlay');

  try {
    const res = await fetch(`/api/files/${file._id}/preview`);
    const data = await res.json();
    $('solutionCodeDisplay').textContent = data.content || '// Code empty or binary file';
  } catch {
    $('solutionCodeDisplay').textContent = '// Failed to load code content';
  }
}

$('btnCopySolution').addEventListener('click', () => {
  const code = $('solutionCodeDisplay').textContent;
  navigator.clipboard.writeText(code);
  toast('Solution code copied to clipboard!', 'success');
});

$('btnDownloadSolution').addEventListener('click', () => {
  if (currentSolutionFile) {
    window.location = `/api/files/${currentSolutionFile._id}/download`;
  }
});

// ---------------- PART 7: MOBILE BOTTOM NAV ----------------
function initMobileNav() {
  const mHome = $('mNavHome');
  const mSubjects = $('mNavSubjects');
  const mPinned = $('mNavPinned');
  const mSearch = $('mNavSearch');
  const mAdmin = $('mNavAdmin');

  function clearActive() {
    [mHome, mSubjects, mPinned, mSearch, mAdmin].forEach(b => b && b.classList.remove('active'));
  }

  if (mHome) {
    mHome.addEventListener('click', () => {
      clearActive();
      mHome.classList.add('active');
      clearSubjectFilter();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (mSubjects) {
    mSubjects.addEventListener('click', () => {
      clearActive();
      mSubjects.classList.add('active');
      const sidebar = $('labExplorerSidebar');
      if (sidebar) sidebar.classList.toggle('open');
    });
  }

  if (mPinned) {
    mPinned.addEventListener('click', () => {
      clearActive();
      mPinned.classList.add('active');
      currentFilter = 'pinned';
      loadFiles();
    });
  }

  if (mSearch) {
    mSearch.addEventListener('click', () => {
      clearActive();
      mSearch.classList.add('active');
      const input = $('searchInput');
      if (input) input.focus();
    });
  }

  if (mAdmin) {
    mAdmin.addEventListener('click', () => {
      clearActive();
      mAdmin.classList.add('active');
      $('adminLoginBtn').click();
    });
  }
}

// ---------------- Delete ----------------
let pendingDeleteId = null;
let pendingDeleteFolderBatch = null;

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

// ---------------- Folder Delete System ----------------
function openDeleteFolderConfirm(batchId, name, count, size) {
  pendingDeleteFolderBatch = batchId;
  const nameEl = $('folderDeleteName');
  const countEl = $('folderDeleteCount');
  const sizeEl = $('folderDeleteSize');

  if (nameEl) nameEl.textContent = name || 'Folder';
  if (countEl) countEl.textContent = count || '0';
  if (sizeEl) sizeEl.textContent = size || '0 KB';

  openModal('deleteFolderModalOverlay');
}

const deleteFolderCancelBtn = $('deleteFolderCancelBtn');
if (deleteFolderCancelBtn) {
  deleteFolderCancelBtn.addEventListener('click', () => {
    pendingDeleteFolderBatch = null;
    closeModal('deleteFolderModalOverlay');
  });
}

const deleteFolderConfirmBtn = $('deleteFolderConfirmBtn');
if (deleteFolderConfirmBtn) {
  deleteFolderConfirmBtn.addEventListener('click', async () => {
    if (!pendingDeleteFolderBatch) return;

    const btnText = deleteFolderConfirmBtn.querySelector('.btn-text');
    const btnSpinner = deleteFolderConfirmBtn.querySelector('.btn-spinner');

    if (btnText) btnText.textContent = 'Deleting...';
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    deleteFolderConfirmBtn.disabled = true;

    try {
      const res = await fetch(`/api/files/folder/${encodeURIComponent(pendingDeleteFolderBatch)}`, {
        method: 'DELETE',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batchId: pendingDeleteFolderBatch })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Folder deletion failed.');

      toast(`Folder deleted! (${data.deletedCount || 0} programs removed)`, 'success');
      setMascotMood('happy', 'Folder deleted successfully! 🗑️');
      closeModal('deleteFolderModalOverlay');
      loadFiles();
      loadStats();
    } catch (err) {
      toast(err.message || 'Folder deletion failed.', 'error');
      setMascotMood('sad', 'Failed to delete folder.');
    } finally {
      if (btnText) btnText.textContent = 'Delete Folder';
      if (btnSpinner) btnSpinner.classList.add('hidden');
      deleteFolderConfirmBtn.disabled = false;
      pendingDeleteFolderBatch = null;
    }
  });
}

// ---------------- Welcome Capsule & Session ----------------
let capsuleTimer = null;

function updateWelcomeCapsule() {
  const capsule = $('welcomeCapsule');
  const textEl = $('welcomeCapsuleText');
  if (!capsule || !textEl) return;

  textEl.textContent = adminToken ? 'Welcome Admin 👋' : 'Welcome Anonymous 👋';
  capsule.classList.remove('hidden-capsule');

  clearTimeout(capsuleTimer);
  capsuleTimer = setTimeout(() => {
    capsule.classList.add('hidden-capsule');
  }, 5000);
}

// ---------------- Edit / Metadata ----------------
let editingId = null;
function openEditModal(id) {
  const file = lastFiles.find(f => f._id === id);
  if (!file) return;
  editingId = id;
  $('editNameInput').value = getCleanName(file.originalName);
  $('editSubjectSelect').value = file.subject || 'Java Programming';
  $('editExerciseInput').value = file.exercise || 'Exercise 1';
  $('editQuestionInput').value = file.question || '';
  $('editDescInput').value = file.description || '';
  $('editOutputInput').value = file.expectedOutput || '';
  $('editAlgorithmInput').value = file.algorithm || '';
  $('editComplexityInput').value = file.complexity || 'O(N)';
  $('editDifficultySelect').value = file.difficulty || 'Medium';
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
        subject: $('editSubjectSelect').value,
        exercise: $('editExerciseInput').value,
        question: $('editQuestionInput').value,
        description: $('editDescInput').value,
        expectedOutput: $('editOutputInput').value,
        algorithm: $('editAlgorithmInput').value,
        complexity: $('editComplexityInput').value,
        difficulty: $('editDifficultySelect').value,
        tags: $('editTagsInput').value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Metadata Saved Successfully', 'success');
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

// ---------------- Upload ----------------
async function doUpload(fileList, isFolder) {
  if (!fileList || !fileList.length) return;
  const formData = new FormData();
  Array.from(fileList).forEach(file => {
    formData.append('files', file);
    formData.append('paths', isFolder ? (file.webkitRelativePath || file.name) : file.name);
  });
  try {
    toast('Uploading program / folder...', 'warn');
    setMascotMood('excited', 'Uploading programs... ⚡');
    const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toast('Upload Successful!', 'success');
    setMascotMood('happy', 'Upload Complete! 🎉');
    loadFiles();
    loadStats();
    loadSuggestions();
  } catch (err) {
    setMascotMood('sad', 'Upload Failed 😢');
    toast(err.message || 'Upload failed.', 'error');
  }
}
$('fileInput').addEventListener('change', e => doUpload(e.target.files, false));
$('folderInput').addEventListener('change', e => doUpload(e.target.files, true));

// ---------------- Admin Login ----------------
$('adminLoginBtn').addEventListener('click', () => {
  if (adminToken) {
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

// ---------------- Online Compiler ----------------
let monacoEditorInstance = null;
let currentCompilerFile = null;
let activeRunAbortController = null;

function initMonacoLoader(callback) {
  if (window.monaco) return callback();
  if (window.require) {
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    window.require(['vs/editor/editor.main'], function () {
      callback();
    });
  } else {
    setTimeout(() => initMonacoLoader(callback), 100);
  }
}

async function openCompilerModal(id, name) {
  const file = lastFiles.find(f => f._id === id);
  const ext = file ? (file.extension || '') : (name.split('.').pop() || '');
  const cleanName = getCleanName(name);

  currentCompilerFile = {
    id: id,
    originalName: cleanName,
    extension: ext.toLowerCase(),
    content: ''
  };

  $('compilerTitle').textContent = cleanName;
  $('compilerLangBadge').textContent = ext ? ext.toUpperCase() : 'CODE';
  $('compilerInput').value = '';
  $('compilerOutputBox').innerHTML = '<div class="output-placeholder">Click <strong>▶ Run</strong> to execute source file online.</div>';

  updateCompilerStatus('Ready', 'default');
  $('compilerTimeTag').textContent = '⏱ --';
  $('compilerMemTag').textContent = '💾 --';

  $('btnSaveAdminCode').style.display = adminToken ? 'inline-flex' : 'none';

  openModal('compilerModalOverlay');

  try {
    const res = await fetch(`/api/files/${id}/preview`);
    const data = await res.json();
    currentCompilerFile.content = data.content || '';
  } catch {
    currentCompilerFile.content = '';
  }

  initMonacoLoader(() => {
    const container = $('monacoEditorContainer');
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const lang = monacoLanguageFor(currentCompilerFile.extension);

    if (!monacoEditorInstance) {
      container.innerHTML = '';
      monacoEditorInstance = monaco.editor.create(container, {
        value: currentCompilerFile.content,
        language: lang,
        theme: isDark ? 'vs-dark' : 'vs',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false
      });
    } else {
      const model = monaco.editor.createModel(currentCompilerFile.content, lang);
      monacoEditorInstance.setModel(model);
      monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    }
  });
}

function updateCompilerStatus(statusText, type = 'default') {
  const badge = $('compilerStatusBadge');
  badge.textContent = statusText;
  badge.className = `status-badge ${type}`;
}

$('btnRunCode').addEventListener('click', runCode);
$('btnStopCode').addEventListener('click', stopCode);
$('btnResetCode').addEventListener('click', () => {
  if (monacoEditorInstance && currentCompilerFile) {
    monacoEditorInstance.setValue(currentCompilerFile.content);
    toast('Code reset to original content.', 'success');
  }
});
$('btnCopyCode').addEventListener('click', () => {
  if (monacoEditorInstance) {
    const code = monacoEditorInstance.getValue();
    navigator.clipboard.writeText(code);
    toast('Code copied to clipboard.', 'success');
  }
});
$('btnDownloadCode').addEventListener('click', () => {
  if (monacoEditorInstance && currentCompilerFile) {
    const code = monacoEditorInstance.getValue();
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentCompilerFile.originalName;
    a.click();
    URL.revokeObjectURL(url);
    toast('Downloaded source file.', 'success');
  }
});
$('btnFullscreenCompiler').addEventListener('click', () => {
  const modal = $('compilerModalWindow');
  modal.classList.toggle('fullscreen');
  if (monacoEditorInstance) {
    setTimeout(() => monacoEditorInstance.layout(), 100);
  }
});
$('btnSaveAdminCode').addEventListener('click', async () => {
  if (!currentCompilerFile || !adminToken) return;
  const content = monacoEditorInstance ? monacoEditorInstance.getValue() : '';
  try {
    const res = await fetch(`/api/files/${currentCompilerFile.id}/content`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    currentCompilerFile.content = content;
    toast('File content saved permanently by Admin!', 'success');
    loadFiles();
  } catch (err) {
    toast(err.message || 'Save failed.', 'error');
  }
});

async function runCode() {
  if (!currentCompilerFile || !monacoEditorInstance) return;

  const code = monacoEditorInstance.getValue();
  const stdin = $('compilerInput').value;

  if (!code.trim()) {
    toast('Source code is empty.', 'warn');
    return;
  }

  $('btnRunCode').style.display = 'none';
  $('btnStopCode').style.display = 'inline-flex';
  updateCompilerStatus('Running...', 'running');
  setMascotMood('thinking', 'Executing code online via Judge0... ⚡');
  $('compilerOutputBox').innerHTML = '<div class="output-placeholder">Compiling and executing code via Judge0...</div>';

  activeRunAbortController = new AbortController();

  try {
    const res = await fetch('/api/compiler/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: currentCompilerFile.id,
        filename: currentCompilerFile.originalName,
        extension: currentCompilerFile.extension,
        sourceCode: code,
        stdin
      }),
      signal: activeRunAbortController.signal
    });

    const data = await res.json();

    if (!res.ok) {
      updateCompilerStatus('Error', 'error');
      setMascotMood('sad', 'Execution failed 😢');
      $('compilerOutputBox').innerHTML = `<div class="output-block"><div class="output-label">Compiler Error</div><div class="output-content compile-error">${escapeHtml(data.error || 'Execution failed.')}</div></div>`;
      return;
    }

    $('compilerTimeTag').textContent = `⏱ ${data.time || '--'}`;
    $('compilerMemTag').textContent = `💾 ${data.memory || '--'}`;

    let html = '';

    if (data.compile_output) {
      updateCompilerStatus('Compilation Error', 'error');
      setMascotMood('sad', 'Compilation error detected 😢');
      html += `<div class="output-block"><div class="output-label">Compilation Errors</div><div class="output-content compile-error">${escapeHtml(data.compile_output)}</div></div>`;
    }

    if (data.stderr) {
      if (!data.compile_output) {
        updateCompilerStatus(data.status?.description || 'Runtime Error', 'error');
        setMascotMood('sad', 'Runtime error detected 😢');
      }
      html += `<div class="output-block"><div class="output-label">Runtime Errors</div><div class="output-content runtime-error">${escapeHtml(data.stderr)}</div></div>`;
    }

    if (data.stdout) {
      if (!data.compile_output && !data.stderr) {
        updateCompilerStatus(data.status?.description || 'Accepted', 'accepted');
        setMascotMood('happy', 'Execution Successful! 🎉');
      }
      html += `<div class="output-block"><div class="output-label">Program Output (stdout)</div><div class="output-content">${escapeHtml(data.stdout)}</div></div>`;
    }

    if (!data.stdout && !data.stderr && !data.compile_output) {
      updateCompilerStatus(data.status?.description || 'Accepted', 'accepted');
      setMascotMood('happy', 'Executed with no output! 🎉');
      html = `<div class="output-block"><div class="output-label">Program Output</div><div class="output-content">Program executed successfully with no output.</div></div>`;
    }

    $('compilerOutputBox').innerHTML = html;

  } catch (err) {
    if (err.name === 'AbortError') {
      updateCompilerStatus('Stopped', 'default');
      setMascotMood('normal', 'Execution stopped by user.');
      $('compilerOutputBox').innerHTML = '<div class="output-placeholder">Execution stopped by user.</div>';
    } else {
      updateCompilerStatus('Execution Error', 'error');
      setMascotMood('sad', 'Server error during execution.');
      $('compilerOutputBox').innerHTML = `<div class="output-block"><div class="output-label">Error</div><div class="output-content compile-error">${escapeHtml(err.message || 'Server network error.')}</div></div>`;
    }
  } finally {
    $('btnRunCode').style.display = 'inline-flex';
    $('btnStopCode').style.display = 'none';
    activeRunAbortController = null;
  }
}

function stopCode() {
  if (activeRunAbortController) {
    activeRunAbortController.abort();
  }
}

// ---------------- Generic Modal Close Handlers ----------------
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
});
$('aboutBtn').addEventListener('click', () => openModal('aboutModalOverlay'));

// ---------------- Initialization ----------------
const nomadBadge = $('nomadDevBadge');
if (nomadBadge) {
  nomadBadge.addEventListener('click', () => {
    toast('Developed with ❤️ by Nomad!', 'success');
    setMascotMood('excited', 'Crafted by Nomad! 🚀');
  });
}

const welcomeCapsule = $('welcomeCapsule');
if (welcomeCapsule) {
  welcomeCapsule.addEventListener('click', () => {
    updateWelcomeCapsule();
  });
}

initParticleCanvas();
initMascot();
initTheme();
initOnboarding();
initLabExplorer();
initMobileNav();
refreshSessionBadge();
loadStats();
loadFiles();
loadSuggestions();
