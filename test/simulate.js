// Прогон партий ботами: проверяет, что правила не ломаются, и показывает, сколько длится игра.
// Запуск: npm test
'use strict';
const { Game, BOARD } = require('../game');

function botTurn(g) {
  const p = g.current();
  const pid = p.id;
  const tryDo = (fn) => { try { fn(); } catch (e) { /* бот пробует, ошибки правил — нормально */ } };
  // иногда покупает чужие предложения
  for (const o of [...g.offers]) if (o.sellerId !== pid && Math.random() < 0.3) tryDo(() => g.buyOffer(pid, o.id));
  if (Math.random() < 0.2) {
    const ids = Object.keys(g.companies);
    tryDo(() => g.lobby(pid, ids[Math.floor(Math.random() * ids.length)], Math.random() < 0.8 ? 'up' : 'down'));
  }
  if (g.phase === 'over' || g.current().id !== pid) return;
  g.roll(pid);
  if (g.phase === 'over' || g.current().id !== pid) return;
  if (g.turn.newsChoice) g.chooseNews(pid, Math.floor(Math.random() * 3));
  const cell = BOARD[p.pos];
  if (cell.type === 'company') { tryDo(() => g.buyFromBank(pid, cell.id)); if (Math.random() < 0.8) tryDo(() => g.buyFromBank(pid, cell.id)); }
  if (cell.type === 'exchange') for (const cid of Object.keys(g.companies)) if (Math.random() < 0.3) tryDo(() => g.sellToBank(pid, cid));
  // выставляет долю на продажу с наценкой
  if (Math.random() < 0.15) {
    const mine = Object.values(g.companies).filter((c) => g.sellable(pid, c.id) > 0);
    if (mine.length) {
      const c = mine[Math.floor(Math.random() * mine.length)];
      tryDo(() => g.placeOffer(pid, c.id, 1, Math.round(c.price / 10 * (1 + Math.random() * 0.3))));
    }
  }
  if (g.phase === 'over' || g.current().id !== pid) return;
  // аукцион: все делают тайные ставки или пасуют
  if (g.auction) {
    const c = g.companies[g.auction.companyId];
    for (const q of g.active()) {
      if (!g.auction) break;
      const v = Math.random() < 0.3 ? 0 : Math.min(q.cash, Math.round(c.price / 10 * (0.5 + Math.random() * 0.7)));
      tryDo(() => g.bid(q.id, v >= g.auction.minBid ? v : 0));
    }
  }
  if (g.phase === 'over' || g.current().id !== pid) return;
  // слух: поднять компанию, где у бота больше всего долей, иначе случайную уронить
  if (g.turn.rumor) {
    const mine = Object.values(g.companies).filter((c) => g.sharesOf(pid, c.id) > 0);
    if (mine.length) g.rumor(pid, mine[0].id, 'up'); else g.rumor(pid, Object.keys(g.companies)[0], 'down');
  }
  if (g.turn.newsChoice) g.chooseNews(pid, 0);
  if (g.turn.extraRoll) return botTurn(g);   // дубль — ходит ещё раз
  g.endTurn(pid);
}

function check(g) {
  for (const c of Object.values(g.companies)) {
    const total = Object.values(c.owners).reduce((a, b) => a + b, 0);
    if (total > 10 || total < 0) throw new Error(`Доли ${c.name}: ${total}`);
    for (const n of Object.values(c.owners)) if (n <= 0) throw new Error('Пустой владелец');
  }
  for (const p of g.players) if (p.cash < 0 || !Number.isFinite(p.cash)) throw new Error(`Деньги ${p.name}: ${p.cash}`);
}

function runMany(N, log = true) {
let turnsTotal = 0, byTime = 0, maxTurns = 0, perPlayer = [];
const reasons = {};
for (let i = 0; i < N; i++) {
  const g = new Game('TEST');
  const n = 2 + (i % 4); // от 2 до 5 игроков
  for (let k = 0; k < n; k++) g.addPlayer('p' + k, 'Бот ' + (k + 1));
  g.start('p0', 600);
  let t = 0;
  while (g.phase !== 'over' && t < 3000) { botTurn(g); check(g); t++; }
  if (g.phase !== 'over') { g.finishByTime(); byTime++; }
  const why = g.winner.why.split(' ')[0];
  reasons[why] = (reasons[why] || 0) + 1;
  turnsTotal += t; maxTurns = Math.max(maxTurns, t); perPlayer.push(t / n);
}
if (log) console.log(`Партий: ${N}. Среднее число ходов: ${Math.round(turnsTotal / N)}, максимум: ${maxTurns}. Не закончились за 3000 ходов: ${byTime}`);
perPlayer.sort((a, b) => a - b);
const q = (x) => Math.round(perPlayer[Math.floor(x * (perPlayer.length - 1))]);
if (log) console.log(`Ходов на одного игрока до конца партии: медиана ${q(0.5)}, четверть партий быстрее ${q(0.25)}, четверть дольше ${q(0.75)}`);
if (log) console.log('Как побеждали:', reasons);
if (log) console.log('OK: правила отработали без ошибок');
  return { median: q(0.5), q1: q(0.25), q3: q(0.75), reasons };
}
// Партии, где играют настоящие боты из bots.js (те же, что в игре)
function runRealBots(N, log = true) {
  const { botStep, botBids } = require('../bots');
  const per = [];
  let stuck = 0;
  for (let i = 0; i < N; i++) {
    const g = new Game('BOTS');
    const n = 2 + (i % 4);
    g.addPlayer('host', 'Хозяин');
    g.player('host').isBot = true;
    for (let k = 1; k < n; k++) g.addBot('host');
    g.start('host', 600);
    let steps = 0;
    while (g.phase !== 'over' && steps < 20000) {
      if (g.auction) { if (!botBids(g)) g.resolveAuction(); }
      else if (botStep(g) === null) { stuck++; break; }
      check(g);
      steps++;
    }
    if (g.phase !== 'over') g.finishByTime();
    per.push(g.globalTurn / n);
  }
  per.sort((a, b) => a - b);
  const q = (x) => Math.round(per[Math.floor(x * (per.length - 1))]);
  if (log) console.log(`Настоящие боты, партий ${N}: ходов на игрока — медиана ${q(0.5)}, четверть быстрее ${q(0.25)}, четверть дольше ${q(0.75)}. Зависаний: ${stuck}`);
  return { median: q(0.5) };
}
module.exports = { runMany, runRealBots };
if (require.main === module) { runMany(Number(process.argv[2]) || 300); runRealBots(Number(process.argv[2]) || 300); }
