// Horizon-to-globe hero. Scroll progress 0 = a thin glowing limb at the
// bottom of the screen; 1 = the whole planet in frame.
// Earth uses NASA Blue Marble (day), Black Marble (city lights), cloud,
// terrain and water maps, lit by a single "sun" with filmic tone mapping.
import * as THREE from 'three';

const T = 'assets/textures/';
// Big textures only where the GPU and memory can take them.
const BIG = Math.min(screen.width, screen.height) >= 700 && (navigator.deviceMemory ?? 8) >= 4;

const WORLDS = {
  earth: {
    day: T + (BIG ? 'earth-day-4k.jpg' : 'earth-day.jpg'), night: T + 'earth-night.jpg',
    clouds: T + (BIG ? 'earth-clouds-4k.jpg' : 'earth-clouds.jpg'), bump: T + 'earth-bump.jpg', spec: T + 'earth-spec.jpg',
    bumpScale: 1.4, atmos: [0.32, 0.58, 1.0], glow: 1.0, rim: 0.55,
  },
  moon: { day: T + 'moon.jpg', bump: T + 'moon.jpg', bumpScale: 6, atmos: [0.6, 0.65, 0.75], glow: 0, rim: 0 },
  mars: { day: T + 'mars.jpg', bump: T + 'mars.jpg', bumpScale: 4, atmos: [0.95, 0.6, 0.42], glow: 0.7, rim: 0.3 },
};

const glowVert = `
  varying vec3 vN; varying vec3 vWN;
  void main() {
    vN = normalize(normalMatrix * normal);
    vWN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const glowFrag = `
  uniform vec3 atmos; uniform float strength; uniform vec3 sunDir;
  varying vec3 vN; varying vec3 vWN;
  void main() {
    float i = pow(max(0.0, 0.74 - dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 2.6);
    float lit = 0.18 + 0.82 * smoothstep(-0.35, 0.45, dot(normalize(vWN), normalize(sunDir)));
    gl_FragColor = vec4(atmos * i * strength * lit * 2.2, 1.0);
  }`;

// Point stars: magnitude-weighted sizes, stellar colours, soft photographic falloff.
const starVert = `
  attribute float size; attribute vec3 tint; uniform float pr; varying vec3 vTint; varying float vS;
  void main() {
    vTint = tint; vS = size;
    gl_PointSize = size * pr;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const starFrag = `
  varying vec3 vTint; varying float vS;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    float core = exp(-r2 * 10.0);
    float halo = exp(-r2 * 3.5) * 0.22 * smoothstep(2.0, 4.0, vS);
    float a = core + halo;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint * a, 1.0);
  }`;

function latLonToVec(lat, lon, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function makeStars(pr) {
  const N = BIG ? 12000 : 8000;
  const galN = new THREE.Vector3(0.9, 0.2, -0.38).normalize(); // same plane as the Milky Way texture (sphere UVs mirror z)
  const pos = new Float32Array(N * 3), size = new Float32Array(N), tint = new Float32Array(N * 3);
  const palette = [[0.72, 0.8, 1.0], [0.85, 0.9, 1.0], [1.0, 1.0, 1.0], [1.0, 0.95, 0.86], [1.0, 0.86, 0.7], [1.0, 0.76, 0.6]];
  const weights = [0.08, 0.2, 0.3, 0.22, 0.13, 0.07];
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.randomDirection();
    if (Math.random() < 0.35) { v.addScaledVector(galN, -v.dot(galN) * (0.75 + Math.random() * 0.25)).normalize(); }
    v.multiplyScalar(180);
    pos.set([v.x, v.y, v.z], i * 3);
    const m = Math.pow(Math.random(), 7); // many faint, few bright
    size[i] = 1.4 + m * 6;
    let k = 0, r = Math.random(); while (r > weights[k] && k < weights.length - 1) { r -= weights[k]; k++; }
    const b = 0.38 + m * 1.3 + Math.random() * 0.2;
    tint.set(palette[k].map((c) => c * b), i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  return new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { pr: { value: pr } }, vertexShader: starVert, fragmentShader: starFrag,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
}

export function createHero(canvas, { world = 'earth', home = null, reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  const pr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 600);
  const loader = new THREE.TextureLoader();
  const tex = (url, srgb = true) => new Promise((res) => loader.load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; res(t); }, undefined, () => res(null)));

  // Sky: faint Milky Way plus point stars
  const sky = new THREE.Group();
  scene.add(sky);
  const milky = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false, color: 0x000000 }));
  milky.rotation.z = Math.PI / 2; // keep the texture's stretched poles out of both views
  sky.add(milky);
  tex(T + 'milkyway.jpg').then((t) => { if (t) { milky.material.map = t; milky.material.color.set(0xffffff); milky.material.needsUpdate = true; } });
  const stars = makeStars(pr);
  sky.add(stars);

  // Planet
  const group = new THREE.Group();
  scene.add(group);
  const sunDirView = { value: new THREE.Vector3(0, 0, 1) };
  const rimColor = { value: new THREE.Color(0.32, 0.58, 1.0) };
  const rimStrength = { value: 0.5 };
  const planetMat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: new THREE.Color(0x2a3d5c), shininess: 22, emissive: new THREE.Color(0xffd7a0), emissiveIntensity: 0 });
  planetMat.onBeforeCompile = (shader) => {
    shader.uniforms.sunDirView = sunDirView;
    shader.uniforms.rimColor = rimColor;
    shader.uniforms.rimStrength = rimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 sunDirView; uniform vec3 rimColor; uniform float rimStrength;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float sunDot = dot(normalize(normal), sunDirView);
        totalEmissiveRadiance *= smoothstep(0.08, -0.22, sunDot);`)
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normalize(normal)), 0.0, 1.0), 3.0);
        outgoingLight += rimColor * fres * rimStrength * smoothstep(-0.25, 0.6, sunDot);
        #include <opaque_fragment>`);
  };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 384, 192), planetMat);
  group.add(planet);
  const cloudMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, depthWrite: false, shininess: 2, specular: 0x111111, opacity: 1 });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.007, 256, 128), cloudMat);
  group.add(clouds);
  const sunLight = new THREE.DirectionalLight(0xfff6ec, 3.4);
  scene.add(sunLight, sunLight.target, new THREE.AmbientLight(0x1b2740, 0.25));
  const glowU = { atmos: { value: new THREE.Color() }, strength: { value: 1 }, sunDir: { value: new THREE.Vector3(0, 1, 0) } };
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.035, 384, 192), new THREE.ShaderMaterial({ uniforms: glowU, vertexShader: glowVert, fragmentShader: glowFrag, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  scene.add(glow);

  // Earth hanging in the lunar sky
  const earthInSky = new THREE.Mesh(new THREE.SphereGeometry(1.9, 96, 64), new THREE.MeshPhongMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.9 }));
  const earthSkyClouds = new THREE.Mesh(new THREE.SphereGeometry(1.915, 96, 64), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, depthWrite: false }));
  earthInSky.add(earthSkyClouds);
  scene.add(earthInSky);
  earthInSky.visible = false;

  // Home pin
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
  const pinHalo = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
  planet.add(pin, pinHalo);
  pin.visible = pinHalo.visible = false;

  let current = null, progress = 0, baseRot = 0, raf = 0, disposed = false, lastT = performance.now(), drift = 0;
  const homeLocal = home ? latLonToVec(home.lat, home.lon, 1.002) : null;

  async function setWorld(name) {
    const key = name === 'earth-far' ? 'earth' : name;
    if (current === key) return;
    current = key;
    const w = WORLDS[key] || WORLDS.earth;
    const [day, bump, spec, night, cl] = await Promise.all([tex(w.day), w.bump ? tex(w.bump, false) : null, w.spec ? tex(w.spec, false) : null, w.night ? tex(w.night) : null, w.clouds ? tex(w.clouds, false) : null]);
    if (disposed || current !== key) return;
    planetMat.map = day;
    planetMat.bumpMap = bump; planetMat.bumpScale = w.bumpScale;
    planetMat.specularMap = spec;
    planetMat.specular.set(spec ? 0x3a5478 : 0x0a0a0a);
    planetMat.shininess = spec ? 26 : 4;
    planetMat.emissiveMap = night;
    planetMat.emissiveIntensity = night ? 1.6 : 0;
    planetMat.needsUpdate = true;
    clouds.visible = !!cl;
    if (cl) { cloudMat.alphaMap = cl; cloudMat.needsUpdate = true; }
    rimColor.value.setRGB(...w.atmos);
    rimStrength.value = w.rim;
    glowU.atmos.value.setRGB(...w.atmos);
    glowU.strength.value = w.glow;
    glow.visible = w.glow > 0;
    earthInSky.visible = key === 'moon';
    if (key === 'moon') {
      const [eday, ecl] = await Promise.all([tex(T + 'earth-day.jpg'), tex(T + 'earth-clouds.jpg', false)]);
      earthInSky.material.emissiveMap = eday; earthInSky.material.needsUpdate = true;
      earthSkyClouds.material.alphaMap = ecl; earthSkyClouds.material.needsUpdate = true;
    }
    pin.visible = pinHalo.visible = key === 'earth' && !!homeLocal;
    if (homeLocal) { pin.position.copy(homeLocal); pinHalo.position.copy(homeLocal); }
    // End view: home turned toward the camera (a little to one side), or a pleasant longitude.
    if (key === 'earth' && homeLocal) baseRot = -Math.atan2(homeLocal.x, homeLocal.z) + 0.5;
    else baseRot = key === 'mars' ? 1.2 : 0.4;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const C0 = new THREE.Vector3(0, 0, 1.075);
  const D0 = new THREE.Vector3(), U0 = new THREE.Vector3();
  function setTilt(deg) { const t = (deg * Math.PI) / 180; D0.set(0, Math.cos(t), -Math.sin(t)); U0.set(0, Math.sin(t), Math.cos(t)); }
  setTilt(6);
  const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  const tmp = new THREE.Vector3(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!reduced) drift += dt * 0.01;
    const e = ease(progress);
    const wide = camera.aspect > 1.1;
    // Portrait screens tilt down a little more so the horizon clears the tab bar.
    setTilt(wide ? 6 : 10);
    m4.lookAt(new THREE.Vector3(), D0, U0); q0.setFromRotationMatrix(m4);
    // End framing: globe on the right on wide screens, lower-centre on phones.
    const C1 = new THREE.Vector3(wide ? -1.25 : 0, wide ? -0.05 : -0.6, wide ? 3.7 : 4.2);
    const T1 = new THREE.Vector3(wide ? -1.25 : 0, wide ? -0.05 : -1.0, 0);
    m4.lookAt(C1, T1, Y); q1.setFromRotationMatrix(m4);
    const dist = THREE.MathUtils.lerp(Math.log(C0.length() - 0.999), Math.log(C1.length() - 0.999), e);
    const dir = C0.clone().normalize().lerp(C1.clone().normalize(), e).normalize();
    camera.position.copy(dir.multiplyScalar(Math.exp(dist) + 0.999));
    camera.quaternion.copy(q0).slerp(q1, e);
    camera.updateMatrixWorld();
    // the planet turns as you scroll
    group.rotation.y = baseRot - (1 - e) * 1.1 + drift;
    clouds.rotation.y = drift * 0.5;
    // Sun: just behind the horizon at first (sunrise), then upper-left of the
    // viewer so most of the globe is in daylight, like a photo from deep space.
    const sunStart = current === 'moon' ? new THREE.Vector3(0.75, 0.55, 0.35).normalize() : new THREE.Vector3(0, 0.32, -1).normalize();
    const sunEnd = C1.clone().normalize().applyAxisAngle(Y, -0.75).applyAxisAngle(X, -0.35).normalize();
    const sun = sunStart.clone().lerp(sunEnd, THREE.MathUtils.smoothstep(e, 0.05, 0.7)).normalize();
    sunLight.position.copy(sun).multiplyScalar(20);
    sunDirView.value.copy(sun).transformDirection(camera.matrixWorldInverse);
    glowU.sunDir.value.copy(sun);
    glow.scale.setScalar(THREE.MathUtils.lerp(1.008 / 1.035, 1, THREE.MathUtils.smoothstep(e, 0, 0.6)));
    // Earth in the lunar sky, above the horizon in the opening view
    if (earthInSky.visible) {
      tmp.copy(D0).applyAxisAngle(X, 0.2).applyAxisAngle(Z, -0.3).multiplyScalar(60).add(C0);
      earthInSky.position.copy(tmp);
      earthInSky.rotation.set(Math.PI / 2, 2.2 + drift * 2, 0);
    }
    pinHalo.scale.setScalar(1 + 0.25 * Math.sin(now / 600));
    pin.visible = pinHalo.visible = current === 'earth' && !!homeLocal && e > 0.55;
    sky.rotation.y = drift * 0.15;
    renderer.render(scene, camera);
    if (onFrame) onFrame();
  }

  let onFrame = null;
  function homeScreenPos() {
    if (!pin.visible) return null;
    const p = new THREE.Vector3();
    pin.getWorldPosition(p);
    const toCam = camera.position.clone().sub(p).normalize();
    if (p.clone().normalize().dot(toCam) < 0.15) return null;
    p.project(camera);
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * canvas.clientWidth, y: (-p.y * 0.5 + 0.5) * canvas.clientHeight };
  }

  setWorld(world);
  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  const vis = () => { if (document.hidden) cancelAnimationFrame(raf); else { lastT = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', vis);

  return {
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); },
    setWorld,
    homeScreenPos,
    onFrame(fn) { onFrame = fn; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', vis);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (m) { ['map', 'bumpMap', 'specularMap', 'emissiveMap', 'alphaMap'].forEach((k) => m[k]?.dispose?.()); m.dispose?.(); }
      });
      renderer.dispose();
    },
  };
}
