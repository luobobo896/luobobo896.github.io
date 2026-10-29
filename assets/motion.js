/* 交互编排：GSAP + ScrollTrigger（统一一个动画库）+ VanillaTilt。
   自写的只剩「读指针写 CSS 变量」这类胶水，动画与视差都交给库。 */
(() => {
  const html = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  html.classList.add("js");

  const gsap = window.gsap || null;
  const ST = window.ScrollTrigger || null;
  const canAnimate = !!(gsap && ST) && !reduce;
  /* 减弱动效时连 ScrollTrigger 都不注册：它一注册就会挂一个常驻 ticker，
     reduce 要求整页 rAF 归零，不能留这个尾巴 */
  if (canAnimate) gsap.registerPlugin(ST);
  const EASE = "power3.out";

  /* reduce：ScrollTrigger 的 UMD 一加载就开了一个常驻 rAF 修边循环
     （栈：ScrollTrigger._rafBugFix ← enable），不创建 trigger 也照跑。
     这里显式停掉它，整页 rAF 才能归零；正常模式不动。 */
  if (reduce && ST) ST.disable(true);

  const showAll = () => {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  };

  /* 1. 首屏入场走 CSS rise，同一元素只留一条时间线 */

  /* 2. 滚动入场：ST.batch 批量点亮，每块只放一次 */
  if (canAnimate) {
    const items = gsap.utils.toArray(".reveal");
    const shown = new Set();
    const show = (els) => {
      els.forEach((el) => {
        if (shown.has(el)) return;
        shown.add(el);
        gsap.to(el, { opacity: 1, y: 0, duration: 0.62, ease: EASE, overwrite: true,
          clearProps: "translate,rotate,scale" });
      });
    };
    gsap.set(items, { opacity: 0, y: 26 });
    /* 清掉 GSAP 补的 inline scale:none，它压掉 .card:active 的 scale */
    gsap.set(items, { clearProps: "scale,rotate" });
    /* 批量进场：同一屏的几块一起点亮，带 0.08s 错峰 */
    ST.batch(items, {
      /* 用「元素顶边进视口下缘」而不是「到 88% 线」：页面最底部那块
         永远到不了 88% 线，会一直停在 opacity 0 */
      start: "top bottom-=60",
      once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.62, ease: EASE, stagger: 0.08, overwrite: true,
        clearProps: "translate,rotate,scale",
        onStart() { batch.forEach((el) => shown.add(el)); } }),
    });
    /* 兜底：锚点跳转/截图脚本的瞬时滚动会跳过 batch，按位置补一刀 */
    const sweep = () => {
      const h = innerHeight - 60;
      show(items.filter((el) => !shown.has(el) && el.getBoundingClientRect().top < h));
    };
    addEventListener("scroll", sweep, { passive: true });
    /* 页面还会长高（3D 落位、字体到位），长高后再扫一次 */
    if (window.ResizeObserver) new ResizeObserver(sweep).observe(document.body);
    sweep();
  } else {
    showAll();
  }

  /* 3. 卡片 3D 倾斜：VanillaTilt 负责，CSS 只管阴影 */
  if (window.VanillaTilt && fine && !reduce) {
    window.VanillaTilt.init(document.querySelectorAll(".card"), {
      max: 5,
      speed: 900,
      scale: 1.012,
      glare: false,
      "full-page-listening": false,
      gyroscope: false,
    });
  }

  /* 4. 首屏光斑视差：跟着滚动走，scrub 让位置只跟进度有关 */
  if (canAnimate) {
    gsap.to(".hero__glow", {
      y: -70,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  }

  /* 5. 指针跟随：只写 CSS 变量，交给 CSS 算；减弱动效时一条监听都不挂 */
  if (fine && !reduce) {
    const glow = document.getElementById("glow");
    const cards = [...document.querySelectorAll(".card")];
    let raf = 0;
    let ev = null;
    addEventListener("pointermove", (e) => {
      ev = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        html.style.setProperty("--mx", (ev.clientX / innerWidth).toFixed(3));
        html.style.setProperty("--my", (ev.clientY / innerHeight).toFixed(3));
        if (glow) {
          glow.style.transform = `translate3d(${ev.clientX}px, ${ev.clientY}px, 0)`;
          glow.classList.add("is-on");
        }
        /* 卡面聚光：把指针在卡片内的百分比写给 CSS，.card::after 的
           radial-gradient 才有人喂 --px/--py */
        for (const card of cards) {
          const r = card.getBoundingClientRect();
          if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) continue;
          card.style.setProperty("--px", `${(((ev.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
          card.style.setProperty("--py", `${(((ev.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
        }
      });
    }, { passive: true });
  }

  /* 6. 导航滚动态 + 阅读进度 */
  const nav = document.querySelector(".nav");
  const bar = document.querySelector(".progress");
  const onScroll = () => {
    const y = scrollY;
    if (nav) nav.classList.toggle("is-scrolled", y > 8);
    if (bar) {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty("--p", h > 0 ? (y / h).toFixed(4) : "0");
    }
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* 7. 清单页目录高亮（IntersectionObserver，浏览器原生） */
  const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
  if (tocLinks.length) {
    const map = new Map();
    tocLinks.forEach((a) => {
      const t = document.getElementById(a.getAttribute("href").slice(1));
      if (t) map.set(t, a);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        tocLinks.forEach((a) => a.classList.remove("is-active"));
        const a = map.get(en.target);
        if (a) a.classList.add("is-active");
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    map.forEach((_, t) => io.observe(t));
    if (tocLinks[0]) tocLinks[0].classList.add("is-active");
  }
})();
