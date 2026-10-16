// A camada de movimento da home v2, portada do script do protótipo do dono: o cursor que revela a foto
// corrigida (canvas 2D), a abertura que encolhe com a rolagem, a galeria horizontal, os títulos linha a
// linha e a rolagem suave. GSAP (com ScrollTrigger e SplitText) e Lenis entram só aqui, por import dinâmico:
// a licença do GSAP vale para sites, e a home é um site; o editor e as animações do vídeo não usam GSAP.
// Devolve a função que desfaz tudo (sair da página não deixa laço, ouvinte nem ScrollTrigger para trás).

type Desfazer = () => void;

const MASCARA = 0.25; // a máscara do pincel é desenhada em 1/4 do tamanho do canvas

/** O canvas que mostra a foto bruta e revela a corrigida onde o cursor (ou o dedo) passa. */
function criarRevelacao(palco: HTMLElement, canvas: HTMLCanvasElement, corrigida: string, ouvir: (alvo: EventTarget, evento: string, f: EventListener, o?: AddEventListenerOptions) => void) {
  const ctx = canvas.getContext("2d");
  const mascara = document.createElement("canvas");
  const mctx = mascara.getContext("2d");
  if (!ctx || !mctx) return null;
  const bruta = new Image();
  const graduada = new Image();
  let carregadas = 0;
  let W = 0;
  let H = 0;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  let cobre: { x: number; y: number; w: number; h: number } | null = null;
  const ponteiro = { px: 0, py: 0, tem: false, ultimo: 0, autoIniciado: false };
  const estado = { trava: 0, travaX: 0, travaY: 0, rodando: false, auto: 0 };
  const grosso = window.matchMedia("(pointer: coarse)").matches;

  function medir() {
    const caixa = palco.getBoundingClientRect();
    W = Math.round(caixa.width * DPR);
    H = Math.round(caixa.height * DPR);
    canvas.width = W;
    canvas.height = H;
    mascara.width = Math.max(1, Math.round(W * MASCARA));
    mascara.height = Math.max(1, Math.round(H * MASCARA));
    if (graduada.naturalWidth) {
      const s = Math.max(W / graduada.naturalWidth, H / graduada.naturalHeight);
      const w = graduada.naturalWidth * s;
      const h = graduada.naturalHeight * s;
      // Em pé, a criadora e a câmera continuam no quadro
      const fx = W / H < 1 ? 0.17 : W / H < 1.4 ? 0.35 : 0.5;
      cobre = { x: (W - w) * fx, y: (H - h) * 0.45, w, h };
    }
  }
  function mancha(x: number, y: number, r: number, a: number) {
    const g = mctx!.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(255,255,255,${a * 0.6})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    mctx!.fillStyle = g;
    mctx!.beginPath();
    mctx!.arc(x, y, r, 0, Math.PI * 2);
    mctx!.fill();
  }
  function pincelar(x0: number, y0: number, x1: number, y1: number, velocidade: number) {
    const mx = mascara.width / W;
    const my = mascara.height / H;
    const passos = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (14 * DPR)));
    const base = Math.min(W, H) * (0.07 + Math.min(velocidade, 1) * 0.06);
    for (let i = 1; i <= passos; i++) {
      const t = i / passos;
      const x = (x0 + (x1 - x0) * t) * mx;
      const y = (y0 + (y1 - y0) * t) * my;
      mancha(x, y, base * mx, 0.9);
      // Borda orgânica
      for (let k = 0; k < 2; k++) {
        const angulo = Math.random() * Math.PI * 2;
        const d = base * mx * (0.4 + Math.random() * 0.5);
        mancha(x + Math.cos(angulo) * d, y + Math.sin(angulo) * d, base * mx * (0.25 + Math.random() * 0.3), 0.6);
      }
    }
  }
  function quadro(_t: number, dt: number) {
    if (!estado.rodando || !cobre) return;
    // Sozinho quando ninguém mexe (e sempre no toque)
    const agora = performance.now();
    if (!ponteiro.tem || agora - ponteiro.ultimo > 2400) {
      estado.auto += (dt || 16) / 1000;
      const t = estado.auto;
      const cx = W * (0.58 + 0.2 * Math.sin(t * 0.7));
      const cy = H * (0.42 + 0.16 * Math.sin(t * 1.3 + 1));
      if (!ponteiro.autoIniciado) {
        ponteiro.px = cx;
        ponteiro.py = cy;
        ponteiro.autoIniciado = true;
      }
      pincelar(ponteiro.px, ponteiro.py, cx, cy, 0.25);
      ponteiro.px = cx;
      ponteiro.py = cy;
    }
    // O rastro evapora
    mctx!.globalCompositeOperation = "destination-out";
    mctx!.fillStyle = `rgba(0,0,0,${estado.trava > 0.99 ? 0 : 0.03})`;
    mctx!.fillRect(0, 0, mascara.width, mascara.height);
    mctx!.globalCompositeOperation = "source-over";
    if (estado.trava > 0) {
      mctx!.fillStyle = "#fff";
      mctx!.beginPath();
      mctx!.arc(estado.travaX * MASCARA, estado.travaY * MASCARA, Math.hypot(mascara.width, mascara.height) * estado.trava, 0, Math.PI * 2);
      mctx!.fill();
    }
    // Corrigida onde há máscara, bruta no resto
    ctx!.globalCompositeOperation = "source-over";
    ctx!.clearRect(0, 0, W, H);
    ctx!.drawImage(graduada, cobre.x, cobre.y, cobre.w, cobre.h);
    ctx!.globalCompositeOperation = "destination-in";
    ctx!.drawImage(mascara, 0, 0, W, H);
    ctx!.globalCompositeOperation = "destination-over";
    ctx!.drawImage(bruta, cobre.x, cobre.y, cobre.w, cobre.h);
    ctx!.globalCompositeOperation = "source-over";
  }
  function mover(e: { clientX: number; clientY: number; pointerType?: string }) {
    if (estado.trava > 0.5 || e.pointerType === "touch") return;
    const caixa = canvas.getBoundingClientRect();
    const x = ((e.clientX - caixa.left) / caixa.width) * W;
    const y = ((e.clientY - caixa.top) / caixa.height) * H;
    const agora = performance.now();
    if (!ponteiro.tem || agora - ponteiro.ultimo > 200) {
      ponteiro.px = x;
      ponteiro.py = y;
    }
    const velocidade = Math.hypot(x - ponteiro.px, y - ponteiro.py) / Math.max(1, agora - ponteiro.ultimo) / DPR;
    pincelar(ponteiro.px, ponteiro.py, x, y, velocidade);
    ponteiro.px = x;
    ponteiro.py = y;
    ponteiro.tem = true;
    ponteiro.ultimo = agora;
    ponteiro.autoIniciado = false;
  }

  bruta.onload = graduada.onload = () => {
    if (++carregadas === 2) medir();
  };
  bruta.src = canvas.dataset.raw ?? "";
  graduada.src = corrigida;
  ouvir(palco, "pointermove", (e) => mover(e as PointerEvent), { passive: true });
  // Toque e segure: parado uns 160 ms, a página para de rolar enquanto o dedo pinta a máscara
  let segurar: number | null = null;
  let pintando = false;
  let sx = 0;
  let sy = 0;
  ouvir(palco, "touchstart", (evento) => {
    const e = evento as TouchEvent;
    if (e.touches.length !== 1 || (e.target as Element).closest("a, button")) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    if (segurar) window.clearTimeout(segurar);
    segurar = window.setTimeout(() => {
      pintando = true;
      ponteiro.tem = false;
      palco.classList.add("is-painting", "hint-off");
      mover({ clientX: sx, clientY: sy, pointerType: "pen" });
    }, 160);
  }, { passive: true });
  ouvir(palco, "touchmove", (evento) => {
    const e = evento as TouchEvent;
    const toque = e.touches[0];
    if (pintando) {
      if (e.cancelable) e.preventDefault();
      mover({ clientX: toque.clientX, clientY: toque.clientY, pointerType: "pen" });
    } else if (segurar && Math.hypot(toque.clientX - sx, toque.clientY - sy) > 8) {
      window.clearTimeout(segurar);
      segurar = null;
    }
  }, { passive: false });
  const soltar = () => {
    if (segurar) window.clearTimeout(segurar);
    segurar = null;
    if (pintando) {
      pintando = false;
      palco.classList.remove("is-painting");
    }
  };
  ouvir(palco, "touchend", soltar);
  ouvir(palco, "touchcancel", soltar);
  ouvir(palco, "contextmenu", (e) => {
    if (pintando || segurar) e.preventDefault();
  });
  ouvir(window, "resize", medir);
  return { quadro, estado, grosso, iniciar: () => (estado.rodando = true), parar: () => (estado.rodando = false) };
}

export function ligarMovimento(raiz: HTMLElement, reduzir: boolean): Desfazer {
  const doc = document.documentElement;
  const um = <T extends Element = HTMLElement>(seletor: string, dentro: ParentNode = raiz) => dentro.querySelector<T>(seletor);
  const todos = <T extends Element = HTMLElement>(seletor: string, dentro: ParentNode = raiz) => Array.from(dentro.querySelectorAll<T>(seletor));
  const desfazer: Desfazer[] = [];
  const ouvir = (alvo: EventTarget, evento: string, f: EventListener, o?: AddEventListenerOptions) => {
    alvo.addEventListener(evento, f, o);
    desfazer.push(() => alvo.removeEventListener(evento, f, o));
  };
  const mostrarTitulos = () => todos(".split").forEach((el) => el.classList.add("is-split"));
  let cancelado = false;

  const palco = um("[data-reel-stage]");
  const canvas = um<HTMLCanvasElement>("[data-reel-canvas]");
  const reserva = um<HTMLImageElement>(".reel-fallback");
  const revelacao = palco && canvas && reserva ? criarRevelacao(palco, canvas, reserva.getAttribute("src") ?? "", ouvir) : null;
  if (!revelacao || reduzir) doc.classList.add("no-reveal");
  desfazer.push(() => doc.classList.remove("no-reveal", "no-motion", "reduce-motion"));

  // "Aplicar correção": a máscara cresce de um círculo a partir do botão até cobrir a foto
  const botaoTrava = um("[data-reel-lock]");
  let animarTrava: ((ligar: boolean) => void) | null = null;
  if (botaoTrava) {
    ouvir(botaoTrava, "click", () => {
      const ligar = botaoTrava.getAttribute("aria-pressed") !== "true";
      botaoTrava.setAttribute("aria-pressed", ligar ? "true" : "false");
      if (revelacao && canvas) {
        const b = botaoTrava.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        revelacao.estado.travaX = ((b.left + b.width / 2 - c.left) / c.width) * canvas.width;
        revelacao.estado.travaY = ((b.top + b.height / 2 - c.top) / c.height) * canvas.height;
        if (animarTrava) animarTrava(ligar);
        else revelacao.estado.trava = ligar ? 1 : 0;
      }
      if (doc.classList.contains("no-reveal") && reserva) reserva.style.filter = ligar ? "none" : "";
    });
  }

  // Se nada carregar em 2,5 s, os títulos aparecem do mesmo jeito
  const reservaTitulos = window.setTimeout(mostrarTitulos, 2500);
  desfazer.push(() => window.clearTimeout(reservaTitulos));

  void Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText"), import("lenis")])
    .then(([{ gsap }, { ScrollTrigger }, { SplitText }, { default: Lenis }]) => {
      if (cancelado) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);
      ScrollTrigger.config({ ignoreMobileResize: true });
      const contexto = gsap.context(() => undefined, raiz);
      const tiques: ((t: number, dt: number) => void)[] = [];
      const tique = (f: (t: number, dt: number) => void) => {
        gsap.ticker.add(f);
        tiques.push(f);
      };
      if (revelacao && !reduzir) {
        tique((t, dt) => revelacao.quadro(t, dt));
        animarTrava = (ligar) =>
          gsap.to(revelacao.estado, { trava: ligar ? 1 : 0, duration: ligar ? 1.3 : 0.6, ease: ligar ? "power2.inOut" : "power2.out" });
      }

      // Rolagem suave
      let lenis: InstanceType<typeof Lenis> | null = null;
      if (!reduzir) {
        lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.25 });
        lenis.on("scroll", ScrollTrigger.update);
        tique((t) => lenis!.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      }
      for (const link of todos<HTMLAnchorElement>('a[href^="#"]')) {
        ouvir(link, "click", (e) => {
          const id = link.getAttribute("href")!.slice(1);
          const alvo = id ? document.getElementById(id) : null;
          if (!alvo) return;
          e.preventDefault();
          if (lenis) lenis.scrollTo(alvo, { offset: id === "top-reel" ? 0 : -72, duration: 1.4 });
          else alvo.scrollIntoView({ behavior: reduzir ? "auto" : "smooth" });
        });
      }
      const nav = um(".nav");
      const botaoMenu = um(".menu-btn");
      if (botaoMenu && lenis) {
        ouvir(botaoMenu, "click", () => (nav?.classList.contains("open") ? lenis!.stop() : lenis!.start()));
        todos(".mobile-menu a").forEach((link) => ouvir(link, "click", () => lenis!.start()));
      }

      // A faixa de formatos acelera com a rolagem e troca de sentido
      const faixa = um(".marquee-track");
      if (faixa && !reduzir) {
        faixa.style.animation = "none";
        let x = 0;
        let impulso = 0;
        let sentido = 1;
        lenis?.on("scroll", (l: { velocity: number; direction: number }) => {
          impulso = Math.min(Math.abs(l.velocity) * 40, 900);
          if (l.direction) sentido = l.direction;
        });
        tique((_t, dt) => {
          const metade = faixa.scrollWidth / 2;
          if (!metade) return;
          x -= (50 + impulso) * (dt / 1000) * sentido;
          x = gsap.utils.wrap(-metade, 0, x);
          faixa.style.transform = `translate3d(${x}px,0,0)`;
          impulso *= 0.92;
        });
      }

      const telas = gsap.matchMedia(raiz);
      telas.add({ desk: "(min-width: 861px)", mob: "(max-width: 860px)", reduce: "(prefers-reduced-motion: reduce)" }, (c) => {
        const cd = c.conditions as { desk: boolean; reduce: boolean };
        if (cd.reduce) {
          mostrarTitulos();
          doc.classList.add("reduce-motion");
          return () => doc.classList.remove("reduce-motion");
        }

        // A abertura fica parada e encolhe, com o texto gigante atrás
        const reel = um("[data-reel]");
        if (reel && palco) {
          const barra = um("[data-reel-bar]")!;
          const tempo = um("[data-reel-time]")!;
          gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: reel,
                start: "top top",
                end: "+=150%",
                pin: palco,
                scrub: 0.8,
                anticipatePin: 1,
                onUpdate: (s) => {
                  const seg = Math.floor(s.progress * 72);
                  tempo.textContent = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")} / 01:12`;
                  barra.style.transform = `scaleX(${s.progress.toFixed(3)})`;
                  if (s.progress > 0.08) {
                    palco.classList.remove("is-hover");
                    palco.classList.add("hint-off");
                  }
                },
              },
            })
            .to("[data-reel-copy]", { yPercent: -18, autoAlpha: 0, duration: 0.3, ease: "power1.in" }, 0)
            .to("[data-reel-ui]", { y: -24, autoAlpha: 0, duration: 0.22, ease: "power1.in" }, 0)
            .to("[data-reel-hint]", { autoAlpha: 0, duration: 0.08 }, 0)
            .fromTo(
              "[data-reel-media]",
              { clipPath: "inset(0% 0% 0% 0% round 0px)", scale: 1 },
              { clipPath: cd.desk ? "inset(13% 17% 13% 17% round 26px)" : "inset(20% 4% 20% 4% round 20px)", scale: cd.desk ? 0.9 : 0.94, duration: 1 },
              0,
            )
            .to(".reel-shade", { opacity: 0.3, duration: 0.8 }, 0)
            .fromTo('[data-reel-row="1"]', { xPercent: 4 }, { xPercent: -22, duration: 1 }, 0)
            .fromTo('[data-reel-row="2"]', { xPercent: -26 }, { xPercent: 0, duration: 1 }, 0)
            .fromTo("[data-reel-tl]", { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.22, ease: "power2.out" }, 0.72);
          if (!cd.desk) gsap.set("[data-reel-tl]", { left: "7%", right: "7%", bottom: "23%" });

          gsap.from(".reel-copy h1 .line", { yPercent: 105, duration: 1.3, ease: "expo.out", stagger: 0.1, delay: 0.15 });
          gsap.from(".reel-copy .eyebrow, .reel-copy-row > *", { y: 24, autoAlpha: 0, duration: 1, ease: "expo.out", stagger: 0.08, delay: 0.45 });
          gsap.from("[data-reel-ui] > *", { x: 30, autoAlpha: 0, duration: 1, ease: "expo.out", stagger: 0.1, delay: 0.7 });
          gsap.from("[data-reel-canvas], .reel-fallback", { scale: 1.08, duration: 1.8, ease: "expo.out" });

          if (revelacao) {
            ScrollTrigger.create({ trigger: reel, start: "top bottom", end: "bottom top", onToggle: (s) => (s.isActive ? revelacao.iniciar() : revelacao.parar()) });
            revelacao.iniciar();
          }
          // A etiqueta segue o cursor no computador; no toque é uma dica fixa
          const etiqueta = um("[data-reel-cursor]");
          if (etiqueta && revelacao?.grosso) {
            palco.classList.add("is-touch");
            um("span", etiqueta)!.textContent = "Toque e segure para editar";
          }
          if (etiqueta && cd.desk) {
            const qx = gsap.quickTo(etiqueta, "x", { duration: 0.45, ease: "power3" });
            const qy = gsap.quickTo(etiqueta, "y", { duration: 0.45, ease: "power3" });
            const seguir = (evento: Event) => {
              const e = evento as PointerEvent;
              const caixa = palco.getBoundingClientRect();
              qx(e.clientX - caixa.left);
              qy(e.clientY - caixa.top);
              const sobre = (e.target as Element).closest(".reel-copy a, .reel-ui, .btn, .reel-scroll");
              palco.classList.toggle("is-hover", !sobre && (revelacao ? revelacao.estado.trava < 0.5 : true) && window.scrollY < innerHeight * 0.3);
            };
            const sair = () => palco.classList.remove("is-hover");
            palco.addEventListener("pointermove", seguir);
            palco.addEventListener("pointerleave", sair);
            return () => {
              palco.removeEventListener("pointermove", seguir);
              palco.removeEventListener("pointerleave", sair);
            };
          }
        }
      });

      // A galeria dos criadores anda na horizontal enquanto a página rola (no celular também, mais devagar)
      telas.add({ desk: "(min-width: 861px)", mob: "(max-width: 860px)", reduce: "(prefers-reduced-motion: reduce)" }, (c) => {
        const cd = c.conditions as { desk: boolean; reduce: boolean };
        const galeria = um("[data-hgal]");
        if (!galeria || cd.reduce) return;
        const fator = cd.desk ? 0.3 : 0.12;
        const trilho = um("[data-hgal-track]", galeria)!;
        const barra = um("[data-hgal-bar]", galeria)!;
        const contador = um("[data-hgal-count]", galeria)!;
        const cartoes = todos(".hcard", galeria);
        const distancia = () => Math.max(0, trilho.scrollWidth - innerWidth);
        const movimento = gsap.to(trilho, {
          x: () => -distancia(),
          ease: "none",
          scrollTrigger: {
            trigger: galeria,
            start: "top top",
            end: () => `+=${distancia()}`,
            pin: um(".hgal-pin", galeria),
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
            onUpdate: (s) => {
              barra.style.transform = `scaleX(${s.progress.toFixed(3)})`;
              const n = Math.min(cartoes.length, 1 + Math.floor(s.progress * cartoes.length));
              contador.textContent = `${String(n).padStart(2, "0")} / ${String(cartoes.length).padStart(2, "0")}`;
            },
          },
        });
        // Cada bloco anda numa velocidade própria
        for (const bloco of todos("[data-speed]", galeria)) {
          const v = Number.parseFloat(bloco.dataset.speed ?? "1") || 1;
          gsap.fromTo(
            bloco,
            { x: () => (v - 1) * innerWidth * fator },
            { x: () => -(v - 1) * innerWidth * fator, ease: "none", scrollTrigger: { trigger: galeria, start: "top top", end: () => `+=${distancia()}`, scrub: 1, invalidateOnRefresh: true } },
          );
        }
        // A foto desliza dentro da moldura
        for (const cartao of cartoes) {
          gsap.fromTo(um("img", cartao), { xPercent: -7 }, {
            xPercent: 7,
            ease: "none",
            scrollTrigger: { trigger: cartao, containerAnimation: movimento, start: "left right", end: "right left", scrub: true },
          });
        }
        gsap.fromTo("[data-hgal-glow]", { xPercent: 0 }, {
          xPercent: 160,
          ease: "none",
          scrollTrigger: { trigger: galeria, start: "top top", end: () => `+=${distancia()}`, scrub: 1, invalidateOnRefresh: true },
        });
      });

      // Os títulos entram linha a linha
      const dividir = () => {
        if (cancelado) return;
        if (reduzir) {
          mostrarTitulos();
          return;
        }
        contexto.add(() => {
          for (const titulo of todos(".split")) {
            SplitText.create(titulo, {
              type: "lines",
              mask: "lines",
              linesClass: "sl",
              autoSplit: true,
              onSplit: (partes) => {
                titulo.classList.add("is-split");
                return gsap.from(partes.lines, { yPercent: 110, duration: 1.15, ease: "expo.out", stagger: 0.09, scrollTrigger: { trigger: titulo, start: "top 85%", once: true } });
              },
            });
          }
        });
        ScrollTrigger.refresh();
      };
      void document.fonts.ready.then(dividir);

      desfazer.push(() => {
        tiques.forEach((f) => gsap.ticker.remove(f));
        telas.revert();
        contexto.revert();
        ScrollTrigger.getAll().forEach((gatilho) => gatilho.kill());
        lenis?.destroy();
      });
    })
    .catch(() => {
      mostrarTitulos();
      doc.classList.add("no-motion");
    });

  return () => {
    cancelado = true;
    desfazer.forEach((f) => f());
  };
}
