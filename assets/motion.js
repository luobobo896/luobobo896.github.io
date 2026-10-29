/* 交互编排：Motion（motion.dev, WAAPI）+ VanillaTilt。
   自写的部分只剩「读指针写 CSS 变量」这类胶水，动画与视差都交给库。 */
(() => {
  const html = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  html.classList.add("js");

  const M = window.Motion || null;
  const canAnimate = !!(M && typeof M.animate === "function");
  const EASE = [0.16, 1, 0.3, 1];

  const showAll = () => {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  };

  /* 1. 首屏入场（Motion 的时间单位是秒：stagger(0.06) 不是 60） */
  if (canAnimate && !reduce) {
    M.animate(
      ".hero__meta, .hero__copy h1, .hero__copy .lede, .hero__copy .tag, .capy",
      { opacity: [0, 1], y: [22, 0] },
      { delay: M.stagger(0.06), duration: 0.7, easing: EASE }
    );
  }

  /* 2. 滚动入场（每块只放一次） */
  if (canAnimate && !reduce) {
    document.querySelectorAll(".reveal").forEach((el) => {
      M.inView(
        el,
        () => {
          if (el.dataset.shown === "1") return;
          el.dataset.shown = "1";
          M.animate(el, { opacity: [0, 1], y: [26, 0] }, { duration: 0.62, easing: EASE });
        },
        { margin: "0px 0px -12% 0px", amount: 0.12 }
      );
    });
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

  /* 4. 首屏光斑视差 */
  if (canAnimate && M.scroll && !reduce) {
    try {
      M.scroll(M.animate(".hero__glow", { y: [0, -70] }, { easing: "linear" }));
    } catch (e) {
      /* 不支持的浏览器保持静态 */
    }
  }

  /* 5. 指针跟随：只写 CSS 变量，交给 CSS 算；减弱动效时一条监听都不挂 */
  if (fine && !reduce) {
    const glow = document.getElementById("glow");
    let raf = 0;
    let px = 0;
    let py = 0;
    addEventListener(
      "pointermove",
      (e) => {
        px = e.clientX / innerWidth;
        py = e.clientY / innerHeight;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          html.style.setProperty("--mx", px.toFixed(3));
          html.style.setProperty("--my", py.toFixed(3));
          if (glow) {
            glow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
            glow.classList.add("is-on");
          }
        });
      },
      { passive: true }
    );
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

  /* 7. 卡皮巴拉：点一下受惊，回弹交给 spring */
  const capy = document.getElementById("capy");
  if (capy) {
    capy.addEventListener("click", () => {
      capy.classList.add("is-poked");
      if (canAnimate && !reduce) {
        try {
          M.animate(
            capy,
            { scale: [1, 1.06, 1] },
            { duration: 0.62, easing: [0.34, 1.56, 0.64, 1] }
          );
        } catch (e) {
          /* 库的行为变了也不能影响点击反馈：类已经加上了 */
        }
      }
      clearTimeout(capy._t);
      capy._t = setTimeout(() => capy.classList.remove("is-poked"), 900);
    });
  }

  /* 8. 清单页目录高亮（IntersectionObserver，浏览器原生） */
  const tocLinks = [...document.querySelectorAll(".toc a[href^='#']")];
  if (tocLinks.length) {
    const map = new Map();
    tocLinks.forEach((a) => {
      const t = document.getElementById(a.getAttribute("href").slice(1));
      if (t) map.set(t, a);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          tocLinks.forEach((a) => a.classList.remove("is-active"));
          const a = map.get(en.target);
          if (a) a.classList.add("is-active");
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    map.forEach((_, t) => io.observe(t));
  }
})();
