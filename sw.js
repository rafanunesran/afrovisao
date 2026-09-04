/* Service worker: guarda a "casca" do aplicativo para ele abrir mesmo sem internet.
   As fotos ficam no IndexedDB e só são enviadas quando a conexão volta. */
const VERSAO = 'afrovisao-v1';
const ARQUIVOS = [
  './',
  './index.html',
  './css/estilo.css',
  './js/config.js',
  './js/banco.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icone-192.png',
  './icons/icone-512.png'
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(VERSAO)
      .then(function (cache) { return cache.addAll(ARQUIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (chaves) {
        return Promise.all(chaves.map(function (chave) {
          return chave === VERSAO ? null : caches.delete(chave);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  const pedido = evento.request;
  // Envios ao Google nunca passam pelo cache.
  if (pedido.method !== 'GET' || pedido.url.indexOf('script.google') !== -1) return;

  // Rede primeiro (para as atualizações chegarem), cache como reserva.
  evento.respondWith(
    fetch(pedido)
      .then(function (resposta) {
        const copia = resposta.clone();
        caches.open(VERSAO).then(function (cache) { cache.put(pedido, copia); });
        return resposta;
      })
      .catch(function () {
        return caches.match(pedido).then(function (guardada) {
          return guardada || caches.match('./index.html');
        });
      })
  );
});
