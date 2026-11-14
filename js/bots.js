/* Боты для Авалона. Играют честно: видят только то, что видел бы игрок на их месте. */
(function (root) {
  'use strict';
  const E = root.AvalonEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  const BOT_NAMES = ['Гавейн', 'Ланселот', 'Тристан', 'Галахад', 'Борс', 'Кэй', 'Бедивер', 'Гарет', 'Ивейн', 'Пеллинор', 'Ламорак', 'Агравейн', 'Элейна', 'Изольда', 'Энида'];

  const rnd = a => a[Math.floor(Math.random() * a.length)];

  // Подозрительность каждого игрока с точки зрения бота (больше — подозрительнее)
  function suspicion(v) {
    const s = {};
    v.players.forEach(p => (s[p.id] = Math.random() * 0.2));
    (v.quests || []).forEach(q => {
      if (!q.result) return;
      q.team.forEach(id => {
        const meOn = v.me && v.me.side === 'good' && q.team.includes(v.me.id);
        if (q.result === 'fail') s[id] += (q.fails / (q.team.length - (meOn ? 1 : 0))) * 3;
        else s[id] -= 0.6;
      });
    });
    // кто одобрял провальные составы — чуть подозрительнее
    (v.history || []).forEach(h => {
      const q = v.quests[h.quest];
      if (!h.approved || !q || q.result !== 'fail') return;
      Object.entries(h.votes).forEach(([id, yes]) => { if (yes && !h.team.includes(id)) s[id] += 0.4; });
      if (!h.team.includes(h.leader)) s[h.leader] += 1;
    });
    if (v.lady) v.lady.checks.forEach(c => { if (c.side) s[c.target] += c.side === 'evil' ? 10 : -10; });
    if (v.me) {
      s[v.me.id] = -100;
      v.me.sees.forEach(k => {
        if (k.tag === 'evil') s[k.id] += v.me.side === 'good' ? 8 + Math.random() * 2 : 0;
        if (k.tag === 'magic') s[k.id] -= 1;
      });
    }
    return s;
  }

  const knownEvil = v => (v.me ? v.me.sees.filter(k => k.tag === 'evil').map(k => k.id) : []);

  function pickTeam(v) {
    const size = v.quests[v.questNum].size;
    const me = v.me.id;
    const others = v.players.map(p => p.id).filter(id => id !== me);
    if (v.me.side === 'good') {
      const s = suspicion(v);
      others.sort((a, b) => s[a] - s[b]);
      return [me].concat(others.slice(0, size - 1));
    }
    // зло: себя + невинные, иногда ещё союзника не берём, чтобы не провалить двойным
    const allies = knownEvil(v);
    const innocents = E.shuffle(others.filter(id => !allies.includes(id)));
    return [me].concat(innocents).slice(0, size);
  }

  function decideVote(v) {
    const me = v.me.id;
    const team = v.team;
    if (v.me.side === 'evil') {
      const allies = knownEvil(v).concat(me);
      const evilOn = team.some(id => allies.includes(id));
      if (v.reject >= 4) return true; // не палиться на последней попытке
      return evilOn ? Math.random() < 0.9 : Math.random() < 0.25;
    }
    if (v.reject >= 4) return true; // пятое отклонение = победа зла
    const s = suspicion(v);
    if (v.me.role === 'merlin' && team.some(id => knownEvil(v).includes(id))) return Math.random() < 0.15;
    const leaderId = v.players[v.leader].id;
    if (leaderId === me) return true;
    const worst = Math.max(...team.map(id => s[id]));
    if (v.questNum === 0 && v.reject === 0) return Math.random() < 0.7;
    if (worst > 0.9) return false;
    // Если меня нет в составе, а мест мало — верю только «чистым» игрокам
    const teamSusp = team.reduce((a, id) => a + Math.max(0, s[id]), 0);
    if (!team.includes(me)) return teamSusp < 0.5 && Math.random() < 0.6;
    return Math.random() < 0.9;
  }

  function decideCard(v) {
    if (v.me.side === 'good') return true;
    const q = v.quests[v.questNum];
    const allies = knownEvil(v).filter(id => v.team.includes(id));
    // в первом походе зло иногда маскируется
    if (v.questNum === 0 && Math.random() < 0.3) return true;
    if (q.need >= 2) return false; // нужно два провала — играем провал
    if (allies.length) {
      // договорённость: проваливает тот, у кого меньший id среди союзников в походе
      const ids = allies.concat(v.me.id).sort();
      return ids[0] !== v.me.id;
    }
    return false;
  }

  function pickLady(v) {
    const s = suspicion(v);
    const cand = v.players.map(p => p.id).filter(id => id !== v.me.id && !v.lady.prev.includes(id));
    if (v.me.side === 'evil') {
      const allies = knownEvil(v);
      const c2 = cand.filter(id => !allies.includes(id));
      return rnd(c2.length ? c2 : cand);
    }
    cand.sort((a, b) => Math.abs(s[a] - 1) - Math.abs(s[b] - 1));
    return cand[0];
  }

  function pickMerlin(v) {
    const allies = knownEvil(v);
    const cand = v.players.map(p => p.id).filter(id => id !== v.me.id && !allies.includes(id));
    const score = {};
    cand.forEach(id => (score[id] = Math.random()));
    (v.history || []).forEach(h => {
      const evilOn = h.team.some(id => allies.includes(id) || id === v.me.id);
      cand.forEach(id => {
        if (!(id in h.votes)) return;
        if (evilOn && !h.votes[id]) score[id] += 1;
        if (evilOn && h.votes[id]) score[id] -= 0.7;
        if (!evilOn && h.votes[id]) score[id] += 0.3;
      });
      if (h.leader in score && !evilOn) score[h.leader] += 0.5;
    });
    cand.sort((a, b) => score[b] - score[a]);
    return cand[0];
  }

  // Какое действие нужно боту сейчас (или null)
  function botAction(v) {
    if (!v.me) return null;
    const me = v.me.id;
    switch (v.phase) {
      case 'reveal': return v.ready.includes(me) ? null : { type: 'ready' };
      case 'team': return v.players[v.leader].id === me ? { type: 'propose', team: pickTeam(v) } : null;
      case 'vote': return v.voted.includes(me) ? null : { type: 'vote', approve: decideVote(v) };
      case 'quest': return v.team.includes(me) && !v.played.includes(me) ? { type: 'quest', success: decideCard(v) } : null;
      case 'lady': return v.lady && v.lady.holder === me ? { type: 'lady', target: pickLady(v) } : null;
      case 'assassin': return v.me.role === 'assassin' ? { type: 'assassinate', target: pickMerlin(v) } : null;
    }
    return null;
  }

  const api = { BOT_NAMES, botAction, suspicion };
  root.AvalonBots = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
