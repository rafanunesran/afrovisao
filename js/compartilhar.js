/* Botão "Compartilhar": mostra um QR Code com o endereço do próprio site,
 * para outro celular abrir o aplicativo apontando a câmera. Funciona sem
 * internet (o gerador de QR Code vem junto, em js/qrcode.js). */
(function () {
  'use strict';

  const el = {};
  ['btnCompartilhar', 'dialogoQr', 'quadroQr', 'enderecoSite',
   'btnCopiarLink', 'btnEnviarLink', 'statusQr'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  /* Endereço limpo do site: sem "index.html", sem ?parâmetros e sem #âncora. */
  function enderecoDoSite() {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }

  function desenharQr(texto) {
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    el.quadroQr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }

  function avisar(texto, classe) {
    el.statusQr.className = 'status' + (classe ? ' ' + classe : '');
    el.statusQr.textContent = texto;
  }

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    // Reserva para navegadores sem a área de transferência moderna.
    return new Promise(function (resolve, reject) {
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.setAttribute('readonly', '');
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      el.dialogoQr.appendChild(campo);
      campo.select();
      const deu = document.execCommand && document.execCommand('copy');
      campo.remove();
      if (deu) resolve(); else reject(new Error('sem cópia'));
    });
  }

  el.btnCompartilhar.addEventListener('click', function () {
    const endereco = enderecoDoSite();
    el.enderecoSite.textContent = endereco;
    avisar('');
    try {
      desenharQr(endereco);
    } catch (e) {
      el.quadroQr.textContent = 'Não foi possível gerar o QR Code.';
    }
    el.btnEnviarLink.hidden = !navigator.share;
    if (typeof el.dialogoQr.showModal === 'function') el.dialogoQr.showModal();
    else el.dialogoQr.setAttribute('open', 'open');
  });

  el.btnCopiarLink.addEventListener('click', function () {
    copiar(enderecoDoSite())
      .then(function () { avisar('Link copiado.', 'ok'); })
      .catch(function () { avisar('Não deu para copiar. Segure o dedo sobre o endereço para copiar.', 'ruim'); });
  });

  el.btnEnviarLink.addEventListener('click', function () {
    if (!navigator.share) return;
    navigator.share({
      title: document.title,
      text: 'Abra a câmera da atividade:',
      url: enderecoDoSite()
    }).catch(function () { /* a pessoa cancelou */ });
  });
})();
