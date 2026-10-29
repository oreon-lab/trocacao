# Trocação

Luta 1v1 em 3ª pessoa (V alterna pra 1ª), Three.js sem build. Contra bot ou online contra outra pessoa.

## Rodar

Precisa de Node 18+ (sem `npm install`, zero dependências):

```bash
node server.js
```

Abra http://localhost:5173. O mesmo servidor entrega o jogo e faz o multiplayer (`PORT=8080 node server.js` muda a porta).

## Mecânicas

- **E** — esquiva. Quando um golpe vem, aparece um "E" na tela; se apertar quando ele fica **verde**, é ESQUIVA PERFEITA: câmera lenta, invencível, e o próximo golpe é um contra-ataque (x1.5).
- **F** — defesa (apertar bem na hora do golpe = parry; parry numa bola de energia rebate ela).
- **Energia** (barra embaixo da vida): enche batendo, apanhando, defendendo, com parry e esquiva perfeita.
- **Q** — bola de energia (35). **R** — super soco voador (barra cheia, quebra defesa).
- **F11** / **Alt+Enter** — tela cheia.

## Online 1v1

1. Um jogador clica em **ONLINE 1v1** com o código vazio: cria uma sala e mostra o código.
2. O outro digita o código e clica em **ONLINE 1v1**.
3. Os dois clicam em **ENTRAR NA LUTA**.

Pra jogar com alguém fora da sua rede, o servidor precisa estar acessível (porta aberta no roteador, ou um túnel tipo `cloudflared tunnel --url http://localhost:5173` / ngrok). Funciona em `https` também (usa `wss`).

Como sincroniza: cada um simula o próprio lutador (zero atraso no seu movimento) e manda o estado 30x/s; o oponente é desenhado ~100ms no passado, interpolado. Quem bate detecta o acerto; quem apanha decide o resultado (defesa, parry, quebra) e devolve. Quem criou a sala manda nos rounds, placar e tempo.

## Estrutura

| Arquivo | O quê |
|---|---|
| `src/config.js` | **Todos os números de feel** (velocidade, dash, pulo, dano, frames dos golpes) |
| `src/fighter.js` | Física + combate de um lutador. Jogador e bot usam a mesma classe |
| `src/input.js` | Teclado/mouse → input abstrato |
| `src/bot.js` | IA: gera o mesmo input que o jogador (fácil/normal/difícil) |
| `src/rig.js` | Personagens KayKit + mistura de animações (corpo de cima/baixo) sincronizada com os golpes. Em 1ª pessoa, uma cópia só com os braços vai presa na câmera |
| `assets/kaykit/` | Bárbaro, Cavaleiro, Ladina, Mago — KayKit Adventurers (Kay Lousberg, CC0) |
| `assets/kaykit/extra_anims.glb` | Animações feitas no Blender pro rig KayKit: guarda/jab/direto de 1ª pessoa e uppercut (pesado) |
| `tools/fp_anims.py` | Gera o `extra_anims.glb`: `blender -b --factory-startup --python tools/fp_anims.py` (IK nas mãos sobre a Unarmed_Idle, assado quadro a quadro; imprime onde as mãos caem na tela) |
| `check.html` | Folha de poses de cada personagem + checagem de pés/altura (`?c=Knight`) |
| `src/arena.js` | Cenário + colisão com borda/pilares |
| `src/fx.js` | Partículas, estrelas de impacto, rastro do dash, sons sintetizados |
| `src/toon.js` | Material toon + contorno preto |
| `src/main.js` | Loop, rounds, câmera (shake, FOV, inclinação), HUD, modo online |
| `src/net.js` | Cliente da sala: estado do lutador, interpolação do oponente |
| `server.js` | Servidor único: arquivos do jogo + WebSocket das salas (feito à mão, sem dependências) |
