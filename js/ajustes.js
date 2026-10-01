/* Ferramentas da câmera, no arranjo de um app de câmera:
 *  - gaveta no topo (˅): temporizador, proporção, flash, exposição, linhas guia e foco;
 *  - régua vertical de exposição (direita) e de foco manual (esquerda);
 *  - embaixo: ajustes de cor | zoom | filtros, e a faixa correspondente acima;
 *  - toque na imagem foca naquele ponto; pinça com dois dedos faz zoom.
 *
 * O navegador só deixa mexer no hardware (flash, exposição, foco, zoom óptico)
 * em alguns aparelhos — Chrome no Android, principalmente. Sem isso, exposição
 * e zoom são feitos pelo aplicativo. Filtros e ajustes de cor são sempre do
 * aplicativo. Em todos os casos a foto salva sai igual ao que aparece na tela. */
(function () {
  'use strict';

  const el = {};
  ['palco', 'video', 'moldura', 'camadaTemperatura', 'camadaVinheta', 'guias', 'anelFoco',
   'btnGaveta', 'gaveta', 'ctlTimer', 'ctlProporcao', 'ctlFlash', 'ctlExposicao', 'ctlGuias', 'ctlFoco',
   'reguaExposicao', 'campoExposicao', 'reguaFoco', 'campoDistancia',
   'faixaFiltros', 'faixaAjustes', 'listaAjustes', 'campoAjuste', 'btnZerarAjustes',
   'btnAjustes', 'btnFiltros', 'zoom', 'contagem', 'numeroContagem', 'dicaCamera'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  /* ------------------------------------------------------------ catálogos */

  const TIMERS = [0, 3, 5, 10];
  const PROPORCOES = ['cheia', '4:3', '16:9', '1:1'];
  const FLASHES = ['desligado', 'foto', 'sempre'];
  const GUIAS = ['nenhuma', 'tercos', 'centro', 'quadriculado', 'diagonais'];
  const ROTULO_GUIAS = { nenhuma: 'DESL.', tercos: 'TERÇOS', centro: 'CENTRO', quadriculado: 'GRADE', diagonais: 'DIAG.' };
  const ROTULO_FLASH = { desligado: 'DESL.', foto: 'LIGADO', sempre: 'LANTERNA' };

  // Só funções lineares de cor: dá para refazê-las pixel a pixel onde o canvas não tem filtro.
  const FILTROS = [
    { id: 'normal', nome: 'Normal', cadeia: [] },
    { id: 'pb', nome: 'P&B', cadeia: [['grayscale', 1], ['contrast', 1.1]] },
    { id: 'noir', nome: 'Noir', cadeia: [['grayscale', 1], ['contrast', 1.5], ['brightness', 0.95]] },
    { id: 'sepia', nome: 'Sépia', cadeia: [['sepia', 0.85]] },
    { id: 'quente', nome: 'Quente', cadeia: [['sepia', 0.25], ['saturate', 1.3], ['hue-rotate', -8]] },
    { id: 'frio', nome: 'Frio', cadeia: [['saturate', 0.85], ['hue-rotate', 12], ['brightness', 1.04]] },
    { id: 'vivido', nome: 'Vívido', cadeia: [['saturate', 1.6], ['contrast', 1.1]] },
    { id: 'suave', nome: 'Suave', cadeia: [['contrast', 0.85], ['brightness', 1.08], ['saturate', 0.85]] },
    { id: 'dramatico', nome: 'Dramático', cadeia: [['contrast', 1.4], ['saturate', 0.8]] },
    { id: 'noite', nome: 'Noite', cadeia: [['brightness', 1.35], ['contrast', 1.15], ['saturate', 0.7]] },
    { id: 'vintage', nome: 'Vintage', cadeia: [['sepia', 0.45], ['contrast', 0.9], ['brightness', 1.05], ['saturate', 0.8]] },
    { id: 'desbotado', nome: 'Desbotado', cadeia: [['contrast', 0.75], ['brightness', 1.12], ['saturate', 0.6]] }
  ];

  const AJUSTES = [
    { id: 'brilho', nome: 'Brilho', min: -100, max: 100 },
    { id: 'contraste', nome: 'Contraste', min: -100, max: 100 },
    { id: 'saturacao', nome: 'Saturação', min: -100, max: 100 },
    { id: 'temperatura', nome: 'Temperatura', min: -100, max: 100 },
    { id: 'vinheta', nome: 'Vinheta', min: 0, max: 100 }
  ];

  const PADRAO = {
    timer: 0, proporcao: 'cheia', flash: 'desligado', exposicao: 0, guias: 'tercos', filtro: 'normal',
    brilho: 0, contraste: 0, saturacao: 0, temperatura: 0, vinheta: 0
  };

  // Safari antes da versão 18 não aplica filtros no canvas.
  const FILTRO_NO_CANVAS = typeof CanvasRenderingContext2D !== 'undefined' &&
    'filter' in CanvasRenderingContext2D.prototype;
  const ZOOM_DIGITAL_MAXIMO = 4;

  let prefs = null;
  let gravar = function () {};
  let faixa = null;
  let capacidades = {};
  let espelhado = false;
  let modoFoco = 'auto';      // auto | ponto | manual
  let zoom = 1;
  let ajusteAtivo = 'brilho';
  let fotografando = false;
  let cancelarContagem = null;
  let temporizadorAviso = 0;
  let temporizadorAnel = 0;

  /* ------------------------------------------------------------- utilidades */

  function aplicar(restricao) {
    if (!faixa || !faixa.applyConstraints) return Promise.resolve(false);
    return faixa.applyConstraints({ advanced: [restricao] })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function tem(nome) { return Object.prototype.hasOwnProperty.call(capacidades, nome); }
  function temModo(lista, modo) { return Array.isArray(capacidades[lista]) && capacidades[lista].indexOf(modo) !== -1; }
  function faixaValida(nome) { return tem(nome) && capacidades[nome].max > capacidades[nome].min; }

  function proximo(lista, atual) { return lista[(lista.indexOf(atual) + 1) % lista.length]; }

  function decimal(v, casas) {
    return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas === undefined ? 1 : casas });
  }
  function comSinal(v) { return (v > 0 ? '+' : '') + decimal(Math.round(v * 10) / 10); }

  function rotular(botao, texto, ligado) {
    botao.querySelector('span').textContent = texto;
    botao.classList.toggle('ligado', !!ligado);
  }

  function avisar(texto) {
    clearTimeout(temporizadorAviso);
    el.dicaCamera.textContent = texto;
    el.dicaCamera.hidden = false;
    temporizadorAviso = setTimeout(function () { el.dicaCamera.hidden = true; }, 2200);
  }

  /* ------------------------------------------------------------- geometria */

  function exposicaoNoHardware() { return faixaValida('exposureCompensation'); }
  function zoomNoHardware() { return faixaValida('zoom'); }
  function zoomMaximo() { return zoomNoHardware() ? capacidades.zoom.max : ZOOM_DIGITAL_MAXIMO; }
  function zoomMinimo() { return zoomNoHardware() ? Math.max(capacidades.zoom.min, 1) : 1; }
  function zoomDigital() { return zoomNoHardware() ? 1 : zoom; }

  /** Proporção largura/altura da foto, acompanhando a posição do sensor (em pé ou deitado). */
  function proporcaoDaFoto() {
    const v = el.video;
    if (!v.videoWidth) return 1;
    const quadro = v.videoWidth / v.videoHeight;
    if (prefs.proporcao === 'cheia') return quadro;
    const partes = prefs.proporcao.split(':').map(Number);
    const deitada = partes[0] / partes[1];
    return quadro >= 1 ? deitada : 1 / deitada;
  }

  function encaixar(largura, altura, proporcao) {
    return largura / altura > proporcao
      ? { w: altura * proporcao, h: altura }
      : { w: largura, h: largura / proporcao };
  }

  /* O vídeo usa "contain" (imagem inteira). A moldura é o pedaço que vira foto;
     fora dela fica preto, então o que se vê é o que se salva. */
  function ajustarMoldura() {
    const v = el.video;
    if (!v.videoWidth || !v.clientWidth) { el.moldura.hidden = true; return; }
    const escala = Math.min(v.clientWidth / v.videoWidth, v.clientHeight / v.videoHeight);
    const conteudo = { w: v.videoWidth * escala, h: v.videoHeight * escala };
    const area = encaixar(conteudo.w, conteudo.h, proporcaoDaFoto());
    el.moldura.style.width = area.w + 'px';
    el.moldura.style.height = area.h + 'px';
    el.moldura.style.left = (v.offsetLeft + (v.clientWidth - area.w) / 2) + 'px';
    el.moldura.style.top = (v.offsetTop + (v.clientHeight - area.h) / 2) + 'px';
    el.moldura.hidden = false;

    const z = zoomDigital();
    el.video.style.transform = 'scale(' + (espelhado ? -z : z) + ',' + z + ')';
  }

  /** Recorte do quadro do vídeo que corresponde à moldura (proporção + zoom do app). */
  function recorteDoQuadro() {
    const v = el.video;
    const area = encaixar(v.videoWidth, v.videoHeight, proporcaoDaFoto());
    const z = zoomDigital();
    const w = area.w / z;
    const h = area.h / z;
    return { x: (v.videoWidth - w) / 2, y: (v.videoHeight - h) / 2, w: w, h: h };
  }

  /* ----------------------------------------------------------- cor e efeitos */

  function filtroAtual() {
    return FILTROS.filter(function (f) { return f.id === prefs.filtro; })[0] || FILTROS[0];
  }

  /** Lista de funções de cor aplicadas, na ordem: exposição do app, filtro, ajustes. */
  function cadeiaDeCor() {
    const cadeia = [];
    if (!exposicaoNoHardware() && Number(prefs.exposicao)) {
      cadeia.push(['brightness', Math.pow(2, Number(prefs.exposicao) * 0.5)]);
    }
    filtroAtual().cadeia.forEach(function (passo) { cadeia.push(passo); });
    if (prefs.brilho) cadeia.push(['brightness', 1 + prefs.brilho / 250]);
    if (prefs.contraste) cadeia.push(['contrast', 1 + prefs.contraste / 200]);
    if (prefs.saturacao) cadeia.push(['saturate', 1 + prefs.saturacao / 100]);
    return cadeia;
  }

  function cadeiaEmCSS(cadeia) {
    return cadeia.map(function (p) {
      return p[0] + '(' + (p[0] === 'hue-rotate' ? p[1] + 'deg' : Number(p[1]).toFixed(3)) + ')';
    }).join(' ');
  }

  function corDaTemperatura() {
    const t = Number(prefs.temperatura) || 0;
    return { cor: t > 0 ? 'rgb(255, 136, 0)' : 'rgb(0, 110, 255)', alfa: Math.abs(t) / 100 * 0.5 };
  }

  function alfaDaVinheta() { return (Number(prefs.vinheta) || 0) / 100 * 0.85; }

  function aplicarCorNaTela() {
    el.video.style.filter = cadeiaEmCSS(cadeiaDeCor());
    const t = corDaTemperatura();
    el.camadaTemperatura.style.background = t.cor;
    el.camadaTemperatura.style.opacity = String(t.alfa);
    const a = alfaDaVinheta();
    el.camadaVinheta.style.background = a
      ? 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,' + a.toFixed(3) + ') 100%)'
      : 'none';
    el.btnFiltros.classList.toggle('ligado', prefs.filtro !== 'normal');
    el.btnAjustes.classList.toggle('ligado', AJUSTES.some(function (a2) { return Number(prefs[a2.id]); }));
  }

  /* Matrizes 4x5 das funções de filtro (especificação Filter Effects), para os
     navegadores sem filtro no canvas. Cada linha: r, g, b, a, deslocamento (0..1). */
  function matrizDe(passo) {
    const f = passo[0];
    const v = Number(passo[1]);
    if (f === 'brightness') return [v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, v, 0, 0];
    if (f === 'contrast') { const d = 0.5 - 0.5 * v; return [v, 0, 0, 0, d, 0, v, 0, 0, d, 0, 0, v, 0, d]; }
    if (f === 'saturate' || f === 'grayscale') {
      const s = f === 'saturate' ? v : 1 - Math.min(1, v);
      return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0,
              0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0,
              0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0];
    }
    if (f === 'sepia') {
      const k = 1 - Math.min(1, v);
      return [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0, 0,
              0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0, 0,
              0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k, 0, 0];
    }
    if (f === 'hue-rotate') {
      const r = v * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0,
              0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0, 0,
              0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0];
    }
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0];
  }

  /** Compõe as matrizes: aplicar "depois" sobre o resultado de "antes". */
  function compor(depois, antes) {
    const r = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 5; j++) {
        let soma = 0;
        for (let k = 0; k < 3; k++) soma += depois[i * 5 + k] * antes[k * 5 + j];
        if (j === 4) soma += depois[i * 5 + 4];
        r.push(j === 3 ? 0 : soma);
      }
    }
    return r;
  }

  function aplicarMatrizNosPixels(contexto, largura, altura, cadeia) {
    if (!cadeia.length) return;
    let m = matrizDe(['brightness', 1]);
    cadeia.forEach(function (passo) { m = compor(matrizDe(passo), m); });
    const imagem = contexto.getImageData(0, 0, largura, altura);
    const d = imagem.data;
    const k = [m[4] * 255, m[9] * 255, m[14] * 255];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i] = m[0] * r + m[1] * g + m[2] * b + k[0];
      d[i + 1] = m[5] * r + m[6] * g + m[7] * b + k[1];
      d[i + 2] = m[10] * r + m[11] * g + m[12] * b + k[2];
    }
    contexto.putImageData(imagem, 0, 0);
  }

  /** Monta a foto no canvas: recorte, cor, temperatura e vinheta — igual à tela. */
  function desenharFoto(canvas, limite) {
    const v = el.video;
    const recorte = recorteDoQuadro();
    const escala = Math.min(1, limite / Math.max(recorte.w, recorte.h));
    const w = Math.round(recorte.w * escala);
    const h = Math.round(recorte.h * escala);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const cadeia = cadeiaDeCor();

    if (FILTRO_NO_CANVAS && cadeia.length) ctx.filter = cadeiaEmCSS(cadeia);
    ctx.drawImage(v, recorte.x, recorte.y, recorte.w, recorte.h, 0, 0, w, h);
    if (FILTRO_NO_CANVAS) ctx.filter = 'none';
    else aplicarMatrizNosPixels(ctx, w, h, cadeia);

    const t = corDaTemperatura();
    if (t.alfa) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = t.alfa;
      ctx.fillStyle = t.cor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    const a = alfaDaVinheta();
    if (a) {
      // Mesmo desenho do CSS "ellipse at center": a elipse chega aos cantos.
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(w / 2, h / 2);
      const gradiente = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.SQRT2);
      gradiente.addColorStop(0.55, 'rgba(0,0,0,0)');
      gradiente.addColorStop(1, 'rgba(0,0,0,' + a + ')');
      ctx.fillStyle = gradiente;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  /* ----------------------------------------------------------- linhas guia */

  function desenharGuias() {
    const linhas = [];
    const t = 100 / 3;
    const tercos = [[t, 0, t, 100], [2 * t, 0, 2 * t, 100], [0, t, 100, t], [0, 2 * t, 100, 2 * t]];
    if (prefs.guias === 'tercos' || prefs.guias === 'centro') tercos.forEach(function (l) { linhas.push(l); });
    if (prefs.guias === 'quadriculado') {
      [25, 50, 75].forEach(function (p) { linhas.push([p, 0, p, 100], [0, p, 100, p]); });
    }
    if (prefs.guias === 'diagonais') {
      linhas.push([0, 0, 100, 100], [100, 0, 0, 100]);
      tercos.forEach(function (l) { linhas.push(l); });
    }
    el.guias.innerHTML = linhas.map(function (l) {
      const pts = 'x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '"';
      return '<line class="sombra" ' + pts + '/><line ' + pts + '/>';
    }).join('');
    // A cruz do centro é desenhada em CSS: no SVG esticado ela sairia torta.
    el.moldura.classList.toggle('comCentro', prefs.guias === 'centro');
    rotular(el.ctlGuias, ROTULO_GUIAS[prefs.guias], prefs.guias !== 'nenhuma');
  }

  /* --------------------------------------------------------- gaveta superior */

  function atualizarGaveta() {
    rotular(el.ctlTimer, prefs.timer ? prefs.timer + 'S' : 'DESL.', !!prefs.timer);
    rotular(el.ctlProporcao, prefs.proporcao === 'cheia' ? 'CHEIA' : prefs.proporcao, prefs.proporcao !== 'cheia');

    const comFlash = capacidades.torch === true;
    el.ctlFlash.classList.toggle('indisponivel', !comFlash);
    rotular(el.ctlFlash, comFlash ? ROTULO_FLASH[prefs.flash] : 'N/D', comFlash && prefs.flash !== 'desligado');

    const ev = Number(prefs.exposicao) || 0;
    rotular(el.ctlExposicao, ev ? comSinal(ev) : 'EXP', !!ev);
    el.ctlExposicao.classList.toggle('aberto', !el.reguaExposicao.hidden);

    rotular(el.ctlFoco, ({ auto: 'AUTO', ponto: 'PONTO', manual: 'MANUAL' })[modoFoco], modoFoco !== 'auto');
    desenharGuias();
  }

  function abrirGaveta(abrir) {
    el.gaveta.hidden = !abrir;
    el.btnGaveta.classList.toggle('aberta', abrir);
    el.btnGaveta.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    el.btnGaveta.setAttribute('aria-label', abrir ? 'Esconder controles' : 'Mostrar controles');
    if (abrir) atualizarGaveta();
  }

  /* ------------------------------------------------------------ iluminação */

  function acenderLanterna(acesa) {
    if (capacidades.torch !== true) return Promise.resolve(false);
    return aplicar({ torch: !!acesa });
  }

  function prepararReguaExposicao() {
    const c = exposicaoNoHardware() ? capacidades.exposureCompensation : { min: -2, max: 2, step: 0.1 };
    el.campoExposicao.min = String(c.min);
    el.campoExposicao.max = String(c.max);
    el.campoExposicao.step = String(c.step || 0.1);
    el.campoExposicao.value = String(prefs.exposicao);
  }

  function aplicarExposicao() {
    if (exposicaoNoHardware()) {
      const c = capacidades.exposureCompensation;
      const restricao = { exposureCompensation: Math.max(c.min, Math.min(c.max, Number(prefs.exposicao) || 0)) };
      if (temModo('exposureMode', 'continuous')) restricao.exposureMode = 'continuous';
      aplicar(restricao);
    }
    aplicarCorNaTela();
  }

  /* ----------------------------------------------------------------- foco */

  function focoManualPossivel() {
    return faixaValida('focusDistance') && temModo('focusMode', 'manual');
  }

  function focoAutomatico() {
    modoFoco = 'auto';
    el.reguaFoco.hidden = true;
    const restricao = {};
    if (temModo('focusMode', 'continuous')) restricao.focusMode = 'continuous';
    if (temModo('exposureMode', 'continuous')) restricao.exposureMode = 'continuous';
    if (Object.keys(restricao).length) aplicar(restricao);
    atualizarGaveta();
  }

  function focoManual() {
    const c = capacidades.focusDistance;
    el.campoDistancia.min = String(c.min);
    el.campoDistancia.max = String(c.max);
    el.campoDistancia.step = String(c.step || (c.max - c.min) / 100);
    const atual = faixa && faixa.getSettings ? faixa.getSettings().focusDistance : undefined;
    if (typeof atual === 'number') el.campoDistancia.value = String(atual);
    modoFoco = 'manual';
    el.reguaFoco.hidden = false;
    aplicar({ focusMode: 'manual', focusDistance: Number(el.campoDistancia.value) });
    atualizarGaveta();
  }

  function mostrarAnel(x, y, aviso) {
    clearTimeout(temporizadorAnel);
    el.anelFoco.hidden = false;
    el.anelFoco.style.left = (x * 100) + '%';
    el.anelFoco.style.top = (y * 100) + '%';
    el.anelFoco.className = 'anelFoco' + (aviso ? ' aviso' : '');
    void el.anelFoco.offsetWidth;   // reinicia a animação
    el.anelFoco.classList.add('animar');
    temporizadorAnel = setTimeout(function () { el.anelFoco.hidden = true; }, 1600);
  }

  function focarNoPonto(evento) {
    if (!faixa) return;
    if (fecharTudo()) return;   // o primeiro toque só fecha o que estiver aberto
    const caixa = el.moldura.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (evento.clientX - caixa.left) / caixa.width));
    const y = Math.max(0, Math.min(1, (evento.clientY - caixa.top) / caixa.height));

    // Converte o ponto da tela para o quadro inteiro do sensor (zoom do app e espelho).
    const recorte = recorteDoQuadro();
    let px = (recorte.x + x * recorte.w) / el.video.videoWidth;
    const py = (recorte.y + y * recorte.h) / el.video.videoHeight;
    if (espelhado) px = 1 - px;

    const restricao = {};
    if (tem('pointsOfInterest')) restricao.pointsOfInterest = [{ x: px, y: py }];
    if (temModo('focusMode', 'single-shot')) restricao.focusMode = 'single-shot';
    else if (temModo('focusMode', 'continuous')) restricao.focusMode = 'continuous';
    if (tem('pointsOfInterest') && temModo('exposureMode', 'continuous')) restricao.exposureMode = 'continuous';

    if (!restricao.pointsOfInterest && restricao.focusMode !== 'single-shot') {
      mostrarAnel(x, y, true);
      avisar('Este aparelho foca sozinho: o navegador não deixa escolher o ponto.');
      return;
    }
    mostrarAnel(x, y, false);
    el.reguaFoco.hidden = true;
    aplicar(restricao).then(function (deu) {
      if (deu) { modoFoco = 'ponto'; atualizarGaveta(); }
    });
  }

  /* ----------------------------------------------------------------- zoom */

  function opcoesDeZoom() {
    return [1, 2, 3, 5].filter(function (z) { return z <= zoomMaximo() + 0.01; });
  }

  function desenharZoom() {
    const opcoes = opcoesDeZoom();
    // O botão mais próximo do zoom atual mostra o valor exato (ex.: 1,7x).
    let maisPerto = opcoes[0];
    opcoes.forEach(function (o) { if (o <= zoom + 0.01) maisPerto = o; });
    el.zoom.innerHTML = '';
    opcoes.forEach(function (o) {
      const b = document.createElement('button');
      b.type = 'button';
      const ativo = o === maisPerto;
      b.className = ativo ? 'ativo' : '';
      b.textContent = (ativo ? decimal(Math.round(zoom * 10) / 10) : o) + 'x';
      b.setAttribute('aria-label', 'Zoom ' + o + ' vezes');
      b.addEventListener('click', function () { definirZoom(o); });
      el.zoom.appendChild(b);
    });
  }

  function definirZoom(valor) {
    zoom = Math.max(zoomMinimo(), Math.min(zoomMaximo(), valor));
    if (zoomNoHardware()) aplicar({ zoom: zoom });
    ajustarMoldura();
    desenharZoom();
  }

  // Pinça com dois dedos.
  const dedos = new Map();
  let pinca = null;

  function distancia() {
    const p = Array.from(dedos.values());
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  el.moldura.addEventListener('pointerdown', function (e) {
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dedos.size === 2) pinca = { inicio: distancia(), zoom: zoom };
  });
  el.moldura.addEventListener('pointermove', function (e) {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinca && dedos.size === 2) definirZoom(pinca.zoom * distancia() / pinca.inicio);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (tipo) {
    el.moldura.addEventListener(tipo, function (e) {
      dedos.delete(e.pointerId);
      if (dedos.size < 2) {
        if (pinca) el.moldura.dataset.semToque = '1';   // não confundir o fim da pinça com um toque
        pinca = null;
      }
    });
  });

  /* ----------------------------------------------------- filtros e ajustes */

  function desenharFiltros() {
    el.faixaFiltros.innerHTML = '';
    FILTROS.forEach(function (f) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cartaoFiltro' + (f.id === prefs.filtro ? ' ativo' : '');
      b.setAttribute('aria-pressed', f.id === prefs.filtro ? 'true' : 'false');
      const amostra = document.createElement('span');
      amostra.className = 'amostra';
      amostra.style.filter = cadeiaEmCSS(f.cadeia);
      const nome = document.createElement('span');
      nome.textContent = f.nome;
      b.appendChild(amostra);
      b.appendChild(nome);
      b.addEventListener('click', function () {
        prefs.filtro = f.id;
        gravar();
        aplicarCorNaTela();
        desenharFiltros();
      });
      el.faixaFiltros.appendChild(b);
    });
  }

  function desenharAjustes() {
    el.listaAjustes.innerHTML = '';
    AJUSTES.forEach(function (a) {
      const b = document.createElement('button');
      b.type = 'button';
      const valor = Number(prefs[a.id]) || 0;
      b.className = 'cartaoAjuste' + (a.id === ajusteAtivo ? ' ativo' : '') + (valor ? ' alterado' : '');
      b.innerHTML = '<strong></strong><span></span>';
      b.querySelector('strong').textContent = valor > 0 && a.min < 0 ? '+' + valor : String(valor);
      b.querySelector('span').textContent = a.nome;
      b.addEventListener('click', function () { ajusteAtivo = a.id; desenharAjustes(); });
      el.listaAjustes.appendChild(b);
    });
    const atual = AJUSTES.filter(function (a) { return a.id === ajusteAtivo; })[0];
    el.campoAjuste.min = String(atual.min);
    el.campoAjuste.max = String(atual.max);
    el.campoAjuste.value = String(Number(prefs[atual.id]) || 0);
    el.campoAjuste.setAttribute('aria-label', atual.nome);
  }

  function abrirFaixa(qual) {
    const filtros = qual === 'filtros' && el.faixaFiltros.hidden;
    const ajustes = qual === 'ajustes' && el.faixaAjustes.hidden;
    el.faixaFiltros.hidden = !filtros;
    el.faixaAjustes.hidden = !ajustes;
    el.btnFiltros.setAttribute('aria-pressed', filtros ? 'true' : 'false');
    el.btnAjustes.setAttribute('aria-pressed', ajustes ? 'true' : 'false');
    el.btnFiltros.classList.toggle('aberto', filtros);
    el.btnAjustes.classList.toggle('aberto', ajustes);
    if (filtros) desenharFiltros();
    if (ajustes) desenharAjustes();
  }

  /** Fecha gaveta, faixas e réguas. Devolve true se havia algo aberto. */
  function fecharTudo() {
    const havia = !el.gaveta.hidden || !el.faixaFiltros.hidden || !el.faixaAjustes.hidden || !el.reguaExposicao.hidden;
    abrirGaveta(false);
    el.reguaExposicao.hidden = true;
    abrirFaixa(null);
    return havia;
  }

  /* ---------------------------------------------------------------- eventos */

  el.btnGaveta.addEventListener('click', function () { abrirGaveta(el.gaveta.hidden); });

  el.ctlTimer.addEventListener('click', function () {
    prefs.timer = proximo(TIMERS, Number(prefs.timer) || 0);
    gravar();
    atualizarGaveta();
  });

  el.ctlProporcao.addEventListener('click', function () {
    prefs.proporcao = proximo(PROPORCOES, prefs.proporcao);
    gravar();
    ajustarMoldura();
    atualizarGaveta();
  });

  el.ctlFlash.addEventListener('click', function () {
    if (capacidades.torch !== true) {
      avisar('Este aparelho não deixa o navegador controlar o flash.');
      return;
    }
    prefs.flash = proximo(FLASHES, prefs.flash);
    gravar();
    acenderLanterna(prefs.flash === 'sempre');
    atualizarGaveta();
    avisar(({ desligado: 'Flash desligado', foto: 'Flash ao fotografar', sempre: 'Lanterna acesa' })[prefs.flash]);
  });

  el.ctlExposicao.addEventListener('click', function () {
    prepararReguaExposicao();
    el.reguaExposicao.hidden = !el.reguaExposicao.hidden;
    atualizarGaveta();
  });

  el.ctlGuias.addEventListener('click', function () {
    prefs.guias = proximo(GUIAS, prefs.guias);
    gravar();
    desenharGuias();
  });

  el.ctlFoco.addEventListener('click', function () {
    if (modoFoco !== 'manual' && focoManualPossivel()) { focoManual(); avisar('Foco manual: use a régua à esquerda.'); }
    else if (modoFoco !== 'auto') { focoAutomatico(); avisar('Foco automático'); }
    else avisar('Toque na imagem para focar num ponto.');
  });

  el.campoExposicao.addEventListener('input', function () {
    prefs.exposicao = Number(el.campoExposicao.value) || 0;
    aplicarExposicao();
    atualizarGaveta();
    gravar();
  });
  el.campoExposicao.addEventListener('dblclick', function () {
    prefs.exposicao = 0;
    el.campoExposicao.value = '0';
    aplicarExposicao();
    atualizarGaveta();
    gravar();
  });

  el.campoDistancia.addEventListener('input', function () {
    if (modoFoco === 'manual') aplicar({ focusMode: 'manual', focusDistance: Number(el.campoDistancia.value) });
  });

  el.btnFiltros.addEventListener('click', function () { abrirFaixa('filtros'); });
  el.btnAjustes.addEventListener('click', function () { abrirFaixa('ajustes'); });

  el.campoAjuste.addEventListener('input', function () {
    prefs[ajusteAtivo] = Number(el.campoAjuste.value) || 0;
    aplicarCorNaTela();
    const cartao = el.listaAjustes.querySelector('.ativo');
    if (cartao) {
      const a = AJUSTES.filter(function (x) { return x.id === ajusteAtivo; })[0];
      const v = prefs[ajusteAtivo];
      cartao.querySelector('strong').textContent = v > 0 && a.min < 0 ? '+' + v : String(v);
      cartao.classList.toggle('alterado', !!v);
    }
    gravar();
  });

  el.btnZerarAjustes.addEventListener('click', function () {
    AJUSTES.forEach(function (a) { prefs[a.id] = 0; });
    gravar();
    aplicarCorNaTela();
    desenharAjustes();
  });

  el.moldura.addEventListener('click', function (e) {
    if (el.moldura.dataset.semToque) { delete el.moldura.dataset.semToque; return; }
    focarNoPonto(e);
  });

  el.contagem.addEventListener('click', function () { if (cancelarContagem) cancelarContagem(); });

  el.video.addEventListener('loadedmetadata', ajustarMoldura);
  el.video.addEventListener('resize', ajustarMoldura);
  window.addEventListener('resize', ajustarMoldura);
  window.addEventListener('orientationchange', function () { setTimeout(ajustarMoldura, 300); });

  /* -------------------------------------------------------- fotografar */

  function contagemRegressiva(segundos) {
    if (!segundos) return Promise.resolve(true);
    return new Promise(function (resolve) {
      let resta = segundos;
      el.numeroContagem.textContent = String(resta);
      el.contagem.hidden = false;
      const relogio = setInterval(function () {
        resta--;
        if (resta > 0) { el.numeroContagem.textContent = String(resta); return; }
        terminar(true);
      }, 1000);
      function terminar(seguir) {
        clearInterval(relogio);
        cancelarContagem = null;
        el.contagem.hidden = true;
        resolve(seguir);
      }
      cancelarContagem = function () { terminar(false); avisar('Temporizador cancelado'); };
    });
  }

  /* ------------------------------------------------------- uso pelo app.js */

  window.AjustesCamera = {
    iniciar: function (preferencias, gravarPrefs) {
      prefs = preferencias;
      gravar = gravarPrefs;
      Object.keys(PADRAO).forEach(function (chave) {
        if (prefs[chave] === undefined || prefs[chave] === null || prefs[chave] === '') prefs[chave] = PADRAO[chave];
      });
      if (GUIAS.indexOf(prefs.guias) === -1) prefs.guias = PADRAO.guias;
      if (PROPORCOES.indexOf(prefs.proporcao) === -1) prefs.proporcao = PADRAO.proporcao;
      if (FLASHES.indexOf(prefs.flash) === -1) prefs.flash = PADRAO.flash;
      desenharGuias();
      aplicarCorNaTela();
      desenharZoom();
    },

    conectar: function (fluxo, frontal) {
      faixa = fluxo.getVideoTracks()[0] || null;
      espelhado = !!frontal;
      capacidades = {};
      try { capacidades = (faixa && faixa.getCapabilities) ? faixa.getCapabilities() || {} : {}; } catch (e) { capacidades = {}; }
      modoFoco = 'auto';
      el.reguaFoco.hidden = true;
      zoom = zoomMinimo();
      if (zoomNoHardware()) aplicar({ zoom: zoom });
      aplicarExposicao();
      if (prefs.flash === 'sempre') acenderLanterna(true);
      prepararReguaExposicao();
      atualizarGaveta();
      desenharZoom();
      ajustarMoldura();
    },

    desconectar: function () {
      if (cancelarContagem) cancelarContagem();
      faixa = null;
      capacidades = {};
      fecharTudo();
      el.moldura.hidden = true;
    },

    avisar: avisar,

    /** Temporizador, flash e montagem da foto. Resolve com o JPEG, ou null se cancelado. */
    fotografar: function (limite, qualidade, canvas) {
      if (fotografando || !faixa) return Promise.resolve(null);
      fotografando = true;
      fecharTudo();
      let acendeu = false;
      return contagemRegressiva(Number(prefs.timer) || 0)
        .then(function (seguir) {
          if (!seguir || !faixa) return null;
          const comFlash = prefs.flash === 'foto' && capacidades.torch === true;
          return (comFlash ? acenderLanterna(true) : Promise.resolve(false))
            .then(function (aceso) {
              acendeu = aceso;
              // A câmera precisa de um instante para medir a luz com o flash aceso.
              return new Promise(function (r) { setTimeout(r, aceso ? 700 : 0); });
            })
            .then(function () {
              if (!faixa || !el.video.videoWidth) return null;
              desenharFoto(canvas, limite);
              if (acendeu) acenderLanterna(false);
              return new Promise(function (r) { canvas.toBlob(r, 'image/jpeg', qualidade); });
            });
        })
        .then(function (blob) { fotografando = false; return blob; },
              function (erro) { fotografando = false; if (acendeu) acenderLanterna(false); throw erro; });
    }
  };
})();
