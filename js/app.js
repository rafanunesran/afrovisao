/* AfroVisão — câmera do celular com envio direto para uma pasta do Google Drive. */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const CHAVE_PREFS = 'afrovisao:prefs';

  const el = {};
  ['tituloApp', 'btnConfig', 'telaIdentificacao', 'telaCamera', 'telaGaleria',
   'campoNome', 'campoTurma', 'btnComecar', 'avisoIdentificacao',
   'video', 'canvas', 'avisoCamera', 'textoAvisoCamera', 'campoArquivo',
   'btnTrocarCamera', 'btnDisparar', 'btnGaleria', 'contadorFila', 'dicaCamera',
   'btnVoltarCamera', 'resumoFila', 'grade', 'btnEnviar', 'statusEnvio',
   'dialogoConfig', 'campoEndpoint', 'campoSenha', 'campoQualidade',
   'btnTestarConexao', 'btnSalvarConfig', 'statusConfig', 'btnTrocarAluno'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  const estado = {
    prefs: carregarPrefs(),
    fluxo: null,          // MediaStream ativo
    cameraFrontal: false,
    fotos: [],            // fila carregada do IndexedDB
    urls: new Map(),      // id -> objectURL do miniatura
    enviando: false,
    abrindo: false,
    ultimoCarimbo: 0
  };

  /* ------------------------------------------------------------------ prefs */

  function carregarPrefs() {
    let salvo = {};
    try { salvo = JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}'); } catch (e) { salvo = {}; }
    return {
      nome: salvo.nome || '',
      turma: salvo.turma || '',
      endpoint: salvo.endpoint || cfg.ENDPOINT || '',
      senha: salvo.senha || cfg.SENHA || '',
      larguraMaxima: salvo.larguraMaxima || cfg.LARGURA_MAXIMA || 1600
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
    el.video.parentElement.appendChild(flash);
    setTimeout(function () { flash.remove(); }, 300);
  }

  function tirarFoto() {
    if (!estado.fluxo || !el.video.videoWidth) return;
    const limite = Number(estado.prefs.larguraMaxima) || 1600;
    const largura = el.video.videoWidth;
    const altura = el.video.videoHeight;
    const escala = Math.min(1, limite / Math.max(largura, altura));

    el.canvas.width = Math.round(largura * escala);
    el.canvas.height = Math.round(altura * escala);
    el.canvas.getContext('2d').drawImage(el.video, 0, 0, el.canvas.width, el.canvas.height);
    piscarTela();

    el.canvas.toBlob(function (blob) {
      if (blob) guardarFoto(blob);
    }, 'image/jpeg', cfg.QUALIDADE_JPEG || 0.85);
  }

  function guardarFoto(blob) {
    // Duas fotos nunca podem dividir o mesmo instante: o horário entra no nome do arquivo.
    const agora = Math.max(Date.now(), estado.ultimoCarimbo + 1);
    estado.ultimoCarimbo = agora;
    const foto = {
      id: 'f' + agora + '-' + Math.random().toString(36).slice(2, 8),
      blob: blob,
      criadaEm: agora,
      situacao: 'pendente',
      erro: ''
    };
    return window.Banco.salvar(foto)
      .then(function () {
        estado.fotos.push(foto);
        atualizarContador();
        el.dicaCamera.textContent = estado.fotos.filter(pendente).length + ' foto(s) esperando envio.';
      })
      .catch(function () {
        el.dicaCamera.textContent = 'Não foi possível guardar a foto neste aparelho.';
      });
  }

  function pendente(f) { return f.situacao === 'pendente' || f.situacao === 'falhou'; }

  function atualizarContador() {
    const total = estado.fotos.filter(pendente).length;
    el.contadorFila.textContent = String(total);
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

      if (foto.situacao !== 'enviando') {
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
    return limpar(estado.prefs.turma) + '_' + limpar(estado.prefs.nome) + '_' +
           carimboDeHora(foto.criadaEm) + '.jpg';
  }

  function conversar(corpo) {
    const endereco = (estado.prefs.endpoint || '').trim();
    if (!endereco) {
      return Promise.reject(new Error('Endereço do Apps Script não configurado (toque na engrenagem).'));
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
          senha: estado.prefs.senha,
          nome: estado.prefs.nome,
          turma: estado.prefs.turma,
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
    el.campoEndpoint.value = estado.prefs.endpoint;
    el.campoSenha.value = estado.prefs.senha;
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
    estado.prefs.endpoint = el.campoEndpoint.value.trim();
    estado.prefs.senha = el.campoSenha.value.trim();
    estado.prefs.larguraMaxima = Number(el.campoQualidade.value) || 1600;
    gravarPrefs();
    el.statusConfig.className = 'status ok';
    el.statusConfig.textContent = 'Configurações salvas.';
  }

  function testarConexao() {
    estado.prefs.endpoint = el.campoEndpoint.value.trim();
    estado.prefs.senha = el.campoSenha.value.trim();
    el.statusConfig.className = 'status';
    el.statusConfig.textContent = 'Testando…';
    conversar({ acao: 'teste', senha: estado.prefs.senha })
      .then(function (dados) {
        el.statusConfig.className = 'status ok';
        el.statusConfig.textContent = 'Conectado à pasta "' + (dados.pasta || 'do Drive') + '".';
      })
      .catch(function (erro) {
        el.statusConfig.className = 'status ruim';
        el.statusConfig.textContent = erro.message;
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
    Promise.all(arquivos.map(guardarFoto)).then(function () {
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
  el.btnTrocarAluno.addEventListener('click', function () {
    estado.prefs.nome = '';
    estado.prefs.turma = '';
    gravarPrefs();
    el.dialogoConfig.close();
    el.campoNome.value = '';
    el.campoTurma.value = '';
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

  window.Banco.listar()
    .then(function (lista) {
      estado.fotos = lista;
      lista.forEach(function (f) { estado.ultimoCarimbo = Math.max(estado.ultimoCarimbo, f.criadaEm); });
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
