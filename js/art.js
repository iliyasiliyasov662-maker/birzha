/* Графика Авалона: все карты и жетоны нарисованы векторно (SVG), без внешних картинок. */
(function (root) {
  'use strict';
  let uid = 0;

  const EMBLEMS = {
    merlin: g => `
      <path d="M100 38 C92 70 76 112 58 150 L142 150 C128 118 112 78 100 38 Z" fill="url(#${g}m)" stroke="#f4d58a" stroke-width="2.5"/>
      <path d="M58 150 Q100 166 142 150 L150 160 Q100 180 50 160 Z" fill="#f4d58a"/>
      <path d="M94 76 l3 8 8 0 -6 5 2 8 -7 -5 -7 5 2 -8 -6 -5 8 0z" fill="#fff6d0"/>
      <path d="M112 112 a9 9 0 1 1 -8 -13 a7 7 0 1 0 8 13z" fill="#fff6d0"/>
      <circle cx="84" cy="124" r="2.5" fill="#fff6d0"/><circle cx="118" cy="88" r="2" fill="#fff6d0"/><circle cx="96" cy="140" r="1.8" fill="#fff6d0"/>
      <g fill="#fff6d0" opacity=".9"><circle cx="40" cy="60" r="1.6"/><circle cx="160" cy="70" r="2"/><circle cx="150" cy="40" r="1.3"/><circle cx="52" cy="100" r="1.2"/></g>
      <defs><linearGradient id="${g}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3f6fd1"/><stop offset="1" stop-color="#1b2f6b"/></linearGradient></defs>`,
    percival: g => `
      <path d="M62 64 Q62 40 100 36 Q138 40 138 64 L138 128 Q138 150 100 164 Q62 150 62 128 Z" fill="url(#${g}p)" stroke="#f4d58a" stroke-width="2.5"/>
      <rect x="66" y="88" width="68" height="9" rx="3" fill="#0b1630"/>
      <rect x="96" y="97" width="8" height="40" rx="3" fill="#0b1630"/>
      <g fill="#0b1630"><circle cx="82" cy="112" r="2.4"/><circle cx="82" cy="122" r="2.4"/><circle cx="118" cy="112" r="2.4"/><circle cx="118" cy="122" r="2.4"/></g>
      <path d="M100 36 L100 18 Q120 14 128 26 Q114 24 104 34" fill="#d94b4b" stroke="#f4d58a" stroke-width="1.5"/>
      <path d="M62 70 L138 70" stroke="#f4d58a" stroke-width="2"/>
      <defs><linearGradient id="${g}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7ecf5"/><stop offset=".5" stop-color="#9aa6bd"/><stop offset="1" stop-color="#5b6680"/></linearGradient></defs>`,
    servant: g => `
      <path d="M100 32 L150 48 L148 104 Q144 146 100 170 Q56 146 52 104 L50 48 Z" fill="url(#${g}s)" stroke="#f4d58a" stroke-width="3"/>
      <path d="M100 46 L100 156 M64 88 L136 88" stroke="#f4d58a" stroke-width="12" stroke-linecap="round"/>
      <path d="M100 46 L100 156 M64 88 L136 88" stroke="#fff3c4" stroke-width="3" stroke-linecap="round"/>
      <defs><linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5bb7"/><stop offset="1" stop-color="#132a5e"/></linearGradient></defs>`,
    assassin: g => `
      <path d="M100 28 L110 46 L108 124 L92 124 L90 46 Z" fill="url(#${g}a)" stroke="#f3e3e3" stroke-width="1.5"/>
      <path d="M100 32 L100 122" stroke="#ffffff" stroke-width="1.5" opacity=".7"/>
      <rect x="70" y="122" width="60" height="10" rx="4" fill="#c9a24a" stroke="#f4d58a" stroke-width="1.5"/>
      <rect x="94" y="132" width="12" height="26" rx="3" fill="#3a1418" stroke="#c9a24a" stroke-width="1.5"/>
      <circle cx="100" cy="164" r="7" fill="#c9a24a"/>
      <path d="M100 124 q-4 10 0 16 q4 -6 0 -16" fill="#b3121c" transform="translate(-30 30)"/>
      <path d="M100 124 q-5 12 0 19 q5 -7 0 -19" fill="#b3121c" transform="translate(32 20)"/>
      <defs><linearGradient id="${g}a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d96a8"/><stop offset=".5" stop-color="#f1f3f7"/><stop offset="1" stop-color="#7b8496"/></linearGradient></defs>`,
    morgana: g => `
      <path d="M128 40 A62 62 0 1 0 128 160 A50 50 0 1 1 128 40 Z" fill="url(#${g}o)" stroke="#e9b6ff" stroke-width="2"/>
      <path d="M72 100 Q100 74 128 100 Q100 126 72 100 Z" fill="#14040f" stroke="#e9b6ff" stroke-width="2"/>
      <circle cx="100" cy="100" r="10" fill="#c13cff"/><circle cx="100" cy="100" r="4" fill="#14040f"/>
      <g fill="#e9b6ff"><circle cx="146" cy="60" r="2"/><circle cx="156" cy="96" r="1.5"/><circle cx="142" cy="140" r="2.2"/></g>
      <defs><linearGradient id="${g}o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b3fd6"/><stop offset="1" stop-color="#3a0d4f"/></linearGradient></defs>`,
    mordred: g => `
      <path d="M48 140 L52 70 L74 100 L86 54 L100 92 L114 54 L126 100 L148 70 L152 140 Z" fill="url(#${g}d)" stroke="#c9a24a" stroke-width="2.5" stroke-linejoin="round"/>
      <rect x="46" y="138" width="108" height="20" rx="4" fill="#2a0c0f" stroke="#c9a24a" stroke-width="2.5"/>
      <circle cx="100" cy="148" r="6" fill="#e0182a"/><circle cx="72" cy="148" r="4" fill="#c9a24a"/><circle cx="128" cy="148" r="4" fill="#c9a24a"/>
      <circle cx="86" cy="54" r="4" fill="#e0182a"/><circle cx="114" cy="54" r="4" fill="#e0182a"/><circle cx="52" cy="70" r="3" fill="#c9a24a"/><circle cx="148" cy="70" r="3" fill="#c9a24a"/>
      <defs><linearGradient id="${g}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b3b44"/><stop offset="1" stop-color="#0d0d10"/></linearGradient></defs>`,
    oberon: g => `
      <path d="M100 30 Q150 40 156 120 Q160 160 150 170 L50 170 Q40 160 44 120 Q50 40 100 30 Z" fill="url(#${g}b)" stroke="#7fe0a8" stroke-width="2"/>
      <path d="M100 60 Q134 66 134 112 Q132 140 100 150 Q68 140 66 112 Q66 66 100 60 Z" fill="#050806"/>
      <ellipse cx="86" cy="106" rx="8" ry="4" fill="#7fffb0"/><ellipse cx="114" cy="106" rx="8" ry="4" fill="#7fffb0"/>
      <ellipse cx="86" cy="106" rx="14" ry="8" fill="#7fffb0" opacity=".2"/><ellipse cx="114" cy="106" rx="14" ry="8" fill="#7fffb0" opacity=".2"/>
      <defs><linearGradient id="${g}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b4a39"/><stop offset="1" stop-color="#0a140e"/></linearGradient></defs>`,
    minion: g => `
      <path d="M58 120 Q56 52 100 46 Q144 52 142 120 L142 150 L58 150 Z" fill="url(#${g}n)" stroke="#c9a24a" stroke-width="2.5"/>
      <path d="M58 70 Q30 60 30 28 Q46 50 66 56" fill="#e8dcc0" stroke="#c9a24a" stroke-width="1.5"/>
      <path d="M142 70 Q170 60 170 28 Q154 50 134 56" fill="#e8dcc0" stroke="#c9a24a" stroke-width="1.5"/>
      <path d="M70 100 L96 108 L96 116 L70 112 Z M130 100 L104 108 L104 116 L130 112 Z" fill="#ff3b3b"/>
      <path d="M100 60 L100 150" stroke="#c9a24a" stroke-width="3"/>
      <path d="M76 130 L124 130 M76 140 L124 140" stroke="#0d0507" stroke-width="3"/>
      <defs><linearGradient id="${g}n" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a2a2e"/><stop offset="1" stop-color="#1a0709"/></linearGradient></defs>`,
  };

  const SIDE_OF = { merlin: 'good', percival: 'good', servant: 'good', assassin: 'evil', morgana: 'evil', mordred: 'evil', oberon: 'evil', minion: 'evil' };
  const NAMES = { merlin: 'Мерлин', percival: 'Персиваль', servant: 'Верный слуга', assassin: 'Убийца', morgana: 'Моргана', mordred: 'Мордред', oberon: 'Оберон', minion: 'Приспешник' };

  function frame(g, side) {
    const good = side === 'good';
    const c1 = good ? '#23458c' : '#7a1820', c2 = good ? '#0a1430' : '#16050a';
    return `
      <defs>
        <radialGradient id="${g}bg" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
        <linearGradient id="${g}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset=".5" stop-color="#c9a24a"/><stop offset="1" stop-color="#8a6a24"/></linearGradient>
        <pattern id="${g}tex" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 L8 0" stroke="#fff" stroke-opacity=".035" stroke-width="1"/></pattern>
      </defs>
      <rect x="2" y="2" width="196" height="276" rx="16" fill="url(#${g}bg)"/>
      <rect x="2" y="2" width="196" height="276" rx="16" fill="url(#${g}tex)"/>
      <rect x="2" y="2" width="196" height="276" rx="16" fill="none" stroke="url(#${g}gold)" stroke-width="4"/>
      <rect x="11" y="11" width="178" height="258" rx="10" fill="none" stroke="url(#${g}gold)" stroke-width="1.2" opacity=".7"/>
      <circle cx="100" cy="102" r="78" fill="${good ? '#6da0ff' : '#ff4b4b'}" opacity=".08"/>
      ${[[20, 20], [180, 20], [20, 260], [180, 260]].map(([x, y]) => `<path d="M${x} ${y - 6} L${x + 6} ${y} L${x} ${y + 6} L${x - 6} ${y} Z" fill="url(#${g}gold)"/>`).join('')}`;
  }

  function roleCard(role, opts) {
    opts = opts || {};
    const g = 'r' + (++uid);
    const side = SIDE_OF[role];
    const name = opts.name || NAMES[role];
    return `<svg class="card-svg" viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${name}">
      ${frame(g, side)}
      <g transform="translate(0 6)">${EMBLEMS[role](g)}</g>
      <path d="M22 206 L178 206 L170 222 L178 238 L22 238 L30 222 Z" fill="url(#${g}gold)"/>
      <text x="100" y="228" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-weight="700" font-size="${name.length > 11 ? 14 : name.length > 9 ? 16 : 19}" fill="#2a1a05" letter-spacing="1">${name.toUpperCase()}</text>
      <text x="100" y="258" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${side === 'good' ? 12 : 10}" fill="${side === 'good' ? '#a9c4ff' : '#ff9b9b'}" letter-spacing="${side === 'good' ? 3 : 1.2}">${side === 'good' ? 'СИЛЫ ДОБРА' : 'ПРИСПЕШНИКИ МОРДРЕДА'}</text>
    </svg>`;
  }

  function cardBack() {
    const g = 'b' + (++uid);
    return `<svg class="card-svg" viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="${g}bg" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="#3a2a14"/><stop offset="1" stop-color="#120c05"/></radialGradient>
        <linearGradient id="${g}gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe7a1"/><stop offset=".5" stop-color="#c9a24a"/><stop offset="1" stop-color="#8a6a24"/></linearGradient>
      </defs>
      <rect x="2" y="2" width="196" height="276" rx="16" fill="url(#${g}bg)" stroke="url(#${g}gold)" stroke-width="4"/>
      <rect x="14" y="14" width="172" height="252" rx="10" fill="none" stroke="url(#${g}gold)" stroke-width="1" opacity=".6"/>
      <g transform="translate(100 130)">
        <circle r="56" fill="none" stroke="url(#${g}gold)" stroke-width="3"/>
        <circle r="44" fill="none" stroke="url(#${g}gold)" stroke-width="1" opacity=".7"/>
        ${Array.from({ length: 12 }, (_, i) => `<rect x="-3" y="-56" width="6" height="12" rx="2" fill="url(#${g}gold)" transform="rotate(${i * 30})"/>`).join('')}
        <path d="M-16 -22 L16 -22 Q14 2 0 8 Q-14 2 -16 -22 Z M-3 8 L3 8 L3 22 L10 28 L-10 28 L-3 22 Z" fill="url(#${g}gold)"/>
      </g>
      <text x="100" y="236" text-anchor="middle" font-family="Cinzel Decorative, Cormorant Garamond, serif" font-size="22" fill="url(#${g}gold)" letter-spacing="4">AVALON</text>
    </svg>`;
  }

  const icons = {
    crown: `<svg viewBox="0 0 24 24"><path d="M3 18 L4 7 L9 12 L12 4 L15 12 L20 7 L21 18 Z" fill="#f4c542" stroke="#7a5a10" stroke-width="1.2" stroke-linejoin="round"/><rect x="3" y="18" width="18" height="3" rx="1" fill="#f4c542" stroke="#7a5a10" stroke-width="1"/></svg>`,
    shield: `<svg viewBox="0 0 24 24"><path d="M12 2 L20 5 L19.5 12 Q19 18 12 22 Q5 18 4.5 12 L4 5 Z" fill="#4a7bd8" stroke="#f4d58a" stroke-width="1.6"/><path d="M12 6 V18 M7.5 11 H16.5" stroke="#f4d58a" stroke-width="2"/></svg>`,
    lady: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1d6f8c" stroke="#bff3ff" stroke-width="1.4"/><path d="M5 14 Q8.5 11 12 14 T19 14" stroke="#bff3ff" stroke-width="1.6" fill="none"/><path d="M12 5 L12 12 M9 8 L15 8" stroke="#fff" stroke-width="1.6"/></svg>`,
    approve: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#d9a92e" stroke="#fff1b8" stroke-width="1.4"/><path d="M7 12.5 L10.5 16 L17 8.5" stroke="#3b2705" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    reject: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#2a2a33" stroke="#8a8aa0" stroke-width="1.4"/><path d="M8 8 L16 16 M16 8 L8 16" stroke="#e05a5a" stroke-width="2.6" stroke-linecap="round"/></svg>`,
    bot: `<svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="11" rx="3" fill="#8aa0c0"/><circle cx="9.5" cy="13" r="1.6" fill="#0b1630"/><circle cx="14.5" cy="13" r="1.6" fill="#0b1630"/><path d="M12 8 V4" stroke="#8aa0c0" stroke-width="2"/><circle cx="12" cy="4" r="1.6" fill="#f4c542"/></svg>`,
    eye: `<svg viewBox="0 0 24 24"><path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z" fill="#300" stroke="#ff6a6a" stroke-width="1.5"/><circle cx="12" cy="12" r="3.2" fill="#ff6a6a"/></svg>`,
    magic: `<svg viewBox="0 0 24 24"><path d="M12 2 l2.4 6.6 7 .3 -5.5 4.3 1.9 6.8 -5.8 -3.9 -5.8 3.9 1.9 -6.8 -5.5 -4.3 7 -.3z" fill="#b48cff" stroke="#fff" stroke-width="1"/></svg>`,
    sound: `<svg viewBox="0 0 24 24"><path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor"/><path d="M16 8 Q19 12 16 16 M18.5 5.5 Q23 12 18.5 18.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
    mute: `<svg viewBox="0 0 24 24"><path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" fill="currentColor"/><path d="M16 9 L22 15 M22 9 L16 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    dagger: `<svg viewBox="0 0 24 24"><path d="M12 2 L14 5 L13.6 15 H10.4 L10 5 Z" fill="#dfe3ea"/><rect x="7" y="15" width="10" height="2" rx="1" fill="#c9a24a"/><rect x="11" y="17" width="2" height="4" fill="#5a2a1a"/><circle cx="12" cy="22" r="1.4" fill="#c9a24a"/></svg>`,
  };

  // Карты похода
  function questCard(success) {
    const g = 'q' + (++uid);
    return success
      ? `<svg class="card-svg" viewBox="0 0 120 170"><defs><radialGradient id="${g}" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#3f74e0"/><stop offset="1" stop-color="#0d1d47"/></radialGradient></defs>
        <rect x="2" y="2" width="116" height="166" rx="12" fill="url(#${g})" stroke="#f4d58a" stroke-width="3"/>
        <path d="M60 36 L88 46 L87 80 Q85 104 60 118 Q35 104 33 80 L32 46 Z" fill="#f4d58a"/><path d="M60 50 V108 M42 74 H78" stroke="#1b2f6b" stroke-width="6"/>
        <text x="60" y="148" text-anchor="middle" font-family="Cormorant Garamond, serif" font-weight="700" font-size="18" fill="#f4d58a" letter-spacing="2">УСПЕХ</text></svg>`
      : `<svg class="card-svg" viewBox="0 0 120 170"><defs><radialGradient id="${g}" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="#b3202a"/><stop offset="1" stop-color="#2a0508"/></radialGradient></defs>
        <rect x="2" y="2" width="116" height="166" rx="12" fill="url(#${g})" stroke="#c9a24a" stroke-width="3"/>
        <path d="M30 104 L54 40 L62 62 L72 34 L90 104 Z" fill="#1a0306" stroke="#c9a24a" stroke-width="2"/><path d="M38 70 L82 110 M82 70 L38 110" stroke="#ff4b4b" stroke-width="6" stroke-linecap="round"/>
        <text x="60" y="148" text-anchor="middle" font-family="Cormorant Garamond, serif" font-weight="700" font-size="18" fill="#ffb3b3" letter-spacing="2">ПРОВАЛ</text></svg>`;
  }

  const AVATAR_COLORS = ['#c0392b', '#2e86de', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#c2185b', '#7f8c8d', '#b7950b', '#2c3e50', '#1abc9c', '#e67e22'];
  function avatar(name, i) {
    const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
    const letter = (name || '?').trim().charAt(0).toUpperCase();
    return `<svg viewBox="0 0 64 64"><defs><radialGradient id="av${i}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${c}" stop-opacity="1"/><stop offset="1" stop-color="#05070d"/></radialGradient></defs>
      <circle cx="32" cy="32" r="30" fill="url(#av${i})" stroke="#c9a24a" stroke-width="2.5"/>
      <circle cx="32" cy="32" r="25" fill="none" stroke="#fff" stroke-opacity=".15"/>
      <text x="32" y="42" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="28" font-weight="700" fill="#fff">${letter.replace(/[<&>"]/g, '')}</text></svg>`;
  }

  root.AvalonArt = { roleCard, cardBack, icons, questCard, avatar, NAMES };
})(window);
