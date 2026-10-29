# Monta assets/sfx/*.ogg a partir dos pacotes de som CC0 baixados (lista de fontes em assets/sfx/CREDITS.txt).
# Rodar: python tools/sfx_build.py <pasta com os pacotes extraídos>
# Cada som: corta o silêncio do começo (golpe sai na hora), corta a cauda, normaliza e vira .ogg mono.
# Loops (torcida, vento) ficam em estéreo, normalizados pelo volume médio e com emenda suave.
import os, sys, subprocess, glob
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'assets', 'sfx')
SR = 44100

C0 = '100-CC0-SFX_0/{}.ogg'
FIGHT = 'kenney_voiceoverFighter/Audio/{}.ogg'
ARENA = 'ArenaCombatAnnouncerPack-blacklodgegames.com_/ArenaCombatAnnouncerPack-blacklodgegames.com/{} - ArenaCombatAnnouncerPack.wav'
# nome de saída: (arquivo fonte, opções). Opções: seg=(início, fim) em s, loop, stereo, gain (dB depois de normalizar),
# peak (começa 12 ms antes do pico: o impacto sai junto com o golpe), take=k (k-ésimo trecho entre silêncios de um arquivo com vários)
KI = 'kenney_impact/{}.ogg'
FEM = '../zips/female_hurt_grunts_groans_1.ogg'
MALE = '../zips/death_pain_grunts.wav'
YELL = 'yelling_sounds/yelling sounds/{}.wav'
AXE = 'medieval_sfx_textures_2_of_2/Axe Swing.wav'
DAGGER = 'medieval_sfx_textures_2_of_2/Dagger Swing.wav'
SWOSH = 'swoshes/swosh-{:02d}.flac'
QP = 'qubodupPunch/qubodupPunch/qubodupPunch{:02d}.ogg'
SOUNDS = {
    # socos: "tum" limpo da Kenney + estalo curto por cima (definição) + baque grave de corpo no pesado
    **{f'punch_l{i + 1}': (KI.format(f'impactPunch_medium_{i:03d}'), {}) for i in range(5)},
    **{f'punch_h{i + 1}': (KI.format(f'impactPunch_heavy_{i:03d}'), {}) for i in range(5)},
    **{f'crack{i}': (QP.format(n), {}) for i, n in enumerate([1, 3, 4, 5], 1)},
    **{f'body_h{i + 1}': (KI.format(f'impactSoft_heavy_{i:03d}'), {}) for i in range(3)},
    **{f'body_m{i + 1}': (KI.format(f'impactSoft_medium_{i:03d}'), {}) for i in range(3)},
    # defesa = batida seca (antebraço na guarda); parry = tilintar de metal; quebrar a guarda = placa batendo
    'block1': (KI.format('impactPlank_medium_000'), {}), 'block2': (KI.format('impactPlank_medium_002'), {}),
    'block3': (KI.format('impactWood_medium_000'), {}), 'block4': (KI.format('impactWood_medium_001'), {}),
    **{f'clang{i + 1}': (KI.format(f'impactMetal_light_{i:03d}'), {}) for i in range(3)},
    'plate1': (KI.format('impactPlate_heavy_000'), {}), 'plate2': (KI.format('impactPlate_heavy_001'), {}),
    'break1': ('sfx_breaking_and_falling/bfh1_wood_breaking_03.ogg', {}), 'break2': ('sfx_breaking_and_falling/bfh1_rock_breaking_01.ogg', {}),
    # golpes no ar: adaga (rápido) e machado (pesado) cortando o ar + swishes de bambu; dash = swoosh longo
    **{f'swing_l{i}': (DAGGER, {'take': t}) for i, t in enumerate([2, 3, 4, 5], 1)},
    'swing_l5': (SWOSH.format(9), {}), 'swing_l6': (SWOSH.format(22), {}),
    **{f'swing_h{i}': (AXE, {'take': t}) for i, t in enumerate([1, 2, 5, 6], 1)},
    'swing_h5': (SWOSH.format(43), {}), 'swing_h6': (SWOSH.format(3), {}),
    'whoosh1': (SWOSH.format(33), {}), 'whoosh2': (SWOSH.format(29), {}),
    # corpo: passo no concreto (combina com o piso de pedra), pano no pulo, couro caindo no pouso forte
    'cloth1': ('RPGsounds_Kenney/OGG/cloth1.ogg', {}), 'cloth2': ('RPGsounds_Kenney/OGG/cloth2.ogg', {}),
    **{f'step{i + 1}': (KI.format(f'footstep_concrete_{i:03d}'), {}) for i in range(3)},
    'thud': ('RPGsounds_Kenney/OGG/dropLeather.ogg', {}),
    'gravel': ('sfx_breaking_and_falling/bfh1_rock_falling_01.ogg', {}),
    # vozes dos lutadores: gemido ao apanhar, grito no golpe forte, dor no K.O. (f = Ladina)
    **{f'grunt_m{i}': (YELL.format(n), {}) for i, n in enumerate(['3grunt1', '3grunt4', '3grunt5'], 1)},
    **{f'grunt_m{i}': (MALE, {'take': t}) for i, t in enumerate([2, 10, 3], 4)},
    **{f'grunt_f{i}': (FEM, {'take': t}) for i, t in enumerate([2, 1, 0, 4], 1)},
    **{f'shout_m{i}': (YELL.format(n), {}) for i, n in enumerate(['1yell4', '3yell3', '3yell4', '2yell1'], 1)},
    **{f'pain_m{i}': (MALE, {'take': t}) for i, t in enumerate([0, 13, 18], 1)},
    **{f'pain_f{i}': (FEM, {'take': t}) for i, t in enumerate([3, 6], 1)},
    # poderes e efeitos
    'sub': ('sci-fi_sounds/Audio/lowFrequency_explosion_001.ogg', {}), 'sub_long': ('sci-fi_sounds/Audio/lowFrequency_explosion_000.ogg', {}),
    'cannon': ('25-CC0-bang-sfx/cannon_02.ogg', {}), 'debris': ('sfx_breaking_and_falling/bfh1_rock_breaking_03.ogg', {}),
    'magic1': ('sci-fi_sounds/Audio/forceField_000.ogg', {}), 'magic2': ('sci-fi_sounds/Audio/forceField_001.ogg', {}),
    'magic3': ('sci-fi_sounds/Audio/forceField_002.ogg', {}),
    'shimmer': (C0.format('bell_03'), {}), 'ding': (C0.format('bell_02'), {}),
    'slash': ('RPGsounds_Kenney/OGG/knifeSlice2.ogg', {}), 'slash2': ('RPGsounds_Kenney/OGG/knifeSlice.ogg', {}),
    'explosion': ('sci-fi_sounds/Audio/explosionCrunch_001.ogg', {}), 'explosion_far': ('../zips/NenadSimic_-_Muffled_Distant_Explosion.wav', {}),
    'rumble': ('sci-fi_sounds/Audio/thrusterFire_000.ogg', {'gain': -3}),
    'bell': (C0.format('bell_01'), {}), 'gong': (C0.format('gong_01'), {}),
    # ambiente (estéreo, em loop)
    'crowd': ('../zips/crowd_shouting_0.ogg', {'loop': True, 'stereo': True}),
    'wind': ('../zips/wind_woosh_loop.ogg', {'loop': True, 'stereo': True}),
    'applause': ('../zips/applause-clapping-church-crowd-immersive.wav', {'seg': (23.5, 30.0), 'stereo': True}),
    # locutor
    **{f'v_{n}': (FIGHT.format(n), {}) for n in ['round_1', 'round_2', 'round_3', 'round_4', 'round_5', 'final_round', 'fight',
                                                  'you_win', 'you_lose', 'winner', 'flawless_victory', 'time', 'combo', 'prepare_yourself']},
    'v_tie': (FIGHT.format("it's_a_tie"), {}),
    **{f'v_{n.lower()}': (ARENA.format(n), {}) for n in ['Excellent', 'Impressive', 'Perfect', 'Denied']},
}


def decode(path, ch):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()


def takes(env, gap=0.12, drop=0.08, rel_db=-30):
    # trechos com som separados por silêncio (quadros de 10 ms; junta buracos < gap; ignora < drop)
    f = int(0.01 * SR)
    n = len(env) // f
    db = 20 * np.log10(np.sqrt((env[:n * f].reshape(n, f) ** 2).mean(axis=1)) + 1e-9)
    on = db > db.max() + rel_db
    regs, s = [], None
    for i, v in enumerate(on):
        if v and s is None: s = i
        if not v and s is not None: regs.append([s, i]); s = None
    if s is not None: regs.append([s, n])
    out = []
    for r in regs:
        if out and (r[0] - out[-1][1]) * 0.01 < gap: out[-1][1] = r[1]
        else: out.append(r)
    return [(a * f, b * f) for a, b in out if (b - a) * 0.01 >= drop]


def process(name, rel, o):
    ch = 2 if o.get('stereo') else 1
    x = decode(os.path.join(SRC, rel), ch)
    if 'seg' in o:
        a, b = o['seg']
        x = x[int(a * SR):int(b * SR)]
    if 'take' in o:
        a, b = takes(np.abs(x).max(axis=1))[o['take']]
        x = x[max(0, a - int(0.015 * SR)):b + int(0.04 * SR)]
    env = np.abs(x).max(axis=1)
    if not o.get('loop'):
        on = np.where(env > env.max() * 10 ** (-40 / 20))[0]  # começo/fim úteis (-40 dB do pico)
        s = max(0, on[0] - int(0.003 * SR))
        if o.get('peak'):
            s = max(s, int(np.argmax(env)) - int(0.012 * SR))
        tail = np.where(env > env.max() * 10 ** (-55 / 20))[0][-1]
        x = x[s:tail + 1]
        n_in, n_out = int(0.002 * SR), min(int(0.03 * SR), len(x) // 3)
        x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
        x[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
        x *= 10 ** (-1 / 20) / (np.abs(x).max() + 1e-9)  # pico em -1 dB
    else:
        xf = int(0.5 * SR)  # emenda do loop: o fim se mistura com o começo
        head, body = x[:xf], x[xf:]
        body[-xf:] = body[-xf:] * np.linspace(1, 0, xf)[:, None] + head * np.linspace(0, 1, xf)[:, None]
        x = body
        x *= 10 ** (-18 / 20) / (np.sqrt((x ** 2).mean()) + 1e-9)  # volume médio em -18 dB
        x *= min(1, 10 ** (-1 / 20) / (np.abs(x).max() + 1e-9))
    x *= 10 ** (o.get('gain', 0) / 20)
    out = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-v', 'quiet', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
                    '-c:a', 'libvorbis', '-q:a', '4', out], input=x.astype(np.float32).tobytes(), check=True)
    return len(x) / SR


os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.ogg')):
    os.remove(f)
total = 0
for name, (rel, o) in SOUNDS.items():
    d = process(name, rel, o)
    total += d
# lista pro jogo (src/fx.js carrega todos estes)
names = sorted(SOUNDS)
open(os.path.join(ROOT, 'src', 'sfxlist.js'), 'w', encoding='utf-8').write(
    '// Gerado por tools/sfx_build.py: sons em assets/sfx (grupo = nome sem o número do fim)\n'
    'export const SFX_FILES = ' + repr(names) + ';\n')
print(len(SOUNDS), 'sons,', round(total, 1), 's no total')
