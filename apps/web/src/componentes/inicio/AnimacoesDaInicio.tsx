"use client";

import { useEffect } from "react";

// O movimento da página inicial, portado do script da home do kit da marca: menu, entradas ao rolar,
// legendas karaokê, cursor da linha do tempo, demonstrações dos cartões e preço mensal ou anual.
// A página é desenhada no servidor; aqui só se trocam classes, estilos e textos dela.

export function AnimacoesDaInicio() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>(".inicio");
    if (!raiz) return;
    const um = <T extends Element = HTMLElement>(seletor: string, dentro: ParentNode = raiz) => dentro.querySelector<T>(seletor);
    const todos = <T extends Element = HTMLElement>(seletor: string, dentro: ParentNode = raiz) =>
      Array.from(dentro.querySelectorAll<T>(seletor));
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desfazer: (() => void)[] = [];
    const ouvir = (alvo: EventTarget, evento: string, funcao: EventListener, opcoes?: AddEventListenerOptions) => {
      alvo.addEventListener(evento, funcao, opcoes);
      desfazer.push(() => alvo.removeEventListener(evento, funcao, opcoes));
    };
    const repetir = (funcao: () => void, ms: number) => {
      const id = window.setInterval(funcao, ms);
      desfazer.push(() => window.clearInterval(id));
    };
    const depois = (funcao: () => void, ms: number) => {
      const id = window.setTimeout(funcao, ms);
      desfazer.push(() => window.clearTimeout(id));
    };

    // Menu
    const nav = um(".nav");
    const botaoMenu = um(".menu-btn");
    ouvir(botaoMenu!, "click", () => {
      const aberto = nav!.classList.toggle("open");
      botaoMenu!.setAttribute("aria-expanded", aberto ? "true" : "false");
    });
    for (const link of todos(".mobile-menu a")) {
      ouvir(link, "click", () => {
        nav!.classList.remove("open");
        botaoMenu!.setAttribute("aria-expanded", "false");
      });
    }

    // Entradas ao rolar e demonstrações que começam quando aparecem
    const entradas = new IntersectionObserver(
      (itens) => {
        for (const item of itens) {
          if (!item.isIntersecting) continue;
          item.target.classList.add("in");
          entradas.unobserve(item.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    todos(".reveal").forEach((el) => entradas.observe(el));
    const vistas = new IntersectionObserver(
      (itens) => {
        for (const item of itens) {
          if (!item.isIntersecting) continue;
          item.target.classList.add("in-view");
          if (item.target.id === "assist") escreverPedido();
          vistas.unobserve(item.target);
        }
      },
      { threshold: 0.35 },
    );
    todos(".watch").forEach((el) => vistas.observe(el));
    desfazer.push(() => {
      entradas.disconnect();
      vistas.disconnect();
    });
    const quadro = requestAnimationFrame(() => depois(() => um(".hero")?.classList.add("loaded"), 120));
    desfazer.push(() => cancelAnimationFrame(quadro));

    // Legendas karaokê: a palavra destacada anda
    for (const legenda of todos(".kara")) {
      const palavras = todos("span", legenda);
      let atual = 0;
      palavras.forEach((palavra, indice) => palavra.classList.toggle("on", indice === 0));
      if (reduzir || palavras.length < 2) continue;
      repetir(() => {
        palavras[atual].classList.remove("on");
        atual = (atual + 1) % palavras.length;
        palavras[atual].classList.add("on");
      }, 420);
    }

    // Cursor da linha do tempo do editor desenhado
    const cursor = um("#playhead")!;
    const faixas = um("#tracks")!;
    const tempo = um("#tc")!;
    const tempoTotal = um("#tcTime")!;
    const formatar = (s: number) => {
      const inteiro = Math.floor(s);
      return `${String(Math.floor(inteiro / 60)).padStart(2, "0")}:${String(inteiro % 60).padStart(2, "0")}`;
    };
    const inicio = performance.now();
    let quadroDoCursor = 0;
    const andar = (agora: number) => {
      const fracao = ((agora - inicio) % 16000) / 16000;
      cursor.style.transform = `translateX(${(fracao * (faixas.clientWidth - 2)).toFixed(1)}px)`;
      const texto = formatar(fracao * 72);
      tempo.textContent = texto;
      tempoTotal.textContent = `${texto} / 01:12`;
      quadroDoCursor = requestAnimationFrame(andar);
    };
    if (reduzir) cursor.style.transform = `translateX(${faixas.clientWidth * 0.33}px)`;
    else quadroDoCursor = requestAnimationFrame(andar);
    desfazer.push(() => cancelAnimationFrame(quadroDoCursor));

    // "Aplicar" a sugestão de zoom
    const aplicar = um("#aiApply")!;
    ouvir(aplicar, "click", () => {
      const ligado = um("#frame")!.classList.toggle("zoomed");
      aplicar.classList.toggle("done", ligado);
      um("#zoomv")!.textContent = ligado ? "118%" : "100%";
      um("#zooms")!.style.width = ligado ? "64%" : "42%";
    });

    // Estilos de legenda
    const telefone = um("#capPhone")!;
    const estilos = todos(".cap-styles button");
    for (const botao of estilos) {
      ouvir(botao, "click", () => {
        estilos.forEach((outro) => outro.classList.toggle("on", outro === botao));
        telefone.dataset.style = botao.dataset.style;
      });
    }

    // Reenquadrar: o quadro troca de formato sozinho até a pessoa escolher um
    const caixa = um("#refBox")!;
    const formatos: Record<string, [number, number]> = { "9:16": [31.6, 40], "1:1": [56.25, 26], "4:5": [45, 30], "16:9": [100, 0] };
    const botoesFormato = todos(".ref-tabs button");
    let formatoAtual = 0;
    let escolhido = false;
    const mostrarFormato = (formato: string) => {
      caixa.style.width = `${formatos[formato][0]}%`;
      caixa.style.left = `${formatos[formato][1]}%`;
      caixa.dataset.f = formato;
      botoesFormato.forEach((botao) => botao.classList.toggle("on", botao.dataset.f === formato));
    };
    botoesFormato.forEach((botao, indice) =>
      ouvir(botao, "click", () => {
        escolhido = true;
        formatoAtual = indice;
        mostrarFormato(botao.dataset.f!);
      }),
    );
    if (!reduzir) {
      repetir(() => {
        if (escolhido) return;
        formatoAtual = (formatoAtual + 1) % botoesFormato.length;
        mostrarFormato(botoesFormato[formatoAtual].dataset.f!);
      }, 2600);
    }

    // O pedido ao assistente sendo digitado
    let escreveu = false;
    function escreverPedido() {
      if (escreveu) return;
      escreveu = true;
      const pedido = "Deixe o início mais dinâmico, coloque zoom no refrão e uma trilha animada.";
      const campo = um("#typed")!;
      const resposta = um("#aiMsg")!;
      const terminar = () => {
        um(".caret", um("#userMsg")!)!.style.display = "none";
        resposta.style.opacity = "1";
        todos("li", resposta).forEach((item, k) => depois(() => item.classList.add("show"), reduzir ? 0 : 350 + k * 420));
      };
      if (reduzir) {
        campo.textContent = pedido;
        terminar();
        return;
      }
      let letras = 0;
      const digitar = () => {
        campo.textContent = pedido.slice(0, ++letras);
        if (letras < pedido.length) depois(digitar, 22 + Math.random() * 30);
        else depois(terminar, 400);
      };
      digitar();
    }

    // Linha dos passos de "Como funciona"
    const passos = um("#steps")!;
    const progresso = um("#stepsProgress")!;
    const cadaPasso = todos(".step");
    const atualizarPassos = () => {
      const caixaPassos = passos.getBoundingClientRect();
      const marca = window.innerHeight * 0.6;
      const fracao = Math.max(0, Math.min(1, (marca - caixaPassos.top) / (caixaPassos.height - 16)));
      progresso.style.height = `${fracao * (caixaPassos.height - 16)}px`;
      cadaPasso.forEach((passo) => passo.classList.toggle("active", passo.getBoundingClientRect().top + 40 < marca));
    };

    // Mensal ou anual
    const cobranca = um("#billing")!;
    ouvir(cobranca, "click", () => {
      const anual = cobranca.getAttribute("aria-checked") !== "true";
      cobranca.setAttribute("aria-checked", anual ? "true" : "false");
      todos(".price b[data-m]").forEach((preco) => {
        preco.textContent = (anual ? preco.dataset.y : preco.dataset.m) ?? "";
      });
    });

    // Luz que segue o ponteiro nos cartões
    for (const cartao of todos(".card")) {
      ouvir(cartao, "pointermove", (evento) => {
        const { clientX, clientY } = evento as PointerEvent;
        const caixaCartao = cartao.getBoundingClientRect();
        cartao.style.setProperty("--mx", `${clientX - caixaCartao.left}px`);
        cartao.style.setProperty("--my", `${clientY - caixaCartao.top}px`);
      });
    }

    // O editor desenhado inclina um pouco seguindo o mouse
    const palco = um("#stage")!;
    const editor = um(".editor")!;
    if (!reduzir && window.matchMedia("(pointer: fine)").matches) {
      ouvir(palco, "pointermove", (evento) => {
        const { clientX, clientY } = evento as PointerEvent;
        const caixaPalco = palco.getBoundingClientRect();
        const x = (clientX - caixaPalco.left) / caixaPalco.width - 0.5;
        const y = (clientY - caixaPalco.top) / caixaPalco.height - 0.5;
        editor.style.transform = `rotateY(${(x * 4).toFixed(2)}deg) rotateX(${(-y * 4).toFixed(2)}deg)`;
      });
      ouvir(palco, "pointerleave", () => {
        editor.style.transform = "";
      });
    }

    const aoRolar = () => {
      nav!.classList.toggle("scrolled", window.scrollY > 8);
      atualizarPassos();
    };
    ouvir(window, "scroll", aoRolar, { passive: true });
    ouvir(window, "resize", atualizarPassos);
    aoRolar();

    return () => desfazer.forEach((funcao) => funcao());
  }, []);

  return null;
}
