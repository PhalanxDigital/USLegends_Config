/**
 * CarViewer: everything Sketchfab used to do, in plain Three.js.
 *
 *  - loads one GLB per car (every option lives inside it, like the Sketchfab model)
 *  - shows/hides option parts by NAME (not by fragile numeric IDs)
 *  - recolors the paint materials by name
 *  - studio lighting, soft floor shadow, transparent background
 *  - 360° spin with locked tilt and limited zoom
 *  - reports hotspot screen positions so the UI can draw the numbered dots
 *
 * It knows nothing about the page layout; the Svelte components drive it.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const DEG = Math.PI / 180;

/** "RIMS( BEADLOCK)_773" -> "rimsbeadlock". Used for every name lookup. */
export const normalizeName = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/_\d+$/, '')
    .replace(/[^a-z0-9]/g, '');

export class CarViewer {
  /**
   * @param {HTMLElement} container element the canvas fills
   * @param {object} callbacks
   *   onLoading({ loading, progress })  progress is 0..1
   *   onHotspots([{ id, index, x, y, behind }])  pixel positions inside the container
   *   onError(error)
   */
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks;
    this.cache = new Map();
    this.current = null;
    this.car = null;
    this.selections = {};
    this.anchors = [];
    this.anchorsDirty = true;
    this.needsRender = true;
    this.loadToken = 0;
    this.lastHotspotKey = '';

    // preserveDrawingBuffer keeps the last frame on screen (we only render when something changes)
    // and lets snapshot() grab the canvas at any time.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-label', '3D car viewer. Drag to rotate, scroll or pinch to zoom.');
    renderer.domElement.setAttribute('role', 'img');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.9;
    pmrem.dispose();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0005;
    scene.add(key, key.target);
    this.key = key;
    // soft fill from behind so the far side of the car doesn't go flat gray
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    scene.add(fill, fill.target);
    this.fill = fill;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.35));

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.45 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.floor = floor;

    const controls = new OrbitControls(this.camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.7;
    controls.addEventListener('change', () => this.invalidate());
    this.controls = controls;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
  }

  invalidate() {
    this.needsRender = true;
  }

  /** Load (or switch to) a car. Resolves false if another load replaced it. */
  async load(car) {
    const token = ++this.loadToken;
    let entry = this.cache.get(car.model);
    if (!entry) {
      this.cb.onLoading?.({ loading: true, progress: 0 });
      try {
        const gltf = await this.loadGLTF(car.model, (p) => {
          if (token === this.loadToken) this.cb.onLoading?.({ loading: true, progress: p });
        });
        entry = this.prepare(gltf.scene, car);
        this.cache.set(car.model, entry);
      } catch (err) {
        if (token === this.loadToken) {
          this.cb.onLoading?.({ loading: false, progress: 0 });
          this.cb.onError?.(err);
        }
        return false;
      }
    }
    if (token !== this.loadToken) return false;

    if (this.current) this.scene.remove(this.current.root);
    this.current = entry;
    this.car = car;
    this.scene.add(entry.root);
    this.anchors = [];
    this.lastHotspotKey = '';
    this.checkConfig(car);
    this.frame(car);
    this.cb.onLoading?.({ loading: false, progress: 1 });
    if (new URLSearchParams(window.location.search).has('debug')) console.info(`[viewer] ${car.id}`, this.describe());
    this.invalidate();
    return true;
  }

  loadGLTF(url, onProgress) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    if (url.startsWith('data:')) {
      // Single-file preview build: models are embedded, so decode them directly.
      const bin = atob(url.slice(url.indexOf(',') + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return loader.parseAsync(bytes.buffer, '');
    }
    return new Promise((resolve, reject) => {
      loader.load(url, resolve, (e) => e.total && onProgress(e.loaded / e.total), reject);
    });
  }

  /** Index parts and materials by normalized name; set up shadows; apply model rotation. */
  prepare(sceneRoot, car) {
    const root = new THREE.Group();
    const [rx = 0, ry = 0, rz = 0] = car.modelRotationDeg ?? [];
    sceneRoot.rotation.set(rx * DEG, ry * DEG, rz * DEG);
    root.add(sceneRoot);

    const index = new Map();
    const materials = new Map();
    const add = (map, name, value) => {
      const key = normalizeName(name);
      if (!key) return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(value);
    };
    root.traverse((obj) => {
      add(index, obj.name, obj);
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
        for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) add(materials, m.name, m);
      }
    });
    root.updateMatrixWorld(true);
    return { root, index, materials, box: new THREE.Box3().setFromObject(root) };
  }

  find(name) {
    return [...(this.current?.index.get(normalizeName(name)) ?? [])];
  }

  /** Warn (in the browser console) about config names the model doesn't contain. */
  checkConfig(car) {
    const missing = [];
    for (const cat of car.categories) for (const opt of cat.options) if (!this.find(opt.node).length) missing.push(`part "${opt.node}"`);
    for (const m of car.paintMaterials) if (!this.current.materials.has(normalizeName(m))) missing.push(`paint material "${m}"`);
    if (missing.length) {
      console.warn(`[viewer] ${car.id}: the 3D model has no ${missing.join(', ')}. Run with ?debug to list the names it does have.`);
    }
  }

  /** Point the camera at the car and set the spin/zoom limits from the config. */
  frame(car) {
    const cam = car.camera;
    const box = this.current.box;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = size.length() / 2;
    this.radius = r;
    this.center = center;

    this.camera.fov = cam.fov;
    this.camera.near = r / 100;
    this.camera.far = r * 100;
    // distance at which the car's bounding sphere just fits the narrower field of view
    const vHalf = (cam.fov * DEG) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const spin = Math.hypot(size.x, size.z); // widest the car gets as it turns
    const fit = Math.max(size.y / 2 / Math.tan(vHalf), spin / 2 / Math.tan(hHalf)) + spin * 0.25;
    this.fitDistance = fit;

    const polar = (90 - cam.elevationDeg) * DEG;
    const theta = Math.PI / 2 - cam.startAzimuthDeg * DEG;
    const aim = center.clone().add(new THREE.Vector3(0, -size.y * (cam.targetDrop ?? 0), 0));
    const startDistance = this.container.clientWidth < 600 ? cam.mobileDistance ?? cam.distance : cam.distance;
    const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(fit * startDistance, polar, theta)).add(aim);
    this.camera.position.copy(pos);
    // aim a little below center so the car sits above the buttons along the bottom edge
    this.controls.target.copy(center).add(new THREE.Vector3(0, -size.y * (cam.targetDrop ?? 0), 0));
    this.controls.minPolarAngle = polar;
    this.controls.maxPolarAngle = polar;
    this.applyZoomLimits();
    this.camera.updateProjectionMatrix();
    this.controls.update();

    this.floor.position.set(center.x, box.min.y + r * 0.002, center.z);
    this.floor.scale.setScalar(r * 8);
    this.key.position.set(center.x + r * 0.5, center.y + r * 3, center.z + r * 0.8);
    this.key.target.position.copy(center);
    this.fill.position.set(center.x - r * 2, center.y + r, center.z - r * 1.5);
    this.fill.target.position.copy(center);
    const s = this.key.shadow.camera;
    s.left = s.bottom = -r * 1.3;
    s.right = s.top = r * 1.3;
    s.near = r * 0.5;
    s.far = r * 6;
    s.updateProjectionMatrix();
    this.anchorsDirty = true;
  }

  applyZoomLimits() {
    if (!this.car || !this.fitDistance) return;
    const cam = this.car.camera;
    const compact = this.container.clientWidth < 600;
    this.controls.minDistance = this.fitDistance * cam.minDistance;
    this.controls.maxDistance = this.fitDistance * (compact ? cam.mobileMaxDistance : cam.maxDistance);
  }

  /** selections: { categoryId: optionId } */
  applySelections(car, selections) {
    if (!this.current || car !== this.car) return;
    this.selections = { ...selections };
    for (const cat of car.categories) {
      for (const opt of cat.options) {
        for (const obj of this.find(opt.node)) obj.visible = opt.id === selections[cat.id];
      }
    }
    this.anchorsDirty = true;
    this.invalidate();
  }

  setPaint(car, hex) {
    if (!this.current || car !== this.car) return;
    for (const name of car.paintMaterials) {
      for (const m of this.current.materials.get(normalizeName(name)) ?? []) {
        m.color.set(hex);
        // Like the Sketchfab build: drop any base-color texture so the chosen color shows.
        if (m.map && car.paintKeepsTexture !== true) {
          m.map = null;
          m.needsUpdate = true;
        }
      }
    }
    this.invalidate();
  }

  computeAnchors() {
    const car = this.car;
    const box = new THREE.Box3();
    this.current.root.updateMatrixWorld(true);
    this.anchors = car.categories.map((cat, index) => {
      const opt = cat.options.find((o) => o.id === this.selections[cat.id]) ?? cat.options[0];
      box.makeEmpty();
      for (const obj of this.find(cat.anchorNode ?? opt.node)) box.expandByObject(obj);
      if (box.isEmpty()) return null;
      const [ax, ay, az] = cat.anchor ?? [0.5, 0.5, 0.5];
      // config axes: x rear->front, y bottom->top, z right->left
      const point = new THREE.Vector3(
        THREE.MathUtils.lerp(box.min.x, box.max.x, ax),
        THREE.MathUtils.lerp(box.min.y, box.max.y, ay),
        THREE.MathUtils.lerp(box.min.z, box.max.z, az),
      );
      return { id: cat.id, index, point };
    }).filter(Boolean);
    this.anchorsDirty = false;
  }

  emitHotspots() {
    if (!this.cb.onHotspots || !this.current) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    const toCam = new THREE.Vector3().subVectors(this.camera.position, this.center).setY(0).normalize();
    const list = this.anchors.map((a) => {
      v.copy(a.point).project(this.camera);
      const toAnchor = new THREE.Vector3().subVectors(a.point, this.center).setY(0);
      const facing = toAnchor.lengthSq() > 1e-8 ? toAnchor.normalize().dot(toCam) : 1;
      return {
        id: a.id,
        index: a.index,
        x: Math.round(((v.x + 1) / 2) * w),
        y: Math.round(((1 - v.y) / 2) * h),
        behind: facing < -0.2,
      };
    });
    const key = JSON.stringify(list);
    if (key !== this.lastHotspotKey) {
      this.lastHotspotKey = key;
      this.cb.onHotspots(list);
    }
  }

  tick() {
    this.raf = requestAnimationFrame(this.tick);
    if (this.controls.update()) this.needsRender = true;
    if (!this.needsRender || !this.current) return;
    this.needsRender = false;
    if (this.anchorsDirty) this.computeAnchors();
    this.renderer.render(this.scene, this.camera);
    this.emitHotspots();
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyZoomLimits();
    this.lastHotspotKey = '';
    this.invalidate();
  }

  /** JPEG/PNG data URL of the current view (e.g. to attach to a lead later). */
  snapshot(type = 'image/jpeg', quality = 0.9) {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL(type, quality);
  }

  /** Part and material names in the loaded model (shown in the console with ?debug). */
  describe() {
    const parts = [];
    this.current.root.traverse((o) => o.name && !o.isMesh && parts.push(o.name));
    return { parts, materials: [...this.current.materials.keys()] };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
