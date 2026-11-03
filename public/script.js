// ZIPSHARE V3 - Master Application Script
let adminToken = localStorage.getItem('zipshare_token') || null;
let activeCategory = 'all';
let activeSyllabusSubject = null;
let activeSyllabusExercise = null;
let activeSyllabusQuestion = null;
let activeTheme = localStorage.getItem('zipshare_theme') || 'dark';
let searchSearchQuery = '';
let searchDebounceTimer = null;
let lastFiles = [];
let syllabusData = {};
let pendingDeleteId = null;
let editingFileId = null;
let previewingFile = null;
let subjectAnimFrame = null;
let monacoEditorInstance = null;
let currentCompilerFile = null;
let currentAiSolution = null;
let lockoutTimerInterval = null;

// Icon & Color Map per File Type
const ICONS = {
  java: { icon: '☕', color: '#f89820' },
  py: { icon: '🐍', color: '#3776ab' },
  python: { icon: '🐍', color: '#3776ab' },
  c: { icon: '🔷', color: '#5c6bc0' },
  cpp: { icon: '⚙️', color: '#00599c' },
  adsa: { icon: '🌳', color: '#10b981' },
  dbms: { icon: '🗄️', color: '#06b6d4' },
  html: { icon: '🌐', color: '#e34c26' },
  css: { icon: '🎨', color: '#264de4' },
  js: { icon: '📜', color: '#f0db4f' },
  ts: { icon: '📘', color: '#3178c6' },
  sql: { icon: '🗄️', color: '#00838f' },
  pdf: { icon: '📕', color: '#e53935' },
  zip: { icon: '🗜️', color: '#a67c52' },
  png: { icon: '🖼️', color: '#66bb6a' },
  jpg: { icon: '🖼️', color: '#66bb6a' },
  jpeg: { icon: '🖼️', color: '#66bb6a' },
  folder: { icon: '📁', color: '#facc15' },
  default: { icon: '📄', color: '#8b5cf6' }
};

const RUNNABLE_EXTENSIONS = new Set([
  'c', 'cpp', 'cc', 'cxx', 'java', 'py', 'python', 'js', 'ts', 'go', 'rs', 'cs',
  'php', 'rb', 'swift', 'kt', 'kts', 'scala', 'r', 'm', 'pl', 'lua', 'sh', 'sql'
]);

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
  const container = $('toastContainer') || document.body;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
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
  return adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {};
}

function jsonAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    ...authHeaders()
  };
}

function getFileExtension(filenameOrExt) {
  if (!filenameOrExt) return '';
  const str = String(filenameOrExt).trim().toLowerCase();
  const parts = str.split('.');
  if (parts.length > 1) {
    return parts.pop();
  }
  return str.replace(/^\./, '');
}

function isRunnableFile(file) {
  if (!file) return false;
  const ext = getFileExtension(file.extension || file.originalName || file.relativePath || '');
  return RUNNABLE_EXTENSIONS.has(ext) || file.category === 'adsa' || file.category === 'dbms';
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

  if (window.monaco && window.monaco.editor) {
    window.monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
  }
}

function initMascot() {
  document.addEventListener('mousemove', e => {
    const mascots = document.querySelectorAll('.mascot-svg');
    mascots.forEach(svg => {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      // Limit pupil displacement to max 4.5px
      const maxOffset = 4.5;
      const offX = (dx / dist) * Math.min(dist * 0.1, maxOffset);
      const offY = (dy / dist) * Math.min(dist * 0.1, maxOffset);

      const pupils = svg.querySelectorAll('.pupil-left, .pupil-right, #mascotPupilLeft, #mascotPupilRight');
      pupils.forEach(pupil => {
        pupil.style.transform = `translate(${offX}px, ${offY}px)`;
      });
    });
  });

  // Natural blink animation
  setInterval(() => {
    const eyeBases = document.querySelectorAll('.mascot-svg ellipse');
    eyeBases.forEach(eye => {
      eye.style.transform = 'scaleY(0.1)';
      setTimeout(() => eye.style.transform = 'scaleY(1)', 150);
    });
  }, 4500);

  initOpArtSphere();
}

function initOpArtSphere() {
  const canvas = document.getElementById('navMascotCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const size = canvas.width; // 68
  const R = (size / 2) - 0.5; // 33.5
  const cx = size / 2;
  const cy = size / 2;

  let targetTiltX = 0;
  let targetTiltY = 0;
  let currentTiltX = 0;
  let currentTiltY = 0;
  let spinVelocity = 1.0;
  let isHovered = false;

  window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
    const ny = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
    targetTiltX = Math.max(-0.6, Math.min(0.6, nx * 0.5));
    targetTiltY = Math.max(-0.6, Math.min(0.6, ny * 0.5));
  });

  canvas.addEventListener('mouseenter', () => {
    isHovered = true;
  });

  canvas.addEventListener('mouseleave', () => {
    isHovered = false;
  });

  canvas.addEventListener('click', () => {
    spinVelocity = 3.8;
  });

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  let time = 0;

  function renderSphere() {
    const speed = (isHovered ? 1.6 : 1.0) * spinVelocity;
    time += 0.038 * speed;

    if (spinVelocity > 1.0) {
      spinVelocity += (1.0 - spinVelocity) * 0.05;
    }

    currentTiltX += (targetTiltX - currentTiltX) * 0.08;
    currentTiltY += (targetTiltY - currentTiltY) * 0.08;

    // Pole on sphere matching the user image: upper-left vortex
    const basePx = Math.max(-0.7, Math.min(-0.05, -0.32 + currentTiltX * 0.22));
    const basePy = Math.max(-0.75, Math.min(-0.1, -0.42 + currentTiltY * 0.22));
    const basePz = Math.sqrt(Math.max(0.04, 1 - basePx * basePx - basePy * basePy));

    const rollAngle = time * 0.12;
    const cosRoll = Math.cos(rollAngle);
    const sinRoll = Math.sin(rollAngle);

    let idx = 0;
    for (let y = 0; y < size; y++) {
      const dy = (y + 0.5 - cy) / R;
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - cx) / R;
        const r2 = dx * dx + dy * dy;

        if (r2 > 1.0) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        } else {
          const z = Math.sqrt(Math.max(0, 1.0 - r2));

          // 3D rolling distortion
          const rx = dx * cosRoll - z * sinRoll * 0.3;
          const rz = z * cosRoll + dx * sinRoll * 0.3;
          const ry = dy;

          const dot = rx * basePx + ry * basePy + rz * basePz;
          const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
          const distToPole = Math.sqrt((rx - basePx) ** 2 + (ry - basePy) ** 2 + (rz - basePz) ** 2);

          // Optical illusion zebra wavy harmonics
          const wave = angle * 11.5
            + Math.sin(ry * 4.2 + rx * 2.5 + time) * 1.6
            + Math.cos(rx * 4.8 - ry * 1.8 - time * 0.8) * 0.95
            + Math.sin(distToPole * 6.5 - time * 1.1) * 0.6;

          const sinVal = Math.sin(wave);
          // Antialiased transition between black and white
          const edgeWidth = 0.22;
          const factor = Math.max(0, Math.min(1, (sinVal + edgeWidth) / (2 * edgeWidth)));
          const color = Math.round(factor * 255);

          let alpha = 255;
          if (r2 > 0.94) {
            alpha = Math.round(Math.max(0, Math.min(1, (1.0 - r2) / 0.06)) * 255);
          }

          data[idx] = color;
          data[idx + 1] = color;
          data[idx + 2] = color;
          data[idx + 3] = alpha;
        }
        idx += 4;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    requestAnimationFrame(renderSphere);
  }

  // Draw initial frame immediately
  renderSphere();
}

function initWelcomeIllusion() {
  const canvas = document.getElementById('welcomeIllusionCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const size = canvas.width; // 160
  const R = (size / 2) - 1;
  const cx = size / 2;
  const cy = size / 2;

  let speed = 1.0;
  canvas.addEventListener('click', () => {
    speed = 3.2;
  });

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  let time = 0;

  function renderTunnel() {
    time += 0.038 * speed;
    if (speed > 1.0) {
      speed += (1.0 - speed) * 0.05;
    }

    // Tunnel center gently orbiting slightly to match perspective in Image 3
    const offX = 0.12 * Math.cos(time * 0.25);
    const offY = -0.08 + 0.06 * Math.sin(time * 0.25);

    let idx = 0;
    for (let y = 0; y < size; y++) {
      const ny = (y + 0.5 - cy) / R;
      for (let x = 0; x < size; x++) {
        const nx = (x + 0.5 - cx) / R;
        const r2 = nx * nx + ny * ny;

        if (r2 > 1.0) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
        } else {
          const dx = nx - offX;
          const dy = ny - offY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          // Deep perspective reciprocal tunnel coordinate matching Image 3
          const z = 1.0 / (dist + 0.1);
          // Concentric spiral tunnel stripes zooming inward
          const wave = Math.sin(z * 7.5 - time * 2.2 + angle * 3.0);

          const edgeWidth = 0.22;
          const factor = Math.max(0, Math.min(1, (wave + edgeWidth) / (2 * edgeWidth)));
          const color = Math.round(factor * 255);

          let alpha = 255;
          if (r2 > 0.94) {
            alpha = Math.round(Math.max(0, Math.min(1, (1.0 - r2) / 0.06)) * 255);
          }

          data[idx] = color;
          data[idx + 1] = color;
          data[idx + 2] = color;
          data[idx + 3] = alpha;
        }
        idx += 4;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    requestAnimationFrame(renderTunnel);
  }

  renderTunnel();
}

// ---------------- Sequential Animated Onboarding System (Black Hole -> Theme -> 3D Category Carousel) ----------------
let zpwCarouselIndex = 0;
let zpwCarouselTimer = null;
let zpwCosmicCanvasAnim = null;
let zpwAutoAdvanceTimer = null;

function initZipshareWelcome() {
  applyTheme(activeTheme);
  initMascot();

  const container = $('zipshareWelcomeContainer');
  const appEl = $('app');

  // Check saved favorite subject
  const savedSubject = localStorage.getItem('zipshare_favorite_subject');
  if (savedSubject && ['java', 'python', 'c', 'dbms', 'adsa'].includes(savedSubject)) {
    activeCategory = savedSubject;
  }

  // Bind settings reset buttons
  const resetBtn = $('resetWelcomeBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      startWelcomeJourney(true);
    });
  }
  const aboutResetBtn = $('aboutResetWelcomeBtn');
  if (aboutResetBtn) {
    aboutResetBtn.addEventListener('click', () => {
      closeModal('aboutModalOverlay');
      startWelcomeJourney(true);
    });
  }

  // Check if forced via query param or if session completed
  const urlParams = new URLSearchParams(window.location.search);
  const forceWelcome = urlParams.has('welcome') || urlParams.has('replay');
  const sessionCompleted = sessionStorage.getItem('zipshare_session_onboarding_shown');

  if (!forceWelcome && sessionCompleted) {
    if (container) {
      container.classList.add('hidden');
      container.style.display = 'none';
    }
    if (appEl) {
      appEl.classList.add('show');
    }
    switchCategory(activeCategory);
    return;
  }

  // Otherwise, start the exact 3-screen welcome journey
  startWelcomeJourney(false);
}

function startWelcomeJourney(isReplay = false) {
  const container = $('zipshareWelcomeContainer');
  const appEl = $('app');
  const screen1 = $('zpwScreen1');
  const screen2 = $('zpwScreen2');
  const screen3 = $('zpwScreen3');
  const bhVideo = $('zpwBlackHoleVideo');

  if (!container || !screen1 || !screen2 || !screen3) return;

  // Clear timers
  if (zpwCarouselTimer) clearInterval(zpwCarouselTimer);
  if (zpwAutoAdvanceTimer) clearTimeout(zpwAutoAdvanceTimer);
  if (zpwCosmicCanvasAnim) cancelAnimationFrame(zpwCosmicCanvasAnim);

  // Hide main app during onboarding
  if (appEl) appEl.classList.remove('show');

  // Reset container
  container.classList.remove('hidden');
  container.style.display = 'flex';

  // Screen 1: Active
  screen1.style.display = 'flex';
  screen1.classList.remove('zpw-fade-out');
  screen1.classList.add('active');

  // Screen 2 & 3: Hidden
  screen2.style.display = 'none';
  screen2.classList.remove('zpw-fade-out', 'zpw-fade-in');
  screen3.style.display = 'none';
  screen3.classList.remove('zpw-fade-out', 'zpw-fade-in');

  // Play video with muted audio for smooth cinematic playback
  if (bhVideo) {
    bhVideo.currentTime = 0;
    const playPromise = bhVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  }

  initCosmicParticles();

  // Preload all background details (files, syllabus, settings, and high-res assets) during the 10s intro
  preloadBackgroundDetails();

  // Screen 1 Advance logic (10-Second Duration with Live Telemetry)
  let advancedFromScreen1 = false;
  let screen1ProgressAnim = null;
  const screen1StartTime = performance.now();
  const screen1TotalDuration = 10000; // 10 seconds requested by user

  const progressBar = $('zpwBhProgressBar');
  const statusText = $('zpwBhStatusText');
  const timerBadge = $('zpwBhTimer');
  const percentBadge = $('zpwBhPercent');

  function updateScreen1Progress(now) {
    if (advancedFromScreen1) return;
    const elapsed = now - screen1StartTime;
    const progress = Math.min(100, (elapsed / screen1TotalDuration) * 100);
    const secondsRemaining = Math.max(0, Math.ceil((screen1TotalDuration - elapsed) / 1000));

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    if (percentBadge) {
      percentBadge.textContent = `${Math.round(progress)}%`;
    }

    if (timerBadge) {
      timerBadge.textContent = secondsRemaining > 0 ? `${secondsRemaining}s` : 'Ready';
    }

    if (statusText) {
      if (elapsed < 2500) {
        statusText.textContent = 'Entering cosmic horizon · Synchronizing core repository...';
      } else if (elapsed < 5000) {
        statusText.textContent = 'Preloading 145 lab experiments & college curriculum...';
      } else if (elapsed < 7500) {
        statusText.textContent = 'Caching Judge0 runtime containers (Java, Python, C, SQL)...';
      } else if (elapsed < 9200) {
        statusText.textContent = 'All background systems & files fully synchronized!';
      } else {
        statusText.textContent = 'Welcome to ZipShare · Initializing Workspace...';
      }
    }

    if (elapsed < screen1TotalDuration) {
      screen1ProgressAnim = requestAnimationFrame(updateScreen1Progress);
    } else {
      advanceFromScreen1();
    }
  }

  screen1ProgressAnim = requestAnimationFrame(updateScreen1Progress);

  function advanceFromScreen1() {
    if (advancedFromScreen1) return;
    advancedFromScreen1 = true;

    if (screen1ProgressAnim) {
      cancelAnimationFrame(screen1ProgressAnim);
      screen1ProgressAnim = null;
    }

    screen1.classList.add('zpw-fade-out');

    setTimeout(() => {
      if (bhVideo) {
        bhVideo.pause();
      }
      if (zpwCosmicCanvasAnim) cancelAnimationFrame(zpwCosmicCanvasAnim);
      screen1.style.display = 'none';
      screen1.classList.remove('active');

      showScreen2Theme();
    }, 380);
  }

  const skipBtn = $('zpwSkipBhBtn');
  if (skipBtn) {
    skipBtn.onclick = (e) => {
      e.stopPropagation();
      advanceFromScreen1();
    };
  }

  screen1.onclick = () => {
    advanceFromScreen1();
  };
}

// ---------------- BACKGROUND DATA & ASSET PRELOADER ----------------
function preloadBackgroundDetails() {
  // 1. Parallel background API & data fetches
  const filesPromise = typeof loadFiles === 'function' ? loadFiles().catch(e => console.warn('Preload files err:', e)) : Promise.resolve();
  const syllabusPromise = typeof loadSyllabus === 'function' ? loadSyllabus().catch(e => console.warn('Preload syllabus err:', e)) : Promise.resolve();
  const promoPromise = typeof loadPromoSettings === 'function' ? loadPromoSettings().catch(e => console.warn('Preload promo err:', e)) : Promise.resolve();

  // 2. Preload high-res WebP images into browser cache so that subsequent screens have 0ms latency
  const preloadImages = [
    '/assets/welcome/dark-universe.webp',
    '/assets/welcome/light-universe.webp',
    '/assets/welcome/java-tile.webp',
    '/assets/welcome/python-tile.webp',
    '/assets/welcome/c-language-tile.webp',
    '/assets/welcome/adsa-tile.webp',
    '/assets/welcome/dbms-tile.webp',
    '/assets/welcome/blackhole-poster.webp',
    '/assets/zipshare/hero-blackhole-desktop.webp',
    '/assets/zipshare/file-transfer-desktop.webp',
    '/assets/zipshare/program-sharing-desktop.webp',
    '/assets/zipshare/secure-storage-desktop.webp',
    '/assets/zipshare/anywhere-access-desktop.webp',
    '/assets/zipshare/premium-experience-desktop.webp',
    '/assets/zipshare/final-showcase-desktop.webp'
  ];

  preloadImages.forEach(url => {
    const img = new Image();
    img.src = url;
  });

  return Promise.allSettled([filesPromise, syllabusPromise, promoPromise]);
}

// ---------------- SCREEN 2: THEME SELECTION ----------------
function showScreen2Theme() {
  const screen2 = $('zpwScreen2');
  if (!screen2) return;

  screen2.style.display = 'flex';
  screen2.classList.add('zpw-fade-in');

  const darkCard = $('zpwDarkCard');
  const lightCard = $('zpwLightCard');
  let selectedTheme = activeTheme || 'dark';

  function updateThemeCards() {
    if (darkCard) {
      darkCard.classList.toggle('active', selectedTheme === 'dark');
      darkCard.setAttribute('aria-pressed', selectedTheme === 'dark');
    }
    if (lightCard) {
      lightCard.classList.toggle('active', selectedTheme === 'light');
      lightCard.setAttribute('aria-pressed', selectedTheme === 'light');
    }
  }
  updateThemeCards();

  if (darkCard) {
    darkCard.onclick = () => {
      selectedTheme = 'dark';
      updateThemeCards();
      applyTheme('dark');
    };
  }
  if (lightCard) {
    lightCard.onclick = () => {
      selectedTheme = 'light';
      updateThemeCards();
      applyTheme('light');
    };
  }

  let advancedFromScreen2 = false;
  function advanceFromScreen2() {
    if (advancedFromScreen2) return;
    advancedFromScreen2 = true;

    applyTheme(selectedTheme);
    localStorage.setItem('zipshare_theme', selectedTheme);

    screen2.classList.add('zpw-fade-out');

    setTimeout(() => {
      screen2.style.display = 'none';
      screen2.classList.remove('zpw-fade-in');
      showScreen3Categories();
    }, 400);
  }

  const continueBtn = $('zpwThemeContinueBtn');
  if (continueBtn) {
    continueBtn.onclick = () => {
      clearTimeout(zpwAutoAdvanceTimer);
      advanceFromScreen2();
    };
  }

  // Auto-advance after 5 seconds if untouched
  zpwAutoAdvanceTimer = setTimeout(advanceFromScreen2, 5000);
}

// ---------------- SCREEN 3: RESPONSIVE CATEGORY SELECTION ----------------
function showScreen3Categories() {
  const screen3 = $('zpwScreen3');
  if (!screen3) return;

  screen3.style.display = 'flex';
  screen3.classList.add('zpw-fade-in');

  const cards = Array.from(document.querySelectorAll('.zpw-cat-card'));
  const enterBtn = $('zpwEnterZipShareBtn');

  function selectCategory(cat) {
    activeCategory = cat;
    cards.forEach(c => {
      const isSel = c.dataset.cat === cat;
      c.classList.toggle('active', isSel);
      c.setAttribute('aria-pressed', isSel ? 'true' : 'false');
    });
  }

  // Pre-select current active or java
  selectCategory(activeCategory || 'java');

  cards.forEach(card => {
    card.onclick = () => {
      selectCategory(card.dataset.cat);
    };
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectCategory(card.dataset.cat);
      }
    };
  });

  let advancedFromScreen3 = false;
  function completeWelcomeAndOpenHome() {
    if (advancedFromScreen3) return;
    advancedFromScreen3 = true;

    localStorage.setItem('zipshare_favorite_subject', activeCategory);
    localStorage.setItem('zipshare_visited', 'true');
    sessionStorage.setItem('zipshare_session_onboarding_shown', 'true');

    screen3.classList.add('zpw-fade-out');

    setTimeout(() => {
      screen3.style.display = 'none';
      screen3.classList.remove('zpw-fade-in');
      launchLanguageTransition(activeCategory);
    }, 350);
  }

  if (enterBtn) {
    enterBtn.onclick = () => {
      completeWelcomeAndOpenHome();
    };
  }
}

let zpwTransAnimFrame = null;

function launchLanguageTransition(category) {
  const transScreen = $('zpwScreenTransition');
  if (!transScreen) {
    finalizeHomeOpening(category);
    return;
  }

  transScreen.className = `zpw-screen zpw-screen-transition theme-${category}`;
  transScreen.style.display = 'flex';
  transScreen.classList.remove('zpw-fade-out');
  transScreen.classList.add('zpw-fade-in');

  const wrapper = $('zpwTransVisualWrapper');
  const titleEl = $('zpwTransTitle');
  const statusEl = $('zpwTransStatusLabel');
  const barEl = $('zpwTransProgressBar');
  const codeBackdrop = $('zpwTransCodeBackdrop');

  const configs = {
    java: {
      title: 'Brewing your Java workspace...',
      status: 'JAVA VIRTUAL MACHINE INITIALIZING',
      code: `// Java Virtual Machine Boot Sequence
public class ZipShareLab {
    private static final Logger log = LoggerFactory.getLogger(ZipShareLab.class);
    public static void main(String[] args) throws InterruptedException {
        ConcurrentHashMap<String, Program> labStore = new ConcurrentHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
        CompletableFuture.supplyAsync(() -> labStore.put("java", new Program("OOP Architecture")))
            .thenAccept(res -> log.info("Java Environment Loaded."));
    }
}`,
      svg: `
        <div class="zpw-java-3d-stage">
          <svg class="zpw-java-cup-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cupGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f97316"/>
                <stop offset="50%" stop-color="#ef4444"/>
                <stop offset="100%" stop-color="#991b1b"/>
              </linearGradient>
              <linearGradient id="steamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stop-color="#f97316" stop-opacity="0.8"/>
                <stop offset="50%" stop-color="#fb923c" stop-opacity="0.9"/>
                <stop offset="100%" stop-color="#fef08a" stop-opacity="0.1"/>
              </linearGradient>
            </defs>
            <ellipse cx="100" cy="165" rx="72" ry="14" fill="#1e1b4b" stroke="#f97316" stroke-width="2.5" opacity="0.9"/>
            <ellipse cx="100" cy="164" rx="56" ry="9" fill="#0f172a" stroke="#fb923c" stroke-width="1.2"/>
            <path d="M48 95 C48 152 70 158 100 158 C130 158 152 152 152 95 Z" fill="url(#cupGrad)" stroke="#fed7aa" stroke-width="2"/>
            <ellipse cx="100" cy="95" rx="52" ry="14" fill="#451a03" stroke="#f97316" stroke-width="2"/>
            <ellipse cx="100" cy="96" rx="44" ry="10" fill="#2d1205"/>
            <path d="M72 96 C80 92 120 100 128 96" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
            <path d="M148 105 C175 105 175 142 144 145" fill="none" stroke="#f97316" stroke-width="5" stroke-linecap="round"/>
            <path class="zpw-steam-path-1" d="M85 82 C78 60 102 45 92 22" fill="none" stroke="url(#steamGrad)" stroke-width="4.5" stroke-linecap="round"/>
            <path class="zpw-steam-path-2" d="M102 80 C95 55 118 40 108 14" fill="none" stroke="url(#steamGrad)" stroke-width="5" stroke-linecap="round"/>
            <path class="zpw-steam-path-3" d="M118 84 C112 65 130 52 124 28" fill="none" stroke="url(#steamGrad)" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </div>`
    },
    python: {
      title: 'Uncoiling your Python workspace...',
      status: 'PYTHON 3.12 RUNTIME COMPOSING',
      code: `# Python High-Performance Engine Boot
import asyncio, sys, json
from dataclasses import dataclass

@dataclass
class Workspace:
    name: str = "ZipShare Python"
    version: str = "3.12-optimized"

async def init_runtime():
    pipeline = [x**2 for x in range(1000) if x % 2 == 0]
    yield from pipeline
    return Workspace()

asyncio.run(init_runtime())`,
      svg: `
        <div class="zpw-python-3d-stage">
          <svg class="zpw-python-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="pyBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8"/>
                <stop offset="100%" stop-color="#1d4ed8"/>
              </linearGradient>
              <linearGradient id="pyYellow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a"/>
                <stop offset="100%" stop-color="#eab308"/>
              </linearGradient>
            </defs>
            <path d="M98 22 C60 22 45 36 45 60 L45 80 L98 80 L98 90 L30 90 C15 90 2 105 2 135 C2 165 18 178 52 178 L70 178 L70 155 C70 135 85 120 105 120 L152 120 C172 120 188 105 188 85 L188 60 C188 36 172 22 135 22 Z" fill="url(#pyBlue)" opacity="0.95"/>
            <circle cx="70" cy="45" r="7" fill="#ffffff"/>
            <circle cx="70" cy="45" r="3.5" fill="#0369a1"/>
            <path d="M102 178 C140 178 155 164 155 140 L155 120 L102 120 L102 110 L170 110 C185 110 198 95 198 65 C198 35 182 22 148 22 L130 22 L130 45 C130 65 115 80 95 80 L48 80 C28 80 12 95 12 115 L12 140 C12 164 28 178 65 178 Z" fill="url(#pyYellow)" opacity="0.95"/>
            <circle cx="130" cy="155" r="7" fill="#ffffff"/>
            <circle cx="130" cy="155" r="3.5" fill="#a16207"/>
          </svg>
        </div>`
    },
    c: {
      title: 'Compiling your C workspace...',
      status: 'GCC LOW-LEVEL COMPILER LINKING',
      code: `/* Low-Level C Systems Runtime Kernel */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct {
    uint32_t memory_addr;
    char buffer[256];
} SystemRegistry;

int main(int argc, char **argv) {
    SystemRegistry *reg = (SystemRegistry*)malloc(sizeof(SystemRegistry));
    reg->memory_addr = 0x7FFF8000;
    strncpy(reg->buffer, "SYS_READY", sizeof(reg->buffer));
    return 0;
}`,
      svg: `
        <div class="zpw-c-3d-stage">
          <svg class="zpw-c-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#475569"/>
                <stop offset="35%" stop-color="#94a3b8"/>
                <stop offset="70%" stop-color="#334155"/>
                <stop offset="100%" stop-color="#0f172a"/>
              </linearGradient>
              <linearGradient id="cCyanNeon" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8"/>
                <stop offset="100%" stop-color="#06b6d4"/>
              </linearGradient>
            </defs>
            <path d="M155 58 C142 36 122 22 96 22 C52 22 20 58 20 102 C20 146 52 182 96 182 C124 182 144 168 156 146 L124 130 C116 142 108 148 96 148 C72 148 54 128 54 102 C54 76 72 56 96 56 C108 56 116 62 124 74 Z" fill="#030812" transform="translate(6, 6)"/>
            <path d="M155 58 C142 36 122 22 96 22 C52 22 20 58 20 102 C20 146 52 182 96 182 C124 182 144 168 156 146 L124 130 C116 142 108 148 96 148 C72 148 54 128 54 102 C54 76 72 56 96 56 C108 56 116 62 124 74 Z" fill="url(#cMetallic)" stroke="url(#cCyanNeon)" stroke-width="4"/>
            <path d="M142 66 C132 48 116 38 96 38 C60 38 34 66 34 102 C34 138 60 166 96 166 C116 166 132 156 142 138" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-dasharray="6 3"/>
            <circle cx="96" cy="38" r="4" fill="#38bdf8"/>
            <circle cx="34" cy="102" r="4" fill="#38bdf8"/>
            <circle cx="96" cy="166" r="4" fill="#38bdf8"/>
          </svg>
        </div>`
    },
    adsa: {
      title: 'Building your algorithm workspace...',
      status: 'GRAPH & DATA STRUCTURES SYNCHRONIZING',
      code: `// Advanced Data Structures & Optimization Algorithms
class AVLTree<T extends Comparable<T>> {
    private Node<T> root;
    private int height(Node<T> n) { return n == null ? 0 : n.height; }
    private int getBalance(Node<T> n) { return n == null ? 0 : height(n.left) - height(n.right); }
    public Node<T> rotateRight(Node<T> y) {
        Node<T> x = y.left;
        Node<T> T2 = x.right;
        x.right = y; y.left = T2;
        return x;
    }
}`,
      svg: `
        <div class="zpw-adsa-3d-stage">
          <svg class="zpw-adsa-svg" viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="dijkstraPath" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#10b981"/>
                <stop offset="50%" stop-color="#34d399"/>
                <stop offset="100%" stop-color="#6ee7b7"/>
              </linearGradient>
              <filter id="neonGreenGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <path d="M20 180 L80 140 L140 160 L200 130 L260 160" stroke="#4c1d95" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.6"/>
            <path d="M40 80 L100 40 L160 60 L220 30" stroke="#581c87" stroke-width="1.5" opacity="0.5"/>
            
            <!-- Top-left Binary Tree -->
            <line x1="60" y1="20" x2="35" y2="48" stroke="#a855f7" stroke-width="2"/>
            <line x1="60" y1="20" x2="85" y2="48" stroke="#a855f7" stroke-width="2"/>
            <line x1="35" y1="48" x2="20" y2="76" stroke="#c084fc" stroke-width="1.5"/>
            <line x1="35" y1="48" x2="50" y2="76" stroke="#c084fc" stroke-width="1.5"/>
            <circle cx="60" cy="20" r="7" fill="#3b0764" stroke="#c084fc" stroke-width="2"/>
            <circle cx="35" cy="48" r="6" fill="#3b0764" stroke="#a855f7" stroke-width="1.5"/>
            <circle cx="85" cy="48" r="6" fill="#3b0764" stroke="#a855f7" stroke-width="1.5"/>
            <circle cx="20" cy="76" r="4.5" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.5"/>
            <circle cx="50" cy="76" r="4.5" fill="#1e1b4b" stroke="#818cf8" stroke-width="1.5"/>

            <!-- Graph Edges -->
            <line x1="70" y1="130" x2="115" y2="95" stroke="#ec4899" stroke-width="2"/>
            <line x1="115" y1="95" x2="165" y2="95" stroke="#ec4899" stroke-width="2"/>
            <line x1="115" y1="95" x2="140" y2="140" stroke="#a855f7" stroke-width="2"/>
            <line x1="165" y1="95" x2="195" y2="135" stroke="#ec4899" stroke-width="2"/>
            <line x1="140" y1="140" x2="195" y2="135" stroke="#a855f7" stroke-width="2"/>
            <line x1="140" y1="140" x2="175" y2="185" stroke="#ec4899" stroke-width="2"/>
            <line x1="195" y1="135" x2="245" y2="110" stroke="#ec4899" stroke-width="2"/>

            <!-- Glowing Dijkstra Shortest Path Beam (Green Neon) -->
            <path class="zpw-dijkstra-beam" d="M35 160 L70 130 L115 95 L140 140 L195 135 L245 110" fill="none" stroke="url(#dijkstraPath)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#neonGreenGlow)"/>

            <!-- Nodes with Labels -->
            <g class="zpw-graph-node" transform="translate(35, 160)">
              <circle r="12" fill="#064e3b" stroke="#34d399" stroke-width="2.5"/>
              <text y="3.5" font-size="8" font-weight="bold" fill="#6ee7b7" text-anchor="middle" font-family="monospace">START</text>
            </g>
            <g class="zpw-graph-node" transform="translate(70, 130)">
              <circle r="10" fill="#1e1b4b" stroke="#38bdf8" stroke-width="2"/>
              <text y="3.5" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">A</text>
            </g>
            <g class="zpw-graph-node" transform="translate(115, 95)">
              <circle r="10" fill="#701a75" stroke="#f472b6" stroke-width="2"/>
              <text y="3.5" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">B</text>
            </g>
            <g class="zpw-graph-node" transform="translate(165, 95)">
              <circle r="10" fill="#3b0764" stroke="#a855f7" stroke-width="2"/>
              <text y="3.5" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">C</text>
            </g>
            <g class="zpw-graph-node" transform="translate(140, 140)">
              <circle r="11" fill="#047857" stroke="#34d399" stroke-width="2.5"/>
              <text y="3.5" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">D</text>
            </g>
            <g class="zpw-graph-node" transform="translate(195, 135)">
              <circle r="10" fill="#701a75" stroke="#f472b6" stroke-width="2"/>
              <text y="3.5" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">F</text>
            </g>
            <g class="zpw-graph-node" transform="translate(245, 110)">
              <circle r="11" fill="#064e3b" stroke="#34d399" stroke-width="2.5"/>
              <text y="3.5" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">K</text>
            </g>

            <!-- Sorting Bars at Bottom Right -->
            <g transform="translate(190, 168)">
              <rect class="zpw-adsa-bar" x="0" y="0" width="8" height="28" rx="2" fill="#a855f7"/>
              <rect class="zpw-adsa-bar" x="12" y="0" width="8" height="18" rx="2" fill="#ec4899"/>
              <rect class="zpw-adsa-bar" x="24" y="0" width="8" height="34" rx="2" fill="#38bdf8"/>
              <rect class="zpw-adsa-bar" x="36" y="0" width="8" height="14" rx="2" fill="#10b981"/>
              <rect class="zpw-adsa-bar" x="48" y="0" width="8" height="24" rx="2" fill="#f59e0b"/>
            </g>
          </svg>
        </div>`
    },
    dbms: {
      title: 'Connecting your database workspace...',
      status: 'ENTERPRISE DATABASE CLUSTERS CONNECTING',
      code: `-- Enterprise Relational Engine & Query Optimizer
CREATE TABLE zipshare_records (
    record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_code VARCHAR(32) NOT NULL,
    lab_title TEXT NOT NULL,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_subject_status ON zipshare_records (subject_code, is_published);
SELECT * FROM zipshare_records WHERE subject_code = 'DBMS' ORDER BY created_at DESC;`,
      svg: `
        <div class="zpw-dbms-3d-stage">
          <svg class="zpw-dbms-svg" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="dbBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#021f18"/>
                <stop offset="25%" stop-color="#064e3b"/>
                <stop offset="50%" stop-color="#047857"/>
                <stop offset="75%" stop-color="#064e3b"/>
                <stop offset="100%" stop-color="#01140f"/>
              </linearGradient>
              <linearGradient id="dbNeonCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.2"/>
                <stop offset="50%" stop-color="#38bdf8" stop-opacity="1"/>
                <stop offset="100%" stop-color="#22d3ee" stop-opacity="0.2"/>
              </linearGradient>
              <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <ellipse cx="120" cy="195" rx="55" ry="14" fill="#000000" opacity="0.8"/>
            <path d="M68 55 C68 40 91 30 120 30 C149 30 172 40 172 55 L172 175 C172 190 149 200 120 200 C91 200 68 190 68 175 Z" fill="url(#dbBodyGrad)" stroke="#065f46" stroke-width="1.5"/>
            <ellipse class="zpw-db-ring-glow" cx="120" cy="85" rx="52" ry="13" fill="none" stroke="url(#dbNeonCyan)" stroke-width="3" filter="url(#cyanGlow)"/>
            <ellipse class="zpw-db-ring-glow" cx="120" cy="120" rx="52" ry="13" fill="none" stroke="url(#dbNeonCyan)" stroke-width="3" filter="url(#cyanGlow)"/>
            <ellipse class="zpw-db-ring-glow" cx="120" cy="155" rx="52" ry="13" fill="none" stroke="url(#dbNeonCyan)" stroke-width="3" filter="url(#cyanGlow)"/>
            <ellipse class="zpw-db-ring-glow" cx="120" cy="188" rx="52" ry="13" fill="none" stroke="url(#dbNeonCyan)" stroke-width="3" filter="url(#cyanGlow)"/>
            <ellipse cx="120" cy="55" rx="52" ry="13" fill="#065f46" stroke="#22d3ee" stroke-width="2"/>
            <ellipse cx="120" cy="55" rx="34" ry="8.5" fill="#022c22" stroke="#38bdf8" stroke-width="2.5" filter="url(#cyanGlow)"/>
            <ellipse cx="120" cy="55" rx="16" ry="4" fill="#67e8f9" filter="url(#cyanGlow)"/>
            <g class="zpw-db-cage" stroke="#38bdf8" stroke-width="1" opacity="0.85">
              <line x1="50" y1="45" x2="68" y2="25"/>
              <line x1="68" y1="25" x2="120" y2="18"/>
              <line x1="120" y1="18" x2="172" y2="25"/>
              <line x1="172" y1="25" x2="190" y2="45"/>
              <line x1="50" y1="45" x2="44" y2="105"/>
              <line x1="44" y1="105" x2="50" y2="165"/>
              <line x1="50" y1="165" x2="68" y2="215"/>
              <line x1="68" y1="215" x2="120" y2="222"/>
              <line x1="120" y1="222" x2="172" y2="215"/>
              <line x1="172" y1="215" x2="190" y2="165"/>
              <line x1="190" y1="165" x2="196" y2="105"/>
              <line x1="196" y1="105" x2="190" y2="45"/>
              <line x1="50" y1="45" x2="120" y2="55"/>
              <line x1="190" y1="45" x2="120" y2="55"/>
              <line x1="44" y1="105" x2="68" y2="85"/>
              <line x1="44" y1="105" x2="120" y2="120"/>
              <line x1="196" y1="105" x2="172" y2="85"/>
              <line x1="196" y1="105" x2="120" y2="120"/>
              <line x1="50" y1="165" x2="120" y2="155"/>
              <line x1="190" y1="165" x2="120" y2="155"/>
              <line x1="68" y1="215" x2="120" y2="188"/>
              <line x1="172" y1="215" x2="120" y2="188"/>
              <line x1="44" y1="105" x2="50" y2="45"/>
              <line x1="120" y1="18" x2="120" y2="55"/>
              <line x1="120" y1="222" x2="120" y2="188"/>
            </g>
            <g fill="#38bdf8" filter="url(#cyanGlow)">
              <circle cx="50" cy="45" r="3.5"/>
              <circle cx="68" cy="25" r="3"/>
              <circle cx="120" cy="18" r="4"/>
              <circle cx="172" cy="25" r="3"/>
              <circle cx="190" cy="45" r="3.5"/>
              <circle cx="44" cy="105" r="4"/>
              <circle cx="196" cy="105" r="4"/>
              <circle cx="50" cy="165" r="3.5"/>
              <circle cx="190" cy="165" r="3.5"/>
              <circle cx="68" cy="215" r="3"/>
              <circle cx="120" cy="222" r="4"/>
              <circle cx="172" cy="215" r="3"/>
            </g>
            <circle class="zpw-db-node-pulse" cx="84" cy="120" r="3" fill="#ffffff" filter="url(#cyanGlow)"/>
            <circle class="zpw-db-node-pulse" cx="156" cy="155" r="3" fill="#ffffff" filter="url(#cyanGlow)"/>
          </svg>
        </div>`
    }
  };

  const conf = configs[category] || configs.java;
  if (titleEl) titleEl.textContent = conf.title;
  if (statusEl) statusEl.textContent = conf.status;
  if (codeBackdrop) codeBackdrop.textContent = conf.code;
  if (wrapper) wrapper.innerHTML = conf.svg;

  initTransCanvas(category);

  let startTime = performance.now();
  const duration = 2300;

  function stepProgress(now) {
    const elapsed = now - startTime;
    const progress = Math.min(100, (elapsed / duration) * 100);
    if (barEl) barEl.style.width = progress + '%';

    if (progress < 100) {
      requestAnimationFrame(stepProgress);
    } else {
      setTimeout(() => {
        finalizeHomeOpening(category);
      }, 250);
    }
  }
  requestAnimationFrame(stepProgress);
}

function finalizeHomeOpening(category) {
  if (zpwTransAnimFrame) cancelAnimationFrame(zpwTransAnimFrame);

  const screen1 = $('zpwScreen1');
  const screen2 = $('zpwScreen2');
  const screen3 = $('zpwScreen3');
  const transScreen = $('zpwScreenTransition');

  if (transScreen) transScreen.classList.add('zpw-fade-out');

  setTimeout(() => {
    [screen1, screen2, screen3, transScreen].forEach(s => {
      if (s) {
        s.style.display = 'none';
        s.classList.remove('active', 'zpw-fade-in');
      }
    });

    const container = $('zipshareWelcomeContainer');
    if (container) {
      container.classList.add('hidden');
      container.style.display = 'none';
    }

    const appEl = $('app');
    if (appEl) {
      appEl.classList.add('show');
    }

    switchCategory(category);
    toast(`${category.toUpperCase()} Workspace Active! 🚀`, 'success');
  }, 350);
}

function initTransCanvas(category) {
  const canvas = $('zpwTransCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;

  const particles = [];
  const count = 65;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * (category === 'c' ? 0.3 : 0.8),
      vy: category === 'java' ? -(Math.random() * 1.6 + 0.4) : (category === 'c' ? Math.random() * 2 + 0.6 : (Math.random() - 0.5) * 0.8),
      radius: Math.random() * 2.5 + 1,
      alpha: Math.random() * 0.8 + 0.2,
      char: String.fromCharCode(48 + Math.floor(Math.random() * 2))
    });
  }

  function renderTrans() {
    ctx.clearRect(0, 0, w, h);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (category === 'java') {
        if (p.y < 0) { p.y = h; p.x = Math.random() * w; }
        ctx.fillStyle = Math.random() > 0.5 ? '#f97316' : '#ef4444';
      } else if (category === 'python') {
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.fillStyle = Math.random() > 0.5 ? '#38bdf8' : '#eab308';
      } else if (category === 'c') {
        if (p.y > h) { p.y = 0; p.x = Math.random() * w; }
        ctx.fillStyle = '#22d3ee';
        ctx.font = '11px monospace';
        ctx.fillText(p.char, p.x, p.y);
        return;
      } else if (category === 'adsa') {
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.fillStyle = Math.random() > 0.5 ? '#a855f7' : '#ec4899';
      } else {
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.fillStyle = Math.random() > 0.5 ? '#10b981' : '#14b8a6';
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    zpwTransAnimFrame = requestAnimationFrame(renderTrans);
  }

  renderTrans();
}

// =========================================================
// SUBJECT-SPECIFIC FULL-SCREEN LANGUAGE LOADING TRANSITIONS
// =========================================================
let langLoadingAnimFrame = null;

const LANG_CONFIGS = {
  java: {
    title: 'Brewing your Java workspace...',
    status: 'JAVA VIRTUAL MACHINE INITIALIZING',
    code: `// Java Virtual Machine Boot Sequence
public class ZipShareLab {
    private static final Logger log = LoggerFactory.getLogger(ZipShareLab.class);
    public static void main(String[] args) throws InterruptedException {
        ConcurrentHashMap<String, Program> labStore = new ConcurrentHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
        CompletableFuture.supplyAsync(() -> labStore.put("java", new Program("OOP Architecture")))
            .thenAccept(res -> log.info("Java Environment Loaded."));
    }
}`,
    svg: `
      <div class="zpw-java-3d-stage">
        <svg class="zpw-java-cup-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="cupGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#f97316"/>
              <stop offset="50%" stop-color="#ef4444"/>
              <stop offset="100%" stop-color="#991b1b"/>
            </linearGradient>
            <linearGradient id="steamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stop-color="#f97316" stop-opacity="0.8"/>
              <stop offset="50%" stop-color="#fb923c" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#fef08a" stop-opacity="0.1"/>
            </linearGradient>
          </defs>
          <ellipse cx="100" cy="165" rx="72" ry="14" fill="#1e1b4b" stroke="#f97316" stroke-width="2.5" opacity="0.9"/>
          <ellipse cx="100" cy="164" rx="56" ry="9" fill="#0f172a" stroke="#fb923c" stroke-width="1.2"/>
          <path d="M48 95 C48 152 70 158 100 158 C130 158 152 152 152 95 Z" fill="url(#cupGrad)" stroke="#fed7aa" stroke-width="2"/>
          <ellipse cx="100" cy="95" rx="52" ry="14" fill="#451a03" stroke="#f97316" stroke-width="2"/>
          <ellipse cx="100" cy="96" rx="44" ry="10" fill="#2d1205"/>
          <path d="M72 96 C80 92 120 100 128 96" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
          <path d="M148 105 C175 105 175 142 144 145" fill="none" stroke="#f97316" stroke-width="5" stroke-linecap="round"/>
          <path class="zpw-steam-path-1" d="M85 82 C78 60 102 45 92 22" fill="none" stroke="url(#steamGrad)" stroke-width="4.5" stroke-linecap="round"/>
          <path class="zpw-steam-path-2" d="M102 80 C95 55 118 40 108 14" fill="none" stroke="url(#steamGrad)" stroke-width="5" stroke-linecap="round"/>
          <path class="zpw-steam-path-3" d="M118 84 C112 65 130 52 124 28" fill="none" stroke="url(#steamGrad)" stroke-width="4" stroke-linecap="round"/>
        </svg>
      </div>`
  },
  python: {
    title: 'Uncoiling your Python workspace...',
    status: 'PYTHON 3.12 RUNTIME COMPOSING',
    code: `# Python High-Performance Engine Boot
import asyncio, sys, json
from dataclasses import dataclass

@dataclass
class Workspace:
    name: str = "ZipShare Python"
    version: str = "3.12-optimized"

async def init_runtime():
    pipeline = [x**2 for x in range(1000) if x % 2 == 0]
    yield from pipeline
    return Workspace()

asyncio.run(init_runtime())`,
    svg: `
      <div class="zpw-python-3d-stage">
        <svg class="zpw-python-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="pyBlue" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#1d4ed8"/>
            </linearGradient>
            <linearGradient id="pyYellow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="100%" stop-color="#eab308"/>
            </linearGradient>
          </defs>
          <path d="M98 22 C60 22 45 36 45 60 L45 80 L98 80 L98 90 L30 90 C15 90 2 105 2 135 C2 165 18 178 52 178 L70 178 L70 155 C70 135 85 120 105 120 L152 120 C172 120 188 105 188 85 L188 60 C188 36 172 22 135 22 Z" fill="url(#pyBlue)" opacity="0.95"/>
          <circle cx="70" cy="45" r="7" fill="#ffffff"/>
          <circle cx="70" cy="45" r="3.5" fill="#0369a1"/>
          <path d="M102 178 C140 178 155 164 155 140 L155 120 L102 120 L102 110 L170 110 C185 110 198 95 198 65 C198 35 182 22 148 22 L130 22 L130 45 C130 65 115 80 95 80 L48 80 C28 80 12 95 12 115 L12 140 C12 164 28 178 65 178 Z" fill="url(#pyYellow)" opacity="0.95"/>
          <circle cx="130" cy="155" r="7" fill="#ffffff"/>
          <circle cx="130" cy="155" r="3.5" fill="#a16207"/>
        </svg>
      </div>`
  },
  c: {
    title: 'Compiling your C workspace...',
    status: 'GCC LOW-LEVEL COMPILER LINKING',
    code: `/* Low-Level C Systems Runtime Kernel */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    uint32_t memory_addr;
    char buffer[256];
} SystemRegistry;

int main(int argc, char **argv) {
    SystemRegistry *reg = (SystemRegistry*)malloc(sizeof(SystemRegistry));
    reg->memory_addr = 0x7FFF8000;
    strncpy(reg->buffer, "SYS_READY", sizeof(reg->buffer));
    return 0;
}`,
    svg: `
      <div class="zpw-c-3d-stage">
        <svg class="zpw-c-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="cMetallic" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#475569"/>
              <stop offset="35%" stop-color="#94a3b8"/>
              <stop offset="70%" stop-color="#334155"/>
              <stop offset="100%" stop-color="#0f172a"/>
            </linearGradient>
            <linearGradient id="cCyanNeon" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#06b6d4"/>
            </linearGradient>
          </defs>
          <path d="M155 58 C142 36 122 22 96 22 C52 22 20 58 20 102 C20 146 52 182 96 182 C124 182 144 168 156 146 L124 130 C116 142 108 148 96 148 C72 148 54 128 54 102 C54 76 72 56 96 56 C108 56 116 62 124 74 Z" fill="#030812" transform="translate(6, 6)"/>
          <path d="M155 58 C142 36 122 22 96 22 C52 22 20 58 20 102 C20 146 52 182 96 182 C124 182 144 168 156 146 L124 130 C116 142 108 148 96 148 C72 148 54 128 54 102 C54 76 72 56 96 56 C108 56 116 62 124 74 Z" fill="url(#cMetallic)" stroke="url(#cCyanNeon)" stroke-width="4"/>
          <path d="M142 66 C132 48 116 38 96 38 C60 38 34 66 34 102 C34 138 60 166 96 166 C116 166 132 156 142 138" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-dasharray="6 3"/>
        </svg>
      </div>`
  },
  adsa: {
    title: 'Building your algorithm workspace...',
    status: 'GRAPH & TREE TOPOLOGY STRUCTURING',
    code: `// Advanced Data Structures & Algorithm Core
template <typename T>
class RedBlackTree {
    struct Node {
        T data;
        bool color; // RED = true, BLACK = false
        Node *left, *right, *parent;
    };
    Node *root;
    void rotateLeft(Node *&root, Node *&pt);
    void fixViolation(Node *&root, Node *&pt);
};`,
    svg: `
      <div class="zpw-adsa-3d-stage">
        <svg class="zpw-adsa-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="adsaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#c084fc"/>
              <stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient>
          </defs>
          <line x1="100" y1="42" x2="60" y2="88" stroke="#a855f7" stroke-width="3"/>
          <line x1="100" y1="42" x2="140" y2="88" stroke="#a855f7" stroke-width="3"/>
          <line x1="60" y1="88" x2="36" y2="138" stroke="#c084fc" stroke-width="2.5"/>
          <line x1="60" y1="88" x2="84" y2="138" stroke="#c084fc" stroke-width="2.5"/>
          <line x1="140" y1="88" x2="116" y2="138" stroke="#c084fc" stroke-width="2.5"/>
          <line x1="140" y1="88" x2="164" y2="138" stroke="#c084fc" stroke-width="2.5"/>
          <circle cx="100" cy="42" r="18" fill="url(#adsaGrad)" stroke="#f3e8ff" stroke-width="2"/>
          <text x="100" y="47" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="12" fill="#ffffff">50</text>
          <circle cx="60" cy="88" r="15" fill="#581c87" stroke="#c084fc" stroke-width="2"/>
          <text x="60" y="93" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="11" fill="#ffffff">25</text>
          <circle cx="140" cy="88" r="15" fill="#581c87" stroke="#c084fc" stroke-width="2"/>
          <text x="140" y="93" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="11" fill="#ffffff">75</text>
          <circle cx="36" cy="138" r="12" fill="#3b0764" stroke="#a855f7" stroke-width="1.8"/>
          <circle cx="84" cy="138" r="12" fill="#3b0764" stroke="#a855f7" stroke-width="1.8"/>
          <circle cx="116" cy="138" r="12" fill="#3b0764" stroke="#a855f7" stroke-width="1.8"/>
          <circle cx="164" cy="138" r="12" fill="#3b0764" stroke="#a855f7" stroke-width="1.8"/>
          <g transform="translate(45, 168)">
            <rect class="zpw-adsa-bar b1" x="0" y="6" width="12" height="20" rx="3" fill="#ec4899"/>
            <rect class="zpw-adsa-bar b2" x="18" y="14" width="12" height="12" rx="3" fill="#a855f7"/>
            <rect class="zpw-adsa-bar b3" x="36" y="2" width="12" height="24" rx="3" fill="#8b5cf6"/>
            <rect class="zpw-adsa-bar b4" x="54" y="18" width="12" height="8" rx="3" fill="#6366f1"/>
            <rect class="zpw-adsa-bar b5" x="72" y="10" width="12" height="16" rx="3" fill="#38bdf8"/>
            <rect class="zpw-adsa-bar b6" x="90" y="0" width="12" height="26" rx="3" fill="#10b981"/>
          </g>
        </svg>
      </div>`
  },
  dbms: {
    title: 'Connecting your database workspace...',
    status: 'RELATIONAL ENGINE CONNECTING',
    code: `-- Relational Schema & Optimization Kernel
SELECT e.id, e.name, COUNT(f.id) as total_solutions
FROM experiments e
LEFT JOIN files f ON f.experiment_number = e.sno
WHERE e.category = 'DBMS' AND e.status = 'available'
GROUP BY e.id, e.name
ORDER BY e.sno ASC;`,
    svg: `
      <div class="zpw-dbms-3d-stage">
        <svg class="zpw-dbms-svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="dbDisk1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#14b8a6"/>
              <stop offset="50%" stop-color="#0d9488"/>
              <stop offset="100%" stop-color="#042f2e"/>
            </linearGradient>
            <linearGradient id="dbDisk2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#06b6d4"/>
              <stop offset="50%" stop-color="#0891b2"/>
              <stop offset="100%" stop-color="#164e63"/>
            </linearGradient>
          </defs>
          <g transform="translate(0, 115)">
            <ellipse cx="100" cy="30" rx="64" ry="18" fill="url(#dbDisk1)" stroke="#5eead4" stroke-width="2"/>
            <path d="M36 30 L36 48 C36 58 64 66 100 66 C136 66 164 58 164 48 L164 30 Z" fill="#042f2e" stroke="#2dd4bf" stroke-width="2"/>
          </g>
          <g transform="translate(0, 75)">
            <ellipse cx="100" cy="30" rx="64" ry="18" fill="url(#dbDisk2)" stroke="#67e8f9" stroke-width="2"/>
            <path d="M36 30 L36 48 C36 58 64 66 100 66 C136 66 164 58 164 48 L164 30 Z" fill="#083344" stroke="#22d3ee" stroke-width="2"/>
          </g>
          <g transform="translate(0, 35)">
            <ellipse cx="100" cy="30" rx="64" ry="18" fill="url(#dbDisk1)" stroke="#5eead4" stroke-width="2.5"/>
            <path d="M36 30 L36 48 C36 58 64 66 100 66 C136 66 164 58 164 48 L164 30 Z" fill="#042f2e" stroke="#2dd4bf" stroke-width="2"/>
            <ellipse cx="100" cy="30" rx="54" ry="14" fill="#0f766e" stroke="#99f6e4" stroke-width="1.2"/>
            <line x1="60" y1="30" x2="140" y2="30" stroke="#ccfbf1" stroke-width="1.5" stroke-dasharray="4 3"/>
          </g>
        </svg>
      </div>`
  }
};

function triggerLanguageLoadingTransition(category, loadPromise) {
  const overlay = $('languageLoadingOverlay');
  if (!overlay) return;

  const cfg = LANG_CONFIGS[category];
  if (!cfg) return;

  // Set theme & title
  overlay.className = `lang-loading-overlay theme-${category}`;
  overlay.style.display = 'flex';
  overlay.classList.remove('fade-out');

  if ($('langTransVisualWrapper')) $('langTransVisualWrapper').innerHTML = cfg.svg;
  if ($('langTransTitle')) $('langTransTitle').textContent = cfg.title;
  if ($('langTransStatusLabel')) $('langTransStatusLabel').textContent = cfg.status;
  if ($('langTransCodeBackdrop')) $('langTransCodeBackdrop').textContent = cfg.code.repeat(4);

  const bar = $('langTransProgressBar');
  if (bar) bar.style.width = '15%';

  // Start particles
  initLangTransCanvas(category);

  // Smooth progress animation
  let p = 15;
  const startTime = Date.now();
  const minDisplayMs = 550; // Smooth visual threshold, never freezing or blocking 4s

  const progressInterval = setInterval(() => {
    p = Math.min(p + 14, 90);
    if (bar) bar.style.width = `${p}%`;
  }, 100);

  const finishTransition = () => {
    clearInterval(progressInterval);
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, minDisplayMs - elapsed);

    setTimeout(() => {
      if (bar) bar.style.width = '100%';
      setTimeout(() => {
        overlay.classList.add('fade-out');
        setTimeout(() => {
          overlay.style.display = 'none';
          if (langLoadingAnimFrame) {
            cancelAnimationFrame(langLoadingAnimFrame);
            langLoadingAnimFrame = null;
          }
        }, 400);
      }, 150);
    }, remaining);
  };

  if (loadPromise && typeof loadPromise.then === 'function') {
    loadPromise.then(finishTransition).catch(err => {
      console.warn('Language load warning:', err);
      finishTransition();
    });
  } else {
    setTimeout(finishTransition, minDisplayMs);
  }
}

function initLangTransCanvas(category) {
  const canvas = $('langTransCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;

  const particles = [];
  const count = 55;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.9,
      vy: category === 'java' ? -(Math.random() * 1.8 + 0.5) : (Math.random() - 0.5) * 0.9,
      radius: Math.random() * 2.5 + 1,
      alpha: Math.random() * 0.8 + 0.2
    });
  }

  function render() {
    ctx.clearRect(0, 0, w, h);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (category === 'java') {
        if (p.y < 0) { p.y = h; p.x = Math.random() * w; }
        ctx.fillStyle = Math.random() > 0.5 ? '#f97316' : '#ef4444';
      } else if (category === 'python') {
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.fillStyle = Math.random() > 0.5 ? '#38bdf8' : '#eab308';
      } else if (category === 'c') {
        if (p.y > h) { p.y = 0; p.x = Math.random() * w; }
        ctx.fillStyle = '#22d3ee';
      } else if (category === 'adsa') {
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.fillStyle = Math.random() > 0.5 ? '#a855f7' : '#ec4899';
      } else {
        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
        ctx.fillStyle = Math.random() > 0.5 ? '#10b981' : '#14b8a6';
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    langLoadingAnimFrame = requestAnimationFrame(render);
  }

  render();
}

// =========================================================
// SPOTLIGHT COMMAND SEARCH PALETTE (Ctrl + K / ⌘K)
// =========================================================
let cmdSelectedIdx = 0;
let cmdFilteredResults = [];
let cmdActiveSubject = 'all';

function initCommandSearch() {
  const triggerBtn = $('cmdSearchTriggerBtn');
  const overlay = $('cmdSearchOverlay');
  const input = $('cmdSearchInput');
  const resultsContainer = $('cmdResultsList');
  const filterChips = $('cmdFilterChips');

  if (triggerBtn) {
    triggerBtn.addEventListener('click', openCommandSearch);
  }

  // Global Keyboard Shortcut: Ctrl + K or ⌘K
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandSearch();
    } else if (e.key === 'Escape' && overlay && overlay.style.display === 'flex') {
      closeCommandSearch();
    }
  });

  if (overlay) {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeCommandSearch();
    });
  }

  if (input) {
    input.addEventListener('input', () => {
      renderCommandSearchResults(input.value.trim());
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveCmdSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveCmdSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCmdSelection();
      }
    });
  }

  if (filterChips) {
    filterChips.querySelectorAll('.cmd-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        filterChips.querySelectorAll('.cmd-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        cmdActiveSubject = btn.getAttribute('data-subject') || 'all';
        renderCommandSearchResults(input ? input.value.trim() : '');
      });
    });
  }
}

function openCommandSearch() {
  const overlay = $('cmdSearchOverlay');
  const input = $('cmdSearchInput');
  if (!overlay) return;

  overlay.style.display = 'flex';
  cmdSelectedIdx = 0;
  if (input) {
    input.value = '';
    input.focus();
  }
  renderCommandSearchResults('');
}

function closeCommandSearch() {
  const overlay = $('cmdSearchOverlay');
  if (overlay) overlay.style.display = 'none';
}

function renderCommandSearchResults(query) {
  const container = $('cmdResultsList');
  if (!container) return;

  let allItems = [];

  // Gather syllabus items
  if (syllabusData) {
    Object.keys(syllabusData).forEach(cat => {
      if (cmdActiveSubject !== 'all' && cmdActiveSubject !== cat) return;
      const course = syllabusData[cat];
      (course.exercises || []).forEach(ex => {
        (ex.questions || []).forEach(q => {
          allItems.push({
            type: 'syllabus',
            category: cat,
            experimentNumber: q.number,
            title: q.rawTitle || q.title,
            courseCode: course.code,
            file: (lastFiles || []).find(f => f.category === cat && f.experimentNumber === q.number)
          });
        });
      });
    });
  }

  // Also include uploaded files
  (lastFiles || []).forEach(f => {
    if (cmdActiveSubject !== 'all' && f.category !== cmdActiveSubject) return;
    if (!allItems.some(it => it.file && (it.file._id || it.file.id) === (f._id || f.id))) {
      allItems.push({
        type: 'file',
        category: f.category || 'code',
        experimentNumber: f.experimentNumber,
        title: f.experimentName || f.originalName,
        file: f
      });
    }
  });

  const q = query.toLowerCase();
  cmdFilteredResults = allItems.filter(item => {
    if (!q) return true;
    const t = (item.title || '').toLowerCase();
    const c = (item.category || '').toLowerCase();
    const sno = String(item.experimentNumber || '');
    return t.includes(q) || c.includes(q) || sno.includes(q);
  }).slice(0, 30);

  if (cmdFilteredResults.length === 0) {
    container.innerHTML = '<div class="cmd-empty-state">No matching lab programs found. Try another search.</div>';
    return;
  }

  cmdSelectedIdx = Math.min(cmdSelectedIdx, cmdFilteredResults.length - 1);

  let html = '';
  cmdFilteredResults.forEach((it, idx) => {
    const isSelected = idx === cmdSelectedIdx;
    const catIcon = ICONS[it.category] ? ICONS[it.category].icon : (it.category === 'java' ? '☕' : it.category === 'python' ? '🐍' : it.category === 'c' ? '💻' : it.category === 'dbms' ? '🗄️' : '🌳');
    const hasFile = Boolean(it.file);
    const expTag = it.experimentNumber ? `#${String(it.experimentNumber).padStart(2,'0')}` : 'FILE';

    html += `
      <div class="cmd-result-item ${isSelected ? 'selected' : ''}" data-idx="${idx}" onclick="selectCmdItemByIndex(${idx})">
        <div class="cmd-item-left">
          <span class="cmd-item-icon">${catIcon}</span>
          <div>
            <div class="cmd-item-title">${escapeHtml(it.title)}</div>
            <div class="cmd-item-meta">${escapeHtml(it.category.toUpperCase())} · <strong style="color:var(--accent);">${expTag}</strong> · ${hasFile ? '<span style="color:#10b981;">● Available</span>' : '<span style="color:#f59e0b;">○ Syllabus</span>'}</div>
          </div>
        </div>
        <div>
          ${hasFile ? '<button class="card-btn" style="padding:2px 8px; font-size:0.75rem;">👁 Open</button>' : '<span style="font-size:0.75rem; color:var(--text-dim);">Syllabus</span>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function moveCmdSelection(dir) {
  if (cmdFilteredResults.length === 0) return;
  cmdSelectedIdx = (cmdSelectedIdx + dir + cmdFilteredResults.length) % cmdFilteredResults.length;
  
  document.querySelectorAll('.cmd-result-item').forEach((el, idx) => {
    el.classList.toggle('selected', idx === cmdSelectedIdx);
    if (idx === cmdSelectedIdx) {
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

function selectCmdItemByIndex(idx) {
  cmdSelectedIdx = idx;
  executeCmdSelection();
}

function executeCmdSelection() {
  const item = cmdFilteredResults[cmdSelectedIdx];
  if (!item) return;

  closeCommandSearch();

  if (item.file) {
    previewFile(item.file._id || item.file.id);
  } else if (item.category) {
    switchCategory(item.category);
  }
}

// =========================================================
// HERO SECTION ACTIONS
// =========================================================
function initHeroActions() {
  const exploreBtn = $('heroExploreBtn');
  if (exploreBtn) {
    exploreBtn.addEventListener('click', () => {
      const target = $('labLayoutWrapper') || $('fileGrid');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const browseBtn = $('heroBrowseBtn');
  if (browseBtn) {
    browseBtn.addEventListener('click', () => {
      const target = $('filters');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

function initCosmicParticles() {
  const canvas = $('zpwCosmicCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;

  const onResize = () => {
    if (!canvas) return;
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', onResize);

  // Starfield with gravitational deflection
  const stars = [];
  const starCount = Math.min(140, Math.floor((w * h) / 10000));
  for (let i = 0; i < starCount; i++) {
    stars.push({
      ox: Math.random() * w,
      oy: Math.random() * h,
      size: Math.random() * 1.8 + 0.6,
      baseAlpha: Math.random() * 0.7 + 0.3,
      twinkleSpeed: Math.random() * 0.04 + 0.01,
      twinklePhase: Math.random() * Math.PI * 2
    });
  }

  // Relativistic accretion disk particles
  const diskParticles = [];
  const numDisk = w < 768 ? 160 : 280;
  for (let i = 0; i < numDisk; i++) {
    const orbitR = Math.random() * 0.65 + 0.35; // Normalized radius
    diskParticles.push({
      orbitR: orbitR,
      angle: Math.random() * Math.PI * 2,
      speed: (0.018 / Math.sqrt(orbitR)) * (Math.random() * 0.3 + 0.85),
      size: Math.random() * 2.8 + 1.0,
      zOffset: (Math.random() - 0.5) * 14,
      sparkle: Math.random() * 0.5 + 0.5
    });
  }

  // Infalling matter stream filaments
  const streams = [];
  for (let s = 0; s < 6; s++) {
    streams.push({
      angle: (s * Math.PI * 2) / 6,
      r: 1.0,
      speed: 0.006 + Math.random() * 0.004,
      width: Math.random() * 2 + 1.2
    });
  }

  let frame = 0;

  function renderCosmic() {
    frame++;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * (w < 768 ? 0.44 : 0.48); // Adaptive vertical center for mobile layout
    const baseR = Math.min(w, h) * (w < 768 ? 0.22 : 0.18); // Event horizon radius
    const tilt = 0.28; // Accretion disk tilt factor

    // 1. Starfield with Gravitational Lensing Deflection
    stars.forEach(st => {
      st.twinklePhase += st.twinkleSpeed;
      const alpha = st.baseAlpha * (0.7 + 0.3 * Math.sin(st.twinklePhase));

      const dx = st.ox - cx;
      const dy = st.oy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let px = st.ox;
      let py = st.oy;

      if (dist > baseR * 0.9 && dist < baseR * 4.2) {
        const deflection = (baseR * baseR * 14) / (dist * dist + 100);
        px -= (dx / dist) * deflection;
        py -= (dy / dist) * deflection;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, st.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 2. Accretion Glow / Corona
    const outerGlow = ctx.createRadialGradient(cx, cy, baseR * 0.9, cx, cy, baseR * 3.4);
    outerGlow.addColorStop(0, 'rgba(251, 146, 60, 0.42)');
    outerGlow.addColorStop(0.25, 'rgba(234, 88, 12, 0.26)');
    outerGlow.addColorStop(0.6, 'rgba(180, 83, 9, 0.12)');
    outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 3.4, 0, Math.PI * 2);
    ctx.fill();

    // 3. Einstein Gravitational Lensing Arcs (Gargantua curved light paths)
    // Upper lens arc
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy - baseR * 0.22, baseR * 1.58, baseR * 0.88, -0.06, Math.PI * 0.88, Math.PI * 2.12);
    ctx.strokeStyle = 'rgba(253, 186, 116, 0.75)';
    ctx.lineWidth = baseR * 0.26;
    ctx.shadowBlur = 24;
    ctx.shadowColor = '#f97316';
    ctx.stroke();
    ctx.restore();

    // Lower lens arc
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + baseR * 0.18, baseR * 1.42, baseR * 0.55, 0.05, 0, Math.PI);
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.45)';
    ctx.lineWidth = baseR * 0.18;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ea580c';
    ctx.stroke();
    ctx.restore();

    // 4. Infalling Gas Stream Trails
    streams.forEach(st => {
      st.r -= st.speed;
      if (st.r < 0.2) st.r = 1.0;
      st.angle += 0.024;
      const strR = baseR * (1.1 + st.r * 1.8);
      const sx = cx + Math.cos(st.angle) * strR;
      const sy = cy + Math.sin(st.angle) * strR * tilt;
      ctx.save();
      ctx.strokeStyle = `rgba(254, 215, 170, ${st.r * 0.6})`;
      ctx.lineWidth = st.width;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.sin(st.angle) * 12, sy + Math.cos(st.angle) * 12 * tilt);
      ctx.stroke();
      ctx.restore();
    });

    // 5. Relativistic Orbiting Accretion Disk Particles with Doppler Beaming
    diskParticles.sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle));

    diskParticles.forEach(p => {
      p.angle += p.speed;
      const r = baseR * (1.15 + p.orbitR * 2.1);
      const px = cx + Math.cos(p.angle) * r;
      const py = cy + Math.sin(p.angle) * r * tilt + p.zOffset;

      const dopplerFactor = Math.cos(p.angle); // -1 approaching on left, +1 receding on right
      let brightness = 0.65 - dopplerFactor * 0.35;
      let pColor;
      if (dopplerFactor < -0.3) {
        pColor = `rgba(255, 250, 230, ${brightness * 0.95})`; // Hot blue-white
      } else if (dopplerFactor < 0.3) {
        pColor = `rgba(251, 146, 60, ${brightness * 0.9})`; // Golden orange
      } else {
        pColor = `rgba(220, 38, 38, ${brightness * 0.75})`; // Redshifted deeper red
      }

      ctx.save();
      ctx.fillStyle = pColor;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#f97316';
      ctx.beginPath();
      ctx.arc(px, py, p.size * (1.1 - dopplerFactor * 0.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 6. Photon Ring (Razor-sharp glowing boundary)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.06, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 240, 0.95)';
    ctx.lineWidth = Math.max(2, baseR * 0.035);
    ctx.shadowBlur = 28;
    ctx.shadowColor = '#fbbf24';
    ctx.stroke();
    ctx.restore();

    // 7. Event Horizon Shadow (Absolute Singularity)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.shadowBlur = 0;
    ctx.fill();
    ctx.restore();

    zpwCosmicCanvasAnim = requestAnimationFrame(renderCosmic);
  }

  renderCosmic();
}

function initIntro() {
  initZipshareWelcome();
}

const themeToggle = $('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
}

// ---------------- Mouse Cursor Particle Bubbles ----------------
function initParticles() {
  const canvas = $('particleCanvas');
  if (!canvas) return;
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
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  if (subjectAnimFrame) cancelAnimationFrame(subjectAnimFrame);

  let frame = 0;

  function animate() {
    frame++;
    ctx.clearRect(0, 0, w, h);

    if (cat === 'python') {
      // Animated Slithering Python Snake
      const time = frame * 0.05;
      const centerY = h / 2;
      
      const numSegments = 22;
      const pathAmplitude = 14;

      const headX = w / 2 + 40 + Math.sin(time * 0.5) * 10;
      const headY = centerY + Math.sin(time * 1.5) * pathAmplitude;

      for (let i = numSegments; i >= 1; i--) {
        const segT = time - i * 0.12;
        const px = headX - i * 4.5;
        const py = centerY + Math.sin(segT * 1.5 + i * 0.1) * pathAmplitude;
        const radius = Math.max(3, 8 - (i * 0.22));

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = (i % 4 < 2) ? '#306998' : '#ffe873';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(headX, headY, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#306998';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#204a6e';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(headX + 3, headY - 3, 2.5, 0, Math.PI * 2);
      ctx.arc(headX + 3, headY + 3, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(headX + 4, headY - 3, 1.2, 0, Math.PI * 2);
      ctx.arc(headX + 4, headY + 3, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(headX - 2, headY - 4, 2, 0, Math.PI * 2);
      ctx.arc(headX - 2, headY + 4, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 182, 193, 0.6)';
      ctx.fill();

      if (Math.sin(time * 3) > 0.1) {
        ctx.beginPath();
        ctx.moveTo(headX + 8, headY);
        ctx.lineTo(headX + 13, headY);
        ctx.lineTo(headX + 16, headY - 3);
        ctx.moveTo(headX + 13, headY);
        ctx.lineTo(headX + 16, headY + 3);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

    } else if (cat === 'java') {
      const cx = w / 2;
      const cy = h / 2 + 6;

      ctx.beginPath();
      ctx.ellipse(cx, cy + 18, 22, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f89820';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx - 16, cy - 12);
      ctx.lineTo(cx + 16, cy - 12);
      ctx.quadraticCurveTo(cx + 14, cy + 16, cx, cy + 16);
      ctx.quadraticCurveTo(cx - 14, cy + 16, cx - 16, cy - 12);
      ctx.fillStyle = '#f89820';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx + 17, cy, 7, -Math.PI / 2, Math.PI / 2);
      ctx.strokeStyle = '#f89820';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(cx, cy - 10, 14, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4a2810';
      ctx.fill();

      for (let i = 0; i < 3; i++) {
        const sx = cx - 8 + i * 8;
        const progress = ((frame * 1.2 + i * 20) % 40) / 40;
        const sy = cy - 14 - progress * 24;
        const waveX = Math.sin(progress * Math.PI * 2 + i) * 4;
        const alpha = (1 - progress) * 0.7;

        ctx.beginPath();
        ctx.arc(sx + waveX, sy, 2 + progress * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      }

    } else if (cat === 'c') {
      const boxW = 100, boxH = 50;
      const boxX = w / 2 - boxW / 2;
      const boxY = h / 2 - boxH / 2;

      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(boxX + 8, boxY + 7, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(boxX + 16, boxY + 7, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.arc(boxX + 24, boxY + 7, 2.5, 0, Math.PI * 2); ctx.fill();

      ctx.font = '10px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('#include <stdio.h>', boxX + 8, boxY + 22);

      ctx.fillStyle = '#a855f7';
      ctx.fillText('int main() {', boxX + 8, boxY + 34);

      if (Math.floor(frame / 15) % 2 === 0) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(boxX + 72, boxY + 26, 6, 9);
      }

    } else if (cat === 'dbms') {
      const cx = w / 2;
      const cy = h / 2;

      [cy - 12, cy + 12].forEach((y, idx) => {
        ctx.fillStyle = idx === 0 ? '#0284c7' : '#0369a1';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;

        ctx.fillRect(cx - 24, y - 6, 48, 12);
        ctx.strokeRect(cx - 24, y - 6, 48, 12);

        ctx.beginPath();
        ctx.ellipse(cx, y - 6, 24, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        ctx.stroke();
      });

      const pktY = cy - 18 + ((frame * 1.5) % 36);
      ctx.beginPath();
      ctx.arc(cx, pktY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

    } else if (cat === 'adsa') {
      const rootX = w / 2, rootY = h / 2 - 16;
      const leftX = rootX - 28, leftY = rootY + 20;
      const rightX = rootX + 28, rightY = rootY + 20;

      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rootX, rootY); ctx.lineTo(leftX, leftY);
      ctx.moveTo(rootX, rootY); ctx.lineTo(rightX, rightY);
      ctx.stroke();

      const step = Math.floor(frame / 20) % 3;
      const nodes = [
        { x: rootX, y: rootY },
        { x: leftX, y: leftY },
        { x: rightX, y: rightY }
      ];

      nodes.forEach((node, idx) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = idx === step ? '#10b981' : '#8b5cf6';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      for (let i = 0; i < 5; i++) {
        const barH = 6 + Math.abs(Math.sin(frame * 0.08 + i)) * 12;
        const bx = w / 2 - 28 + i * 11;
        const by = h - 6;
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(bx, by - barH, 7, barH);
      }

    } else {
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
function switchCategory(cat, skipAnimation = false) {
  const prevCat = activeCategory;
  activeCategory = cat;

  document.querySelectorAll('.chip, .segment-btn, .filter-btn').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === cat);
  });

  const stages = {
    all: { icon: '⭐', title: 'All Files & Folders', desc: 'Browse all programming code, lab records, notes and project folders.' },
    java: { icon: '☕', title: 'Java Projects', desc: 'Object Oriented Programming, Multithreading, and Data Structures in Java.' },
    python: { icon: '🐍', title: 'Python Programs', desc: 'Lab programs, logic problems, algorithms, and scripts.' },
    c: { icon: '💻', title: 'C Language Programming', desc: 'Core C language lab exercises, pointers, matrix operations, and algorithms.' },
    dbms: { icon: '🗄️', title: 'Database Management Systems (DBMS)', desc: 'Database Management Systems Lab ( CSE, AIML, CSIT & CSG) · B23CS2104: 54 Official Lab Experiments.' },
    adsa: { icon: '🌳', title: 'Advanced Data Structures & Algorithms (ADSA)', desc: 'AVL Trees, Graphs, Hash Tables, and Red-Black Tree implementations.' },
    folders: { icon: '📁', title: 'Project Folders', desc: 'Multi-file student lab project directory structures.' },
    pinned: { icon: '📌', title: 'Pinned Highlights', desc: 'Important administrative releases and starred lab code.' }
  };

  const s = stages[cat] || stages.all;
  if ($('stageIcon')) $('stageIcon').textContent = s.icon;
  if ($('stageTitle')) $('stageTitle').textContent = s.title;
  if ($('stageDesc')) $('stageDesc').textContent = s.desc;
  if ($('gridSectionTitle')) $('gridSectionTitle').textContent = `${s.title} (${lastFiles.length})`;

  renderSubjectAnimation(cat);
  renderBreadcrumbs();

  const isLangSubject = ['java', 'python', 'c', 'adsa', 'dbms'].includes(cat);
  if (isLangSubject && !skipAnimation && prevCat !== cat) {
    const loadPromise = loadFiles();
    triggerLanguageLoadingTransition(cat, loadPromise);
  } else {
    loadFiles();
  }
}

function setSyllabusFilter(subject, exercise = null, question = null) {
  activeSyllabusSubject = subject;
  activeSyllabusExercise = exercise;
  activeSyllabusQuestion = question;

  const badge = $('activeSyllabusFilterBadge');
  const textEl = $('syllabusFilterText');

  if (subject || exercise || question) {
    if (badge) badge.style.display = 'inline-flex';
    let filterStr = (subject || '').toUpperCase();
    if (exercise) filterStr += ` › ${exercise}`;
    if (question) filterStr += ` › ${question}`;
    if (textEl) textEl.textContent = filterStr;
  } else {
    if (badge) badge.style.display = 'none';
  }

  loadFiles();
}

function clearSyllabusFilter() {
  setSyllabusFilter(null, null, null);
}

const clearSyllabusBtn = $('clearSyllabusFilterBtn');
if (clearSyllabusBtn) {
  clearSyllabusBtn.addEventListener('click', clearSyllabusFilter);
}

function renderBreadcrumbs() {
  const container = $('breadcrumbBar');
  if (!container) return;

  const categoryNames = {
    all: 'All Categories',
    java: 'Java',
    python: 'Python',
    c: 'C Language',
    dbms: 'DBMS',
    adsa: 'ADSA',
    folders: 'Folders',
    pinned: 'Pinned Items'
  };

  let html = `<span style="cursor:pointer; font-weight:600; color:var(--primary);" onclick="switchCategory('all')">🏠 Home</span>`;

  if (activeCategory && activeCategory !== 'all') {
    const name = categoryNames[activeCategory] || activeCategory.toUpperCase();
    html += ` <span style="color:var(--text-dim);">/</span> <span style="font-weight:600; color:var(--text);">${escapeHtml(name)}</span>`;
  }

  if (activeSyllabusSubject) {
    html += ` <span style="color:var(--text-dim);">/</span> <span style="color:var(--primary); font-weight:500;">Syllabus: ${escapeHtml(activeSyllabusSubject.toUpperCase())}</span>`;
  }

  if (searchSearchQuery) {
    html += ` <span style="color:var(--text-dim);">/</span> <span style="color:var(--primary);">Search: "${escapeHtml(searchSearchQuery)}"</span>`;
  }

  container.innerHTML = html;
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => switchCategory(chip.dataset.category));
});

// ---------------- Search & Autocomplete ----------------
const searchInput = $('searchInput');
const searchClearBtn = $('searchClearBtn');
const suggestionsPanel = $('suggestionsPanel');

if (searchInput) {
  searchInput.addEventListener('focus', () => {
    if (suggestionsPanel) suggestionsPanel.classList.add('show');
  });

  searchInput.addEventListener('input', e => {
    searchSearchQuery = e.target.value.trim();
    if (searchClearBtn) searchClearBtn.style.display = searchSearchQuery ? 'block' : 'none';
    
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(loadFiles, 200);
  });
}

document.addEventListener('click', e => {
  if (suggestionsPanel && !e.target.closest('.search-wrap')) {
    suggestionsPanel.classList.remove('show');
  }
});

if (searchClearBtn) {
  searchClearBtn.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    searchSearchQuery = '';
    searchClearBtn.style.display = 'none';
    loadFiles();
  });
}

async function loadSuggestions() {
  if (!suggestionsPanel) return;
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
        if (searchInput) searchInput.value = q;
        searchSearchQuery = q;
        if (searchClearBtn) searchClearBtn.style.display = 'block';
        suggestionsPanel.classList.remove('show');
        loadFiles();
      });
    });
  } catch { /* non-critical */ }
}

// // ---------------- Syllabus Sidebar Loading & Rendering ----------------
let currentSyllabusViewData = null;

async function loadSyllabus() {
  try {
    const res = await fetch('/syllabus.json');
    if (!res.ok) return;
    syllabusData = await res.json();
    renderSidebar();
  } catch (err) {
    console.warn('Could not load syllabus.json', err);
  }
}

function renderSidebar() {
  const treeContainer = $('syllabusTreeContainer');
  if (!treeContainer) return;

  const filterText = ($('syllabusSearchInput')?.value || '').toLowerCase().trim();
  let html = '';

  const officialCourses = [
    { key: 'java', title: 'Java Programming', code: 'B23CS2105', icon: '☕' },
    { key: 'python', title: 'Python Programming', code: 'B23CS2106', icon: '🐍' },
    { key: 'dbms', title: 'Database Management Systems', code: 'B23CS2104', icon: '🗄️' },
    { key: 'adsa', title: 'Advanced Data Structures & Algorithms', code: 'B23CI2102', icon: '🌳' }
  ];

  // Map available experiments from current view data
  const availableSet = new Map();
  if (currentSyllabusViewData && currentSyllabusViewData.items) {
    currentSyllabusViewData.items.forEach(it => {
      if (it.status === 'available') {
        availableSet.set(`${it.category}_${it.experimentNumber}`, true);
      }
    });
  }

  officialCourses.forEach(c => {
    const courseObj = syllabusData[c.key] || {};
    const exercises = courseObj.exercises || [];
    const questions = exercises[0]?.questions || [];

    // Filter questions
    const matchingQuestions = questions.filter(q => {
      if (!filterText) return true;
      return q.title.toLowerCase().includes(filterText) ||
             (q.keywords || []).some(k => k.toLowerCase().includes(filterText));
    });

    if (filterText && matchingQuestions.length === 0) return;

    const isSubActive = activeCategory === c.key || activeSyllabusSubject === c.key;

    html += `
      <div class="syllabus-subject-node ${isSubActive ? 'active' : ''}">
        <div class="syllabus-subject-header" onclick="toggleSyllabusSubject('${c.key}')">
          <span>${c.icon} ${escapeHtml(c.title)} (${questions.length})</span>
          <span class="tree-arrow" id="arrow_${c.key}">${isSubActive || filterText ? '▼' : '▶'}</span>
        </div>
        <div class="syllabus-subject-body" id="body_${c.key}" style="display: ${isSubActive || filterText ? 'block' : 'none'};">
    `;

    matchingQuestions.forEach(q => {
      const isAvail = availableSet.get(`${c.key}_${q.number}`);
      const isQActive = activeCategory === c.key && (searchSearchQuery === (q.rawTitle || q.title) || searchSearchQuery === String(q.number));

      html += `
        <div class="syllabus-question-item ${isQActive ? 'active' : ''}" 
             style="display:flex; justify-content:space-between; align-items:center; gap:6px;"
             onclick="selectSyllabusExperiment('${c.key}', ${q.number}, '${escapeHtml(q.rawTitle || q.title)}')">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:65%;" title="${escapeHtml(q.title)}">
            ${escapeHtml(q.title)}
          </span>
          ${isAvail ? `<span class="status-tag-available">AVAILABLE</span>` : `<span class="status-tag-coming-soon">COMING SOON</span>`}
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  treeContainer.innerHTML = html;
}

function selectSyllabusExperiment(cat, num, rawTitle) {
  switchCategory(cat);
  searchSearchQuery = rawTitle || '';
  const searchInput = $('searchInput');
  if (searchInput) searchInput.value = rawTitle || '';
  const clearBtn = $('searchClearBtn');
  if (clearBtn) clearBtn.style.display = searchSearchQuery ? 'block' : 'none';
  loadFiles();
}

function toggleSyllabusSubject(subKey) {
  const body = $(`body_${subKey}`);
  const arrow = $(`arrow_${subKey}`);
  if (!body) return;

  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
}

const syllabusSearchInput = $('syllabusSearchInput');
if (syllabusSearchInput) {
  syllabusSearchInput.addEventListener('input', renderSidebar);
}

// Sidebar toggle drawer for desktop & mobile
const sidebarToggleBtn = $('sidebarToggleBtn');
const sidebarCollapseBtn = $('sidebarCollapseBtn');
const mobileSidebarTrigger = $('mobileSidebarTrigger');
const labSidebar = $('labSidebar');

if (sidebarToggleBtn && labSidebar) {
  sidebarToggleBtn.addEventListener('click', () => {
    labSidebar.classList.toggle('collapsed');
  });
}

if (sidebarCollapseBtn && labSidebar) {
  sidebarCollapseBtn.addEventListener('click', () => {
    labSidebar.classList.add('collapsed');
  });
}

if (mobileSidebarTrigger && labSidebar) {
  mobileSidebarTrigger.addEventListener('click', () => {
    labSidebar.classList.toggle('show-mobile');
  });
}

// ---------------- Load & Render Files ----------------
async function loadFiles() {
  try {
    const params = new URLSearchParams();
    if (searchSearchQuery) params.set('q', searchSearchQuery);
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (activeSyllabusSubject) params.set('subject', activeSyllabusSubject);
    if (activeSyllabusExercise) params.set('exercise', activeSyllabusExercise);
    if (activeSyllabusQuestion) params.set('question', activeSyllabusQuestion);

    const sortEl = $('sortSelect');
    if (sortEl) params.set('sort', sortEl.value);

    // Fetch pinned files for top pinned highlight section
    fetch('/api/files?filter=pinned')
      .then(r => r.json())
      .then(pFiles => renderPinnedSection(pFiles))
      .catch(() => {});

    const isSyllabusCat = ['all', 'java', 'python', 'adsa', 'dbms'].includes(activeCategory);

    if (isSyllabusCat && !activeSyllabusExercise && !activeSyllabusQuestion) {
      const res = await fetch(`/api/syllabus/view?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load syllabus view');
      const data = await res.json();
      currentSyllabusViewData = data;
      lastFiles = data.items.map(it => it.file).filter(Boolean);
      renderSyllabusFiles(data);
    } else {
      const res = await fetch(`/api/files?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load files from server');
      const files = await res.json();
      lastFiles = files;
      renderFiles(files);
    }

    renderBreadcrumbs();
    loadStats();
    loadSuggestions();
    renderSidebar();
  } catch (err) {
    console.error('loadFiles error:', err);
    toast('Could not connect to server file index.', 'error');
  }
}

const sortSelect = $('sortSelect');
if (sortSelect) sortSelect.addEventListener('change', loadFiles);

// Render Pinned Highlight Section at the Top (Always real files)
function renderPinnedSection(files) {
  const section = $('pinnedSection');
  const grid = $('pinnedGrid');
  if (!section || !grid) return;

  const pinnedFiles = (files || []).filter(f => f.pinned);

  if (pinnedFiles.length === 0) {
    section.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  section.style.display = 'block';
  grid.innerHTML = '';

  const isAdmin = Boolean(adminToken);

  pinnedFiles.forEach(file => {
    const ext = (file.extension || 'default').toLowerCase();
    const meta = ICONS[ext] || ICONS.default;
    const runnable = isRunnableFile(file);

    const card = document.createElement('div');
    card.className = 'pinned-item-card';

    const displayName = file.experimentName 
      ? `${file.experimentNumber ? `#${file.experimentNumber} ` : ''}${file.experimentName}` 
      : file.originalName;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <span class="pinned-icon">${meta.icon}</span>
        ${isAdmin ? `<button class="card-btn danger" style="padding:2px 6px; font-size:0.7rem;" onclick="togglePinFile('${file._id || file.id}', false)">Unpin</button>` : ''}
      </div>
      <h4 class="pinned-title" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</h4>
      <p class="pinned-meta">${file.category ? file.category.toUpperCase() : 'CODE'} · ${fmtSize(file.size)}</p>
      <div style="display:flex; gap:6px; margin-top:8px;">
        <button class="card-btn" style="flex:1; padding:4px; font-size:0.75rem;" onclick="previewFile('${file._id || file.id}')">👁 View</button>
        ${runnable ? `<button class="card-btn primary" style="flex:1; padding:4px; font-size:0.75rem;" onclick="runOnlineFile('${file._id || file.id}')">▶ Run</button>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });
}

// Render Official Syllabus Experiments with Available + Coming Soon
function renderSyllabusFiles(data) {
  const grid = $('fileGrid');
  const empty = $('emptyState');
  if (!grid) return;
  grid.innerHTML = '';

  const items = data.items || [];
  const needsReview = data.needsReviewFiles || [];
  const otherFiles = data.otherFiles || [];
  const isAdmin = Boolean(adminToken);

  if (items.length === 0 && needsReview.length === 0 && otherFiles.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  // 1. Needs Review / Unmapped Banner
  if (needsReview.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'needs-review-banner';
    banner.innerHTML = `
      <div class="needs-review-header">
        <h4 class="needs-review-title">⚠️ Needs Review / Unmapped Lab Files (${needsReview.length})</h4>
        <span style="font-size:0.8rem; color:var(--text-dim);">Files requiring official experiment assignment</span>
      </div>
      <div>
        ${needsReview.map(f => `
          <div class="needs-review-item">
            <div>
              <strong style="color:var(--text); font-family:monospace;">${escapeHtml(f.originalName)}</strong>
              <span style="font-size:0.75rem; color:var(--text-dim); margin-left:8px;">${escapeHtml((f.category || 'other').toUpperCase())} · ${fmtSize(f.size)}</span>
              ${f.reviewReason ? `<div style="font-size:0.78rem; color:#f59e0b; margin-top:2px;">ℹ️ ${escapeHtml(f.reviewReason)}</div>` : ''}
            </div>
            <div style="display:flex; gap:6px;">
              <button class="card-btn" onclick="previewFile('${f._id || f.id}')">👁 View</button>
              ${isAdmin ? `<button class="card-btn primary" onclick="openAssignExperimentModal('${f._id || f.id}', '${escapeHtml(f.originalName)}', '${f.category || ''}')">🎯 Assign Experiment</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    grid.appendChild(banner);
  }

  // 2. Syllabus items: if 'all', group by course retaining each course's numbering
  if (activeCategory === 'all') {
    const courseGroups = [
      { key: 'java', title: 'Java Programming', subtitle: 'Object Oriented Programming through Java Lab · B23CS2105', icon: '☕', total: 35 },
      { key: 'python', title: 'Python Programming', subtitle: 'Python Programming Skill Enhancement Lab · B23CS2106', icon: '🐍', total: 40 },
      { key: 'dbms', title: 'Database Management Systems', subtitle: 'Database Management Systems Lab ( CSE, AIML, CSIT & CSG) · B23CS2104', icon: '🗄️', total: 54 },
      { key: 'adsa', title: 'Advanced Data Structures & Algorithms (DSA)', subtitle: 'Advanced Data Structures and Algorithms using C Lab · B23CI2102', icon: '🌳', total: 16 }
    ];

    courseGroups.forEach(cg => {
      const courseItems = items.filter(it => it.category === cg.key);
      if (courseItems.length === 0) return;

      const availCount = courseItems.filter(it => it.status === 'available').length;

      const header = document.createElement('div');
      header.className = 'course-section-header';
      header.innerHTML = `
        <h3>
          <span>${cg.icon}</span>
          <div>
            <div>${cg.title}</div>
            <div style="font-size:0.78rem; font-weight:normal; color:var(--text-dim);">${cg.subtitle}</div>
          </div>
        </h3>
        <div class="course-section-badge">
          <span style="color:#10b981; font-weight:700;">${availCount}</span> / ${cg.total} Available
        </div>
      `;
      grid.appendChild(header);

      courseItems.forEach(item => {
        grid.appendChild(createExperimentCard(item, isAdmin));
      });
    });
  } else {
    // Single course view (e.g. Java 1..35, Python 1..40, DSA 1..16)
    items.forEach(item => {
      grid.appendChild(createExperimentCard(item, isAdmin));
    });
  }

  // 3. Render any other custom files
  if (activeCategory === 'all' && otherFiles.length > 0) {
    const otherHeader = document.createElement('div');
    otherHeader.className = 'course-section-header';
    otherHeader.innerHTML = `
      <h3><span>📁</span> Other Files &amp; Resources</h3>
      <div class="course-section-badge">${otherFiles.length} item(s)</div>
    `;
    grid.appendChild(otherHeader);

    otherFiles.forEach(file => {
      grid.appendChild(createStandaloneFileCard(file, isAdmin));
    });
  }
}

// Create an Official Experiment Card (AVAILABLE or COMING SOON)
function createExperimentCard(item, isAdmin) {
  const card = document.createElement('div');
  const filesList = Array.isArray(item.files) && item.files.length > 0 ? item.files : (item.file ? [item.file] : []);
  const isAvailable = item.status === 'available' && filesList.length > 0;
  const primaryFile = filesList[0] || item.file;
  const isPinned = filesList.some(f => Boolean(f.pinned));
  const snoStr = String(item.experimentNumber).padStart(2, '0');

  card.className = `file-card ${isAvailable ? 'available-card' : 'coming-soon-card'} ${isPinned ? 'pinned-card' : ''}`;

  if (isAvailable) {
    filesList.forEach(f => {
      const fId = f._id || f.id;
      if (fId) {
        card.addEventListener('pointerenter', () => prefetchProgram(fId), { passive: true });
        card.addEventListener('focusin', () => prefetchProgram(fId), { passive: true });
      }
    });

    const isMultiFile = filesList.length > 1;

    let filesHtml = '';
    if (isMultiFile) {
      filesHtml = `
        <div class="exp-multifile-header">
          <span class="exp-multifile-pill">📦 ${filesList.length} Files in this Experiment</span>
        </div>
        <div class="exp-files-list">
          ${filesList.map(f => {
            const ext = (f.extension || 'default').toLowerCase();
            const meta = ICONS[ext] || ICONS.default;
            const runnable = isRunnableFile(f);
            const fId = f._id || f.id;
            let fileAdminActions = '';
            if (isAdmin) {
              fileAdminActions = `
                <button class="card-btn mini" onclick="openEditModal('${fId}')" title="Edit">✏️</button>
                <button class="card-btn danger mini" onclick="confirmDeleteFile('${fId}')" title="Delete">🗑️</button>
              `;
            }
            return `
              <div class="exp-file-item">
                <div class="exp-file-info">
                  <span class="exp-file-icon">${meta.icon || '📄'}</span>
                  <div class="exp-file-text">
                    <span class="exp-file-name" title="${escapeHtml(f.originalName)}">${escapeHtml(f.originalName)}</span>
                    <span class="exp-file-meta">${fmtSize(f.size)}</span>
                  </div>
                </div>
                <div class="exp-file-actions">
                  <button class="card-btn mini" onclick="previewFile('${fId}')">👁 View</button>
                  ${runnable ? `<button class="card-btn primary mini" onclick="runOnlineFile('${fId}')">▶ Run</button>` : ''}
                  <button class="card-btn mini" onclick="downloadFile('${fId}')" title="Download">⬇</button>
                  ${fileAdminActions}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const file = primaryFile;
      const runnable = isRunnableFile(file);
      let actionBtns = `
        <button class="card-btn" onclick="previewFile('${file._id || file.id}')">👁 View</button>
        ${runnable ? `<button class="card-btn primary" onclick="runOnlineFile('${file._id || file.id}')">▶ Run Online</button>` : ''}
        <button class="card-btn" onclick="downloadFile('${file._id || file.id}')">⬇ Download</button>
      `;

      if (isAdmin) {
        actionBtns += `
          <button class="card-btn" onclick="openEditModal('${file._id || file.id}')">✏️ Edit</button>
          ${file.pinned ? `<button class="card-btn" onclick="togglePinFile('${file._id || file.id}', false)">📌 Unpin</button>` : `<button class="card-btn" onclick="togglePinFile('${file._id || file.id}', true)">📌 Pin</button>`}
          <button class="card-btn danger" onclick="confirmDeleteFile('${file._id || file.id}')">🗑️ Delete</button>
        `;
      }

      filesHtml = `
        <div>
          <span class="card-filename-sub" title="${escapeHtml(file.originalName)}">
            <span class="sub-label">File:</span>${escapeHtml(file.originalName)}
          </span>
        </div>
        <div class="file-meta">
          <span>${fmtSize(file.size)}</span> · <span>${fmtDate(file.uploadDate)}</span>
        </div>
        <div class="card-actions" style="margin-top:14px;">
          ${actionBtns}
        </div>
      `;
    }

    card.innerHTML = `
      ${isPinned ? '<span class="pin-badge">📌</span>' : ''}
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="card-sno-badge">#${snoStr}</div>
          <span class="status-tag-available">AVAILABLE</span>
        </div>
        <h3 class="experiment-title">${item.experimentNumber}. ${escapeHtml(item.experimentName)}</h3>
        <div class="card-course-tag">${escapeHtml(item.category.toUpperCase())} · ${escapeHtml(item.courseCode || '')}</div>
        ${filesHtml}
      </div>
    `;
  } else {
    // Coming Soon Card - NO View, NO Download, NO Run Online, NO fake file size
    let adminAction = '';
    if (isAdmin) {
      adminAction = `
        <div style="margin-top:12px; display:flex; justify-content:flex-end;">
          <button class="card-btn primary" style="font-size:0.75rem; padding:4px 8px;" onclick="triggerUploadForExperiment('${item.category}', ${item.experimentNumber})">⬆ Upload File</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="card-sno-badge coming-soon-sno">#${snoStr}</div>
          <span class="status-tag-coming-soon">COMING SOON</span>
        </div>
        <h3 class="experiment-title" style="color:var(--text-dim);">${item.experimentNumber}. ${escapeHtml(item.experimentName)}</h3>
        <div class="card-course-tag">${escapeHtml(item.category.toUpperCase())} · ${escapeHtml(item.courseCode || '')}</div>
        <div class="coming-soon-badge-wrap">
          <span class="coming-soon-pill">⏳ COMING SOON</span>
        </div>
        <p class="coming-soon-note">Experiment has not been uploaded yet</p>
      </div>
      ${adminAction}
    `;
  }

  return card;
}

// Fallback card for custom non-syllabus files
function createStandaloneFileCard(file, isAdmin) {
  const ext = (file.extension || 'default').toLowerCase();
  const meta = ICONS[ext] || ICONS.default;
  const runnable = isRunnableFile(file);

  const card = document.createElement('div');
  card.className = `file-card ${file.pinned ? 'pinned-card' : ''}`;

  const fId = file._id || file.id;
  card.addEventListener('pointerenter', () => prefetchProgram(fId), { passive: true });
  card.addEventListener('focusin', () => prefetchProgram(fId), { passive: true });

  let actionBtns = `
    <button class="card-btn" onclick="previewFile('${file._id || file.id}')">👁 View</button>
    ${runnable ? `<button class="card-btn primary" onclick="runOnlineFile('${file._id || file.id}')">▶ Run Online</button>` : ''}
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

  const displayTitle = file.experimentName 
    ? `${file.experimentNumber ? `#${file.experimentNumber} ` : ''}${file.experimentName}` 
    : file.originalName;

  card.innerHTML = `
    ${file.pinned ? '<span class="pin-badge">📌</span>' : ''}
    <div>
      <div class="card-top">
        <div class="file-icon-box">${meta.icon}</div>
        <div class="file-info">
          ${file.experimentNumber ? `<div class="card-sno-badge">#${String(file.experimentNumber).padStart(2, '0')}</div>` : ''}
          <h4 class="file-name">${escapeHtml(displayTitle)}</h4>
          ${file.experimentName ? `<div style="font-size:0.8rem; font-family:monospace; color:var(--text-dim); margin-bottom:4px;">📄 ${escapeHtml(file.originalName)}</div>` : ''}
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

  return card;
}

function renderFiles(files) {
  const grid = $('fileGrid');
  const empty = $('emptyState');
  if (!grid) return;
  grid.innerHTML = '';

  if (!files || files.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

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

    const filesListHtml = batchFiles.map(f => {
      const runnable = isRunnableFile(f);
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--card-border); font-size:0.82rem;">
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:50%;" title="${escapeHtml(f.relativePath || f.originalName)}">📄 ${escapeHtml(f.relativePath || f.originalName)}</span>
          <div style="display:flex; gap:4px;">
            <button class="card-btn" style="padding:2px 6px; font-size:0.75rem;" onclick="previewFile('${f._id || f.id}')">👁 View</button>
            ${runnable ? `<button class="card-btn primary" style="padding:2px 6px; font-size:0.75rem;" onclick="runOnlineFile('${f._id || f.id}')">▶ Run</button>` : ''}
            <button class="card-btn" style="padding:2px 6px; font-size:0.75rem;" onclick="downloadFile('${f._id || f.id}')">⬇</button>
          </div>
        </div>
      `;
    }).join('');

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
    grid.appendChild(createStandaloneFileCard(file, isAdmin));
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

    // Immediate local state update (BUG 11)
    lastFiles = lastFiles.filter(f => f.batchId !== batchId);
    selectedFolderBatches.delete(batchId);
    renderFiles(lastFiles);
    renderPinnedSection(lastFiles);
    if ($('folderManagementModalOverlay')?.classList.contains('active')) {
      renderFolderManagementList();
    }
    loadStats();
    loadFiles();
  } catch (err) {
    toast('Failed to delete folder.', 'error');
  }
}

// ---------------- Folder Management & Batch Delete ----------------
let selectedFolderBatches = new Set();

function openFolderManagementModal() {
  selectedFolderBatches.clear();
  renderFolderManagementList();
  openModal('folderManagementModalOverlay');
}

function renderFolderManagementList() {
  const container = $('folderManagementList');
  if (!container) return;

  const folderBatches = new Map();
  (lastFiles || []).forEach(file => {
    if (file.batchId) {
      if (!folderBatches.has(file.batchId)) {
        folderBatches.set(file.batchId, []);
      }
      folderBatches.get(file.batchId).push(file);
    }
  });

  if (folderBatches.size === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-secondary);">No folders found.</div>`;
    updateFolderSelectionUI(0);
    return;
  }

  let html = '';
  folderBatches.forEach((batchFiles, batchId) => {
    const topFolder = batchFiles[0].folderName || 'Uploaded Folder';
    const totalSize = batchFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    const uploadDate = batchFiles[0].uploadDate;
    const isChecked = selectedFolderBatches.has(batchId) ? 'checked' : '';

    html += `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--card); border:1px solid var(--card-border); border-radius:12px; transition:all 0.2s ease;">
        <div style="display:flex; align-items:center; gap:12px; overflow:hidden;">
          <input type="checkbox" class="folder-batch-checkbox" data-batch-id="${escapeHtml(batchId)}" ${isChecked} style="width:18px; height:18px; cursor:pointer; flex-shrink:0;" />
          <div style="font-size:1.5rem; flex-shrink:0;">📁</div>
          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <div style="font-weight:600; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(topFolder)}</div>
            <div style="font-size:0.8rem; color:var(--text-secondary);">${batchFiles.length} file(s) · ${fmtSize(totalSize)} · ${fmtDate(uploadDate)}</div>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0;">
          <button class="card-btn" style="padding:4px 10px; font-size:0.8rem;" onclick="downloadFolder('${escapeHtml(batchId)}')">⬇ Download</button>
          <button class="card-btn danger" style="padding:4px 10px; font-size:0.8rem;" onclick="deleteFolderBatch('${escapeHtml(batchId)}')">🗑 Delete</button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.folder-batch-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const bId = e.target.getAttribute('data-batch-id');
      if (e.target.checked) {
        selectedFolderBatches.add(bId);
      } else {
        selectedFolderBatches.delete(bId);
      }
      updateFolderSelectionUI(folderBatches.size);
    });
  });

  updateFolderSelectionUI(folderBatches.size);
}

function updateFolderSelectionUI(totalFolders) {
  const selectAllCb = $('selectAllFoldersCheckbox');
  const deleteBtn = $('deleteSelectedFoldersBtn');
  const countSpan = $('selectedFoldersCount');

  const count = selectedFolderBatches.size;

  if (countSpan) countSpan.textContent = count;

  if (deleteBtn) {
    if (count > 0) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.textContent = `🗑 Delete Selected (${count})`;
    } else {
      deleteBtn.style.display = 'none';
    }
  }

  if (selectAllCb) {
    selectAllCb.checked = totalFolders > 0 && count === totalFolders;
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
      f.pinned = pinned;
    }
    toast(pinned ? 'Folder pinned to top! 📌' : 'Folder unpinned.');
    renderPinnedSection(lastFiles);
    renderFiles(lastFiles);
  } catch (err) {
    toast('Failed to update folder pin status.', 'error');
  }
}

// ---------------- Apple Bento Stats ----------------
async function loadStats() {
  try {
    const [statsRes, sylRes] = await Promise.all([
      fetch('/api/files/stats'),
      fetch('/api/syllabus/stats')
    ]);
    const s = statsRes.ok ? await statsRes.json() : {};
    const syl = sylRes.ok ? await sylRes.json() : null;

    const statsBar = $('statsBar');
    if (!statsBar) return;

    const totalOfficial = syl ? (syl.totalOfficial || 145) : 145;
    const availableNow = syl ? (syl.totalAvailable || 124) : 124;
    const comingSoon = syl ? (syl.totalComingSoon || 21) : 21;
    const downloads = s.totalDownloads || 61;

    statsBar.innerHTML = `
      <div class="bento-stats-grid">
        <div class="bento-stat-card">
          <div class="bento-stat-top">
            <span class="bento-stat-icon">📚</span>
            <span class="bento-stat-badge">OFFICIAL LABS</span>
          </div>
          <div class="bento-stat-num count-up" data-val="${totalOfficial}">${totalOfficial}</div>
          <div class="bento-stat-label">Official Experiments</div>
          <div class="bento-stat-sub">Java 35 · Python 40 · DBMS 54 · ADSA 16</div>
        </div>

        <div class="bento-stat-card">
          <div class="bento-stat-top">
            <span class="bento-stat-icon">⚡</span>
            <span class="bento-stat-badge" style="background:rgba(16,185,129,0.14); color:#10b981; border-color:rgba(16,185,129,0.3);">READY TO RUN</span>
          </div>
          <div class="bento-stat-num count-up" data-val="${availableNow}" style="color:#10b981;">${availableNow}</div>
          <div class="bento-stat-label">Available Programs</div>
          <div class="bento-stat-sub">${comingSoon} upcoming in official curriculum</div>
        </div>

        <div class="bento-stat-card">
          <div class="bento-stat-top">
            <span class="bento-stat-icon">💻</span>
            <span class="bento-stat-badge">5 SUBJECTS</span>
          </div>
          <div class="bento-stat-num">5</div>
          <div class="bento-stat-label">Core Lab Subjects</div>
          <div class="bento-stat-sub">Java, Python, C, DBMS &amp; ADSA</div>
        </div>

        <div class="bento-stat-card">
          <div class="bento-stat-top">
            <span class="bento-stat-icon">📥</span>
            <span class="bento-stat-badge">COMMUNITY</span>
          </div>
          <div class="bento-stat-num count-up" data-val="${downloads}">${downloads}</div>
          <div class="bento-stat-label">Total Downloads</div>
          <div class="bento-stat-sub">Live student downloads from database</div>
        </div>
      </div>
    `;

    animateBentoCounts();
  } catch { /* non-critical */ }
}

function animateBentoCounts() {
  document.querySelectorAll('.bento-stat-num.count-up').forEach(el => {
    const target = parseInt(el.getAttribute('data-val'), 10) || 0;
    if (target === 0) return;
    let count = 0;
    const duration = 750;
    const stepTime = 25;
    const increment = Math.ceil(target / (duration / stepTime));
    const timer = setInterval(() => {
      count = Math.min(count + increment, target);
      el.textContent = count;
      if (count >= target) clearInterval(timer);
    }, stepTime);
  });
}

// ---------------- Playful Mascot Micro-Animations ----------------
function initCinematicEyes() {
  const overlay = $('cinematicEyesOverlay');
  if (!overlay) return;

  const leftPupil = $('giantPupilLeft');
  const rightPupil = $('giantPupilRight');
  const canvas = $('eyesParticleCanvas');

  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  });

  // Ambient Particles around giant eyes
  const stars = [];
  for (let i = 0; i < 75; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: Math.random() * 3.5 + 1,
      vx: (Math.random() - 0.5) * 0.9,
      vy: (Math.random() - 0.5) * 0.9,
      alpha: Math.random() * 0.85 + 0.15,
      color: Math.random() > 0.4 ? '#38bdf8' : (Math.random() > 0.5 ? '#818cf8' : '#22d3ee')
    });
  }

  let isDissolving = false;
  let explosionParticles = [];

  function drawEyesCanvas() {
    ctx.clearRect(0, 0, w, h);

    if (!isDissolving) {
      stars.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0 || s.x > w) s.vx *= -1;
        if (s.y < 0 || s.y > h) s.vy *= -1;

        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = s.color;
        ctx.fill();
        ctx.restore();
      });
    } else {
      for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const p = explosionParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.018;
        p.radius *= 0.985;

        if (p.alpha <= 0 || p.radius <= 0.2) {
          explosionParticles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.restore();
      }
    }

    if (overlay.style.display !== 'none') {
      requestAnimationFrame(drawEyesCanvas);
    }
  }

  drawEyesCanvas();

  // Smooth Mouse Pupil Tracking
  document.addEventListener('mousemove', e => {
    if (isDissolving) return;
    const eyes = document.querySelectorAll('.giant-eye');
    eyes.forEach((eye, index) => {
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      const maxOffset = rect.width * 0.25;
      const offX = (dx / dist) * Math.min(dist * 0.2, maxOffset);
      const offY = (dy / dist) * Math.min(dist * 0.2, maxOffset);

      const pupil = index === 0 ? leftPupil : rightPupil;
      if (pupil) {
        pupil.style.transform = `translate(${offX}px, ${offY}px)`;
      }
    });
  });

  // Dissolve Eyes into Particle Burst
  function dissolveEyes() {
    if (isDissolving) return;
    isDissolving = true;

    const eyes = document.querySelectorAll('.giant-eye');
    eyes.forEach(eye => {
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      for (let i = 0; i < 140; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 14 + 4;
        explosionParticles.push({
          x: cx + (Math.random() - 0.5) * rect.width * 0.8,
          y: cy + (Math.random() - 0.5) * rect.height * 0.8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5,
          radius: Math.random() * 8 + 3,
          alpha: 1,
          color: Math.random() > 0.4 ? '#38bdf8' : (Math.random() > 0.5 ? '#818cf8' : '#34d399')
        });
      }
    });

    overlay.classList.add('dissolving');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 850);
  }

  // Auto dissolve after 3.2s or click anywhere
  const timer = setTimeout(dissolveEyes, 3200);
  overlay.addEventListener('click', () => {
    clearTimeout(timer);
    dissolveEyes();
  });
}

// Click Counters for Easter Eggs
let pythonClickCount = 0;
let downloadClickCount = 0;
let runClickCount = 0;

function showLargePythonSnake(action = 'view', targetEl = null) {
  try {
    pythonClickCount++;
    const isSunglasses = pythonClickCount >= 10 || downloadClickCount >= 20;

    const pop = document.createElement('div');
    pop.className = `python-snake-hero-overlay action-${action}`;

    let posX = window.innerWidth / 2 - 160;
    let posY = window.innerHeight / 2 - 130;

    if (targetEl && targetEl.getBoundingClientRect) {
      const rect = targetEl.getBoundingClientRect();
      posX = Math.max(20, Math.min(window.innerWidth - 340, rect.left + rect.width / 2 - 160));
      posY = Math.max(20, Math.min(window.innerHeight - 280, rect.top - 120));
    }

    pop.style.left = `${posX}px`;
    pop.style.top = `${posY}px`;

    const sunglassesSvg = isSunglasses ? `
      <g transform="translate(160, 75)">
        <path d="M 0 0 L 32 0 L 30 10 L 16 12 L 2 10 Z" fill="#0f172a" />
        <path d="M -2 2 L 34 2" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
        <line x1="4" y1="3" x2="12" y2="8" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>
        <line x1="20" y1="3" x2="28" y2="8" stroke="#ffffff" stroke-width="1.5" opacity="0.8"/>
      </g>
    ` : '';

    pop.innerHTML = `
      <svg class="python-snake-svg-hero" viewBox="0 0 200 160">
        <defs>
          <linearGradient id="snakeSkinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#06b6d4" />
            <stop offset="50%" stop-color="#2dd4bf" />
            <stop offset="100%" stop-color="#10b981" />
          </linearGradient>
          <filter id="glowSnake">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        <circle cx="20" cy="30" r="3" fill="#67e8f9" opacity="0.8"/>
        <circle cx="180" cy="40" r="4" fill="#a7f3d0" opacity="0.9"/>
        <circle cx="160" cy="130" r="3" fill="#ffffff" opacity="0.7"/>

        <path class="snake-body-path" d="M 30 130 C 50 80, 70 140, 100 100 C 130 60, 150 110, 175 90" fill="none" stroke="url(#snakeSkinGrad)" stroke-width="26" stroke-linecap="round" filter="url(#glowSnake)"/>
        <path d="M 33 133 C 53 83, 73 143, 103 103 C 133 63, 153 113, 175 93" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" opacity="0.4"/>

        <g transform="translate(155, 75)">
          <ellipse cx="15" cy="10" rx="22" ry="18" fill="#10b981" />
          <ellipse cx="10" cy="2" rx="6.5" ry="8" fill="#ffffff" />
          <ellipse cx="24" cy="2" rx="6.5" ry="8" fill="#ffffff" />
          <circle cx="10" cy="2" r="3.5" fill="#0f172a" />
          <circle cx="24" cy="2" r="3.5" fill="#0f172a" />
          <circle cx="8" cy="0" r="1.5" fill="#ffffff" />
          <circle cx="22" cy="0" r="1.5" fill="#ffffff" />
          <circle cx="2" cy="12" r="3.5" fill="#f43f5e" opacity="0.6"/>
          <circle cx="28" cy="12" r="3.5" fill="#f43f5e" opacity="0.6"/>
          <path d="M 8 13 Q 17 20 26 13" fill="none" stroke="#064e3b" stroke-width="2.5" stroke-linecap="round"/>
          <path class="snake-tongue-flick" d="M 17 20 L 17 32 M 17 32 L 12 37 M 17 32 L 22 37" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
        </g>
        ${sunglassesSvg}
      </svg>
    `;

    document.body.appendChild(pop);
    setTimeout(() => {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    }, 850);
  } catch { /* silent fallback */ }
}

function getMascotType(fileOrExt) {
  if (!fileOrExt) return 'python';
  const str = (typeof fileOrExt === 'string' ? fileOrExt : (fileOrExt.category || fileOrExt.extension || fileOrExt.originalName || '')).toLowerCase();
  if (str.includes('py')) return 'python';
  if (str.includes('java')) return 'java';
  if (str.includes('cpp') || str.includes('c++')) return 'cpp';
  if (str.includes('adsa') || str.includes('tree') || str.includes('heap')) return 'adsa';
  if (str.includes('dbms') || str.includes('sql')) return 'dbms';
  if (str.includes('linux') || str.includes('sh')) return 'linux';
  if (str.includes('cyber') || str.includes('security')) return 'cyber';
  if (str.includes('c')) return 'c';
  return 'python';
}

function triggerMascotAnim(type, targetEl) {
  try {
    if (type === 'python' || type.startsWith('python-')) {
      const action = type.includes('-') ? type.split('-')[1] : 'view';
      showLargePythonSnake(action, targetEl);
      return;
    }

    const pop = document.createElement('div');
    pop.className = `mascot-pop-overlay mascot-pop-${type}`;
    
    let rect = null;
    if (targetEl && targetEl.getBoundingClientRect) {
      rect = targetEl.getBoundingClientRect();
    } else {
      rect = { left: window.innerWidth / 2 - 40, top: window.innerHeight / 2 - 40, width: 80, height: 80 };
    }

    const posX = Math.max(10, Math.min(window.innerWidth - 100, rect.left + rect.width / 2 - 40));
    const posY = Math.max(10, Math.min(window.innerHeight - 100, rect.top - 50));

    pop.style.left = `${posX}px`;
    pop.style.top = `${posY}px`;

    if (type === 'java') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-steam">♨️</span>
          <span class="mascot-emoji">☕</span>
        </div>
      `;
    } else if (type === 'c') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-spark">⚡</span>
          <span class="mascot-emoji gear-spin">⚙️</span>
        </div>
      `;
    } else if (type === 'cpp') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-emoji rocket-launch">🚀</span>
          <span class="mascot-flame">🔥</span>
        </div>
      `;
    } else if (type === 'adsa') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-emoji tree-grow">🌳</span>
          <span class="mascot-spark">✨</span>
        </div>
      `;
    } else if (type === 'dbms') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-emoji db-spin">🗄️</span>
          <span class="mascot-spark">💫</span>
        </div>
      `;
    } else if (type === 'linux') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-emoji penguin-slide">🐧</span>
        </div>
      `;
    } else if (type === 'cyber') {
      pop.innerHTML = `
        <div class="mascot-pop-emoji-wrap">
          <span class="mascot-emoji shield-pulse">🔐</span>
        </div>
      `;
    } else if (type === 'download') {
      pop.innerHTML = `
        <div class="confetti-burst">
          <span style="--dx:-30px; --dy:-40px; color:#f43f5e;">🎉</span>
          <span style="--dx:30px; --dy:-50px; color:#3b82f6;">🎊</span>
          <span style="--dx:-40px; --dy:20px; color:#10b981;">✨</span>
          <span style="--dx:40px; --dy:30px; color:#f59e0b;">📦</span>
        </div>
      `;
    }

    document.body.appendChild(pop);
    setTimeout(() => {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    }, 1000);
  } catch (err) { /* silent fallback */ }
}

// ---------------- File Downloads & Previews ----------------
function downloadFile(id, evt) {
  const target = evt ? (evt.target || evt) : null;
  triggerMascotAnim('download', target);
  const file = lastFiles.find(f => (f._id || f.id) === id);
  if (file) {
    triggerMascotAnim(getMascotType(file), target);
  }
  window.open(`/api/files/${id}/download`, '_blank');
}

function downloadFolder(batchId, evt) {
  const target = evt ? (evt.target || evt) : null;
  triggerMascotAnim('download', target);
  const file = lastFiles.find(f => f.batchId === batchId);
  if (file) {
    triggerMascotAnim(getMascotType(file), target);
  }
  window.open(`/api/files/folder/${batchId}/download`, '_blank');
}

// Viewer reading state
let viewerFontSize = parseInt(localStorage.getItem('zipshare_viewer_fontsize') || '13', 10);
let viewerCodeWrapped = localStorage.getItem('zipshare_viewer_wrapped') === 'true';

function applyViewerFontSize(size) {
  viewerFontSize = Math.max(11, Math.min(22, size));
  try { localStorage.setItem('zipshare_viewer_fontsize', String(viewerFontSize)); } catch (e) {}
  const label = $('viewerFontSizeLabel');
  if (label) label.textContent = `${viewerFontSize}px`;
  document.documentElement.style.setProperty('--viewer-code-font-size', `${viewerFontSize}px`);
  const codeEl = document.querySelector('#previewBody code');
  if (codeEl) codeEl.style.fontSize = `${viewerFontSize}px`;
}

function applyViewerWrap(wrapped) {
  viewerCodeWrapped = !!wrapped;
  try { localStorage.setItem('zipshare_viewer_wrapped', String(viewerCodeWrapped)); } catch (e) {}
  const body = $('previewBody');
  const btn = $('viewerWrapToggleBtn');
  const wrapIcon = $('viewerWrapIcon');
  const wrapText = $('viewerWrapText');
  if (body) {
    if (viewerCodeWrapped) body.classList.add('code-wrapped');
    else body.classList.remove('code-wrapped');
  }
  if (btn) btn.classList.toggle('active', viewerCodeWrapped);
  if (wrapIcon) wrapIcon.textContent = viewerCodeWrapped ? '↔' : '↩';
  if (wrapText) wrapText.textContent = viewerCodeWrapped ? 'Scroll' : 'Wrap';
}

async function copyPreviewCode() {
  const codeEl = document.querySelector('#previewBody code') || document.querySelector('#previewBody');
  if (!codeEl) return;
  const text = codeEl.textContent;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    
    // Animate copy indicators
    const copyIcon = $('copyCodeIcon');
    const copyText = $('copyCodeText');
    const mobCopyIcon = $('mobileCopyIcon');
    const mobCopyText = $('mobileCopyText');

    if (copyIcon) copyIcon.textContent = '✅';
    if (copyText) copyText.textContent = 'Copied!';
    if (mobCopyIcon) mobCopyIcon.textContent = '✅';
    if (mobCopyText) mobCopyText.textContent = 'Copied!';

    setTimeout(() => {
      if (copyIcon) copyIcon.textContent = '📋';
      if (copyText) copyText.textContent = 'Copy';
      if (mobCopyIcon) mobCopyIcon.textContent = '📋';
      if (mobCopyText) mobCopyText.textContent = 'Copy';
    }, 1800);

    toast('Code copied to clipboard! 📋', 'success');
  } catch (err) {
    toast('Failed to copy code', 'error');
  }
}

async function triggerPreviewRun() {
  if (!previewingFile) return;
  const targetId = previewingFile._id || previewingFile.id;
  closeModal('previewModalOverlay');
  await runOnlineFile(targetId);
}

async function triggerPreviewExplain() {
  if (!previewingFile) return;
  const targetId = previewingFile._id || previewingFile.id;
  closeModal('previewModalOverlay');
  await runOnlineFile(targetId);
  setTimeout(() => {
    const explainTab = $('tabBtnExplain');
    if (explainTab) explainTab.click();
    const triggerAi = $('aiExplainCodeBtn');
    if (triggerAi) triggerAi.click();
  }, 200);
}

// ---------------- Fast Program In-Memory Cache & Prefetch ----------------
const programPreviewCache = new Map();

function prefetchProgram(id) {
  if (!id || programPreviewCache.has(id)) return;
  fetch(`/api/files/${id}/preview`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.file) {
        programPreviewCache.set(id, data);
      }
    })
    .catch(() => {});
}

function prefetchAdjacentPrograms(currentId) {
  if (!lastFiles || lastFiles.length === 0) return;
  const idx = lastFiles.findIndex(f => (f._id || f.id) === currentId);
  if (idx > 0) {
    const prevFile = lastFiles[idx - 1];
    if (prevFile) prefetchProgram(prevFile._id || prevFile.id);
  }
  if (idx >= 0 && idx < lastFiles.length - 1) {
    const nextFile = lastFiles[idx + 1];
    if (nextFile) prefetchProgram(nextFile._id || nextFile.id);
  }
}

function setupWorkspaceNav(currentId) {
  const prevBtn = $('viewerPrevProgramBtn');
  const nextBtn = $('viewerNextProgramBtn');
  if (!lastFiles || lastFiles.length === 0) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    return;
  }

  const idx = lastFiles.findIndex(f => (f._id || f.id) === currentId);
  const prevFile = idx > 0 ? lastFiles[idx - 1] : null;
  const nextFile = idx >= 0 && idx < lastFiles.length - 1 ? lastFiles[idx + 1] : null;

  if (prevBtn) {
    prevBtn.style.display = prevFile ? 'inline-flex' : 'none';
    prevBtn.onclick = () => {
      if (prevFile) previewFile(prevFile._id || prevFile.id);
    };
  }

  if (nextBtn) {
    nextBtn.style.display = nextFile ? 'inline-flex' : 'none';
    nextBtn.onclick = () => {
      if (nextFile) previewFile(nextFile._id || nextFile.id);
    };
  }
}

function renderProgramWorkspace(file, content, type) {
  previewingFile = file;

  if ($('previewTitle')) $('previewTitle').textContent = file.originalName;
  const ext = (file.extension || 'default').toLowerCase();
  if ($('previewFileIcon')) $('previewFileIcon').textContent = (ICONS[ext] || ICONS.default).icon;

  // macOS Titlebar Breadcrumbs
  const subjName = (file.subject || file.category || 'CODE').toUpperCase();
  if ($('previewBreadcrumbSubject')) $('previewBreadcrumbSubject').textContent = subjName;
  if ($('previewBreadcrumbFile')) {
    const label = file.experimentName ? `#${file.experimentNumber ? String(file.experimentNumber).padStart(2,'0') : ''} ${file.experimentName}` : file.originalName;
    $('previewBreadcrumbFile').textContent = label;
  }

  // Badges update
  const langBadge = $('previewLangBadge');
  if (langBadge) {
    langBadge.textContent = subjName;
  }

  const linesBadge = $('previewLinesBadge');
  if (linesBadge && type === 'text') {
    const lineCount = (content || '').split('\n').length;
    linesBadge.textContent = `${lineCount} line${lineCount === 1 ? '' : 's'}`;
    linesBadge.style.display = 'inline-block';
  } else if (linesBadge) {
    linesBadge.style.display = 'none';
  }

  const sizeBadge = $('previewSizeBadge');
  if (sizeBadge && file.size) {
    sizeBadge.textContent = fmtSize(file.size);
    sizeBadge.style.display = 'inline-block';
  }

  const mobileSolBtn = $('mobileToggleSolBtn');
  if (mobileSolBtn) {
    const hasSol = file && (file.subject || file.exercise || file.question);
    mobileSolBtn.style.display = hasSol ? 'inline-flex' : 'none';
  }

  const body = $('previewBody');
  const adminEditBtn = $('editContentBtn');

  if (adminToken && type === 'text') {
    if (adminEditBtn) adminEditBtn.style.display = 'inline-block';
    if ($('codeEditorTextarea')) $('codeEditorTextarea').value = content || '';
  } else {
    if (adminEditBtn) adminEditBtn.style.display = 'none';
  }

  if ($('adminEditorSection')) $('adminEditorSection').style.display = 'none';

  const solPanel = $('solutionExplorerPanel');
  if (solPanel) solPanel.classList.remove('open');
  renderSolutionPanel(file);

  if (body) {
    if (type === 'text') {
      body.innerHTML = `<pre><code class="language-${ext}">${escapeHtml(content || '')}</code></pre>`;
      if (window.hljs) window.hljs.highlightAll();
    } else if (type === 'image') {
      body.innerHTML = `<img src="${file.url || ''}" style="max-width:100%; border-radius:12px; display:block; margin:0 auto;" />`;
    } else if (type === 'pdf') {
      body.innerHTML = `<iframe src="${file.url || ''}" style="width:100%; height:450px; border:none; border-radius:12px;"></iframe>`;
    } else {
      body.innerHTML = `<p style="text-align:center; padding:30px;">Binary / Unsupported format. Please download to view on your system.</p>`;
    }
  }

  applyViewerFontSize(viewerFontSize);
  applyViewerWrap(viewerCodeWrapped);
  setupWorkspaceNav(file._id || file.id);
}

async function previewFile(id) {
  try {
    const fileLoc = lastFiles.find(f => (f._id || f.id) === id);
    if (fileLoc) {
      triggerMascotAnim(getMascotType(fileLoc), document.activeElement);
    }

    // 1. FAST CACHE HIT (0ms perceived latency)
    if (programPreviewCache.has(id)) {
      const data = programPreviewCache.get(id);
      renderProgramWorkspace(data.file, data.content, data.type);
      openModal('previewModalOverlay');
      prefetchAdjacentPrograms(id);
      return;
    }

    // 2. Cold start: open modal immediately with responsive preview shell
    if (fileLoc) {
      renderProgramWorkspace(fileLoc, '// Fetching program code...', 'text');
    }
    openModal('previewModalOverlay');

    const res = await fetch(`/api/files/${id}/preview`);
    if (!res.ok) throw new Error('Preview error');
    const data = await res.json();
    programPreviewCache.set(id, data);

    renderProgramWorkspace(data.file, data.content, data.type);
    prefetchAdjacentPrograms(id);
  } catch (err) {
    toast('Could not load file preview.', 'error');
  }
}

function renderSolutionPanel(file) {
  const panel = $('solutionExplorerPanel');
  if (!panel) return;

  if (!file || (!file.subject && !file.exercise && !file.question)) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  if ($('solSubjectBadge')) $('solSubjectBadge').textContent = (file.subject || file.category || 'GENERAL').toUpperCase();
  if ($('solExerciseText')) $('solExerciseText').textContent = file.exercise || 'Lab Exercise';
  if ($('solQuestionText')) $('solQuestionText').textContent = file.question || file.originalName;
  if ($('solDescriptionText')) $('solDescriptionText').textContent = file.description || 'Student lab program record.';
  if ($('solExpectedOutputText')) $('solExpectedOutputText').textContent = file.expectedOutput || '(Expected output available after execution)';

  // Render related program chips
  const relatedGrid = $('solRelatedGrid');
  if (relatedGrid) {
    const related = lastFiles.filter(f => (f._id || f.id) !== (file._id || file.id) && f.subject === file.subject).slice(0, 4);
    if (related.length === 0) {
      relatedGrid.innerHTML = '<span style="font-size:0.8rem; color:var(--text-dim);">No related items found</span>';
    } else {
      relatedGrid.innerHTML = related.map(r => `
        <span class="sol-chip" onclick="previewFile('${r._id || r.id}')">📄 ${escapeHtml(r.originalName)}</span>
      `).join('');
    }
  }
}

// Viewer Control Events
const copyCodeBtn = $('copyCodeBtn');
if (copyCodeBtn) copyCodeBtn.addEventListener('click', copyPreviewCode);

const mobileCopyCodeBtn = $('mobileCopyCodeBtn');
if (mobileCopyCodeBtn) mobileCopyCodeBtn.addEventListener('click', copyPreviewCode);

const viewerRunDirectBtn = $('viewerRunDirectBtn');
if (viewerRunDirectBtn) viewerRunDirectBtn.addEventListener('click', triggerPreviewRun);

const mobileRunCodeBtn = $('mobileRunCodeBtn');
if (mobileRunCodeBtn) mobileRunCodeBtn.addEventListener('click', triggerPreviewRun);

const viewerExplainDirectBtn = $('viewerExplainDirectBtn');
if (viewerExplainDirectBtn) viewerExplainDirectBtn.addEventListener('click', triggerPreviewExplain);

const mobileExplainCodeBtn = $('mobileExplainCodeBtn');
if (mobileExplainCodeBtn) mobileExplainCodeBtn.addEventListener('click', triggerPreviewExplain);

const viewerFontDecBtn = $('viewerFontDecBtn');
if (viewerFontDecBtn) viewerFontDecBtn.addEventListener('click', () => applyViewerFontSize(viewerFontSize - 1));

const viewerFontIncBtn = $('viewerFontIncBtn');
if (viewerFontIncBtn) viewerFontIncBtn.addEventListener('click', () => applyViewerFontSize(viewerFontSize + 1));

const viewerWrapToggleBtn = $('viewerWrapToggleBtn');
if (viewerWrapToggleBtn) viewerWrapToggleBtn.addEventListener('click', () => applyViewerWrap(!viewerCodeWrapped));

const mobileToggleSolBtn = $('mobileToggleSolBtn');
if (mobileToggleSolBtn) {
  mobileToggleSolBtn.addEventListener('click', () => {
    const panel = $('solutionExplorerPanel');
    if (panel) {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });
}

const downloadPreviewBtn = $('downloadPreviewBtn');
if (downloadPreviewBtn) {
  downloadPreviewBtn.addEventListener('click', () => {
    if (previewingFile) downloadFile(previewingFile._id || previewingFile.id);
  });
}

const fullscreenViewerBtn = $('fullscreenViewerBtn');
if (fullscreenViewerBtn) {
  fullscreenViewerBtn.addEventListener('click', () => {
    const modalBox = document.querySelector('#previewModalOverlay .modal');
    if (modalBox) modalBox.classList.toggle('fullscreen');
  });
}

const solPanelHeader = $('solPanelHeader');
if (solPanelHeader) {
  solPanelHeader.addEventListener('click', () => {
    const panel = $('solutionExplorerPanel');
    if (panel) {
      panel.classList.toggle('open');
    }
  });
}

const editContentBtn = $('editContentBtn');
if (editContentBtn) {
  editContentBtn.addEventListener('click', () => {
    if ($('adminEditorSection')) $('adminEditorSection').style.display = 'block';
  });
}

const cancelEditContentBtn = $('cancelEditContentBtn');
if (cancelEditContentBtn) {
  cancelEditContentBtn.addEventListener('click', () => {
    if ($('adminEditorSection')) $('adminEditorSection').style.display = 'none';
  });
}

const saveContentBtn = $('saveContentBtn');
if (saveContentBtn) {
  saveContentBtn.addEventListener('click', async () => {
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
}

async function togglePinFile(id, pinned) {
  try {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify({ pinned })
    });
    if (!res.ok) throw new Error('Update failed');
    toast(pinned ? 'File pinned to top! 📌' : 'File unpinned.');

    // Immediate local state update (BUG 12)
    const file = lastFiles.find(f => (f._id || f.id) === id);
    if (file) file.pinned = pinned;

    renderPinnedSection(lastFiles);
    renderFiles(lastFiles);
  } catch (err) {
    toast('Failed to update pin status.', 'error');
  }
}

// ---------------- Admin Auth & Lockout ----------------
function startLockoutTimer(seconds) {
  if (lockoutTimerInterval) clearInterval(lockoutTimerInterval);
  
  let remaining = seconds;
  const pwdInput = $('adminPasswordInput');
  const submitBtn = $('loginSubmitBtn');
  const msgEl = $('loginMessage');
  const modalHeading = $('loginModalHeading');
  const modalIcon = $('loginModalIcon');

  if (pwdInput) {
    pwdInput.disabled = true;
    pwdInput.classList.add('input-error');
  }
  if (submitBtn) submitBtn.disabled = true;
  
  if (modalIcon) modalIcon.textContent = '😂';
  if (modalHeading) modalHeading.textContent = '😂 Nice Try!';

  function updateDisplay() {
    if (submitBtn) submitBtn.textContent = `Locked (${remaining}s)`;
    if (msgEl) {
      msgEl.textContent = `😂 Nice Try!\nProtected by Admin.\nTry again in ${remaining}s...`;
      msgEl.className = 'login-message error';
    }
  }

  updateDisplay();

  lockoutTimerInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(lockoutTimerInterval);
      lockoutTimerInterval = null;
      if (pwdInput) {
        pwdInput.disabled = false;
        pwdInput.value = '';
        pwdInput.classList.remove('input-error');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
      if (msgEl) {
        msgEl.textContent = '';
        msgEl.className = 'login-message';
      }
      if (modalIcon) modalIcon.textContent = '🔐';
      if (modalHeading) modalHeading.textContent = 'Admin Login';
    } else {
      updateDisplay();
    }
  }, 1000);
}

function updateSessionBadge() {
  const isAdmin = Boolean(adminToken);
  if ($('sessionBadge')) $('sessionBadge').textContent = isAdmin ? 'Welcome Admin' : 'Welcome Anonymous';
  if ($('adminLoginBtn')) $('adminLoginBtn').textContent = isAdmin ? '⚡ Admin Dashboard' : 'Admin Login';

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
  renderPinnedSection(lastFiles);
  if (isAdmin) checkPendingRequests();
}

const adminLoginBtn = $('adminLoginBtn');
if (adminLoginBtn) {
  adminLoginBtn.addEventListener('click', () => {
    if (adminToken) {
      openModal('dashboardModalOverlay');
    } else {
      openModal('loginModalOverlay');
    }
  });
}

const loginSubmitBtn = $('loginSubmitBtn');
if (loginSubmitBtn) loginSubmitBtn.addEventListener('click', handleAdminLogin);

const adminPasswordInput = $('adminPasswordInput');
if (adminPasswordInput) {
  adminPasswordInput.addEventListener('keyup', e => {
    if (e.key === 'Enter') handleAdminLogin();
  });
}

async function handleAdminLogin() {
  if (lockoutTimerInterval) return;

  const pwdInput = $('adminPasswordInput');
  const password = pwdInput ? pwdInput.value : '';
  const msgEl = $('loginMessage');
  const loginBox = $('loginBox');
  if (msgEl) {
    msgEl.textContent = '';
    msgEl.className = 'login-message';
  }
  if (pwdInput) pwdInput.classList.remove('input-error');

  if (!password) {
    if (pwdInput) pwdInput.classList.add('input-error');
    if (msgEl) {
      msgEl.textContent = "❌ Wrong Password\nProtected by Admin.";
      msgEl.className = 'login-message error';
    }
    if (loginBox) {
      loginBox.classList.add('shake');
      setTimeout(() => loginBox.classList.remove('shake'), 500);
    }
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
      if (loginBox) {
        loginBox.classList.add('shake');
        setTimeout(() => loginBox.classList.remove('shake'), 500);
      }
      if (pwdInput) pwdInput.classList.add('input-error');

      if (res.status === 429 || data.error === 'locked') {
        const secs = data.retryAfter || 30;
        startLockoutTimer(secs);
        toast('😂 Nice Try. Protected by Admin Lockout Active!', 'warning');
      } else {
        if (msgEl) {
          msgEl.textContent = "❌ Wrong Password\nProtected by Admin.";
          msgEl.className = 'login-message error';
        }
        toast('❌ Wrong Password. Protected by Admin.', 'error');
      }
      return;
    }

    if (pwdInput) pwdInput.classList.remove('input-error');
    adminToken = data.token;
    localStorage.setItem('zipshare_token', adminToken);
    toast('Login successful! Welcome Admin 🚀');
    closeModal('loginModalOverlay');
    if (pwdInput) pwdInput.value = '';
    updateSessionBadge();
    
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

  const dashDeleteFoldersBtn = $('dashDeleteFoldersBtn');
  if (dashDeleteFoldersBtn) {
    dashDeleteFoldersBtn.addEventListener('click', () => {
      closeModal('dashboardModalOverlay');
      openFolderManagementModal();
    });
  }

  const dashManageLinksBtn = $('dashManageLinksBtn');
  if (dashManageLinksBtn) {
    dashManageLinksBtn.addEventListener('click', () => {
      if (!adminToken) {
        toast('Admin login required to manage links.', 'warning');
        openModal('loginModalOverlay');
        return;
      }
      populatePromoSettingsForm();
      openModal('promoLinksModalOverlay');
    });
  }

  const adminSavePromoBtn = $('adminSavePromoBtn');
  if (adminSavePromoBtn) {
    adminSavePromoBtn.addEventListener('click', handleSavePromoSettings);
  }

  const adminResetPromoBtn = $('adminResetPromoBtn');
  if (adminResetPromoBtn) {
    adminResetPromoBtn.addEventListener('click', () => {
      if ($('adminPromoLinkInput')) $('adminPromoLinkInput').value = 'https://betadrop.app/i/eXW3zM';
      if ($('adminPromoTitleInput')) $('adminPromoTitleInput').value = 'REPLICA: Keyboard Companion';
      if ($('adminPromoSubtextInput')) $('adminPromoSubtextInput').value = 'Try our new APK — click to install REPLICA directly on your device';
      if ($('adminPromoBadgeInput')) $('adminPromoBadgeInput').value = 'TRY OUR NEW APK';
      if ($('adminPromoBtnTextInput')) $('adminPromoBtnTextInput').value = 'Install REPLICA APK 📲';
      if ($('adminPromoEnabledInput')) $('adminPromoEnabledInput').checked = true;
      toast('Reset to default BetaDrop link. Click Save to publish! 🔄', 'info');
    });
  }

  const adminTestPromoBtn = $('adminTestPromoBtn');
  if (adminTestPromoBtn) {
    adminTestPromoBtn.addEventListener('click', () => {
      const url = $('adminPromoLinkInput')?.value.trim();
      if (!url) {
        toast('Enter a link URL to test!', 'warning');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  const selectAllFoldersCheckbox = $('selectAllFoldersCheckbox');
  if (selectAllFoldersCheckbox) {
    selectAllFoldersCheckbox.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const folderBatches = new Map();
      (lastFiles || []).forEach(file => {
        if (file.batchId) {
          folderBatches.set(file.batchId, true);
        }
      });

      if (isChecked) {
        folderBatches.forEach((_, batchId) => selectedFolderBatches.add(batchId));
      } else {
        selectedFolderBatches.clear();
      }

      renderFolderManagementList();
    });
  }

  const deleteSelectedFoldersBtn = $('deleteSelectedFoldersBtn');
  if (deleteSelectedFoldersBtn) {
    deleteSelectedFoldersBtn.addEventListener('click', () => {
      const count = selectedFolderBatches.size;
      if (count === 0) return;

      const msgEl = $('deleteConfirmMessage');
      if (msgEl) {
        msgEl.innerHTML = `Delete <strong>${count}</strong> selected folder${count > 1 ? 's' : ''} permanently?<br>This action cannot be undone.`;
      }
      openModal('deleteConfirmModalOverlay');
    });
  }

  const confirmDeleteFoldersBtn = $('confirmDeleteFoldersBtn');
  if (confirmDeleteFoldersBtn) {
    confirmDeleteFoldersBtn.addEventListener('click', async () => {
      const count = selectedFolderBatches.size;
      if (count === 0) return;

      const batchIds = Array.from(selectedFolderBatches);

      try {
        const res = await fetch('/api/files/folders/delete-batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ batchIds })
        });

        if (!res.ok) {
          throw new Error('Server returned error');
        }

        toast('Selected folders deleted successfully.');
        closeModal('deleteConfirmModalOverlay');
        closeModal('folderManagementModalOverlay');
        selectedFolderBatches.clear();

        await fetchFiles();
      } catch (err) {
        console.error('Batch delete error:', err);
        toast('Failed to delete selected folders.', 'error');
      }
    });
  }

  const cancelDeleteFoldersBtn = $('cancelDeleteFoldersBtn');
  if (cancelDeleteFoldersBtn) {
    cancelDeleteFoldersBtn.addEventListener('click', () => {
      closeModal('deleteConfirmModalOverlay');
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

let targetUploadExp = null;

function triggerUploadForExperiment(cat, expNum) {
  targetUploadExp = { category: cat, experimentNumber: expNum };
  const fileInput = $('fileInput');
  if (fileInput) fileInput.click();
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

  if (targetUploadExp) {
    formData.append('category', targetUploadExp.category);
    formData.append('experimentNumber', targetUploadExp.experimentNumber);
    targetUploadExp = null;
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
const reqForm = $('programRequestForm');
if (reqForm) {
  reqForm.addEventListener('submit', async e => {
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
      reqForm.reset();
    } catch (err) {
      toast('Could not submit request.', 'error');
    }
  });
}

async function checkPendingRequests() {
  if (!adminToken) return;
  try {
    const res = await fetch('/api/requests', { headers: authHeaders() });
    if (!res.ok) return;
    const requests = await res.json();
    const badge = $('requestBadgeCount');
    if (!badge) return;
    const pendingCount = requests.filter(r => r.status === 'pending').length;
    if (pendingCount > 0) {
      badge.textContent = pendingCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch { /* non-critical */ }
}

const navRequestsBtn = $('navRequestsBtn');
if (navRequestsBtn) {
  navRequestsBtn.addEventListener('click', async () => {
    if (!adminToken) {
      toast('Program requests management requires Admin login.', 'warning');
      openModal('loginModalOverlay');
      return;
    }
    loadAdminRequestsList();
    openModal('requestsModalOverlay');
  });
}

async function loadAdminRequestsList() {
  const container = $('requestsListContainer');
  if (!container) return;
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

  if ($('editNameInput')) $('editNameInput').value = file.originalName || '';
  if ($('editCategorySelect')) $('editCategorySelect').value = file.category || 'all';
  if ($('editDescInput')) $('editDescInput').value = file.description || '';
  if ($('editTagsInput')) $('editTagsInput').value = (file.tags || []).join(', ');
  if ($('editPinnedCheck')) $('editPinnedCheck').checked = Boolean(file.pinned);

  openModal('editModalOverlay');
}

const editSaveBtn = $('editSaveBtn');
if (editSaveBtn) {
  editSaveBtn.addEventListener('click', async () => {
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
}

function confirmDeleteFile(id) {
  pendingDeleteId = id;
  openModal('deleteModalOverlay');
}

const deleteCancelBtn = $('deleteCancelBtn');
if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', () => closeModal('deleteModalOverlay'));

const deleteConfirmBtn = $('deleteConfirmBtn');
if (deleteConfirmBtn) {
  deleteConfirmBtn.addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    try {
      const res = await fetch(`/api/files/${pendingDeleteId}`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      if (!res.ok) throw new Error('Delete error');
      toast('File deleted successfully.');
      closeModal('deleteModalOverlay');

      // Immediate local state update (BUG 11)
      lastFiles = lastFiles.filter(f => (f._id || f.id) !== pendingDeleteId);
      renderFiles(lastFiles);
      renderPinnedSection(lastFiles);
      loadStats();
      loadFiles();
    } catch (err) {
      toast('Failed to delete file.', 'error');
    }
  });
}

// Modal close bindings
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.close;
    if (target) closeModal(target);
  });
});

const navAboutBtn = $('navAboutBtn');
if (navAboutBtn) navAboutBtn.addEventListener('click', () => openModal('aboutModalOverlay'));

const navHomeBtn = $('navHomeBtn');
if (navHomeBtn) navHomeBtn.addEventListener('click', () => {
  clearSyllabusFilter();
  switchCategory('all');
});

const navRecentBtn = $('navRecentBtn');
if (navRecentBtn) navRecentBtn.addEventListener('click', () => {
  if ($('sortSelect')) $('sortSelect').value = 'recent';
  loadFiles();
});

const navPinnedBtn = $('navPinnedBtn');
if (navPinnedBtn) navPinnedBtn.addEventListener('click', () => switchCategory('pinned'));

// ---------------- Monaco Editor & Online Code Compiler Integration ----------------
function detectMonacoLang(extOrName) {
  const ext = getFileExtension(extOrName);
  switch (ext) {
    case 'py': case 'python': return 'python';
    case 'java': return 'java';
    case 'c': return 'c';
    case 'cpp': case 'cc': case 'cxx': case 'c++': case 'adsa': return 'cpp';
    case 'js': case 'javascript': return 'javascript';
    case 'ts': case 'typescript': return 'typescript';
    case 'go': return 'go';
    case 'rs': case 'rust': return 'rust';
    case 'cs': case 'csharp': return 'csharp';
    case 'php': return 'php';
    case 'rb': case 'ruby': return 'ruby';
    case 'swift': return 'swift';
    case 'kt': case 'kts': case 'kotlin': return 'kotlin';
    case 'scala': return 'scala';
    case 'r': return 'r';
    case 'm': return 'objective-c';
    case 'pl': case 'perl': return 'perl';
    case 'lua': return 'lua';
    case 'sh': case 'bash': return 'shell';
    case 'sql': case 'dbms': return 'sql';
    default: return 'python';
  }
}

function initMonacoEditor(code = '', lang = 'python') {
  const container = $('monacoEditorContainer');
  if (!container) return;

  const currentTheme = document.body.getAttribute('data-theme') === 'light' ? 'vs' : 'vs-dark';
  const monacoLang = detectMonacoLang(lang);

  const init = () => {
    if (window.monaco && window.monaco.editor) {
      if (!monacoEditorInstance) {
        monacoEditorInstance = window.monaco.editor.create(container, {
          value: code,
          language: monacoLang,
          theme: currentTheme,
          automaticLayout: true,
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 10, bottom: 10 }
        });
      } else {
        const model = monacoEditorInstance.getModel();
        if (model) {
          window.monaco.editor.setModelLanguage(model, monacoLang);
          monacoEditorInstance.setValue(code);
        }
        window.monaco.editor.setTheme(currentTheme);
      }
    }
  };

  if (window.monaco && window.monaco.editor) {
    init();
  } else if (window.require) {
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    window.require(['vs/editor/editor.main'], function () {
      init();
    });
  }
}

async function runOnlineFile(id) {
  try {
    const res = await fetch(`/api/files/${id}/preview`);
    if (!res.ok) throw new Error('Could not fetch file content');
    const data = await res.json();
    const file = data.file;
    const code = data.content || '';
    const lang = detectMonacoLang(file.extension || file.originalName || file.category);

    currentCompilerFile = {
      id: file._id || file.id,
      name: file.originalName,
      code: code,
      originalCode: code,
      language: lang
    };

    const titleEl = $('compilerFileName');
    if (titleEl) titleEl.textContent = file.originalName;
    const langSelect = $('compilerLangSelect');
    if (langSelect) langSelect.value = lang;

    const stdinEl = $('compilerStdin');
    if (stdinEl) stdinEl.value = file.expectedOutput ? '' : ''; // Ready for user stdin

    const stdoutText = $('compilerStdoutText');
    if (stdoutText) stdoutText.textContent = 'Press "▶ Run" to compile & execute online...';
    
    const stderrText = $('compilerStderrText');
    if (stderrText) {
      stderrText.style.display = 'none';
      stderrText.textContent = '';
    }
    const iframe = $('compilerIframePreview');
    if (iframe) iframe.style.display = 'none';
    const consoleBox = $('compilerConsole');
    if (consoleBox) consoleBox.style.display = 'block';
    const metrics = $('compilerMetrics');
    if (metrics) metrics.style.display = 'none';

    const statusBadge = $('compilerStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = 'Ready';
      statusBadge.className = 'status-badge ready';
    }

    const saveBtn = $('compilerSaveBtn');
    if (saveBtn) saveBtn.style.display = adminToken ? 'inline-block' : 'none';

    openModal('compilerModalOverlay');
    setTimeout(() => {
      initMonacoEditor(code, lang);
    }, 150);
  } catch (err) {
    toast(`Could not open file in online compiler: ${err.message || 'File read error'}`, 'error');
  }
}

// Complete Compiler Run Engine (BUG 1, 2, 3, 4, 5, 6)
const compRunBtn = $('compilerRunBtn');
if (compRunBtn) {
  compRunBtn.addEventListener('click', async () => {
    if (!monacoEditorInstance) return;

    const code = monacoEditorInstance.getValue();
    const lang = $('compilerLangSelect').value;
    
    // Read EXACT stdin from textarea preserving all newlines (BUG 1 - BUG 4)
    const stdin = $('compilerStdin') ? $('compilerStdin').value : '';

    const statusBadge = $('compilerStatusBadge');
    const consoleOutput = $('compilerStdoutText');
    const stderrOutput = $('compilerStderrText');
    const loading = $('compilerLoading');
    const loadingText = $('compilerLoadingText');
    const iframe = $('compilerIframePreview');
    const metrics = $('compilerMetrics');

    if (lang === 'html') {
      iframe.style.display = 'block';
      if ($('compilerConsole')) $('compilerConsole').style.display = 'none';
      if (metrics) metrics.style.display = 'none';
      iframe.srcdoc = code;
      if (statusBadge) {
        statusBadge.textContent = 'Accepted';
        statusBadge.className = 'status-badge success';
      }
      return;
    }

    iframe.style.display = 'none';
    if ($('compilerConsole')) $('compilerConsole').style.display = 'block';
    if (loading) loading.style.display = 'flex';
    if (loadingText) loadingText.textContent = 'Compiling & Executing code...';
    
    // Clear previous output before each execution (BUG 6)
    if (consoleOutput) consoleOutput.textContent = '';
    if (stderrOutput) {
      stderrOutput.style.display = 'none';
      stderrOutput.textContent = '';
    }

    compRunBtn.disabled = true;
    if (statusBadge) {
      statusBadge.textContent = 'Compiling...';
      statusBadge.className = 'status-badge running';
    }

    try {
      const res = await fetch('/api/compiler/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: lang, stdin })
      });

      const data = await res.json();
      if (loading) loading.style.display = 'none';
      compRunBtn.disabled = false;

      if (!res.ok) {
        if (statusBadge) {
          statusBadge.textContent = 'Compilation Error';
          statusBadge.className = 'status-badge error';
        }
        if (stderrOutput) {
          stderrOutput.style.display = 'block';
          stderrOutput.textContent = data.error || data.details || 'Compilation Failed.';
        }
        return;
      }

      // Display stderr if any
      if (data.stderr) {
        if (stderrOutput) {
          stderrOutput.style.display = 'block';
          stderrOutput.textContent = data.stderr;
        }
      }

      // Display stdout
      if (consoleOutput) {
        consoleOutput.textContent = data.stdout || (data.stderr ? '' : '(No output produced)');
      }

      // Classify Verdict Status Badge (BUG 6)
      const verdictStatus = data.status || (data.exitCode === 0 ? 'Accepted' : 'Runtime Error');
      if (statusBadge) {
        statusBadge.textContent = verdictStatus;
        if (verdictStatus === 'Accepted') {
          statusBadge.className = 'status-badge success';
        } else if (verdictStatus === 'Compilation Error') {
          statusBadge.className = 'status-badge error';
        } else if (verdictStatus === 'Time Limit Exceeded') {
          statusBadge.className = 'status-badge warning';
        } else {
          statusBadge.className = 'status-badge error';
        }
      }

      // Execution Metrics & Exit Code (BUG 6)
      if (metrics) {
        metrics.style.display = 'flex';
        if ($('metricTime')) $('metricTime').textContent = data.time || '0.00s';
        if ($('metricMemory')) $('metricMemory').textContent = `${data.memory || '0 MB'} · Exit Code: ${data.exitCode}`;
      }
    } catch (err) {
      if (loading) loading.style.display = 'none';
      compRunBtn.disabled = false;
      if (statusBadge) {
        statusBadge.textContent = 'Compiler Offline';
        statusBadge.className = 'status-badge error';
      }
      if (stderrOutput) {
        stderrOutput.style.display = 'block';
        stderrOutput.textContent = 'Compiler API is currently offline. Please check connection and try again.';
      }
    }
  });
}

const compClearBtn = $('compilerClearBtn');
if (compClearBtn) {
  compClearBtn.addEventListener('click', () => {
    if ($('compilerStdin')) $('compilerStdin').value = '';
    if ($('compilerStdoutText')) $('compilerStdoutText').textContent = '';
    if ($('compilerStderrText')) $('compilerStderrText').style.display = 'none';
    if ($('compilerIframePreview')) $('compilerIframePreview').srcdoc = '';
    if ($('compilerMetrics')) $('compilerMetrics').style.display = 'none';
    const statusBadge = $('compilerStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = 'Ready';
      statusBadge.className = 'status-badge ready';
    }
  });
}

const compResetBtn = $('compilerResetBtn');
if (compResetBtn) {
  compResetBtn.addEventListener('click', () => {
    if (currentCompilerFile && monacoEditorInstance) {
      monacoEditorInstance.setValue(currentCompilerFile.originalCode || '');
      toast('Code reset to original version.');
    }
  });
}

// ---------------- VS Code Terminal Tabs & Live Stdin Prompt ----------------
document.querySelectorAll('.term-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.term-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const target = tab.dataset.tab;
    const consoleTab = $('termTabConsole');
    const stdinTab = $('termTabStdin');
    const aiTab = $('termTabAi');

    if (consoleTab) consoleTab.style.display = target === 'console' ? 'flex' : 'none';
    if (stdinTab) stdinTab.style.display = target === 'stdin' ? 'block' : 'none';
    if (aiTab) aiTab.style.display = target === 'ai' ? 'block' : 'none';
  });
});

function handleTerminalLiveInput() {
  const inputEl = $('terminalLiveInput');
  if (!inputEl) return;
  const val = inputEl.value.trim();
  if (!val) return;

  const stdinArea = $('compilerStdin');
  if (stdinArea) {
    stdinArea.value = (stdinArea.value ? stdinArea.value + '\n' : '') + val;
  }

  const stdoutText = $('compilerStdoutText');
  if (stdoutText) {
    stdoutText.textContent += (stdoutText.textContent ? '\n' : '') + `❯ ${val}`;
  }

  inputEl.value = '';

  // Trigger compiler execution with updated stdin
  const compRunBtn = $('compilerRunBtn');
  if (compRunBtn) compRunBtn.click();
}

const termSendBtn = $('terminalSendInputBtn');
if (termSendBtn) {
  termSendBtn.addEventListener('click', handleTerminalLiveInput);
}

const termInputEl = $('terminalLiveInput');
if (termInputEl) {
  termInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTerminalLiveInput();
    }
  });
}

// AI Code Tutor Explanation
const aiExplainBtn = $('aiExplainCodeBtn');
if (aiExplainBtn) {
  aiExplainBtn.addEventListener('click', async () => {
    if (!monacoEditorInstance) return;
    const code = monacoEditorInstance.getValue();
    const lang = $('compilerLangSelect') ? $('compilerLangSelect').value : 'python';

    aiExplainBtn.disabled = true;
    aiExplainBtn.textContent = '⏳ Analyzing...';

    try {
      const res = await fetch('/api/ai/explain-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: lang })
      });

      const data = await res.json();
      aiExplainBtn.disabled = false;
      aiExplainBtn.textContent = '✨ Analyze Code';

      if (res.ok) {
        if ($('aiExplainEmpty')) $('aiExplainEmpty').style.display = 'none';
        if ($('aiExplainResults')) $('aiExplainResults').style.display = 'flex';

        if ($('aiExplainText')) $('aiExplainText').textContent = data.explanation || 'No explanation provided.';
        if ($('aiExplainTime')) $('aiExplainTime').textContent = data.timeComplexity || 'O(N)';
        if ($('aiExplainSpace')) $('aiExplainSpace').textContent = data.spaceComplexity || 'O(1)';
        if ($('aiExplainDryRun')) $('aiExplainDryRun').textContent = data.dryRunTrace || 'Execution trace unavailable.';
        if ($('aiExplainOptimization')) $('aiExplainOptimization').textContent = data.optimizationTips || 'Code is optimal.';
      } else {
        toast('AI explanation error: ' + (data.error || 'Server error'), 'error');
      }
    } catch (err) {
      aiExplainBtn.disabled = false;
      aiExplainBtn.textContent = '✨ Analyze Code';
      toast('AI explanation offline.', 'error');
    }
  });
}

const compCopyBtn = $('compilerCopyBtn');
if (compCopyBtn) {
  compCopyBtn.addEventListener('click', () => {
    if (monacoEditorInstance) {
      navigator.clipboard.writeText(monacoEditorInstance.getValue());
      toast('Code copied to clipboard! 📋');
    }
  });
}

const compDownloadBtn = $('compilerDownloadBtn');
if (compDownloadBtn) {
  compDownloadBtn.addEventListener('click', () => {
    if (!monacoEditorInstance) return;
    const code = monacoEditorInstance.getValue();
    const lang = $('compilerLangSelect').value;
    const extMap = { python: 'py', java: 'java', c: 'c', cpp: 'cpp', javascript: 'js', html: 'html', sql: 'sql', adsa: 'cpp' };
    const ext = extMap[lang] || 'txt';
    const name = currentCompilerFile ? currentCompilerFile.name : `code.${ext}`;
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${name} ⬇`);
  });
}

const compFullscreenBtn = $('compilerFullscreenBtn');
if (compFullscreenBtn) {
  compFullscreenBtn.addEventListener('click', () => {
    const box = $('compilerModalBox');
    if (box) box.classList.toggle('fullscreen');
  });
}

const compSaveBtn = $('compilerSaveBtn');
if (compSaveBtn) {
  compSaveBtn.addEventListener('click', async () => {
    if (!currentCompilerFile || !currentCompilerFile.id) {
      toast('No persistent file selected.', 'warning');
      return;
    }
    const code = monacoEditorInstance.getValue();
    try {
      const res = await fetch(`/api/files/${currentCompilerFile.id}/content`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content: code })
      });
      if (!res.ok) throw new Error('Save failed');
      currentCompilerFile.originalCode = code;
      toast('File updated permanently in database! 💾');
      loadFiles();
    } catch (err) {
      toast('Failed to save file changes.', 'error');
    }
  });
}

// ---------------- AI Programming Assistant Handlers ----------------
const aiForm = $('aiAssistantForm');
if (aiForm) {
  aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = $('aiPromptInput').value.trim();
    const subject = $('aiSubjectSelect').value;
    const submitBtn = $('aiSubmitBtn');
    
    if (!prompt) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '✨ AI is generating solution... ⌛';
    }

    const resultCard = $('aiResultCard');
    const fallbackCard = $('aiFallbackCard');
    if (resultCard) resultCard.style.display = 'none';
    if (fallbackCard) fallbackCard.style.display = 'none';

    try {
      const res = await fetch('/api/ai/generate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, subject })
      });

      const data = await res.json();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ Ask AI Assistant for Instant Solution';
      }

      if (!data || !data.verified) {
        if (fallbackCard) fallbackCard.style.display = 'block';
        if ($('aiFallbackText')) $('aiFallbackText').textContent = data.message || "I couldn't generate a verified solution.";
        return;
      }

      currentAiSolution = data;
      if (resultCard) resultCard.style.display = 'block';
      if ($('aiResultTitle')) $('aiResultTitle').textContent = data.title || prompt;
      if ($('aiLangTag')) $('aiLangTag').textContent = (data.language || 'code').toLowerCase();
      if ($('aiTimeTag')) $('aiTimeTag').textContent = `Time: ${data.timeComplexity || 'O(N)'}`;
      if ($('aiSpaceTag')) $('aiSpaceTag').textContent = `Space: ${data.spaceComplexity || 'O(1)'}`;
      if ($('aiExplanation')) $('aiExplanation').textContent = data.explanation || '';
      if ($('aiCodeBlock')) $('aiCodeBlock').textContent = data.code || '';
      if ($('aiSampleInput')) $('aiSampleInput').textContent = data.sampleInput || '(None)';
      if ($('aiSampleOutput')) $('aiSampleOutput').textContent = data.sampleOutput || '(None)';

    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '✨ Ask AI Assistant for Instant Solution';
      }
      if (fallbackCard) fallbackCard.style.display = 'block';
      if ($('aiFallbackText')) $('aiFallbackText').textContent = "I couldn't generate a verified solution.";
    }
  });
}

const aiRunBtn = $('aiRunOnlineBtn');
if (aiRunBtn) {
  aiRunBtn.addEventListener('click', () => {
    if (!currentAiSolution) return;
    const lang = detectMonacoLang(currentAiSolution.language);
    currentCompilerFile = {
      id: null,
      name: `${(currentAiSolution.title || 'ai_program').toLowerCase().replace(/[^a-z0-9]/g, '_')}.${lang === 'python' ? 'py' : lang}`,
      code: currentAiSolution.code,
      originalCode: currentAiSolution.code,
      language: lang
    };

    if ($('compilerFileName')) $('compilerFileName').textContent = currentAiSolution.title || 'AI Generated Program';
    if ($('compilerLangSelect')) $('compilerLangSelect').value = lang;
    if ($('compilerStdin')) $('compilerStdin').value = currentAiSolution.sampleInput || '';
    if ($('compilerStdoutText')) $('compilerStdoutText').textContent = 'Press "▶ Run" to execute code on Judge0...';
    if ($('compilerStderrText')) $('compilerStderrText').style.display = 'none';
    if ($('compilerIframePreview')) $('compilerIframePreview').style.display = 'none';
    if ($('compilerConsole')) $('compilerConsole').style.display = 'block';
    if ($('compilerMetrics')) $('compilerMetrics').style.display = 'none';
    if ($('compilerSaveBtn')) $('compilerSaveBtn').style.display = 'none';

    openModal('compilerModalOverlay');
    setTimeout(() => {
      initMonacoEditor(currentAiSolution.code, lang);
    }, 150);
  });
}

const aiCopyBtn = $('aiCopyBtn');
if (aiCopyBtn) {
  aiCopyBtn.addEventListener('click', () => {
    if (currentAiSolution && currentAiSolution.code) {
      navigator.clipboard.writeText(currentAiSolution.code);
      toast('AI code copied to clipboard! 📋');
    }
  });
}

const aiDownloadBtn = $('aiDownloadBtn');
if (aiDownloadBtn) {
  aiDownloadBtn.addEventListener('click', () => {
    if (!currentAiSolution || !currentAiSolution.code) return;
    const lang = detectMonacoLang(currentAiSolution.language);
    const extMap = { python: 'py', java: 'java', c: 'c', cpp: 'cpp', javascript: 'js', html: 'html', sql: 'sql' };
    const ext = extMap[lang] || 'txt';
    const filename = `${(currentAiSolution.title || 'program').toLowerCase().replace(/[^a-z0-9]/g, '_')}.${ext}`;
    
    const blob = new Blob([currentAiSolution.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${filename} ⬇`);
  });
}

const showAdminReqBtn = $('showAdminReqFormBtn');
if (showAdminReqBtn) {
  showAdminReqBtn.addEventListener('click', () => {
    const wrap = $('adminReqFormWrap');
    if (wrap) {
      wrap.style.display = 'block';
      const promptVal = $('aiPromptInput') ? $('aiPromptInput').value : '';
      if (promptVal && $('reqProgramName')) $('reqProgramName').value = promptVal;
      const subjVal = $('aiSubjectSelect') ? $('aiSubjectSelect').value : '';
      if (subjVal && $('reqSubject')) $('reqSubject').value = subjVal;
      wrap.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// Easter Eggs & Interactive Card 3D Tilt
function initEasterEggs() {
  const searchInput = $('searchInput');
  if (searchInput) {
    let lastTypedKeyword = '';
    searchInput.addEventListener('input', (e) => {
      const val = (e.target.value || '').toLowerCase().trim();
      if (val === lastTypedKeyword) return;
      lastTypedKeyword = val;

      if (val.includes('python')) {
        showLargePythonSnake('view', searchInput);
      } else if (val.includes('java')) {
        triggerMascotAnim('java', searchInput);
      } else if (val.includes('linux')) {
        triggerMascotAnim('linux', searchInput);
      } else if (val.includes('adsa')) {
        triggerMascotAnim('adsa', searchInput);
      } else if (val.includes('dbms')) {
        triggerMascotAnim('dbms', searchInput);
      }
    });
  }

  // 3D Tilt for file cards & pinned cards
  document.body.addEventListener('mousemove', (e) => {
    const card = e.target.closest('.file-card, .pinned-item-card, .category-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotateX = ((y - cy) / cy) * -6;
    const rotateY = ((x - cx) / cx) * 6;
    card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
  });

  document.body.addEventListener('mouseout', (e) => {
    const card = e.target.closest('.file-card, .pinned-item-card, .category-card');
    if (card) {
      card.style.transform = '';
    }
  });
}

// ---------------- Admin Official Experiment Assignment & Syllabus Matrix ----------------
function openAssignExperimentModal(fileId, originalName, currentCat) {
  const idInput = $('assignFileId');
  const nameLabel = $('assignFileOriginalName');
  const courseSelect = $('assignCourseSelect');

  if (idInput) idInput.value = fileId;
  if (nameLabel) nameLabel.textContent = originalName;

  if (courseSelect) {
    if (['java', 'python', 'adsa', 'dbms'].includes(currentCat)) {
      courseSelect.value = currentCat;
    }
    populateAssignExpSelect(courseSelect.value);
  }

  openModal('assignExperimentModalOverlay');
}

function populateAssignExpSelect(courseKey) {
  const expSelect = $('assignExpSelect');
  if (!expSelect) return;
  expSelect.innerHTML = '';

  const courseObj = syllabusData[courseKey];
  const questions = courseObj?.exercises[0]?.questions || [];

  questions.forEach(q => {
    const opt = document.createElement('option');
    opt.value = q.number;
    opt.textContent = `#${q.number} - ${q.rawTitle || q.title}`;
    expSelect.appendChild(opt);
  });
}

const assignCourseSelect = $('assignCourseSelect');
if (assignCourseSelect) {
  assignCourseSelect.addEventListener('change', () => {
    populateAssignExpSelect(assignCourseSelect.value);
  });
}

const assignExperimentForm = $('assignExperimentForm');
if (assignExperimentForm) {
  assignExperimentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileId = $('assignFileId').value;
    const category = $('assignCourseSelect').value;
    const experimentNumber = $('assignExpSelect').value;

    try {
      const res = await fetch('/api/syllabus/assign', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ fileId, category, experimentNumber })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.conflict) {
          if (confirm(data.message)) {
            const overrideRes = await fetch('/api/syllabus/assign', {
              method: 'POST',
              headers: jsonAuthHeaders(),
              body: JSON.stringify({ fileId, category, experimentNumber, overrideDuplicate: true })
            });
            if (!overrideRes.ok) throw new Error('Override failed');
            toast('Experiment mapping successfully updated! 🎯');
            closeModal('assignExperimentModalOverlay');
            loadFiles();
            return;
          }
          return;
        }
        throw new Error(data.error || 'Failed to assign');
      }

      toast(data.message || 'Experiment assigned successfully! 🎯');
      closeModal('assignExperimentModalOverlay');
      loadFiles();
    } catch (err) {
      toast(err.message || 'Failed to assign experiment.', 'error');
    }
  });
}

// Syllabus Matrix Modal
let currentMatrixTab = 'java';

function switchMatrixTab(tab) {
  currentMatrixTab = tab;
  ['matrixTabJava', 'matrixTabPython', 'matrixTabDbms', 'matrixTabAdsa'].forEach(id => {
    const btn = $(id);
    if (btn) btn.classList.toggle('active', id.toLowerCase().includes(tab));
  });
  renderSyllabusMatrix();
}

async function renderSyllabusMatrix() {
  const container = $('syllabusMatrixContainer');
  if (!container) return;

  container.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-dim);">Loading syllabus checklist...</div>';

  try {
    const res = await fetch(`/api/syllabus/view?category=${currentMatrixTab}&sort=sno`);
    if (!res.ok) throw new Error('Failed to load matrix');
    const data = await res.json();
    const items = data.items || [];

    const courseObj = syllabusData[currentMatrixTab] || {};
    const totalExp = items.length;
    const availCount = items.filter(it => it.status === 'available').length;

    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:12px 16px; background:var(--bg-alt); border-radius:10px; border:1px solid var(--card-border);">
        <div>
          <strong style="font-size:1.05rem;">${escapeHtml(courseObj.title || currentMatrixTab.toUpperCase())}</strong>
          <span style="font-size:0.8rem; color:var(--text-dim); margin-left:8px;">(${courseObj.code || ''})</span>
        </div>
        <div>
          <span style="color:#10b981; font-weight:700;">${availCount}</span> / ${totalExp} Available
          <span style="color:#f59e0b; font-weight:700; margin-left:12px;">${totalExp - availCount}</span> Coming Soon
        </div>
      </div>
      <table class="syllabus-admin-table">
        <thead>
          <tr>
            <th style="width:60px;">#</th>
            <th>Official Experiment Name</th>
            <th style="width:115px;">Status</th>
            <th>Uploaded File</th>
            <th style="width:150px; text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach(it => {
      const isAvail = it.status === 'available' && it.file;
      const file = it.file;

      html += `
        <tr>
          <td><strong style="color:var(--accent);">#${String(it.experimentNumber).padStart(2, '0')}</strong></td>
          <td><strong>${escapeHtml(it.experimentName)}</strong></td>
          <td>
            ${isAvail ? `<span class="status-tag-available">AVAILABLE</span>` : `<span class="status-tag-coming-soon">COMING SOON</span>`}
          </td>
          <td>
            ${isAvail ? `<span style="font-family:monospace; font-size:0.82rem; color:var(--accent-2);">${escapeHtml(file.originalName)}</span> <span style="font-size:0.75rem; color:var(--text-dim);">(${fmtSize(file.size)})</span>` : `<span style="color:var(--text-dim); font-size:0.8rem;">—</span>`}
          </td>
          <td style="text-align:right;">
            ${isAvail ? `
              <button class="card-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="previewFile('${file._id || file.id}')">👁 View</button>
              <button class="card-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="openAssignExperimentModal('${file._id || file.id}', '${escapeHtml(file.originalName)}', '${currentMatrixTab}')">Reassign</button>
            ` : `
              <button class="card-btn primary" style="padding:2px 8px; font-size:0.75rem;" onclick="triggerUploadForExperiment('${currentMatrixTab}', ${it.experimentNumber})">+ Upload</button>
            `}
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; padding:20px;">Failed to load syllabus matrix: ${err.message}</div>`;
  }
}

const dashSyllabusBtn = $('dashSyllabusBtn');
if (dashSyllabusBtn) {
  dashSyllabusBtn.addEventListener('click', () => {
    switchMatrixTab('java');
    openModal('syllabusMatrixModalOverlay');
  });
}

// Promo & App Settings (Synced with server & localStorage)
let promoSettings = {
  replicaLink: 'https://betadrop.app/i/eXW3zM',
  replicaTitle: 'REPLICA: Keyboard Companion',
  replicaSubtext: 'Try our new APK — click to install REPLICA directly on your device',
  replicaBadge: 'TRY OUR NEW APK',
  replicaBtnText: 'Install REPLICA APK 📲',
  promoEnabled: true,
  gitRepoLink: 'https://github.com/',
  gitRepoTitle: 'GitHub Repository',
  gitRepoEnabled: true
};

function applyPromoSettings(settings) {
  if (!settings) return;
  promoSettings = { ...promoSettings, ...settings };

  // Update Top Banner
  const promoBar = $('replicaPromoBar');
  if (promoBar) {
    promoBar.style.display = promoSettings.promoEnabled ? 'block' : 'none';
  }
  const topTag = document.querySelector('.replica-promo-bar .promo-tag-text');
  if (topTag) topTag.textContent = promoSettings.replicaBadge;

  const topHeadline = document.querySelector('.replica-promo-bar .promo-headline');
  if (topHeadline) {
    if (promoSettings.replicaTitle.includes(':')) {
      const parts = promoSettings.replicaTitle.split(':');
      topHeadline.innerHTML = `${escapeHtml(parts[0])}: <strong class="promo-name">${escapeHtml(parts.slice(1).join(':').trim())}</strong>`;
    } else {
      topHeadline.innerHTML = `<strong class="promo-name">${escapeHtml(promoSettings.replicaTitle)}</strong>`;
    }
  }
  const topSub = document.querySelector('.replica-promo-bar .promo-subtext');
  if (topSub) topSub.textContent = promoSettings.replicaSubtext;

  const topBtn = $('replicaInstallBtn');
  if (topBtn) {
    topBtn.href = promoSettings.replicaLink;
    const ctaText = topBtn.querySelector('.cta-text');
    if (ctaText) ctaText.textContent = promoSettings.replicaBtnText;
  }

  // Update Intro Card
  const introPromo = $('introApkPromo');
  if (introPromo) {
    introPromo.style.display = promoSettings.promoEnabled ? 'flex' : 'none';
  }
  const introBadge = document.querySelector('.intro-apk-promo .intro-apk-badge');
  if (introBadge) introBadge.textContent = `✨ ${promoSettings.replicaBadge}`;

  const introInfo = document.querySelector('.intro-apk-promo .intro-apk-info');
  if (introInfo) {
    const strongEl = introInfo.querySelector('strong');
    const spanEl = introInfo.querySelector('span');
    if (strongEl) strongEl.textContent = `Try our new APK: ${promoSettings.replicaTitle.split(':')[0]}`;
    if (spanEl) spanEl.textContent = promoSettings.replicaSubtext;
  }
  const introBtn = $('introReplicaInstallBtn');
  if (introBtn) {
    introBtn.href = promoSettings.replicaLink;
    introBtn.textContent = promoSettings.replicaBtnText;
  }

  // Update Navbar Direct Buttons
  const navGitBtn = $('navGitBtn');
  if (navGitBtn) {
    navGitBtn.href = promoSettings.gitRepoLink || 'https://github.com/';
    navGitBtn.style.display = promoSettings.gitRepoEnabled !== false ? 'inline-flex' : 'none';
  }
  const navApkBtn = $('navApkBtn');
  if (navApkBtn) {
    navApkBtn.href = promoSettings.replicaLink || 'https://betadrop.app/i/eXW3zM';
  }

  // Update Site Footer Links
  const footerGit = $('footerGitLink');
  if (footerGit) {
    footerGit.href = promoSettings.gitRepoLink || 'https://github.com/';
    footerGit.style.display = promoSettings.gitRepoEnabled !== false ? 'inline-flex' : 'none';
  }
  const footerGitText = $('footerGitText');
  if (footerGitText) {
    footerGitText.textContent = promoSettings.gitRepoTitle || 'GitHub Repository';
  }
  const footerApk = $('footerApkLink');
  if (footerApk) {
    footerApk.href = promoSettings.replicaLink || 'https://betadrop.app/i/eXW3zM';
  }
  const footerApkText = $('footerApkText');
  if (footerApkText) {
    const apkShortName = promoSettings.replicaTitle ? promoSettings.replicaTitle.split(':')[0].trim() : 'REPLICA';
    footerApkText.textContent = `${apkShortName} Companion APK`;
  }

  // Update About Modal Links
  const aboutGitLink = $('aboutGitLink');
  if (aboutGitLink) {
    aboutGitLink.href = promoSettings.gitRepoLink || 'https://github.com/';
    aboutGitLink.textContent = promoSettings.gitRepoLink || 'https://github.com/';
  }
  const aboutApkLink = $('aboutApkLink');
  if (aboutApkLink) {
    aboutApkLink.href = promoSettings.replicaLink || 'https://betadrop.app/i/eXW3zM';
    const apkShortName = promoSettings.replicaTitle ? promoSettings.replicaTitle.split(':')[0].trim() : 'REPLICA';
    aboutApkLink.textContent = `${apkShortName} APK (Live Download) 📲`;
  }
}

async function loadPromoSettings() {
  try {
    const cached = localStorage.getItem('zipshare_promo_settings');
    if (cached) {
      applyPromoSettings(JSON.parse(cached));
    }
  } catch (e) {}

  try {
    const res = await fetch('/api/admin/settings');
    if (res.ok) {
      const data = await res.json();
      applyPromoSettings(data);
      try {
        localStorage.setItem('zipshare_promo_settings', JSON.stringify(data));
      } catch (e) {}
    }
  } catch (err) {
    console.warn('Using default promo settings:', err);
  }
}

function populatePromoSettingsForm() {
  if ($('adminPromoLinkInput')) $('adminPromoLinkInput').value = promoSettings.replicaLink || 'https://betadrop.app/i/eXW3zM';
  if ($('adminPromoTitleInput')) $('adminPromoTitleInput').value = promoSettings.replicaTitle || 'REPLICA: Keyboard Companion';
  if ($('adminPromoSubtextInput')) $('adminPromoSubtextInput').value = promoSettings.replicaSubtext || 'Try our new APK — click to install REPLICA directly on your device';
  if ($('adminPromoBadgeInput')) $('adminPromoBadgeInput').value = promoSettings.replicaBadge || 'TRY OUR NEW APK';
  if ($('adminPromoBtnTextInput')) $('adminPromoBtnTextInput').value = promoSettings.replicaBtnText || 'Install REPLICA APK 📲';
  if ($('adminPromoEnabledInput')) $('adminPromoEnabledInput').checked = promoSettings.promoEnabled !== false;
  
  if ($('adminGitRepoLinkInput')) $('adminGitRepoLinkInput').value = promoSettings.gitRepoLink || 'https://github.com/';
  if ($('adminGitRepoTitleInput')) $('adminGitRepoTitleInput').value = promoSettings.gitRepoTitle || 'GitHub Repository';
  if ($('adminGitRepoEnabledInput')) $('adminGitRepoEnabledInput').checked = promoSettings.gitRepoEnabled !== false;
}

async function handleSavePromoSettings() {
  if (!adminToken) {
    toast('Admin authorization required to update links.', 'warning');
    return;
  }
  const link = $('adminPromoLinkInput')?.value.trim();
  if (!link) {
    toast('Please enter a valid link URL.', 'error');
    return;
  }

  const payload = {
    replicaLink: link,
    replicaTitle: $('adminPromoTitleInput')?.value.trim() || 'REPLICA: Keyboard Companion',
    replicaSubtext: $('adminPromoSubtextInput')?.value.trim() || 'Try our new APK — click to install REPLICA directly on your device',
    replicaBadge: $('adminPromoBadgeInput')?.value.trim() || 'TRY OUR NEW APK',
    replicaBtnText: $('adminPromoBtnTextInput')?.value.trim() || 'Install REPLICA APK 📲',
    promoEnabled: $('adminPromoEnabledInput') ? $('adminPromoEnabledInput').checked : true,
    gitRepoLink: $('adminGitRepoLinkInput')?.value.trim() || 'https://github.com/',
    gitRepoTitle: $('adminGitRepoTitleInput')?.value.trim() || 'GitHub Repository',
    gitRepoEnabled: $('adminGitRepoEnabledInput') ? $('adminGitRepoEnabledInput').checked : true
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(err.message || 'Failed to update links on server.', 'error');
      return;
    }

    const data = await res.json();
    const newSettings = data.settings || payload;
    applyPromoSettings(newSettings);
    try {
      localStorage.setItem('zipshare_promo_settings', JSON.stringify(newSettings));
    } catch (e) {}
    toast('Links updated and committed to Git! 🚀', 'success');
    closeModal('promoLinksModalOverlay');
  } catch (err) {
    applyPromoSettings(payload);
    try {
      localStorage.setItem('zipshare_promo_settings', JSON.stringify(payload));
    } catch (e) {}
    toast('Links saved locally! 🚀', 'success');
    closeModal('promoLinksModalOverlay');
  }
}

// Global Init for Promo
function initReplicaPromo() {
  loadPromoSettings();

  const installBtn = $('replicaInstallBtn');
  const introBtn = $('introReplicaInstallBtn');
  const icons = document.querySelectorAll('.replica-app-icon');
  
  [installBtn, introBtn].forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUrl = promoSettings.replicaLink || 'https://betadrop.app/i/eXW3zM';
      toast('Opening REPLICA APK installation on BetaDrop... Tap Install to download! 📲', 'success');
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    });
  });

  icons.forEach(icon => {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', () => {
      const targetUrl = promoSettings.replicaLink || 'https://betadrop.app/i/eXW3zM';
      toast('Opening REPLICA APK installation on BetaDrop... 📲', 'success');
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    });
  });
}

// =========================================================
// HOMEPAGE NAVIGATION, SCROLLING & VIEW MODE TOGGLE
// =========================================================

window.scrollToSection = function(sectionId) {
  const el = typeof sectionId === 'string' ? document.getElementById(sectionId) : sectionId;
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.pageYOffset - 20;
  window.scrollTo({
    top: Math.max(0, top),
    behavior: 'smooth'
  });
};

window.filterAndScrollToSubject = function(category, experimentNumber) {
  switchCategory(category);
  const gridSection = document.getElementById('fileGrid') || document.getElementById('pinnedSection');
  if (gridSection) {
    gridSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (experimentNumber) {
    setTimeout(() => {
      const cards = document.querySelectorAll('#fileGrid .file-card');
      const snoTarget = '#' + String(experimentNumber).padStart(2, '0');
      for (const card of cards) {
        const snoEl = card.querySelector('.card-sno-badge');
        if (snoEl && snoEl.textContent.trim() === snoTarget) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('pulse-highlight');
          setTimeout(() => card.classList.remove('pulse-highlight'), 2400);
          break;
        }
      }
    }, 400);
  }
};

function initViewModeToggle() {
  const viewGridBtn = document.getElementById('viewGridBtn');
  const viewListBtn = document.getElementById('viewListBtn');
  const fileGrid = document.getElementById('fileGrid');

  function setViewMode(mode) {
    if (!fileGrid) return;
    if (mode === 'list') {
      fileGrid.classList.add('list-view');
      if (viewListBtn) {
        viewListBtn.classList.add('active');
        viewListBtn.setAttribute('aria-pressed', 'true');
      }
      if (viewGridBtn) {
        viewGridBtn.classList.remove('active');
        viewGridBtn.setAttribute('aria-pressed', 'false');
      }
    } else {
      fileGrid.classList.remove('list-view');
      if (viewGridBtn) {
        viewGridBtn.classList.add('active');
        viewGridBtn.setAttribute('aria-pressed', 'true');
      }
      if (viewListBtn) {
        viewListBtn.classList.remove('active');
        viewListBtn.setAttribute('aria-pressed', 'false');
      }
    }
    try {
      localStorage.setItem('zipshare_view_mode', mode);
    } catch (_) {}
  }

  if (viewGridBtn) {
    viewGridBtn.addEventListener('click', () => setViewMode('grid'));
  }
  if (viewListBtn) {
    viewListBtn.addEventListener('click', () => setViewMode('list'));
  }

  const savedViewMode = localStorage.getItem('zipshare_view_mode') || 'grid';
  setViewMode(savedViewMode);
}

window.addEventListener('DOMContentLoaded', () => {
  initCinematicEyes();
  initEasterEggs();
  initIntro();
  initOpArtSphere();
  initReplicaPromo();
  initParticles();
  setupUploads();
  setupDashboardBindings();
  updateSessionBadge();
  loadSyllabus();
  renderSubjectAnimation('all');
  loadFiles();
  initViewModeToggle();
});
