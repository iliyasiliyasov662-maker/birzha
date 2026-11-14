/* Сеть: WebRTC через PeerJS. Сервер не нужен — хост держит игру у себя в браузере,
   друзья подключаются к нему по коду комнаты. Работает с GitHub Pages. */
(function (root) {
  'use strict';
  const PREFIX = 'avalon-rt-v1-';
  const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const genCode = () => Array.from({ length: 5 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
  const available = () => typeof root.Peer === 'function';
  // Свой сигнальный сервер (необязательно): ?ps=host:port  или window.AVALON_PEER_SERVER = {host, port, path, secure}
  function opts() {
    const o = { debug: 0 };
    let cfg = root.AVALON_PEER_SERVER;
    const q = new URLSearchParams(root.location.search).get('ps');
    if (q) { const [host, port] = q.split(':'); cfg = { host, port: +port || 9000, path: '/', secure: false }; }
    return cfg ? Object.assign(o, cfg) : o;
  }

  function host(code, h) {
    return new Promise((resolve, reject) => {
      if (!available()) return reject(new Error('Сетевая библиотека не загрузилась. Проверьте интернет.'));
      const peer = new root.Peer(PREFIX + code, opts());
      let opened = false;
      peer.on('open', () => { opened = true; resolve(peer); });
      peer.on('connection', conn => {
        conn.on('open', () => h.onOpen && h.onOpen(conn));
        conn.on('data', d => h.onData(conn, d));
        conn.on('close', () => h.onClose(conn));
        conn.on('error', () => h.onClose(conn));
      });
      peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => peer.reconnect(), 1000); });
      peer.on('error', e => {
        if (!opened) {
          peer.destroy();
          reject(new Error(e.type === 'unavailable-id' ? 'Код комнаты занят' : 'Ошибка сети: ' + (e.type || e.message)));
        } else console.warn('peer error', e);
      });
    });
  }

  function join(code, h) {
    return new Promise((resolve, reject) => {
      if (!available()) return reject(new Error('Сетевая библиотека не загрузилась. Проверьте интернет.'));
      const peer = new root.Peer(opts());
      let done = false;
      const fail = msg => { if (!done) { done = true; peer.destroy(); reject(new Error(msg)); } };
      const timer = setTimeout(() => fail('Комната не отвечает. Проверьте код.'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
        conn.on('open', () => { done = true; clearTimeout(timer); resolve({ peer, conn }); });
        conn.on('data', d => h.onData(d));
        conn.on('close', () => { if (done) h.onClose(); });
        conn.on('error', () => { if (done) h.onClose(); });
      });
      peer.on('error', e => {
        clearTimeout(timer);
        if (e.type === 'peer-unavailable') fail('Комната не найдена. Проверьте код или попросите хоста открыть игру.');
        else if (!done) fail('Ошибка сети: ' + (e.type || e.message));
        else h.onClose();
      });
    });
  }

  root.AvalonNet = { genCode, host, join, available };
})(window);
