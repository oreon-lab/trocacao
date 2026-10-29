# Baixa os modelos de cenário usados na arena (KayKit, Kay Lousberg, CC0) do GitHub oficial.
# Rodar: python tools/get_env.py   -> assets/env/dungeon/*.glb e assets/env/hex/*.gltf (+ .bin + textura)
import os, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = 'https://raw.githubusercontent.com/KayKit-Game-Assets/{repo}/main/{path}'
DUNGEON = ('KayKit-Dungeon-Remastered-1.0', 'addons/kaykit_dungeon_remastered/Assets/gltf/{}.gltf.glb')
HEX = ('KayKit-Medieval-Hexagon-Pack-1.0', 'addons/kaykit_medieval_hexagon_pack/Assets/gltf/{}')

dungeon = [
    'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A',
    'floor_dirt_large', 'floor_dirt_large_rocky', 'barrier', 'barrier_column', 'barrier_half', 'pillar', 'pillar_decorated',
    'column', 'torch_mounted', 'torch_lit', 'wall', 'wall_arched', 'wall_archedwindow_open', 'wall_pillar', 'wall_doorway',
    'wall_half', 'stairs_wide', 'barrel_large', 'barrel_small_stack', 'crates_stacked', 'box_stacked', 'keg', 'sword_shield',
    'rubble_large', 'rubble_half', 'banner_patternA_red', 'banner_patternA_blue', 'banner_patternB_yellow', 'banner_patternC_green',
    'banner_shield_red', 'banner_shield_blue', 'banner_thin_red', 'banner_thin_blue', 'banner_triple_yellow', 'banner_triple_white',
]
hexa = [
    'buildings/red/building_castle_red', 'buildings/blue/building_tower_A_blue', 'buildings/red/building_tower_A_red',
    'buildings/yellow/building_church_yellow', 'buildings/yellow/building_windmill_yellow', 'buildings/green/building_home_A_green',
    'buildings/red/building_home_B_red', 'buildings/blue/building_tavern_blue', 'buildings/green/building_market_green',
    'buildings/blue/building_well_blue', 'buildings/neutral/wall_straight', 'buildings/neutral/building_stage_A',
    'decoration/nature/mountain_A_grass_trees', 'decoration/nature/mountain_B_grass_trees', 'decoration/nature/mountain_C_grass_trees',
    'decoration/nature/mountain_A', 'decoration/nature/hills_A_trees', 'decoration/nature/hills_B_trees', 'decoration/nature/hills_C_trees',
    'decoration/nature/trees_A_large', 'decoration/nature/trees_B_large', 'decoration/nature/trees_A_medium', 'decoration/nature/trees_B_medium',
    'decoration/nature/tree_single_A', 'decoration/nature/tree_single_B', 'decoration/nature/rock_single_A', 'decoration/nature/rock_single_C',
    'decoration/nature/rock_single_E', 'decoration/nature/cloud_big', 'decoration/nature/cloud_small',
    'decoration/props/flag_red', 'decoration/props/flag_blue', 'decoration/props/flag_yellow', 'decoration/props/flag_green',
    'decoration/props/weaponrack', 'decoration/props/target', 'decoration/props/tent', 'decoration/props/crate_A_big', 'decoration/props/sack',
]


def get(repo, paths, out):
    if os.path.exists(out):
        return True
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for path in ([paths] if isinstance(paths, str) else paths):
        try:
            with urllib.request.urlopen(RAW.format(repo=repo, path=path), timeout=60) as r:
                data = r.read()
        except urllib.error.HTTPError:
            continue
        open(out, 'wb').write(data)
        return True
    print('faltou:', out)
    return False


for n in dungeon:  # alguns arquivos do pacote são .gltf.glb, outros só .glb
    get(DUNGEON[0], [DUNGEON[1].format(n), DUNGEON[1].format(n).replace('.gltf.glb', '.glb')], os.path.join(ROOT, 'assets', 'env', 'dungeon', n + '.glb'))
for p in hexa:
    n = p.split('/')[-1]
    for ext in ('.gltf', '.bin'):
        get(HEX[0], HEX[1].format(p + ext), os.path.join(ROOT, 'assets', 'env', 'hex', n + ext))
# mesma textura (atlas de cores) pra todos os modelos do pacote hexagonal
get(HEX[0], HEX[1].format('decoration/nature/hexagons_medieval.png'), os.path.join(ROOT, 'assets', 'env', 'hex', 'hexagons_medieval.png'))
get(DUNGEON[0], 'addons/kaykit_dungeon_remastered/Assets/LICENSE.txt', os.path.join(ROOT, 'assets', 'env', 'LICENSE_dungeon.txt'))
get(HEX[0], 'LICENSE.txt', os.path.join(ROOT, 'assets', 'env', 'LICENSE_hexagon.txt'))
print('ok', sum(len(fs) for _, _, fs in os.walk(os.path.join(ROOT, 'assets', 'env'))), 'arquivos')
