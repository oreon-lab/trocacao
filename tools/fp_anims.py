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
KL, KR = (0.085, -0.42, 1.24), (-0.085, -0.41, 1.23)        # defesa 3ª pessoa: antebraços em pé cobrindo o rosto
POLE_OUT = {'l': (0.35, 0.3, 0.55), 'r': (-0.35, 0.3, 0.55)}
POLE_IN = {'l': (0.15, -0.05, 0.6), 'r': (-0.15, -0.05, 0.6)}  # cotovelos fechados (defesa)
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
    'Block_Guard': dict(n=32, l=bob(KL, 0.008), r=bob(KR, 0.008), tw=zero, drop=0, pole=POLE_IN),
    'Uppercut': dict(n=27, l=track([(0, TL), (8, (0.24, -0.32, 1.20)), (13, (0.22, -0.30, 1.22)), (27, TL)]),
                     r=track([(0, TR), (8, (-0.30, -0.25, 0.90)), (13, (-0.06, -0.50, 1.42)), (15, (-0.06, -0.50, 1.44)), (27, TR)]),
                     tw=track([(0, 0.0), (8, -18.0), (13, 26.0), (15, 26.0), (27, 0.0)]), drop=0),
}

chest = arm.pose.bones['chest']
chest.rotation_mode = 'QUATERNION'
cinv = chest.bone.matrix_local.inverted().to_3x3()
zl = (cinv @ Vector((0, 0, 1))).normalized()  # Z do mundo no espaço do osso
bones = list(arm.pose.bones)
baked = {}
NDC = {}
EYE = Vector((0, 0, arm.data.bones['head'].head_local.z + 0.15))
for name, c in CLIPS.items():
    set_action(idle)
    pole = c.get('pole', POLE_OUT)
    for s in ('l', 'r'): P[s].location = pole[s]
    frames = []
    for f in range(c['n'] + 1):
        scene.frame_set(f % 32)
        T['l'].location, T['r'].location = c['l'](f), c['r'](f)
        chest.rotation_quaternion = Quaternion(zl, math.radians(c['tw'](f))) @ chest.rotation_quaternion
        chest.location = chest.location + cinv @ Vector((0, 0, -c['drop']))
        vl.update()
        pose = {}
        for pb in bones:  # pose visual (com IK) -> espaço local do osso
            m = arm.convert_space(pose_bone=pb, matrix=pb.matrix, from_space='POSE', to_space='LOCAL')
            pose[pb.name] = m.decompose()
        frames.append(pose)
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

for a in list(bpy.data.actions):
    if a.name not in keep: bpy.data.actions.remove(a)
for o in list(bpy.data.objects):
    if o != arm: bpy.data.objects.remove(o)
set_action(bpy.data.actions['FP_Guard'])
bpy.ops.object.select_all(action='DESELECT'); arm.select_set(True); vl.objects.active = arm
out = os.path.join(ROOT, 'assets', 'kaykit', 'extra_anims.glb')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='ACTIONS', export_force_sampling=True, export_skins=False)
print('JSON>' + json.dumps({'out': out, 'size': os.path.getsize(out), 'clips': sorted(keep), 'ndc': NDC}))
