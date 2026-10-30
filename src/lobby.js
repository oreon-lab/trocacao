/**
 * Lobby online do Trocação: 1 WebSocket por aba falando com o server.js (/ws). Sem DOM, sem three (roda no Node também).
 *
 * USO — a UI (menu.js) e o main.js usam a MESMA instância:
 *   import { lobby, ERR } from './lobby.js';
 *   const off = lobby.on('rooms', st => desenhaLista(st.rooms));   // devolve a função que desinscreve
 *   lobby.list(true);              // tela do lobby abriu: assina a lista (chega na hora e a cada mudança, no máx. 1/s)
 *   lobby.quickMatch(settings.char);
 * Qualquer comando conecta sozinho (não precisa chamar connect). Instância própria (testes): createLobby({ url, onRooms, onRoom, ... }).
 *
 * MÉTODOS
 *   connect(nick?)              abre a conexão (se cair sem estar em sala, reconecta sozinho)
 *   disconnect()                fecha de vez (sai da sala, se estiver em uma)
 *   setNick(nick)               apelido (o servidor limpa: 2-16 letras/números/espaço _ . ! ? -; vazio = "Lutador1234")
 *   list(on = true)             assina/desassina a lista de salas
 *   quickMatch(char)            partida rápida: pareia com quem está procurando / entra na sala pública aberta mais antiga /
 *                               cria uma e espera. Pareou = começa sozinha em room.auto ms (ou antes, se os 2 derem pronto)
 *   cancel()                    cancela a procura (sai da sala enquanto ela ainda está esperando)
 *   createRoom({ name, pub = true, map = 'random', bo = 1|3|5, char })   cria sala; você é o host (vaga 0)
 *   joinRoom(code, char)        entra por código (4 letras, aceita minúsculas); também é o que o link ?sala=CODE usa
 *   setRoom({ name, pub, map, bo })   só o host, só esperando; tira o "pronto" dos dois
 *   pick(char)                  troca de lutador na sala (só sem "pronto")
 *   ready(on = true)            pronto! Os 2 prontos = 'prep'
 *   loaded()                    (main.js) arena e lutadores do 'prep' montados. Os 2 avisaram = 'go'
 *   rematch(on = true)          voto de revanche no resultado. Os 2 votaram = novo 'prep' (mesmos lutadores/mapa, seed nova)
 *   backToRoom()                resultado → os 2 voltam pra sala
 *   leave()                     sai da sala (no meio da luta = W.O. pro oponente)
 *   send(msg)                   (main.js) mensagem de luta pro oponente: { t: 's'|'hit'|'res'|'fire'|'round'|'end'|... }.
 *                               Só passa durante a luta; 'round'/'end' só passam se vierem do host (vaga 0)
 *   inviteLink(code?)           link de convite …/?sala=CODE (padrão: a sala atual)
 *   serverNow()                 relógio do servidor em ms (igual nos 2 PCs; erro ≈ assimetria da rede / 2)
 *
 * ESTADO (só leitura): lobby.state = { status, nick, rtt, online, searching, rooms, room, match }
 *   status   'offline' | 'connecting' | 'hub' (conectado, sem sala) | 'searching' (partida rápida sozinho na sala)
 *            | 'room' (na sala, esperando/pronto) | 'match' (carregando, lutando ou no resultado)
 *   rtt      seu ping em ms;  online = jogadores conectados;  searching = salas de partida rápida esperando alguém
 *   rooms    [{ code, name, host, char, map, bo, n, st, ping, at }]  (só salas públicas, abertas primeiro, até 50)
 *            n = jogadores (1 ou 2); st 'w' ESPERANDO | 'f' CHEIA | 'p' EM JOGO; char = lutador do host;
 *            ping = ping do host (ms; o ping estimado da partida ≈ rtt + ping); at = criada em (Date.now() do servidor)
 *   room     { code, name, pub, qm, map, bo, st, you, auto, players: [p0, p1] } ou null
 *            st 'waiting' | 'loading' | 'playing' | 'over'; you = sua vaga (0 = host, quem cria/muda a sala);
 *            qm = sala de partida rápida; auto = ms até começar sozinha (0 = não); map = id ou 'random'
 *            p = { nick, char, ready, ping, rematch } ou null (vaga livre)
 *   match    o último 'prep' (abaixo), enquanto status === 'match'
 *
 * EVENTOS: lobby.on(nome, fn) → off(). Com createLobby({ onNome }) também (onRooms, onRoom, onStatus, onError, onPrep, ...).
 *   status(state)        mudou state.status (conectou, caiu, entrou/saiu de sala, começou a luta...)
 *   rooms(state)         lista nova em state.rooms (+ state.online / state.searching)
 *   room(room|null)      sala nova/atualizada (jogadores, pronto, revanche, mapa, auto); null = você saiu
 *   error({ code, text }) text em pt-BR pronto pra mostrar (tabela ERR)
 *   prep(m)              os 2 prontos: { map, seed, bo, you, players: [{ nick, char }, { nick, char }] } (map já sorteado)
 *   go({ at })           os 2 carregaram: a luta começa (o host manda o round 1); at = hora do servidor
 *   over({ w, why, wins }) fim da partida pelo servidor: w = vaga vencedora; why 'ko' | 'wo' (o outro saiu/caiu)
 *   peerLeft({ slot })   o oponente saiu ou caiu; a sala continua e você vira o host
 *   lost()               a conexão caiu estando numa sala ou luta (a sala foi embora); reconecta sozinho ao lobby
 *   msg(m)               mensagem de luta vinda do oponente (repasse do send dele)
 */
export const NET_VERSION = 2; // igual ao do server.js

export const ERR = {
  full: 'Essa sala está cheia.', notfound: 'Sala não encontrada (talvez já acabou).', started: 'A luta nessa sala já começou.',
  limit: 'Servidor lotado. Tenta de novo daqui a pouco.', version: 'Seu jogo está desatualizado. Aperte Ctrl+F5.',
  flood: 'Calma! Muitos pedidos de uma vez.', bad: 'Pedido inválido.', inroom: 'Você já está numa sala.',
  loadfail: 'Demorou demais pra carregar a arena.', gone: 'A conexão caiu e a sala fechou.', down: 'Servidor fora do ar. Tentando de novo...',
};

export function createLobby(opts = {}) {
  const subs = {};
  const emit = (ev, x) => {
    opts['on' + ev[0].toUpperCase() + ev.slice(1)]?.(x);
    subs[ev]?.forEach(f => f(x));
  };
  const st = { status: 'offline', nick: '', rtt: 0, online: 0, searching: 0, rooms: [], room: null, match: null };
  let ws = null, ok = false, want = false, tries = 0, pingT = 0, listOn = false, offset = 0, leaving = false;
  const queue = [], samples = []; // comandos antes do 'welcome'; [rtt, offset] dos últimos pongs

  const raw = o => ws?.readyState === 1 && ws.send(JSON.stringify(o));
  const cmd = o => { if (ok) raw(o); else { queue.push(o); connect(); } };
  function status() {
    const r = st.room, mine = r?.players.filter(Boolean).length;
    const s = !ws ? 'offline' : !ok ? 'connecting' : !r ? 'hub' : st.match || r.st !== 'waiting' ? 'match' : r.qm && mine < 2 ? 'searching' : 'room';
    if (s === st.status) return;
    st.status = s;
    emit('status', st);
  }
  function setRoom(r) {
    if (!r || r.st === 'waiting') st.match = null;
    st.room = r;
    emit('room', r);
    status();
  }

  function connect(nick) {
    if (nick != null) st.nick = String(nick);
    want = true;
    if (ws) return;
    const url = opts.url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const w = (ws = new WebSocket(url));
    ok = false;
    status();
    w.onopen = () => w.send(JSON.stringify({ t: 'hello', v: NET_VERSION, nick: st.nick }));
    w.onmessage = e => {
      if (w !== ws) return; // socket velho (reconectou): ignora
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      onMsg(m);
    };
    w.onclose = e => {
      if (w !== ws) return;
      const was = ok, inRoom = !!st.room;
      ws = null; ok = false; leaving = false;
      clearInterval(pingT);
      st.room = null;
      status();
      if (inRoom) { emit('room', null); emit('lost'); }
      if (e.code === 4000) { want = false; return emit('error', { code: 'version', text: ERR.version }); }
      if (!was && tries === 0) emit('error', { code: 'down', text: ERR.down });
      if (want) setTimeout(() => want && !ws && connect(), Math.min(5000, 300 * 2 ** tries++));
    };
  }

  function onMsg(m) {
    if (leaving && !['welcome', 'pong', 'rooms', 'err', 'hub'].includes(m.t)) return; // saí da sala: o que ainda vinha dela é velho
    switch (m.t) {
      case 'welcome':
        st.nick = m.nick;
        if (!ok) {
          ok = true; tries = 0;
          offset = m.s - performance.now();
          pinger(ws);
          if (listOn) raw({ t: 'list', on: true });
          queue.splice(0).forEach(raw);
        }
        status();
        return emit('welcome', st);
      case 'pong': return clock(m);
      case 'hub': leaving = false; return;
      case 'rooms': Object.assign(st, { rooms: m.list, online: m.online, searching: m.searching }); return emit('rooms', st);
      case 'room': return setRoom(m);
      case 'prep': st.match = m; status(); return emit('prep', m);
      case 'go': return emit('go', m);
      case 'over': return emit('over', m);
      case 'peer': return emit('peerLeft', m);
      case 'err': return emit('error', { code: m.code, text: ERR[m.code] || ERR.bad });
      default: return emit('msg', m);
    }
  }
  function pinger(w) {
    const ping = () => w === ws && raw({ t: 'ping', c: performance.now(), r: Math.round(st.rtt) });
    let n = 0;
    ping();
    const fast = setInterval(() => { ping(); if (++n >= 4) clearInterval(fast); }, 100); // 5 pings rápidos: relógio certo logo
    pingT = setInterval(ping, 2000);
  }
  function clock(m) {
    const t = performance.now(), rtt = t - m.c;
    samples.push([rtt, m.s + rtt / 2 - t]);
    if (samples.length > 8) samples.shift();
    offset = samples.reduce((a, b) => (b[0] < a[0] ? b : a))[1]; // amostra de menor ping = relógio mais confiável
    st.rtt = st.rtt ? st.rtt + (rtt - st.rtt) * 0.25 : rtt;
  }

  function leave() {
    if (!st.room) return;
    setRoom(null);
    if (ok) { leaving = true; raw({ t: 'leave' }); }
  }

  return {
    state: st,
    on(ev, fn) { (subs[ev] ||= new Set()).add(fn); return () => subs[ev].delete(fn); },
    connect,
    disconnect() {
      want = false;
      queue.length = 0;
      const w = ws, inRoom = !!st.room;
      ws = null; ok = false; leaving = false;
      clearInterval(pingT);
      st.room = null;
      w?.close(1000);
      if (inRoom) emit('room', null);
      status();
    },
    setNick(n) { st.nick = String(n ?? ''); if (ok) raw({ t: 'nick', nick: st.nick }); },
    list(on = true) { listOn = on; if (on || ok) cmd({ t: 'list', on }); },
    quickMatch: char => cmd({ t: 'quick', char }),
    cancel() { if (st.room?.st === 'waiting') leave(); },
    createRoom: ({ name, pub = true, map = 'random', bo = 3, char } = {}) => cmd({ t: 'create', name, pub, map, bo, char }),
    joinRoom: (code, char) => cmd({ t: 'join', code: String(code ?? '').trim().toUpperCase(), char }),
    setRoom: o => cmd({ t: 'set', ...o }),
    pick: char => cmd({ t: 'pick', char }),
    ready: (on = true) => cmd({ t: 'ready', on }),
    loaded: () => cmd({ t: 'loaded' }),
    rematch: (on = true) => cmd({ t: 'rematch', on }),
    backToRoom: () => cmd({ t: 'back' }),
    leave,
    send: raw,
    inviteLink: (code = st.room?.code) => `${location.origin}${location.pathname}?sala=${code}`,
    serverNow: () => performance.now() + offset,
  };
}

export const lobby = createLobby();
