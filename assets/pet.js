/* 水豚小宠物：CSS 3D 分层（preserve-3d），交互只改类名与自定义属性，零 rAF、零依赖 */
(() => {
  const stage = document.getElementById('pet-stage');
  if (!stage) return;
  const rig = document.getElementById('pet-rig');
  const head = rig.querySelector('.pet__head');
  const cuteEl = document.getElementById('pet-cute');
  const levelEl = document.getElementById('pet-level');
  const tipEl = document.getElementById('pet-tip');
  const feedBtn = document.getElementById('pet-feed');
  const playBtn = document.getElementById('pet-play');
  const fallback = document.getElementById('pet-fallback');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'capy.cute.v1';
  const RANK = [[60, '家属'], [30, '常客'], [15, '朋友'], [5, '眼熟'], [0, '初识']];

  let cute = 0;
  try { cute = Math.min(99, Math.max(0, Number(localStorage.getItem(KEY)) || 0)); } catch (e) {}
  const paint = () => {
    cuteEl.textContent = '可爱值 ' + cute;
    levelEl.textContent = RANK.find((r) => cute >= r[0])[1];
  };
  paint();

  // 3D 支撑不了就退实拍图，不白屏
  const ok = window.CSS && CSS.supports && CSS.supports('transform-style', 'preserve-3d');
  if (!ok) {
    fallback.hidden = false;
    stage.classList.add('is-flat');
    rig.hidden = true;
    tipEl.textContent = '这台设备放不出 3D，水豚就在这儿趴着，按钮一样能玩。';
  }

  let hits = 0, lastHit = 0, lastCuddle = -1e9;
  const timers = {};
  // 每个类各自计时，互不打断（喂食和玩球可以叠着播）
  const setClass = (name, ms) => {
    rig.classList.add(name);
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => rig.classList.remove(name), ms);
  };
  const happy = (ms) => setClass('is-happy', ms);
  // 连续三次互动（8 秒内）凑过来蹭一次，10 秒内不重复
  const bump = (say) => {
    cute = Math.min(99, cute + 1);
    try { localStorage.setItem(KEY, String(cute)); } catch (e) {}
    paint();
    const now = Date.now();
    hits = now - lastHit > 8000 ? 1 : hits + 1;
    lastHit = now;
    if (say) tipEl.textContent = say;
    if (hits >= 3 && now - lastCuddle > 10000) {
      lastCuddle = now;
      hits = 0;
      setClass('is-cuddling', 1700);
      happy(1700);
      tipEl.textContent = '它凑到镜头前蹭了蹭你。';
      return 1;
    }
    return 0;
  };

  feedBtn.addEventListener('click', () => {
    const cuddle = bump('它把橘子嚼得很认真，嘴边还沾了渣。');
    setClass('is-chewing', 1600);
    happy(1500);
    if (cuddle) tipEl.textContent = '它凑到镜头前蹭了蹭你。';
  });
  playBtn.addEventListener('click', () => {
    const cuddle = bump('球被顶回来了，它得意地站了会儿。');
    setClass('is-playing', 1900);
    happy(1200);
    if (cuddle) tipEl.textContent = '它凑到镜头前蹭了蹭你。';
  });

  // 拖拽转身；轻点算戳一下
  let downX = null, moved = 0, pointer = 0;
  const setRot = (yaw, pitch) => {
    rig.style.setProperty('--yaw', yaw.toFixed(2) + 'deg');
    rig.style.setProperty('--pitch', pitch.toFixed(2) + 'deg');
  };
  const turnHead = (n) => {
    if (!ok) return;
    const deg = Math.max(-22, Math.min(22, n * 22));
    head.style.rotate = '0 1 0 ' + deg.toFixed(1) + 'deg';
  };
  stage.addEventListener('pointerdown', (e) => {
    if (!ok) return;
    downX = e.clientX;
    moved = 0;
    rig.style.transition = 'none';
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    const box = stage.getBoundingClientRect();
    pointer = ((e.clientX - box.left) / box.width) * 2 - 1;
    if (downX === null) { turnHead(pointer); return; }
    const dx = e.clientX - downX;
    if (Math.abs(dx) > 6) moved = 1;
    const yaw = Math.max(-34, Math.min(34, dx * 0.22));
    setRot(yaw, -(moved ? 3 : 0));
  });
  const up = () => {
    if (!ok) return;
    const tap = downX !== null && !moved;
    downX = null;
    rig.style.transition = '';
    setRot(0, 0);
    if (tap) {
      const cuddle = bump('你戳了它一下，它跳起来冒了颗心。');
      setClass('is-poked', 660);
      happy(1300);
      if (cuddle) tipEl.textContent = '它凑到镜头前蹭了蹭你。';
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', () => turnHead(0));

  // 离屏整棵树冻结，回屏再播
  new IntersectionObserver((es) => {
    stage.classList.toggle('is-live', es[0].isIntersecting && !reduce.matches);
  }, { rootMargin: '80px' }).observe(stage);
  const resync = () => stage.classList.toggle('is-live', !reduce.matches && stage.getBoundingClientRect().top < innerHeight && stage.getBoundingClientRect().bottom > 0);
  reduce.addEventListener('change', resync);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.classList.remove('is-live');
    else resync();
  });
  window.__pet = () => ({
    cute, hits, live: stage.classList.contains('is-live'),
    yaw: getComputedStyle(rig).getPropertyValue('--yaw').trim(),
    flat: !ok, reduce: reduce.matches,
    running: document.getAnimations().filter((a) => a.playState === 'running').length,
  });
})();
