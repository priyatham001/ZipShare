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

function initIntro() {
  applyTheme(activeTheme);
  initMascot();
  initWelcomeIllusion();

  // Step 1 -> Step 2
  const step1Next = $('step1NextBtn');
  if (step1Next) {
    step1Next.addEventListener('click', () => {
      $('onboardStep1').style.display = 'none';
      $('onboardStep2').style.display = 'flex';
    });
  }

  // Step 2 -> Step 3
  const step2Next = $('step2NextBtn');
  if (step2Next) {
    step2Next.addEventListener('click', () => {
      $('onboardStep2').style.display = 'none';
      $('onboardStep3').style.display = 'flex';
    });
  }

  // Step 2 Back -> Step 1
  const step2Back = $('step2BackBtn');
  if (step2Back) {
    step2Back.addEventListener('click', () => {
      $('onboardStep2').style.display = 'none';
      $('onboardStep1').style.display = 'flex';
    });
  }

  // Step 3 Back -> Step 2
  const step3Back = $('step3BackBtn');
  if (step3Back) {
    step3Back.addEventListener('click', () => {
      $('onboardStep3').style.display = 'none';
      $('onboardStep2').style.display = 'flex';
    });
  }

  // Theme cards inside step 2
  document.querySelectorAll('.theme-card').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-card').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTheme(btn.dataset.theme);
    });
  });

  document.querySelectorAll('.welcome-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.welcome-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
    });
  });

  const enterBtn = $('enterAppBtn');
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      localStorage.setItem('zipshare_visited', 'true');
      localStorage.setItem('zipshare_favorite_subject', activeCategory);
      $('introScreen').classList.add('hidden');
      $('welcomeSplash').classList.add('show');
      
      setTimeout(() => {
        $('welcomeSplash').classList.remove('show');
        $('app').classList.add('show');
        switchCategory(activeCategory);
      }, 1200);
    });
  }

  if (localStorage.getItem('zipshare_visited')) {
    const savedSubject = localStorage.getItem('zipshare_favorite_subject');
    if (savedSubject && ['java', 'python', 'c', 'dbms', 'adsa'].includes(savedSubject)) {
      activeCategory = savedSubject;
    }
    if ($('introScreen')) $('introScreen').classList.add('hidden');
    if ($('app')) $('app').classList.add('show');
  }
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
function switchCategory(cat) {
  activeCategory = cat;

  document.querySelectorAll('.chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.category === cat);
  });

  const stages = {
    all: { icon: '⭐', title: 'All Files & Folders', desc: 'Browse all programming code, lab records, notes and project folders.' },
    java: { icon: '☕', title: 'Java Projects', desc: 'Object Oriented Programming, Multithreading, and Data Structures in Java.' },
    python: { icon: '🐍', title: 'Python Programs', desc: 'Lab programs, logic problems, algorithms, and scripts.' },
    c: { icon: '💻', title: 'C Language Programming', desc: 'Core C language lab exercises, pointers, matrix operations, and algorithms.' },
    dbms: { icon: '🗄️', title: 'Database Management Systems (DBMS)', desc: 'SQL DDL/DML queries, schema files, normalization, and joins.' },
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
  loadFiles();
  renderBreadcrumbs();
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

    const isSyllabusCat = ['all', 'java', 'python', 'adsa'].includes(activeCategory);

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
  const isAvailable = item.status === 'available' && item.file;
  const file = item.file;
  const isPinned = Boolean(file?.pinned);
  const snoStr = String(item.experimentNumber).padStart(2, '0');

  card.className = `file-card ${isAvailable ? 'available-card' : 'coming-soon-card'} ${isPinned ? 'pinned-card' : ''}`;

  if (isAvailable) {
    const ext = (file.extension || 'default').toLowerCase();
    const meta = ICONS[ext] || ICONS.default;
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

    card.innerHTML = `
      ${isPinned ? '<span class="pin-badge">📌</span>' : ''}
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="card-sno-badge">#${snoStr}</div>
          <span class="status-tag-available">AVAILABLE</span>
        </div>
        <h3 class="experiment-title">${item.experimentNumber}. ${escapeHtml(item.experimentName)}</h3>
        <div class="card-course-tag">${escapeHtml(item.category.toUpperCase())} · ${escapeHtml(item.courseCode || '')}</div>
        <div>
          <span class="card-filename-sub" title="${escapeHtml(file.originalName)}">
            <span class="sub-label">File:</span>${escapeHtml(file.originalName)}
          </span>
        </div>
        <div class="file-meta">
          <span>${fmtSize(file.size)}</span> · <span>${fmtDate(file.uploadDate)}</span>
        </div>
      </div>
      <div class="card-actions" style="margin-top:14px;">
        ${actionBtns}
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

// ---------------- Stats ----------------
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

    if (syl) {
      statsBar.innerHTML = `
        <div class="stat-card"><b>91</b><span>Official Experiments</span></div>
        <div class="stat-card" style="border-color: rgba(16,185,129,0.4);"><b>${syl.totalAvailable}</b><span style="color:#10b981;">Available Now</span></div>
        <div class="stat-card" style="border-color: rgba(245,158,11,0.4);"><b>${syl.totalComingSoon}</b><span style="color:#f59e0b;">Coming Soon</span></div>
        <div class="stat-card"><b>${syl.courses.java.available}/35</b><span>Java Lab</span></div>
        <div class="stat-card"><b>${syl.courses.python.available}/40</b><span>Python Lab</span></div>
        <div class="stat-card"><b>${syl.courses.adsa.available}/16</b><span>DSA Lab</span></div>
      `;
    } else {
      statsBar.innerHTML = `
        <div class="stat-card"><b>${s.totalFiles || 0}</b><span>Total Files</span></div>
        <div class="stat-card"><b>${s.pinned || 0}</b><span>Pinned Items</span></div>
        <div class="stat-card"><b>${s.totalDownloads || 0}</b><span>Downloads</span></div>
        <div class="stat-card"><b>${fmtSize(s.storageUsed || 0)}</b><span>Storage Used</span></div>
      `;
    }
  } catch { /* non-critical */ }
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

async function previewFile(id) {
  try {
    const fileLoc = lastFiles.find(f => (f._id || f.id) === id);
    if (fileLoc) {
      triggerMascotAnim(getMascotType(fileLoc), document.activeElement);
    }

    const res = await fetch(`/api/files/${id}/preview`);
    if (!res.ok) throw new Error('Preview error');
    const data = await res.json();
    previewingFile = data.file;

    if ($('previewTitle')) $('previewTitle').textContent = data.file.originalName;
    const ext = data.file.extension || 'default';
    if ($('previewFileIcon')) $('previewFileIcon').textContent = (ICONS[ext] || ICONS.default).icon;

    const body = $('previewBody');
    const adminEditBtn = $('editContentBtn');

    if (adminToken && data.type === 'text') {
      if (adminEditBtn) adminEditBtn.style.display = 'inline-block';
      if ($('codeEditorTextarea')) $('codeEditorTextarea').value = data.content || '';
    } else {
      if (adminEditBtn) adminEditBtn.style.display = 'none';
    }

    if ($('adminEditorSection')) $('adminEditorSection').style.display = 'none';

    // Update solution explorer panel if exercise metadata exists
    const solPanel = $('solutionExplorerPanel');
    if (solPanel) solPanel.classList.remove('open');
    renderSolutionPanel(data.file);

    if (body) {
      if (data.type === 'text') {
        body.innerHTML = `<pre><code class="language-${ext}">${escapeHtml(data.content)}</code></pre>`;
        if (window.hljs) window.hljs.highlightAll();
      } else if (data.type === 'image') {
        body.innerHTML = `<img src="${data.url}" style="max-width:100%; border-radius:12px; display:block; margin:0 auto;" />`;
      } else if (data.type === 'pdf') {
        body.innerHTML = `<iframe src="${data.url}" style="width:100%; height:450px; border:none; border-radius:12px;"></iframe>`;
      } else {
        body.innerHTML = `<p style="text-align:center; padding:30px;">Binary / Unsupported format. Please download to view on your system.</p>`;
      }
    }

    openModal('previewModalOverlay');
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

const copyCodeBtn = $('copyCodeBtn');
if (copyCodeBtn) {
  copyCodeBtn.addEventListener('click', async () => {
    const codeEl = document.querySelector('#previewBody code') || document.querySelector('#previewBody');
    if (codeEl) {
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
        toast('Code copied to clipboard! 📋');
      } catch (err) {
        toast('Failed to copy code', 'error');
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
      if ($('adminPromoLinkInput')) $('adminPromoLinkInput').value = 'https://betadrop.app/i/WxHMDn';
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
    if (['java', 'python', 'adsa'].includes(currentCat)) {
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
  ['matrixTabJava', 'matrixTabPython', 'matrixTabAdsa'].forEach(id => {
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
  replicaLink: 'https://betadrop.app/i/WxHMDn',
  replicaTitle: 'REPLICA: Keyboard Companion',
  replicaSubtext: 'Try our new APK — click to install REPLICA directly on your device',
  replicaBadge: 'TRY OUR NEW APK',
  replicaBtnText: 'Install REPLICA APK 📲',
  promoEnabled: true
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
  if ($('adminPromoLinkInput')) $('adminPromoLinkInput').value = promoSettings.replicaLink || 'https://betadrop.app/i/WxHMDn';
  if ($('adminPromoTitleInput')) $('adminPromoTitleInput').value = promoSettings.replicaTitle || 'REPLICA: Keyboard Companion';
  if ($('adminPromoSubtextInput')) $('adminPromoSubtextInput').value = promoSettings.replicaSubtext || 'Try our new APK — click to install REPLICA directly on your device';
  if ($('adminPromoBadgeInput')) $('adminPromoBadgeInput').value = promoSettings.replicaBadge || 'TRY OUR NEW APK';
  if ($('adminPromoBtnTextInput')) $('adminPromoBtnTextInput').value = promoSettings.replicaBtnText || 'Install REPLICA APK 📲';
  if ($('adminPromoEnabledInput')) $('adminPromoEnabledInput').checked = promoSettings.promoEnabled !== false;
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
    promoEnabled: $('adminPromoEnabledInput') ? $('adminPromoEnabledInput').checked : true
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
    toast('Promo & APK links updated successfully! 🚀', 'success');
    closeModal('promoLinksModalOverlay');
  } catch (err) {
    applyPromoSettings(payload);
    try {
      localStorage.setItem('zipshare_promo_settings', JSON.stringify(payload));
    } catch (e) {}
    toast('Promo links saved locally! 🚀', 'success');
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
      const targetUrl = promoSettings.replicaLink || 'https://betadrop.app/i/WxHMDn';
      toast('Opening REPLICA APK installation on BetaDrop... Tap Install to download! 📲', 'success');
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    });
  });

  icons.forEach(icon => {
    icon.style.cursor = 'pointer';
    icon.addEventListener('click', () => {
      const targetUrl = promoSettings.replicaLink || 'https://betadrop.app/i/WxHMDn';
      toast('Opening REPLICA APK installation on BetaDrop... 📲', 'success');
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initCinematicEyes();
  initEasterEggs();
  initIntro();
  initReplicaPromo();
  initParticles();
  setupUploads();
  setupDashboardBindings();
  updateSessionBadge();
  loadSyllabus();
  renderSubjectAnimation('all');
  loadFiles();
});
