/* AfroVisão — página de administração.
 * Libera ou bloqueia a atividade. A senha vive só aqui e no Apps Script:
 * nunca é gravada no aplicativo dos alunos. */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const CHAVE_SENHA = 'afrovisao:adm';

  const el = {};
  ['telaEntrada', 'telaPainel', 'campoSenhaAdm', 'campoLembrar', 'btnEntrar', 'statusEntrada',
   'cartaoEstado', 'simboloEstado', 'tituloEstado', 'detalheEstado',
   'btnBloquear', 'statusComando', 'campoRecado', 'btnSalvarRecado',
   'numTotal', 'numUltima', 'linkPasta', 'btnAtualizar', 'btnZerar', 'btnSair', 'btnAtualizarPainel'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  let senhaAdm = '';
  let relogio = null;

  /* ------------------------------------------------------------- conversa */

  function conversar(corpo) {
    const endereco = (cfg.ENDPOINT || '').trim();
    if (!endereco) return Promise.reject(new Error('Falta o ENDPOINT em js/config.js.'));
    // "text/plain" evita a requisição de verificação (preflight), que o Apps Script não responde.
    return fetch(endereco, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo)
    }).catch(function () {
      throw new Error('Sem conexão com a internet, ou o endereço do Apps Script está errado.');
    }).then(function (resposta) {
      return resposta.text().then(function (texto) {
        let dados;
        try {
          dados = JSON.parse(texto);
        } catch (e) {
          throw new Error('Resposta inesperada do Google. Confirme se a implantação está como "Qualquer pessoa".');
        }
        if (!(Number(dados.versao) >= 2)) {
          throw new Error('O script publicado no Google está numa versão antiga. ' +
            'No editor do Apps Script: Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão.');
        }
        if (!dados.ok) throw new Error(dados.erro || 'Erro desconhecido.');
        return dados;
      });
    });
  }

  function comandar(comando, extras) {
    const corpo = { acao: 'admin', senhaAdm: senhaAdm, comando: comando };
    Object.keys(extras || {}).forEach(function (chave) { corpo[chave] = extras[chave]; });
    return conversar(corpo);
  }

  /* ---------------------------------------------------------------- telas */

  function mostrarPainel(mostrar) {
    el.telaEntrada.classList.toggle('ativa', !mostrar);
    el.telaPainel.classList.toggle('ativa', mostrar);
  }

  function horaCurta(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const hoje = new Date();
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return mesmoDia
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function faltamMinutos(iso) {
    const restante = new Date(iso).getTime() - Date.now();
    if (restante <= 0) return 'menos de um minuto';
    const minutos = Math.round(restante / 60000);
    if (minutos < 60) return minutos + ' min';
    return Math.floor(minutos / 60) + 'h' + String(minutos % 60).padStart(2, '0');
  }

  function pintarEstado(dados) {
    const aberto = dados.aberto === true;
    el.cartaoEstado.className = 'cartao centralizado ' + (aberto ? 'estadoAberto' : 'estadoFechado');
    el.simboloEstado.textContent = aberto ? '📷' : '🔒';
    el.tituloEstado.textContent = aberto ? 'Atividade liberada' : 'Atividade bloqueada';

    if (aberto && dados.abertoAte) {
      el.detalheEstado.textContent = 'Fecha sozinha às ' + horaCurta(dados.abertoAte) +
        ' (faltam ' + faltamMinutos(dados.abertoAte) + ').';
    } else if (aberto) {
      el.detalheEstado.textContent = 'Sem prazo — fica aberta até você bloquear.';
    } else {
      el.detalheEstado.textContent = dados.ultimaMudanca
        ? 'Bloqueada desde ' + horaCurta(dados.ultimaMudanca) + '.'
        : 'Os alunos não conseguem fotografar.';
    }

    el.numTotal.textContent = String(dados.total || 0);
    el.numUltima.textContent = horaCurta(dados.ultimoEnvio);
    if (dados.linkDaPasta) {
      el.linkPasta.href = dados.linkDaPasta;
      el.linkPasta.textContent = 'Abrir a pasta "' + (dados.pasta || 'do Drive') + '"';
    }
    if (document.activeElement !== el.campoRecado) {
      el.campoRecado.value = dados.recado || '';
    }
  }

  function avisar(elemento, texto, classe) {
    elemento.className = 'status' + (classe ? ' ' + classe : '');
    elemento.textContent = texto;
  }

  /* -------------------------------------------------------------- ações */

  function entrar() {
    senhaAdm = el.campoSenhaAdm.value.trim();
    if (!senhaAdm) { avisar(el.statusEntrada, 'Digite a senha.', 'ruim'); return; }
    avisar(el.statusEntrada, 'Entrando…');
    el.btnEntrar.disabled = true;
    comandar('consultar')
      .then(function (dados) {
        el.btnEntrar.disabled = false;
        if (el.campoLembrar.checked) {
          try { localStorage.setItem(CHAVE_SENHA, senhaAdm); } catch (e) { /* modo privado */ }
        }
        avisar(el.statusEntrada, '');
        el.campoSenhaAdm.value = '';
        mostrarPainel(true);
        pintarEstado(dados);
        relogio = setInterval(atualizar, 30000);
      })
      .catch(function (erro) {
        el.btnEntrar.disabled = false;
        senhaAdm = '';
        if (/incorreta/i.test(erro.message)) {
          // Senha lembrada que não serve mais: apaga, senão erra a cada abertura.
          try { localStorage.removeItem(CHAVE_SENHA); } catch (e) { /* modo privado */ }
        }
        avisar(el.statusEntrada, erro.message, 'ruim');
      });
  }

  function atualizar() {
    comandar('consultar').then(pintarEstado).catch(function (erro) {
      avisar(el.statusComando, erro.message, 'ruim');
    });
  }

  function executar(comando, extras, recado) {
    avisar(el.statusComando, 'Enviando…');
    comandar(comando, extras)
      .then(function (dados) {
        pintarEstado(dados);
        avisar(el.statusComando, recado, 'ok');
      })
      .catch(function (erro) { avisar(el.statusComando, erro.message, 'ruim'); });
  }

  function sair() {
    try { localStorage.removeItem(CHAVE_SENHA); } catch (e) { /* modo privado */ }
    senhaAdm = '';
    if (relogio) { clearInterval(relogio); relogio = null; }
    mostrarPainel(false);
    avisar(el.statusEntrada, 'Você saiu da administração.');
  }

  /* ------------------------------------------------------------ eventos */

  el.btnEntrar.addEventListener('click', entrar);
  el.campoSenhaAdm.addEventListener('keydown', function (evento) {
    if (evento.key === 'Enter') entrar();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-minutos]'), function (botao) {
    botao.addEventListener('click', function () {
      const minutos = Number(botao.getAttribute('data-minutos'));
      executar('liberar', { minutos: minutos },
        minutos > 0 ? 'Liberada por ' + minutos + ' minutos.' : 'Liberada até você bloquear.');
    });
  });

  el.btnBloquear.addEventListener('click', function () {
    executar('bloquear', {}, 'Atividade bloqueada.');
  });

  el.btnSalvarRecado.addEventListener('click', function () {
    executar('recado', { recado: el.campoRecado.value.trim() }, 'Recado salvo.');
  });

  el.btnAtualizar.addEventListener('click', atualizar);

  el.btnZerar.addEventListener('click', function () {
    if (window.confirm('Zerar a contagem de fotos recebidas? As fotos no Drive não são apagadas.')) {
      executar('zerarContagem', {}, 'Contagem zerada.');
    }
  });

  el.btnSair.addEventListener('click', sair);

  el.btnAtualizarPainel.addEventListener('click', function () {
    avisar(el.statusComando, 'Atualizando…');
    window.limparCacheERecarregar();
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && el.telaPainel.classList.contains('ativa')) atualizar();
  });

  /* ------------------------------------------------------------- início */

  let lembrada = '';
  try { lembrada = localStorage.getItem(CHAVE_SENHA) || ''; } catch (e) { lembrada = ''; }
  if (lembrada) {
    el.campoSenhaAdm.value = lembrada;
    entrar();
  }
})();
