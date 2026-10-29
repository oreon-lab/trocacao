# Gera animações extras pros personagens KayKit (mesmo rig nos 4) e exporta assets/kaykit/extra_anims.glb
# Rodar: blender -b --factory-startup --python tools/fp_anims.py
# Método: IK nas mãos (alvos animados) sobre a Unarmed_Idle, "assado" quadro a quadro -> só ossos.
import bpy, math, json, os
from mathutils import Vector, Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'kaykit', 'Barbarian.glb'))
scene = bpy.context.scene
scene.render.fps = 30
arm = bpy.data.objects['Rig']
idle = bpy.data.actions['Unarmed_Idle']
vl = bpy.context.view_layer

# alvos de IK (pulso) e polos (cotovelo pra baixo e pra fora)
T, P, IK = {}, {}, {}
for s, sx in (('l', 1), ('r', -1)):
    T[s] = bpy.data.objects.new('T_' + s, None); scene.collection.objects.link(T[s])
    P[s] = bpy.data.objects.new('P_' + s, None); scene.collection.objects.link(P[s])
    P[s].location = (sx * 0.35, 0.3, 0.55)
    c = arm.pose.bones['lowerarm.' + s].constraints.new('IK')
    c.target, c.pole_target, c.chain_count = T[s], P[s], 2
    IK[s] = c

# IK nas pernas (só nos clipes com legs=True): pés plantados quando o quadril desce
LEG = {}
for s, sx in (('l', 1), ('r', -1)):
    ft = bpy.data.objects.new('F_' + s, None); scene.collection.objects.link(ft)
    kp = bpy.data.objects.new('K_' + s, None); scene.collection.objects.link(kp)
    kp.location = (sx * 0.15, -0.9, 0.45)  # joelho pra frente
    c = arm.pose.bones['lowerleg.' + s].constraints.new('IK')
    c.target, c.pole_target, c.chain_count, c.influence = ft, kp, 2, 0.0
    LEG[s] = (ft, kp, c)

def set_action(act):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if hasattr(ad, 'action_slot') and act.slots:
        ad.action_slot = act.slots[0]

# escolhe o pole_angle que deixa o cotovelo mais perto do polo
set_action(idle); scene.frame_set(0)
for s in ('l', 'r'):
    T[s].location = (0.2 if s == 'l' else -0.2, -0.35, 1.15)
    best = None
    for ang in (0, 90, -90, 180):
        IK[s].pole_angle = math.radians(ang); vl.update()
        e = arm.matrix_world @ arm.pose.bones['lowerarm.' + s].head
        d = (e - P[s].location).length
        if best is None or d < best[0]: best = (d, ang)
    IK[s].pole_angle = math.radians(best[1])
# pés: posição de descanso no quadro 0 da Unarmed_Idle; escolhe o pole_angle do joelho
vl.update()
for s in ('l', 'r'):  # alvos primeiro (a busca abaixo mexe no quadril)
    LEG[s][0].location = arm.matrix_world @ arm.pose.bones['lowerleg.' + s].tail
for s in ('l', 'r'):
    ft, kp, c = LEG[s]
    c.influence = 1.0
    best = None
    for ang in (0, 90, -90, 180):
        c.pole_angle = math.radians(ang)
        arm.pose.bones['hips'].location = arm.pose.bones['hips'].bone.matrix_local.inverted().to_3x3() @ Vector((0, 0, -0.3))  # testa agachado
        vl.update()
        k = arm.matrix_world @ arm.pose.bones['lowerleg.' + s].head
        d = (k - kp.location).length
        if best is None or d < best[0]: best = (d, ang)
    c.pole_angle = math.radians(best[1])
    c.influence = 0.0
scene.frame_set(0)

def lerp(a, b, k): return tuple(x + (y - x) * k for x, y in zip(a, b))
def ease(k): return k * k * (3 - 2 * k)

def track(keys):
    # keys: [(frame, value)] -> função frame -> valor (interpolação suave)
    def f(fr):
        if fr <= keys[0][0]: return keys[0][1]
        for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
            if fr <= f1:
                k = ease((fr - f0) / (f1 - f0))
                return lerp(v0, v1, k) if isinstance(v0, tuple) else v0 + (v1 - v0) * k
        return keys[-1][1]
    return f

# Olho do jogo em z~1.39, frente = -Y. Clipes FP_* são vistos de dentro: os ombros descem um pouco (drop)
# pra manga do braço não invadir a tela, e as mãos ficam mais longe da câmera.
D = 0.09
GL, GR = (0.28, -0.50, 1.10), (-0.28, -0.46, 1.07)          # guarda 1ª pessoa
BL, BR = (0.097, -0.50, 1.15), (-0.143, -0.48, 1.14)          # defesa 1ª pessoa: luvas na frente do rosto
TL, TR = (0.25, -0.30, 1.22), (-0.25, -0.28, 1.20)          # guarda 3ª pessoa (pro uppercut voltar)
KL, KR = (0.34, -0.54, 1.27), (-0.36, -0.55, 1.26)          # defesa 3ª pessoa: guarda alta de boxe, luvas na frente das bochechas, do lado da barba (a cabeça é grande demais pra cobrir na frente)
POLE_OUT = {'l': (0.35, 0.3, 0.55), 'r': (-0.35, 0.3, 0.55)}
POLE_IN = {'l': (0.15, -0.05, 0.6), 'r': (-0.15, -0.05, 0.6)}  # cotovelos fechados (defesa 1ª pessoa)
POLE_X = {'l': (0.6, -0.25, 0.95), 'r': (-0.6, -0.25, 0.95)}  # cotovelos abertos (guarda em X)
GSL, GSR = (0.50, -0.30, 0.98), (-0.50, -0.30, 0.98)        # giro: braços bem abertos pra frente (a cabeça de quem é girado passa entre eles)
GFL, GFR = (0.58, -0.22, 1.20), (-0.58, -0.22, 1.20)        # girado (de barriga pra baixo no jogo): braços abertos pros lados da cabeça, pra aparecer segurando
POLE_UP = {'l': (0.7, 0.25, 1.05), 'r': (-0.7, 0.25, 1.05)}  # cotovelos pra fora e pra trás (no jogo: pro céu)
bob = lambda p, a=0.012: track([(0, p), (16, (p[0], p[1], p[2] + a)), (32, p)])
zero = track([(0, 0.0), (32, 0.0)])
CLIPS = {
    'FP_Guard': dict(n=32, l=bob(GL), r=bob(GR), tw=zero, drop=D),
    'FP_JabL': dict(n=15, l=track([(0, GL), (2, (0.27, -0.46, 1.08)), (5, (0.04, -0.70, 1.47)), (7, (0.04, -0.70, 1.47)), (15, GL)]),
                    r=track([(0, GR), (5, (-0.22, -0.43, 1.10)), (15, GR)]), tw=track([(0, 0.0), (5, -12.0), (15, 0.0)]), drop=D),
    'FP_CrossR': dict(n=17, l=track([(0, GL), (6, (0.22, -0.46, 1.12)), (17, GL)]),
                      r=track([(0, GR), (2, (-0.27, -0.42, 1.05)), (6, (-0.03, -0.72, 1.47)), (8, (-0.03, -0.72, 1.47)), (17, GR)]),
                      tw=track([(0, 0.0), (6, 22.0), (17, 0.0)]), drop=D),
    'FP_Block': dict(n=32, l=bob(BL, 0.008), r=bob(BR, 0.008), tw=zero, drop=D, pole=POLE_IN),
    'Block_Guard': dict(n=32, l=bob(KL, 0.008), r=bob(KR, 0.008), tw=zero, drop=0, pole=POLE_IN, lean=8, crouch=0.07, hip=4, chin=-5, legs=True),
    # golpe batendo na guarda: luvas empurradas contra o rosto, corpo recua e volta pra guarda
    'Guard_Hit': dict(n=12, pole=POLE_IN, drop=0, tw=zero, legs=True,
                      l=track([(0, KL), (3, (0.30, -0.44, 1.34)), (12, KL)]),
                      r=track([(0, KR), (3, (-0.32, -0.45, 1.33)), (12, KR)]),
                      lean=track([(0, 8.0), (3, -6.0), (12, 8.0)]),
                      crouch=track([(0, 0.07), (3, 0.10), (12, 0.07)]),
                      hip=track([(0, 4.0), (3, -6.0), (12, 4.0)]),
                      chin=track([(0, -5.0), (3, 4.0), (12, -5.0)])),
    'Uppercut': dict(n=27, l=track([(0, TL), (8, (0.24, -0.32, 1.20)), (13, (0.22, -0.30, 1.22)), (27, TL)]),
                     r=track([(0, TR), (8, (-0.30, -0.25, 0.90)), (13, (-0.06, -0.50, 1.42)), (15, (-0.06, -0.50, 1.44)), (27, TR)]),
                     tw=track([(0, 0.0), (8, -18.0), (13, 26.0), (15, 26.0), (27, 0.0)]), drop=0),
    # habilidades (Q): Bárbaro soca o chão, Cavaleiro investe com o ombro, Mago chama o meteoro
    # (chibi: braço curto e cabeça enorme -> 'braços pra cima' = abertos pros lados, senão somem atrás da cabeça)
    'Ground_Slam': dict(n=30, legs=True, pole=POLE_X, drop=0, tw=zero,
                        l=track([(0, TL), (5, (0.60, -0.08, 1.32)), (9, (0.62, -0.05, 1.36)), (13, (0.13, -0.64, 0.32)), (18, (0.15, -0.62, 0.34)), (30, TL)]),
                        r=track([(0, TR), (5, (-0.60, -0.08, 1.32)), (9, (-0.62, -0.05, 1.36)), (13, (-0.13, -0.64, 0.32)), (18, (-0.15, -0.62, 0.34)), (30, TR)]),
                        lean=track([(0, 0.0), (5, -8.0), (9, -12.0), (13, 30.0), (18, 28.0), (30, 0.0)]),
                        crouch=track([(0, 0.0), (3, 0.06), (6, 0.0), (9, 0.0), (13, 0.10), (18, 0.09), (30, 0.0)]),
                        hip=track([(0, 0.0), (9, -4.0), (13, 18.0), (18, 16.0), (30, 0.0)]),
                        chin=track([(0, 0.0), (9, 10.0), (13, -10.0), (30, 0.0)])),
    'Shield_Charge': dict(n=10, legs=True, pole=POLE_X, drop=0,
                          l=track([(0, TL), (5, (0.06, -0.60, 0.98)), (10, (0.06, -0.60, 0.98))]),
                          r=track([(0, TR), (5, (-0.34, 0.04, 0.80)), (10, (-0.34, 0.04, 0.80))]),
                          tw=track([(0, 0.0), (5, -20.0), (10, -20.0)]),
                          lean=track([(0, 0.0), (5, 16.0), (10, 16.0)]),
                          crouch=track([(0, 0.0), (5, 0.06), (10, 0.06)]),
                          hip=track([(0, 0.0), (5, 8.0), (10, 8.0)])),
    'Meteor_Call': dict(n=30, drop=0,
                        l=track([(0, TL), (8, (0.30, -0.40, 0.95)), (16, (0.30, -0.36, 0.92)), (30, TL)]),
                        r=track([(0, TR), (8, (-0.60, -0.14, 1.38)), (11, (-0.62, -0.12, 1.40)), (16, (-0.14, -0.70, 0.98)), (20, (-0.14, -0.68, 0.98)), (30, TR)]),
                        tw=track([(0, 0.0), (8, -12.0), (16, 20.0), (30, 0.0)]),
                        lean=track([(0, 0.0), (8, -8.0), (16, 12.0), (30, 0.0)]),
                        chin=track([(0, 0.0), (8, 14.0), (16, -4.0), (30, 0.0)])),
    # GIRO DO FURACÃO: quem gira segura as duas mãos do oponente com os braços esticados, corpo inclinado pra trás
    # (contrapeso), joelhos dobrados; puxões curtos no ritmo do giro
    'Grab_Spin': dict(n=16, legs=True, drop=0, tw=track([(0, 8.0), (16, 8.0)]),  # tw: traz o ombro direito pra frente (guarda base deixa ele pra trás)
                      l=track([(0, GSL), (8, (GSL[0], GSL[1] - 0.04, GSL[2] + 0.02)), (16, GSL)]),
                      r=track([(0, GSR), (8, (GSR[0], GSR[1] - 0.04, GSR[2] + 0.02)), (16, GSR)]),
                      lean=track([(0, -34.0), (8, -38.0), (16, -34.0)]),
                      crouch=track([(0, 0.10), (8, 0.12), (16, 0.10)]),
                      hip=-16.0, chin=-18.0),
    # quem é girado: braços segurando as mãos de quem gira (no jogo o corpo fica deitado de barriga pra baixo,
    # cabeça pro centro); pernas balançando de leve
    'Grabbed_Fly': dict(n=16, drop=0, tw=track([(0, -6.0), (8, 6.0), (16, -6.0)]), pole=POLE_UP,
                        l=track([(0, GFL), (8, (GFL[0] + 0.03, GFL[1], GFL[2] - 0.02)), (16, GFL)]),
                        r=track([(0, GFR), (8, (GFR[0] + 0.03, GFR[1], GFR[2] - 0.02)), (16, GFR)]),
                        lean=-6.0, hip=track([(0, 6.0), (8, -4.0), (16, 6.0)]), chin=18.0),
}
val = lambda v, f: v(f) if callable(v) else v

chest = arm.pose.bones['chest']
chest.rotation_mode = 'QUATERNION'
cinv = chest.bone.matrix_local.inverted().to_3x3()
zl = (cinv @ Vector((0, 0, 1))).normalized()  # Z do mundo no espaço do osso
xl = (cinv @ Vector((1, 0, 0))).normalized()  # X do mundo (inclinar o tronco pra frente)
hips, head = arm.pose.bones['hips'], arm.pose.bones['head']
hips.rotation_mode = head.rotation_mode = 'QUATERNION'
hinv = hips.bone.matrix_local.inverted().to_3x3()
hxl = (head.bone.matrix_local.inverted().to_3x3() @ Vector((1, 0, 0))).normalized()
hipx = (hinv @ Vector((1, 0, 0))).normalized()
bones = list(arm.pose.bones)
baked = {}
NDC = {}
DBG = {}
EYE = Vector((0, 0, arm.data.bones['head'].head_local.z + 0.15))
for name, c in CLIPS.items():
    set_action(idle)
    pole = c.get('pole', POLE_OUT)
    for s in ('l', 'r'): P[s].location = pole[s]
    for s in LEG: LEG[s][2].influence = 1.0 if c.get('legs') else 0.0
    frames = []
    for f in range(c['n'] + 1):
        scene.frame_set(f % 32)
        T['l'].location, T['r'].location = c['l'](f), c['r'](f)
        chest.rotation_quaternion = Quaternion(zl, math.radians(c['tw'](f))) @ chest.rotation_quaternion
        chest.location = chest.location + cinv @ Vector((0, 0, -c['drop']))
        # postura: inclina o tronco pra frente, abaixa o quadril (joelhos dobram) e baixa o queixo
        if c.get('lean'): chest.rotation_quaternion = Quaternion(xl, math.radians(val(c['lean'], f))) @ chest.rotation_quaternion
        if c.get('crouch'): hips.location = hips.location + hinv @ Vector((0, 0, -val(c['crouch'], f)))
        if c.get('hip'): hips.rotation_quaternion = Quaternion(hipx, math.radians(val(c['hip'], f))) @ hips.rotation_quaternion
        if c.get('chin'): head.rotation_quaternion = Quaternion(hxl, math.radians(val(c['chin'], f))) @ head.rotation_quaternion
        vl.update()
        pose = {}
        for pb in bones:  # pose visual (com IK) -> espaço local do osso
            m = arm.convert_space(pose_bone=pb, matrix=pb.matrix, from_space='POSE', to_space='LOCAL')
            pose[pb.name] = m.decompose()
        frames.append(pose)
        # checagem dos braços: cotovelo do lado certo do corpo e do lado do polo (senão o braço inverteu)
        if f in (0, c['n'] // 4, c['n'] // 2, 3 * c['n'] // 4):
            chk = {}
            for sd, sx in (('l', 1), ('r', -1)):
                sh = arm.matrix_world @ arm.pose.bones['upperarm.' + sd].head
                el = arm.matrix_world @ arm.pose.bones['lowerarm.' + sd].head
                wr = arm.matrix_world @ arm.pose.bones['lowerarm.' + sd].tail
                axis = (wr - sh).normalized()
                foot = sh + axis * (el - sh).dot(axis)
                pl = Vector(P[sd].location)
                pfoot = sh + axis * (pl - sh).dot(axis)
                pole_ok = (el - foot).dot(pl - pfoot) > 0
                side_ok = el.x * sx > 0.08
                miss = round((wr - Vector(T[sd].location)).length, 3)
                chk[sd] = ('ok' if pole_ok and side_ok else 'PROBLEMA') + f' polo={pole_ok} lado={side_ok} erro_alvo={miss} cotovelo={[round(v, 2) for v in el]}'
            DBG.setdefault('braços', {}).setdefault(name, {})[f] = chk
        if os.environ.get('DEBUG_CLIP') == name and f == int(os.environ.get('DEBUG_FRAME', '8')):
            for sd in ('l', 'r'):
                DBG['leg_' + sd] = {'tornozelo': [round(v, 3) for v in arm.matrix_world @ arm.pose.bones['lowerleg.' + sd].tail], 'alvo': [round(v, 3) for v in LEG[sd][0].location], 'inf': LEG[sd][2].influence, 'is_valid': LEG[sd][2].is_valid}
            for sd in ('l', 'r'):
                w = arm.matrix_world @ arm.pose.bones['lowerarm.' + sd].tail
                h = arm.matrix_world @ arm.pose.bones['hand.' + sd].tail
                e = arm.matrix_world @ arm.pose.bones['lowerarm.' + sd].head
                DBG['bake_' + sd] = {'pulso': [round(v, 3) for v in w], 'alvo': [round(v, 3) for v in T[sd].location], 'punho': [round(v, 3) for v in h], 'cotovelo': [round(v, 3) for v in e]}
        if name.startswith('FP') and f in (0, 5, 6):  # onde o punho cai na tela (câmera nos olhos, FOV 80, 16:9)
            for s in ('l', 'r'):
                h = arm.matrix_world @ arm.pose.bones['hand.' + s].tail
                e = arm.matrix_world @ arm.pose.bones['lowerarm.' + s].head
                fwd = max(-(h.y - EYE.y), 1e-3); efwd = max(-(e.y - EYE.y), 1e-3)
                NDC.setdefault(name, []).append((f, s, round(-h.x / fwd / 1.493, 2), round((h.z - EYE.z) / fwd / 0.839, 2), round(fwd, 2), 'cot', round((e.z - EYE.z) / efwd / 0.839, 2)))
    baked[name] = frames

# grava: tira IK, cria uma action por clipe
for s in ('l', 'r'):
    arm.pose.bones['lowerarm.' + s].constraints.remove(IK[s])
    arm.pose.bones['lowerleg.' + s].constraints.remove(LEG[s][2])
# momento do impacto dos clipes do pacote que o jogo usa: quadro em que a mão vai mais pra frente
for n in ('Dualwield_Melee_Attack_Stab',):
    set_action(bpy.data.actions[n])
    best = None
    for f in range(int(bpy.data.actions[n].frame_range[1]) + 1):
        scene.frame_set(f); vl.update()
        y = min((arm.matrix_world @ arm.pose.bones['hand.' + s].tail).y for s in ('l', 'r'))
        if best is None or y < best[0]: best = (y, f)
    DBG['impact_' + n] = [best[1], round(best[1] / 30, 3)]
keep = set()
for name, frames in baked.items():
    act = bpy.data.actions.new(name); keep.add(name)
    set_action(act)
    for f, pose in enumerate(frames):
        for pb in bones:
            loc, rot, sca = pose[pb.name]
            pb.rotation_mode = 'QUATERNION'
            pb.location, pb.rotation_quaternion, pb.scale = loc, rot, sca
            for path in ('location', 'rotation_quaternion', 'scale'):
                pb.keyframe_insert(path, frame=f)
    act.use_fake_user = True
# cópia da Unarmed_Idle reexportada: serve pra conferir no three.js que o rig bate com o original
test = idle.copy(); test.name = 'RoundTrip_Idle'; keep.add(test.name); test.use_fake_user = True
# SAVE_BLEND=caminho.blend -> salva o boneco com as animações assadas (pra abrir/conferir no Blender)
if os.environ.get('SAVE_BLEND'):
    set_action(bpy.data.actions['Block_Guard'])
    bpy.ops.wm.save_as_mainfile(filepath=os.environ['SAVE_BLEND'], copy=True)

# RENDER=Clip,Clip2 -> renderiza essas poses de frente e de lado (pra conferir) em RENDER_DIR
if os.environ.get('RENDER'):
    out_dir = os.environ.get('RENDER_DIR', ROOT)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'TEXTURE'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.show_object_outline = True
    scene.render.resolution_x, scene.render.resolution_y = 520, 620
    scene.world = scene.world or bpy.data.worlds.new('w')
    scene.world.color = (0.85, 0.92, 1.0)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 50
    for o in bpy.data.objects:  # armas/escudos ficam escondidos no jogo; no render também
        if o.parent_type == 'BONE' and o.parent_bone.startswith('handslot'): o.hide_render = True
    for spec in os.environ['RENDER'].split(','):
        clip, _, fr = spec.partition(':')
        set_action(bpy.data.actions[clip]); scene.frame_set(int(fr or os.environ.get('RENDER_FRAME', '8')))
        clip = spec.replace(':', '_f')
        # corpo inteiro de 7 lados + close nos braços de 5 lados (pegar cotovelo invertido / ombro torcido)
        VIEWS = (('frente', (1.4, -4.6, 1.3), 0.95), ('frente2', (-1.6, -4.4, 1.3), 0.95), ('reta', (0.0, -4.8, 1.3), 0.95),
                 ('lado', (4.8, -0.3, 1.2), 0.95), ('lado2', (-4.8, -0.3, 1.2), 0.95), ('costas', (0.6, 4.8, 1.4), 0.95), ('cima', (0.3, -1.6, 4.6), 0.95),
                 ('close_frente', (0.8, -2.0, 1.4), 1.12), ('close_frente2', (-0.8, -2.0, 1.4), 1.12), ('close_lado', (2.1, -0.5, 1.25), 1.12),
                 ('close_lado2', (-2.1, -0.5, 1.25), 1.12), ('close_cima', (0.1, -0.9, 2.5), 1.12))
        for view, loc, tz in VIEWS:
            cam.location = loc
            d = Vector((0, -0.25 if view.startswith('close') else 0, tz)) - Vector(loc)
            cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(out_dir, f'{clip}_{view}.png')
            bpy.ops.render.render(write_still=True)
        DBG['render_' + clip] = [round(v, 3) for v in (arm.matrix_world @ arm.pose.bones['lowerarm.l'].tail)]

for a in list(bpy.data.actions):
    if a.name not in keep: bpy.data.actions.remove(a)
for o in list(bpy.data.objects):
    if o != arm: bpy.data.objects.remove(o)
set_action(bpy.data.actions['FP_Guard'])
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); vl.objects.active = arm
out = os.path.join(ROOT, 'assets', 'kaykit', 'extra_anims.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_force_sampling=True, export_skins=False)
print('JSON>' + json.dumps({'out': out, 'size': os.path.getsize(out), 'clips': sorted(keep), 'ndc': NDC, 'dbg': DBG}))
