"""The surveyed road surface under the game's road pieces at the widths they carry (docs/ROADS.md, issue 196).

    python tools/road_width_map.py shibuya docs/images/roads/widths.jpg [x0 x1 y0 y1]

The survey's carriageways (dark), junctions (lighter), footways (sand) and islands (green); each piece's band at the
width the game draws it (orange a one-way, red a two-way, magenta one that keeps its class's width: a hero level's, a
deck's, one the survey has not), its width in metres beside it (* a single track); the planned area's edge dashed.
"""
import json,sys
sys.path.insert(0,'pipeline')
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import PathPatch
from matplotlib.path import Path
from shapely.geometry import LineString
import road_survey
geo=road_survey.load(f'cities/{sys.argv[1]}/road_surface.json')
g=json.load(open(f'web/data/{sys.argv[1]}/game.json'))
x0,x1,y0,y1=[float(v) for v in sys.argv[3:7]] if len(sys.argv) > 6 else (150.0, 720.0, -1300.0, -820.0)
ROADW={"motorway":14,"trunk":12,"primary":12,"secondary":10,"tertiary":9,"residential":7,"unclassified":6,"living_street":5}
fig,ax=plt.subplots(figsize=(16,16*(y1-y0)/(x1-x0)),dpi=120)
def draw(geom,fc,z):
    for p in getattr(geom,'geoms',[geom]):
        if p.is_empty or p.geom_type!='Polygon': continue
        v=[];c=[]
        for r in [p.exterior]+list(p.interiors):
            xy=np.asarray(r.coords); v+=list(xy); c+=[Path.MOVETO]+[Path.LINETO]*(len(xy)-2)+[Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(v,c),fc=fc,ec='none',zorder=z))
draw(geo['walk'],'#c9b79a',1); draw(geo['carriage'],'#4a4f57',2); draw(geo['cross'],'#5f6672',2); draw(geo['island'],'#7fae7a',3)
for r in g['paths']['road']:
    p=np.asarray(r['p'],float).reshape(-1,3)/10
    if p[:,0].max()<x0 or p[:,0].min()>x1 or p[:,1].max()<y0 or p[:,1].min()>y1: continue
    w=r.get('cw') or ROADW.get(r['c'],7)
    ln=LineString(p[:,:2])
    if r.get('co'): ln=ln.offset_curve(r['co'])
    b=ln.buffer(w/2,cap_style=2)
    xy=np.asarray(b.exterior.coords)
    ax.plot(xy[:,0],xy[:,1],color=('#ff5a4f' if not r.get('o') else '#ffb020') if r.get('cw') else '#ff40ff',lw=0.9 if r.get('cw') else 1.4,zorder=5)
    m=ln.interpolate(0.5,normalized=True)
    if r.get('cw') and ln.length>25: ax.text(m.x,m.y,str(r['cw'])+('*' if r.get('st') else ''),color='#9ff',fontsize=6,zorder=9,clip_on=True)
    ax.plot(p[:,0],p[:,1],color='#fff',lw=0.5,zorder=6)
b=g['bounds']['ground']['poly']
bb=np.asarray(b+[b[0]]); ax.plot(bb[:,0],bb[:,1],color='#39d0ff',lw=1.2,ls='--',zorder=7)
ax.set_xlim(x0,x1);ax.set_ylim(y0,y1);ax.set_aspect('equal');ax.set_facecolor('#1b1d21')
plt.tight_layout()
ax.set_title(f'{sys.argv[1]}: the surveyed carriageway and the widths the road pieces carry', color='#ddd', loc='left'); fig.patch.set_facecolor('#0c0d10'); ax.tick_params(colors='#888')
plt.savefig(sys.argv[2], dpi=120, pil_kwargs={'quality': 84})
