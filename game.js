// Игровая логика «Биржи». Здесь нет ничего про сеть: только правила.
// Все случайные числа и расчёты делаются на сервере, клиент лишь показывает.
'use strict';

// ---------- Настройки баланса (меняйте здесь) ----------
const CONFIG = {
  maxPlayers: 5,
  minPlayers: 2,
  startCash: 150000,
  salary: 30000,          // за проход через «Старт»
  winCash: 400000,        // победа наличными
  winCapital: 500000,     // победа общим капиталом
  turnSeconds: 90,        // время на ход; потом кубики бросаются сами и ход заканчивается
  dividendRate: 0.05,     // клетка «Дивиденды»: 5% от стоимости всех своих долей
  rumorEffect: 0.10,      // клетка «Слух»: бесплатно ±10% к цене любой компании
  auctionSeconds: 25,     // клетка «Аукцион»: сколько секунд идут тайные ставки
  auctionMinRate: 0.5,    // минимальная ставка — половина рыночной цены доли
  doublesForNews: 3,      // дубль = ещё один ход; третий дубль подряд = вместо хода секретная новость
  driftPct: 0.05,         // в начале каждого круга все цены сами меняются на случайные −5%…+5%
  driftUp: 0.03,          // общий рост рынка за круг: в среднем +3% к каждой цене
  marketEventChance: 0.4, // шанс общего события рынка в начале круга
  rentRate: 0.15,         // аренда = 15% от цены компании (делится между владельцами по долям)
  bankLimitShares: 2,     // у банка можно купить максимум 2 доли (20%) одной компании
  lobbyRate: 0.03,        // лоббирование стоит 3% от цены компании
  lobbyEffect: 0.15,      // при успехе цена меняется на 15%
  bankSellDiscount: 0.10, // продажа банку: рыночная цена минус 10%
  taxCell: 10000,         // клетка «Налог»
  bankDeal: 15000,        // клетка «Сделка с банком»
  auditRate: 0.10,        // «Налоговая проверка»: 10% от стоимости своих долей
  newsDelayRounds: 2,     // новость срабатывает через 2 круга ходов
  minPrice: 10000,
  defaultMinutes: 45,     // если никто не дошёл до цели — по времени побеждает самый богатый
};

const INDUSTRIES = {
  food:   { name: 'Фастфуд' },
  drinks: { name: 'Напитки' },
  wear:   { name: 'Одежда' },
  cars:   { name: 'Автомобили' },
  scent:  { name: 'Духи' },
  tech:   { name: 'Технологии' },
  stream: { name: 'Стриминг' },
  oil:    { name: 'Нефть' },
};

// Поле: 32 клетки, обход против часовой стрелки от «Старта».
const BOARD = [
  { type: 'start' },
  { type: 'company', id: 'mcd',      name: "McDonald's",    industry: 'food',   price: 100000 },
  { type: 'company', id: 'bk',       name: 'Burger King',   industry: 'food',   price: 110000 },
  { type: 'company', id: 'kfc',      name: 'KFC',           industry: 'food',   price: 120000 },
  { type: 'news' },
  { type: 'company', id: 'coke',     name: 'Coca-Cola',     industry: 'drinks', price: 140000 },
  { type: 'company', id: 'pepsi',    name: 'Pepsi',         industry: 'drinks', price: 130000 },
  { type: 'tax' },
  { type: 'exchange' },
  { type: 'company', id: 'nike',     name: 'Nike',          industry: 'wear',   price: 160000 },
  { type: 'company', id: 'adidas',   name: 'Adidas',        industry: 'wear',   price: 150000 },
  { type: 'auction' },
  { type: 'company', id: 'toyota',   name: 'Toyota',        industry: 'cars',   price: 180000 },
  { type: 'company', id: 'bmw',      name: 'BMW',           industry: 'cars',   price: 200000 },
  { type: 'company', id: 'mercedes', name: 'Mercedes-Benz', industry: 'cars',   price: 220000 },
  { type: 'bankdeal' },
  { type: 'audit' },
  { type: 'company', id: 'chanel',   name: 'Chanel',        industry: 'scent',  price: 240000 },
  { type: 'company', id: 'dior',     name: 'Dior',          industry: 'scent',  price: 230000 },
  { type: 'news' },
  { type: 'company', id: 'samsung',  name: 'Samsung',       industry: 'tech',   price: 260000 },
  { type: 'company', id: 'google',   name: 'Google',        industry: 'tech',   price: 300000 },
  { type: 'company', id: 'apple',    name: 'Apple',         industry: 'tech',   price: 320000 },
  { type: 'tax' },
  { type: 'exchange' },
  { type: 'company', id: 'netflix',  name: 'Netflix',       industry: 'stream', price: 340000 },
  { type: 'company', id: 'spotify',  name: 'Spotify',       industry: 'stream', price: 330000 },
  { type: 'rumor' },
  { type: 'company', id: 'shell',    name: 'Shell',         industry: 'oil',    price: 360000 },
  { type: 'company', id: 'bp',       name: 'BP',            industry: 'oil',    price: 350000 },
  { type: 'company', id: 'exxon',    name: 'ExxonMobil',    industry: 'oil',    price: 400000 },
  { type: 'dividends' },
];

// Общие события рынка: случаются сами в начале круга, их никто не выбирает и не знает заранее.
// industry: null — касается всех компаний. pct — изменение цены.
const MARKET_EVENTS = [
  { industry: null,     pct: -0.10, title: 'Кризис на рынке',            text: 'Все компании дешевеют на 10%.' },
  { industry: null,     pct: 0.08,  title: 'Рынок растёт',               text: 'Все компании дорожают на 8%.' },
  { industry: 'food',   pct: 0.15,  title: 'Бургерный бум',              text: 'Фастфуд дорожает на 15%.' },
  { industry: 'food',   pct: -0.12, title: 'Проверка качества в фастфуде', text: 'Фастфуд дешевеет на 12%.' },
  { industry: 'drinks', pct: 0.15,  title: 'Аномальная жара',            text: 'Напитки дорожают на 15%.' },
  { industry: 'drinks', pct: -0.12, title: 'Налог на сахар',             text: 'Напитки дешевеют на 12%.' },
  { industry: 'wear',   pct: 0.15,  title: 'Мода на спорт',              text: 'Одежда дорожает на 15%.' },
  { industry: 'wear',   pct: -0.12, title: 'Скандал с фабриками',        text: 'Одежда дешевеет на 12%.' },
  { industry: 'cars',   pct: 0.15,  title: 'Льготные автокредиты',       text: 'Автомобили дорожают на 15%.' },
  { industry: 'cars',   pct: -0.12, title: 'Массовый отзыв машин',       text: 'Автомобили дешевеют на 12%.' },
  { industry: 'scent',  pct: 0.15,  title: 'Сезон подарков',             text: 'Духи дорожают на 15%.' },
  { industry: 'scent',  pct: -0.12, title: 'Подделки на рынке',          text: 'Духи дешевеют на 12%.' },
  { industry: 'tech',   pct: 0.15,  title: 'Прорыв в нейросетях',        text: 'Технологии дорожают на 15%.' },
  { industry: 'tech',   pct: -0.12, title: 'Дефицит чипов',              text: 'Технологии дешевеют на 12%.' },
  { industry: 'stream', pct: 0.15,  title: 'Хитовый сериал',             text: 'Стриминг дорожает на 15%.' },
  { industry: 'stream', pct: -0.12, title: 'Война подписок',             text: 'Стриминг дешевеет на 12%.' },
  { industry: 'oil',    pct: 0.15,  title: 'Нефть подорожала',           text: 'Нефтяные компании дорожают на 15%.' },
  { industry: 'oil',    pct: -0.12, title: 'Зелёная энергетика',         text: 'Нефтяные компании дешевеют на 12%.' },
];

const BOT_NAMES = ['Бот Боря', 'Бот Вера', 'Бот Гоша', 'Бот Даша', 'Бот Женя'];

const PLAYER_COLORS = ['#4c8dff', '#f08c00', '#3fb950', '#ff6b62', '#b197fc'];

const rnd = (n) => Math.floor(Math.random() * n);
const roundTo = (x, step = 100) => Math.round(x / step) * step;
const fmt = (n) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ') + ' $';

class Game {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby';           // lobby | roll | action | over
    this.players = [];              // в порядке ходов
    this.hostId = null;
    this.companies = {};
    for (const cell of BOARD) {
      if (cell.type !== 'company') continue;
      this.companies[cell.id] = {
        id: cell.id, name: cell.name, industry: cell.industry,
        price: cell.price, basePrice: cell.price,
        owners: {},                 // playerId -> число долей (1 доля = 10%)
      };
    }
    this.turnIndex = 0;
    this.globalTurn = 0;
    this.round = 1;
    this.dice = null;
    this.offers = [];               // {id, sellerId, companyId, shares, price}
    this.news = [];                 // ожидающие новости
    this.log = [];
    this.lastEvent = null;
    this.winner = null;
    this.endsAt = null;
    this.turnDeadline = null;
    this.lastMove = null;           // для анимации: кто, откуда, куда, какие кубики
    this.marketEvent = null;        // последнее общее событие рынка
    this.auction = null;            // идущий аукцион: { companyId, minBid, endsAt, bids: {pid: сумма, 0 = пас} }
    this.nextId = 1;
    this.turn = this.freshTurn();
  }

  freshTurn() {
    // doubles — сколько дублей подряд выпало в этот ход; extraRoll — игрок обязан бросить ещё раз
    return { rolled: false, lobbied: false, newsChoice: null, boughtShares: {}, landedOn: null, doubles: 0, extraRoll: false, rumor: false };
  }

  // ---------- Игроки ----------
  addPlayer(id, name) {
    if (this.phase !== 'lobby') throw new Error('Игра уже началась');
    if (this.players.length >= CONFIG.maxPlayers) throw new Error(`В комнате уже ${CONFIG.maxPlayers} игроков`);
    const clean = String(name || '').trim().slice(0, 16) || `Игрок ${this.players.length + 1}`;
    const p = {
      id, name: clean, color: PLAYER_COLORS[this.players.length],
      cash: CONFIG.startCash, pos: 0, bankBought: {}, out: false, online: true,
      knownNews: [],
    };
    this.players.push(p);
    if (!this.hostId) this.hostId = id;
    return p;
  }

  addBot(byId) {
    if (byId !== this.hostId) throw new Error('Добавлять ботов может только создатель комнаты');
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Бот';
    const p = this.addPlayer('bot-' + this.nextId++, name);
    p.isBot = true;
    p.online = true;
    return p;
  }

  removeBot(byId, botId) {
    if (byId !== this.hostId) throw new Error('Убирать ботов может только создатель комнаты');
    const p = this.player(botId);
    if (!p || !p.isBot) throw new Error('Это не бот');
    this.removePlayer(botId);
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') return;
    this.players = this.players.filter((p) => p.id !== id);
    this.players.forEach((p, i) => { p.color = PLAYER_COLORS[i]; });
    if (this.hostId === id) this.hostId = this.players[0] ? this.players[0].id : null;
  }

  player(id) { return this.players.find((p) => p.id === id); }
  current() { return this.players[this.turnIndex]; }
  active() { return this.players.filter((p) => !p.out); }

  start(byId, minutes) {
    if (byId !== this.hostId) throw new Error('Начать игру может только создатель комнаты');
    if (this.phase !== 'lobby') throw new Error('Игра уже идёт');
    if (this.players.length < CONFIG.minPlayers) throw new Error('Нужно минимум 2 игрока');
    const m = Number(minutes) > 0 ? Math.min(Number(minutes), 180) : CONFIG.defaultMinutes;
    this.endsAt = Date.now() + m * 60000;
    this.phase = 'roll';
    this.turnIndex = 0;
    this.addLog(`Игра началась. Цель: ${fmt(CONFIG.winCash)} наличными или ${fmt(CONFIG.winCapital)} капитала. Время: ${m} мин.`);
    this.beginTurn();
  }

  // ---------- Деньги и доли ----------
  sharesOf(pid, cid) { return this.companies[cid].owners[pid] || 0; }
  bankShares(cid) {
    const owners = this.companies[cid].owners;
    return 10 - Object.values(owners).reduce((a, b) => a + b, 0);
  }
  shareValue(cid) { return this.companies[cid].price / 10; }
  portfolioValue(pid) {
    let v = 0;
    for (const c of Object.values(this.companies)) v += (c.owners[pid] || 0) * c.price / 10;
    return Math.round(v);
  }
  capital(pid) { return this.player(pid).cash + this.portfolioValue(pid); }
  setShares(pid, cid, n) {
    const owners = this.companies[cid].owners;
    if (n <= 0) delete owners[pid]; else owners[pid] = n;
  }
  // Сколько долей игрок может продать прямо сейчас (купленное в этот ход продавать нельзя)
  sellable(pid, cid) {
    let locked = 0;
    if (this.current() && this.current().id === pid) locked = this.turn.boughtShares[cid] || 0;
    const listed = this.offers.filter((o) => o.sellerId === pid && o.companyId === cid)
      .reduce((a, o) => a + o.shares, 0);
    return Math.max(0, this.sharesOf(pid, cid) - locked - listed);
  }
  controller(cid) {
    const owners = this.companies[cid].owners;
    for (const [pid, n] of Object.entries(owners)) if (n >= 6) return pid;
    return null;
  }
  setPrice(cid, price) {
    this.companies[cid].price = Math.max(CONFIG.minPrice, roundTo(price));
  }

  // Списать деньги. Если не хватает — продаём доли банку, если и так не хватает — банкротство.
  // Возвращает сколько реально заплачено.
  charge(p, amount, reason) {
    amount = Math.round(amount);
    if (amount <= 0) return 0;
    if (p.cash < amount) this.forceSell(p, amount);
    if (p.cash >= amount) { p.cash -= amount; return amount; }
    const paid = p.cash;
    p.cash = 0;
    this.bankrupt(p, reason);
    return paid;
  }

  forceSell(p, need) {
    // Продаём сначала самые дешёвые доли
    const held = Object.values(this.companies)
      .filter((c) => (c.owners[p.id] || 0) > 0)
      .sort((a, b) => a.price - b.price);
    for (const c of held) {
      while (p.cash < need && (c.owners[p.id] || 0) > 0) {
        this.sellOneToBank(p, c.id, true);
      }
      if (p.cash >= need) break;
    }
  }

  sellOneToBank(p, cid, forced) {
    const c = this.companies[cid];
    const value = roundTo(c.price / 10 * (1 - CONFIG.bankSellDiscount));
    this.setShares(p.id, cid, this.sharesOf(p.id, cid) - 1);
    p.cash += value;
    this.trimOffers(p.id, cid);
    if (forced) this.addLog(`${p.name} вынужденно продал 10% ${c.name} банку за ${fmt(value)}`);
    return value;
  }

  trimOffers(pid, cid) {
    // Если у продавца долей стало меньше, чем выставлено, убираем лишние предложения
    let have = this.sharesOf(pid, cid);
    for (const o of this.offers.filter((x) => x.sellerId === pid && x.companyId === cid)) {
      if (o.shares <= have) { have -= o.shares; } else { o.dead = true; }
    }
    this.offers = this.offers.filter((o) => !o.dead);
  }

  bankrupt(p, reason) {
    if (p.out) return;
    p.out = true;
    for (const c of Object.values(this.companies)) delete c.owners[p.id];
    this.offers = this.offers.filter((o) => o.sellerId !== p.id);
    this.addLog(`${p.name} обанкротился (${reason}) и выбывает. Его доли вернулись банку.`);
    const left = this.active();
    if (left.length === 1) this.finish(left[0], 'остался последним');
  }

  // ---------- Ход ----------
  beginTurn() {
    if (this.phase === 'over') return;
    const p = this.current();
    this.turn = this.freshTurn();
    this.dice = null;
    this.phase = 'roll';
    this.turnDeadline = Date.now() + CONFIG.turnSeconds * 1000;
    this.fireNews();
    if (this.phase === 'over') return;
    if (p.out) { this.advance(); return; }
    // Победа проверяется в начале своего хода
    if (p.cash >= CONFIG.winCash) return this.finish(p, `собрал ${fmt(p.cash)} наличными`);
    if (this.capital(p.id) >= CONFIG.winCapital) return this.finish(p, `капитал ${fmt(this.capital(p.id))}`);
  }

  roll(pid) {
    this.requireTurn(pid);
    if (this.turn.rolled && !this.turn.extraRoll) throw new Error('Вы уже бросили кубики');
    if (this.turn.newsChoice) throw new Error('Сначала выберите новость');
    if (this.auction) throw new Error('Дождитесь конца аукциона');
    const p = this.current();
    const d1 = rnd(6) + 1, d2 = rnd(6) + 1;
    this.dice = [d1, d2];
    this.turn.rolled = true;
    this.turn.extraRoll = false;
    const isDouble = d1 === d2;
    if (isDouble) this.turn.doubles++;
    const from = p.pos;
    // Третий дубль подряд: фишка не идёт, вместо этого игрок выбирает секретную новость, и ход заканчивается
    if (isDouble && this.turn.doubles >= CONFIG.doublesForNews) {
      this.lastMove = { id: this.nextId++, pid: p.id, from, to: from, dice: [d1, d2] };
      this.phase = 'action';
      this.turn.newsChoice = this.makeNewsOptions();
      this.lastEvent = { title: 'Третий дубль подряд!', text: `${p.name} выбросил ${d1}–${d2} третий раз подряд. Вместо хода — секретная новость`, pid: p.id };
      this.addLog(`${p.name}: третий дубль подряд, вместо хода выбирает секретную новость`);
      return;
    }
    p.pos = (p.pos + d1 + d2) % BOARD.length;
    this.lastMove = { id: this.nextId++, pid: p.id, from, to: p.pos, dice: [d1, d2] };
    if (p.pos < from || p.pos === 0) {
      p.cash += CONFIG.salary;
      this.addLog(`${p.name} прошёл Старт: +${fmt(CONFIG.salary)}`);
    }
    this.phase = 'action';
    this.turn.landedOn = p.pos;
    this.resolveCell(p);
    if (p.out && this.phase !== 'over') { this.advance(); return; }
    if (isDouble && this.phase === 'action') {
      // Дубль: после этой клетки игрок ходит ещё раз, на новый ход — новые 90 секунд
      this.turn.extraRoll = true;
      this.turn.lobbied = false;
      this.turnDeadline = Date.now() + CONFIG.turnSeconds * 1000;
      this.lastEvent = { ...this.lastEvent, title: `Дубль ${d1}–${d2}! ${this.lastEvent ? this.lastEvent.title : ''}`.trim(), text: `${this.lastEvent ? this.lastEvent.text + '. ' : ''}Ходит ещё раз.` };
      this.addLog(`${p.name}: дубль ${d1}–${d2}, ходит ещё раз`);
    }
  }

  resolveCell(p) {
    const cell = BOARD[p.pos];
    const ev = (title, text) => { this.lastEvent = { title, text, pid: p.id }; this.addLog(`${p.name}: ${text}`); };
    switch (cell.type) {
      case 'start': ev('Старт', 'остановился на Старте'); break;
      case 'company': {
        const c = this.companies[cell.id];
        const mult = this.controller(c.id) ? 2 : 1;
        const rent = Math.round(c.price * CONFIG.rentRate * mult);
        const parts = [];
        let total = 0;
        for (const [oid, n] of Object.entries(c.owners)) {
          if (oid === p.id) continue;
          total += Math.round(rent * n / 10);
        }
        if (total === 0) {
          ev(c.name, `встал на ${c.name}, аренду платить некому`);
          break;
        }
        const paid = this.charge(p, total, `аренда ${c.name}`);
        const ratio = total ? paid / total : 0;
        for (const [oid, n] of Object.entries(c.owners)) {
          if (oid === p.id) continue;
          const owner = this.player(oid);
          const part = Math.round(rent * n / 10 * ratio);
          owner.cash += part;
          parts.push(`${owner.name} ${fmt(part)}`);
        }
        ev(c.name, `встал на ${c.name}, аренда${mult === 2 ? ' ×2 (контрольный пакет)' : ''}: ${parts.join(', ')}. Итого −${fmt(paid)}`);
        break;
      }
      case 'news': {
        this.turn.newsChoice = this.makeNewsOptions();
        ev('Новости', 'попал на клетку «Новости» и выбирает секретную новость');
        break;
      }
      case 'tax': {
        const paid = this.charge(p, CONFIG.taxCell, 'налог');
        ev('Налог', `заплатил налог −${fmt(paid)}`);
        break;
      }
      case 'bankdeal': {
        p.cash += CONFIG.bankDeal;
        ev('Сделка с банком', `заключил сделку с банком: +${fmt(CONFIG.bankDeal)}`);
        break;
      }
      case 'audit': {
        const due = Math.round(this.portfolioValue(p.id) * CONFIG.auditRate);
        const paid = this.charge(p, due, 'налоговая проверка');
        ev('Налоговая проверка', `налоговая проверка: −${fmt(paid)} (10% от стоимости долей)`);
        break;
      }
      case 'dividends': {
        const amount = Math.round(this.portfolioValue(p.id) * CONFIG.dividendRate / 100) * 100;
        p.cash += amount;
        ev('Дивиденды', amount > 0 ? `получил дивиденды +${fmt(amount)} (5% от стоимости своих долей)` : 'пришёл за дивидендами, но долей у него нет');
        break;
      }
      case 'rumor': {
        this.turn.rumor = true;
        ev('Слух', 'может пустить слух: поднять или уронить цену любой компании на 10%');
        break;
      }
      case 'auction': {
        const free = Object.values(this.companies).filter((c) => this.bankShares(c.id) > 0);
        if (!free.length) { ev('Аукцион', 'пришёл на аукцион, но у банка не осталось свободных долей'); break; }
        const c = free[rnd(free.length)];
        this.auction = { id: this.nextId++, companyId: c.id, starterId: p.id,
          minBid: Math.round(c.price / 10 * CONFIG.auctionMinRate / 500) * 500,
          endsAt: Date.now() + CONFIG.auctionSeconds * 1000, bids: {} };
        ev('Аукцион', `открыл аукцион: банк продаёт 10% ${c.name}. Все делают тайные ставки`);
        break;
      }
      case 'exchange': {
        ev('Биржевые торги', 'на биржевых торгах: можно продать доли банку по цене −10%');
        break;
      }
    }
  }

  endTurn(pid) {
    this.requireTurn(pid);
    if (!this.turn.rolled) throw new Error('Сначала бросьте кубики');
    if (this.turn.newsChoice) throw new Error('Сначала выберите новость');
    if (this.turn.extraRoll) throw new Error('У вас дубль — бросайте кубики ещё раз');
    if (this.auction) throw new Error('Дождитесь конца аукциона');
    this.advance();
  }

  // ---------- Слух ----------
  rumor(pid, cid, dir) {
    this.requireTurn(pid);
    if (!this.turn.rumor) throw new Error('Пустить слух можно, только встав на клетку «Слух»');
    const c = this.companies[cid];
    if (!c) throw new Error('Выберите компанию');
    const up = dir !== 'down';
    this.setPrice(cid, c.price * (up ? 1 + CONFIG.rumorEffect : 1 - CONFIG.rumorEffect));
    this.turn.rumor = false;
    this.lastEvent = { title: 'Слух', text: `${this.player(pid).name} пустил слух: ${c.name} ${up ? 'дорожает' : 'дешевеет'} на 10%, теперь ${fmt(c.price)}`, pid };
    this.addLog(this.lastEvent.text);
  }
  skipRumor(pid) {
    this.requireTurn(pid);
    this.turn.rumor = false;
  }

  // ---------- Аукцион ----------
  bid(pid, amount) {
    const a = this.auction;
    if (!a) throw new Error('Аукциона сейчас нет');
    const p = this.player(pid);
    if (!p || p.out) throw new Error('Вы не в игре');
    if (pid in a.bids) throw new Error('Вы уже сделали ставку');
    amount = Math.round(Number(amount));
    if (amount !== 0) {
      if (!(amount >= a.minBid)) throw new Error(`Минимальная ставка ${fmt(a.minBid)}`);
      if (amount > p.cash) throw new Error('Столько наличных у вас нет');
    }
    a.bids[pid] = amount;
    if (this.active().every((x) => x.id in a.bids)) this.resolveAuction();
  }
  resolveAuction() {
    const a = this.auction;
    if (!a) return;
    this.auction = null;
    const c = this.companies[a.companyId];
    // при равных ставках выигрывает тот, кто раньше по очереди хода, начиная с открывшего аукцион
    const order = this.players.map((p, i) => ({ p, i })).filter((x) => !x.p.out);
    const startIdx = this.players.findIndex((p) => p.id === a.starterId);
    order.sort((x, y) => ((x.i - startIdx + 99) % this.players.length) - ((y.i - startIdx + 99) % this.players.length));
    const bids = order.map((x) => ({ p: x.p, v: a.bids[x.p.id] || 0 })).filter((b) => b.v > 0)
      .sort((x, y) => y.v - x.v);
    const reveal = order.map((x) => `${x.p.name}: ${a.bids[x.p.id] ? fmt(a.bids[x.p.id]) : 'пас'}`).join(', ');
    const win = bids.find((b) => b.p.cash >= b.v);
    if (!win || this.bankShares(c.id) <= 0) {
      this.lastEvent = { title: 'Аукцион', text: `Никто не купил 10% ${c.name}. Ставки: ${reveal}`, pid: null };
    } else {
      win.p.cash -= win.v;
      this.setShares(win.p.id, c.id, this.sharesOf(win.p.id, c.id) + 1);
      if (this.current() && this.current().id === win.p.id) this.turn.boughtShares[c.id] = (this.turn.boughtShares[c.id] || 0) + 1;
      this.lastEvent = { title: 'Аукцион', text: `${win.p.name} купил 10% ${c.name} за ${fmt(win.v)} (по рынку ${fmt(c.price / 10)}). Ставки: ${reveal}`, pid: null };
    }
    this.addLog(this.lastEvent.text);
  }
  // Время аукциона вышло — кто не поставил, тот пас
  tickAuction(now) {
    if (!this.auction || now < this.auction.endsAt) return false;
    this.resolveAuction();
    return true;
  }

  // Пропустить ход игрока, который отключился
  skipTurn(byId) {
    const p = this.current();
    if (!p || p.online) throw new Error('Пропустить можно только ход отключившегося игрока');
    if (!this.player(byId)) throw new Error('Вы не в этой игре');
    if (this.turn.newsChoice) this.turn.newsChoice = null;
    this.addLog(`Ход ${p.name} пропущен: игрок не в сети`);
    this.advance();
  }

  advance() {
    if (this.phase === 'over') return;
    if (this.endsAt && Date.now() >= this.endsAt) return this.finishByTime();
    const n = this.players.length;
    let i = this.turnIndex;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (i === 0) this.newRound();
      if (!this.players[i].out) break;
    }
    this.turnIndex = i;
    this.globalTurn++;
    this.beginTurn();
  }

  newRound() {
    this.round++;
    // Рынок живёт сам: небольшие случайные колебания всех цен
    for (const c of Object.values(this.companies)) {
      const k = 1 + CONFIG.driftUp + (Math.random() * 2 - 1) * CONFIG.driftPct;
      this.setPrice(c.id, c.price * k);
    }
    // Иногда — общее событие рынка
    if (Math.random() < CONFIG.marketEventChance) {
      const e = MARKET_EVENTS[rnd(MARKET_EVENTS.length)];
      for (const c of Object.values(this.companies)) {
        if (!e.industry || c.industry === e.industry) this.setPrice(c.id, c.price * (1 + e.pct));
      }
      this.marketEvent = { round: this.round, title: e.title, text: e.text, up: e.pct > 0, industry: e.industry };
      this.addLog(`РЫНОК, круг ${this.round}: ${e.title}. ${e.text}`);
    } else {
      this.addLog(`Круг ${this.round}: цены немного сдвинулись`);
    }
  }

  // Время хода вышло: бросаем кубики за игрока, выбираем новость наугад и передаём ход
  autoTimeout(now) {
    if (this.phase !== 'roll' && this.phase !== 'action') return false;
    if (!this.turnDeadline || now < this.turnDeadline) return false;
    const p = this.current();
    this.addLog(`${p.name}: время хода вышло`);
    if (this.auction) this.resolveAuction();
    if (!this.turn.rolled) {
      this.roll(p.id);
      if (this.phase === 'over' || this.current() !== p) return true;
    }
    if (this.turn.newsChoice) this.chooseNews(p.id, rnd(this.turn.newsChoice.length));
    if (this.auction) this.resolveAuction();
    this.advance();   // дополнительный бросок за дубль при этом сгорает
    return true;
  }

  requireTurn(pid) {
    if (this.phase === 'lobby') throw new Error('Игра ещё не началась');
    if (this.phase === 'over') throw new Error('Игра окончена');
    const p = this.current();
    if (!p || p.id !== pid) throw new Error('Сейчас не ваш ход');
  }

  // ---------- Покупка у банка ----------
  buyFromBank(pid, cid) {
    this.requireTurn(pid);
    const p = this.current();
    const cell = BOARD[p.pos];
    if (!this.turn.rolled || cell.type !== 'company' || cell.id !== cid) throw new Error('Купить у банка можно только компанию, на клетке которой вы стоите');
    const c = this.companies[cid];
    if (this.bankShares(cid) <= 0) throw new Error('У банка не осталось свободных долей');
    if ((p.bankBought[cid] || 0) >= CONFIG.bankLimitShares) throw new Error('У банка можно купить не больше 20% одной компании. Остальное — только у игроков');
    const cost = Math.round(c.price / 10);
    if (p.cash < cost) throw new Error('Не хватает наличных');
    p.cash -= cost;
    this.setShares(pid, cid, this.sharesOf(pid, cid) + 1);
    p.bankBought[cid] = (p.bankBought[cid] || 0) + 1;
    this.turn.boughtShares[cid] = (this.turn.boughtShares[cid] || 0) + 1;
    this.addLog(`${p.name} купил 10% ${c.name} у банка за ${fmt(cost)}`);
  }

  // ---------- Продажа банку (угол «Биржевые торги») ----------
  sellToBank(pid, cid) {
    this.requireTurn(pid);
    const p = this.current();
    if (!this.turn.rolled || BOARD[p.pos].type !== 'exchange') throw new Error('Продать банку можно, только стоя на клетке «Биржевые торги»');
    if (this.sellable(pid, cid) <= 0) throw new Error('Нет долей, которые можно продать');
    const v = this.sellOneToBank(p, cid, false);
    this.addLog(`${p.name} продал 10% ${this.companies[cid].name} банку за ${fmt(v)}`);
  }

  // ---------- Лоббирование ----------
  lobby(pid, cid, dir) {
    this.requireTurn(pid);
    if (this.turn.lobbied) throw new Error('Лоббировать можно только один раз за ход');
    const p = this.current();
    const c = this.companies[cid];
    if (!c) throw new Error('Нет такой компании');
    const cost = Math.round(c.price * CONFIG.lobbyRate);
    if (p.cash < cost) throw new Error('Не хватает наличных');
    p.cash -= cost;
    this.turn.lobbied = true;
    const die = rnd(6) + 1;
    const up = dir !== 'down';
    if (die >= 4) {
      this.setPrice(cid, c.price * (up ? 1 + CONFIG.lobbyEffect : 1 - CONFIG.lobbyEffect));
      this.lastEvent = { title: 'Лоббирование', text: `${p.name} лоббировал ${c.name}: выпало ${die}, успех! Цена ${up ? 'выросла' : 'упала'} до ${fmt(c.price)}`, pid };
    } else {
      this.lastEvent = { title: 'Лоббирование', text: `${p.name} лоббировал ${c.name}: выпало ${die}, не вышло. Потрачено ${fmt(cost)}`, pid };
    }
    this.addLog(this.lastEvent.text);
  }

  // ---------- Торговля между игроками ----------
  placeOffer(pid, cid, shares, price) {
    const p = this.player(pid);
    if (!p || p.out) throw new Error('Вы не в игре');
    if (this.phase === 'lobby' || this.phase === 'over') throw new Error('Сейчас нельзя торговать');
    if (!this.companies[cid]) throw new Error('Нет такой компании');
    shares = Math.floor(Number(shares));
    price = Math.round(Number(price));
    if (!(shares >= 1)) throw new Error('Укажите, сколько долей продаёте');
    if (!(price >= 1000)) throw new Error('Цена должна быть не меньше 1 000 $');
    if (shares > this.sellable(pid, cid)) throw new Error('Столько долей выставить нельзя (купленное в этот ход продавать нельзя)');
    this.offers.push({ id: this.nextId++, sellerId: pid, companyId: cid, shares, price });
    this.addLog(`${p.name} выставил ${shares * 10}% ${this.companies[cid].name} за ${fmt(price)}`);
  }

  cancelOffer(pid, offerId) {
    const o = this.offers.find((x) => x.id === Number(offerId));
    if (!o || o.sellerId !== pid) throw new Error('Предложение не найдено');
    this.offers = this.offers.filter((x) => x !== o);
  }

  buyOffer(pid, offerId) {
    this.requireTurn(pid);
    const o = this.offers.find((x) => x.id === Number(offerId));
    if (!o) throw new Error('Предложение уже снято');
    if (o.sellerId === pid) throw new Error('Нельзя купить свою же долю');
    const buyer = this.player(pid), seller = this.player(o.sellerId);
    if (buyer.cash < o.price) throw new Error('Не хватает наличных');
    if (this.sharesOf(seller.id, o.companyId) < o.shares) { this.trimOffers(seller.id, o.companyId); throw new Error('У продавца уже нет этих долей'); }
    buyer.cash -= o.price;
    seller.cash += o.price;
    this.setShares(seller.id, o.companyId, this.sharesOf(seller.id, o.companyId) - o.shares);
    this.setShares(buyer.id, o.companyId, this.sharesOf(buyer.id, o.companyId) + o.shares);
    this.turn.boughtShares[o.companyId] = (this.turn.boughtShares[o.companyId] || 0) + o.shares;
    this.offers = this.offers.filter((x) => x !== o);
    this.addLog(`${buyer.name} купил у ${seller.name} ${o.shares * 10}% ${this.companies[o.companyId].name} за ${fmt(o.price)}`);
  }

  // ---------- Новости ----------
  makeNewsOptions() {
    const ids = Object.keys(this.companies);
    const inds = Object.keys(INDUSTRIES);
    const kinds = ['contract', 'scandal', 'boom', 'industryTax', 'merger'];
    const out = [];
    // три разных вида новостей в случайном порядке
    const pool = [...kinds];
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    for (const kind of pool.slice(0, 3)) {
      if (kind === 'contract' || kind === 'scandal') {
        const c = this.companies[ids[rnd(ids.length)]];
        const up = kind === 'contract';
        out.push({ kind, industry: c.industry, company: c.id,
          title: up ? `Новый контракт у ${c.name}` : `Скандал в ${c.name}`,
          effect: up ? '+20%' : '−20%', up,
          text: `Цена ${c.name} ${up ? 'вырастет' : 'упадёт'} на 20%.` });
      } else {
        const ind = inds[rnd(inds.length)];
        const names = Object.values(this.companies).filter((c) => c.industry === ind).map((c) => c.name);
        if (kind === 'boom') out.push({ kind, industry: ind, title: `Бум: ${INDUSTRIES[ind].name}`, effect: '+10%', up: true,
          text: `${names.join(', ')} вырастут на 10%.` });
        if (kind === 'industryTax') out.push({ kind, industry: ind, title: `Налог на отрасль «${INDUSTRIES[ind].name}»`, effect: '−5%', up: false,
          text: `Владельцы долей ${names.join(', ')} заплатят 5% от их стоимости.` });
        if (kind === 'merger') out.push({ kind, industry: ind, title: `Слияние: ${INDUSTRIES[ind].name}`, effect: '⇄', up: null,
          text: `Две компании отрасли поменяются ценами.` });
      }
    }
    return out;
  }

  chooseNews(pid, idx) {
    this.requireTurn(pid);
    const opts = this.turn.newsChoice;
    if (!opts) throw new Error('Сейчас нечего выбирать');
    const o = opts[Number(idx)];
    if (!o) throw new Error('Нет такой новости');
    const delay = CONFIG.newsDelayRounds * this.active().length;
    this.news.push({ ...o, id: this.nextId++, chooserId: pid, triggerTurn: this.globalTurn + delay, knownBy: [pid] });
    this.turn.newsChoice = null;
    this.addLog(`${this.player(pid).name} выбрал новость. Через 2 круга что-то случится с отраслью «${INDUSTRIES[o.industry].name}»`);
  }

  fireNews() {
    const due = this.news.filter((n) => this.globalTurn >= n.triggerTurn);
    this.news = this.news.filter((n) => this.globalTurn < n.triggerTurn);
    for (const n of due) {
      const inInd = Object.values(this.companies).filter((c) => c.industry === n.industry);
      if (n.kind === 'contract') this.setPrice(n.company, this.companies[n.company].price * 1.2);
      if (n.kind === 'scandal') this.setPrice(n.company, this.companies[n.company].price * 0.8);
      if (n.kind === 'boom') inInd.forEach((c) => this.setPrice(c.id, c.price * 1.1));
      if (n.kind === 'merger' && inInd.length >= 2) {
        const a = inInd[rnd(inInd.length)];
        let b = a; while (b === a) b = inInd[rnd(inInd.length)];
        const t = a.price; a.price = b.price; b.price = t;
        n.text = `${a.name} и ${b.name} поменялись ценами.`;
      }
      this.lastEvent = { title: 'Новость сработала', text: `${n.title}. ${n.text}`, pid: null };
      this.addLog(`НОВОСТЬ: ${n.title}. ${n.text}`);
      if (n.kind === 'industryTax') {
        for (const p of this.active()) {
          let v = 0;
          for (const c of inInd) v += (c.owners[p.id] || 0) * c.price / 10;
          if (v > 0) this.charge(p, v * 0.05, 'налог на отрасль');
          if (this.phase === 'over') return;
        }
      }
    }
  }

  // ---------- Конец игры ----------
  finish(p, why) {
    this.phase = 'over';
    this.winner = { id: p.id, name: p.name, why };
    this.addLog(`ПОБЕДА: ${p.name} — ${why}!`);
  }

  finishByTime() {
    const best = this.active().sort((a, b) => this.capital(b.id) - this.capital(a.id))[0];
    this.finish(best, `время вышло, самый большой капитал: ${fmt(this.capital(best.id))}`);
  }

  addLog(text) {
    this.log.push({ t: Date.now(), text });
    if (this.log.length > 60) this.log.shift();
  }

  // ---------- Что видит конкретный игрок ----------
  viewFor(pid) {
    const me = this.player(pid);
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      me: pid,
      config: { winCash: CONFIG.winCash, winCapital: CONFIG.winCapital, maxPlayers: CONFIG.maxPlayers,
        bankLimitShares: CONFIG.bankLimitShares, lobbyRate: CONFIG.lobbyRate, bankSellDiscount: CONFIG.bankSellDiscount,
        taxCell: CONFIG.taxCell, bankDeal: CONFIG.bankDeal, salary: CONFIG.salary, rentRate: CONFIG.rentRate },
      board: BOARD,
      industries: INDUSTRIES,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, cash: p.cash, pos: p.pos, out: p.out, online: p.online, isBot: !!p.isBot,
        capital: this.capital(p.id), shares: this.portfolioValue(p.id),
        bankBought: p.bankBought,
        knowsNews: this.news.some((n) => n.chooserId === p.id),
      })),
      companies: this.companies,
      turnIndex: this.turnIndex,
      currentId: this.current() ? this.current().id : null,
      round: this.round,
      dice: this.dice,
      turn: (this.current() && this.current().id === pid)
        ? this.turn
        : { rolled: this.turn.rolled, lobbied: this.turn.lobbied, newsChoice: null, boughtShares: {}, landedOn: this.turn.landedOn, choosing: !!this.turn.newsChoice, extraRoll: this.turn.extraRoll, doubles: this.turn.doubles, rumor: this.turn.rumor },
      offers: this.offers,
      auction: this.auction ? {
        id: this.auction.id, companyId: this.auction.companyId, starterId: this.auction.starterId,
        minBid: this.auction.minBid, endsAt: this.auction.endsAt,
        bidders: Object.keys(this.auction.bids), myBid: pid in this.auction.bids ? this.auction.bids[pid] : null,
      } : null,
      news: this.news.map((n) => {
        const known = me && n.knownBy.includes(pid);
        const turnsLeft = Math.max(0, n.triggerTurn - this.globalTurn);
        return known
          ? { id: n.id, industry: n.industry, turnsLeft, known: true, title: n.title, text: n.text, effect: n.effect, up: n.up, chooserId: n.chooserId }
          : { id: n.id, industry: n.industry, turnsLeft, known: false, chooserId: n.chooserId };
      }),
      log: this.log.slice(-30),
      lastEvent: this.lastEvent,
      winner: this.winner,
      endsAt: this.endsAt,
      turnDeadline: this.turnDeadline,
      turnSeconds: CONFIG.turnSeconds,
      lastMove: this.lastMove,
      marketEvent: this.marketEvent,
      now: Date.now(),
    };
  }
}

module.exports = { Game, CONFIG, BOARD, INDUSTRIES };
