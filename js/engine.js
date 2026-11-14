/* Avalon — игровой движок (правила). Чистая логика, без DOM.
   Работает и в браузере (window.AvalonEngine), и в Node (module.exports). */
(function (root) {
  'use strict';

  const ROLES = {
    merlin:   { name: 'Мерлин', side: 'good', short: 'Видит зло (кроме Мордреда). Если Убийца его вычислит — добро проиграет.' },
    percival: { name: 'Персиваль', side: 'good', short: 'Видит Мерлина и Моргану, но не знает, кто из них кто.' },
    servant:  { name: 'Верный слуга Артура', side: 'good', short: 'Ничего не знает. Ищите зло по голосованиям и походам.' },
    assassin: { name: 'Убийца', side: 'evil', short: 'Видит союзников. Если добро победит в 3 походах — у вас один выстрел в Мерлина.' },
    morgana:  { name: 'Моргана', side: 'evil', short: 'Видит союзников. Для Персиваля выглядит как Мерлин.' },
    mordred:  { name: 'Мордред', side: 'evil', short: 'Видит союзников. Скрыт от Мерлина.' },
    oberon:   { name: 'Оберон', side: 'evil', short: 'Не знает союзников, а они не знают его. Мерлин его видит.' },
    minion:   { name: 'Приспешник Мордреда', side: 'evil', short: 'Видит союзников. Саботируйте походы, не выдавая себя.' },
  };

  // [добро, зло]
  const SETUP = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };
  const QUESTS = {
    5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5],
  };
  const MIN_PLAYERS = 5, MAX_PLAYERS = 10;
  const failsNeeded = (n, q) => (n >= 7 && q === 3 ? 2 : 1);

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function newState() {
    return {
      phase: 'lobby',
      players: [],
      settings: { percival: true, morgana: true, mordred: false, oberon: false, lady: false },
      chat: [],
      log: [],
      gameNo: 0,
      seq: 0,
    };
  }

  function evilSpecials(settings) {
    return ['assassin'].concat(['morgana', 'mordred', 'oberon'].filter(r => settings[r]));
  }

  function setupProblem(S) {
    const n = S.players.length;
    if (n < MIN_PLAYERS) return `Нужно минимум ${MIN_PLAYERS} игроков (сейчас ${n})`;
    if (n > MAX_PLAYERS) return `Максимум ${MAX_PLAYERS} игроков`;
    const e = SETUP[n][1];
    const sp = evilSpecials(S.settings);
    if (sp.length > e) return `Слишком много ролей зла: ${sp.length} при ${e} местах. Отключите кого-то из Морганы/Мордреда/Оберона.`;
    return null;
  }

  function buildRoles(n, settings) {
    const [g, e] = SETUP[n];
    const good = ['merlin'];
    if (settings.percival) good.push('percival');
    while (good.length < g) good.push('servant');
    const evil = evilSpecials(settings).slice(0, e);
    while (evil.length < e) evil.push('minion');
    return shuffle(good.concat(evil));
  }

  const sideOf = r => ROLES[r].side;
  const idx = (S, id) => S.players.findIndex(p => p.id === id);
  const pname = (S, id) => { const p = S.players.find(p => p.id === id); return p ? p.name : '?'; };
  function log(S, text, kind) { S.log.push({ t: Date.now(), text, kind: kind || 'info' }); if (S.log.length > 200) S.log.shift(); }

  function startGame(S) {
    const n = S.players.length;
    const roles = buildRoles(n, S.settings);
    S.roles = {};
    S.players.forEach((p, i) => (S.roles[p.id] = roles[i]));
    S.leader = Math.floor(Math.random() * n);
    S.questNum = 0;
    S.quests = QUESTS[n].map((size, i) => ({ size, need: failsNeeded(n, i), result: null, fails: 0, team: [] }));
    S.reject = 0;
    S.team = [];
    S.votes = {};
    S.cards = {};
    S.lastCards = null;
    S.voteApproved = null;
    S.history = [];
    S.ready = {};
    S.winner = null;
    S.reason = null;
    S.assassinTarget = null;
    S.lady = S.settings.lady
      ? { holder: S.players[(S.leader - 1 + n) % n].id, prev: [S.players[(S.leader - 1 + n) % n].id], checks: [] }
      : null;
    S.gameNo++;
    S.log = [];
    S.phase = 'reveal';
    log(S, `Игра началась: ${n} игроков. Первый лидер — ${S.players[S.leader].name}.`, 'big');
  }

  function endGame(S, winner, reason) {
    S.winner = winner;
    S.reason = reason;
    S.phase = 'end';
    log(S, (winner === 'good' ? 'Победа добра! ' : 'Победа зла! ') + reason, 'big');
  }

  function nextRound(S) {
    S.questNum++;
    S.reject = 0;
    S.leader = (S.leader + 1) % S.players.length;
    S.team = [];
    S.phase = 'team';
  }

  // Переходы после показа результатов (вызывает хост по таймеру)
  function advance(S) {
    if (S.phase === 'voteResult') {
      if (S.voteApproved) {
        S.phase = 'quest';
        S.cards = {};
      } else {
        S.reject++;
        if (S.reject >= 5) return endGame(S, 'evil', 'Пять составов подряд отклонены.');
        S.leader = (S.leader + 1) % S.players.length;
        S.team = [];
        S.phase = 'team';
      }
      return true;
    }
    if (S.phase === 'questResult') {
      const succ = S.quests.filter(q => q.result === 'success').length;
      const fail = S.quests.filter(q => q.result === 'fail').length;
      if (fail >= 3) return endGame(S, 'evil', 'Три похода провалены.');
      if (succ >= 3) {
        S.phase = 'assassin';
        log(S, 'Добро выиграло три похода! Убийца выбирает, кто Мерлин…', 'big');
        return true;
      }
      if (S.lady && S.questNum >= 1 && S.questNum <= 3) {
        S.phase = 'lady';
        return true;
      }
      nextRound(S);
      return true;
    }
    return false;
  }

  // Применить действие игрока. Возвращает строку-ошибку или null.
  function apply(S, pid, a, isHost) {
    const n = S.players.length;
    const me = S.players.find(p => p.id === pid);
    const role = S.roles ? S.roles[pid] : null;
    S.seq++;
    switch (a.type) {
      case 'settings': {
        if (!isHost || S.phase !== 'lobby') return 'Нельзя';
        for (const k of ['percival', 'morgana', 'mordred', 'oberon', 'lady'])
          if (k in a.settings) S.settings[k] = !!a.settings[k];
        return null;
      }
      case 'start': {
        if (!isHost || S.phase !== 'lobby') return 'Нельзя';
        const p = setupProblem(S);
        if (p) return p;
        startGame(S);
        return null;
      }
      case 'newGame': {
        if (!isHost || S.phase !== 'end') return 'Нельзя';
        S.phase = 'lobby';
        S.roles = null;
        return null;
      }
      case 'abort': {
        if (!isHost) return 'Нельзя';
        S.phase = 'lobby';
        S.roles = null;
        log(S, 'Хост прервал игру.', 'big');
        return null;
      }
      case 'ready': {
        if (S.phase !== 'reveal' || !me) return 'Нельзя';
        S.ready[pid] = true;
        if (S.players.every(p => S.ready[p.id])) { S.phase = 'team'; }
        return null;
      }
      case 'skipReveal': {
        if (!isHost || S.phase !== 'reveal') return 'Нельзя';
        S.phase = 'team';
        return null;
      }
      case 'setTeam': {
        if (S.phase !== 'team' || S.players[S.leader].id !== pid) return 'Состав выбирает лидер';
        const size = S.quests[S.questNum].size;
        const t = [...new Set(a.team)].filter(id => idx(S, id) >= 0);
        if (t.length > size) return `В походе только ${size} мест`;
        S.team = t;
        return null;
      }
      case 'propose': {
        if (S.phase !== 'team' || S.players[S.leader].id !== pid) return 'Состав выбирает лидер';
        if (a.team) {
          const e = apply(S, pid, { type: 'setTeam', team: a.team }, isHost);
          if (e) return e;
        }
        const size = S.quests[S.questNum].size;
        if (S.team.length !== size) return `Выберите ровно ${size} участников`;
        S.votes = {};
        S.phase = 'vote';
        log(S, `${pname(S, pid)} предлагает: ${S.team.map(id => pname(S, id)).join(', ')}.`);
        return null;
      }
      case 'vote': {
        if (S.phase !== 'vote' || !me) return 'Сейчас не голосование';
        if (pid in S.votes) return 'Вы уже проголосовали';
        S.votes[pid] = !!a.approve;
        if (Object.keys(S.votes).length === n) {
          const yes = Object.values(S.votes).filter(Boolean).length;
          S.voteApproved = yes > n / 2;
          S.history.push({
            quest: S.questNum, attempt: S.reject + 1, leader: S.players[S.leader].id,
            team: S.team.slice(), votes: Object.assign({}, S.votes), approved: S.voteApproved,
          });
          log(S, `Голосование: ${yes} за, ${n - yes} против — ${S.voteApproved ? 'состав одобрен' : 'состав отклонён'}.`, S.voteApproved ? 'good' : 'warn');
          S.phase = 'voteResult';
        }
        return null;
      }
      case 'quest': {
        if (S.phase !== 'quest' || !S.team.includes(pid)) return 'Вы не в походе';
        if (pid in S.cards) return 'Вы уже сыграли карту';
        if (!a.success && sideOf(role) === 'good') return 'Силы добра могут играть только «Успех»';
        S.cards[pid] = a.success ? 'S' : 'F';
        if (Object.keys(S.cards).length === S.team.length) {
          const q = S.quests[S.questNum];
          const fails = Object.values(S.cards).filter(c => c === 'F').length;
          q.fails = fails;
          q.team = S.team.slice();
          q.result = fails >= q.need ? 'fail' : 'success';
          S.lastCards = shuffle(Object.values(S.cards));
          log(S, `Поход ${S.questNum + 1}: ${q.result === 'success' ? 'УСПЕХ' : 'ПРОВАЛ'} (провалов: ${fails}).`, q.result === 'success' ? 'good' : 'evil');
          S.phase = 'questResult';
        }
        return null;
      }
      case 'lady': {
        if (S.phase !== 'lady' || S.lady.holder !== pid) return 'Владычица не у вас';
        const t = a.target;
        if (t === pid || idx(S, t) < 0) return 'Неверная цель';
        if (S.lady.prev.includes(t)) return 'Этот игрок уже держал Владычицу';
        S.lady.checks.push({ by: pid, target: t, side: sideOf(S.roles[t]), quest: S.questNum });
        log(S, `${pname(S, pid)} проверил(а) верность игрока ${pname(S, t)} с помощью Владычицы Озера.`, 'info');
        S.lady.holder = t;
        S.lady.prev.push(t);
        nextRound(S);
        return null;
      }
      case 'assassinate': {
        if (S.phase !== 'assassin' || role !== 'assassin') return 'Стреляет только Убийца';
        const t = a.target;
        if (idx(S, t) < 0 || t === pid) return 'Неверная цель';
        S.assassinTarget = t;
        if (S.roles[t] === 'merlin') endGame(S, 'evil', `Убийца раскрыл Мерлина — это ${pname(S, t)}.`);
        else endGame(S, 'good', `Убийца выбрал ${pname(S, t)}, но это не Мерлин.`);
        return null;
      }
    }
    return 'Неизвестное действие';
  }

  // Что видит конкретный игрок о других
  function knowledge(S, pid) {
    const r = S.roles && S.roles[pid];
    if (!r) return [];
    const out = [];
    for (const p of S.players) {
      if (p.id === pid) continue;
      const o = S.roles[p.id];
      if (r === 'merlin' && sideOf(o) === 'evil' && o !== 'mordred') out.push({ id: p.id, tag: 'evil' });
      else if (r === 'percival' && (o === 'merlin' || o === 'morgana')) out.push({ id: p.id, tag: 'magic' });
      else if (sideOf(r) === 'evil' && r !== 'oberon' && sideOf(o) === 'evil' && o !== 'oberon') out.push({ id: p.id, tag: 'evil' });
    }
    return out;
  }

  function viewFor(S, pid) {
    const inGame = !!S.roles;
    const v = {
      phase: S.phase, seq: S.seq, gameNo: S.gameNo,
      players: S.players.map(p => ({ id: p.id, name: p.name, bot: !!p.bot, connected: p.connected !== false, host: !!p.host })),
      settings: S.settings, chat: S.chat, log: S.log,
      setupProblem: S.phase === 'lobby' ? setupProblem(S) : null,
    };
    if (!inGame) return v;
    Object.assign(v, {
      leader: S.leader, questNum: S.quests ? S.questNum : 0, quests: S.quests, reject: S.reject, team: S.team,
      history: S.history, winner: S.winner, reason: S.reason, assassinTarget: S.assassinTarget,
      ready: Object.keys(S.ready || {}), voted: Object.keys(S.votes || {}), played: Object.keys(S.cards || {}),
      setup: SETUP[S.players.length],
      roleList: Object.values(S.roles).sort(),
    });
    if (S.lady) v.lady = { holder: S.lady.holder, prev: S.lady.prev, checks: S.lady.checks.map(c => ({ by: c.by, target: c.target, quest: c.quest, side: c.by === pid ? c.side : undefined })) };
    if (S.phase === 'voteResult') { v.votes = S.votes; v.voteApproved = S.voteApproved; }
    if (S.phase === 'questResult') v.lastCards = S.lastCards;
    const me = S.players.find(p => p.id === pid);
    if (me) {
      const role = S.roles[pid];
      v.me = { id: pid, role, side: sideOf(role), sees: knowledge(S, pid), voted: S.votes && pid in S.votes ? S.votes[pid] : null, played: S.cards && pid in S.cards };
    }
    if (S.phase === 'end') v.roles = S.roles;
    return v;
  }

  const api = { ROLES, SETUP, QUESTS, MIN_PLAYERS, MAX_PLAYERS, newState, apply, advance, viewFor, knowledge, setupProblem, shuffle, sideOf, failsNeeded, evilSpecials };
  root.AvalonEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
