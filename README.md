# Trocação

Luta 1v1 em 3ª pessoa (V alterna pra 1ª), Three.js sem build. Contra bot ou online contra outra pessoa.

## Rodar

Precisa de Node 18+ (sem `npm install`, zero dependências):

```bash
node server.js
```

Abra http://localhost:5173. O mesmo servidor entrega o jogo e faz o multiplayer (`PORT=8080 node server.js` muda a porta).

## Mecânicas

- **Q** — esquiva. Quando um golpe vem, aparece um "Q" na tela; se apertar quando ele fica **verde**, é ESQUIVA PERFEITA: câmera lenta, invencível, e o próximo golpe é um contra-ataque (x1.5).
- **F** — defesa (apertar bem na hora do golpe = parry).
- **Movimentação:** pulo duplo (devolve o dash do ar); dash pra frente + segurar W = corrida (soco na corrida = soco voador; 30% de chance de CRÍTICO: x1.8 de dano e empurrão x2.2); dash contra borda/pilar = ricochete; slide passa por baixo de socos.
- **Combos:** depois que o golpe acerta, dash/esquiva cancelam o resto. Pesado arremessa; dash pra frente persegue; golpe no ar levanta de novo; arremessado na parede fica tonto. Acertar recarrega o dash mais rápido, defender mais devagar.
- **G — Giro do Furacão:** colado no oponente, agarra pelas mãos (gasta 70 de energia e tem 10s de recarga; errou, não gasta), gira ~3 voltas num furacão de vento e arremessa pra onde a câmera aponta (passa pela defesa; na parede = dano extra). Poses `Grab_Spin`/`Grabbed_Fly` no `tools/fp_anims.py`; no jogo os braços se esticam até as mãos se encontrarem (`Rig.linkHands`). Desligado no online.
- **Arena fecha** depois de 25s de luta (parede vermelha), até raio 10.5.
- **Energia** (barra embaixo da vida): enche batendo, apanhando, defendendo, com parry e esquiva perfeita.
- **E** — habilidade do seu lutador (35). **R** — super soco voador na cor do lutador (barra cheia, quebra defesa).
  - **Bárbaro — Terremoto:** pula e soca o chão; a onda (espetos de pedra, rachaduras) derruba quem está perto. Pule pra escapar.
  - **Cavaleiro — Investida Sagrada:** avança com um escudo de luz que segura golpes de frente.
  - **Ladina — Passo Sombrio:** some na fumaça e aparece atrás do oponente com uma facada.
  - **Mago — Meteoro:** marca um círculo no chão e um meteoro em chamas cai ali. Saia do círculo!
  - **Encapuzada — Leque de Adagas:** 3 facas girando em leque (a faca do próprio modelo); cada uma atordoa. Pilar segura; dá pra esquivar.
  - **Ossudo — Roda de Ossos:** gira ~1s indo atrás do oponente, acertando várias vezes; o último giro quebra a defesa e arremessa. Fuja ou acerte ele pra parar.
  - **Necromante — Prisão de Ossos:** círculo roxo enche no chão (tempo pra sair) e sobem espetos de osso: quem ficou dentro fica **preso** 1,6s (não anda, não pula, não dá dash).
  - **Sombra — Lâmina Venenosa:** atravessa o oponente como um raio (invencível) com um corte que **envenena** (perde vida por 4s; barra de vida fica verde).
  - **Lacaio — Exército de Ossos:** 2 mini-esqueletos saem do chão e correm atrás do oponente; explodem ao encostar, mas um soco quebra cada um.
- **Botão do meio do mouse / T** — trava a mira no oponente (ajuda leve; aparece um pontinho vermelho nele).
- **Scroll do mouse** — zoom (campo de visão). Em 3ª pessoa, de perto o golpe vai no oponente se ele estiver mais ou menos na frente da câmera, e a câmera se afasta e sobe um pouco pra caber os dois.
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
| `src/bot.js` | IA com cabeça de gente: gera o mesmo input que o jogador, mas vê com atraso (tempo de reação), mira como mouse, erra o tempo da esquiva, joga em planos (dança na distância, entra com dash, pressiona, espera seu erro, isca), confere o combo, pune erro, lê o ritmo pra dar parry, aprende seus hábitos e tem humor/estilo por luta. Fácil/normal/difícil mudam reação, precisão e execução, não trapaça |
| `src/rig.js` | Personagens KayKit + mistura de animações (corpo de cima/baixo) sincronizada com os golpes. Em 1ª pessoa, uma cópia só com os braços vai presa na câmera |
| `assets/kaykit/` | Bárbaro, Cavaleiro, Ladina, Mago, Encapuzada — KayKit Adventurers; Ossudo, Necromante, Sombra, Lacaio — KayKit Skeletons (Kay Lousberg, CC0). Mesmo esqueleto de ossos, então todas as animações valem pra todos |
| `src/powers.js` | O que as habilidades novas soltam na arena: adagas, Prisão de Ossos, mini-esqueletos, e o visual de preso/envenenado. Quem lança decide o acerto (online manda `hit`, igual ao meteoro) |
| `assets/kaykit/extra_anims.glb` | Animações feitas no Blender pro rig KayKit: guarda/jab/direto de 1ª pessoa, uppercut (pesado) e as habilidades (Ground_Slam, Shield_Charge, Meteor_Call) |
| `tools/fp_anims.py` | Gera o `extra_anims.glb`: `blender -b --factory-startup --python tools/fp_anims.py` (IK nas mãos sobre a Unarmed_Idle, assado quadro a quadro; imprime onde as mãos caem na tela) |
| `check.html` | Folha de poses de cada personagem + checagem de pés/altura (`?c=Knight`) |
| `src/arena.js` | **Arena do Castelo**: coliseu de pedra (piso, mureta, pilares com tocha, arquibancada, muro com portões, estandartes e torres) numa vila medieval com castelo, morros e montanhas + colisão com borda/pilares |
| `src/tutorial.js` | Treino rápido (10 passos: andar, socos, dash, pulo duplo, defesa, esquiva perfeita em câmera lenta, habilidade, super, giro). Abre sozinho na 1ª vez; refaz em Como Jogar > FAZER O TREINO |
| `src/crowd.js` | Torcida: os personagens KayKit são fotografados no carregamento em vários quadros da comemoração/espera ("impostores"); cada torcedor é um cartaz que vira pra câmera e anima no shader (~400 torcedores = 800 triângulos) |
| `assets/env/` | Modelos do cenário — KayKit Dungeon Remastered e Medieval Hexagon (Kay Lousberg, CC0). Baixar de novo: `python tools/get_env.py` |
| `env_check.html` | Folha dos modelos do cenário com o tamanho de cada um (`?set=dungeon` / `?set=hex`) |
| `assets/sfx/` | Sons de verdade (OpenGameArt; CC0, exceto a torcida: Gregor Quendel, CC-BY 4.0): socos, defesa, swishes, locutor, torcida (base + gritos que sobem com a empolgação), vento... Fontes e autores em `assets/sfx/CREDITS.txt` |
| `tools/sfx_build.py` | Monta `assets/sfx/` dos pacotes baixados: corta o silêncio do começo (impacto sai na hora), normaliza e converte pra .ogg |
| `src/fx.js` | Partículas, estrelas de impacto, furacão, rastro do dash e o tocador de som (variações aleatórias, locutor, torcida que segue a empolgação) |
| `src/toon.js` | Material toon + contorno preto |
| `src/main.js` | Loop, rounds, câmera (shake, FOV, inclinação), HUD, modo online |
| `src/net.js` | Cliente da sala: estado do lutador, interpolação do oponente |
| `server.js` | Servidor único: arquivos do jogo + WebSocket das salas (feito à mão, sem dependências) |
