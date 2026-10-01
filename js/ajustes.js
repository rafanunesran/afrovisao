/* Ajustes da câmera: iluminação (flash, exposição, contraste), foco e linhas guia.
 *
 * O navegador só deixa controlar o hardware em alguns aparelhos (Chrome no
 * Android, principalmente). Por isso cada ajuste tem duas formas:
 *  - hardware: o próprio sensor muda (flash, exposição, foco), quando o aparelho permite;
 *  - imagem: o aplicativo corrige brilho e contraste ao montar a foto, em qualquer aparelho.
 * O que aparece na tela é o que vai para a foto. */
(function () {
  'use strict';

  const el = {};
  ['video', 'moldura', 'guias', 'anelFoco',
   'btnLuz', 'btnFoco', 'btnGuias', 'painelLuz', 'painelFoco', 'painelGuias',
   'blocoFlash', 'semFlash', 'segFlash', 'campoExposicao', 'valorExposicao',
   'campoContraste', 'valorContraste', 'btnRestaurarLuz',
   'segFoco', 'blocoFocoManual', 'campoDistancia', 'valorDistancia', 'ajudaFoco',
   'segGuias'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  // Safari antes da versão 18 não aplica filtros no canvas.
  const FILTRO_NO_CANVAS = typeof CanvasRenderingContext2D !== 'undefined' &&
    'filter' in CanvasRenderingContext2D.prototype;

  const PADRAO = { guias: 'tercos', flash: 'desligado', exposicao: 0, contraste: 0 };

  let prefs = null;          // objeto de preferências do app (é gravado por ele)
  let gravar = function () {};
  let faixa = null;          // MediaStreamTrack de vídeo em uso
  let capacidades = {};
  let espelhado = false;
  let modoFoco = 'auto';     // auto | ponto | manual (não é gravado: cada abertura começa no automático)
  let temporizadorAnel = 0;

  /* ------------------------------------------------------------- utilidades */

  function aplicar(restricao) {
    if (!faixa || !faixa.applyConstraints) return Promise.resolve(false);
    return faixa.applyConstraints({ advanced: [restricao] })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  function tem(nome) { return Object.prototype.hasOwnProperty.call(capacidades, nome); }

  function temModo(nomeLista, modo) {
    return Array.isArray(capacidades[nomeLista]) && capacidades[nomeLista].indexOf(modo) !== -1;
  }

  function numero(v) {
    return (v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toLocaleString('pt-BR');
  }

  function marcarSegmento(grupo, valor) {
    Array.prototype.forEach.call(grupo.querySelectorAll('button'), function (b) {
      b.classList.toggle('ativo', b.dataset.valor === valor);
      b.setAttribute('aria-pressed', b.dataset.valor === valor ? 'true' : 'false');
    });
  }

  function aoEscolher(grupo, funcao) {
    grupo.addEventListener('click', function (evento) {
      const botao = evento.target.closest('button[data-valor]');
      if (botao && !botao.disabled) funcao(botao.dataset.valor);
    });
  }

  /* ------------------------------------------------------- área da imagem */

  /* O vídeo usa "contain": a imagem inteira aparece, sem cortes, igual à foto.
     A moldura cobre exatamente a imagem, para as guias baterem com a foto. */
  function ajustarMoldura() {
    const v = el.video;
    const larguraCaixa = v.clientWidth;
    const alturaCaixa = v.clientHeight;
    if (!v.videoWidth || !larguraCaixa) { el.moldura.hidden = true; return; }
    const escala = Math.min(larguraCaixa / v.videoWidth, alturaCaixa / v.videoHeight);
    const largura = v.videoWidth * escala;
    const altura = v.videoHeight * escala;
    el.moldura.style.width = largura + 'px';
    el.moldura.style.height = altura + 'px';
    el.moldura.style.left = (v.offsetLeft + (larguraCaixa - largura) / 2) + 'px';
    el.moldura.style.top = (v.offsetTop + (alturaCaixa - altura) / 2) + 'px';
    el.moldura.hidden = false;
  }

  /* ----------------------------------------------------------- linhas guia */

  function desenharGuias() {
    const linhas = [];
    const t = 100 / 3;
    if (prefs.guias === 'tercos' || prefs.guias === 'centro') {
      linhas.push([t, 0, t, 100], [2 * t, 0, 2 * t, 100], [0, t, 100, t], [0, 2 * t, 100, 2 * t]);
    }
    if (prefs.guias === 'quadriculado') {
      [25, 50, 75].forEach(function (p) { linhas.push([p, 0, p, 100], [0, p, 100, p]); });
    }
    if (prefs.guias === 'diagonais') {
      linhas.push([0, 0, 100, 100], [100, 0, 0, 100], [t, 0, t, 100], [2 * t, 0, 2 * t, 100],
                  [0, t, 100, t], [0, 2 * t, 100, 2 * t]);
    }
    let svg = '';
    linhas.forEach(function (l) {
      const pontos = 'x1="' + l[0] + '" y1="' + l[1] + '" x2="' + l[2] + '" y2="' + l[3] + '"';
      svg += '<line class="sombra" ' + pontos + '/><line ' + pontos + '/>';
    });
    el.guias.innerHTML = svg;
    // A cruz do centro é desenhada em CSS: no SVG esticado ela sairia torta.
    el.moldura.classList.toggle('comCentro', prefs.guias === 'centro');
    el.btnGuias.classList.toggle('ligado', prefs.guias !== 'nenhuma');
    marcarSegmento(el.segGuias, prefs.guias);
  }

  /* ------------------------------------------------------------ iluminação */

  function exposicaoNoHardware() {
    return tem('exposureCompensation') && capacidades.exposureCompensation.max > capacidades.exposureCompensation.min;
  }

  function temFlash() { return capacidades.torch === true; }

  function acenderLanterna(acesa) {
    if (!temFlash()) return Promise.resolve(false);
    return aplicar({ torch: !!acesa });
  }

  function aplicarExposicao() {
    const valor = Number(prefs.exposicao) || 0;
    el.valorExposicao.textContent = numero(valor);
    if (exposicaoNoHardware()) {
      const c = capacidades.exposureCompensation;
      const ajustado = Math.max(c.min, Math.min(c.max, valor));
      const restricao = { exposureCompensation: ajustado };
      if (temModo('exposureMode', 'continuous')) restricao.exposureMode = 'continuous';
      aplicar(restricao);
    }
    aplicarFiltroDaTela();
  }

  /* Brilho e contraste feitos pelo aplicativo (filtro CSS). O mesmo filtro é
     usado ao montar a foto, para a foto sair igual à tela. */
  function filtroDeImagem() {
    const partes = [];
    if (!exposicaoNoHardware()) {
      const ev = Number(prefs.exposicao) || 0;
      if (ev) partes.push('brightness(' + Math.pow(2, ev * 0.5).toFixed(3) + ')');
    }
    const contraste = Number(prefs.contraste) || 0;
    if (contraste) partes.push('contrast(' + (1 + contraste / 100).toFixed(2) + ')');
    return partes.join(' ');
  }

  function aplicarFiltroDaTela() {
    const filtro = filtroDeImagem();
    el.video.style.filter = filtro || '';
    el.btnLuz.classList.toggle('ligado',
      !!filtro || !!Number(prefs.exposicao) || prefs.flash !== 'desligado');
  }

  function prepararPainelLuz() {
    el.blocoFlash.hidden = !temFlash();
    el.semFlash.hidden = temFlash() || !faixa;
    marcarSegmento(el.segFlash, prefs.flash);

    if (exposicaoNoHardware()) {
      const c = capacidades.exposureCompensation;
      el.campoExposicao.min = String(c.min);
      el.campoExposicao.max = String(c.max);
      el.campoExposicao.step = String(c.step || 0.1);
    } else {
      el.campoExposicao.min = '-2';
      el.campoExposicao.max = '2';
      el.campoExposicao.step = '0.1';
    }
    el.campoExposicao.value = String(prefs.exposicao);
    el.campoContraste.value = String(prefs.contraste);
    el.valorExposicao.textContent = numero(Number(prefs.exposicao) || 0);
    el.valorContraste.textContent = numero(Number(prefs.contraste) || 0);
  }

  /* ----------------------------------------------------------------- foco */

  function focoManualPossivel() {
    return tem('focusDistance') && temModo('focusMode', 'manual') &&
           capacidades.focusDistance.max > capacidades.focusDistance.min;
  }

  function prepararPainelFoco() {
    marcarSegmento(el.segFoco, modoFoco);
    el.segFoco.querySelector('[data-valor="manual"]').disabled = !focoManualPossivel();
    el.blocoFocoManual.hidden = modoFoco !== 'manual';
    if (focoManualPossivel()) {
      const c = capacidades.focusDistance;
      el.campoDistancia.min = String(c.min);
      el.campoDistancia.max = String(c.max);
      el.campoDistancia.step = String(c.step || (c.max - c.min) / 100);
      const atual = faixa && faixa.getSettings ? faixa.getSettings().focusDistance : undefined;
      if (typeof atual === 'number') el.campoDistancia.value = String(atual);
      mostrarDistancia();
    }
    let ajuda = 'Toque na imagem para focar naquele ponto.';
    if (!temModo('focusMode', 'single-shot') && !tem('pointsOfInterest')) {
      ajuda = 'Este aparelho foca sozinho; o navegador não deixa escolher o ponto. ' +
              'Afaste ou aproxime o celular até a imagem ficar nítida.';
    }
    if (modoFoco === 'manual') ajuda = 'Arraste para ajustar a nitidez (perto ↔ longe).';
    el.ajudaFoco.textContent = ajuda;
  }

  function mostrarDistancia() {
    const v = Number(el.campoDistancia.value);
    el.valorDistancia.textContent = v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  function focoAutomatico() {
    modoFoco = 'auto';
    const restricao = {};
    if (temModo('focusMode', 'continuous')) restricao.focusMode = 'continuous';
    if (temModo('exposureMode', 'continuous')) restricao.exposureMode = 'continuous';
    if (Object.keys(restricao).length) aplicar(restricao);
    prepararPainelFoco();
  }

  function focoManual() {
    if (!focoManualPossivel()) return;
    modoFoco = 'manual';
    aplicar({ focusMode: 'manual', focusDistance: Number(el.campoDistancia.value) });
    prepararPainelFoco();
  }

  function mostrarAnel(x, y, situacao) {
    clearTimeout(temporizadorAnel);
    el.anelFoco.hidden = false;
    el.anelFoco.style.left = (x * 100) + '%';
    el.anelFoco.style.top = (y * 100) + '%';
    el.anelFoco.className = 'anelFoco ' + (situacao || '');
    // Reinicia a animação mesmo se tocar duas vezes no mesmo lugar.
    void el.anelFoco.offsetWidth;
    el.anelFoco.classList.add('animar');
    temporizadorAnel = setTimeout(function () { el.anelFoco.hidden = true; }, 1600);
  }

  function focarNoPonto(evento) {
    if (!faixa) return;
    const caixa = el.moldura.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (evento.clientX - caixa.left) / caixa.width));
    const y = Math.max(0, Math.min(1, (evento.clientY - caixa.top) / caixa.height));
    fecharPaineis();

    // A câmera frontal aparece espelhada; o sensor não.
    const ponto = { x: espelhado ? 1 - x : x, y: y };
    const restricao = {};
    if (tem('pointsOfInterest')) restricao.pointsOfInterest = [ponto];
    if (temModo('focusMode', 'single-shot')) restricao.focusMode = 'single-shot';
    else if (temModo('focusMode', 'continuous')) restricao.focusMode = 'continuous';
    if (temModo('exposureMode', 'continuous') && tem('pointsOfInterest')) restricao.exposureMode = 'continuous';

    if (!restricao.pointsOfInterest && restricao.focusMode !== 'single-shot') {
      mostrarAnel(x, y, 'aviso');
      return;
    }
    mostrarAnel(x, y);
    aplicar(restricao).then(function (deu) {
      if (deu) { modoFoco = 'ponto'; prepararPainelFoco(); }
    });
  }

  /* -------------------------------------------------------------- painéis */

  const paineis = [
    [el.btnLuz, el.painelLuz, prepararPainelLuz],
    [el.btnFoco, el.painelFoco, prepararPainelFoco],
    [el.btnGuias, el.painelGuias, desenharGuias]
  ];

  function fecharPaineis() {
    paineis.forEach(function (p) {
      p[1].hidden = true;
      p[0].classList.remove('aberto');
      p[0].setAttribute('aria-expanded', 'false');
    });
  }

  paineis.forEach(function (p) {
    p[0].setAttribute('aria-expanded', 'false');
    p[0].addEventListener('click', function () {
      const abrir = p[1].hidden;
      fecharPaineis();
      if (!abrir) return;
      p[2]();
      p[1].hidden = false;
      p[0].classList.add('aberto');
      p[0].setAttribute('aria-expanded', 'true');
    });
  });

  /* ---------------------------------------------------------------- eventos */

  aoEscolher(el.segGuias, function (valor) {
    prefs.guias = valor;
    gravar();
    desenharGuias();
  });

  aoEscolher(el.segFlash, function (valor) {
    prefs.flash = valor;
    gravar();
    marcarSegmento(el.segFlash, valor);
    acenderLanterna(valor === 'sempre');
    aplicarFiltroDaTela();
  });

  el.campoExposicao.addEventListener('input', function () {
    prefs.exposicao = Number(el.campoExposicao.value) || 0;
    aplicarExposicao();
    gravar();
  });

  el.campoContraste.addEventListener('input', function () {
    prefs.contraste = Number(el.campoContraste.value) || 0;
    el.valorContraste.textContent = numero(prefs.contraste);
    aplicarFiltroDaTela();
    gravar();
  });

  el.btnRestaurarLuz.addEventListener('click', function () {
    prefs.exposicao = 0;
    prefs.contraste = 0;
    prefs.flash = 'desligado';
    gravar();
    acenderLanterna(false);
    aplicarExposicao();
    prepararPainelLuz();
  });

  aoEscolher(el.segFoco, function (valor) {
    if (valor === 'auto') focoAutomatico();
    else if (valor === 'manual') focoManual();
    else el.ajudaFoco.textContent = 'Toque na imagem no ponto que deve ficar nítido.';
  });

  el.campoDistancia.addEventListener('input', function () {
    mostrarDistancia();
    if (modoFoco === 'manual') aplicar({ focusMode: 'manual', focusDistance: Number(el.campoDistancia.value) });
  });

  el.moldura.addEventListener('click', focarNoPonto);
  el.video.addEventListener('loadedmetadata', ajustarMoldura);
  el.video.addEventListener('resize', ajustarMoldura);
  window.addEventListener('resize', ajustarMoldura);
  window.addEventListener('orientationchange', function () { setTimeout(ajustarMoldura, 300); });

  /* ------------------------------------------------------- uso pelo app.js */

  window.AjustesCamera = {
    /** Recebe as preferências do app e a função que as grava. */
    iniciar: function (preferencias, gravarPrefs) {
      prefs = preferencias;
      gravar = gravarPrefs;
      Object.keys(PADRAO).forEach(function (chave) {
        if (prefs[chave] === undefined || prefs[chave] === null || prefs[chave] === '') prefs[chave] = PADRAO[chave];
      });
      desenharGuias();
      aplicarFiltroDaTela();
    },

    /** Chamado quando a câmera abre (ou troca de frontal para traseira). */
    conectar: function (fluxo, frontal) {
      faixa = fluxo.getVideoTracks()[0] || null;
      espelhado = !!frontal;
      capacidades = {};
      try { capacidades = (faixa && faixa.getCapabilities) ? faixa.getCapabilities() || {} : {}; } catch (e) { capacidades = {}; }
      modoFoco = 'auto';
      aplicarExposicao();
      if (prefs.flash === 'sempre') acenderLanterna(true);
      prepararPainelLuz();
      prepararPainelFoco();
      ajustarMoldura();
    },

    desconectar: function () {
      faixa = null;
      capacidades = {};
      fecharPaineis();
      el.moldura.hidden = true;
    },

    /** Acende o flash antes da foto, se for o caso. Resolve quando dá para fotografar. */
    antesDaFoto: function () {
      fecharPaineis();
      if (prefs.flash !== 'foto' || !temFlash()) return Promise.resolve(false);
      // A câmera precisa de um instante para medir a luz com o flash aceso.
      return acenderLanterna(true).then(function (acendeu) {
        return new Promise(function (r) { setTimeout(function () { r(acendeu); }, acendeu ? 700 : 0); });
      });
    },

    depoisDaFoto: function (acendeuFlash) {
      if (acendeuFlash) acenderLanterna(false);
    },

    /** Desenha o quadro do vídeo no canvas com o mesmo brilho/contraste da tela. */
    desenhar: function (contexto, origem, largura, altura) {
      const filtro = filtroDeImagem();
      if (!filtro) { contexto.drawImage(origem, 0, 0, largura, altura); return; }

      if (FILTRO_NO_CANVAS) {
        contexto.filter = filtro;
        contexto.drawImage(origem, 0, 0, largura, altura);
        contexto.filter = 'none';
        return;
      }
      // Navegadores sem filtro no canvas (Safari antigo): corrige pixel a pixel.
      contexto.drawImage(origem, 0, 0, largura, altura);
      const brilho = exposicaoNoHardware() ? 1 : Math.pow(2, (Number(prefs.exposicao) || 0) * 0.5);
      const contraste = 1 + (Number(prefs.contraste) || 0) / 100;
      const imagem = contexto.getImageData(0, 0, largura, altura);
      const d = imagem.data;
      for (let i = 0; i < d.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          let v = d[i + c] * brilho;
          v = (v - 128) * contraste + 128;
          d[i + c] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
      }
      contexto.putImageData(imagem, 0, 0);
    }
  };
})();
