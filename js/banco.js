/* Fila de fotos guardada no IndexedDB.
 * Assim as fotos não se perdem se o navegador recarregar ou a conexão cair. */
(function () {
  'use strict';

  const NOME_BANCO = 'afrovisao';
  const LOJA = 'fotos';
  let promessaBanco = null;

  function abrir() {
    if (promessaBanco) return promessaBanco;
    promessaBanco = new Promise(function (resolve, reject) {
      const pedido = indexedDB.open(NOME_BANCO, 1);
      pedido.onupgradeneeded = function () {
        const bd = pedido.result;
        if (!bd.objectStoreNames.contains(LOJA)) {
          bd.createObjectStore(LOJA, { keyPath: 'id' });
        }
      };
      pedido.onsuccess = function () { resolve(pedido.result); };
      pedido.onerror = function () { reject(pedido.error); };
    });
    return promessaBanco;
  }

  function transacao(modo, executar) {
    return abrir().then(function (bd) {
      return new Promise(function (resolve, reject) {
        const tx = bd.transaction(LOJA, modo);
        const pedido = executar(tx.objectStore(LOJA));
        tx.oncomplete = function () { resolve(pedido && pedido.result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  window.Banco = {
    salvar: function (foto) {
      return transacao('readwrite', function (loja) { return loja.put(foto); });
    },
    listar: function () {
      return transacao('readonly', function (loja) { return loja.getAll(); })
        .then(function (lista) {
          return (lista || []).sort(function (a, b) { return a.criadaEm - b.criadaEm; });
        });
    },
    remover: function (id) {
      return transacao('readwrite', function (loja) { return loja.delete(id); });
    },
    limpar: function () {
      return transacao('readwrite', function (loja) { return loja.clear(); });
    }
  };
})();
