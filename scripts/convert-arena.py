"""Convert the user's Cinema 4D OBJ export into a self-contained web arena.
Usage: python convert-arena.py '/path/to/O3745-拳击场地 (1)'
Dependencies: trimesh==4.12.2 fast-simplification==0.2.0 pillow numpy scipy
"""
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image
import trimesh
from trimesh.visual.material import PBRMaterial

source = Path(sys.argv[1]).expanduser().resolve()
out = Path(__file__).resolve().parents[1] / 'public/models/downloaded-arena'
out.mkdir(parents=True, exist_ok=True)
# C4D exported Windows absolute ambient-map paths and black diffuse colors.
# Resolve their original images explicitly and use them as glTF base color maps.
mtl = (source / '场地.mtl').read_text()
textures = {}
colors = {}
name = ''
for line in mtl.splitlines():
    if line.startswith('newmtl '):
        name = line[7:]
    elif line.startswith('Kd '):
        colors[name] = list(map(float, line.split()[1:]))
    elif line.startswith('map_Ka '):
        textures[name] = source / 'maps' / line.rsplit('\\', 1)[-1]
# Banner_06 lost its image link in the OBJ MTL; the supplied sponsor panel matches it.
textures['Banner_06'] = source / 'maps' / 'UFC_Banner_08.jpg'
print('Loading OBJ...', flush=True)
scene = trimesh.load_scene(source / '场地.obj', group_material=True, split_groups=True, process=False)
print('Loaded', len(scene.geometry), 'meshes', flush=True)
original_faces = sum(len(m.faces) for m in scene.geometry.values())
for key, mesh in list(scene.geometry.items()):
    mat_name = getattr(mesh.visual.material, 'name', '')
    # The OBJ loader may generate a fallback material name; mesh names retain it.
    mat_name = next((m for m in colors if key.endswith('_' + m)), mat_name)
    # Original coordinates: cage deck is y=5000; fence spans ~65300 units.
    mesh.vertices = (mesh.vertices - [0, 5000, 0]) * 0.00012
    if key.startswith('Wire_Netting'):
        # Keep the actual downloaded diamond mesh, reducing redundant tube faces.
        mesh.merge_vertices()
        reduced = mesh.simplify_quadric_decimation(percent=0.85)
        mesh.vertices, mesh.faces = reduced.vertices, reduced.faces
        mesh.visual = trimesh.visual.TextureVisuals()
    image = Image.open(textures[mat_name]).convert('RGB') if mat_name in textures else None
    color = np.array(colors.get(mat_name, [0.18, 0.18, 0.18]))
    if image is not None:
        image.thumbnail((2048, 2048))
        color = np.ones(3)
    # Reflection-only source materials otherwise appear white in real-time PBR.
    if mat_name in ('Brushed metal', 'SS5_Metal_016', 'Metal_Dirt'):
        color = np.array([0.36, 0.39, 0.42])
    if mat_name == 'Black_Metal_Mate':
        color = np.array([0.12, 0.14, 0.16])
    metal = 0.65 if any(s in mat_name.lower() for s in ('metal', '2544')) else 0.05
    mat = PBRMaterial(name=mat_name, baseColorFactor=[*np.rint(color * 255).astype(int), 255],
                      baseColorTexture=image, metallicFactor=metal, roughnessFactor=0.65,
                      doubleSided=True,
                      emissiveFactor=[0.8, 0.84, 0.9] if mat_name in ('Light', 'Plane_2') else [0, 0, 0])
    mesh.visual.material = mat
    print(key, len(mesh.faces), flush=True)
blob = scene.export(file_type='glb')
(out / 'arena.glb').write_bytes(blob)
report = dict(source='O3745-拳击场地 (1)/场地.obj', scale=0.00012, sourceDeckY=5000,
              meshes=len(scene.geometry), originalTriangles=original_faces,
              triangles=sum(len(m.faces) for m in scene.geometry.values()), bytes=len(blob),
              textures=[p.name for p in textures.values()], bounds=scene.bounds.tolist())
(out / 'conversion.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
