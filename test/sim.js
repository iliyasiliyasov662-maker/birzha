// Прогон тысяч партий ботами: проверка, что правила не ломаются
const E = require('../js/engine.js'); const B = require('../js/bots.js');
let stats = { good: 0, evil: 0, reasons: {} };
for (let g = 0; g < 3000; g++) {
  const S = E.newState(); const n = 5 + (g % 6);
  for (let i = 0; i < n; i++) S.players.push({ id: 'p' + i, name: 'P' + i, bot: true });
  S.settings = { percival: Math.random()<.7, morgana: Math.random()<.6, mordred: n>=7 && Math.random()<.5, oberon: n>=9&&Math.random()<.5, lady: Math.random()<.5 };
  if (E.setupProblem(S)) S.settings.mordred = S.settings.oberon = false;
  if (E.apply(S, 'p0', { type: 'start' }, true)) throw 'start';
  let steps = 0;
  while (S.phase !== 'end') {
    if (++steps > 5000) throw new Error('stuck ' + S.phase);
    if (S.phase === 'voteResult' || S.phase === 'questResult') { E.advance(S); continue; }
    let acted = false;
    for (const p of S.players) {
      const a = B.botAction(E.viewFor(S, p.id));
      if (a) { const e = E.apply(S, p.id, a, false); if (e) throw new Error(S.phase + ' ' + e + ' ' + JSON.stringify(a)); acted = true; break; }
    }
    if (!acted) throw new Error('no one acts in ' + S.phase);
  }
  stats[S.winner]++; const r = S.reason.replace(/—.*|\S+ \S+, но.*/, '').slice(0, 30); stats.reasons[r] = (stats.reasons[r] || 0) + 1;
  // проверка знаний
  for (const p of S.players) for (const k of E.knowledge(S, p.id)) {
    const r1 = S.roles[p.id], r2 = S.roles[k.id];
    if (r1 === 'merlin' && (E.sideOf(r2) !== 'evil' || r2 === 'mordred')) throw 'merlin';
    if (r1 === 'servant' || r1 === 'oberon') throw 'knows';
  }
}
console.log(stats);
