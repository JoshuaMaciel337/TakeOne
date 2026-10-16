// -----------------------------------------------
// TakeOne — o que todo modelo de animação pode usar (window.TO)
//
// Regra de ouro: cada quadro depende só do tempo t (em segundos). Nada de relógio, Math.random ou estado
// guardado entre quadros: o worker pede os quadros fora de ordem e o mesmo t tem que dar a mesma imagem.
// A página recebe do servidor window.CAMPOS (os campos do modelo), window.QUADRO ({largura, altura, u})
// e window.DURACAO (em segundos). Modelos em Canvas definem window.renderAt(t).
// -----------------------------------------------
(function () {
  "use strict";
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  /** Quanto do trecho [a, b] já passou, de 0 a 1. */
  const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

  const ease = {
    linear: (k) => k,
    inQuad: (k) => k * k,
    outQuad: (k) => 1 - (1 - k) * (1 - k),
    inOutQuad: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
    inCubic: (k) => k * k * k,
    outCubic: (k) => 1 - Math.pow(1 - k, 3),
    inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    outQuart: (k) => 1 - Math.pow(1 - k, 4),
    outExpo: (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k)),
    inExpo: (k) => (k <= 0 ? 0 : Math.pow(2, 10 * k - 10)),
    inOutExpo: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? Math.pow(2, 20 * k - 10) / 2 : (2 - Math.pow(2, -20 * k + 10)) / 2),
    outBack: (k, s = 1.70158) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
    inBack: (k, s = 1.70158) => (s + 1) * k * k * k - s * k * k,
    outElastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    outSine: (k) => Math.sin((k * Math.PI) / 2),
    inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  };

  /** Mola fechada (sem estado): 0 → 1, com amortecimento z (0,1 a 1) e frequência f (Hz). */
  function spring(t, z = 0.6, f = 2.2) {
    if (t <= 0) return 0;
    const w = 2 * Math.PI * f;
    if (z >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  }

  /** Sorteio com semente (mulberry32): o mesmo número de semente dá sempre a mesma sequência. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Um número "aleatório" fixo por índice, sem guardar estado. */
  function hash(i, seed = 7) {
    return rng((i * 2654435761 + seed * 97) >>> 0)();
  }
  /** Ruído 1D suave (valor interpolado), estável para o mesmo x. */
  function noise(x, seed = 1) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
  }

  /** Envelope de entrada e saída: sobe em `entra` s, fica, e desce nos últimos `sai` s da duração. */
  function envelope(t, entra = 0.5, sai = 0.5, dur = window.DURACAO || 4) {
    return Math.min(prog(t, 0, entra), 1 - prog(t, dur - sai, dur));
  }

  function hex(h) {
    const v = parseInt(String(h).replace("#", ""), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(h, a = 1) {
    const [r, g, b] = hex(h);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(h1, h2, k) {
    const a = hex(h1);
    const b = hex(h2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(",")})`;
  }

  /** Um canvas do tamanho do quadro, por cima da página, e o contexto 2D dele. */
  function canvas2d(id = "tela") {
    let c = document.getElementById(id);
    if (!c) {
      c = document.createElement("canvas");
      c.id = id;
      c.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
      document.body.appendChild(c);
    }
    c.width = window.QUADRO.largura;
    c.height = window.QUADRO.altura;
    return c.getContext("2d");
  }

  /** Fonte de canvas em unidades u (1 u = 1% do lado menor). */
  function fonte(peso, tamanhoU, familia = "Inter") {
    return `${peso} ${tamanhoU * window.QUADRO.u}px ${familia}, sans-serif`;
  }

  /** Diminui o tamanho até o texto caber na largura (em px); devolve o tamanho em u. */
  function caber(ctx, texto, peso, tamanhoU, larguraMax, familia = "Inter") {
    let tam = tamanhoU;
    ctx.font = fonte(peso, tam, familia);
    while (tam > 2 && ctx.measureText(texto).width > larguraMax) {
      tam *= 0.94;
      ctx.font = fonte(peso, tam, familia);
    }
    return tam;
  }

  /** Quebra o texto em linhas que cabem na largura (px). */
  function quebrar(ctx, texto, larguraMax) {
    const palavras = String(texto).split(/\s+/).filter(Boolean);
    const linhas = [];
    let atual = "";
    for (const p of palavras) {
      const tentativa = atual ? `${atual} ${p}` : p;
      if (ctx.measureText(tentativa).width > larguraMax && atual) {
        linhas.push(atual);
        atual = p;
      } else atual = tentativa;
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  /** Retângulo de cantos redondos (caminho, sem preencher). */
  function retangulo(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Degradê linear entre as cores de destaque do modelo. */
  function degrade(ctx, x0, y0, x1, y1, c1 = window.CAMPOS.cor_1, c2 = window.CAMPOS.cor_2) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, c1 || "#ff624a");
    g.addColorStop(1, c2 || "#ff3478");
    return g;
  }

  /** Um carimbo de brilho (círculo com borda suave) desenhado uma vez, para usar com drawImage. */
  const carimbos = {};
  function brilho(cor, raio = 64) {
    const chave = cor + raio;
    if (!carimbos[chave]) {
      const c = document.createElement("canvas");
      c.width = c.height = raio * 2;
      const x = c.getContext("2d");
      const g = x.createRadialGradient(raio, raio, 0, raio, raio, raio);
      g.addColorStop(0, rgba(cor, 1));
      g.addColorStop(0.25, rgba(cor, 0.55));
      g.addColorStop(1, rgba(cor, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, raio * 2, raio * 2);
      carimbos[chave] = c;
    }
    return carimbos[chave];
  }

  // As fontes do canvas só carregam quando alguém pede: o worker espera este pedido antes do 1º quadro
  const carregado = document.fonts
    ? Promise.all(
        ["400", "500", "600", "700", "800", "900"].map((p) => document.fonts.load(`${p} 40px Inter`)).concat([
          document.fonts.load("900 40px Montserrat"),
          document.fonts.load("700 40px Montserrat"),
          document.fonts.load("600 40px Caveat"),
        ]),
      ).catch(() => undefined)
    : Promise.resolve();

  window.TO = {
    clamp, lerp, prog, ease, spring, rng, hash, noise, envelope, hex, rgba, mix,
    canvas2d, fonte, caber, quebrar, retangulo, degrade, brilho, carregado,
  };
})();
