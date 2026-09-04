/**
 * AfroVisão — recebedor de fotos e interruptor da atividade.
 *
 * Este arquivo NÃO roda no site: ele é colado no Google Apps Script
 * (script.google.com) e publicado como "Aplicativo da Web". O script roda
 * com a SUA conta Google, por isso as fotos caem na SUA pasta do Drive e
 * os alunos não precisam fazer login nem digitar senha.
 *
 * Quem decide se a atividade está aberta é a página de administração
 * (admin.html), protegida pela SENHA_ADM abaixo. Enquanto estiver bloqueada,
 * o aplicativo dos alunos nem abre a câmera.
 *
 * Passo a passo completo no README.md do projeto.
 */

const CONFIG = {
  // ID da pasta do Drive: abra a pasta e copie o trecho depois de /folders/ na barra de endereço.
  ID_DA_PASTA: '1LvB1hg2AzyjWqijzZ_u06I4QofnKXsu9',   // pasta "Afrovisao"

  // Senha SÓ SUA, usada apenas na página de administração. Não fica no site dos alunos.
  SENHA_ADM: 'TROQUE-ESTA-SENHA-DE-ADMINISTRADOR',

  // Como a atividade começa, caso nunca tenha sido ligada: false = bloqueada.
  LIBERADO_DE_INICIO: false,

  // Cria uma subpasta para cada turma dentro da pasta principal.
  CRIAR_SUBPASTA_POR_TURMA: true,

  // Recusa arquivos maiores que isto, para não estourar a cota do Apps Script.
  TAMANHO_MAXIMO_MB: 15,

  // Opcional: ID de uma planilha para registrar cada envio. Deixe '' para não usar.
  ID_DA_PLANILHA: ''
};

// Sobe de número quando o formato das respostas muda. O site avisa se a versão
// publicada estiver velha, em vez de mostrar um erro sem sentido.
const VERSAO_SCRIPT = 2;

// Nomes das anotações guardadas pelo script entre uma execução e outra.
const CHAVES = {
  ABERTO_ATE: 'abertoAte',   // 0 = bloqueado, -1 = aberto sem prazo, ou um horário limite
  RECADO: 'recado',
  TOTAL: 'total',
  ULTIMO_ENVIO: 'ultimoEnvio',
  ULTIMA_MUDANCA: 'ultimaMudanca'
};

/* ------------------------------------------------------------------ estado */

function anotacoes() {
  return PropertiesService.getScriptProperties();
}

function lerAbertoAte() {
  const guardado = anotacoes().getProperty(CHAVES.ABERTO_ATE);
  if (guardado === null) return CONFIG.LIBERADO_DE_INICIO ? -1 : 0;
  return Number(guardado);
}

/** A atividade está aberta agora? Um prazo vencido bloqueia sozinho. */
function estaAberto() {
  const ate = lerAbertoAte();
  if (ate === -1) return true;
  if (ate <= 0) return false;
  return Date.now() < ate;
}

function estadoAtual() {
  const ate = lerAbertoAte();
  const aberto = estaAberto();
  return {
    ok: true,
    aberto: aberto,
    semPrazo: aberto && ate === -1,
    abertoAte: aberto && ate > 0 ? new Date(ate).toISOString() : null,
    recado: anotacoes().getProperty(CHAVES.RECADO) || '',
    total: Number(anotacoes().getProperty(CHAVES.TOTAL) || 0),
    ultimoEnvio: anotacoes().getProperty(CHAVES.ULTIMO_ENVIO) || '',
    ultimaMudanca: anotacoes().getProperty(CHAVES.ULTIMA_MUDANCA) || ''
  };
}

/* --------------------------------------------------------------- entradas */

/** Chamado pelo aplicativo dos alunos e pela página de administração. */
function doPost(requisicao) {
  try {
    const dados = JSON.parse(requisicao.postData.contents);

    // 1. Consulta pública: o app pergunta se pode fotografar. Não exige senha.
    if (dados.acao === 'estado') {
      return responder(estadoAtual());
    }

    // 2. Comandos da professora ou professor. Exigem a senha de administrador.
    if (dados.acao === 'admin') {
      return responder(comandoDeAdmin(dados));
    }

    // 3. Envio de foto. Só passa com a atividade aberta.
    return responder(receberFoto(dados));
  } catch (erro) {
    return responder({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}

/** Abrir a URL do script no navegador mostra se ele está no ar. */
function doGet() {
  const estado = estadoAtual();
  return responder({
    ok: true,
    mensagem: 'Recebedor do AfroVisão está funcionando.',
    aberto: estado.aberto
  });
}

function responder(objeto) {
  objeto.versao = VERSAO_SCRIPT;
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/* --------------------------------------------------------- administração */

function comandoDeAdmin(dados) {
  if (CONFIG.SENHA_ADM === 'TROQUE-ESTA-SENHA-DE-ADMINISTRADOR') {
    return { ok: false, erro: 'Defina a SENHA_ADM no script antes de usar a administração.' };
  }
  if (String(CONFIG.SENHA_ADM) !== String(dados.senhaAdm || '')) {
    return { ok: false, erro: 'Senha de administrador incorreta.' };
  }

  const props = anotacoes();

  if (dados.comando === 'liberar') {
    // minutos ausente ou 0 significa "aberto até eu bloquear".
    const minutos = Number(dados.minutos || 0);
    props.setProperty(CHAVES.ABERTO_ATE, minutos > 0 ? String(Date.now() + minutos * 60000) : '-1');
    props.setProperty(CHAVES.ULTIMA_MUDANCA, new Date().toISOString());
  } else if (dados.comando === 'bloquear') {
    props.setProperty(CHAVES.ABERTO_ATE, '0');
    props.setProperty(CHAVES.ULTIMA_MUDANCA, new Date().toISOString());
  } else if (dados.comando === 'recado') {
    props.setProperty(CHAVES.RECADO, String(dados.recado || '').slice(0, 300));
  } else if (dados.comando === 'zerarContagem') {
    props.setProperty(CHAVES.TOTAL, '0');
  } else if (dados.comando !== 'consultar') {
    return { ok: false, erro: 'Comando desconhecido: ' + dados.comando };
  }

  const estado = estadoAtual();
  estado.pasta = DriveApp.getFolderById(CONFIG.ID_DA_PASTA).getName();
  estado.linkDaPasta = 'https://drive.google.com/drive/folders/' + CONFIG.ID_DA_PASTA;
  return estado;
}

/* ------------------------------------------------------- recebendo fotos */

function receberFoto(dados) {
  if (!estaAberto()) {
    return {
      ok: false,
      bloqueado: true,
      erro: 'A atividade está bloqueada pela professora ou professor.',
      recado: anotacoes().getProperty(CHAVES.RECADO) || ''
    };
  }
  if (!dados.arquivo) {
    return { ok: false, erro: 'Nenhuma imagem foi recebida.' };
  }

  const bytes = Utilities.base64Decode(dados.arquivo);
  const limite = CONFIG.TAMANHO_MAXIMO_MB * 1024 * 1024;
  if (bytes.length > limite) {
    return { ok: false, erro: 'Imagem maior que ' + CONFIG.TAMANHO_MAXIMO_MB + ' MB.' };
  }

  const nomeArquivo = limparNome(dados.nomeArquivo || ('foto-' + Date.now() + '.jpg'));
  const blob = Utilities.newBlob(bytes, dados.tipo || 'image/jpeg', nomeArquivo);

  const pastaPrincipal = DriveApp.getFolderById(CONFIG.ID_DA_PASTA);
  const pastaDestino = CONFIG.CRIAR_SUBPASTA_POR_TURMA
    ? pastaDaTurma(pastaPrincipal, dados.turma)
    : pastaPrincipal;

  const arquivo = pastaDestino.createFile(blob);
  arquivo.setDescription(
    'Enviado por ' + (dados.nome || 'sem nome') +
    ' — turma ' + (dados.turma || 'sem turma') +
    ' — foto tirada em ' + (dados.tiradaEm || 'data desconhecida')
  );

  const props = anotacoes();
  props.setProperty(CHAVES.TOTAL, String(Number(props.getProperty(CHAVES.TOTAL) || 0) + 1));
  props.setProperty(CHAVES.ULTIMO_ENVIO, new Date().toISOString());

  registrarNaPlanilha(dados, arquivo, pastaDestino);

  return { ok: true, nome: arquivo.getName(), link: arquivo.getUrl(), pasta: pastaDestino.getName() };
}

function pastaDaTurma(pastaPrincipal, turma) {
  const nome = limparNome(turma || 'sem-turma');
  const existentes = pastaPrincipal.getFoldersByName(nome);
  return existentes.hasNext() ? existentes.next() : pastaPrincipal.createFolder(nome);
}

function limparNome(texto) {
  return String(texto)
    .replace(/[\\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'foto.jpg';
}

function registrarNaPlanilha(dados, arquivo, pasta) {
  if (!CONFIG.ID_DA_PLANILHA) return;
  try {
    const aba = SpreadsheetApp.openById(CONFIG.ID_DA_PLANILHA).getSheets()[0];
    if (aba.getLastRow() === 0) {
      aba.appendRow(['Recebido em', 'Nome', 'Turma', 'Arquivo', 'Pasta', 'Link']);
    }
    aba.appendRow([
      new Date(), dados.nome || '', dados.turma || '',
      arquivo.getName(), pasta.getName(), arquivo.getUrl()
    ]);
  } catch (erro) {
    // A planilha é opcional: uma falha aqui não pode derrubar o envio da foto.
    console.error('Falha ao registrar na planilha: ' + erro);
  }
}

/** Execute uma vez pelo editor do Apps Script para conferir a configuração. */
function conferirConfiguracao() {
  const pasta = DriveApp.getFolderById(CONFIG.ID_DA_PASTA);
  Logger.log('Pasta encontrada: %s', pasta.getName());
  Logger.log('Senha de administrador: %s',
    CONFIG.SENHA_ADM === 'TROQUE-ESTA-SENHA-DE-ADMINISTRADOR' ? 'ATENÇÃO, ainda é a do modelo!' : 'definida');
  Logger.log('Atividade agora: %s', estaAberto() ? 'ABERTA' : 'BLOQUEADA');
}
