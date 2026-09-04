/**
 * AfroVisão — recebedor de fotos.
 *
 * Este arquivo NÃO roda no site: ele é colado no Google Apps Script
 * (script.google.com) e publicado como "Aplicativo da Web". O script roda
 * com a SUA conta Google, por isso as fotos caem na SUA pasta do Drive e
 * os alunos não precisam fazer login em nada.
 *
 * Passo a passo completo no README.md do projeto.
 */

const CONFIG = {
  // ID da pasta do Drive: abra a pasta e copie o trecho depois de /folders/ na barra de endereço.
  ID_DA_PASTA: '1LvB1hg2AzyjWqijzZ_u06I4QofnKXsu9',   // pasta "Afrovisao"

  // A mesma senha precisa estar em js/config.js (ou ser digitada na engrenagem do app).
  SENHA: 'afrovisao-cdj3f5',

  // Cria uma subpasta para cada turma dentro da pasta principal.
  CRIAR_SUBPASTA_POR_TURMA: true,

  // Recusa arquivos maiores que isto, para não estourar a cota do Apps Script.
  TAMANHO_MAXIMO_MB: 15,

  // Opcional: ID de uma planilha para registrar cada envio. Deixe '' para não usar.
  ID_DA_PLANILHA: ''
};

/** Chamado pelo aplicativo a cada foto. */
function doPost(requisicao) {
  try {
    const dados = JSON.parse(requisicao.postData.contents);

    if (String(CONFIG.SENHA) !== String(dados.senha || '')) {
      return responder({ ok: false, erro: 'Senha do envio incorreta.' });
    }

    const pastaPrincipal = DriveApp.getFolderById(CONFIG.ID_DA_PASTA);

    // Teste de conexão feito pelo botão "Testar conexão" do aplicativo.
    if (dados.acao === 'teste') {
      return responder({ ok: true, pasta: pastaPrincipal.getName() });
    }

    if (!dados.arquivo) {
      return responder({ ok: false, erro: 'Nenhuma imagem foi recebida.' });
    }

    const bytes = Utilities.base64Decode(dados.arquivo);
    const limite = CONFIG.TAMANHO_MAXIMO_MB * 1024 * 1024;
    if (bytes.length > limite) {
      return responder({ ok: false, erro: 'Imagem maior que ' + CONFIG.TAMANHO_MAXIMO_MB + ' MB.' });
    }

    const nomeArquivo = limparNome(dados.nomeArquivo || ('foto-' + Date.now() + '.jpg'));
    const blob = Utilities.newBlob(bytes, dados.tipo || 'image/jpeg', nomeArquivo);

    const pastaDestino = CONFIG.CRIAR_SUBPASTA_POR_TURMA
      ? pastaDaTurma(pastaPrincipal, dados.turma)
      : pastaPrincipal;

    const arquivo = pastaDestino.createFile(blob);
    arquivo.setDescription(
      'Enviado por ' + (dados.nome || 'sem nome') +
      ' — turma ' + (dados.turma || 'sem turma') +
      ' — foto tirada em ' + (dados.tiradaEm || 'data desconhecida')
    );

    registrarNaPlanilha(dados, arquivo, pastaDestino);

    return responder({
      ok: true,
      nome: arquivo.getName(),
      link: arquivo.getUrl(),
      pasta: pastaDestino.getName()
    });
  } catch (erro) {
    return responder({ ok: false, erro: String(erro && erro.message ? erro.message : erro) });
  }
}

/** Abrir a URL do script no navegador mostra se ele está no ar. */
function doGet() {
  return responder({ ok: true, mensagem: 'Recebedor do AfroVisão está funcionando.' });
}

function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
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
      new Date(),
      dados.nome || '',
      dados.turma || '',
      arquivo.getName(),
      pasta.getName(),
      arquivo.getUrl()
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
  Logger.log('Senha configurada: %s', CONFIG.SENHA ? 'ok' : 'ATENÇÃO, está vazia!');
}
