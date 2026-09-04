/**
 * AfroVisão — recebedor de fotos.
 *
 * Este arquivo NÃO roda no site: ele é colado no Google Apps Script
 * (script.google.com) e publicado como "Aplicativo da Web". O script roda
 * com a SUA conta Google, por isso as fotos caem na SUA pasta do Drive e
 * os alunos não precisam de login nem de senha.
 *
 * Não há senha, painel nem interruptor: com a implantação no ar, o aplicativo
 * envia. Para encerrar a atividade, desative a implantação em
 * Implantar → Gerenciar implantações → ✏️ → Desativar.
 *
 * Passo a passo completo no README.md do projeto.
 */

const CONFIG = {
  // ID da pasta do Drive: abra a pasta e copie o trecho depois de /folders/ na barra de endereço.
  ID_DA_PASTA: '1LvB1hg2AzyjWqijzZ_u06I4QofnKXsu9',   // pasta "Afrovisao"

  // Cria uma subpasta para cada turma dentro da pasta principal.
  CRIAR_SUBPASTA_POR_TURMA: true,

  // Recusa arquivos maiores que isto, para não estourar a cota do Apps Script.
  TAMANHO_MAXIMO_MB: 15,

  // Opcional: ID de uma planilha para registrar cada envio. Deixe '' para não usar.
  ID_DA_PLANILHA: ''
};

// Sobe de número quando o formato das respostas muda. O site avisa se a versão
// publicada estiver velha, em vez de mostrar um erro sem sentido.
const VERSAO_SCRIPT = 3;

const CHAVES = { TOTAL: 'total', ULTIMO_ENVIO: 'ultimoEnvio' };

/* --------------------------------------------------------------- entradas */

/** Chamado pelo aplicativo a cada foto. */
function doPost(requisicao) {
  try {
    return responder(receberFoto(JSON.parse(requisicao.postData.contents)));
  } catch (erro) {
    return responder({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}

/** Abrir a URL do script no navegador mostra se está tudo certo. */
function doGet() {
  const props = PropertiesService.getScriptProperties();
  return responder({
    ok: true,
    mensagem: 'Recebedor do AfroVisão está funcionando.',
    pasta: nomeDaPasta(),
    total: Number(props.getProperty(CHAVES.TOTAL) || 0),
    ultimoEnvio: props.getProperty(CHAVES.ULTIMO_ENVIO) || ''
  });
}

function responder(objeto) {
  objeto.versao = VERSAO_SCRIPT;
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------- recebendo fotos */

function receberFoto(dados) {
  // Consulta que o aplicativo faz ao abrir, só para confirmar que o script responde.
  if (dados.acao === 'estado') {
    return { ok: true, pasta: nomeDaPasta() };
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

  const props = PropertiesService.getScriptProperties();
  props.setProperty(CHAVES.TOTAL, String(Number(props.getProperty(CHAVES.TOTAL) || 0) + 1));
  props.setProperty(CHAVES.ULTIMO_ENVIO, new Date().toISOString());

  registrarNaPlanilha(dados, arquivo, pastaDestino);

  return { ok: true, nome: arquivo.getName(), link: arquivo.getUrl(), pasta: pastaDestino.getName() };
}

/** Nome da pasta de destino, ou o motivo de não dar para abri-la. */
function nomeDaPasta() {
  try {
    return DriveApp.getFolderById(CONFIG.ID_DA_PASTA).getName();
  } catch (erro) {
    return 'ERRO: ' + String(erro && erro.message ? erro.message : erro);
  }
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
  Logger.log('Pasta de destino: %s', nomeDaPasta());
}
