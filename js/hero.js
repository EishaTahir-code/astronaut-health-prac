// Horizon-to-globe hero. Scroll progress 0 = a thin glowing limb at the
// bottom of the screen; 1 = the whole planet in frame.
import * as THREE from 'three';

const TEX = {
  earth: { day: 'assets/textures/earth-day.jpg', night: 'assets/textures/earth-night.jpg', clouds: 'assets/textures/earth-clouds.jpg', atmos: [0.42, 0.66, 1.0], atmosStrength: 1.0 },
  moon: { day: 'assets/textures/moon.jpg', atmos: [0.6, 0.65, 0.75], atmosStrength: 0.12 },
  mars: { day: 'assets/textures/mars.jpg', atmos: [0.98, 0.6, 0.42], atmosStrength: 0.85 },
};

const planetVert = `
  varying vec2 vUv; varying vec3 vN; varying vec3 vWN;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    vWN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const planetFrag = `
  uniform sampler2D dayMap; uniform sampler2D nightMap; uniform float hasNight;
  uniform vec3 sunDir; uniform vec3 atmos; uniform float atmosStrength;
  varying vec2 vUv; varying vec3 vN; varying vec3 vWN;
  void main() {
    float d = dot(normalize(vWN), normalize(sunDir));
    float dayMix = smoothstep(-0.12, 0.22, d);
    vec3 day = texture2D(dayMap, vUv).rgb * (0.04 + 1.15 * max(d, 0.0));
    vec3 night = texture2D(nightMap, vUv).rgb * hasNight * 1.6 * (1.0 - dayMix);
    vec3 col = day * dayMix + night;
    float fres = pow(1.0 - max(dot(normalize(vN), vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
    col += atmos * fres * atmosStrength * (0.15 + 0.85 * smoothstep(-0.3, 0.5, d));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
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
    float i = pow(max(0.0, 0.78 - dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 3.2);
    float lit = 0.25 + 0.75 * smoothstep(-0.45, 0.35, dot(normalize(vWN), normalize(sunDir)));
    gl_FragColor = vec4(atmos * i * strength * lit * 1.5, 1.0);
  }`;

function latLonToVec(lat, lon, r = 1) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta));
}

// Real sub-solar point for the current UTC time (simple approximation).
function subsolar(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date - start) / 86400000;
  const decl = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const lon = -(hours - 12) * 15;
  return { lat: decl, lon };
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function createHero(canvas, { world = 'earth', home = null, reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 400);
  const loader = new THREE.TextureLoader();
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;

  // Stars
  const starGeo = new THREE.BufferGeometry();
  const N = 2400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(150 + Math.random() * 60);
    pos.set([v.x, v.y, v.z], i * 3);
    const b = 0.45 + Math.random() * 0.55, warm = Math.random() < 0.15;
    col.set(warm ? [b, b * 0.9, b * 0.75] : [b * 0.9, b * 0.95, b], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(stars);

  const group = new THREE.Group();
  scene.add(group);
  const sphere = new THREE.SphereGeometry(1, 384, 192);
  const uniforms = {
    dayMap: { value: black }, nightMap: { value: black }, hasNight: { value: 0 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, atmos: { value: new THREE.Color() }, atmosStrength: { value: 1 },
  };
  const planet = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ uniforms, vertexShader: planetVert, fragmentShader: planetFrag }));
  group.add(planet);
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 256, 128), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  group.add(clouds);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(sunLight, new THREE.AmbientLight(0x223355, 0.15));
  const glowU = { atmos: { value: new THREE.Color() }, strength: { value: 1 }, sunDir: uniforms.sunDir };
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.03, 384, 192), new THREE.ShaderMaterial({ uniforms: glowU, vertexShader: glowVert, fragmentShader: glowFrag, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  scene.add(glow);

  // Earth hanging in the lunar sky
  const earthU = { dayMap: { value: black }, nightMap: { value: black }, hasNight: { value: 0 }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, atmos: { value: new THREE.Color(0.42, 0.66, 1.0) }, atmosStrength: { value: 1.2 } };
  const earthInSky = new THREE.Mesh(new THREE.SphereGeometry(1.9, 64, 48), new THREE.ShaderMaterial({ uniforms: earthU, vertexShader: planetVert, fragmentShader: planetFrag }));
  scene.add(earthInSky);
  earthInSky.visible = false;

  // Home pin
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  const pinHalo = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.35, depthWrite: false }));
  planet.add(pin, pinHalo);
  pin.visible = pinHalo.visible = false;

  let current = null, progress = 0, baseRot = 0, raf = 0, disposed = false, lastT = performance.now(), drift = 0;
  const homeLocal = home ? latLonToVec(home.lat, home.lon, 1.0) : null;

  function setWorld(name) {
    const key = name === 'earth-far' ? 'earth' : name;
    if (current === key) return;
    current = key;
    const t = TEX[key] || TEX.earth;
    loader.load(t.day, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; uniforms.dayMap.value = tx; });
    if (t.night) loader.load(t.night, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; uniforms.nightMap.value = tx; uniforms.hasNight.value = 1; });
    else { uniforms.nightMap.value = black; uniforms.hasNight.value = 0; }
    clouds.visible = !!t.clouds;
    if (t.clouds) loader.load(t.clouds, (tx) => { clouds.material.alphaMap = tx; clouds.material.needsUpdate = true; });
    uniforms.atmos.value.setRGB(...t.atmos);
    uniforms.atmosStrength.value = t.atmosStrength;
    glowU.atmos.value.setRGB(...t.atmos);
    glowU.strength.value = t.atmosStrength;
    glow.visible = t.atmosStrength > 0.2;
    earthInSky.visible = key === 'moon';
    if (key === 'moon') {
      loader.load(TEX.earth.day, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; earthU.dayMap.value = tx; });
      loader.load(TEX.earth.night, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; earthU.nightMap.value = tx; earthU.hasNight.value = 1; });
    }
    pin.visible = pinHalo.visible = key === 'earth' && !!homeLocal;
    if (homeLocal) { pin.position.copy(homeLocal); pinHalo.position.copy(homeLocal); }
    // End view: home (or a pleasant longitude) turned toward the camera.
    if (key === 'earth' && homeLocal) baseRot = -Math.atan2(homeLocal.x, homeLocal.z) + 0.35;
    else baseRot = key === 'mars' ? 1.2 : 0.4;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const C0 = new THREE.Vector3(0, 0, 1.075);
  const tilt = (6 * Math.PI) / 180;
  const D0 = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt));
  const U0 = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  const tmp = new THREE.Vector3(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(), m4 = new THREE.Matrix4();

  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!reduced) drift += dt * 0.012;
    const e = ease(progress);
    const wide = camera.aspect > 1.1;
    const C1 = new THREE.Vector3(wide ? -1.45 : 0, wide ? -0.1 : -0.55, wide ? 4.3 : 4.1);
    const T1 = new THREE.Vector3(wide ? -1.45 : 0, wide ? -0.1 : -0.95, 0);
    // camera orientation: slerp from horizon view to globe view
    m4.lookAt(new THREE.Vector3(), D0, U0); q0.setFromRotationMatrix(m4);
    m4.lookAt(C1, T1, new THREE.Vector3(0, 1, 0)); q1.setFromRotationMatrix(m4);
    const dist = THREE.MathUtils.lerp(Math.log(C0.length() - 0.999), Math.log(C1.length() - 0.999), e);
    const dir = C0.clone().normalize().lerp(C1.clone().normalize(), e).normalize();
    camera.position.copy(dir.multiplyScalar(Math.exp(dist) + 0.999));
    camera.quaternion.copy(q0).slerp(q1, e);
    // planet spins with scroll
    group.rotation.y = baseRot - (1 - e) * 1.1 + drift;
    planet.rotation.y = 0;
    clouds.rotation.y = drift * 0.6;
    // sun: from just behind the horizon (sunrise) to its real position for Earth
    const sunStart = current === 'moon' ? new THREE.Vector3(0.75, 0.55, 0.35).normalize() : new THREE.Vector3(0, 0.32, -1).normalize();
    let sunEnd;
    if (current === 'earth') {
      const ss = subsolar();
      sunEnd = latLonToVec(ss.lat, ss.lon).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y).normalize();
    } else sunEnd = new THREE.Vector3(-0.55, 0.35, 0.76).normalize();
    const sun = sunStart.clone().lerp(sunEnd, THREE.MathUtils.smoothstep(e, 0.15, 0.95)).normalize();
    uniforms.sunDir.value.copy(sun);
    sunLight.position.copy(sun.clone().multiplyScalar(10));
    glow.position.copy(group.position);
    glow.scale.setScalar(THREE.MathUtils.lerp(1.006 / 1.03, 1, THREE.MathUtils.smoothstep(e, 0, 0.6)));
    // Earth in the lunar sky, placed above the horizon in the opening view
    if (earthInSky.visible) {
      tmp.copy(D0).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.2).applyAxisAngle(new THREE.Vector3(0, 0, 1), -0.3).multiplyScalar(60).add(C0);
      earthInSky.position.copy(tmp);
      earthInSky.rotation.set(Math.PI / 2, 2.2 + drift * 2, 0);
      earthU.sunDir.value.copy(camera.position).sub(earthInSky.position).normalize().applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.9);
    }
    pinHalo.scale.setScalar(1 + 0.25 * Math.sin(now / 600));
    stars.rotation.y = drift * 0.2;
    renderer.render(scene, camera);
    if (onFrame) onFrame();
  }

  let onFrame = null;
  function homeScreenPos() {
    if (!pin.visible) return null;
    const p = new THREE.Vector3();
    pin.getWorldPosition(p);
    const toCam = camera.position.clone().sub(p).normalize();
    const normal = p.clone().normalize();
    if (normal.dot(toCam) < 0.15) return null;
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
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
      Object.values(uniforms).forEach((u) => u.value?.dispose?.());
      renderer.dispose();
    },
  };
}
