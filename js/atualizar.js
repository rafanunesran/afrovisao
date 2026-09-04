/* Força o aparelho a buscar a versão mais nova do site.
 * O aplicativo guarda uma cópia para funcionar sem internet; quando o site é
 * alterado, um celular pode continuar com a cópia antiga. Este botão apaga essa
 * cópia e recarrega. */
window.limparCacheERecarregar = function () {
  const tarefas = [];

  if ('serviceWorker' in navigator) {
    tarefas.push(
      navigator.serviceWorker.getRegistrations()
        .then(function (registros) {
          return Promise.all(registros.map(function (r) { return r.unregister(); }));
        })
        .catch(function () { /* segue mesmo assim */ })
    );
  }
  if (window.caches && caches.keys) {
    tarefas.push(
      caches.keys()
        .then(function (chaves) {
          return Promise.all(chaves.map(function (c) { return caches.delete(c); }));
        })
        .catch(function () { /* segue mesmo assim */ })
    );
  }

  return Promise.all(tarefas).then(function () {
    // A busca extra evita que o navegador sirva o HTML da própria memória.
    return fetch(location.pathname + '?atualizado=' + Date.now(), { cache: 'reload' })
      .catch(function () { /* offline: recarrega assim mesmo */ });
  }).then(function () {
    location.reload();
  });
};
