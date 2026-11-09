// Боты «Биржи». Простые соперники: бросают кубики, покупают доли, ставят на аукционах,
// выбирают выгодные себе новости, иногда лоббируют, торгуют. Блефовать как люди не умеют.
'use strict';
const { BOARD, CONFIG } = require('./game');

const RESERVE = 40000; // сколько наличных бот старается держать про запас

const valueOf10 = (g, cid) => g.companies[cid].price / 10;
const heldBy = (g, pid) => Object.values(g.companies).filter((c) => g.sharesOf(pid, c.id) > 0)
  .sort((a, b) => g.sharesOf(pid, b.id) * b.price - g.sharesOf(pid, a.id) * a.price);

// Насколько новость выгодна боту: рост там, где у него доли, — хорошо; падение там, где у него ничего нет, — тоже неплохо
function newsScore(g, pid, n) {
  const mine = (cid) => g.sharesOf(pid, cid);
  const inInd = Object.values(g.companies).filter((c) => c.industry === n.industry);
  const indShares = inInd.reduce((a, c) => a + mine(c.id), 0);
  if (n.kind === 'contract') return mine(n.company) * 3 + 1;
  if (n.kind === 'scandal') return mine(n.company) ? -mine(n.company) * 3 : 1.5;
  if (n.kind === 'boom') return indShares * 2 + 0.5;
  if (n.kind === 'industryTax') return indShares ? -indShares * 2 : 1;
  return 0.2; // слияние — непредсказуемо
}

// Открытый аукцион: каждый бот заранее решает, сколько максимум готов заплатить,
// и повышает, пока цена ниже этого предела. Один бот за шаг — так ставки идут постепенно.
function botAuctionStep(g) {
  const a = g.auction;
  if (!a) return false;
  a.botMax = a.botMax || {};
  const value = valueOf10(g, a.companyId);
  for (const p of g.active()) {
    if (!p.isBot || a.passed.includes(p.id) || (a.top && a.top.pid === p.id)) continue;
    if (!(p.id in a.botMax)) {
      a.botMax[p.id] = p.cash - value >= RESERVE ? Math.round(value * (0.75 + Math.random() * 0.45) / 100) * 100 : 0;
    }
    const max = Math.min(a.botMax[p.id], p.cash - RESERVE / 2);
    const next = a.top ? a.top.amount + CONFIG.auctionStep : a.minBid;
    if (next <= max) {
      const gap = max - (a.top ? a.top.amount : a.minBid);
      g.raise(p.id, gap > 3000 && Math.random() < 0.6 ? 1000 : CONFIG.auctionStep);
    } else {
      g.passAuction(p.id);
    }
    return true;
  }
  return false;
}

// Ответ ботов на предложения обмена: соглашаются, если получают по рынку хотя бы на 5% больше, чем отдают
function botTrades(g) {
  const t = g.trades.find((x) => { const p = g.player(x.to); return p && p.isBot; });
  if (!t) return false;
  const bot = g.player(t.to);
  const val = (cid, n) => (cid ? n * valueOf10(g, cid) : 0);
  const gets = val(t.giveCid, t.giveN) + Math.max(0, t.cash);
  const gives = val(t.getCid, t.getN) + Math.max(0, -t.cash);
  let ok = gets >= gives * 1.05;
  if (t.getCid && g.sharesOf(bot.id, t.getCid) >= 6 && g.sharesOf(bot.id, t.getCid) - t.getN < 6) ok = ok && gets >= gives * 1.4; // контрольный пакет просто так не отдаёт
  if (t.cash < 0 && bot.cash + t.cash < RESERVE) ok = false;
  try { g.respondTrade(bot.id, t.id, ok); } catch (e) { try { g.respondTrade(bot.id, t.id, false); } catch (e2) { /* уже неактуально */ } }
  return true;
}

// Один шаг бота, чей сейчас ход. Возвращает паузу до следующего шага в мс, или null, если делать нечего.
function botStep(g) {
  const p = g.current();
  if (!p || !p.isBot || p.out) return null;
  if (g.phase !== 'roll' && g.phase !== 'action') return null;
  if (g.auction) return null; // ждём конца аукциона
  const t = g.turn;
  const id = p.id;

  if (t.newsChoice) {
    let best = 0, bestScore = -Infinity;
    t.newsChoice.forEach((n, i) => { const sc = newsScore(g, id, n) + Math.random() * 0.5; if (sc > bestScore) { bestScore = sc; best = i; } });
    g.chooseNews(id, best);
    return 1500;
  }
  if (!t.rolled || t.extraRoll) {
    g.roll(id);
    return 4800; // ждём, пока у игроков докрутятся кубики и дойдёт фишка
  }
  if (t.rumor) {
    const mine = heldBy(g, id);
    if (mine.length) g.rumor(id, mine[0].id, 'up');
    else {
      const others = Object.values(g.companies).filter((c) => Object.keys(c.owners).length);
      if (others.length) g.rumor(id, others[Math.floor(Math.random() * others.length)].id, 'down');
      else g.skipRumor(id);
    }
    return 1500;
  }
  const cell = BOARD[p.pos];
  if (cell.type === 'company') {
    const c = g.companies[cell.id];
    if (g.bankShares(c.id) > 0 && (p.bankBought[c.id] || 0) < CONFIG.bankLimitShares && (t.bankVisit[c.id] || 0) < CONFIG.bankPerVisit && p.cash - c.price / 10 >= RESERVE) {
      g.buyFromBank(id, c.id);
      return 1300;
    }
  }
  if (cell.type === 'exchange' && p.cash < RESERVE) {
    const cheap = heldBy(g, id).reverse().find((c) => g.sellable(id, c.id) > 0);
    if (cheap) { g.sellToBank(id, cheap.id); return 1300; }
  }
  if (!t.botShopped) {
    t.botShopped = true;
    const o = g.offers.find((x) => x.sellerId !== id
      && x.price <= x.shares * valueOf10(g, x.companyId) * 1.12
      && p.cash - x.price >= RESERVE + 20000);
    if (o) { g.buyOffer(id, o.id); return 1300; }
  }
  if (!t.botLobbyTried) {
    t.botLobbyTried = true;
    const best = heldBy(g, id).find((c) => g.sharesOf(id, c.id) >= 2);
    if (best && !t.lobbied && Math.random() < 0.3 && p.cash - best.price * CONFIG.lobbyRate >= RESERVE * 2) {
      g.lobby(id, best.id, 'up');
      return 1800;
    }
  }
  if (!t.botListed) {
    t.botListed = true;
    if (Math.random() < 0.12) {
      const c = heldBy(g, id).find((x) => g.sellable(id, x.id) > 0);
      if (c) { g.placeOffer(id, c.id, 1, Math.round(c.price / 10 * 1.15 / 500) * 500); return 1200; }
    }
  }
  g.endTurn(id);
  return 1200;
}

module.exports = { botStep, botAuctionStep, botTrades };
