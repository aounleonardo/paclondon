# Cuts the small houses out of MetroCity Environment (CC0, JIK-A-4) and makes
# empty (purple) and filled (green) versions. Two tint styles:
#   tint  = whole house recoloured, shading kept
#   glow  = original colours with a coloured outline
from PIL import Image, ImageFilter, ImageChops
import json
SRC='assets/metrocity-env-buildings.png'
im=Image.open(SRC).convert('RGBA'); W,H=im.size
PURPLE=((30,10,60),(180,108,255),(240,225,255))
GREEN=((10,45,25),(126,232,162),(235,255,240))
def ramp(l,c):
    lo,mid,hi=c
    if l<128: t=l/128; return tuple(int(lo[i]+(mid[i]-lo[i])*t) for i in range(3))
    t=(l-128)/127; return tuple(int(mid[i]+(hi[i]-mid[i])*t) for i in range(3))
def tint(img,c):
    out=img.copy(); px=out.load()
    for y in range(img.height):
        for x in range(img.width):
            r,g,b,a=px[x,y]
            if a==0: continue
            if a<255 and abs(r-g)<12 and abs(g-b)<12:  # soft drop shadow: keep
                continue
            l=int(.3*r+.59*g+.11*b); px[x,y]=(*ramp(l,c),a)
    return out
def roof(img,c):
    # recolour only the roof: find the roof's hue in the top quarter, then
    # recolour pixels of that hue in the top three quarters of the house
    import colorsys
    out=img.copy(); px=out.load(); bb=img.split()[3].point(lambda v:255 if v>200 else 0).getbbox()
    top,h=bb[1],bb[3]-bb[1]
    def hsv(p): return colorsys.rgb_to_hsv(p[0]/255,p[1]/255,p[2]/255)
    hues=[hsv(px[x,y])[0] for y in range(top,int(top+h*.25)) for x in range(img.width) if px[x,y][3]==255 and hsv(px[x,y])[1]>.35]
    hues.sort(); H0=hues[len(hues)//2]
    for y in range(top,int(top+h*.8)):
        for x in range(img.width):
            r,g,b_,a=px[x,y]
            if a<255: continue
            hh,ss,vv=hsv((r,g,b_))
            d=min(abs(hh-H0),1-abs(hh-H0))
            if ss<.3 or d>.11: continue
            l=int(.3*r+.59*g+.11*b_); px[x,y]=(*ramp(l,c),a)
    return out
def glow(img,c):
    a=img.split()[3].point(lambda v:255 if v>200 else 0)
    ring=ImageChops.subtract(a.filter(ImageFilter.MaxFilter(13)),a)
    col=Image.new('RGBA',img.size,(*c[1],0)); col.putalpha(ring)
    out=Image.new('RGBA',img.size); out.alpha_composite(col); out.alpha_composite(img); return out
def boxes(row):
    sub=im.crop((0,row*384,W,row*384+384)); a=sub.split()[3]
    cols=[a.crop((x,0,x+1,384)).getbbox() is not None for x in range(W)]
    runs=[];s=None
    for x,c in enumerate(cols+[False]):
        if c and s is None: s=x
        if not c and s is not None:
            if x-s>8: runs.append((s,x))
            s=None
    res=[]
    for s,e in runs:
        bb=sub.crop((s,0,e,384)).getbbox(); res.append((s+bb[0],row*384+bb[1],s+bb[2],row*384+bb[3]))
    return res
houses=[b for b in boxes(0)+boxes(1) if (b[2]-b[0])<200 and (b[3]-b[1])<200]  # skip hospital/big buildings
meta=[]
for i,b in enumerate(houses,1):
    h=im.crop(b); pad=Image.new('RGBA',(h.width+16,h.height+16)); pad.alpha_composite(h,(8,8))
    n=f'house_{i}'
    pad.save(f'assets/houses/{n}.png')
    tint(pad,PURPLE).save(f'assets/houses/{n}_empty_tint.png'); tint(pad,GREEN).save(f'assets/houses/{n}_filled_tint.png')
    roof(pad,PURPLE).save(f'assets/houses/{n}_empty_roof.png'); roof(pad,GREEN).save(f'assets/houses/{n}_filled_roof.png')
    glow(pad,PURPLE).save(f'assets/houses/{n}_empty_glow.png'); glow(pad,GREEN).save(f'assets/houses/{n}_filled_glow.png')
    meta.append({'name':n,'size':pad.size,'box':b})
json.dump({'source':'MetroCity Free External Top Down Environment Asset Pack by JIK-A-4, CC0, https://jik-a-4.itch.io/metro','houses':meta},open('assets/houses/houses.json','w'),indent=1)
print(len(meta),[m['size'] for m in meta])
