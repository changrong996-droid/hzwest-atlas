# OSM API 0.6 原始块（bbox 2×2：lon 120.014–120.055，lat 30.270–30.312）→ osm.pkl
import xml.etree.ElementTree as ET, json, math, collections
N={};W={};R={};PN=[]
for f in ['b1.xml','b2.xml','b3.xml','b4.xml']:
    r=ET.parse(f).getroot()
    for n in r.iter('node'):
        N[n.get('id')]=(float(n.get('lon')),float(n.get('lat')))
        t={x.get('k'):x.get('v') for x in n.iter('tag')}
        if 'place' in t and 'name' in t: PN.append((t,N[n.get('id')]))
    for w in r.iter('way'): W[w.get('id')]=([nd.get('ref') for nd in w.iter('nd')],{t.get('k'):t.get('v') for t in w.iter('tag')})
    for rl in r.iter('relation'): R[rl.get('id')]=([(m.get('type'),m.get('ref'),m.get('role')) for m in rl.iter('member')],{t.get('k'):t.get('v') for t in rl.iter('tag')})
import pickle; pickle.dump((N,W,R,PN),open('osm.pkl','wb'))
b=[w for w in W.values() if 'building' in w[1]]
print('bldg',len(b),'withh',sum(1 for w in b if 'height' in w[1] or 'building:levels' in w[1]))
print(collections.Counter(w[1]['building'] for w in b).most_common(12))
print(collections.Counter(w[1]['highway'] for w in W.values() if 'highway' in w[1]).most_common(15))
print([(t['place'],t['name']) for t,_ in PN])
print([t.get('name') for _,t in W.values() if t.get('name') and ('building' in t or t.get('landuse') or t.get('amenity')) ][:80])
print('rel bldg',sum(1 for m,t in R.values() if 'building' in t))
