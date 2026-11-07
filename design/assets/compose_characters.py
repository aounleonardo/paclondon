# Builds character sprite sheets from MetroCity (CC0, JIK-A-4) layers.
# Each sheet: 768x32, 24 frames of 32x32. Frames 0-5 down, 6-11 right, 12-17 up, 18-23 left.
from PIL import Image
import json, os
M = 'assets/metrocity/'
def row(path, r):
    im = Image.open(M + path).convert('RGBA'); return im.crop((0, r*32, 768, r*32+32))
CHARS = {
  'player_1':   [('CharacterModel/Character Model.png', 0), ('Suit1.png', 2), ('Hair/Hairs.png', 3)],
  'player_2':   [('CharacterModel/Character Model.png', 3), ('Suit1.png', 3), ('Hair/Hairs.png', 6)],
  'player_3':   [('CharacterModel/Character Model.png', 5), ('Outfits/Outfit6.png', 0), ('Hair2.0.png', 0)],
  'politician': [('CharacterModel/Character Model.png', 0), ('Suit.png', 2), ('Hair/Hairs.png', 0)],
  'landlord':   [('CharacterModel/Character Model.png', 4), ('Suit1.png', 0), ('Hair/Hairs.png', 7)],
  'nimby':      [('CharacterModel/Character Model.png', 2), ('Outfits/Outfit5.png', 0), ('Hair/Hairs.png', 1)],
}
os.makedirs('assets/characters', exist_ok=True)
prev = Image.new('RGBA', (32*4*len(CHARS), 32), (0,0,0,0))
for i,(name, layers) in enumerate(CHARS.items()):
    sheet = Image.new('RGBA', (768, 32), (0,0,0,0))
    for path, r in layers: sheet.alpha_composite(row(path, r))
    sheet.save(f'assets/characters/{name}.png')
    for d in range(4): prev.alpha_composite(sheet.crop((d*192, 0, d*192+32, 32)), (i*128 + d*32, 0))
prev.resize((prev.width*4, 128), Image.NEAREST).save('assets/characters/_preview.png')
json.dump({'frame': [32,32], 'framesPerDirection': 6, 'directions': ['down','right','up','left'],
           'source': 'MetroCity Free Top Down Character Pack by JIK-A-4, CC0, https://jik-a-4.itch.io/metrocity-free-topdown-character-pack',
           'characters': list(CHARS)}, open('assets/characters/sprites.json','w'), indent=2)
print('ok')
