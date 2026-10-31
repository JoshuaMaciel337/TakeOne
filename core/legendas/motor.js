// TakeOne — o motor das legendas animadas (core/modelos/legenda_animada.py, ADR 0004 decisão 8 e 14.11).
//
// window.LEGENDA traz os blocos (as palavras com o tempo, a ênfase e o papel, já agrupadas pelo Python), a receita do
// estilo (core/legendas/estilos.json), as cores, a posição (o centro do bloco em fração da altura) e as fontes. O
// desenho de cada instante sai em duas etapas: estadoEm(t) diz o que está na tela (o bloco, quanto cada palavra já
// entrou, a palavra falada, a saída), com os números arredondados; desenhar(estado) só depende desse estado. O worker
// grava um quadro por instante e reaproveita o anterior quando o estado é o mesmo (a maior parte do tempo nada se
// mexe). Sem relógio: a mesma t dá o mesmo quadro.
(function () {
  "use strict";
  const L = window.LEGENDA;
  const R = L.receita;
  const tela = document.getElementById("tela");
  const ctx = tela.getContext("2d");
  const W = L.largura;
  const H = L.altura;
  const u = Math.min(W, H) / 100;
  const cores = Object.assign({ texto: "#ffffff", enfase: "#f5c84b", caixa: "#ff3478", neon: "#22d3ee" }, L.cores || {});
  /** Uma cor da receita: o nome de uma das cores do pedido, ou um hexadecimal. */
  const cor = (nome) => cores[nome] ?? nome;

  const limitar = (x, a, b) => Math.min(b, Math.max(a, x));
  const suave = (p) => 1 - Math.pow(1 - p, 3);
  const mola = (p) => {
    // Passa um pouco do tamanho e volta (o "pulo" de entrada)
    const c = 1.7;
    return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  };
  const r3 = (x) => Math.round(x * 1000) / 1000;

  const ENTRADA = Object.assign({ dur: 0.2, alfa: "linear", curva: "suave", escala: 1, sobe: 0, desce: 0, lado: 0, giro: 0, giro_alterna: 0, desfoque: 0, desfoque_enfase: 0 }, R.entrada || {});
  const FALADA = R.falada || null;
  const SAIDA = 0.08;
  const DUR_DO_PULO = 0.25;
  const DUR_DA_CAIXA = 0.12;
  const DUR_DA_CONTAGEM = 0.7;

  function blocoEm(t) {
    for (let i = 0; i < L.blocos.length; i++) {
      const b = L.blocos[i];
      if (t >= b.inicio && t < b.fim) return i;
    }
    return -1;
  }

  // -----------------------------------------------
  // Números que contam: "30", "1.500", "2,5", "R$100" e "50%" contam de zero até o valor, com o mesmo jeito de escrever
  // -----------------------------------------------
  const NUMERO = /^(\D*?)(\d[\d.]*(?:,\d+)?)(\D*)$/;
  function numeroDe(texto) {
    const achado = NUMERO.exec(texto);
    if (!achado) return null;
    const [, antes, corpo, depois] = achado;
    const decimais = corpo.includes(",") ? corpo.split(",")[1].length : 0;
    const valor = Number(corpo.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor)) return null;
    return { antes, depois, valor, decimais, milhar: /\d\.\d{3}/.test(corpo) };
  }
  function numeroEscrito(n, fracao) {
    const v = n.valor * fracao;
    let corpo = v.toFixed(n.decimais).replace(".", ",");
    if (n.milhar) {
      const [inteiro, resto] = corpo.split(",");
      corpo = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (resto !== undefined ? "," + resto : "");
    }
    return n.antes + corpo + n.depois;
  }

  /** O estado da tela no instante t: só números arredondados, para dois instantes iguais darem a mesma chave. */
  function estadoEm(t) {
    const i = blocoEm(t);
    if (i < 0) return { b: -1 };
    const bloco = L.blocos[i];
    const dur = ENTRADA.dur;
    const palavras = [];
    let falada = -1;
    let n = 0;
    for (const linha of bloco.linhas) {
      for (const p of linha) {
        let a;
        if (R.todas) a = 1;
        else if (t < p.inicio) a = 0;
        else a = dur > 0 ? r3(limitar((t - p.inicio) / dur, 0, 1)) : 1;
        if (t >= p.inicio && t < Math.max(p.fim, p.inicio + 0.12)) falada = n;
        const extra = {};
        if (FALADA && FALADA.pulo && falada === n) extra.pulo = r3(limitar((t - p.inicio) / DUR_DO_PULO, 0, 1));
        if (R.digitar) {
          const letras = p.texto.length;
          const tempo = Math.max(0.08, Math.min(p.fim - p.inicio, letras * 0.06));
          extra.letras = t < p.inicio ? 0 : Math.min(letras, Math.floor(((t - p.inicio) / tempo) * letras) + 1);
        }
        if (R.letra_a_letra) {
          const tempo = Math.max(0.12, Math.min(p.fim - p.inicio, p.texto.length * 0.05));
          extra.l = t < p.inicio ? 0 : r3(limitar((t - p.inicio) / tempo, 0, 1));
        }
        if (ENTRADA.tremula && a > 0 && a < 1) a = a < 0.35 ? r3(a / 0.35) : a < 0.5 ? 0.25 : r3(a);
        if (R.numero && R.numero.conta && p.papel === "numero") extra.k = t < p.inicio ? 0 : r3(limitar((t - p.inicio) / DUR_DA_CONTAGEM, 0, 1));
        if (FALADA && FALADA.karaoke) extra.kp = t < p.inicio ? 0 : r3(limitar((t - p.inicio) / Math.max(0.08, p.fim - p.inicio), 0, 1));
        if (FALADA && FALADA.apagadas !== undefined) extra.d = t >= p.inicio ? 1 : 0;
        palavras.push(Object.assign({ a }, extra));
        n++;
      }
    }
    const saida = r3(limitar((bloco.fim - t) / SAIDA, 0, 1));
    const estado = { b: i, p: palavras, s: saida };
    if (FALADA || R.contorno) estado.f = falada;
    if (FALADA && (FALADA.caixa || FALADA.marca || FALADA.sublinhado || FALADA.escala) && falada >= 0) {
      const p = bloco.linhas.flat()[falada];
      const durDoDestaque = FALADA.caixa ? DUR_DA_CAIXA : Math.max(0.1, p.fim - p.inicio);
      estado.fa = r3(limitar((t - p.inicio) / durDoDestaque, 0, 1));
    }
    // O cursor da digitação pisca duas vezes por segundo
    if (R.digitar) estado.c = Math.floor(t * 4) % 2;
    // A falha digital treme em degraus de 1/30 s
    if (R.glitch) estado.g = Math.floor(t * 30) % 4;
    return estado;
  }

  // -----------------------------------------------
  // Fonte, tamanho, texto e cor de cada palavra, pela receita e pelo papel dela
  // -----------------------------------------------
  const BASE = Object.assign({ familia: "Montserrat", peso: 800, tam: 5.2, caixa: "alta", largura: 1, altura: 6.6, italico: false, cor: "texto" }, R.base || {});
  const ENFASE = Object.assign({}, BASE, { cor: "enfase" }, R.enfase || {});
  const CONECTIVO = Object.assign({}, BASE, R.conectivo || {});
  const NUMERO_DA_RECEITA = Object.assign({}, BASE, R.numero || {});

  function aparencia(p) {
    const r = p.papel === "numero" && R.numero ? NUMERO_DA_RECEITA : p.enfase ? ENFASE : p.papel === "conectivo" && R.conectivo ? CONECTIVO : BASE;
    const texto = r.caixa === "alta" ? p.texto.toUpperCase() : r.caixa === "baixa" ? p.texto.toLowerCase() : p.texto;
    const familia = /\s/.test(r.familia) ? `"${r.familia}"` : r.familia;
    return {
      fonte: `${r.italico ? "italic " : ""}${r.peso} ${r.tam * u}px ${familia}`,
      texto,
      cor: cor(r.cor),
      largura: r.largura,
      altura: r.altura * u,
      numero: r === NUMERO_DA_RECEITA && R.numero.conta ? numeroDe(texto) : null,
    };
  }

  /** As posições de cada palavra do bloco (o meio de cada uma), com as linhas no alinhamento da receita e centradas
   * na altura pedida. */
  function disposicao(bloco) {
    const espaco = (R.espaco ?? 1.4) * u;
    const extra = (R.largura_extra ?? 0) * u;
    const linhas = bloco.linhas.map((linha) => {
      const itens = linha.map((p) => {
        const ap = aparencia(p);
        ctx.font = ap.fonte;
        const largura = ctx.measureText(ap.texto).width * ap.largura + extra;
        return { p, ap, largura };
      });
      const total = itens.reduce((s, it) => s + it.largura, 0) + espaco * (itens.length - 1);
      const altura = Math.max(...itens.map((it) => it.ap.altura));
      return { itens, total, altura };
    });
    const alturaTotal = linhas.reduce((s, l) => s + l.altura, 0);
    let y = L.posicao * H - alturaTotal / 2;
    const saida = [];
    linhas.forEach((linha, j) => {
      let x = W / 2 - linha.total / 2;
      if (R.alinhamento === "desencontrado" && linhas.length > 1) x += (j % 2 ? 1 : -1) * Math.max(0, Math.min(W * 0.07, (W * 0.92 - linha.total) / 2));
      for (const it of linha.itens) {
        saida.push({ ...it, x: x + it.largura / 2, y: y + linha.altura / 2, linha: j });
        x += it.largura + espaco;
      }
      y += linha.altura;
    });
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

  /** O retângulo das palavras (todas, ou só as de uma linha). */
  function extensao(itens) {
    return {
      esquerda: Math.min(...itens.map((it) => it.x - it.largura / 2)),
      direita: Math.max(...itens.map((it) => it.x + it.largura / 2)),
      topo: Math.min(...itens.map((it) => it.y - it.ap.altura / 2)),
      base: Math.max(...itens.map((it) => it.y + it.ap.altura / 2)),
    };
  }

  /** O fundo atrás do bloco inteiro, de cada linha ou de lado a lado (o das palavras sai com cada palavra). */
  function desenharFundo(itens, estado) {
    const f = R.fundo;
    if (!f || f.tipo === "palavras") return;
    if (f.visiveis) itens = itens.filter((_, n) => (estado.p[n]?.a ?? 0) > 0);
    if (!itens.length) return;
    const [fx, fy] = (f.folga || [2.5, 1.5]).map((v) => v * u);
    ctx.globalAlpha = (f.alfa ?? 1) * estado.s;
    ctx.fillStyle = cor(f.cor || "#000000");
    const grupos = f.tipo === "linhas" ? [...new Set(itens.map((it) => it.linha))].map((j) => itens.filter((it) => it.linha === j)) : [itens];
    for (const grupo of grupos) {
      const e = extensao(grupo);
      if (f.tipo === "faixa") {
        ctx.fillRect(0, e.topo - fy, W, e.base - e.topo + 2 * fy);
        continue;
      }
      caixaArredondada(e.esquerda - fx, e.topo - fy, e.direita - e.esquerda + 2 * fx, e.base - e.topo + 2 * fy, (f.raio ?? 1.6) * u);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** O preenchimento do texto: a cor, ou o degradê de lado a lado da palavra. */
  function tinta(corDaPalavra, largura) {
    if (!R.gradiente) return corDaPalavra;
    const g = ctx.createLinearGradient(-largura / 2, 0, largura / 2, 0);
    g.addColorStop(0, cor(R.gradiente[0]));
    g.addColorStop(1, cor(R.gradiente[1]));
    return g;
  }

  /** O texto letra a letra: cada letra aparece com a fração dela da entrada (e sobe um pouco, se a receita sobe). */
  function letraALetra(texto, largura, l, altura) {
    ctx.textAlign = "left";
    const inicio = -largura / 2;
    const n = texto.length;
    for (let i = 0; i < n; i++) {
      const fracao = limitar(l * n - i, 0, 1);
      if (fracao <= 0) break;
      const x = inicio + ctx.measureText(texto.slice(0, i)).width;
      ctx.save();
      ctx.globalAlpha *= suave(fracao);
      ctx.fillText(texto[i], x, (1 - suave(fracao)) * (ENTRADA.sobe || 0) * altura);
      ctx.restore();
    }
  }

  const SOMBRA = R.sombra === undefined ? true : R.sombra;

  function desenhar(estado) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (estado.b < 0) return;
    const bloco = L.blocos[estado.b];
    const itens = disposicao(bloco);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    desenharFundo(itens, estado);
    itens.forEach((it, n) => {
      const st = estado.p[n];
      if (!st || st.a <= 0) return;
      const { ap } = it;
      const a = st.a;
      const curva = ENTRADA.curva === "mola" ? mola(a) : suave(a);
      let alfa = estado.s;
      if (ENTRADA.alfa === "suave") alfa *= suave(a);
      else if (typeof ENTRADA.alfa === "number") alfa *= limitar(a * ENTRADA.alfa, 0, 1);
      else alfa *= a;
      let escala = ENTRADA.escala !== 1 ? ENTRADA.escala + (1 - ENTRADA.escala) * curva : 1;
      let dy = 0;
      let dx = 0;
      if (ENTRADA.sobe && !R.letra_a_letra) dy += (1 - curva) * ENTRADA.sobe * ap.altura;
      if (ENTRADA.desce) dy -= (1 - curva) * ENTRADA.desce * ap.altura;
      if (ENTRADA.lado) dx -= (1 - curva) * ENTRADA.lado * u;
      const giro = ((ENTRADA.giro_alterna ? (n % 2 ? 1 : -1) * ENTRADA.giro_alterna : 0) + (1 - a) * ENTRADA.giro) * (Math.PI / 180);
      let desfoque = (1 - suave(a)) * ENTRADA.desfoque * u;
      if (it.p.enfase && ENTRADA.desfoque_enfase) desfoque = (1 - suave(a)) * ENTRADA.desfoque_enfase * u;
      const falada = estado.f === n;
      if (FALADA && FALADA.pulo && falada && st.pulo !== undefined) dy = -Math.sin(Math.PI * st.pulo) * FALADA.pulo * ap.altura;
      if (FALADA && FALADA.escala && falada) escala *= 1 + (FALADA.escala - 1) * suave(Math.min(1, (estado.fa ?? 1) * 3));
      if (FALADA && FALADA.apagadas !== undefined && !st.d) alfa *= FALADA.apagadas;
      ctx.save();
      ctx.globalAlpha = limitar(alfa, 0, 1);
      ctx.translate(it.x + dx, it.y + dy);
      ctx.rotate(giro);
      ctx.scale(escala * ap.largura, escala);
      ctx.font = ap.fonte;
      if (desfoque > 0.05) ctx.filter = `blur(${desfoque.toFixed(2)}px)`;
      const larguraDoTexto = it.largura - (R.largura_extra ?? 0) * u;
      if (FALADA && FALADA.caixa && falada) {
        const larg = it.largura + 2.4 * u;
        const alt = ap.altura * 0.92;
        const k = 0.7 + 0.3 * mola(estado.fa ?? 1);
        ctx.save();
        ctx.scale(k, k);
        ctx.fillStyle = cor(FALADA.caixa);
        caixaArredondada(-larg / 2, -alt / 2, larg, alt, 1.2 * u);
        ctx.fill();
        ctx.restore();
      }
      // O marca-texto cresce da esquerda enquanto a palavra é dita; a letra muda de cor só onde ele já passou
      const marca = FALADA && FALADA.marca && falada ? { x: -larguraDoTexto / 2 - 0.8 * u, y: -0.34 * ap.altura, w: (larguraDoTexto + 1.6 * u) * suave(estado.fa ?? 1), h: 0.7 * ap.altura } : null;
      if (marca) {
        ctx.save();
        ctx.globalAlpha *= 0.9;
        ctx.fillStyle = cor(FALADA.marca);
        caixaArredondada(marca.x, marca.y, marca.w, marca.h, 0.5 * u);
        ctx.fill();
        ctx.restore();
      }
      if (R.fundo && R.fundo.tipo === "palavras") {
        const larg = it.largura;
        const alt = ap.altura * 0.92;
        const lista = R.fundo.cores.map(cor);
        const indice = R.fundo.ciclo === "bloco" ? estado.b + n : n;
        const corDaCaixa = it.p.enfase && R.fundo.cor_enfase ? cor(R.fundo.cor_enfase) : lista[indice % lista.length];
        ctx.fillStyle = corDaCaixa;
        caixaArredondada(-larg / 2, -alt / 2, larg, alt, (R.fundo.raio ?? 1) * u);
        ctx.fill();
        ctx.fillStyle = corDaCaixa === "#ffffff" || corDaCaixa === cores.enfase ? "#111111" : ap.cor;
        ctx.fillText(ap.texto, 0, (R.texto_dy ?? 0) * ap.altura);
        ctx.restore();
        return;
      }
      let texto = ap.texto;
      if (R.digitar) texto = texto.slice(0, st.letras ?? texto.length);
      if (ap.numero && st.k !== undefined) texto = numeroEscrito(ap.numero, suave(st.k));
      let corDoTexto = ap.cor;
      if (FALADA && FALADA.cor && falada) corDoTexto = cor(FALADA.cor);
      /** O texto pintado: digitado com o cursor, letra a letra, com a cor do karaokê ou inteiro. */
      const preencher = () => {
        if (R.digitar) {
          ctx.textAlign = "left";
          const inicio = -it.largura / 2;
          ctx.fillText(texto, inicio, 0);
          // O cursor depois da última letra da palavra que está sendo digitada
          const ultima = estado.p.findLastIndex((x) => (x.letras ?? 0) > 0);
          if (ultima === n && estado.c === 0) {
            const largura = ctx.measureText(texto).width;
            ctx.fillRect(inicio + largura + 0.3 * u, -0.45 * ap.altura, 0.5 * u, 0.9 * ap.altura);
          }
        } else if (R.letra_a_letra) {
          letraALetra(texto, larguraDoTexto, st.l ?? 1, ap.altura);
        } else if (FALADA && FALADA.karaoke) {
          // A cor vai preenchendo a palavra da esquerda para a direita enquanto ela é dita
          ctx.fillText(texto, 0, 0);
          if (st.kp > 0) {
            ctx.save();
            ctx.shadowColor = "transparent";
            ctx.beginPath();
            ctx.rect(-larguraDoTexto / 2 - u, -ap.altura, (larguraDoTexto + u) * st.kp + u, 2 * ap.altura);
            ctx.clip();
            ctx.fillStyle = cor(FALADA.karaoke);
            ctx.fillText(texto, 0, 0);
            ctx.restore();
          }
        } else {
          ctx.fillText(texto, 0, 0);
        }
      };
      if (R.contorno) {
        ctx.lineJoin = "round";
        ctx.lineWidth = R.contorno.largura * u;
        ctx.strokeStyle = cor(R.contorno.cor);
        if (SOMBRA && SOMBRA.dura) {
          ctx.save();
          ctx.fillStyle = cor(SOMBRA.cor);
          ctx.strokeStyle = cor(SOMBRA.cor);
          ctx.strokeText(texto, SOMBRA.dura[0] * u, SOMBRA.dura[1] * u);
          ctx.fillText(texto, SOMBRA.dura[0] * u, SOMBRA.dura[1] * u);
          ctx.restore();
        }
        ctx.strokeText(texto, 0, 0);
        if (!R.contorno.so || falada) {
          ctx.fillStyle = tinta(corDoTexto, larguraDoTexto);
          preencher();
        }
        ctx.restore();
        return;
      }
      if (R.brilho) {
        ctx.shadowColor = cor(it.p.enfase && R.brilho.cor_enfase ? R.brilho.cor_enfase : R.brilho.cor);
        if (R.digitar) {
          // Na digitação o brilho vai com as letras que já apareceram (o desenho de baixo)
          ctx.shadowBlur = R.brilho.raios[0] * u;
        } else {
          ctx.fillStyle = corDoTexto;
          for (const raio of R.brilho.raios) {
            ctx.shadowBlur = raio * u;
            ctx.fillText(texto, 0, 0);
          }
          ctx.restore();
          return;
        }
      } else if (SOMBRA === true) {
        // A sombra que deixa a letra legível sobre qualquer imagem
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 1.2 * u;
        ctx.shadowOffsetY = 0.25 * u;
      } else if (SOMBRA && SOMBRA.dura) {
        ctx.save();
        ctx.fillStyle = cor(SOMBRA.cor);
        ctx.fillText(texto, SOMBRA.dura[0] * u, SOMBRA.dura[1] * u);
        ctx.restore();
      }
      if (R.glitch && a < 1) {
        // O vermelho e o azul deslocados, para lados que trocam a cada degrau, somem até a palavra assentar
        const desvio = (1 - a) * 1.4 * u * (estado.g % 2 ? 1 : -1);
        ctx.save();
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = "#ff1f5a";
        ctx.fillText(texto, -desvio, (estado.g > 1 ? 0.15 : -0.15) * u);
        ctx.fillStyle = "#1fe4ff";
        ctx.fillText(texto, desvio, 0);
        ctx.restore();
      }
      ctx.fillStyle = tinta(corDoTexto, larguraDoTexto);
      preencher();
      if (marca && FALADA.cor_na_marca) {
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.beginPath();
        ctx.rect(marca.x, -ap.altura, marca.w, 2 * ap.altura);
        ctx.clip();
        ctx.fillStyle = cor(FALADA.cor_na_marca);
        ctx.fillText(texto, 0, 0);
        ctx.restore();
      }
      if (FALADA && FALADA.sublinhado && falada) {
        ctx.shadowColor = "transparent";
        ctx.fillStyle = cor(FALADA.sublinhado);
        caixaArredondada(-larguraDoTexto / 2, 0.42 * ap.altura, larguraDoTexto * suave(estado.fa ?? 1), 0.11 * ap.altura, 0.3 * u);
        ctx.fill();
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
    // A palavra que cai entra de mais longe; a que chega de perto (escala acima de 1) também passa da linha
    const extra = Math.max(ENTRADA.desce || 0, ENTRADA.escala > 1 ? (ENTRADA.escala - 1) / 2 : 0) * maior;
    const folga = Math.max(8 * u, 0.6 * maior) + extra;
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
