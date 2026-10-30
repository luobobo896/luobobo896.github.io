/* 01 · 水豚小宠物：three.js 低模拼装 + GSAP 编排
 *
 * 只在滚到舞台附近才由 index.html 的内联 module 动态 import，不进首屏关键路径。
 * 造型四件套照着水豚来：方头方吻（长方体，不是球）、耳朵极小贴头顶两角、
 * 眼睛小而高、靠头两侧，身体是横躺的椭球 + 粗短脖子。
 * 动画全交给 gsap：呼吸/眨眼/耳朵/尾巴是 repeat:-1 的 timeline，
 * 跳、喂、玩、撒娇各一条 tl，飞行物的抛物线是「x/z 线性 + y 分段落」拼出来的，
 * 落地弹跳就是几段不同顶点高度的小抛物线首尾相接。渲染由 gsap.ticker 驱动。
 */
import * as THREE from '/vendor/three.module.min.js';

const KEY = 'capy.cute.v1';
const RANK = [[60, '家属'], [30, '常客'], [15, '朋友'], [5, '眼熟'], [0, '初识']];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('pet-stage');
const canvas = document.getElementById('pet-canvas');
const fallback = document.getElementById('pet-fallback');
const cuteEl = document.getElementById('pet-cute');
const levelEl = document.getElementById('pet-level');
const tipEl = document.getElementById('pet-tip');
const btnFeed = document.getElementById('pet-feed');
const btnPlay = document.getElementById('pet-play');

/* ---------- 可爱值：只落本机 localStorage ---------- */
const store = {
  get() {
    try { return clamp(parseInt(localStorage.getItem(KEY) || '0', 10) || 0, 0, 99); } catch { return 0; }
  },
  set(v) { try { localStorage.setItem(KEY, String(v)); } catch { /* 隐私模式写不进去就算了 */ } },
};
let cute = store.get();
const rank = (n) => (RANK.find(([min]) => n >= min) || RANK[RANK.length - 1])[1];
function paint() {
  cuteEl.textContent = '可爱值 ' + cute;
  levelEl.textContent = rank(cute);
}
function addCute() {
  cute = Math.min(99, cute + 1);
  store.set(cute);
  paint();
  return cute;
}
paint();

/* ---------- 状态 ---------- */
let gsap = window.gsap || null;
let scene = null, camera = null, renderer = null, root = null, head = null;
let body = null, tail = null, ball = null, orange = null, disc = null;
const ears = [], eyesOpen = [], eyesHappy = [], eyeScales = [];
let frames = 0, t = 0, live = false, hits = 0, busy = null;
let recent = [], lastCuddle = -99, happyUntil = 0, happyOn = false;
let idle = null, tl = null, ticking = false;
const pointer = { x: 0, y: 0 };
let dragging = false, dragged = false, downX = 0, downY = 0, downT = 0, yawStart = 0, targetYaw = 0;
const dark = matchMedia('(prefers-color-scheme: dark)');

const MOUTH = new THREE.Vector3(0, 0.555, 0.545);
const ORANGE_FROM = { x: 1.6, y: 1.2, z: 1.0 };
const BALL_FROM = { x: 1.2, y: 1.0, z: 2.4 };
const BALL_LAND = { x: 0.34, y: 0.105, z: 0.62 };
const BALL_OUT = { x: 1.94, z: 0.02 };

/* ---------- 几何：长方体 + 轻微 bevel（core 里没有 RoundedBoxGeometry） ---------- */
function roundedBox(w, h, d, r = 0.05, seg = 3) {
  const geo = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = geo.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    dir.subVectors(v, c);
    if (dir.lengthSq() > 1e-8) { dir.normalize().multiplyScalar(r); v.copy(c).add(dir); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

/* ---------- 建模 ---------- */
function build() {
  const fur = material(0xa37e56);
  const bellyMat = material(0x8f6c4a);
  const darkMat = material(0x241f1a, 0.6);

  root = new THREE.Group();

  /* 身体：坐姿的圆角方体，前低后高，头直接压上去 —— 不再用挤出件做身体 */
  body = new THREE.Mesh(roundedBox(0.86, 0.56, 0.54, 0.20), fur);
  body.position.set(0, 0.30, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  /* 头：正脸朝镜头。侧面轮廓挤出转成正脸后，脸是一块平面、下颌往后缩，
     鼻子和嘴没地方放（两版截图都是「两眼之间一根黑条」），所以头改圆角体块：
     颅骨 + 一块又宽又钝的吻部（水豚的识别特征全在这块吻上）。 */
  head = new THREE.Group();
  head.position.set(0, 0.60, 0.02);
  root.add(head);

  const skull = new THREE.Mesh(roundedBox(0.68, 0.50, 0.60, 0.19), fur);
  skull.position.set(0, 0.12, 0);
  skull.castShadow = true;
  skull.receiveShadow = true;
  head.add(skull);

  const muzzle = new THREE.Mesh(roundedBox(0.46, 0.30, 0.32, 0.11), fur);
  muzzle.position.set(0, -0.10, 0.31);
  muzzle.castShadow = true;
  muzzle.receiveShadow = true;
  head.add(muzzle);

  /* 耳朵：头顶左右两角的小耳瓣 */
  for (const z of [-1, 1]) {
    const ear = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), fur);
    shell.scale.set(1, 0.72, 0.5);
    shell.castShadow = true;
    ear.add(shell);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), bellyMat);
    inner.scale.set(1, 0.72, 0.4);
    inner.position.z = 0.006;
    ear.add(inner);
    ear.position.set(z * 0.235, 0.375, -0.12);
    ear.rotation.z = -z * 0.2;
    head.add(ear);
    ears.push(ear);
  }

  /* 眼睛：球体 + 高光，开心时整组换成 ^ ^ 弧 */
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xf7f2ea });
  for (const z of [-1, 1]) {
    const eye = new THREE.Group();
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.042, 20, 16), darkMat));
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), glintMat);
    glint.position.set(0.013, 0.015, 0.038);
    eye.add(glint);
    eye.position.set(z * 0.20, 0.215, 0.315);
    head.add(eye);
    eyesOpen.push(eye);
    eyeScales.push(eye.scale);

    const happy = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.009, 6, 14, Math.PI), darkMat);
    happy.position.copy(eye.position);
    happy.visible = false;
    head.add(happy);
    eyesHappy.push(happy);
  }

  /* 鼻头：吻部上缘的一块深色横垫 */
  const nose = new THREE.Mesh(roundedBox(0.075, 0.10, 0.05, 0.018), darkMat);
  nose.position.set(0, 0.005, 0.475);
  nose.rotation.x = -0.22;
  head.add(nose);

  /* 嘴：鼻下一道浅浅的笑弧 */
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.008, 6, 16, Math.PI), darkMat);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.10, 0.475);
  head.add(smile);

  /* 腮红：两颊，椭圆 */
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xd98a7a, transparent: true, opacity: 0.30, depthWrite: false });
  for (const z of [-1, 1]) {
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), blushMat);
    blush.scale.set(1.3, 1, 1);
    blush.rotation.y = 0;
    blush.position.set(z * 0.21, -0.09, 0.43);
    head.add(blush);
  }

  /* 前爪：坐姿撑在身前 */
  for (const z of [-1, 1]) {
    const paw = new THREE.Mesh(roundedBox(0.17, 0.26, 0.19, 0.07), bellyMat);
    paw.position.set(z * 0.21, 0.14, 0.30);
    paw.castShadow = true;
    paw.receiveShadow = true;
    root.add(paw);
  }
  /* 后脚：塞进身体底面，不能悬空 */
  for (const z of [-1, 1]) {
    const foot = new THREE.Mesh(roundedBox(0.19, 0.10, 0.26, 0.045), bellyMat);
    foot.position.set(z * 0.26, 0.06, -0.06);
    foot.castShadow = true;
    foot.receiveShadow = true;
    root.add(foot);
  }

  /* 尾巴：被身体挡住一半 */
  tail = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bellyMat);
  tail.position.set(0, 0.34, -0.34);
  tail.castShadow = true;
  root.add(tail);

  scene.add(root);

  /* 飞行物放在 root 外面：拖动转水豚时，橘子与球不会跟着转 */
  orange = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 12), material(0xe0853c, 0.6));
  orange.castShadow = true;
  orange.visible = false;
  scene.add(orange);

  ball = new THREE.Mesh(new THREE.SphereGeometry(0.105, 22, 14), material(0x4f8f8f, 0.5));
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);

  /* 地面：ShadowMaterial 接影；暗色主题黑影等于黑上黑，另给一块极淡圆盘 */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 32),
    new THREE.MeshBasicMaterial({ color: 0x14100b, transparent: true, opacity: 0.1, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 0.004, 0.04);
  scene.add(disc);
  paintDisc();

  /* 光：一主光开阴影 + 一补光 + 一盏弱环境 */
  const key = new THREE.DirectionalLight(0xfff2e0, 2.1);
  key.position.set(2.2, 3.4, 2.2);
  key.target.position.set(0, 0.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -1.8;
  key.shadow.camera.right = 1.8;
  key.shadow.camera.top = 1.8;
  key.shadow.camera.bottom = -1.8;
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 8;
  key.shadow.bias = -0.0012;
  key.shadow.radius = 2.5;
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x7a6a55, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
}

function paintDisc() {
  if (!disc) return;
  disc.material.color.set(dark.matches ? 0xbab2a3 : 0x14100b);
  disc.material.opacity = dark.matches ? 0.16 : 0.1;
}

/* ---------- 相机 / 尺寸 ---------- */
function resize() {
  if (!renderer) return;
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* 取景：模型半高 0.40，要求占满舞台高约 75% → 需要的半高 0.53；
     窄屏还要保证宽度装得下（半宽 0.88），两个约束取远的那个 */
  const tan = Math.tan((camera.fov * Math.PI) / 360);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const dH = size.y / (2 * tan);
  const dW = size.x / (2 * tan * camera.aspect);
  camera.position.x = 0.55;
  camera.position.y = 0.86;
  camera.position.z = Math.max(dH, dW) * (w <= 640 ? 1.45 : 1.62);
  camera.lookAt(0, 0.56, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

function render() {
  renderer.render(scene, camera);
  frames++;

  /* 开心状态与眨眼之外的状态类，都在 ticker 里统一收口 */
  const isHappy = t < happyUntil;
  if (isHappy !== happyOn) {
    happyOn = isHappy;
    stage.classList.toggle('is-happy', isHappy);
    for (let i = 0; i < eyesOpen.length; i++) {
      eyesOpen[i].visible = !isHappy;
      eyesHappy[i].visible = isHappy;
    }
  }
}

function happy(dur) {
  happyUntil = t + dur;
  const isHappy = true;
  if (!happyOn) {
    happyOn = isHappy;
    stage.classList.add('is-happy');
    for (let i = 0; i < eyesOpen.length; i++) {
      eyesOpen[i].visible = false;
      eyesHappy[i].visible = true;
    }
  }
}

/* ---------- GSAP 编排 ---------- */
function idleTweens() {
  if (reduce || !gsap) return;
  idle = gsap.timeline({ repeat: -1, defaults: { ease: 'sine.inOut' } });
  idle.to(body.scale, { y: 0.985, duration: 2.3, yoyo: true, repeat: -1, ease: 'sine.inOut' }, 0);
  idle.to(tail.rotation, { y: 0.32, duration: 1.6, yoyo: true, repeat: -1 }, 0);
  for (const ear of ears) idle.to(ear.rotation, { z: 0.16, duration: 0.12, repeat: -1, repeatDelay: 5.2, yoyo: true }, 0);
  /* 眨眼：一条 timeline 循环，每次换一次随机间隔 */
  const blink = gsap.timeline({ repeat: -1, repeatDelay: 2.8, onRepeat: () => blink.repeatDelay(gsap.utils.random(1.6, 4.6)) });
  blink.to(eyeScales, { y: 0.16, duration: 0.07, ease: 'none' }).to(eyeScales, { y: 1, duration: 0.11, ease: 'none' });
}

/* 戳：起跳拉伸、落地压一下再回弹 */
function actJump() {
  kill();
  happy(0.7);
  busy = 'jump';
  tl = gsap.timeline({ onComplete: () => { root.position.y = 0; root.scale.set(1, 1, 1); busy = null; } });
  tl.to(root.scale, { x: 0.96, y: 1.08, z: 0.96, duration: 0.11, ease: 'power2.out' }, 0)
    .to(root.position, { y: 0.42, duration: 0.26, ease: 'power2.out' }, 0.05)
    .to(root.scale, { x: 1, y: 1, z: 1, duration: 0.16 }, 0.11)
    .to(root.position, { y: 0, duration: 0.30, ease: 'power2.in' }, 0.31)
    .to(root.scale, { x: 1.07, y: 0.9, z: 1.07, duration: 0.09, ease: 'power1.out' }, 0.58)
    .to(root.scale, { x: 1, y: 1, z: 1, duration: 0.22, ease: 'back.out(2)' }, 0.67);
}

/* 喂：橘子从右前方抛物线落到嘴边，咀嚼，吞咽 */
function actFeed() {
  kill();
  busy = 'feed';
  orange.visible = true;
  tl = gsap.timeline({ onComplete: () => { orange.visible = false; busy = null; } });
  tl.set(orange.position, ORANGE_FROM, 0)
    .to(orange.position, { x: MOUTH.x, z: 0, duration: 0.62, ease: 'none' }, 0)
    .to(orange.position, { y: 1.66, duration: 0.24, ease: 'power2.out' }, 0)
    .to(orange.position, { y: MOUTH.y, duration: 0.38, ease: 'power1.in' }, 0.24)
    .to(orange.scale, { x: 0.4, y: 0.4, z: 0.4, duration: 0.1 }, 0.56)
    .set(orange, { visible: false }, 0.62)
    .to(head.rotation, { x: -0.1, duration: 0.2, ease: 'power2.out' }, 0.42)
    .to(head.rotation, { x: 0.16, duration: 0.1, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 0.62)
    .to(head.rotation, { x: -0.14, duration: 0.16, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 1.42)
    .to(head.rotation, { x: 0, duration: 0.24, ease: 'power2.out' }, 1.78);
}

/* 玩：球从相机这一侧抛入，落地弹两下停在脚前，低头顶一下，球滚出去 */
function actPlay() {
  kill();
  busy = 'play';
  ball.visible = true;
  tl = gsap.timeline({ onComplete: () => { ball.visible = false; busy = null; } });
  tl.set(ball.position, BALL_FROM, 0)
    .to(ball.position, { x: BALL_LAND.x, z: BALL_LAND.z, duration: 1.06, ease: 'none' }, 0)
    .to(ball.position, { y: 0.105, duration: 0.4, ease: 'power1.in' }, 0)
    .to(ball.position, { y: 0.38, duration: 0.2, ease: 'power1.out' }, 0.4)
    .to(ball.position, { y: 0.105, duration: 0.2, ease: 'power1.in' }, 0.6)
    .to(ball.position, { y: 0.21, duration: 0.12, ease: 'power1.out' }, 0.8)
    .to(ball.position, { y: 0.105, duration: 0.14, ease: 'power1.in' }, 0.92)
    .to(head.rotation, { x: 0.46, duration: 0.2, ease: 'power2.inOut' }, 1.06)
    .to(head.rotation, { x: 0, duration: 0.3, ease: 'power2.out' }, 1.3)
    .to(ball.position, { x: BALL_OUT.x, z: BALL_OUT.z, duration: 0.85, ease: 'power1.out' }, 1.5);
}

/* 撒娇：整体朝相机走近 0.35、抬头、左右蹭两下 */
function actCuddle() {
  kill();
  busy = 'cuddle';
  tl = gsap.timeline({ onComplete: () => { root.position.z = 0; head.rotation.x = 0; head.rotation.z = 0; busy = null; } });
  tl.to(root.position, { z: 0.35, duration: 0.5, ease: 'power2.out' }, 0)
    .to(head.rotation, { x: -0.24, duration: 0.4, ease: 'power2.out' }, 0.05)
    .to(head.rotation, { z: 0.16, duration: 0.26, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.4)
    .to(root.rotation, { y: 0.14, duration: 0.34, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.4)
    .to(root.position, { z: 0, duration: 0.6, ease: 'power2.inOut' }, 1.3)
    .to(head.rotation, { x: 0, z: 0, duration: 0.5, ease: 'power2.out' }, 1.3);
}

function kill() {
  if (tl) { tl.kill(); tl = null; }
  if (orange) { orange.visible = false; orange.scale.set(1, 1, 1); }
  if (ball) ball.visible = false;
  if (root) { root.position.y = 0; root.position.z = 0; root.rotation.y = 0; root.scale.set(1, 1, 1); }
  if (head) head.rotation.set(0, 0, 0);
}

/* ---------- 交互 ---------- */
function bump(say) {
  addCute();
  hits++;
  const now = performance.now() / 1000;
  recent = recent.filter((s) => now - s < 8);
  recent.push(now);
  if (tipEl) tipEl.textContent = say;
  if (recent.length >= 3 && now - lastCuddle > 10) {
    lastCuddle = now;
    recent = [];
    actCuddle();
    if (tipEl) tipEl.textContent = '它凑到镜头前蹭了蹭你。';
    return true;
  }
  return false;
}

function jump() {
  if (reduce) { addCute(); return; }
  happy(0.7);
  actJump();
  if (tipEl) tipEl.textContent = '你戳了它一下，它跳起来冒了颗心。';
}

function bind() {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    dragging = true;
    dragged = false;
    downX = e.clientX;
    downY = e.clientY;
    yawStart = targetYaw;
    downT = performance.now();
  });

  canvas.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    if (!reduce) {
      /* 头缓慢转向指针（阻尼，不全跟）：交给 gsap 的 overwrite 收口 */
      gsap.to(head.rotation, { y: pointer.x * 0.42, duration: 0.75, ease: 'power2.out', overwrite: 'auto' });
      gsap.to(head.rotation, { x: -pointer.y * 0.14, duration: 0.75, ease: 'power2.out', overwrite: 'auto' });
    }
    if (!dragging) return;
    const dx = e.clientX - downX;
    if (Math.abs(dx) > 5) dragged = true;
    targetYaw = clamp(yawStart + dx * 0.009, -1.15, 1.15);
    if (!reduce) gsap.to(root.rotation, { y: targetYaw, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
  });

  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    if (!reduce) gsap.to(root.rotation, { y: 0, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
    targetYaw = 0;
    if (dragged || performance.now() - downT > 500) return;
    const r = stage.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(root, true).length) jump();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  btnFeed.addEventListener('click', () => {
    if (bump('它把橘子嚼得很认真，嘴边还沾了渣。')) return;
    if (!reduce) actFeed();
  });
  btnPlay.addEventListener('click', () => {
    if (bump('球被顶回来了，它得意地站了会儿。')) return;
    if (!reduce) actPlay();
  });

  /* 离屏 / 切页签就停掉 ticker —— 常驻 rAF 一个都不留 */
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      live = e.isIntersecting;
      if (live && !document.hidden) start();
      else stop();
    }
  }, { rootMargin: '120px' });
  io.observe(stage);

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : live && start();
  });

  new ResizeObserver(() => resize()).observe(stage);
  dark.addEventListener('change', () => { paintDisc(); if (reduce) resize(); });
}

/* ---------- 起停 ---------- */
function start() {
  if (reduce || ticking || !renderer) return;
  ticking = true;
  gsap.ticker.add(render);
}

function stop() {
  if (!ticking) return;
  ticking = false;
  gsap.ticker.remove(render);
}

async function boot() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    if (!renderer.getContext()) throw new Error('no webgl context');
  } catch (err) {
    renderer = null;
    giveUp();
    return;
  }
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 24);
  camera.position.set(0.40, 0.66, 1.9);
  camera.lookAt(0.03, 0.42, 0);
  build();
  bind();
  resize();
  if (reduce) {
    /* 减弱动效：只渲染静态姿势，一帧之后不再进循环 */
    renderer.render(scene, camera);
    frames = 1;
    window.__petPath = 'reduce-static';
    return;
  }
  gsap.ticker.add(() => { t += gsap.ticker.deltaRatio(60) / 60; });
  /* ?noblink：截图/自测时关掉随机眨眼，免得抓在闭眼那一帧 */
  if (!location.search.includes('noblink')) idleTweens();
  window.__petPath = 'animate';
  start();
}

function giveUp() {
  canvas.hidden = true;
  stage.classList.add('is-flat');
  fallback.hidden = false;
  if (tipEl) tipEl.textContent = '这台设备放不出 3D，它就在这儿待着，按钮一样能玩。';
}

/* ---------- 诊断出口 ---------- */
const _proj = new THREE.Vector3();
function hitPoint(x, y, z) {
  if (!camera) return null;
  _proj.set(x, y, z).project(camera);
  const r = stage.getBoundingClientRect();
  return {
    x: +((_proj.x * 0.5 + 0.5) * r.width).toFixed(1),
    y: +((-_proj.y * 0.5 + 0.5) * r.height).toFixed(1),
    w: +r.width.toFixed(1),
    h: +r.height.toFixed(1),
  };
}

window.__pet = () => ({
  mode: renderer ? '3d' : 'flat',
  reduce,
  live,
  frames,
  ticking,
  cute,
  hits,
  busy,
  y: root ? +root.position.y.toFixed(3) : null,
  z: root ? +root.position.z.toFixed(3) : null,
  rotY: root ? +root.rotation.y.toFixed(3) : null,
  headX: head ? +head.rotation.x.toFixed(3) : null,
  ball: ball ? { on: ball.visible, x: +ball.position.x.toFixed(2), y: +ball.position.y.toFixed(2), z: +ball.position.z.toFixed(2) } : null,
  orange: orange ? { on: orange.visible, x: +orange.position.x.toFixed(2), y: +orange.position.y.toFixed(2), z: +orange.position.z.toFixed(2) } : null,
  dpr: renderer ? renderer.getPixelRatio() : 0,
  canvas: [+canvas.width, +canvas.height],
  hit: hitPoint(-0.02, 0.44, 0.2),
  eyes: eyesHappy.length ? +eyesHappy[0].visible : null,
});

/* gsap 没就位时先把它拉进来（正常路径下 defer 已经加载好了） */
if (!gsap) {
  const s = document.createElement('script');
  s.src = '/vendor/gsap.min.js';
  s.onload = () => { gsap = window.gsap; boot(); };
  s.onerror = giveUp;
  document.head.append(s);
} else {
  boot();
}
