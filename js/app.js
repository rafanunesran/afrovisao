/* AfroVisão — câmera do celular com envio direto para uma pasta do Google Drive. */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const CHAVE_PREFS = 'afrovisao:prefs';
  const CHAVE_ENDERECO = 'afrovisao:endereco';

  const el = {};
  ['tituloApp', 'btnConfig', 'telaIdentificacao', 'telaCamera', 'telaGaleria',
   'campoNome', 'campoTurma', 'btnComecar', 'avisoIdentificacao',
   'video', 'canvas', 'avisoCamera', 'textoAvisoCamera', 'campoArquivo',
   'btnTrocarCamera', 'btnDisparar', 'btnGaleria', 'contadorFila', 'dicaCamera',
   'btnVoltarCamera', 'resumoFila', 'grade', 'btnEnviar', 'statusEnvio',
   'dialogoConfig', 'campoQualidade', 'btnAtualizarApp',
   'detalhesAvancado', 'diagnostico', 'campoEndpointApp', 'btnUsarEndereco', 'btnEnderecoPadrao',
   'btnTestarConexao', 'btnSalvarConfig', 'statusConfig',
   'btnMenu', 'menu', 'btnVoltarInicio', 'imgUltima', 'palco'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  const estado = {
    prefs: carregarPrefs(),
    fluxo: null,          // MediaStream ativo
    cameraFrontal: false,
    fotos: [],            // fila carregada do IndexedDB
    urls: new Map(),      // id -> objectURL do miniatura
    enviando: false,
    abrindo: false,
    ultimoCarimbo: 0,
    aberto: null,        // null = ainda não sabemos se a atividade está liberada
    verificando: false
  };

  /* ------------------------------------------------------------------ prefs */

  function carregarPrefs() {
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}'); } catch (e) { salvo = {}; }
    return {
      nome: salvo.nome || '',
      turma: salvo.turma || '',
      larguraMaxima: salvo.larguraMaxima || cfg.LARGURA_MAXIMA || 1600,
      // Ajustes da câmera (js/ajustes.js completa o que faltar).
      guias: salvo.guias,
      flash: salvo.flash,
      exposicao: salvo.exposicao,
      contraste: salvo.contraste,
      timer: salvo.timer,
      proporcao: salvo.proporcao,
      filtro: salvo.filtro,
      brilho: salvo.brilho,
      saturacao: salvo.saturacao,
      temperatura: salvo.temperatura,
      vinheta: salvo.vinheta
    };
  }

  function gravarPrefs() {
    try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(estado.prefs)); } catch (e) { /* modo privado */ }
  }

  /* ------------------------------------------------------------- navegação */

  function mostrarTela(nome) {
    [el.telaIdentificacao, el.telaCamera, el.telaGaleria].forEach(function (t) {
      t.classList.remove('ativa');
    });
    if (nome === 'identificacao') el.telaIdentificacao.classList.add('ativa');
    if (nome === 'camera') el.telaCamera.classList.add('ativa');
    if (nome === 'galeria') el.telaGaleria.classList.add('ativa');

    if (nome === 'camera') iniciarCamera(); else pararCamera();
    if (nome === 'galeria') desenharGaleria();
  }

  /* ---------------------------------------------------------------- câmera */

  function iniciarCamera() {
    // "abrindo" evita duas aberturas simultâneas: a segunda falharia (aparelho ocupado)
    // e mostraria um erro por cima de uma câmera que já está funcionando.
    if (estado.fluxo || estado.abrindo) return;
    estado.abrindo = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      estado.abrindo = false;
      mostrarAvisoCamera('Este navegador não permite abrir a câmera. Use o botão abaixo para fotografar pelo aplicativo do celular.');
      return;
    }
    const restricoes = {
      video: {
        facingMode: estado.cameraFrontal ? 'user' : { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };
    navigator.mediaDevices.getUserMedia(restricoes)
      .then(function (fluxo) {
        estado.abrindo = false;
        if (estado.fluxo || !el.telaCamera.classList.contains('ativa')) {
          // Outra câmera já assumiu, ou o usuário saiu da tela: desligue esta.
          fluxo.getTracks().forEach(function (faixa) { faixa.stop(); });
          return;
        }
        estado.fluxo = fluxo;
        el.video.srcObject = fluxo;
        el.video.classList.toggle('espelhado', estado.cameraFrontal);
        el.avisoCamera.hidden = true;
        window.AjustesCamera.conectar(fluxo, estado.cameraFrontal);
        el.btnDisparar.disabled = false;
      })
      .catch(function (erro) {
        estado.abrindo = false;
        if (estado.fluxo) return;   // já existe uma câmera funcionando
        let recado = 'Não foi possível abrir a câmera.';
        if (erro && (erro.name === 'NotAllowedError' || erro.name === 'SecurityError')) {
          recado = 'A permissão da câmera foi negada. Libere o acesso nas configurações do navegador e recarregue a página.';
        } else if (erro && erro.name === 'NotFoundError') {
          recado = 'Nenhuma câmera foi encontrada neste aparelho.';
        } else if (!window.isSecureContext) {
          recado = 'A câmera só funciona em endereços seguros (https://) ou em localhost.';
        }
        mostrarAvisoCamera(recado);
      });
  }

  function mostrarAvisoCamera(texto) {
    el.textoAvisoCamera.textContent = texto;
    el.avisoCamera.hidden = false;
    el.btnDisparar.disabled = true;
  }

  function pararCamera() {
    if (!estado.fluxo) return;
    window.AjustesCamera.desconectar();
    estado.fluxo.getTracks().forEach(function (faixa) { faixa.stop(); });
    estado.fluxo = null;
    el.video.srcObject = null;
  }

  function trocarCamera() {
    estado.cameraFrontal = !estado.cameraFrontal;
    pararCamera();
    iniciarCamera();
  }

  /* -------------------------------------------------------------- captura */

  function piscarTela() {
    const flash = document.createElement('div');
    flash.className = 'flash piscar';
    el.palco.appendChild(flash);
    setTimeout(function () { flash.remove(); }, 300);
  }

  function tirarFoto() {
    if (!estado.fluxo || !el.video.videoWidth) return;
    const limite = Number(estado.prefs.larguraMaxima) || 1600;
    window.AjustesCamera.fotografar(limite, cfg.QUALIDADE_JPEG || 0.85, el.canvas)
      .then(function (blob) {
        if (!blob) return;
        piscarTela();
        guardarFoto(blob);
      })
      .catch(function () { window.AjustesCamera.avisar('Não foi possível tirar a foto.'); });
  }

  function guardarFoto(blob) {
    // Duas fotos nunca podem dividir o mesmo instante: o horário entra no nome do arquivo.
    const agora = Math.max(Date.now(), estado.ultimoCarimbo + 1);
    estado.ultimoCarimbo = agora;
    const foto = {
      id: 'f' + agora + '-' + Math.random().toString(36).slice(2, 8),
      blob: blob,
      criadaEm: agora,
      // Guardados na foto: se trocarem de aluno antes do envio, o nome não muda.
      nome: estado.prefs.nome,
      turma: estado.prefs.turma,
      situacao: 'pendente',
      erro: ''
    };
    return window.Banco.salvar(foto)
      .then(function () {
        estado.fotos.push(foto);
        atualizarContador();
        window.AjustesCamera.avisar(estado.fotos.filter(pendente).length + ' foto(s) esperando envio');
      })
      .catch(function () {
        window.AjustesCamera.avisar('Não foi possível guardar a foto neste aparelho.');
      });
  }

  /* Foto escolhida pelo aplicativo do celular: chega no tamanho e formato
     originais (às vezes HEIC/PNG de vários MB). Converte para JPEG no tamanho
     configurado, como as fotos da câmera do site. */
  function converterArquivo(arquivo) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(arquivo);
    return createImageBitmap(arquivo, { imageOrientation: 'from-image' })
      .then(function (imagem) {
        const limite = Number(estado.prefs.larguraMaxima) || 1600;
        const escala = Math.min(1, limite / Math.max(imagem.width, imagem.height));
        el.canvas.width = Math.round(imagem.width * escala);
        el.canvas.height = Math.round(imagem.height * escala);
        el.canvas.getContext('2d').drawImage(imagem, 0, 0, el.canvas.width, el.canvas.height);
        if (imagem.close) imagem.close();
        return new Promise(function (r) { el.canvas.toBlob(r, 'image/jpeg', cfg.QUALIDADE_JPEG || 0.85); });
      })
      .then(function (blob) { return blob || arquivo; })
      .catch(function () { return arquivo; });   // formato que o navegador não lê: vai como veio
  }

  function pendente(f) { return f.situacao === 'pendente' || f.situacao === 'falhou'; }

  function atualizarContador() {
    const total = estado.fotos.filter(pendente).length;
    el.contadorFila.textContent = String(total);
    el.contadorFila.hidden = !total;
    // Miniatura da última foto no botão da galeria.
    const ultima = estado.fotos[estado.fotos.length - 1];
    if (ultima) el.imgUltima.src = urlDaFoto(ultima);
    el.imgUltima.hidden = !ultima;
  }

  /* ------------------------------------------------------- galeria da fila */

  function urlDaFoto(foto) {
    if (!estado.urls.has(foto.id)) {
      estado.urls.set(foto.id, URL.createObjectURL(foto.blob));
    }
    return estado.urls.get(foto.id);
  }

  function desenharGaleria() {
    el.grade.innerHTML = '';
    if (!estado.fotos.length) {
      const vazio = document.createElement('p');
      vazio.className = 'vazio';
      vazio.textContent = 'Nenhuma foto ainda. Volte à câmera e fotografe.';
      el.grade.appendChild(vazio);
    }

    estado.fotos.forEach(function (foto) {
      const item = document.createElement('div');
      item.className = 'itemFoto';

      const img = document.createElement('img');
      img.src = urlDaFoto(foto);
      img.alt = 'Foto tirada em ' + new Date(foto.criadaEm).toLocaleString('pt-BR');
      item.appendChild(img);

      const selo = document.createElement('span');
      selo.className = 'selo ' + foto.situacao;
      selo.textContent = ({
        pendente: 'Na fila',
        enviando: 'Enviando…',
        enviada: 'Enviada ✓',
        falhou: 'Falhou — tente de novo'
      })[foto.situacao] || foto.situacao;
      if (foto.situacao === 'falhou' && foto.erro) selo.title = foto.erro;
      item.appendChild(selo);

      // Durante o envio não se remove nada: a foto voltaria ao ser marcada como enviada.
      if (!estado.enviando) {
        const remover = document.createElement('button');
        remover.type = 'button';
        remover.className = 'remover';
        remover.textContent = '×';
        remover.setAttribute('aria-label', 'Remover foto');
        remover.addEventListener('click', function () { removerFoto(foto.id); });
        item.appendChild(remover);
      }

      el.grade.appendChild(item);
    });

    atualizarResumo();
  }

  function atualizarResumo() {
    const naFila = estado.fotos.filter(pendente).length;
    const enviadas = estado.fotos.filter(function (f) { return f.situacao === 'enviada'; }).length;
    const partes = [];
    if (naFila) partes.push(naFila + ' na fila');
    if (enviadas) partes.push(enviadas + ' enviada(s)');
    el.resumoFila.textContent = partes.join(' · ') || 'Nenhuma foto';

    el.btnEnviar.disabled = estado.enviando || (!naFila && !enviadas);
    if (estado.enviando) {
      el.btnEnviar.textContent = 'Enviando…';
    } else if (naFila) {
      el.btnEnviar.textContent = 'Enviar ' + naFila + ' foto(s) para o Drive';
    } else if (enviadas) {
      el.btnEnviar.textContent = 'Limpar e voltar à câmera';
    } else {
      el.btnEnviar.textContent = 'Enviar para o Drive';
    }
    atualizarContador();
  }

  function removerFoto(id) {
    window.Banco.remover(id).then(function () {
      const url = estado.urls.get(id);
      if (url) { URL.revokeObjectURL(url); estado.urls.delete(id); }
      estado.fotos = estado.fotos.filter(function (f) { return f.id !== id; });
      desenharGaleria();
    });
  }

  function limparEnviadas() {
    const enviadas = estado.fotos.filter(function (f) { return f.situacao === 'enviada'; });
    return Promise.all(enviadas.map(function (f) { return window.Banco.remover(f.id); }))
      .then(function () {
        enviadas.forEach(function (f) {
          const url = estado.urls.get(f.id);
          if (url) { URL.revokeObjectURL(url); estado.urls.delete(f.id); }
        });
        estado.fotos = estado.fotos.filter(function (f) { return f.situacao !== 'enviada'; });
        el.statusEnvio.textContent = '';
        el.statusEnvio.className = 'status';
        desenharGaleria();
        mostrarTela('camera');
      });
  }

  /* -------------------------------------------------------------- upload */

  function blobParaBase64(blob) {
    return new Promise(function (resolve, reject) {
      const leitor = new FileReader();
      leitor.onload = function () {
        const resultado = String(leitor.result);
        resolve(resultado.slice(resultado.indexOf(',') + 1));
      };
      leitor.onerror = function () { reject(leitor.error); };
      leitor.readAsDataURL(blob);
    });
  }

  function limpar(texto) {
    return String(texto || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sem-nome';
  }

  function carimboDeHora(ms) {
    const d = new Date(ms);
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds()) +
           '-' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function nomeDoArquivo(foto) {
    return limpar(foto.turma || estado.prefs.turma) + '_' + limpar(foto.nome || estado.prefs.nome) + '_' +
           carimboDeHora(foto.criadaEm) + '.jpg';
  }

  function enderecoDoScript() {
    let proprio = '';
    try { proprio = localStorage.getItem(CHAVE_ENDERECO) || ''; } catch (e) { proprio = ''; }
    return (proprio || cfg.ENDPOINT || '').trim();
  }

  function conversar(corpo) {
    const endereco = enderecoDoScript();
    if (!endereco) {
      return Promise.reject(new Error('Este aparelho está com uma versão antiga do site. ' +
        'Abra a engrenagem e toque em "Atualizar o aplicativo".'));
    }
    // "text/plain" evita a requisição de verificação (preflight), que o Apps Script não responde.
    return fetch(endereco, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    }).catch(function () {
      // O navegador não diz o motivo exato por segurança; estas são as causas prováveis.
      throw new Error('Sem conexão com a internet, ou o endereço do Apps Script está errado.');
    }).then(function (resposta) {
      return resposta.text().then(function (texto) {
        let dados;
        try {
          dados = JSON.parse(texto);
        } catch (e) {
          throw new Error('Resposta inesperada do Google. Confirme se a implantação está como "Qualquer pessoa".');
        }
        if (!(Number(dados.versao) >= 3)) {
          throw new Error('O script publicado no Google está numa versão antiga. ' +
            'No editor do Apps Script: Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão.');
        }
        if (!resposta.ok || !dados.ok) {
          throw new Error(dados.erro || ('Erro ' + resposta.status));
        }
        return dados;
      });
    });
  }

  function enviarFoto(foto) {
    foto.situacao = 'enviando';
    desenharGaleria();
    return blobParaBase64(foto.blob)
      .then(function (base64) {
        return conversar({
          nome: foto.nome || estado.prefs.nome,
          turma: foto.turma || estado.prefs.turma,
          nomeArquivo: nomeDoArquivo(foto),
          tipo: 'image/jpeg',
          tiradaEm: new Date(foto.criadaEm).toISOString(),
          arquivo: base64
        });
      })
      .then(function (dados) {
        foto.situacao = 'enviada';
        foto.erro = '';
        foto.linkDrive = dados.link || '';
        return window.Banco.salvar(foto);
      })
      .catch(function (erro) {
        foto.situacao = 'falhou';
        foto.erro = erro && erro.message ? erro.message : 'Falha de conexão';
        return window.Banco.salvar(foto).then(function () { throw erro; });
      });
  }

  function enviarTudo() {
    const fila = estado.fotos.filter(pendente);
    if (!fila.length) return Promise.resolve();

    estado.enviando = true;
    atualizarResumo();
    el.statusEnvio.className = 'status';
    let enviadas = 0;
    let ultimoErro = null;

    return fila.reduce(function (corrente, foto, indice) {
      return corrente.then(function () {
        el.statusEnvio.textContent = 'Enviando ' + (indice + 1) + ' de ' + fila.length + '…';
        return enviarFoto(foto)
          .then(function () { enviadas++; })
          .catch(function (erro) { ultimoErro = erro; });
      });
    }, Promise.resolve()).then(function () {
      estado.enviando = false;
      if (ultimoErro) {
        el.statusEnvio.className = 'status ruim';
        el.statusEnvio.textContent = enviadas + ' enviada(s). Algumas falharam: ' + ultimoErro.message;
      } else {
        el.statusEnvio.className = 'status ok';
        el.statusEnvio.textContent = enviadas + ' foto(s) salva(s) na pasta do Drive.';
      }
      desenharGaleria();
    });
  }

  /* --------------------------------------------------------- configurações */

  function abrirConfig() {
    diagnosticar();
    el.campoQualidade.value = String(estado.prefs.larguraMaxima);
    el.statusConfig.textContent = '';
    el.statusConfig.className = 'status';
    if (typeof el.dialogoConfig.showModal === 'function') {
      el.dialogoConfig.showModal();
    } else {
      el.dialogoConfig.setAttribute('open', 'open');
    }
  }

  function salvarConfig() {
    estado.prefs.larguraMaxima = Number(el.campoQualidade.value) || 1600;
    gravarPrefs();
    el.statusConfig.className = 'status ok';
    el.statusConfig.textContent = 'Configurações salvas.';
  }

  function testarConexao() {
    el.statusConfig.className = 'status';
    el.statusConfig.textContent = 'Testando…';
    conversar({ acao: 'estado' })
      .then(function (dados) {
        el.statusConfig.className = 'status ok';
        el.statusConfig.textContent = 'Conectado à pasta "' + (dados.pasta || 'do Drive') + '".';
      })
      .catch(function (erro) {
        el.statusConfig.className = 'status ruim';
        el.statusConfig.textContent = erro.message;
      });
  }

  /* ----------------------------------------------------------- diagnóstico */

  /* Mostra com qual script o aparelho está falando e o que ele responde.
     É o que separa "erro no aplicativo" de "publicação antiga no Google". */
  function diagnosticar() {
    const endereco = enderecoDoScript();
    const proprio = endereco !== (cfg.ENDPOINT || '').trim();
    const fim = endereco ? '…' + endereco.slice(-24) : '(nenhum)';

    el.campoEndpointApp.value = proprio ? endereco : '';
    el.detalhesAvancado.open = proprio;
    el.diagnostico.textContent = 'Script: ' + fim + (proprio ? '  (deste aparelho)' : '') + '\nConsultando…';
    if (!endereco) {
      el.diagnostico.textContent = 'Nenhum endereço de script configurado.';
      return;
    }

    fetch(endereco, { method: 'GET', mode: 'cors', redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(function (texto) {
        let d;
        try { d = JSON.parse(texto); } catch (e) {
          throw new Error('não respondeu em JSON (a implantação está como "Qualquer pessoa"?)');
        }
        const linhas = ['Script: ' + fim + (proprio ? '  (deste aparelho)' : '')];
        if (!(Number(d.versao) >= 3)) {
          linhas.push('Código publicado: ANTIGO ✗');
          linhas.push('→ No editor do Apps Script: salve o arquivo e publique');
          linhas.push('  uma nova versão. Se criou uma implantação nova, cole');
          linhas.push('  a URL dela no campo abaixo.');
        } else {
          linhas.push('Código publicado: atualizado ✓');
          linhas.push('Pasta do Drive: ' + (d.pasta || '?'));
          linhas.push('Fotos já recebidas: ' + (d.total || 0));
        }
        el.diagnostico.textContent = linhas.join('\n');
      })
      .catch(function (erro) {
        el.diagnostico.textContent = 'Script: ' + fim + '\nNão respondeu: ' + (erro.message || 'sem conexão');
      });
  }

  /* ---------------------------------------------------------------- eventos */

  el.btnComecar.addEventListener('click', function () {
    const nome = el.campoNome.value.trim();
    const turma = el.campoTurma.value.trim();
    if (!nome || !turma) {
      el.avisoIdentificacao.hidden = false;
      return;
    }
    el.avisoIdentificacao.hidden = true;
    estado.prefs.nome = nome;
    estado.prefs.turma = turma;
    gravarPrefs();
    mostrarTela('camera');
  });

  el.btnDisparar.addEventListener('click', tirarFoto);
  el.btnTrocarCamera.addEventListener('click', trocarCamera);
  el.btnGaleria.addEventListener('click', function () { mostrarTela('galeria'); });
  el.btnVoltarCamera.addEventListener('click', function () { mostrarTela('camera'); });

  el.btnEnviar.addEventListener('click', function () {
    if (estado.enviando) return;
    if (estado.fotos.some(pendente)) enviarTudo(); else limparEnviadas();
  });

  el.campoArquivo.addEventListener('change', function () {
    const arquivos = Array.prototype.slice.call(el.campoArquivo.files || []);
    // Em sequência: um canvas só, e uma imagem grande por vez na memória.
    arquivos.reduce(function (corrente, arquivo) {
      return corrente.then(function () { return converterArquivo(arquivo).then(guardarFoto); });
    }, Promise.resolve()).then(function () {
      el.campoArquivo.value = '';
      if (arquivos.length) mostrarTela('galeria');
    });
  });

  el.btnConfig.addEventListener('click', abrirConfig);
  el.btnSalvarConfig.addEventListener('click', function () {
    salvarConfig();
    el.dialogoConfig.close();
  });
  el.btnTestarConexao.addEventListener('click', testarConexao);

  el.btnUsarEndereco.addEventListener('click', function () {
    const novo = el.campoEndpointApp.value.trim();
    try {
      if (novo) localStorage.setItem(CHAVE_ENDERECO, novo);
      else localStorage.removeItem(CHAVE_ENDERECO);
    } catch (e) { /* modo privado */ }
    diagnosticar();
  });

  el.btnEnderecoPadrao.addEventListener('click', function () {
    try { localStorage.removeItem(CHAVE_ENDERECO); } catch (e) { /* modo privado */ }
    el.campoEndpointApp.value = '';
    diagnosticar();
  });
  el.btnAtualizarApp.addEventListener('click', function () {
    el.statusConfig.className = 'status';
    el.statusConfig.textContent = 'Atualizando…';
    window.limparCacheERecarregar();
  });
  /* Menu oculto (⋮): compartilhar, configurações, voltar à identificação. */
  function abrirMenu(abrir) {
    el.menu.hidden = !abrir;
    el.btnMenu.setAttribute('aria-expanded', abrir ? 'true' : 'false');
  }
  el.btnMenu.addEventListener('click', function (e) {
    e.stopPropagation();
    abrirMenu(el.menu.hidden);
  });
  el.menu.addEventListener('click', function () { abrirMenu(false); });
  document.addEventListener('click', function (e) {
    if (!el.menu.hidden && !el.menu.contains(e.target)) abrirMenu(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') abrirMenu(false); });

  // Volta para a tela de nome e turma, já preenchida: dá para corrigir ou trocar de aluno.
  el.btnVoltarInicio.addEventListener('click', function () {
    el.campoNome.value = estado.prefs.nome;
    el.campoTurma.value = estado.prefs.turma;
    mostrarTela('identificacao');
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pararCamera();
    else if (el.telaCamera.classList.contains('ativa')) iniciarCamera();
  });

  /* ------------------------------------------------------------------ início */

  el.tituloApp.textContent = cfg.NOME_APP || 'Câmera';
  document.title = (cfg.NOME_APP || 'Câmera') + ' — Câmera';
  el.campoNome.value = estado.prefs.nome;
  el.campoTurma.value = estado.prefs.turma;
  window.AjustesCamera.iniciar(estado.prefs, gravarPrefs);

  window.Banco.listar()
    .then(function (lista) {
      estado.fotos = lista;
      lista.forEach(function (f) {
        estado.ultimoCarimbo = Math.max(estado.ultimoCarimbo, f.criadaEm);
        // Página fechada no meio do envio: a foto ficava "Enviando…" para sempre,
        // fora da fila e sem botão de remover.
        if (f.situacao === 'enviando') f.situacao = 'pendente';
      });
    })
    .catch(function () { estado.fotos = []; })
    .then(function () {
      atualizarContador();
      mostrarTela(estado.prefs.nome && estado.prefs.turma ? 'camera' : 'identificacao');
    });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* segue sem modo offline */ });
    });
  }
})();
