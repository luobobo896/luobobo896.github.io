/* 水豚小宠物（实拍版）：交互只改类名与一句文案，零 rAF、零依赖、不读网络 */
(() => {
  const stage = document.getElementById('pet-stage');
  if (!stage) return;
  const rig = document.getElementById('pet-rig');
  const photo = document.getElementById('pet-photo');
  const cuteEl = document.getElementById('pet-cute');
  const levelEl = document.getElementById('pet-level');
  const tipEl = document.getElementById('pet-tip');
  const feedBtn = document.getElementById('pet-feed');
  const playBtn = document.getElementById('pet-play');
  const fallback = document.getElementById('pet-fallback');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'capy.cute.v1';
  const RANK = [[60, '家属'], [30, '常客'], [15, '朋友'], [5, '眼熟'], [0, '初识']];
  const CUDDLE = '它凑到镜头前蹭了蹭你。';

  let cute = 0;
  try { cute = Math.min(99, Math.max(0, Number(localStorage.getItem(KEY)) || 0)); } catch (e) {}
  const paint = () => {
    cuteEl.textContent = '可爱值 ' + cute;
    levelEl.textContent = RANK.find((r) => cute >= r[0])[1];
  };
  paint();

  // 图挂了退到文字说明，不留白屏；按钮照样能玩
  let broke = false;
  const giveUp = () => {
    if (broke) return;
    broke = true;
    fallback.hidden = false;
    stage.classList.add('is-flat');
    rig.hidden = true;
  };
  photo.addEventListener('error', giveUp);
  if (photo.complete && !photo.naturalWidth) giveUp();

  let hits = 0, lastHit = 0, lastCuddle = -1e9;
  const timers = {};
  // 每个类各自计时，互不打断（喂和玩可以叠着播）
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
      tipEl.textContent = CUDDLE;
      return 1;
    }
    return 0;
  };

  feedBtn.addEventListener('click', () => {
    if (bump('它把橘子嚼得很认真，嘴边还沾了渣。')) return;
    setClass('is-chewing', 1200);
    happy(1500);
  });
  playBtn.addEventListener('click', () => {
    if (bump('球被顶回来了，它得意地站了会儿。')) return;
    setClass('is-playing', 1900);
    happy(1200);
  });
  stage.addEventListener('click', () => {
    if (broke) return;
    if (bump('你戳了它一下，它跳起来冒了颗心。')) return;
    setClass('is-poked', 660);
    happy(1300);
  });

  // 离屏整棵树冻结，回屏再播
  new IntersectionObserver((es) => {
    stage.classList.toggle('is-live', es[0].isIntersecting && !reduce.matches);
  }, { rootMargin: '80px' }).observe(stage);
  const resync = () => {
    const box = stage.getBoundingClientRect();
    stage.classList.toggle('is-live', !reduce.matches && box.top < innerHeight && box.bottom > 0);
  };
  reduce.addEventListener('change', resync);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.classList.remove('is-live');
    else resync();
  });
  window.__pet = () => ({
    cute, hits, live: stage.classList.contains('is-live'),
    flat: stage.classList.contains('is-flat'), reduce: reduce.matches,
    img: photo.naturalWidth + 'x' + photo.naturalHeight,
    running: document.getAnimations().filter((a) => a.playState === 'running').length,
  });
})();
