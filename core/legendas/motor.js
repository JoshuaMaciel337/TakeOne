// TakeOne — o motor das legendas animadas (core/modelos/legenda_animada.py, ADR 0004 decisão 8).
//
// window.LEGENDA traz os blocos (as palavras com o tempo e a ênfase, já agrupadas pelo Python), o estilo, as cores,
// a posição (o centro do bloco em fração da altura) e as fontes. O desenho de cada instante sai em duas etapas:
// estadoEm(t) diz o que está na tela (o bloco, quanto cada palavra já entrou, a palavra falada, a saída), com os
// números arredondados; desenhar(estado) só depende desse estado. O worker grava um quadro por instante e reaproveita
// o anterior quando o estado é o mesmo (a maior parte do tempo nada se mexe). Sem relógio: a mesma t dá o mesmo quadro.
(function () {
  "use strict";
  const L = window.LEGENDA;
  const tela = document.getElementById("tela");
  const ctx = tela.getContext("2d");
  const W = L.largura;
  const H = L.altura;
  const u = Math.min(W, H) / 100;
  const cores = Object.assign({ texto: "#ffffff", enfase: "#f5c84b", caixa: "#ff3478", neon: "#22d3ee" }, L.cores || {});

  const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
  const suave = (p) => 1 - Math.pow(1 - p, 3);
  const mola = (p) => {
    // Passa um pouco do tamanho e volta (o "pulo" de entrada)
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  };
  const r3 = (x) => Math.round(x * 1000) / 1000;

  // Quanto tempo cada palavra leva para entrar, por estilo
  const ENTRADA = { editorial: 0.2, uma_palavra: 0.16, minusculas: 0.16, pulando: 0.25, caixa_falada: 0.12, caixas: 0.22, digitacao: 0, contorno: 0.12, neon: 0.3 };
  const SAIDA = 0.08;

  function blocoEm(t) {
    for (let i = 0; i < L.blocos.length; i++) {
      const b = L.blocos[i];
      if (t >= b.inicio && t < b.fim) return i;
    }
    return -1;
  }

  /** O estado da tela no instante t: só números arredondados, para dois instantes iguais darem a mesma chave. */
  function estadoEm(t) {
    const i = blocoEm(t);
    if (i < 0) return { b: -1 };
    const bloco = L.blocos[i];
    const dur = ENTRADA[L.estilo] ?? 0.2;
    const todasDeUmaVez = L.estilo === "pulando" || L.estilo === "caixa_falada";
    const palavras = [];
    let falada = -1;
    let n = 0;
    for (const linha of bloco.linhas) {
      for (const p of linha) {
        let a;
        if (todasDeUmaVez) a = 1;
        else if (t < p.inicio) a = 0;
        else a = dur > 0 ? r3(limitar((t - p.inicio) / dur, 0, 1)) : 1;
        if (t >= p.inicio && t < Math.max(p.fim, p.inicio + 0.12)) falada = n;
        const extra = {};
        if (L.estilo === "pulando" && falada === n) extra.pulo = r3(limitar((t - p.inicio) / ENTRADA.pulando, 0, 1));
        if (L.estilo === "digitacao") {
          const letras = p.texto.length;
          const tempo = Math.max(0.08, Math.min(p.fim - p.inicio, letras * 0.06));
          extra.letras = t < p.inicio ? 0 : Math.min(letras, Math.floor(((t - p.inicio) / tempo) * letras) + 1);
        }
        if (L.estilo === "neon" && a > 0 && a < 1) a = a < 0.35 ? r3(a / 0.35) : a < 0.5 ? 0.25 : r3(a);
        palavras.push(Object.assign({ a }, extra));
        n++;
      }
    }
    const saida = r3(limitar((bloco.fim - t) / SAIDA, 0, 1));
    const estado = { b: i, p: palavras, s: saida };
    if (L.estilo === "caixa_falada" || L.estilo === "contorno" || L.estilo === "pulando") estado.f = falada;
    if (L.estilo === "caixa_falada" && falada >= 0) {
      const p = bloco.linhas.flat()[falada];
      estado.fa = r3(limitar((t - p.inicio) / ENTRADA.caixa_falada, 0, 1));
    }
    // O cursor da digitação pisca duas vezes por segundo
    if (L.estilo === "digitacao") estado.c = Math.floor(t * 4) % 2;
    return estado;
  }

  // -----------------------------------------------
  // Fonte, tamanho e texto de cada palavra, por estilo
  // -----------------------------------------------
  function aparencia(p) {
    const e = p.enfase;
    switch (L.estilo) {
      case "editorial":
        return e
          ? { fonte: `italic 500 ${8.6 * u}px "Playfair Display"`, texto: p.texto.toLowerCase(), cor: cores.enfase, largura: 1, altura: 9.4 * u }
          : { fonte: `400 ${7.4 * u}px "DM Serif Display"`, texto: p.texto.toUpperCase(), cor: cores.texto, largura: 0.84, altura: 7.0 * u };
      case "uma_palavra":
        return { fonte: `800 ${(e ? 6.6 : 5.6) * u}px Montserrat`, texto: p.texto.toUpperCase(), cor: e ? cores.enfase : cores.texto, largura: 1, altura: 6.4 * u };
      case "minusculas":
        return { fonte: `700 ${(e ? 6 : 5.2) * u}px Montserrat`, texto: p.texto.toLowerCase(), cor: e ? cores.enfase : cores.texto, largura: 1, altura: 6 * u };
      case "pulando":
      case "caixa_falada":
        return { fonte: `800 ${5.2 * u}px Montserrat`, texto: p.texto.toUpperCase(), cor: e ? cores.enfase : cores.texto, largura: 1, altura: 6.6 * u };
      case "caixas":
        return { fonte: `400 ${5.4 * u}px "Archivo Black"`, texto: p.texto.toUpperCase(), cor: "#ffffff", largura: 1, altura: 8.2 * u };
      case "digitacao":
        return { fonte: `700 ${4.6 * u}px "Space Mono"`, texto: p.texto, cor: e ? cores.enfase : cores.texto, largura: 1, altura: 6.2 * u };
      case "contorno":
        return { fonte: `400 ${7.2 * u}px Anton`, texto: p.texto.toUpperCase(), cor: e ? cores.enfase : cores.texto, largura: 1, altura: 8 * u };
      case "neon":
        return { fonte: `800 ${5.4 * u}px Montserrat`, texto: p.texto.toUpperCase(), cor: "#ffffff", brilho: e ? cores.caixa : cores.neon, largura: 1, altura: 6.8 * u };
      default:
        return { fonte: `700 ${5 * u}px Montserrat`, texto: p.texto, cor: cores.texto, largura: 1, altura: 6 * u };
    }
  }

  /** As posições de cada palavra do bloco (o meio de cada uma), com as linhas centradas na altura pedida. */
  function disposicao(bloco) {
    const espaco = L.estilo === "caixas" ? 1.6 * u : 1.4 * u;
    const linhas = bloco.linhas.map((linha) => {
      const itens = linha.map((p) => {
        const ap = aparencia(p);
        ctx.font = ap.fonte;
        const largura = ctx.measureText(ap.texto).width * ap.largura + (L.estilo === "caixas" ? 3 * u : 0);
        return { p, ap, largura };
      });
      const total = itens.reduce((s, it) => s + it.largura, 0) + espaco * (itens.length - 1);
      const altura = Math.max(...itens.map((it) => it.ap.altura));
      return { itens, total, altura };
    });
    const alturaTotal = linhas.reduce((s, l) => s + l.altura, 0);
    let y = L.posicao * H - alturaTotal / 2;
    const saida = [];
    for (const linha of linhas) {
      let x = W / 2 - linha.total / 2;
      for (const it of linha.itens) {
        saida.push({ ...it, x: x + it.largura / 2, y: y + linha.altura / 2 });
        x += it.largura + espaco;
      }
      y += linha.altura;
    }
    return saida;
  }

  function caixaArredondada(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const CORES_DAS_CAIXAS = () => [cores.caixa, cores.enfase, "#2f80ff", "#111111"];

  function desenhar(estado) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (estado.b < 0) return;
    const bloco = L.blocos[estado.b];
    const itens = disposicao(bloco);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // A caixa escura atrás das linhas da digitação
    if (L.estilo === "digitacao") {
      const xs = itens.map((it) => [it.x - it.largura / 2, it.x + it.largura / 2]);
      const esquerda = Math.min(...xs.map((v) => v[0])) - 2.5 * u;
      const direita = Math.max(...xs.map((v) => v[1])) + 2.5 * u;
      const topo = Math.min(...itens.map((it) => it.y - it.ap.altura / 2)) - 1.5 * u;
      const base = Math.max(...itens.map((it) => it.y + it.ap.altura / 2)) + 1.5 * u;
      ctx.globalAlpha = 0.62 * estado.s;
      ctx.fillStyle = "#000000";
      caixaArredondada(esquerda, topo, direita - esquerda, base - topo, 1.6 * u);
      ctx.fill();
    }
    itens.forEach((it, n) => {
      const st = estado.p[n];
      if (!st || st.a <= 0) return;
      const { ap } = it;
      let alfa = estado.s;
      let escala = 1;
      let dy = 0;
      let giro = 0;
      let desfoque = 0;
      const a = st.a;
      switch (L.estilo) {
        case "editorial":
          alfa *= suave(a);
          dy = (1 - suave(a)) * 0.25 * ap.altura;
          escala = 0.94 + 0.06 * suave(a);
          if (it.p.enfase) desfoque = (1 - suave(a)) * 0.8 * u;
          break;
        case "uma_palavra":
        case "contorno":
          alfa *= limitar(a * 3, 0, 1);
          escala = 0.6 + 0.4 * mola(a);
          break;
        case "minusculas":
          alfa *= suave(a);
          dy = (1 - suave(a)) * 0.3 * ap.altura;
          break;
        case "pulando":
          if (estado.f === n && st.pulo !== undefined) dy = -Math.sin(Math.PI * st.pulo) * 0.32 * ap.altura;
          break;
        case "caixas":
          alfa *= limitar(a * 2.5, 0, 1);
          escala = 0.5 + 0.5 * mola(a);
          giro = ((n % 2 ? 1 : -1) * 3 + (1 - a) * -10) * (Math.PI / 180);
          break;
        case "neon":
          alfa *= a;
          break;
        default:
          alfa *= a;
      }
      ctx.save();
      ctx.globalAlpha = limitar(alfa, 0, 1);
      ctx.translate(it.x, it.y + dy);
      ctx.rotate(giro);
      ctx.scale(escala * ap.largura, escala);
      ctx.font = ap.fonte;
      if (desfoque > 0.05) ctx.filter = `blur(${desfoque.toFixed(2)}px)`;
      const falada = estado.f === n;
      if (L.estilo === "caixa_falada" && falada) {
        const larg = it.largura + 2.4 * u;
        const alt = ap.altura * 0.92;
        const k = 0.7 + 0.3 * mola(estado.fa ?? 1);
        ctx.save();
        ctx.scale(k, k);
        ctx.fillStyle = cores.caixa;
        caixaArredondada(-larg / 2, -alt / 2, larg, alt, 1.2 * u);
        ctx.fill();
        ctx.restore();
      }
      if (L.estilo === "caixas") {
        const larg = it.largura;
        const alt = ap.altura * 0.92;
        const cor = CORES_DAS_CAIXAS()[n % 4];
        ctx.fillStyle = cor;
        caixaArredondada(-larg / 2, -alt / 2, larg, alt, 1 * u);
        ctx.fill();
        ctx.fillStyle = cor === "#ffffff" || cor === cores.enfase ? "#111111" : "#ffffff";
        ctx.fillText(ap.texto, 0, 0.04 * ap.altura);
        ctx.restore();
        return;
      }
      let texto = ap.texto;
      if (L.estilo === "digitacao") texto = texto.slice(0, st.letras ?? texto.length);
      if (L.estilo === "contorno") {
        ctx.lineJoin = "round";
        ctx.lineWidth = 1.1 * u;
        ctx.strokeStyle = "#000000";
        ctx.strokeText(texto, 0, 0);
        ctx.fillStyle = falada ? cores.enfase : ap.cor;
        ctx.fillText(texto, 0, 0);
        ctx.restore();
        return;
      }
      if (L.estilo === "neon") {
        ctx.shadowColor = ap.brilho;
        ctx.shadowBlur = 3 * u;
        ctx.fillStyle = ap.cor;
        ctx.fillText(texto, 0, 0);
        ctx.shadowBlur = 1.2 * u;
        ctx.fillText(texto, 0, 0);
        ctx.restore();
        return;
      }
      // A sombra que deixa a letra legível sobre qualquer imagem
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 1.2 * u;
      ctx.shadowOffsetY = 0.25 * u;
      let cor = ap.cor;
      if (L.estilo === "pulando" && falada) cor = cores.enfase;
      ctx.fillStyle = cor;
      if (L.estilo === "digitacao") {
        ctx.textAlign = "left";
        const inicio = -it.largura / 2;
        ctx.fillText(texto, inicio, 0);
        // O cursor depois da última letra da palavra que está sendo digitada
        const ultima = estado.p.findLastIndex((x) => (x.letras ?? 0) > 0);
        if (ultima === n && estado.c === 0) {
          const largura = ctx.measureText(texto).width;
          ctx.fillRect(inicio + largura + 0.3 * u, -0.45 * ap.altura, 0.5 * u, 0.9 * ap.altura);
        }
      } else {
        ctx.fillText(texto, 0, 0);
      }
      ctx.restore();
    });
  }

  /** As linhas da tela em que a legenda pode desenhar (todos os blocos, com folga para o pulo, a mola e o brilho): o
   * worker só fotografa essa faixa. */
  window.faixaDaLegenda = () => {
    let topo = H;
    let base = 0;
    let maior = 0;
    for (const bloco of L.blocos) {
      for (const it of disposicao(bloco)) {
        topo = Math.min(topo, it.y - it.ap.altura / 2);
        base = Math.max(base, it.y + it.ap.altura / 2);
        maior = Math.max(maior, it.ap.altura);
      }
    }
    if (base <= topo) return [0, Math.min(H, 2)];
    const folga = Math.max(8 * u, 0.6 * maior);
    return [Math.max(0, Math.floor((topo - folga) / 2) * 2), Math.min(H, Math.ceil((base + folga) / 2) * 2)];
  };
  window.estadoEm = (t) => JSON.stringify(estadoEm(t));
  window.renderAt = (t) => desenhar(estadoEm(t));
  window.prontoParaGravar = Promise.all(
    (L.fontes || []).map((f) => {
      const face = new FontFace(f.familia, `url('${f.url}')`, { style: f.estilo || "normal", weight: f.peso || "100 900" });
      document.fonts.add(face);
      return face.load();
    }),
  );
})();
