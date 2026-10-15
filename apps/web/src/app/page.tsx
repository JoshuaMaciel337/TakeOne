import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { BotaoTema } from "@/componentes/BotaoTema";
import { AnimacoesDaInicio } from "@/componentes/inicio/AnimacoesDaInicio";
import { Icone } from "@/componentes/inicio/Icone";
import { Simbolo } from "@/componentes/Logo";

import "@/componentes/inicio/inicio.css";

// Página inicial, portada da home do kit da marca (docs/marca). O movimento fica em AnimacoesDaInicio.

/** Sorteio fixo (o mesmo do protótipo), para as ondas saírem iguais no servidor e no navegador. */
function criarSorteio() {
  let semente = 7;
  return () => {
    semente = (semente * 9301 + 49297) % 233280;
    return semente / 233280;
  };
}
const sorteio = criarSorteio();
const ONDA_DO_EDITOR = Array.from({ length: 120 }, (_, b) =>
  Math.min(96, 18 + Math.abs(Math.sin(b / 5)) * 50 + sorteio() * 30).toFixed(0),
);
const PAUSAS: [number, number][] = [
  [14, 20],
  [33, 38],
  [52, 59],
];
const ONDA_DA_FALA = Array.from({ length: 72 }, (_, s) => {
  const pausa = PAUSAS.some(([de, ate]) => s >= de && s < ate);
  return { pausa, altura: (pausa ? 6 + sorteio() * 6 : 20 + sorteio() * 75).toFixed(0) };
});

function Karaoke({ frase }: { frase: string }) {
  return (
    <div className="kara">
      {frase.split(" ").map((palavra, i) => (
        <Fragment key={i}>
          {i > 0 ? " " : null}
          <span className={i === 0 ? "on" : undefined}>{palavra}</span>
        </Fragment>
      ))}
    </div>
  );
}

function Marca({ tamanho = 30 }: { tamanho?: number }) {
  return (
    <span className="wordmark">
      <Simbolo tamanho={tamanho} />
      <span>
        Take<span className="grad-text">One</span>
      </span>
    </span>
  );
}

const FORMATOS = ["Vídeos curtos", "YouTube", "Reels", "Podcasts", "Conteúdo de marca", "Vlogs de viagem", "Aulas online", "Eventos ao vivo"];

const GALERIA = [
  { foto: "produto", tamanho: "g5", atraso: "", icone: "filme", marca: "Produto", titulo: "Conteúdo para redes sociais", texto: "Crie vídeos que engajam.", alt: "Criador filmando um relógio em estúdio" },
  { foto: "viagem", tamanho: "g4", atraso: "d1", icone: "monitor", marca: "Vlog", titulo: "Viagens e lifestyle", texto: "Reviva seus melhores momentos.", alt: "Criadora gravando a cidade ao entardecer" },
  { foto: "gastronomia", tamanho: "g3", atraso: "d2", icone: "recorte", marca: "4:5", titulo: "Gastronomia e produtos", texto: "Destaque o que torna seu conteúdo único.", alt: "Chef finalizando um prato" },
  { foto: "podcast", tamanho: "g3", atraso: "", icone: "audio", marca: "Podcast", titulo: "Podcasts e entrevistas", texto: "Transforme conversas em grandes vídeos.", alt: "Podcaster gravando em estúdio" },
  { foto: "show", tamanho: "g4", atraso: "d1", icone: "onda", marca: "Ao vivo", titulo: "Música e eventos", texto: "Capture a energia do momento.", alt: "Show com luzes rosa e público" },
  { foto: "edicao", tamanho: "g5", atraso: "d2", icone: "camadas", marca: "Multipista", titulo: "Projetos profissionais", texto: "Mais faixas, mais controle, no seu ritmo.", alt: "Editor trabalhando em dois monitores" },
] as const;

const STORIES = [
  { fundo: "ph-product", atraso: "", rotulo: "Template com filmagem de produto", barras: ["done", "run", ""], texto: "Bastidores que ", destaque: "viram conteúdo." },
  { fundo: "ph-travel", atraso: "d1", rotulo: "Template de viagem", barras: ["run", "", ""], texto: "Grandes momentos também são feitos de ", destaque: "pequenos detalhes." },
  { fundo: "ph-food", atraso: "d2", rotulo: "Template de gastronomia", barras: ["done", "done", "run"], texto: "Sabor também é uma forma de ", destaque: "contar histórias." },
  { fundo: "ph-music", atraso: "d3", rotulo: "Template de show", barras: ["done", "run"], texto: "Sinta a energia ", destaque: "do momento." },
  { fundo: "ph-podcast", atraso: "d4", rotulo: "Template de podcast", barras: ["run", "", "", ""], texto: "A melhor parte da conversa, ", destaque: "em 30 segundos." },
];

const PLANOS = [
  {
    nome: "Grátis",
    para: "Para experimentar e criar os primeiros vídeos.",
    mensal: "R$ 0",
    anual: null,
    unidade: "/mês",
    itens: ["Exportação em 720p", "Legendas automáticas", "10 templates 9:16", "5 GB de armazenamento"],
    botao: "Começar grátis",
    destaque: false,
  },
  {
    nome: "Criador",
    para: "Para quem publica toda semana.",
    mensal: "R$ 39",
    anual: "R$ 31",
    unidade: "/mês",
    itens: ["Exportação em 4K, sem marca d'água", "Assistente de IA ilimitado", "Corte inteligente e remoção de silêncios", "Todos os templates", "100 GB de armazenamento"],
    botao: "Assinar Criador",
    destaque: true,
  },
  {
    nome: "Equipe",
    para: "Para marcas, agências e produtoras.",
    mensal: "R$ 99",
    anual: "R$ 79",
    unidade: "/membro/mês",
    itens: ["Tudo do Criador", "Projetos compartilhados", "Kit de marca e templates próprios", "Comentários e aprovação"],
    botao: "Falar com vendas",
    destaque: false,
  },
];

const PERGUNTAS = [
  ["Preciso instalar alguma coisa?", "Não. O TakeOne roda direto no navegador — é só entrar, importar sua mídia e começar a editar."],
  ["A IA edita o vídeo sozinha?", "A IA faz o trabalho repetitivo — cortes, legendas, silêncios e reenquadramento — e entrega um ponto de partida. Você revisa tudo na timeline e decide o resultado final."],
  ["Serve para quem nunca editou vídeo?", "Sim. Comece pelos templates e pelas ações automáticas. Quando quiser mais controle, a timeline multipista, os keyframes e os ajustes finos estão no mesmo lugar."],
  ["Em quais formatos posso exportar?", "Vertical 9:16, quadrado 1:1, 4:5 e horizontal 16:9, com predefinições para as principais redes sociais."],
  ["Posso cancelar quando quiser?", "Sim. Você pode mudar de plano ou cancelar a qualquer momento, sem multa."],
];

const SECOES = [
  ["#recursos", "Recursos"],
  ["#como-funciona", "Como funciona"],
  ["#criadores", "Para criadores"],
  ["#planos", "Planos"],
];

export default function PaginaInicial() {
  return (
    <div className="inicio" id="top">
      <AnimacoesDaInicio />
      <header className="nav">
        <div className="wrap">
          <a className="brand" href="#top" aria-label="TakeOne — início">
            <Marca />
          </a>
          <nav className="nav-links" aria-label="Principal">
            {SECOES.map(([href, nome]) => (
              <a key={href} href={href}>
                {nome}
              </a>
            ))}
          </nav>
          <div className="nav-actions">
            <BotaoTema className="botao-tema" />
            <Link className="login" href="/entrar">
              Entrar
            </Link>
            <Link className="btn btn-primary btn-sm" href="/cadastro">
              Começar agora
            </Link>
            <button className="menu-btn" type="button" aria-label="Abrir menu" aria-expanded="false">
              <span />
            </button>
          </div>
        </div>
      </header>
      <div className="mobile-menu" aria-label="Menu">
        {SECOES.map(([href, nome]) => (
          <a key={href} href={href}>
            {nome}
          </a>
        ))}
        <Link href="/entrar">Entrar</Link>
        <Link className="btn btn-primary" href="/cadastro">
          Começar a editar <Icone nome="seta" seta />
        </Link>
      </div>

      <main>
        <section className="hero">
          <div className="hero-glow" aria-hidden />
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <div className="eyebrow reveal">
                <span className="dot" />
                Edição de vídeos com IA
              </div>
              <h1 className="reveal d1">
                <span className="line">Edite vídeos.</span>
                <span className="line grad-text">Sem complicação.</span>
              </h1>
              <p className="lead reveal d2">Do corte rápido à edição avançada, tudo no navegador com IA ao seu lado.</p>
              <div className="hero-actions reveal d3">
                <Link className="btn btn-primary" href="/cadastro">
                  Começar a editar <Icone nome="seta" seta />
                </Link>
                <a className="btn btn-ghost" href="#recursos">
                  <Icone nome="reproduzir" /> Explorar recursos
                </a>
              </div>
              <div className="trust reveal d4">
                <span>
                  <Icone nome="brilho" /> IA integrada
                </span>
                <span>
                  <Icone nome="camadas" /> Timeline multipista
                </span>
                <span>
                  <Icone nome="monitor" /> Sem instalar
                </span>
              </div>
            </div>

            <div className="editor-stage" id="stage">
              <div className="editor" role="img" aria-label="Editor do TakeOne com prévia vertical, timeline multipista e assistente de IA">
                <div className="ed-top">
                  <Simbolo tamanho={18} className="mark" />
                  <b>TakeOne</b>
                  <span className="proj">/ Chicago ao entardecer</span>
                  <span className="saved">
                    <i />
                    Salvo
                  </span>
                  <button className="ed-export" type="button" tabIndex={-1}>
                    <Icone nome="baixar" /> Exportar
                  </button>
                </div>
                <div className="ed-body">
                  <div className="ed-rail">
                    {(["filme", "legendas", "varinha", "audio", "camadas", "recorte"] as const).map((nome, i) => (
                      <span key={nome} className={i === 0 ? "on" : undefined}>
                        <Icone nome={nome} />
                      </span>
                    ))}
                  </div>
                  <div className="ed-media">
                    <div className="ed-label">
                      Mídia <span>6</span>
                    </div>
                    <div className="thumbs">
                      <i className="ph-travel sel" />
                      <i className="ph-product" />
                      <i className="ph-food" />
                      <i className="ph-music" />
                      <i className="ph-podcast" />
                      <i className="ph-editor" />
                    </div>
                    <div className="ed-import">+ Importar mídia</div>
                  </div>
                  <div className="ed-canvas">
                    <div className="frame" id="frame">
                      <div className="ph ph-travel" />
                      <span className="tc" id="tc">
                        00:24
                      </span>
                      <Karaoke frase="Cada cidade tem um ritmo. Encontre o seu." />
                    </div>
                  </div>
                  <div className="ed-props">
                    <div className="ed-label" style={{ margin: 0 }}>
                      Transformar
                    </div>
                    <div className="prop">
                      Zoom <em id="zoomv">100%</em>
                      <div className="slider">
                        <i id="zooms" style={{ width: "42%" }} />
                      </div>
                    </div>
                    <div className="prop">
                      Posição X <em>0,0</em>
                      <div className="slider">
                        <i style={{ width: "50%" }} />
                      </div>
                    </div>
                    <div className="prop">
                      Rotação <em>0°</em>
                      <div className="slider">
                        <i style={{ width: "30%" }} />
                      </div>
                    </div>
                    <div className="ai-card">
                      <b>
                        <Icone nome="brilho" /> Assistente de IA
                      </b>
                      <p>Sugestão: adicione um zoom no momento do refrão.</p>
                      <button className="ai-apply" id="aiApply" type="button">
                        <span className="aplicar">Aplicar</span>
                        <span className="feito">Aplicado ✓</span>
                        <span className="aplicar">
                          <Icone nome="seta" />
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="ed-timeline">
                  <div className="tl-bar">
                    <span className="time" id="tcTime">
                      00:24 / 01:12
                    </span>
                    <div className="ctrl">
                      <span>
                        <Icone nome="seta" />
                      </span>
                      <span className="play">
                        <Icone nome="reproduzir" />
                      </span>
                    </div>
                    <span>110%</span>
                  </div>
                  <div className="tracks" id="tracks">
                    <div className="ruler">
                      {["00:00", "00:15", "00:30", "00:45", "01:00"].map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <div className="track">
                      <span className="track-ic">
                        <Icone nome="filme" />
                      </span>
                      <i className="clip ph-travel" style={{ flex: 3 }} />
                      <i className="clip ph-music" style={{ flex: 2 }} />
                      <i className="clip ph-product" style={{ flex: 2.4 }} />
                      <i className="clip ph-food" style={{ flex: 1.6 }} />
                    </div>
                    <div className="track cap">
                      <span className="track-ic">
                        <Icone nome="legendas" />
                      </span>
                      <span className="capclip" style={{ flex: 2 }}>
                        Cada cidade tem um ritmo
                      </span>
                      <span style={{ flex: 0.3 }} />
                      <span className="capclip" style={{ flex: 1.6 }}>
                        Encontre o seu
                      </span>
                      <span style={{ flex: 0.4 }} />
                      <span className="capclip" style={{ flex: 2.2 }}>
                        Sinta a energia
                      </span>
                      <span style={{ flex: 2 }} />
                    </div>
                    <div className="track aud">
                      <span className="track-ic">
                        <Icone nome="audio" />
                      </span>
                      {ONDA_DO_EDITOR.map((altura, i) => (
                        <i key={i} style={{ height: `${altura}%` }} />
                      ))}
                    </div>
                    <div className="playhead" id="playhead" />
                  </div>
                </div>
              </div>
              <div className="float-chip chip-a" aria-hidden>
                <span className="ico">
                  <Icone nome="legendas" />
                </span>
                <div>
                  Legendas geradas<small>148 palavras · PT-BR</small>
                </div>
              </div>
              <div className="float-chip chip-b" aria-hidden>
                <span className="ico ok">
                  <Icone nome="certo" />
                </span>
                <div>
                  Silêncios removidos<small>−12s no vídeo final</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="band">
          <div className="wrap">
            <span className="band-title">Feito para criar mais rápido</span>
            <div className="marquee" aria-hidden>
              <div className="marquee-track">
                {[...FORMATOS, ...FORMATOS].map((formato, i) => (
                  <span key={i}>{formato}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="section" id="recursos">
          <div className="wrap">
            <div className="head">
              <div>
                <div className="eyebrow reveal">Principais recursos</div>
                <h2 className="reveal d1">
                  Rápido quando precisa.
                  <br />
                  <span className="grad-text">Completo quando quiser.</span>
                </h2>
              </div>
              <p className="reveal d2">
                Comece com um clique e deixe a IA cuidar do trabalho repetitivo. Assuma o controle dos detalhes no editor multipista.
              </p>
            </div>

            <div className="bento">
              <article className="card span-4 reveal watch">
                <div className="card-body">
                  <div className="card-ic">
                    <Icone nome="tesoura" />
                  </div>
                  <h3>Corte inteligente</h3>
                  <p>A IA analisa seu vídeo e encontra os melhores momentos para corte, com ritmo perfeito.</p>
                </div>
                <div className="viz cut-viz" style={{ marginBottom: 28 }}>
                  <div className="cut-strip">
                    <div className="cut-row">
                      <i className="ph-travel" />
                      <i className="ph-travel hit" style={{ backgroundPosition: "30% 50%" }} />
                      <i className="ph-music" />
                      <i className="ph-music hit" />
                      <i className="ph-product" />
                      <i className="ph-product" />
                      <i className="ph-food hit" />
                      <i className="ph-food" />
                      <i className="ph-podcast" />
                      <i className="ph-editor hit" />
                    </div>
                    <div className="cut-legend">
                      <span>
                        <b>4</b> momentos fortes
                      </span>
                      <span>
                        <b>00:38</b> de 03:12
                      </span>
                    </div>
                    <span className="scan" />
                  </div>
                  <div className="cut-side">
                    <div className="ed-label">Melhores momentos</div>
                    <div className="moment">
                      <i className="ph-music" />
                      <div>
                        Refrão do show<span>00:42 – 00:51</span>
                      </div>
                    </div>
                    <div className="moment">
                      <i className="ph-travel" />
                      <div>
                        Skyline ao entardecer<span>01:08 – 01:15</span>
                      </div>
                    </div>
                    <div className="moment">
                      <i className="ph-food" />
                      <div>
                        Finalização do prato<span>02:20 – 02:27</span>
                      </div>
                    </div>
                  </div>
                </div>
              </article>

              <article className="card span-2 reveal d1">
                <div className="card-body">
                  <div className="card-ic">
                    <Icone nome="legendas" />
                  </div>
                  <h3>Legendas automáticas</h3>
                  <p>Legendas precisas e estilos personalizáveis, em poucos cliques.</p>
                </div>
                <div className="viz cap-viz" style={{ marginBottom: 28 }}>
                  <div className="phone ph-podcast" id="capPhone" data-style="destaque">
                    <Karaoke frase="Transforme conversas em grandes vídeos." />
                  </div>
                  <div className="cap-styles" role="group" aria-label="Estilo da legenda">
                    <button type="button" className="on" data-style="destaque">
                      Destaque
                    </button>
                    <button type="button" data-style="classica">
                      Clássica
                    </button>
                    <button type="button" data-style="neon">
                      Neon
                    </button>
                  </div>
                </div>
              </article>

              <article className="card span-2 reveal watch">
                <div className="card-body">
                  <div className="card-ic">
                    <Icone nome="onda" />
                  </div>
                  <h3>Remover silêncios</h3>
                  <p>Elimina pausas e momentos sem fala, deixando seu vídeo mais dinâmico.</p>
                </div>
                <div className="viz sil-viz" style={{ marginBottom: 28 }}>
                  <div className="wave">
                    {ONDA_DA_FALA.map(({ pausa, altura }, i) => (
                      <i key={i} className={pausa ? "gap" : undefined} style={{ height: `${altura}%` }} />
                    ))}
                  </div>
                  <div className="sil-meta">
                    <span>Faixa de voz · podcast_ep12.wav</span>
                    <span className="pill-ok">
                      <Icone nome="certo" /> −12s
                    </span>
                  </div>
                </div>
              </article>

              <article className="card span-2 reveal d1">
                <div className="card-body">
                  <div className="card-ic">
                    <Icone nome="recorte" />
                  </div>
                  <h3>Reenquadramento IA</h3>
                  <p>Transforme vídeos horizontais em verticais e destaque o que importa.</p>
                </div>
                <div className="viz ref-viz" style={{ marginBottom: 28 }}>
                  <div className="ref-src ph-product">
                    <div className="ref-box" id="refBox" data-f="9:16" />
                  </div>
                  <div className="ref-tabs" role="group" aria-label="Formato">
                    {["9:16", "1:1", "4:5", "16:9"].map((formato, i) => (
                      <button key={formato} type="button" data-f={formato} className={i === 0 ? "on" : undefined}>
                        {formato}
                      </button>
                    ))}
                  </div>
                </div>
              </article>

              <article className="card span-2 reveal d2">
                <div className="card-body">
                  <div className="card-ic">
                    <Icone nome="camadas" />
                  </div>
                  <h3>Timeline profissional</h3>
                  <p>Clipes, trilhas, textos e sobreposições com keyframes e controle fino.</p>
                </div>
                <div className="viz pro-viz" style={{ marginBottom: 28 }}>
                  <div className="ruler">
                    {["0s", "5s", "10s", "15s"].map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <div className="ptrack">
                    <span className="tag">V1</span>
                    <b className="v" style={{ flex: 3 }} />
                    <b className="v" style={{ flex: 2 }} />
                    <b className="v" style={{ flex: 2.5 }} />
                    <span className="kf" style={{ left: "18%" }} />
                    <span className="kf" style={{ left: "52%" }} />
                  </div>
                  <div className="ptrack">
                    <span className="tag">V2</span>
                    <span style={{ flex: 1.2 }} />
                    <b className="o" style={{ flex: 2 }} />
                    <span style={{ flex: 3 }} />
                  </div>
                  <div className="ptrack">
                    <span className="tag">T</span>
                    <span style={{ flex: 0.4 }} />
                    <b className="t" style={{ flex: 2.2 }} />
                    <span style={{ flex: 0.6 }} />
                    <b className="t" style={{ flex: 1.8 }} />
                    <span style={{ flex: 1 }} />
                  </div>
                  <div className="ptrack">
                    <span className="tag">A1</span>
                    <b className="a" style={{ flex: 1 }} />
                  </div>
                  <div className="ptrack">
                    <span className="tag">A2</span>
                    <span style={{ flex: 2 }} />
                    <b className="a" style={{ flex: 3 }} />
                  </div>
                  <div className="playhead" />
                </div>
              </article>

              <article className="card span-6 assist reveal watch" id="assist">
                <div className="card-body">
                  <div className="card-ic">
                    <Icone nome="brilho" />
                  </div>
                  <h3>Um assistente de edição que entende o que você pede.</h3>
                  <p>
                    Descreva a alteração em texto e acompanhe cada passo na timeline. Você revisa, ajusta e decide — a IA nunca tira o
                    controle criativo das suas mãos.
                  </p>
                  <a className="more" href="#comece">
                    Explorar o assistente <Icone nome="seta" />
                  </a>
                </div>
                <div className="viz">
                  <div className="msg user" id="userMsg">
                    <span id="typed" />
                    <span className="caret" />
                  </div>
                  <div className="msg ai" id="aiMsg" style={{ opacity: 0, transition: "opacity .4s" }}>
                    <b>
                      <Icone nome="brilho" /> Assistente de IA
                    </b>
                    <ul>
                      {[
                        "Cortei os 6 primeiros segundos sem ação",
                        "Adicionei zoom no refrão (00:42)",
                        "Trilha animada com fade de 2s",
                        "Legendas no estilo Destaque",
                      ].map((passo) => (
                        <li key={passo}>
                          <Icone nome="certo" /> {passo}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="prompt">
                    <span>Peça uma alteração…</span>
                    <i>
                      <Icone nome="seta" />
                    </i>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section creators" id="criadores">
          <div className="wrap">
            <div className="head">
              <div>
                <div className="eyebrow reveal">Para todos os criadores</div>
                <h2 className="reveal d1">
                  Seu conteúdo.
                  <br />
                  <span className="grad-text">Seu jeito de criar.</span>
                </h2>
              </div>
              <p className="reveal d2">
                De vídeos para redes sociais a podcasts, viagens, música e produtos — o TakeOne acompanha o seu fluxo criativo.
              </p>
            </div>
            <div className="gallery">
              {GALERIA.map((item) => (
                <figure key={item.foto} className={`shot ${item.tamanho} reveal ${item.atraso}`}>
                  <Image src={`/marca/fotos/${item.foto}.jpg`} alt={item.alt} fill sizes="(max-width: 860px) 100vw, 42vw" unoptimized />
                  <span className="tag">
                    <Icone nome={item.icone} /> {item.marca}
                  </span>
                  <figcaption>
                    <h3>{item.titulo}</h3>
                    <p>{item.texto}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="templates">
          <div className="wrap">
            <div className="head">
              <div>
                <div className="eyebrow reveal">Templates para Stories · 9:16</div>
                <h2 className="reveal d1">
                  Comece com um template.
                  <br />
                  <span className="grad-text">Termine com a sua cara.</span>
                </h2>
              </div>
              <p className="reveal d2">Layouts verticais prontos para Reels, Shorts e Stories. Troque a mídia, ajuste o texto e publique.</p>
            </div>
            <div className="stories watch">
              {STORIES.map((story) => (
                <div key={story.fundo} className={`story ${story.fundo} reveal ${story.atraso}`} role="img" aria-label={story.rotulo}>
                  <div className="bars">
                    {story.barras.map((estado, i) => (
                      <i key={i} className={estado || undefined} />
                    ))}
                  </div>
                  <p className="txt">
                    {story.texto}
                    <em className="grad-text">{story.destaque}</em>
                  </p>
                  <span className="sig">
                    <Simbolo tamanho={14} />
                    TakeOne
                  </span>
                  <Link className="use" href="/cadastro">
                    Usar <Icone nome="seta" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="como-funciona" style={{ paddingTop: 64 }}>
          <div className="wrap flow">
            <div className="flow-intro">
              <div className="eyebrow reveal">Como funciona</div>
              <h2 className="h2 reveal d1">
                Da ideia ao vídeo final.
                <br />
                <span className="grad-text">Sem trocar de ferramenta.</span>
              </h2>
              <p className="reveal d2">Importe seus arquivos, use a IA para adiantar o trabalho e refine tudo na mesma linha do tempo.</p>
              <Link className="btn btn-primary reveal d3" href="/cadastro">
                Criar meu primeiro vídeo <Icone nome="seta" seta />
              </Link>
            </div>
            <div className="steps" id="steps">
              <span className="progress" id="stepsProgress" />
              <article className="step reveal">
                <span className="num">01</span>
                <h3>Traga seus arquivos</h3>
                <p>Vídeos, imagens e áudio em um único projeto — direto do computador ou do celular.</p>
                <div className="step-viz">
                  <div className="drop">
                    <span className="files">
                      <i className="ph-travel" />
                      <i className="ph-music" />
                      <i className="ph-food" />
                    </span>
                    <Icone nome="baixar" /> Solte aqui ou importe mídia
                  </div>
                </div>
              </article>
              <article className="step reveal">
                <span className="num">02</span>
                <h3>Deixe a IA acelerar</h3>
                <p>Cortes, legendas, remoção de silêncios e reenquadramento como ponto de partida.</p>
                <div className="step-viz">
                  <span className="chip">
                    <Icone nome="tesoura" /> Corte inteligente
                  </span>
                  <span className="chip">
                    <Icone nome="legendas" /> Legendas
                  </span>
                  <span className="chip">
                    <Icone nome="onda" /> Silêncios
                  </span>
                  <span className="chip">
                    <Icone nome="recorte" /> 9:16
                  </span>
                </div>
              </article>
              <article className="step reveal">
                <span className="num">03</span>
                <h3>Refine e exporte</h3>
                <p>Controle avançado quando precisar. Exportação no formato certo para cada rede.</p>
                <div className="step-viz">
                  <span className="chip">
                    <Icone nome="baixar" /> MP4 · 1080p
                  </span>
                  <span className="chip">
                    <Icone nome="monitor" /> 16:9
                  </span>
                  <span className="chip">
                    <Icone nome="recorte" /> 9:16
                  </span>
                  <span className="chip">
                    <Icone nome="recorte" /> 1:1
                  </span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section creators" id="planos">
          <div className="wrap">
            <div className="head center">
              <div className="eyebrow reveal">Planos</div>
              <h2 className="reveal d1">
                Comece grátis.
                <br />
                <span className="grad-text">Evolua quando quiser.</span>
              </h2>
              <div className="billing reveal d2">
                Mensal <button className="switch" id="billing" type="button" role="switch" aria-checked="false" aria-label="Cobrança anual" /> Anual{" "}
                <span className="save">−20%</span>
              </div>
            </div>
            <div className="plans">
              {PLANOS.map((plano, i) => (
                <article key={plano.nome} className={`plan ${plano.destaque ? "pro" : ""} reveal ${i ? `d${i}` : ""}`}>
                  {plano.destaque ? <span className="badge">Recomendado</span> : null}
                  <h3>{plano.nome}</h3>
                  <p className="for">{plano.para}</p>
                  <div className="price">
                    {plano.anual ? (
                      <b data-m={plano.mensal} data-y={plano.anual}>
                        {plano.mensal}
                      </b>
                    ) : (
                      <b>{plano.mensal}</b>
                    )}
                    <small>{plano.unidade}</small>
                  </div>
                  <ul>
                    {plano.itens.map((item) => (
                      <li key={item}>
                        <Icone nome="certo" /> {item}
                      </li>
                    ))}
                  </ul>
                  <Link className={`btn ${plano.destaque ? "btn-primary" : "btn-ghost"}`} href="/cadastro">
                    {plano.botao}
                    {plano.destaque ? <Icone nome="seta" seta /> : null}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="wrap faq-grid">
            <div>
              <div className="eyebrow reveal">Perguntas frequentes</div>
              <h2 className="h2 reveal d1">Tudo o que você precisa saber.</h2>
              <p className="reveal d2">
                Ainda com dúvidas? <a href="#comece">Fale com a gente</a>.
              </p>
            </div>
            <div className="faq reveal d1">
              {PERGUNTAS.map(([pergunta, resposta], i) => (
                <details key={pergunta} open={i === 0}>
                  <summary>
                    {pergunta}
                    <span className="pm" />
                  </summary>
                  <p>{resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta" id="comece">
          <div className="wrap">
            <div className="cta-box reveal">
              <Simbolo tamanho={64} className="mark" />
              <div className="eyebrow">Pronto para criar?</div>
              <h2 className="h2">
                Menos tempo editando.
                <br />
                <span className="grad-text">Mais tempo criando.</span>
              </h2>
              <p>Comece simples. Evolua quando quiser. Seu primeiro vídeo está a poucos cliques.</p>
              <div className="hero-actions">
                <Link className="btn btn-primary" href="/cadastro">
                  Começar a editar <Icone nome="seta" seta />
                </Link>
                <a className="btn btn-ghost" href="#recursos">
                  Ver demonstração
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <Marca />
              <p>Edite melhor. Conte mais.</p>
            </div>
            <div className="foot-col">
              <h4>Produto</h4>
              <a href="#recursos">Recursos</a>
              <a href="#como-funciona">Como funciona</a>
              <a href="#templates">Templates</a>
              <a href="#planos">Planos</a>
            </div>
            <div className="foot-col">
              <h4>Criadores</h4>
              <a href="#criadores">Redes sociais</a>
              <a href="#criadores">Podcasts</a>
              <a href="#criadores">Viagens</a>
              <a href="#criadores">Música e eventos</a>
            </div>
            <div className="foot-col">
              <h4>Conta</h4>
              <Link href="/entrar">Entrar</Link>
              <Link href="/cadastro">Criar conta</Link>
              <a href="#faq">Perguntas frequentes</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© 2026 TakeOne. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
