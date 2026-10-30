import { ACTIONS, DEFAULT_BINDS, keyName } from './input.js';
import { T, SPECIALS } from './config.js';
import { lobby } from './lobby.js';

// Telas: Início, Lutador, Arena, Online (lobby + sala), Como jogar, Configurações, Pausa, Fim, Créditos.
// Teclado: setas andam pelo foco, Enter confirma, Esc volta, Q/E trocam de aba. Mouse em cima = foco.
const $ = id => document.getElementById(id);
const pct = v => Math.round(v * 100) + '%';
const num = (v, d = 1) => (+v).toFixed(d).replace('.', ',');
const hex = c => (typeof c === 'string' ? c : '#' + ((c ?? 0xb06bff) >>> 0).toString(16).padStart(6, '0'));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function h(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
// tecla em formato de "keycap" (HTML); serve pro menu, manual e quem mais quiser
export const keyCap = code => `<span class="kc">${esc(keyName(code))}</span>`;

export const DEFAULT_SETTINGS = {
  char: 'Barbarian', map: 'castelo', nick: 'LUTADOR' + String(Math.floor(Math.random() * 1e4)).padStart(4, '0'),
  diff: 'normal', fightLen: 'normal', roundTime: 99, rounds: 2,
  tps: true, lockPull: 1, fov: 80, sens: 1, invertY: false, dbl: true, shake: 1, dmgNumbers: true, warnings: true, dodgeHint: true, tutorialDone: false,
  quality: 'high', shadows: true, autoRes: true, resScale: 1, particles: 1, crowd: true, showFps: false, fs: true,
  vol: 0.6, binds: structuredClone(DEFAULT_BINDS),
};
// qualidade = atalho que ajusta outras opções
const QUALITY = {
  low: { shadows: false, particles: 0.5, crowd: false, resScale: 0.75 },
  med: { shadows: true, particles: 0.8, crowd: true, resScale: 0.9 },
  high: { shadows: true, particles: 1, crowd: true, resScale: 1 },
};

// next = "vale na próxima luta" (aparece quando abre no meio de uma luta); heavy = só aplica ao soltar o slider
const TABS = {
  jogo: ['Jogo', [
    { k: 'nick', label: 'Apelido (online)', type: 'text', hint: 'Como os outros jogadores te veem no online. De 3 a 16 letras.' },
    { k: 'diff', label: 'Dificuldade do bot', type: 'choice', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']] },
    { k: 'fightLen', label: 'Duração da luta', type: 'choice', next: true, opts: [['short', 'Rápida'], ['normal', 'Normal'], ['long', 'Longa']], hint: 'Vida de cada lutador: 100 / 160 / 220. No online vale a Normal.' },
    { k: 'roundTime', label: 'Tempo do round', type: 'choice', next: true, opts: [[60, '60s'], [99, '99s'], [0, 'Sem limite']] },
    { k: 'rounds', label: 'Rounds pra vencer', type: 'choice', next: true, opts: [[1, '1'], [2, '2'], [3, '3']] },
    { k: 'tps', label: 'Câmera em 3ª pessoa', type: 'toggle', hint: 'Dá pra trocar no meio da luta com a tecla de câmera.' },
  ]],
  controles: ['Controles', [
    { k: 'sens', label: 'Sensibilidade do mouse', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => num(v, 2) + '×' },
    { k: 'invertY', label: 'Inverter eixo Y do mouse', type: 'toggle' },
    { k: 'lockPull', label: 'Força da trava de mira', type: 'range', min: 0.3, max: 2, step: 0.05, fmt: pct, hint: 'Quanto a câmera puxa pro oponente com a mira travada. O mouse ainda mexe.' },
    { k: 'dbl', label: 'Dash com toque duplo nas teclas de andar', type: 'toggle' },
  ], true],
  video: ['Vídeo', [
    { k: 'quality', label: 'Qualidade', type: 'choice', opts: [['low', 'Baixa'], ['med', 'Média'], ['high', 'Alta']], hint: 'Ajusta sombras, partículas, torcida e resolução de uma vez.' },
    { k: 'shadows', label: 'Sombras', type: 'toggle' },
    { k: 'autoRes', label: 'Resolução automática (segura o FPS)', type: 'toggle', hint: 'Baixa a resolução sozinha quando o FPS cai.' },
    { k: 'resScale', label: 'Escala de resolução', type: 'range', min: 0.5, max: 1, step: 0.05, fmt: pct, heavy: true },
    { k: 'particles', label: 'Partículas e efeitos', type: 'range', min: 0.3, max: 1.5, step: 0.1, fmt: pct },
    { k: 'crowd', label: 'Torcida', type: 'toggle' },
    { k: 'fov', label: 'Campo de visão', type: 'range', min: 65, max: 105, step: 1, fmt: v => v + '°', hint: 'Na luta, o scroll do mouse também muda.' },
    { k: 'fs', label: 'Tela cheia ao entrar na luta', type: 'toggle' },
    { k: 'showFps', label: 'Mostrar FPS', type: 'toggle' },
  ]],
  audio: ['Áudio', [
    { k: 'vol', label: 'Volume geral', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  ]],
  acess: ['Acessibilidade', [
    { k: 'shake', label: 'Tremida da câmera', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct, hint: 'Zero = câmera parada nos impactos.' },
    { k: 'dmgNumbers', label: 'Números de dano', type: 'toggle' },
    { k: 'warnings', label: 'Avisos de ataque (anel e "!")', type: 'toggle', hint: 'Mostra quando um golpe está vindo, inclusive de fora da tela.' },
    { k: 'dodgeHint', label: 'Mostrar a tecla da esquiva na hora', type: 'toggle', hint: 'A tecla aparece do lado da mira e fica verde na hora da esquiva perfeita.' },
  ]],
};
// grupos da tela de teclas; ação que não estiver aqui cai em OUTROS (ação nova aparece sozinha)
const GROUPS = [
  ['MOVIMENTO', ['forward', 'back', 'left', 'right', 'jump', 'dash', 'crouch']],
  ['ATAQUE', ['light', 'heavy']],
  ['DEFESA', ['block', 'dodge']],
  ['PODERES', ['a1', 'a2', 'a3', 'ult', 'q', 'r', 'grab']],
  ['CÂMERA E SISTEMA', ['lock', 'view', 'pause']],
];
const LABEL = Object.fromEntries(ACTIONS);

const FIGHTER_INFO = {
  Barbarian: 'Peludo, barbudo e sem paciência.',
  Knight: 'Lata reforçada. Bate e aguenta.',
  Rogue: 'Rápida no olho e na mão.',
  Mage: 'Trocou o cajado pela porrada.',
  Rogue_Hooded: 'Ninguém vê o rosto. Todo mundo vê as adagas.',
  Skeleton_Warrior: 'Já morreu uma vez. Não liga de apanhar.',
  Skeleton_Mage: 'Prende você no chão e ri com o maxilar.',
  Skeleton_Rogue: 'Rápido como um raio, venenoso como sempre.',
  Skeleton_Minion: 'Nunca luta sozinho.',
};
// usado só enquanto o src/abilities/ não existe (1 poder por lutador)
const SPECIAL_DESC = {
  Barbarian: 'Pula e soca o chão: a onda derruba quem estiver perto. Pule pra escapar.',
  Knight: 'Avança com um escudo de luz que segura golpes de frente.',
  Rogue: 'Some na fumaça e aparece atrás do oponente com uma facada.',
  Mage: 'Marca um círculo no chão e um meteoro cai ali. Saia do círculo!',
  Rogue_Hooded: 'Joga 3 facas girando em leque. Cada uma atordoa.',
  Skeleton_Warrior: 'Gira com a espada atrás de você. O último giro quebra a defesa.',
  Skeleton_Mage: 'Um círculo roxo enche no chão e sobem espetos: quem ficar dentro fica preso.',
  Skeleton_Rogue: 'Atravessa você como um raio com um corte que envenena.',
  Skeleton_Minion: 'Dois mini-esqueletos correm atrás de você e explodem ao encostar.',
};
// arenas: a 1ª é a que existe; as outras são lugar guardado (initMenu({ maps }) troca a lista quando o src/maps chegar)
const DEFAULT_MAPS = [
  { id: 'castelo', name: 'ARENA DO CASTELO', tag: 'Pilares e parede que fecha', desc: 'Pilares seguram projéteis e servem de parede pro Giro. Depois de 25s a parede vermelha começa a fechar a arena.', color: '#ffd23f' },
  { id: 'em-breve-1', name: 'EM BREVE', tag: 'Arena nova chegando', desc: 'Uma arena nova, com armadilhas próprias, está sendo construída.', color: '#7fd8ff', soon: true },
  { id: 'em-breve-2', name: 'EM BREVE', tag: 'Arena nova chegando', desc: 'Uma arena nova, com armadilhas próprias, está sendo construída.', color: '#ff8a3d', soon: true },
  { id: 'em-breve-3', name: 'EM BREVE', tag: 'Arena nova chegando', desc: 'Uma arena nova, com armadilhas próprias, está sendo construída.', color: '#b06bff', soon: true },
];
const RANDOM_MAP = { id: 'random', name: 'ALEATÓRIO', tag: 'Deixa a sorte escolher', desc: 'Sorteia uma das arenas liberadas a cada luta.', color: '#16121f' };
const STATS = [['dmg', 'DANO CAUSADO'], ['hits', 'GOLPES ACERTADOS'], ['maxCombo', 'MAIOR COMBO'], ['perfect', 'ESQUIVAS PERFEITAS'], ['parry', 'PARRIES'],
  ['crits', 'CRÍTICOS'], ['grabs', 'GIROS DO FURACÃO'], ['abilities', 'HABILIDADES USADAS']];
const BEST = ['perfect', 'parry', 'maxCombo', 'crits', 'grabs'];
const SLOT_TAG = { a1: 'A1', a2: 'A2', a3: 'A3', ult: 'ULT', q: 'HAB', r: 'ULT', grab: 'GIRO' };

// HOOK das habilidades: quando o src/abilities/index.js existir (kitOf/SLOTS), o menu mostra as 4 de cada lutador sozinho
let KIT = null, kitLoading = null;
const loadKits = () => (KIT ? Promise.resolve(KIT) : (kitLoading ||= import('./abilities/index.js').then(m => (KIT = m.kitOf ? m : null), () => null).finally(() => { kitLoading = null; })));
loadKits(); // já vem carregado pelo fighter.js: aqui só pega a referência
function abilitiesOf(c) {
  const kit = KIT?.kitOf(c);
  if (kit?.abilities) return (KIT.SLOTS || Object.keys(kit.abilities)).map(s => ({ ...kit.abilities[s], action: s, color: kit.abilities[s]?.color ?? kit.color, ult: s === 'ult' }));
  const sp = SPECIALS[c] || {};
  return [
    { action: 'q', name: sp.name, desc: SPECIAL_DESC[c], cost: T.costQ, color: sp.color },
    { action: 'r', name: 'SUPER SOCO', desc: 'Com a barra cheia: soco voador que quebra a defesa.', cost: 100, ult: true },
    { action: 'grab', name: 'GIRO DO FURACÃO', desc: 'Colado no oponente: agarra, gira e arremessa pra onde a câmera aponta.', cost: T.costG, cd: T.grabCooldown, color: 0x7fd8ff },
  ].filter(a => LABEL[a.action]);
}

export function initMenu({ settings, save, onChange, characters, thumbs = {}, actions = {}, maps }) {
  const menu = $('menu');
  const MAPS = maps || DEFAULT_MAPS;
  const ROOTS = new Set(['home', 'pause', 'over', 'welcome', 'clickToFight']);
  let current = 'home', back = [], openedAt = 0, tab = 'jogo', htab = 'basico', rebinding = null, selMode = 'offline', commitT = 0, pendingChar = null;
  let pauseInfo = {}, overInfo = {}, modalClose = null, modalTick = 0, ovT = 0;
  const room = () => lobby.state.room;
  const RENDER = { home: renderHome, select: renderSelect, map: renderMaps, online: renderLobby, room: renderRoom, howto: renderHowto, settings: renderSettings, pause: renderPause, over: renderOver };

  // ---------- navegação: histórico com raízes, foco, transição pra frente/pra trás
  function show(name, opt) {
    if (ROOTS.has(name)) back = [];
    else if (name !== current) back.push({ name: current, focus: document.activeElement });
    open(name, 'fwd', opt);
  }
  function goBack() {
    const prev = back.pop() || { name: document.body.classList.contains('ingame') ? 'pause' : 'home' };
    open(prev.name, 'back');
    if (prev.focus?.isConnected) prev.focus.focus({ preventScroll: true });
  }
  function open(name, dir, opt) {
    if (current === 'online' && name !== 'online') lobby.list(false); // lista de salas só chega com a tela aberta
    if (name === 'online' && current !== 'online') lobby.list(true);
    current = name;
    openedAt = performance.now();
    menu.dataset.dir = dir;
    menu.classList.remove('hidden');
    for (const s of menu.querySelectorAll('.screen')) s.classList.toggle('on', s.dataset.screen === name);
    RENDER[name]?.(opt, dir);
    if (dir === 'fwd') setTimeout(() => (scope().querySelector('.fcard[aria-checked=true], .mcard[aria-checked=true], [data-primary]:not(:disabled)') || focusables()[0])?.focus({ preventScroll: true }));
  }
  const scope = () => ($('modal').classList.contains('on') ? $('modal') : menu.querySelector('.screen.on') || menu);
  const focusables = () => [...scope().querySelectorAll('button:not(:disabled), input, [tabindex="0"]')].filter(e => e.getClientRects().length);
  // setas: vai pro elemento mais perto naquela direção (serve pra lista, grade, abas e linhas de configuração)
  function moveFocus(dx, dy) {
    const els = focusables(), cur = document.activeElement;
    if (!els.includes(cur)) return els[0]?.focus();
    const a = cur.getBoundingClientRect(), ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    let best = null, bs = Infinity;
    for (const e of els) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect(), x = b.x + b.width / 2 - ax, y = b.y + b.height / 2 - ay;
      const along = x * dx + y * dy;
      if (along <= 1) continue;
      const score = along + Math.abs(x * dy + y * dx) * 2.5; // fugir da linha pesa mais que a distância
      if (score < bs) { bs = score; best = e; }
    }
    best?.focus({ preventScroll: false });
  }
  function escape() {
    if (modalClose) return modalClose();
    if (current === 'pause') return performance.now() - openedAt > 500 && actions.resume?.(); // o mesmo Esc que soltou o mouse não volta pra luta
    if (current === 'room') return UI.leaveAsk();
    if (!ROOTS.has(current)) goBack();
  }
  addEventListener('keydown', e => {
    if (rebinding || e.altKey || e.ctrlKey || e.metaKey) return;
    if (menu.classList.contains('hidden') && !modalClose) return;
    const t = e.target, typing = t.matches?.('input:not([type=range])'), k = e.code;
    if (k === 'Escape' || (k === 'Backspace' && !typing)) { e.preventDefault(); return escape(); }
    if (typing) { if (k === 'Enter') t.dispatchEvent(new Event('change', { bubbles: true })); return; }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (dir && !(t.type === 'range' && dir[0])) { e.preventDefault(); return moveFocus(...dir); }
    if (k === 'KeyQ' || k === 'PageUp') return cycleTab(-1);
    if (k === 'KeyE' || k === 'PageDown') return cycleTab(1);
    if (k === 'KeyR' && current === 'online') return actions.refreshRooms?.();
    if ((k === 'Enter' || k === 'NumpadEnter') && !scope().contains(document.activeElement)) { e.preventDefault(); scope().querySelector('[data-primary]:not(:disabled)')?.click(); }
  });
  // mouse em cima = foco (mouse e teclado dividem o mesmo destaque). Tiles de escolha não: senão passar o mouse trocaria o lutador.
  for (const root of [menu, $('modal')]) root.addEventListener('pointerover', e => {
    const b = e.target.closest('button:not(.fcard):not(.mcard), input[type=range]');
    if (b && b !== document.activeElement && !b.disabled) b.focus({ preventScroll: true });
  });
  menu.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-back],[data-act]');
    if (!t || t.disabled) return;
    if (t.dataset.go) show(t.dataset.go);
    else if ('back' in t.dataset) goBack();
    else if (t.dataset.act) run(t.dataset.act, t.dataset);
  });
  // ações: primeiro as do próprio menu (abrem modal, pedem confirmação, falam com o lobby), depois as do main.js
  const run = (name, arg) => (UI[name] ? UI[name](arg) : actions[name]?.(arg));
  const UI = {
    next() { flush(); if (selMode === 'online') { actions.changeChar?.(settings.char); goBack(); } else show('map'); },
    fight() { flush(); actions.fight?.(); },
    quick() { actions.quick?.(); searching(true); },
    joinRoom: d => actions.joinRoom?.(d.code),
    openCreate, openCode,
    copyCode: () => copy(room()?.code || '', 'Código copiado!'),
    copyLink: () => copy(lobby.inviteLink(), 'Link copiado! Manda pro seu amigo.'),
    readyToggle() { const r = room(), me = r?.players?.[r.you ?? 0]; actions.setReady?.(!me?.ready); },
    backToRoom: () => lobby.backToRoom(),
    leaveAsk: () => ask({ title: 'SAIR DA SALA?', text: 'Você volta pra lista de salas.', ok: 'SAIR', cancel: 'FICAR', danger: true }).then(ok => ok && run('leaveRoom')),
    quitAsk() {
      const on = pauseInfo.online;
      ask({ title: on ? 'SAIR DA SALA?' : 'SAIR DA LUTA?', text: on ? 'O oponente ganha a luta.' : 'Essa luta não conta.', ok: 'SAIR', cancel: 'FICAR', danger: true })
        .then(ok => ok && (on && actions.leaveRoom ? actions.leaveRoom() : actions.quit?.()));
    },
    restartAsk: () => ask({ title: 'REINICIAR A LUTA?', text: 'Começa do round 1, com os mesmos lutadores.', ok: 'REINICIAR', cancel: 'CANCELAR' }).then(ok => ok && actions.restart?.()),
    swapChar() { actions.quit?.(); show('select'); },
    swapOnline: () => show('select', { mode: 'online' }),
    rematchOnline() { overInfo.iWant = true; renderOver(); actions.rematch?.(); },
  };

  function set(k, v) {
    settings[k] = v;
    if (k === 'quality') Object.assign(settings, QUALITY[v]);
    save();
    onChange(k);
  }

  // ---------- modal (confirmação, criar sala, código, procurando) + avisos
  function hideModal() { $('modal').classList.remove('on'); modalClose = null; clearInterval(modalTick); }
  function modal({ title, body = [], buttons = [], onCancel, wide }) {
    const m = $('modal');
    hideModal();
    m.querySelector('.panel').classList.toggle('wide', !!wide);
    m.querySelector('h3').textContent = title;
    m.querySelector('.modal-body').replaceChildren(...[].concat(body));
    const foot = m.querySelector('.panel-foot');
    foot.replaceChildren();
    let res;
    const done = v => { hideModal(); res?.(v); };
    for (const bt of buttons) {
      const b = h('button', 'btn ' + (bt.cls || ''), bt.label);
      if (bt.primary) b.dataset.primary = '';
      b.onclick = () => (bt.onClick ? bt.onClick(done) : done(bt.value));
      foot.append(b);
    }
    modalClose = () => { onCancel?.(); done(false); };
    m.classList.add('on');
    setTimeout(() => (m.querySelector('.modal-body input') || m.querySelector('[data-primary]') || foot.lastChild)?.focus());
    return new Promise(r => { res = r; });
  }
  function ask({ title, text, ok = 'SIM', cancel = 'CANCELAR', danger = false }) {
    return modal({ title, body: h('p', null, text), buttons: [{ label: cancel, value: false }, { label: ok, cls: danger ? 'btn--primary' : 'btn--accent', value: true, primary: true }] });
  }
  function toast(text, kind = 'info', ms = 2600) {
    const box = $('toasts'), el = h('div', 'toast ' + kind, text); // textContent: pode vir da rede
    box.prepend(el);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, ms);
  }
  async function copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg, 'ok'); } catch { // fora de https/localhost não tem clipboard
      const inp = h('input', 'inp'); inp.readOnly = true; inp.value = text;
      modal({ title: 'COPIE AQUI', body: [h('p', null, 'Ctrl+C pra copiar:'), inp], buttons: [{ label: 'OK', cls: 'btn--accent', primary: true }] });
      setTimeout(() => inp.select(), 50);
    }
  }

  // ---------- início
  function renderHome() {
    $('homeNick').textContent = settings.nick;
    $('homeChar').textContent = characters[settings.char] || '';
    $('homeFace').src = thumbs[settings.char] || '';
  }

  // ---------- escolha do lutador (offline: passo 1 de 2; online: troca o lutador da sala)
  function renderSelect(opt, dir) {
    if (dir === 'fwd') selMode = opt?.mode || 'offline';
    const on = selMode === 'online';
    $('selStep').classList.toggle('hidden', on);
    $('selDiffRow').classList.toggle('hidden', on);
    $('selNext').innerHTML = on ? 'CONFIRMAR <span class="kc kc--sm">Enter</span>' : 'PRÓXIMO <span class="kc kc--sm">Enter</span>';
    const box = $('roster');
    if (!box.childElementCount) for (const [k, name] of Object.entries(characters)) {
      const b = h('button', 'fcard');
      b.setAttribute('role', 'radio');
      b.dataset.char = k;
      b.style.setProperty('--c', hex(SPECIALS[k]?.color));
      const img = h('img'); img.src = thumbs[k] || ''; img.alt = '';
      b.append(img, h('b', null, name));
      b.onfocus = () => pickChar(k); // setas escolhem (estilo console)
      b.onclick = e => { pickChar(k); if (e.detail === 0) UI.next(); }; // Enter no lutador = próximo passo
      box.append(b);
    }
    segment($('selDiff'), TABS.jogo[1].find(o => o.k === 'diff'));
    pickChar(settings.char, true);
    loadKits().then(m => m && current === 'select' && details(pendingChar || settings.char));
  }
  function pickChar(k, now) {
    for (const b of $('roster').children) b.setAttribute('aria-checked', b.dataset.char === k);
    details(k);
    clearTimeout(commitT);
    pendingChar = k === settings.char ? null : k;
    if (pendingChar) commitT = setTimeout(flush, now ? 0 : 150); // espera parar de passar com as setas (trocar o lutador recria os modelos)
  }
  function flush() { clearTimeout(commitT); if (pendingChar && pendingChar !== settings.char) set('char', pendingChar); pendingChar = null; }
  function details(k) {
    $('selName').textContent = characters[k] || k;
    $('selFlavor').textContent = FIGHTER_INFO[k] || '';
    $('selImg').src = thumbs[k] || '';
    $('selPanel').style.setProperty('--c', hex(SPECIALS[k]?.color));
    const abs = abilitiesOf(k);
    $('selAbil').replaceChildren(...abs.map(abCard));
    $('selAll').innerHTML = universal(abs);
  }
  function abCard(a) {
    const c = h('div', 'ab' + (a.locked ? ' locked' : '') + (a.ult ? ' ult' : ''));
    c.style.setProperty('--c', hex(a.color));
    const txt = h('div', 'ab-txt');
    txt.append(h('b', null, a.locked ? 'EM BREVE' : a.name || '?'), h('p', null, a.desc || ''));
    const meta = h('div', 'ab-meta');
    meta.innerHTML = keyCap(settings.binds[a.action]?.find(Boolean));
    const sub = [a.cost ? `${a.cost} de energia` : '', a.cd ? `recarga ${num(a.cd)}s` : ''].filter(Boolean).join(' · ');
    if (sub && !a.locked) meta.append(h('small', null, sub));
    c.append(h('i', 'ab-ic', SLOT_TAG[a.action] || '★'), txt, meta);
    return c;
  }
  const kk = a => keyCap(settings.binds[a]?.find(Boolean));
  function universal(abs) {
    const has = new Set(abs.map(a => a.action));
    const parts = [[kk('light'), 'soco rápido'], [kk('heavy'), 'pesado'], [kk('block'), 'defesa/parry'], [kk('dodge'), 'esquiva']];
    if (LABEL.grab && !has.has('grab')) parts.push([kk('grab'), 'giro']);
    return '<b>TODOS:</b> ' + parts.map(([k, t]) => `${k} ${t}`).join(' · ');
  }

  // ---------- escolha da arena (passo 2 de 2)
  function renderMaps() {
    if (!MAPS.some(m => m.id === settings.map && !m.soon) && settings.map !== 'random') settings.map = MAPS.find(m => !m.soon)?.id || 'random';
    const box = $('mapList');
    box.replaceChildren();
    for (const m of [...MAPS, RANDOM_MAP]) {
      const b = h('button', 'mcard' + (m.soon ? ' soon' : '') + (m.id === 'random' ? ' rnd' : ''));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', settings.map === m.id);
      b.disabled = !!m.soon;
      const th = h('div', 'mthumb', m.id === 'random' ? '?' : m.soon ? 'EM BREVE' : '');
      th.style.setProperty('--c', hex(m.color));
      const src = thumbs['map:' + m.id] || m.thumb;
      if (src) th.style.backgroundImage = `url("${src}")`;
      b.append(th, h('b', null, m.name), h('small', null, m.tag));
      const pick = () => { for (const x of box.children) x.setAttribute('aria-checked', x === b); $('mapDesc').textContent = m.desc; if (settings.map !== m.id) set('map', m.id); };
      b.onfocus = pick;
      b.onclick = e => { pick(); if (e.detail === 0) UI.fight(); };
      box.append(b);
    }
    const sel = [...MAPS, RANDOM_MAP].find(m => m.id === settings.map);
    $('mapDesc').textContent = sel?.desc || '';
    $('mapFace').src = thumbs[settings.char] || '';
    $('mapWho').textContent = `${(characters[settings.char] || '').toUpperCase()} vs CPU sorteado · bot ${TABS.jogo[1][1].opts.find(o => o[0] === settings.diff)?.[1] || ''}`;
  }

  // ---------- online: lobby (lista de salas) + sala
  function renderLobby() {
    const nick = $('lobbyNick');
    nick.value = settings.nick;
    $('lobbyFace').src = thumbs[settings.char] || '';
    $('lobbyChar').textContent = characters[settings.char] || '';
    renderRooms();
  }
  $('lobbyNick').addEventListener('change', e => setNick(e.target));
  function setNick(inp) {
    const n = inp.value.replace(/[^\p{L}\p{N} _\-!?.]/gu, '').trim().slice(0, 16);
    if (n.length < 3) { inp.value = settings.nick; return toast('Apelido precisa de 3 a 16 letras.', 'warn'); }
    inp.value = n;
    if (n !== settings.nick) { set('nick', n); lobby.setNick(n); }
  }
  function renderRooms() {
    const L = lobby.state, box = $('roomList'), up = !['offline', 'connecting'].includes(L.status);
    $('lobbyInfo').textContent = up ? `${L.online} online · ${L.searching} procurando${L.rtt ? ` · ${Math.round(L.rtt)} ms` : ''}` : L.status === 'connecting' ? 'CONECTANDO...' : 'OFFLINE';
    $('lobbyInfo').classList.toggle('on', up);
    const rooms = L.rooms.map(r => ({ ...r, open: r.st === 'w' })).sort((a, b) => b.open - a.open || (a.ping ?? 0) - (b.ping ?? 0));
    $('roomCount').textContent = rooms.length ? `(${rooms.length})` : '';
    if (!rooms.length) {
      const p = h('div', 'empty');
      p.append(h('b', null, up ? 'NINGUÉM POR AQUI AGORA' : 'PROCURANDO O SERVIDOR'), h('p', null, up ? 'Use a PARTIDA RÁPIDA: quem chegar depois cai na sua sala.' : 'Se demorar, o servidor pode estar fora do ar. Tenta de novo em instantes.'));
      return box.replaceChildren(p);
    }
    box.replaceChildren(...rooms.map(r => {
      const b = h('button', 'room');
      b.disabled = !r.open;
      b.dataset.act = 'joinRoom';
      b.dataset.code = r.code;
      const nm = h('span', 'room-name');
      nm.append(h('b', null, r.name), h('small', null, r.host || ''));
      const ms = Math.round((L.rtt || 0) + (r.ping || 0));
      const pg = h('span', 'ping ' + (ms < 80 ? 'good' : ms < 150 ? 'mid' : 'bad'));
      pg.innerHTML = '<i></i><i></i><i></i>';
      pg.append(` ${ms} ms`);
      b.append(h('i', 'dot'), nm, h('span', 'pill', mapName(r.map)), h('span', 'pl', `${r.n ?? 1}/2`), pg, h('span', 'go', r.open ? 'ENTRAR' : r.st === 'f' ? 'CHEIA' : 'LUTANDO'));
      return b;
    }));
  }
  const mapName = id => (id === 'random' ? 'ALEATÓRIO' : MAPS.find(m => m.id === id)?.name || String(id || '').toUpperCase());
  function searching(on) {
    if (!on) return modalClose && $('modal').querySelector('.searchbar') && hideModal();
    const t0 = performance.now(), clock = h('b', 'search-clock', '0:00'), tip = h('p', 'search-tip', '');
    const bar = h('div', 'pbar searchbar'); bar.append(h('i'));
    modal({ title: 'PROCURANDO OPONENTE...', body: [bar, clock, tip], buttons: [{ label: 'CANCELAR', primary: true, onClick: done => { actions.cancelSearch?.(); done(false); } }], onCancel: () => actions.cancelSearch?.() });
    modalTick = setInterval(() => {
      const s = Math.floor((performance.now() - t0) / 1000);
      clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 20) tip.textContent = 'Tá vazio? Crie uma sala e mande o link pra um amigo.';
    }, 250);
  }
  function mapChips(sel, onPick) {
    const box = h('div', 'seg chips');
    box.setAttribute('role', 'radiogroup');
    for (const m of [...MAPS.filter(m => !m.soon), RANDOM_MAP]) {
      const b = h('button', null, m.id === 'random' ? 'ALEATÓRIO' : m.name);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', m.id === sel);
      b.onclick = () => { for (const x of box.children) x.setAttribute('aria-checked', x === b); onPick(m.id); };
      box.append(b);
    }
    return box;
  }
  function openCreate() {
    const name = h('input', 'inp'); name.maxLength = 24; name.value = `Sala do ${settings.nick}`;
    let map = settings.map, pub = true;
    const vis = h('div', 'seg');
    for (const [v, l] of [[true, 'PÚBLICA'], [false, 'PRIVADA (só com código)']]) {
      const b = h('button', null, l);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', v === pub);
      b.onclick = () => { pub = v; for (const x of vis.children) x.setAttribute('aria-checked', x === b); };
      vis.append(b);
    }
    const field = (label, el) => { const f = h('label', 'field'); f.append(h('span', null, label), el); return f; };
    modal({
      title: 'CRIAR SALA', wide: true,
      body: [field('Nome da sala', name), field('Arena', mapChips(map, id => { map = id; })), field('Quem pode entrar', vis)],
      buttons: [{ label: 'CANCELAR' }, { label: 'CRIAR', cls: 'btn--primary', primary: true, onClick: done => {
        const n = name.value.replace(/[^\p{L}\p{N} _\-!?.]/gu, '').trim();
        if (n.length < 3) return toast('O nome precisa de pelo menos 3 letras.', 'warn');
        done(true);
        actions.createRoom?.({ name: n, pub, map });
      } }],
    });
  }
  function openCode() {
    const inp = h('input', 'inp inp--code'); inp.maxLength = 4; inp.placeholder = 'K7QX'; inp.autocomplete = 'off'; inp.spellcheck = false;
    const err = h('p', 'field-err', '');
    const go = done => {
      const code = inp.value;
      if (code.length < 4) { err.textContent = 'O código tem 4 letras.'; return; }
      done?.(true); hideModal();
      actions.joinRoom?.(code);
    };
    inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); err.textContent = ''; if (inp.value.length === 4) go(); };
    inp.onchange = () => go();
    modal({ title: 'ENTRAR COM CÓDIGO', body: [h('p', null, 'Digite o código de 4 letras que seu amigo mandou.'), inp, err], buttons: [{ label: 'CANCELAR' }, { label: 'ENTRAR', cls: 'btn--blue', primary: true, onClick: go }] });
  }
  function renderRoom() {
    const m = room();
    if (!m) return;
    const you = m.you ?? 0, me = m.players?.[you], owner = you === 0 && m.st === 'waiting';
    $('roomName').textContent = m.name || 'SALA';
    $('roomCode').textContent = m.code || '----';
    $('roomPub').textContent = m.pub === false ? 'PRIVADA' : 'PÚBLICA';
    $('roomCards').replaceChildren(pcard(m.players?.[0], 0, you), h('b', 'vs', 'VS'), pcard(m.players?.[1], 1, you));
    const mapBox = $('roomMap');
    mapBox.replaceChildren(h('span', 'lbl', 'ARENA'));
    if (owner && !me?.ready) mapBox.append(mapChips(m.map, id => lobby.setRoom({ map: id })));
    else mapBox.append(h('b', null, mapName(m.map)));
    $('roomRules').textContent = `Melhor de ${m.bo || 3}${m.auto ? ` · começa em ${Math.ceil(m.auto / 1000)}s` : ''}`;
    const rb = $('readyBtn');
    rb.innerHTML = me?.ready ? 'CANCELAR PRONTO' : 'PRONTO! <span class="kc kc--sm">Enter</span>';
    rb.className = 'btn btn--lg ' + (me?.ready ? '' : 'btn--primary');
  }
  function pcard(p, slot, you) {
    const c = h('div', 'pcard' + (p ? '' : ' empty') + (slot === you ? ' me' : ''));
    if (!p) {
      const w = h('b', 'pc-wait dots', 'ESPERANDO OPONENTE');
      const row = h('div', 'pc-share');
      for (const [l, a] of [['COPIAR CÓDIGO', 'copyCode'], ['COPIAR LINK', 'copyLink']]) { const b = h('button', 'btn btn--sm', l); b.dataset.act = a; row.append(b); }
      c.append(w, h('small', null, 'Mande o código ou o link pro seu amigo.'), row);
      return c;
    }
    const img = h('img'); img.src = thumbs[p.char] || ''; img.alt = '';
    const info = h('div', 'pc-info'), tags = h('div', 'pc-tags');
    if (slot === you) tags.append(h('span', 'pill pill--blue', 'VOCÊ'));
    if (slot === 0) tags.append(h('span', 'pill pill--y', 'DONO'));
    if (p.on === false) tags.append(h('span', 'pill pill--warn', 'RECONECTANDO'));
    if (slot !== you && p.ping) tags.append(h('span', 'pill', `${p.ping} ms`));
    info.append(tags, h('b', 'pc-nick', p.nick || '???'), h('span', 'pc-char', characters[p.char] || p.char || ''));
    if (slot === you && !p.ready) { const t = h('button', 'btn btn--sm', 'TROCAR LUTADOR'); t.onclick = () => show('select', { mode: 'online' }); info.append(t); }
    c.append(img, info);
    if (p.ready) c.append(h('span', 'stamp', 'PRONTO!'));
    return c;
  }

  // ---------- configurações (5 abas, corpo rola, barra de ajuda embaixo)
  function cycleTab(d) {
    if (current === 'settings') { const ks = Object.keys(TABS); tab = ks[(ks.indexOf(tab) + d + ks.length) % ks.length]; renderSettings(); }
    else if (current === 'howto') { const ks = HOWTO.map(t => t[0]); htab = ks[(ks.indexOf(htab) + d + ks.length) % ks.length]; renderHowto(); }
    else return;
    menu.querySelector('.screen.on [role=tab][aria-selected=true]')?.focus({ preventScroll: true });
  }
  function tabs(box, list, sel, pick) {
    box.replaceChildren();
    box.insertAdjacentHTML('beforeend', '<span class="kc">Q</span>');
    for (const [k, label] of list) {
      const b = h('button', null, label);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', k === sel);
      b.onclick = () => { pick(k); box.querySelector(`[aria-selected=true]`)?.focus({ preventScroll: true }); };
      box.append(b);
    }
    box.insertAdjacentHTML('beforeend', '<span class="kc">E</span>');
  }
  function segment(box, o) {
    box.replaceChildren();
    box.setAttribute('role', 'radiogroup');
    // qualidade: se os valores não batem com nenhum preset, nada fica marcado ("Personalizada")
    const cur = o.k === 'quality' ? Object.keys(QUALITY).find(q => Object.entries(QUALITY[q]).every(([k, v]) => settings[k] === v)) : settings[o.k];
    for (const [v, label] of o.opts) {
      const b = h('button', null, label);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(cur) === String(v));
      b.onclick = () => {
        set(o.k, v);
        if (o.k === 'quality') { renderSettings(); return $('setBody').querySelector('[data-k=quality] [aria-checked=true]')?.focus(); }
        for (const x of box.children) x.setAttribute('aria-checked', x === b);
      };
      box.append(b);
    }
    if (o.k === 'quality' && !cur) box.insertAdjacentHTML('afterend', '<span class="pill">PERSONALIZADA</span>');
  }
  const help = text => { $('setHelp').textContent = text; };
  function control(o) {
    const row = h('div', 'set'), id = 'set-' + o.k, ctl = h('div', 'ctl'), lab = h('label', null, o.label);
    row.dataset.k = o.k;
    lab.htmlFor = id;
    if (o.next && document.body.classList.contains('ingame')) lab.insertAdjacentHTML('beforeend', ' <span class="pill pill--y">vale na próxima luta</span>');
    row.append(lab, ctl);
    const tip = o.hint || o.label;
    row.addEventListener('pointerenter', () => help(tip));
    row.addEventListener('focusin', () => help(tip));
    if (o.type === 'choice') { const s = h('div', 'seg'); s.id = id; ctl.append(s); segment(s, o); }
    if (o.type === 'toggle') {
      const b = h('button', 'sw');
      b.id = id;
      b.setAttribute('role', 'switch');
      b.setAttribute('aria-checked', !!settings[o.k]);
      b.onclick = () => { set(o.k, !settings[o.k]); b.setAttribute('aria-checked', !!settings[o.k]); };
      ctl.append(b);
    }
    if (o.type === 'range') {
      const r = h('input', 'range'), out = h('output');
      Object.assign(r, { type: 'range', id, min: o.min, max: o.max, step: o.step, value: settings[o.k] });
      const paint = () => { out.textContent = o.fmt(+r.value); r.style.setProperty('--pct', ((r.value - o.min) / (o.max - o.min)) * 100 + '%'); };
      r.oninput = () => { paint(); if (!o.heavy) { settings[o.k] = +r.value; onChange(o.k); } }; // ao vivo só o que é barato
      r.onchange = () => set(o.k, +r.value);                                                      // salva + aplica pesado 1x ao soltar
      paint();
      ctl.append(r, out);
    }
    if (o.type === 'text') {
      const t = h('input', 'inp');
      Object.assign(t, { id, maxLength: 16, value: settings[o.k], spellcheck: false, autocomplete: 'off' });
      t.onchange = () => setNick(t);
      ctl.append(t);
    }
    return row;
  }
  function renderSettings() {
    tabs($('setTabs'), Object.entries(TABS).map(([k, [l]]) => [k, l]), tab, k => { tab = k; renderSettings(); });
    const body = $('setBody'), [, rows, binds] = TABS[tab];
    body.replaceChildren(...rows.map(control));
    if (binds) renderBinds(body);
    body.scrollTop = 0;
    help(binds ? 'Clique numa tecla e aperte a nova (vale botão do mouse). Esc cancela, Backspace apaga.' : 'Passe o mouse numa opção pra ver o que ela faz.');
  }
  $('setReset').onclick = () => {
    const [, rows, binds] = TABS[tab];
    for (const o of rows) if (o.k !== 'nick') settings[o.k] = structuredClone(DEFAULT_SETTINGS[o.k]);
    if (binds) settings.binds = structuredClone(DEFAULT_BINDS);
    save();
    onChange();
    renderSettings();
    toast('Aba restaurada pro padrão.', 'ok');
  };

  // ---- troca de teclas: clique no botão e aperte a tecla (ou botão do mouse). Esc cancela, Backspace limpa.
  function renderBinds(body) {
    const listed = new Set(GROUPS.flatMap(g => g[1]));
    const groups = [...GROUPS.map(([n, as]) => [n, as.filter(a => LABEL[a])]), ['OUTROS', ACTIONS.map(a => a[0]).filter(a => !listed.has(a))]];
    for (const [name, as] of groups) {
      if (!as.length) continue;
      const g = h('div', 'grp');
      g.innerHTML = `<span>${name}</span><small>Primária</small><small>Secundária</small>`;
      body.append(g);
      for (const a of as) {
        const row = h('div', 'bind' + (settings.binds[a]?.some(Boolean) ? '' : ' unbound'));
        row.append(h('label', null, LABEL[a]));
        if (!settings.binds[a]?.some(Boolean)) row.firstChild.insertAdjacentHTML('beforeend', ' <span class="pill pill--red">SEM TECLA</span>');
        for (const slot of [0, 1]) {
          const waiting = rebinding?.a === a && rebinding.slot === slot;
          const b = h('button', 'key' + (waiting ? ' wait' : ''), waiting ? 'Aperte uma tecla... (Esc cancela)' : keyName(settings.binds[a]?.[slot]));
          b.onclick = e => { e.stopPropagation(); startRebind(a, slot); };
          row.append(b);
        }
        body.append(row);
      }
    }
  }
  function startRebind(a, slot) {
    rebinding = { a, slot };
    const top = $('setBody').scrollTop;
    renderSettings();
    $('setBody').scrollTop = top;
    setTimeout(() => {
      const finish = code => {
        removeEventListener('keydown', onKey, true);
        removeEventListener('mousedown', onMouse, true);
        if (code !== null) {
          const lost = [];
          for (const k in settings.binds) settings.binds[k] = settings.binds[k].map((c, i) => (c === code && code && !(k === a && i === slot) ? (lost.push(k), '') : c));
          settings.binds[a][slot] = code;
          if (lost.length) toast(`${keyName(code)} saiu de "${LABEL[lost[0]] || lost[0]}"`, 'warn');
          save();
          onChange('binds');
        }
        rebinding = null;
        const t = $('setBody').scrollTop;
        renderSettings();
        $('setBody').scrollTop = t;
        $('setBody').querySelectorAll('.bind')[[...$('setBody').querySelectorAll('.bind label')].findIndex(l => l.firstChild.textContent === LABEL[a])]?.querySelectorAll('.key')[slot]?.focus({ preventScroll: true });
      };
      const onKey = e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape' || e.code === 'F11') return finish(null);
        finish(e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code);
      };
      const onMouse = e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.button === 0 && !e.target.closest('.key.wait')) return finish(null); // clicou fora = cancela (antes virava "Mouse Esq." e roubava o soco)
        finish('Mouse' + e.button);
      };
      addEventListener('keydown', onKey, true);
      addEventListener('mousedown', onMouse, true);
    }, 0);
  }

  // ---------- como jogar: manual em abas (bullets curtas com as teclas configuradas)
  const B = s => `<strong>${s}</strong>`;
  const abilKeys = () => abilitiesOf(settings.char).map(a => kk(a.action)).join(' ');
  const HOWTO = [
    ['basico', 'Básico', () => [
      ['Movimento', [`${['forward', 'left', 'back', 'right'].map(kk).join('')} anda, o mouse mira.`, `${kk('jump')} pula. De novo no ar = ${B('PULO DUPLO')}.`,
        `${kk('dash')} dá dash (3 cargas). Acertar golpe recarrega mais rápido.`, `Dash pra frente segurando ${kk('forward')} = ${B('CORRIDA')}. ${kk('crouch')} correndo = ${B('SLIDE')}, passa por baixo de soco.`]],
      ['Ataques', [`${kk('light')} soco rápido: emende 3 seguidos.`, `${kk('heavy')} soco pesado: lento, mas ${B('QUEBRA A DEFESA')} e arremessa.`,
        `Correndo + soco = ${B('SOCO VOADOR')} (às vezes sai ${B('CRÍTICO')}).`, `Slide + soco = ${B('RASTEIRA')}: joga pro alto.`]],
      ['Combos e perseguição', [`Golpe entrou? ${kk('dash')} ou ${kk('dodge')} cancelam o resto: emende outra coisa.`, `Arremessou? Dash pra frente vai atrás (${B('PERSEGUIÇÃO')}).`,
        `Contra a parede ou pilar = ${B('PAREDE!')}: ele fica tonto.`, `Depois de ${T.shrinkStart}s a arena começa a fechar.`]],
      ['Trava de mira', [`${kk('lock')} trava a câmera no oponente. O mouse ainda ajusta.`, 'Aperte de novo pra soltar. Solta sozinha no K.O.', `${kk('view')} troca 1ª/3ª pessoa. Scroll do mouse = zoom.`]],
    ]],
    ['defesa', 'Defesa', () => [
      ['Defesa e parry', [`Segure ${kk('block')} pra defender: toma só um pouquinho.`, `Apertou bem na hora do golpe = ${B('PARRY')}: o oponente fica tonto.`]],
      ['Esquiva perfeita', [`${kk('dodge')} esquiva pro lado.`, 'Quando um golpe vem, a tecla aparece do lado da mira.', `Apertou quando ficou ${B('VERDE')} = ${B('ESQUIVA PERFEITA')}: câmera lenta e contra-ataque (+50%).`]],
      ['Ler o oponente', ['Rápido ganha do pesado, pesado ganha da defesa, defesa ganha do rápido.', 'Brilho na mão dele: amarelo = rápido, vermelho = pesado, roxo = poder.']],
    ]],
    ['poderes', 'Poderes', () => [
      ['Energia', ['A barra embaixo da vida enche batendo, apanhando, defendendo e esquivando.', 'Os poderes miram sozinhos no oponente.', 'Apertou no meio de um golpe? O poder sai logo depois.']],
      ['Habilidades', [`${abilKeys()} usam as habilidades do seu lutador.`, 'Cada lutador tem as suas: veja na aba LUTADORES.', 'Quadrinho apagado = recarregando, sem energia ou longe demais.']],
      ...(LABEL.grab ? [['Giro do Furacão', [`${kk('grab')} colado no oponente: agarra, gira e arremessa pra onde a câmera aponta.`, `Passa pela defesa. Mire numa parede: ${B('NA PAREDE!!')} dá dano extra.`]]] : []),
    ]],
    ['lutadores', 'Lutadores', null],
    ['arenas', 'Arenas', null],
  ];
  function renderHowto() {
    tabs($('howTabs'), HOWTO.map(([k, l]) => [k, l]), htab, k => { htab = k; renderHowto(); });
    const body = $('howtoBody'), t = HOWTO.find(x => x[0] === htab);
    body.scrollTop = 0;
    body.className = 'manual-body' + (t[2] ? '' : ' list');
    if (t[2]) {
      body.innerHTML = t[2]().map(([title, items]) => `<div class="topic"><h3>${title}</h3><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('');
      return;
    }
    body.replaceChildren();
    if (htab === 'lutadores') {
      for (const [k, name] of Object.entries(characters)) {
        const row = h('div', 'frow'), img = h('img'), head = h('div', 'frow-head'), abs = h('div', 'frow-abs');
        img.src = thumbs[k] || ''; img.alt = '';
        head.append(img, h('b', null, name), h('small', null, FIGHTER_INFO[k] || ''));
        abs.append(...abilitiesOf(k).map(abCard));
        row.append(head, abs);
        body.append(row);
      }
      loadKits().then(m => m && current === 'howto' && htab === 'lutadores' && !body.dataset.kit && (body.dataset.kit = 1, renderHowto()));
    } else {
      for (const m of MAPS) {
        const c = h('div', 'topic arena' + (m.soon ? ' soon' : ''));
        c.append(h('h3', null, m.name), h('p', null, m.desc));
        body.append(c);
      }
    }
  }

  // ---------- pausa (lista de golpes do seu lutador) e fim de luta (placar + estatísticas)
  function renderPause() {
    const p = pauseInfo, ch = p.char || settings.char;
    $('pauseTitle').textContent = p.title || (p.online ? 'A LUTA CONTINUA!' : 'PAUSADO');
    $('pauseOnline').classList.toggle('hidden', !p.online);
    $('pauseRestart').classList.toggle('hidden', !!(p.online || !actions.restart || p.tutorial));
    $('pauseQuit').textContent = p.online ? 'SAIR DA SALA' : p.tutorial ? 'SAIR DO TREINO' : 'SAIR DA LUTA';
    const sc = p.score || [0, 0];
    $('pauseInfo').textContent = p.tutorial ? 'TREINO' : p.round ? `ROUND ${p.round} · VOCÊ ${sc[0]} x ${sc[1]} ${(p.foe || '').toUpperCase()}` : '';
    $('pauseMovesTitle').textContent = `LISTA DE GOLPES — ${(characters[ch] || '').toUpperCase()}`;
    $('pauseMoves').replaceChildren(...abilitiesOf(ch).map(abCard));
    $('pauseAll').innerHTML = universal(abilitiesOf(ch));
  }
  function renderOver() {
    const o = overInfo, sc = o.score || [0, 0], won = o.won ?? sc[0] > sc[1];
    const t = $('overTitle');
    t.textContent = o.title || (won ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU!');
    t.classList.toggle('lose', !won);
    const side = (who, i) => {
      const s = $(i ? 'overFoe' : 'overMe'), c = who?.char;
      s.querySelector('img').src = thumbs[c] || '';
      s.querySelector('b').textContent = (who?.name || characters[c] || (i ? 'OPONENTE' : 'VOCÊ')).toUpperCase();
      s.querySelector('small').textContent = who?.tag || (i ? '' : 'VOCÊ');
    };
    side(o.me, 0); side(o.foe, 1);
    $('overNum').textContent = `${sc[0]} x ${sc[1]}`;
    const st = o.stats, box = $('overStats');
    box.replaceChildren();
    if (st) {
      for (const [k, label] of STATS) {
        const a = st[0]?.[k] ?? 0, b = st[1]?.[k], bb = b ?? 0;
        if (!a && !bb) continue;
        const max = Math.max(a, bb, 1), r = h('div', 'stat');
        r.innerHTML = `<b class="v${a >= bb ? ' win' : ''}">${Math.round(a)}</b><span class="bar l"><i style="width:${(a / max) * 100}%"></i></span><span class="lbl">${label}</span><span class="bar r"><i style="width:${(bb / max) * 100}%"></i></span><b class="v r${bb >= a ? ' win' : ''}">${b == null ? '—' : Math.round(b)}</b>`;
        box.append(r);
      }
      const best = BEST.map(k => [k, (st[0]?.[k] ?? 0) - (st[1]?.[k] ?? 0)]).sort((x, y) => y[1] - x[1])[0];
      if (best && best[1] >= 1 && st[0][best[0]] >= 1) box.append(h('p', 'best', `★ DESTAQUE: ${st[0][best[0]]} ${STATS.find(s => s[0] === best[0])[1]}!`));
    }
    box.classList.toggle('hidden', !box.childElementCount);
    // botões: offline = revanche / trocar lutador / menu; online = revanche (handshake) / voltar pra sala / sair
    const main = $('overMain');
    main.classList.toggle('busy', !!o.iWant);
    main.classList.toggle('hidden', o.canRematch === false);
    main.innerHTML = o.iWant ? 'ESPERANDO O OPONENTE' : o.foeWantsRematch ? 'ACEITAR REVANCHE <span class="kc kc--sm">Enter</span>' : 'REVANCHE <span class="kc kc--sm">Enter</span>';
    main.dataset.act = o.online && actions.rematch ? 'rematchOnline' : 'restart';
    $('overWants').classList.toggle('hidden', !o.foeWantsRematch);
    $('overSwap').classList.toggle('hidden', !!o.online);
    $('overRoom').classList.toggle('hidden', !o.online);
    $('overQuit').textContent = o.online ? 'SAIR DA SALA' : 'MENU';
    $('overQuit').dataset.act = o.online && actions.leaveRoom ? 'leaveRoom' : 'quit';
  }

  // ---------- aviso por cima da luta (online: RECONECTANDO, OPONENTE CAIU, VS)
  function overlay(text, n) {
    const ov = $('netOv');
    clearInterval(ovT);
    if (!text) return ov.classList.add('hidden');
    ov.className = '';
    ov.replaceChildren(h('b', null, text));
    if (typeof n === 'number' && n > 0) {
      const s = h('small', null, `${n}s`), end = performance.now() + n * 1000;
      ov.append(s);
      ovT = setInterval(() => { const left = Math.max(0, Math.ceil((end - performance.now()) / 1000)); s.textContent = `${left}s`; if (!left) clearInterval(ovT); }, 250);
    }
  }

  // ---------- lobby (src/lobby.js): a tela escuta sozinha
  lobby.on('rooms', () => current === 'online' && renderRooms());
  lobby.on('status', () => current === 'online' && renderRooms());
  lobby.on('error', e => { searching(false); toast(e.text, 'err', 3500); });
  lobby.on('room', r => {
    if (!r) { searching(false); if (current === 'room') show('online'); return; }
    const me = r.players[r.you ?? 0], foe = r.players[1 - (r.you ?? 0)];
    if (current === 'over') { Object.assign(overInfo, { iWant: !!me?.rematch, foeWantsRematch: !!foe?.rematch }); return renderOver(); }
    if (r.st !== 'waiting') return;
    if (r.qm && !foe) { if (!$('modal').querySelector('.searchbar')) searching(true); return; } // partida rápida sozinho = procurando
    searching(false);
    if (current === 'room') renderRoom();
    else if (!menu.classList.contains('hidden') && current === 'online') { toast(foe ? 'OPONENTE ENCONTRADO!' : 'Sala criada! Mande o código pro seu amigo.', 'ok'); show('room'); }
  });
  // deu PRONTO (mouse travado, esperando o outro) e apertou Esc: cancela o pronto e volta pra sala
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && menu.classList.contains('hidden') && lobby.state.status === 'room') { actions.setReady?.(false); show('room'); }
  });

  menu.dataset.dir = 'fwd';
  return {
    show,
    hide() { menu.classList.add('hidden'); hideModal(); },
    get current() { return current; },
    get hidden() { return menu.classList.contains('hidden'); },
    toast, ask, overlay,
    // pausa: setPause({ online, round, score:[eu,ele], foe:'NOME', char, tutorial, title }) — ou o formato antigo (título, online)
    setPause(info, online) { pauseInfo = typeof info === 'string' ? { title: info === 'ONLINE' ? '' : info, online } : info || {}; if (current === 'pause') renderPause(); },
    // fim: setOver({ won, score, me:{char,name,tag}, foe:{char,name,tag}, stats:[eu,ele], online, canRematch, foeWantsRematch, title }) — ou (título, placar, podeRecomeçar)
    setOver(info, score, can) {
      overInfo = typeof info === 'string' ? { title: info, won: info.includes('VENCEU'), score: String(score).split(' x ').map(Number), canRematch: can } : info || {};
      if (current === 'over') renderOver();
    },
    searching,
    versus(me, foe) {
      overlay(`${me?.nick || 'VOCÊ'} VS ${foe?.nick || '???'}`);
      $('netOv').classList.add('vs');
      setTimeout(() => $('netOv').classList.contains('vs') && overlay(), 2600);
    },
  };
}
