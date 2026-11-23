# OSM api 0.6 原始块（t_*.xml，可多个目录）→ osm.pkl，供 mk_mid.py
import xml.etree.ElementTree as ET, glob, pickle
N={};W={};R={};PN=[]
for f in sorted(glob.glob('/workspace/work/roads/t_*.xml')+glob.glob('t_*.xml')):
    r=ET.parse(f).getroot()
    for n in r.iter('node'):
        N[n.get('id')]=(float(n.get('lon')),float(n.get('lat')))
        t={x.get('k'):x.get('v') for x in n.iter('tag')}
        if 'place' in t and 'name' in t: PN.append((t,N[n.get('id')]))
    for w in r.iter('way'): W[w.get('id')]=([nd.get('ref') for nd in w.iter('nd')],{t.get('k'):t.get('v') for t in w.iter('tag')})
    for rl in r.iter('relation'): R[rl.get('id')]=([(m.get('type'),m.get('ref'),m.get('role')) for m in rl.iter('member')],{t.get('k'):t.get('v') for t in rl.iter('tag')})
pickle.dump((N,W,R,PN),open('osm.pkl','wb'))
b=[w for w in W.values() if 'building' in w[1]]
print('nodes',len(N),'ways',len(W),'bldg',len(b),'withlv',sum(1 for w in b if 'height' in w[1] or 'building:levels' in w[1]))
seen=set()
for t,c in PN:
    k=(t['name'],t['place'])
    if k in seen: continue
    seen.add(k)
    if t['place'] in('suburb','town','city','quarter','neighbourhood'): print(t['place'],t['name'],round(c[0],3),round(c[1],3))
