"""Recompressa GLB mantendo skin, acessores, joints e 17 clipes intactos.
Uso: python tools/optimize-regina.py origem.glb public/assets/characters/regina-optimized.glb
"""
import io
import json
import struct
import sys
from pathlib import Path
from PIL import Image

def read_glb(path):
    data=Path(path).read_bytes()
    magic,version,total=struct.unpack_from('<4sII',data)
    if magic != b'glTF' or version!=2 or total!=len(data):
        raise ValueError('GLB invalido ou comprimento inconsistente')
    l,k=struct.unpack_from('<I4s',data,12)
    if k != b'JSON': raise ValueError('Chunk JSON ausente')
    obj=json.loads(data[20:20+l]); o=20+l
    ln,tp=struct.unpack_from('<I4s',data,o)
    if tp!=b'BIN\x00': raise ValueError('Chunk BIN ausente')
    return obj,data[o+8:o+8+ln]

def packed_image(raw,image_index):
    img=Image.open(io.BytesIO(raw)).convert('RGB')
    # 1K para base e normal; 512p e PNG sem perdas para canal G/B de metallic/roughness.
    max_edge=512 if image_index==2 else 1024
    img.thumbnail((max_edge,max_edge),Image.Resampling.LANCZOS)
    out=io.BytesIO()
    if image_index == 2:
        img.save(out,format='PNG',compress_level=9,optimize=True)
        return out.getvalue(),'image/png',img.size
    img.save(out,format='JPEG',quality=88 if image_index==1 else 91,
             subsampling=0 if image_index==0 else 2,optimize=True,progressive=True)
    return out.getvalue(),'image/jpeg',img.size

def optimize(src,dst):
    obj, old=read_glb(src)
    image_views={im['bufferView']:idx for idx,im in enumerate(obj['images']) if 'bufferView' in im}
    new=bytearray()
    before_images=[]
    for idx,v in enumerate(obj['bufferViews']):
        old_start=v.get('byteOffset',0); old_end=old_start+v['byteLength']
        if old_end>len(old):raise ValueError('bufferView fora do buffer')
        raw=old[old_start:old_end]
        if idx in image_views:
            i=image_views[idx]
            raw,mime,dims=packed_image(raw,i)
            obj['images'][i]['mimeType']=mime
            before_images.append((i,len(old[old_start:old_end]),len(raw),dims,mime))
        while len(new)%4: new.append(0)
        v['byteOffset']=len(new)
        v['byteLength']=len(raw)
        new.extend(raw)
    obj['buffers'][0]['byteLength']=len(new)
    jb=json.dumps(obj,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    jb+=b' '*((-len(jb))%4)
    new.extend(b'\x00'*(-len(new)%4))
    out=struct.pack('<4sII',b'glTF',2,12+8+len(jb)+8+len(new))
    out+=struct.pack('<I4s',len(jb),b'JSON')+jb
    out+=struct.pack('<I4s',len(new),b'BIN\x00')+new
    Path(dst).parent.mkdir(parents=True,exist_ok=True)
    Path(dst).write_bytes(out)
    check, bin_data=read_glb(dst)
    assert len(check.get('skins',[]))==len(obj.get('skins',[]))==1
    assert len(check.get('animations',[]))==len(obj.get('animations',[]))==17
    assert len(check.get('nodes',[]))==len(obj.get('nodes',[]))==86
    for acc in check['accessors']:
        if 'bufferView' in acc:
            v=check['bufferViews'][acc['bufferView']]
            assert v.get('byteOffset',0)+v['byteLength']<=len(bin_data)
    print('Original:',len(Path(src).read_bytes()),'bytes')
    print('Otimizado:',len(out),'bytes')
    print('Reducao:',round((1-len(out)/Path(src).stat().st_size)*100,1),'%')
    print('Texturas:',before_images)
    print('Clipes:',len(check['animations']),'ossos:',len(check['skins'][0]['joints']))

if __name__=='__main__':
    optimize(sys.argv[1],sys.argv[2])
