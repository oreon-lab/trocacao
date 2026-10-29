import { ACTIONS, DEFAULT_BINDS, keyName } from './input.js';

// Telas antes/durante o jogo: Início, Lutador, Online, Como jogar, Configurações, Pausa, Fim.
const $ = id => document.getElementById(id);
const pct = v => Math.round(v * 100) + '%';

export const DEFAULT_SETTINGS = {
  char: 'Barbarian', diff: 'normal', fightLen: 'normal', roundTime: 99, rounds: 2,
  tps: true, lockPull: 1, fov: 80, sens: 1, invertY: false, dbl: true, shake: 1, dmgNumbers: true, warnings: true, dodgeHint: true,
  quality: 'high', shadows: true, autoRes: true, resScale: 1, particles: 1, crowd: true, showFps: false, fs: true,
  vol: 0.6, binds: structuredClone(DEFAULT_BINDS),
};
// qualidade = atalho que ajusta outras opções
const QUALITY = {
  low: { shadows: false, particles: 0.5, crowd: false, resScale: 0.75 },
  med: { shadows: true, particles: 0.8, crowd: true, resScale: 0.9 },
  high: { shadows: true, particles: 1, crowd: true, resScale: 1 },
};

const TABS = {
  jogo: ['Jogo', [
    { k: 'diff', label: 'Dificuldade do bot', type: 'choice', opts: [['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']] },
    { k: 'fightLen', label: 'Duração da luta', type: 'choice', opts: [['short', 'Rápida'], ['normal', 'Normal'], ['long', 'Longa']], hint: 'Vida de cada lutador: 100 / 160 / 220 (no online vale a Normal).' },
    { k: 'roundTime', label: 'Tempo do round', type: 'choice', opts: [[60, '60s'], [99, '99s'], [0, 'Sem limite']] },
    { k: 'rounds', label: 'Rounds pra vencer', type: 'choice', opts: [[1, '1'], [2, '2'], [3, '3']] },
    { k: 'tps', label: 'Câmera em 3ª pessoa', type: 'toggle' },
    { k: 'lockPull', label: 'Força da trava de mira', type: 'range', min: 0.3, max: 2, step: 0.05, fmt: pct, hint: 'Quanto a câmera puxa pro oponente quando a mira está travada. O mouse ainda mexe.' },
    { k: 'fov', label: 'Campo de visão', type: 'range', min: 65, max: 105, step: 1, fmt: v => v + '°' },
    { k: 'sens', label: 'Sensibilidade do mouse', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { k: 'invertY', label: 'Inverter eixo Y do mouse', type: 'toggle' },
    { k: 'dbl', label: 'Dash com toque duplo nas setas de andar', type: 'toggle' },
    { k: 'shake', label: 'Tremida da câmera', type: 'range', min: 0, max: 1.5, step: 0.05, fmt: pct },
    { k: 'dmgNumbers', label: 'Números de dano', type: 'toggle' },
    { k: 'warnings', label: 'Avisos de ataque (anel e "!")', type: 'toggle' },
    { k: 'dodgeHint', label: 'Mostrar a tecla da esquiva na hora', type: 'toggle' },
  ]],
  controles: ['Controles', null],
  video: ['Vídeo', [
    { k: 'quality', label: 'Qualidade', type: 'choice', opts: [['low', 'Baixa'], ['med', 'Média'], ['high', 'Alta']], hint: 'Ajusta sombras, partículas, torcida e resolução de uma vez.' },
    { k: 'shadows', label: 'Sombras', type: 'toggle' },
    { k: 'autoRes', label: 'Resolução automática (segura o FPS)', type: 'toggle' },
    { k: 'resScale', label: 'Escala de resolução', type: 'range', min: 0.5, max: 1, step: 0.05, fmt: pct },
    { k: 'particles', label: 'Partículas e efeitos', type: 'range', min: 0.3, max: 1.5, step: 0.1, fmt: pct },
    { k: 'crowd', label: 'Torcida', type: 'toggle' },
    { k: 'showFps', label: 'Mostrar FPS', type: 'toggle' },
    { k: 'fs', label: 'Tela cheia ao entrar na luta', type: 'toggle' },
  ]],
  audio: ['Áudio', [
    { k: 'vol', label: 'Volume geral', type: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  ]],
};

const FIGHTER_INFO = {
  Barbarian: 'Peludo, barbudo e sem paciência.',
  Knight: 'Lata reforçada. Bate e aguenta.',
  Rogue: 'Rápida no olho e na mão.',
  Mage: 'Trocou o cajado pela porrada.',
};

export function initMenu({ settings, save, onChange, characters, thumbs, actions }) {
  const menu = $('menu');
  let current = 'home', back = ['home'], tab = 'jogo', rebinding = null;

  function show(name) {
    if (name !== current) back.push(current);
    current = name;
    menu.classList.remove('hidden');
    menu.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.dataset.screen === name));
    if (name === 'settings') renderSettings();
    if (name === 'howto') renderHowto();
    if (name === 'select') renderFighters();
  }
  function goBack() {
    let prev = back.pop() || 'home';
    while (prev === current && back.length) prev = back.pop();
    current = prev;
    menu.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.dataset.screen === prev));
  }
  menu.addEventListener('click', e => {
    const go = e.target.closest('[data-go]'), bk = e.target.closest('[data-back]'), act = e.target.closest('[data-act]');
    if (go) show(go.dataset.go);
    if (bk) goBack();
    if (act) actions[act.dataset.act]?.();
  });

  function set(k, v) {
    settings[k] = v;
    if (k === 'quality') Object.assign(settings, QUALITY[v]);
    save();
    onChange(k);
  }

  // ---- lutador
  function renderFighters() {
    const box = $('fighters');
    box.innerHTML = '';
    for (const [k, name] of Object.entries(characters)) {
      const b = document.createElement('button');
      b.className = 'fighter' + (settings.char === k ? ' on' : '');
      b.innerHTML = `<img src="${thumbs[k] || ''}" alt=""><b>${name}</b><span>${FIGHTER_INFO[k] || ''}</span>`;
      b.onclick = () => { set('char', k); renderFighters(); };
      box.appendChild(b);
    }
    segment($('selDiff'), TABS.jogo[1][0]);
  }

  // ---- controles de configuração
  function segment(box, o) {
    box.innerHTML = '';
    for (const [v, label] of o.opts) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = String(settings[o.k]) === String(v) ? 'on' : '';
      b.onclick = () => { set(o.k, v); segment(box, o); if (o.k === 'quality') renderSettings(); };
      box.appendChild(b);
    }
  }
  function control(o) {
    const row = document.createElement('div');
    row.className = 'set';
    row.innerHTML = `<label>${o.label}${o.hint ? `<small>${o.hint}</small>` : ''}</label><div class="ctl"></div>`;
    const ctl = row.querySelector('.ctl');
    if (o.type === 'choice') { const s = document.createElement('div'); s.className = 'seg'; segment(s, o); ctl.appendChild(s); }
    if (o.type === 'toggle') {
      const b = document.createElement('button');
      const paint = () => { b.className = 'tog' + (settings[o.k] ? ' on' : ''); b.textContent = settings[o.k] ? 'LIGADO' : 'DESLIGADO'; };
      b.onclick = () => { set(o.k, !settings[o.k]); paint(); };
      paint();
      ctl.appendChild(b);
    }
    if (o.type === 'range') {
      ctl.innerHTML = `<input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${settings[o.k]}"><b>${o.fmt(+settings[o.k])}</b>`;
      const r = ctl.querySelector('input'), out = ctl.querySelector('b');
      r.oninput = () => { set(o.k, +r.value); out.textContent = o.fmt(+r.value); };
    }
    return row;
  }
  function renderSettings() {
    const tabs = $('setTabs'), body = $('setBody');
    tabs.innerHTML = '';
    for (const [k, [label]] of Object.entries(TABS)) {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = k === tab ? 'on' : '';
      b.onclick = () => { tab = k; renderSettings(); };
      tabs.appendChild(b);
    }
    body.innerHTML = '';
    if (tab === 'controles') return renderBinds(body);
    for (const o of TABS[tab][1]) body.appendChild(control(o));
  }

  // ---- troca de teclas: clique no botão e aperte a tecla (ou botão do mouse). Esc cancela, Backspace limpa.
  function renderBinds(body) {
    const head = document.createElement('div');
    head.className = 'binds-head';
    head.innerHTML = '<span>Ação</span><span>Primária</span><span>Secundária</span>';
    body.appendChild(head);
    for (const [a, label] of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'bind';
      row.innerHTML = `<label>${label}</label>`;
      for (const slot of [0, 1]) {
        const b = document.createElement('button');
        const waiting = rebinding && rebinding.a === a && rebinding.slot === slot;
        b.className = 'key' + (waiting ? ' wait' : '');
        b.textContent = waiting ? 'Aperte uma tecla...' : keyName(settings.binds[a]?.[slot]);
        b.onclick = e => { e.stopPropagation(); startRebind(a, slot); };
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    const foot = document.createElement('div');
    foot.className = 'binds-foot';
    foot.innerHTML = '<small>Clique numa tecla e aperte a nova (vale botão do mouse). <b>Esc</b> cancela, <b>Backspace</b> apaga. Se a tecla já estiver em uso, ela sai da outra ação.</small>';
    const reset = document.createElement('button');
    reset.className = 'btn';
    reset.textContent = 'RESTAURAR PADRÃO';
    reset.onclick = () => { settings.binds = structuredClone(DEFAULT_BINDS); save(); onChange('binds'); renderSettings(); };
    foot.appendChild(reset);
    body.appendChild(foot);
  }
  function startRebind(a, slot) {
    rebinding = { a, slot };
    renderSettings();
    setTimeout(() => {
      const finish = code => {
        removeEventListener('keydown', onKey, true);
        removeEventListener('mousedown', onMouse, true);
        if (code !== null) {
          for (const k in settings.binds) settings.binds[k] = settings.binds[k].map(c => (c === code ? '' : c)); // tira de onde estava
          settings.binds[a][slot] = code;
          save();
          onChange('binds');
        }
        rebinding = null;
        renderSettings();
      };
      const onKey = e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape' || e.code === 'F11') return finish(null);
        finish(e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code);
      };
      const onMouse = e => { e.preventDefault(); e.stopPropagation(); finish('Mouse' + e.button); };
      addEventListener('keydown', onKey, true);
      addEventListener('mousedown', onMouse, true);
    }, 0);
  }

  // ---- como jogar (usa as teclas configuradas)
  function renderHowto() {
    const k = a => settings.binds[a].filter(Boolean).map(c => `<kbd>${keyName(c)}</kbd>`).join(' ou ') || '<kbd>—</kbd>';
    const move = ['forward', 'left', 'back', 'right'].map(a => `<kbd>${keyName(settings.binds[a][0])}</kbd>`).join('');
    $('howtoBody').innerHTML = [
      ['🏃', 'Movimento', `${move} anda, mouse mira. ${k('jump')} pula (segure pra ir mais alto). ${k('dash')} dá um dash na direção que você anda (3 cargas, 1 no ar). ${k('crouch')} agacha; correndo ou no dash vira <b>slide</b>.`],
      ['👊', 'Ataques', `${k('light')} soco rápido, alternando as mãos: emende 3 seguidos. ${k('heavy')} soco pesado: lento, mas <b>quebra a defesa</b>. Dash + soco = <b>investida</b>. Slide + soco = <b>rasteira</b> (joga pro alto; só se defende agachado).`],
      ['🛡️', 'Defesa e parry', `Segure ${k('block')} pra defender (toma só um pouquinho). Apertar <b>bem na hora</b> que o golpe chega é <b>PARRY</b>: o oponente fica atordoado. Parry numa bola de energia <b>rebate ela</b>.`],
      ['💨', 'Esquiva perfeita', `${k('dodge')} esquiva pro lado. Quando um golpe vem, a tecla aparece do lado da mira: aperte quando ela ficar <b style="color:#20a83a">VERDE</b> = <b>ESQUIVA PERFEITA</b>: câmera lenta, invencível e o próximo golpe é um <b>contra-ataque</b> (+50% de dano).`],
      ['⚡', 'Energia e poderes', `A barra embaixo da vida enche batendo, apanhando, defendendo, com parry e esquiva perfeita. ${k('q')} usa a <b>habilidade do seu lutador</b> (35). ${k('r')} com a barra cheia: <b>SUPER SOCO</b> voador que quebra defesa.`],
      ['✨', 'Habilidades (Q)', `<b>Bárbaro — Terremoto:</b> pula e soca o chão, a onda derruba quem estiver perto (pule pra escapar). <b>Cavaleiro — Investida Sagrada:</b> avança com um escudo de luz que segura golpes de frente. <b>Ladina — Passo Sombrio:</b> some na fumaça e aparece atrás do oponente com uma facada. <b>Mago — Meteoro:</b> marca um círculo no chão e um meteoro cai ali (saia do círculo!).`],
      ['🎯', 'Dicas', `Soco rápido ganha do pesado, pesado ganha da defesa, defesa/parry ganha do rápido. Fique de olho no <b>brilho da mão</b> do oponente: amarelo = rápido, vermelho = pesado, roxo = super. ${k('view')} troca entre 1ª e 3ª pessoa.`],
      ['🔒', 'Travar a mira', `${k('lock')} trava a câmera no oponente: você anda em volta dele e a câmera continua puxando pra ele (o mouse ainda ajusta). Aperte de novo pra soltar. Solta sozinha no K.O. ou se ele ficar muito longe.`],
    ].map(([icon, title, text]) => `<div class="tip"><i>${icon}</i><h3>${title}</h3><p>${text}</p></div>`).join('');
  }

  return {
    show,
    hide() { menu.classList.add('hidden'); },
    get current() { return current; },
    setOnline(text, connected) {
      $('netStatus').textContent = text;
      $('enterFight').classList.toggle('hidden', !connected);
    },
    setPause(title, online) {
      $('pauseTitle').textContent = title;
      $('quitBtn').textContent = online ? 'SAIR DA SALA' : 'SAIR PRO MENU';
    },
    setOver(title, score, canRestart) {
      $('overTitle').textContent = title;
      $('overScore').textContent = score;
      $('restartBtn').classList.toggle('hidden', !canRestart);
    },
  };
}
