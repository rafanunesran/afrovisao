/* Configuração do aplicativo.
 * ENDPOINT é a URL gerada ao publicar o Google Apps Script (veja o README).
 * Não existe senha aqui: quem libera ou bloqueia a atividade é a página de
 * administração (admin.html), e a senha de administrador fica só no script. */
window.APP_CONFIG = {
  NOME_APP: 'AfroVisão',
  ENDPOINT: 'https://script.google.com/macros/s/AKfycbwVqZJrBcFc4H0kXg3Ogh5AEhALzU-MQA8sTm7-39n4ZvlZfbS7jdN0nEERq9v6SiZc/exec',
  LARGURA_MAXIMA: 1600,   // maior lado da foto, em pixels
  QUALIDADE_JPEG: 0.85
};
