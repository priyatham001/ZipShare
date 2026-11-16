/**
 * ZipShare 3D Scene Engine (Three.js PBR Studio)
 * Follows Three.js architectural guidelines:
 * - Composite 3-12 part procedural models for each subject (Java, Python, DBMS, ADSA, Hub)
 * - Studio PBR lighting rig (Key + cool Hemisphere fill + rim) and ACESFilmicToneMapping
 * - Procedural studio reflection environment map (zero external 404 dependencies)
 * - Software-WebGL detection & frame pacing via afterDraw
 * - Damped camera & smooth orbit interaction
 * - Collapsible bottom control dock with exploded view slider, lighting presets, and subject tabs
 */

(function () {
  'use strict';

  // Math helpers pre-allocated at module scope for zero GC inside render loop
  const _scratchVec1 = (window.THREE) ? new THREE.Vector3() : null;
  const _scratchVec2 = (window.THREE) ? new THREE.Vector3() : null;

  // Software WebGL detection
  const isSoftwareGl = (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param) || '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch (e) {
      return true;
    }
  })();

  // 3D Scene Controller
  class ZipShare3DWorld {
    constructor(mountId) {
      this.mount = document.getElementById(mountId);
      if (!this.mount) return;

      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.clock = null;
      this.frameId = 0;

      // Interaction & Animation State
      this.isDragging = false;
      this.prevPointerX = 0;
      this.prevPointerY = 0;
      this.targetRotY = 0.3;
      this.targetRotX = 0.2;
      this.currentRotY = 0.3;
      this.currentRotX = 0.2;
      this.autoRotate = true;
      this.autoRotateSpeed = 0.6;
      this.explodedFactor = 0;

      // Subject Models
      this.models = {};
      this.activeSubject = 'all';
      this.stageGroup = null;

      // Lighting mood
      this.currentLighting = 'cyber';

      this.init();
    }

    init() {
      if (!window.THREE) {
        console.warn('Three.js library is loading...');
        setTimeout(() => this.init(), 100);
        return;
      }

      const width = this.mount.clientWidth || 320;
      const height = this.mount.clientHeight || 240;

      // 1. Scene & Horizon Fog
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0x0a0f1d, 0.045);

      // 2. Camera with pleasant perspective
      this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      this.camera.position.set(0, 2.2, 5.2);
      this.camera.lookAt(0, 0.6, 0);

      // 3. Renderer with PBR color pipeline & Tone Mapping
      this.renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: true
      });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.renderer.shadowMap.enabled = !isSoftwareGl;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      this.mount.innerHTML = '';
      this.mount.appendChild(this.renderer.domElement);

      // 4. Procedural Studio Environment Map (Zero 404s)
      this.setupStudioEnvironment();

      // 5. Studio 3-Point Lighting Rig
      this.setupLighting();

      // 6. Ground Pedestal & Radial Contact Shadow
      this.setupGround();

      // 7. Composite Procedural Models (3-12 parts each)
      this.stageGroup = new THREE.Group();
      this.scene.add(this.stageGroup);
      this.buildAllSubjectModels();

      // 8. Event Listeners for Interaction
      this.setupInteraction();
      this.setupResize();

      // 9. Animation Loop
      this.clock = new THREE.Clock();
      this.animate = this.animate.bind(this);
      this.animate();

      // Initial active subject
      this.switchSubject('all');
    }

    setupStudioEnvironment() {
      // Create high-res gradient canvas texture for realistic PBR metallic reflections
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#040d1a');
      grad.addColorStop(0.3, '#0b1d36');
      grad.addColorStop(0.5, '#1e3a8a');
      grad.addColorStop(0.7, '#0284c7');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Softbox reflection strips for authentic metallic bevel highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(60, 40, 90, 160);
      ctx.fillRect(360, 50, 70, 140);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.fillRect(200, 20, 110, 80);

      const envTexture = new THREE.CanvasTexture(canvas);
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      envTexture.colorSpace = THREE.SRGBColorSpace;
      this.scene.environment = envTexture;
    }

    setupLighting() {
      this.lightsGroup = new THREE.Group();
      this.scene.add(this.lightsGroup);

      // Key Light (warm directional with soft shadow)
      this.keyLight = new THREE.DirectionalLight(0xfff7ed, 2.2);
      this.keyLight.position.set(4, 6, 4);
      if (!isSoftwareGl) {
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.width = 1024;
        this.keyLight.shadow.mapSize.height = 1024;
        this.keyLight.shadow.bias = -0.0005;
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 15;
        this.keyLight.shadow.camera.left = -3;
        this.keyLight.shadow.camera.right = 3;
        this.keyLight.shadow.camera.top = 3;
        this.keyLight.shadow.camera.bottom = -3;
      }
      this.lightsGroup.add(this.keyLight);

      // Cool Hemisphere Light fill
      this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 1.1);
      this.lightsGroup.add(this.hemiLight);

      // Accent Rim Light (cyber violet/cyan highlight)
      this.rimLight = new THREE.PointLight(0x818cf8, 2.4, 12);
      this.rimLight.position.set(-4, 3, -3);
      this.lightsGroup.add(this.rimLight);
    }

    setLightingMood(mood) {
      this.currentLighting = mood;
      if (mood === 'cyber') {
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 2.2;
        this.hemiLight.color.setHex(0x38bdf8);
        this.hemiLight.groundColor.setHex(0x0f172a);
        this.rimLight.color.setHex(0x818cf8);
        this.scene.fog.color.setHex(0x0a0f1d);
      } else if (mood === 'twilight') {
        this.keyLight.color.setHex(0xf43f5e);
        this.keyLight.intensity = 1.8;
        this.hemiLight.color.setHex(0x8b5cf6);
        this.hemiLight.groundColor.setHex(0x18181b);
        this.rimLight.color.setHex(0x06b6d4);
        this.scene.fog.color.setHex(0x130d24);
      } else if (mood === 'solar') {
        this.keyLight.color.setHex(0xfbbf24);
        this.keyLight.intensity = 2.5;
        this.hemiLight.color.setHex(0x60a5fa);
        this.hemiLight.groundColor.setHex(0x1c1917);
        this.rimLight.color.setHex(0xf59e0b);
        this.scene.fog.color.setHex(0x17120a);
      }
    }

    setupGround() {
      // Procedural soft radial contact shadow disc (never floats)
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 256;
      shadowCanvas.height = 256;
      const sCtx = shadowCanvas.getContext('2d');
      const grad = sCtx.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
      grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.4)');
      grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.1)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 256, 256);

      const shadowTex = new THREE.CanvasTexture(shadowCanvas);
      const shadowGeo = new THREE.PlaneGeometry(3.6, 3.6);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.y = -0.01;
      this.scene.add(shadowMesh);

      // Subtle cyber holographic grid pedestal
      const gridGeo = new THREE.RingGeometry(0.1, 1.8, 36);
      const gridMat = new THREE.MeshBasicMaterial({
        color: 0x00d2ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide
      });
      const gridRing = new THREE.Mesh(gridGeo, gridMat);
      gridRing.rotation.x = -Math.PI / 2;
      gridRing.position.y = 0.002;
      this.scene.add(gridRing);
    }

    // ==========================================
    // Composite 3–12 Part Procedural Models
    // ==========================================

    buildAllSubjectModels() {
      this.models.java = this.createJavaModel();
      this.models.python = this.createPythonModel();
      this.models.dbms = this.createDbmsModel();
      this.models.adsa = this.createAdsaModel();
      this.models.all = this.createHubModel();

      Object.values(this.models).forEach(model => {
        model.group.visible = false;
        this.stageGroup.add(model.group);
      });
    }

    /**
     * 1. ☕ JAVA MODEL (8 distinct parts)
     * Ceramic Mug, Handle, Coffee Brew, Saucer Base, Duke Hologram, Steam Toruses, Base Ring
     */
    createJavaModel() {
      const group = new THREE.Group();
      const parts = [];

      // Part 1: Ceramic Mug Body (LatheGeometry)
      const mugPoints = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const r = 0.5 + Math.sin(t * Math.PI * 0.7) * 0.12;
        const y = t * 1.1;
        mugPoints.push(new THREE.Vector2(r, y));
      }
      const mugGeo = new THREE.LatheGeometry(mugPoints, 32);
      const ceramicMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.18,
        metalness: 0.08
      });
      const mugMesh = new THREE.Mesh(mugGeo, ceramicMat);
      mugMesh.castShadow = true;
      group.add(mugMesh);
      parts.push({ mesh: mugMesh, dir: new THREE.Vector3(0, 0, 0), origPos: mugMesh.position.clone() });

      // Part 2: Ergonomic Curved Handle (TubeGeometry)
      const handleCurve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(0.55, 0.9, 0),
        new THREE.Vector3(1.05, 0.8, 0),
        new THREE.Vector3(1.05, 0.3, 0),
        new THREE.Vector3(0.5, 0.2, 0)
      );
      const handleGeo = new THREE.TubeGeometry(handleCurve, 24, 0.075, 12, false);
      const handleMesh = new THREE.Mesh(handleGeo, ceramicMat);
      handleMesh.castShadow = true;
      group.add(handleMesh);
      parts.push({ mesh: handleMesh, dir: new THREE.Vector3(0.6, 0, 0), origPos: handleMesh.position.clone() });

      // Part 3: Rich Dark Coffee Surface
      const coffeeGeo = new THREE.CylinderGeometry(0.53, 0.53, 0.05, 32);
      const coffeeMat = new THREE.MeshStandardMaterial({
        color: 0x2b1810,
        roughness: 0.05,
        metalness: 0.2
      });
      const coffeeMesh = new THREE.Mesh(coffeeGeo, coffeeMat);
      coffeeMesh.position.y = 0.98;
      group.add(coffeeMesh);
      parts.push({ mesh: coffeeMesh, dir: new THREE.Vector3(0, 0.3, 0), origPos: coffeeMesh.position.clone() });

      // Part 4: Saucer Base Plate (LatheGeometry)
      const saucerPoints = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.9, 0.02),
        new THREE.Vector2(1.15, 0.12),
        new THREE.Vector2(1.1, 0.14),
        new THREE.Vector2(0.85, 0.04),
        new THREE.Vector2(0, 0.02)
      ];
      const saucerGeo = new THREE.LatheGeometry(saucerPoints, 32);
      const saucerMesh = new THREE.Mesh(saucerGeo, ceramicMat);
      saucerMesh.castShadow = true;
      group.add(saucerMesh);
      parts.push({ mesh: saucerMesh, dir: new THREE.Vector3(0, -0.4, 0), origPos: saucerMesh.position.clone() });

      // Part 5: Holographic Bytecode Diamond (Duke crystal)
      const holoGeo = new THREE.OctahedronGeometry(0.24, 0);
      const holoMat = new THREE.MeshStandardMaterial({
        color: 0x00d2ff,
        emissive: 0x0088cc,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.9
      });
      const holoMesh = new THREE.Mesh(holoGeo, holoMat);
      holoMesh.position.set(0, 1.55, 0);
      group.add(holoMesh);
      parts.push({ mesh: holoMesh, dir: new THREE.Vector3(0, 0.8, 0), origPos: holoMesh.position.clone() });

      // Part 6 & 7: Rising Vapor Rings
      const steamMat = new THREE.MeshBasicMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.45,
        wireframe: true
      });
      const steam1 = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24), steamMat);
      steam1.position.set(0, 1.25, 0);
      steam1.rotation.x = Math.PI / 2;
      group.add(steam1);
      parts.push({ mesh: steam1, dir: new THREE.Vector3(0, 0.4, 0), origPos: steam1.position.clone() });

      const steam2 = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 24), steamMat);
      steam2.position.set(0, 1.45, 0);
      steam2.rotation.x = Math.PI / 2 + 0.2;
      group.add(steam2);
      parts.push({ mesh: steam2, dir: new THREE.Vector3(0, 0.6, 0), origPos: steam2.position.clone() });

      // Part 8: Gold Accent Trim Ring
      const trimGeo = new THREE.TorusGeometry(0.59, 0.02, 12, 32);
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.95,
        roughness: 0.15
      });
      const trimMesh = new THREE.Mesh(trimGeo, goldMat);
      trimMesh.position.y = 1.07;
      trimMesh.rotation.x = Math.PI / 2;
      group.add(trimMesh);
      parts.push({ mesh: trimMesh, dir: new THREE.Vector3(0, 0.2, 0), origPos: trimMesh.position.clone() });

      return {
        group,
        parts,
        tick: (time) => {
          holoMesh.rotation.y = time * 1.5;
          holoMesh.position.y = 1.55 + Math.sin(time * 3) * 0.08;
          steam1.rotation.z = time * 0.8;
          steam2.rotation.z = -time * 0.6;
        }
      };
    }

    /**
     * 2. 🐍 PYTHON MODEL (8 distinct parts)
     * Cyber Snake Body Toruses, Neck Curve, Polygonal Sensor Head, Glowing Emerald Eyes, Quantum Core, Pedestal
     */
    createPythonModel() {
      const group = new THREE.Group();
      const parts = [];

      // Part 1: Coiled Cyber Spine Lower Ring (TorusGeometry)
      const spineGeo1 = new THREE.TorusGeometry(0.65, 0.13, 16, 36);
      const cyberMetalMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.88,
        roughness: 0.22
      });
      const spineMesh1 = new THREE.Mesh(spineGeo1, cyberMetalMat);
      spineMesh1.rotation.x = Math.PI / 2;
      spineMesh1.position.y = 0.15;
      spineMesh1.castShadow = true;
      group.add(spineMesh1);
      parts.push({ mesh: spineMesh1, dir: new THREE.Vector3(0, -0.3, 0), origPos: spineMesh1.position.clone() });

      // Part 2: Middle Coiled Arch (Torus arc)
      const spineGeo2 = new THREE.TorusGeometry(0.5, 0.11, 16, 32, Math.PI * 1.4);
      const brassMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        metalness: 0.7,
        roughness: 0.25
      });
      const spineMesh2 = new THREE.Mesh(spineGeo2, brassMat);
      spineMesh2.rotation.set(Math.PI / 2.5, 0.3, 0);
      spineMesh2.position.set(0, 0.45, 0);
      group.add(spineMesh2);
      parts.push({ mesh: spineMesh2, dir: new THREE.Vector3(0.2, 0.1, 0), origPos: spineMesh2.position.clone() });

      // Part 3: Python Head Module (Sleek aerodynamic beveled geometry)
      const headGeo = new THREE.ConeGeometry(0.28, 0.65, 5);
      const headMesh = new THREE.Mesh(headGeo, cyberMetalMat);
      headMesh.position.set(0.35, 1.05, 0.25);
      headMesh.rotation.set(Math.PI / 2, 0, -0.6);
      headMesh.castShadow = true;
      group.add(headMesh);
      parts.push({ mesh: headMesh, dir: new THREE.Vector3(0.5, 0.4, 0.3), origPos: headMesh.position.clone() });

      // Part 4 & 5: Cyber Sensor Eyes (Glowing emerald spheres)
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
      const eyeGeo = new THREE.SphereGeometry(0.045, 12, 12);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(0.48, 1.08, 0.36);
      group.add(leftEye);
      parts.push({ mesh: leftEye, dir: new THREE.Vector3(0.6, 0.5, 0.4), origPos: leftEye.position.clone() });

      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.42, 1.08, 0.14);
      group.add(rightEye);
      parts.push({ mesh: rightEye, dir: new THREE.Vector3(0.5, 0.5, 0.1), origPos: rightEye.position.clone() });

      // Part 6: Floating Python Quantum Core Crystal
      const coreGeo = new THREE.IcosahedronGeometry(0.26, 0);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.9,
        roughness: 0.1,
        metalness: 0.6
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(-0.05, 0.85, -0.05);
      group.add(coreMesh);
      parts.push({ mesh: coreMesh, dir: new THREE.Vector3(-0.3, 0.5, -0.3), origPos: coreMesh.position.clone() });

      // Part 7: Hexagonal Cyber Circuit Base
      const hexGeo = new THREE.CylinderGeometry(0.9, 0.95, 0.08, 6);
      const hexMesh = new THREE.Mesh(hexGeo, cyberMetalMat);
      hexMesh.position.y = 0.04;
      hexMesh.castShadow = true;
      group.add(hexMesh);
      parts.push({ mesh: hexMesh, dir: new THREE.Vector3(0, -0.4, 0), origPos: hexMesh.position.clone() });

      // Part 8: Energy Circuit Orbiting Ring
      const energyRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.015, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0x6ee7b7, wireframe: true })
      );
      energyRing.position.set(-0.05, 0.85, -0.05);
      energyRing.rotation.x = Math.PI / 3;
      group.add(energyRing);
      parts.push({ mesh: energyRing, dir: new THREE.Vector3(0, 0.6, 0), origPos: energyRing.position.clone() });

      return {
        group,
        parts,
        tick: (time) => {
          coreMesh.rotation.x = time * 0.9;
          coreMesh.rotation.y = time * 1.2;
          coreMesh.position.y = 0.85 + Math.sin(time * 2.5) * 0.06;
          energyRing.rotation.z = time * 1.4;
          energyRing.rotation.y = time * 0.8;
        }
      };
    }

    /**
     * 3. 🗄️ DBMS LAB MODEL (9 distinct parts)
     * Server Rack Column, 3 Stacked Magnetic Platters, Actuator Arm, Spindle Axis,
     * Fiber Optic Data Conduits, LED Diagnostic Panel, Pedestal
     */
    createDbmsModel() {
      const group = new THREE.Group();
      const parts = [];

      // Part 1: Hexagonal Server Chassis Column
      const chassisGeo = new THREE.CylinderGeometry(0.85, 0.85, 1.4, 6);
      const darkSteelMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.92,
        roughness: 0.2
      });
      const chassisMesh = new THREE.Mesh(chassisGeo, darkSteelMat);
      chassisMesh.position.y = 0.7;
      chassisMesh.castShadow = true;
      group.add(chassisMesh);
      parts.push({ mesh: chassisMesh, dir: new THREE.Vector3(0, 0, 0), origPos: chassisMesh.position.clone() });

      // Materials for platters
      const platterMat1 = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.98,
        roughness: 0.06
      });
      const platterMat2 = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.95,
        roughness: 0.1
      });
      const platterMat3 = new THREE.MeshStandardMaterial({
        color: 0x0369a1,
        metalness: 0.92,
        roughness: 0.14
      });

      // Part 2: Top Magnetic Platter
      const platterGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.07, 36);
      const platter1 = new THREE.Mesh(platterGeo, platterMat1);
      platter1.position.y = 1.25;
      group.add(platter1);
      parts.push({ mesh: platter1, dir: new THREE.Vector3(0, 0.5, 0), origPos: platter1.position.clone() });

      // Part 3: Middle Database Storage Platter
      const platter2 = new THREE.Mesh(platterGeo, platterMat2);
      platter2.position.y = 0.95;
      group.add(platter2);
      parts.push({ mesh: platter2, dir: new THREE.Vector3(0, 0.25, 0), origPos: platter2.position.clone() });

      // Part 4: Bottom Cache Platter
      const platter3 = new THREE.Mesh(platterGeo, platterMat3);
      platter3.position.y = 0.65;
      group.add(platter3);
      parts.push({ mesh: platter3, dir: new THREE.Vector3(0, 0, 0), origPos: platter3.position.clone() });

      // Part 5: High-Speed Actuator Arm (Precision read head)
      const armGeo = new THREE.BoxGeometry(0.65, 0.04, 0.12);
      const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.08 });
      const armMesh = new THREE.Mesh(armGeo, chromeMat);
      armMesh.position.set(0.35, 1.32, 0.25);
      armMesh.rotation.y = -0.4;
      group.add(armMesh);
      parts.push({ mesh: armMesh, dir: new THREE.Vector3(0.5, 0.6, 0.3), origPos: armMesh.position.clone() });

      // Part 6: Vertical Magnetic Spindle Hub
      const spindleGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 16);
      const goldAccentMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.15 });
      const spindleMesh = new THREE.Mesh(spindleGeo, goldAccentMat);
      spindleMesh.position.y = 0.95;
      group.add(spindleMesh);
      parts.push({ mesh: spindleMesh, dir: new THREE.Vector3(0, 0.8, 0), origPos: spindleMesh.position.clone() });

      // Part 7: Fiber Optic Data Conduit (Curved bus cable)
      const conduitCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.75, 0.4, 0.3),
        new THREE.Vector3(-0.95, 0.8, 0.45),
        new THREE.Vector3(-0.8, 1.25, 0.2),
        new THREE.Vector3(-0.5, 1.4, 0)
      ]);
      const conduitGeo = new THREE.TubeGeometry(conduitCurve, 20, 0.035, 8, false);
      const cyanGlowMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
      const conduitMesh = new THREE.Mesh(conduitGeo, cyanGlowMat);
      group.add(conduitMesh);
      parts.push({ mesh: conduitMesh, dir: new THREE.Vector3(-0.4, 0.3, 0.3), origPos: conduitMesh.position.clone() });

      // Part 8: Diagnostic LED Array
      const ledRow = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.04, 0.02),
          new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00ffcc : 0x38bdf8 })
        );
        led.position.set(-0.2 + i * 0.1, 0, 0);
        ledRow.add(led);
      }
      ledRow.position.set(0, 0.35, 0.86);
      group.add(ledRow);
      parts.push({ mesh: ledRow, dir: new THREE.Vector3(0, 0, 0.4), origPos: ledRow.position.clone() });

      // Part 9: Heavy Server Pedestal Base
      const baseGeo = new THREE.CylinderGeometry(1.05, 1.1, 0.12, 6);
      const baseMesh = new THREE.Mesh(baseGeo, darkSteelMat);
      baseMesh.position.y = 0.06;
      baseMesh.castShadow = true;
      group.add(baseMesh);
      parts.push({ mesh: baseMesh, dir: new THREE.Vector3(0, -0.4, 0), origPos: baseMesh.position.clone() });

      return {
        group,
        parts,
        tick: (time) => {
          platter1.rotation.y = time * 8;
          platter2.rotation.y = -time * 7;
          platter3.rotation.y = time * 6.5;
          armMesh.rotation.y = -0.4 + Math.sin(time * 4) * 0.25;
        }
      };
    }

    /**
     * 4. 🌳 ADSA / DSA MODEL (10 distinct parts)
     * Balanced AVL Tree Root Node, Left/Right Branches & Children, Balance Ring, Leaf Nodes, Ground Pad
     */
    createAdsaModel() {
      const group = new THREE.Group();
      const parts = [];

      const nodeMatRoot = new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        emissive: 0x7c3aed,
        emissiveIntensity: 0.8,
        metalness: 0.3,
        roughness: 0.15
      });
      const nodeMatLeft = new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x0891b2,
        emissiveIntensity: 0.8,
        metalness: 0.3,
        roughness: 0.15
      });
      const nodeMatRight = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.8,
        metalness: 0.3,
        roughness: 0.15
      });
      const branchMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        roughness: 0.25
      });

      // Part 1: Algorithmic Trunk Base
      const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 0.8, 16);
      const trunkMesh = new THREE.Mesh(trunkGeo, branchMat);
      trunkMesh.position.y = 0.4;
      trunkMesh.castShadow = true;
      group.add(trunkMesh);
      parts.push({ mesh: trunkMesh, dir: new THREE.Vector3(0, -0.2, 0), origPos: trunkMesh.position.clone() });

      // Part 2: Root AVL Node Sphere
      const rootSphere = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), nodeMatRoot);
      rootSphere.position.set(0, 1.25, 0);
      group.add(rootSphere);
      parts.push({ mesh: rootSphere, dir: new THREE.Vector3(0, 0.5, 0), origPos: rootSphere.position.clone() });

      // Part 3: Left Branch Tube
      const branchLGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8);
      const branchL = new THREE.Mesh(branchLGeo, branchMat);
      branchL.position.set(-0.35, 0.95, 0);
      branchL.rotation.z = Math.PI / 4;
      group.add(branchL);
      parts.push({ mesh: branchL, dir: new THREE.Vector3(-0.3, 0.1, 0), origPos: branchL.position.clone() });

      // Part 4: Left Child Node Sphere
      const leftChild = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), nodeMatLeft);
      leftChild.position.set(-0.65, 0.7, 0);
      group.add(leftChild);
      parts.push({ mesh: leftChild, dir: new THREE.Vector3(-0.6, 0.1, 0), origPos: leftChild.position.clone() });

      // Part 5: Right Branch Tube
      const branchR = new THREE.Mesh(branchLGeo, branchMat);
      branchR.position.set(0.35, 0.95, 0);
      branchR.rotation.z = -Math.PI / 4;
      group.add(branchR);
      parts.push({ mesh: branchR, dir: new THREE.Vector3(0.3, 0.1, 0), origPos: branchR.position.clone() });

      // Part 6: Right Child Node Sphere
      const rightChild = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), nodeMatRight);
      rightChild.position.set(0.65, 0.7, 0);
      group.add(rightChild);
      parts.push({ mesh: rightChild, dir: new THREE.Vector3(0.6, 0.1, 0), origPos: rightChild.position.clone() });

      // Part 7: Balance Factor Orbit Ring
      const balRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.015, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xc084fc, wireframe: true })
      );
      balRing.position.set(0, 1.25, 0);
      balRing.rotation.x = Math.PI / 2.5;
      group.add(balRing);
      parts.push({ mesh: balRing, dir: new THREE.Vector3(0, 0.8, 0), origPos: balRing.position.clone() });

      // Part 8 & 9: Leaf Sub-Nodes
      const leafGeo = new THREE.SphereGeometry(0.11, 16, 16);
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.6 });
      const leaf1 = new THREE.Mesh(leafGeo, leafMat);
      leaf1.position.set(-0.9, 0.35, 0.15);
      group.add(leaf1);
      parts.push({ mesh: leaf1, dir: new THREE.Vector3(-0.9, -0.1, 0.2), origPos: leaf1.position.clone() });

      const leaf2 = new THREE.Mesh(leafGeo, leafMat);
      leaf2.position.set(0.9, 0.35, -0.15);
      group.add(leaf2);
      parts.push({ mesh: leaf2, dir: new THREE.Vector3(0.9, -0.1, -0.2), origPos: leaf2.position.clone() });

      // Part 10: Circular Algorithmic Base Pad
      const padMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.05, 0.08, 32),
        branchMat
      );
      padMesh.position.y = 0.04;
      padMesh.castShadow = true;
      group.add(padMesh);
      parts.push({ mesh: padMesh, dir: new THREE.Vector3(0, -0.4, 0), origPos: padMesh.position.clone() });

      return {
        group,
        parts,
        tick: (time) => {
          rootSphere.position.y = 1.25 + Math.sin(time * 2) * 0.04;
          balRing.position.y = rootSphere.position.y;
          balRing.rotation.z = time * 1.5;
          leftChild.position.y = 0.7 + Math.sin(time * 2 + 1) * 0.03;
          rightChild.position.y = 0.7 + Math.sin(time * 2 + 2) * 0.03;
        }
      };
    }

    /**
     * 5. 🌐 MASTER ZIPSHARE HUB MODEL (9 distinct parts)
     * Central Quantum Prism, 4 Orbiting Subject Energy Cores, Dual Gyro Rings, Platform
     */
    createHubModel() {
      const group = new THREE.Group();
      const parts = [];

      // Part 1: Central Quantum Prism Core
      const coreGeo = new THREE.OctahedronGeometry(0.5, 1);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x00d2ff,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85,
        metalness: 0.9,
        roughness: 0.12
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.y = 1.1;
      coreMesh.castShadow = true;
      group.add(coreMesh);
      parts.push({ mesh: coreMesh, dir: new THREE.Vector3(0, 0.4, 0), origPos: coreMesh.position.clone() });

      // Outer & Inner Gyroscopic Gimbal Rings
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.95, roughness: 0.1 });
      const gyroRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.025, 12, 48), ringMat);
      gyroRing1.position.y = 1.1;
      group.add(gyroRing1);
      parts.push({ mesh: gyroRing1, dir: new THREE.Vector3(0, 0.2, 0), origPos: gyroRing1.position.clone() });

      const gyroRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.025, 12, 48), ringMat);
      gyroRing2.position.y = 1.1;
      gyroRing2.rotation.x = Math.PI / 2;
      group.add(gyroRing2);
      parts.push({ mesh: gyroRing2, dir: new THREE.Vector3(0, -0.2, 0), origPos: gyroRing2.position.clone() });

      // 4 Orbiting Subject Satellites (Java, Python, DBMS, ADSA colors)
      const satColors = [0xf59e0b, 0x10b981, 0x00d2ff, 0x8b5cf6];
      const satellites = [];
      for (let i = 0; i < 4; i++) {
        const satMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 16, 16),
          new THREE.MeshStandardMaterial({
            color: satColors[i],
            emissive: satColors[i],
            emissiveIntensity: 0.75,
            metalness: 0.5,
            roughness: 0.2
          })
        );
        satMesh.position.set(0, 1.1, 0);
        group.add(satMesh);
        satellites.push(satMesh);
        parts.push({ mesh: satMesh, dir: new THREE.Vector3(Math.cos(i * Math.PI / 2), 0, Math.sin(i * Math.PI / 2)), origPos: satMesh.position.clone() });
      }

      // Base Cyber Platform
      const hubBaseGeo = new THREE.CylinderGeometry(1.2, 1.25, 0.14, 32);
      const hubBaseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
      const hubBase = new THREE.Mesh(hubBaseGeo, hubBaseMat);
      hubBase.position.y = 0.07;
      hubBase.castShadow = true;
      group.add(hubBase);
      parts.push({ mesh: hubBase, dir: new THREE.Vector3(0, -0.4, 0), origPos: hubBase.position.clone() });

      return {
        group,
        parts,
        tick: (time) => {
          coreMesh.rotation.y = time * 1.2;
          coreMesh.rotation.x = time * 0.7;
          gyroRing1.rotation.z = time * 1.1;
          gyroRing1.rotation.y = time * 0.8;
          gyroRing2.rotation.x = time * 0.9;
          gyroRing2.rotation.y = -time * 1.3;

          satellites.forEach((sat, idx) => {
            const angle = time * 1.4 + (idx * Math.PI / 2);
            sat.position.set(Math.cos(angle) * 1.35, 1.1 + Math.sin(time * 3 + idx) * 0.15, Math.sin(angle) * 1.35);
          });
        }
      };
    }

    // ==========================================
    // Subject Switching & Exploded View System
    // ==========================================

    switchSubject(subjectKey) {
      const key = (subjectKey || 'all').toLowerCase();
      const target = this.models[key] || this.models.all;
      this.activeSubject = key;

      Object.entries(this.models).forEach(([k, model]) => {
        model.group.visible = (model === target);
      });

      // Update badge/info in stage DOM
      const titleEl = document.getElementById('stageTitle');
      const descEl = document.getElementById('stageDesc');
      const iconEl = document.getElementById('stageIcon');

      const infoMap = {
        all: { icon: '🌐', title: 'ZipShare Cyber Hub', desc: 'Interactive 3D master computer system with all 4 university lab modules.' },
        java: { icon: '☕', title: 'Java Virtual Machine 3D', desc: 'Object-Oriented Programming Lab (35 Experiments) procedural 3D model.' },
        python: { icon: '🐍', title: 'Python Cyber Core 3D', desc: 'Skill Enhancement Lab (40 Experiments) cybernetic serpentine quantum model.' },
        dbms: { icon: '🗄️', title: 'DBMS Relational Server 3D', desc: 'Database Management Systems Lab B23CS2104 (54 Experiments) 3-tier storage model.' },
        adsa: { icon: '🌳', title: 'ADSA AVL Algorithm 3D', desc: 'Advanced Data Structures & Algorithms Lab (16 Experiments) binary balance model.' },
        c: { icon: '💻', title: 'C Systems Core 3D', desc: 'Low-level systems programming and pointers memory station.' }
      };

      const meta = infoMap[key] || infoMap.all;
      if (titleEl) titleEl.textContent = meta.title;
      if (descEl) descEl.textContent = meta.desc;
      if (iconEl) iconEl.textContent = meta.icon;

      // Sync active button in 3D dock
      document.querySelectorAll('.three-dock-pill').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-subject') === key);
      });

      this.applyExplodedView(this.explodedFactor);
    }

    applyExplodedView(factor) {
      this.explodedFactor = Math.max(0, Math.min(1, factor));
      const model = this.models[this.activeSubject];
      if (!model || !model.parts) return;

      model.parts.forEach(part => {
        if (!part.mesh || !part.origPos || !part.dir) return;
        part.mesh.position.copy(part.origPos).addScaledVector(part.dir, this.explodedFactor * 1.2);
      });
    }

    // ==========================================
    // Interaction & Animation Loop
    // ==========================================

    setupInteraction() {
      const el = this.mount;

      const onPointerDown = (e) => {
        this.isDragging = true;
        this.prevPointerX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        this.prevPointerY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
      };

      const onPointerMove = (e) => {
        if (!this.isDragging) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        const dx = clientX - this.prevPointerX;
        const dy = clientY - this.prevPointerY;
        this.prevPointerX = clientX;
        this.prevPointerY = clientY;

        this.targetRotY += dx * 0.009;
        this.targetRotX += dy * 0.007;
        // Clamp vertical tilt to avoid flipping
        this.targetRotX = Math.max(-0.4, Math.min(0.85, this.targetRotX));
      };

      const onPointerUp = () => {
        this.isDragging = false;
      };

      el.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mousemove', onPointerMove);
      window.addEventListener('mouseup', onPointerUp);

      el.addEventListener('touchstart', onPointerDown, { passive: true });
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerUp);

      // Mouse wheel zoom
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.camera.position.z = Math.max(2.8, Math.min(8.0, this.camera.position.z + e.deltaY * 0.004));
      }, { passive: false });
    }

    setupResize() {
      const onResize = () => {
        if (!this.mount || !this.renderer || !this.camera) return;
        const width = this.mount.clientWidth || 320;
        const height = this.mount.clientHeight || 240;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      };

      window.addEventListener('resize', onResize);
    }

    animate() {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const time = this.clock.getElapsedTime();

      // Damped camera rotation (exponential glide)
      if (this.autoRotate && !this.isDragging) {
        this.targetRotY += dt * this.autoRotateSpeed;
      }
      const damping = 1 - Math.exp(-10 * dt);
      this.currentRotY += (this.targetRotY - this.currentRotY) * damping;
      this.currentRotX += (this.targetRotX - this.currentRotX) * damping;

      if (this.stageGroup) {
        this.stageGroup.rotation.y = this.currentRotY;
        this.stageGroup.rotation.x = this.currentRotX;
      }

      // Tick active model procedural animations
      const activeModel = this.models[this.activeSubject];
      if (activeModel && activeModel.tick) {
        activeModel.tick(time);
      }

      this.renderer.render(this.scene, this.camera);

      // Pace software WebGL smoothly
      if (isSoftwareGl) {
        window.setTimeout(() => {
          this.frameId = requestAnimationFrame(this.animate);
        }, 16);
      } else {
        this.frameId = requestAnimationFrame(this.animate);
      }
    }
  }

  // Expose global instance
  window.ZipShare3D = {
    world: null,
    initStage: function () {
      if (!this.world && document.getElementById('threeStageMount')) {
        this.world = new ZipShare3DWorld('threeStageMount');
      }
      return this.world;
    },
    switchSubject: function (sub) {
      if (this.world) this.world.switchSubject(sub);
    }
  };
})();
