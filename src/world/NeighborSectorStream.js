import * as THREE from 'three';
import { getChapter } from '../chapters/index.js';
import { BACKTRACK_PORTALS } from '../gameplay/Backtrack.js';
import { SERVICE_PASSAGES } from './ServicePassage.js';

/**
 * Renderiza um pedaço REAL dos dados do capítulo vizinho, sem carregar seus
 * scripts, IA, pickups, colisores ou recursos GLB. Essa extensão fica FORA
 * do mapa jogável; o destino completo passa a ser ativo somente na travessia.
 */
export const NEIGHBOR_CHUNK_RADIUS = 17;
export const NEIGHBOR_LOAD_DISTANCE = 23;
export const NEIGHBOR_UNLOAD_DISTANCE = 37;
export const NEIGHBOR_MAX_STRUCTURES = 24;
const palette = {
  concrete: 0x777e77, gate: 0x647570, rock: 0x49534c, fence: 0x6d7772,
  crate: 0x726144, terminal: 0x34545a, shed: 0x575951, shelter: 0x5e6150,
  wood: 0x665338, container: 0x656955, slab: 0x4d5652, truck: 0x4a5550,
  default: 0x49554d,
};

const distance = (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1]);

export function neighborChunkPlan(chapterId) {
  const passage = SERVICE_PASSAGES[chapterId];
  const portal = BACKTRACK_PORTALS[chapterId];
  if (!passage || !portal) return null;
  const remote = getChapter(portal.to).data;
  const entry = portal.entry;
  const originZ = passage.thresholdZ + passage.outbound * 1.7;
  // Transformação geométrica 1:1 sem deslocar o mapa real: só os proxies
  // são projetados além da passagem. Avanço positivo = direção da saída.
  const transform = ([x, z]) => [
    passage.x + (x - entry[0]),
    originZ + (z - entry[1]),
  ];
  const forward = ([x, z]) => (z - entry[1]) * passage.outbound;
  const center = [passage.x, originZ];
  const structures = remote.structures.filter(s =>
    s.kind === 'box' && Array.isArray(s.size) &&
    s.visual !== 'gate' && s.visual !== 'ravine' &&
    forward(s.pos) >= 0.2 && forward(s.pos) <= NEIGHBOR_CHUNK_RADIUS &&
    Math.abs(s.pos[0] - entry[0]) <= NEIGHBOR_CHUNK_RADIUS
  ).sort((a,b)=>distance(a.pos,entry)-distance(b.pos,entry))
   .slice(0, NEIGHBOR_MAX_STRUCTURES)
   .map(s=>({ id:s.id, visual:s.visual, pos:transform(s.pos),
     size:[...s.size], source:[...s.pos] }));

  const paths = [];
  for (const p of remote.paths ?? []) for (let i=0;i<p.pts.length-1;i++) {
    let a=p.pts[i], b=p.pts[i+1];
    const aa=forward(a),bb=forward(b);
    if (aa < 0 && bb < 0 || aa > NEIGHBOR_CHUNK_RADIUS && bb > NEIGHBOR_CHUNK_RADIUS) continue;
    if (bb===aa) {
      if (aa < 0 || aa > NEIGHBOR_CHUNK_RADIUS) continue;
    } else {
      const t0=Math.max(0,Math.min(1,(0-aa)/(bb-aa)));
      const t1=Math.max(0,Math.min(1,(NEIGHBOR_CHUNK_RADIUS-aa)/(bb-aa)));
      const lo=Math.min(t0,t1),hi=Math.max(t0,t1);
      const enter=aa>=0&&aa<=NEIGHBOR_CHUNK_RADIUS?0:aa<0?t0:t1;
      const exit=bb>=0&&bb<=NEIGHBOR_CHUNK_RADIUS?1:bb<0?t0:t1;
      if (enter>exit) continue;
      const lerp=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      a=lerp(enter);b=lerp(exit);
    }
    const at=transform(a),bt=transform(b);
    if(distance(at,bt)<.1 || Math.min(Math.abs(at[0]-passage.x),Math.abs(bt[0]-passage.x))>NEIGHBOR_CHUNK_RADIUS)continue;
    paths.push({a:at,b:bt,width:p.w});
  }
  return { id:`neighbor_${chapterId}_${portal.to}`,
    source:chapterId, destination:portal.to,
    entry:[...entry], center, portal:[passage.x,passage.thresholdZ],
    structures,paths, width:passage.width,
    outward:passage.outbound, sourceBounds:[...remote.bounds] };
}

/** Carrega/descarrega somente proxies de geometria — zero colisões e IA. */
export function createNeighborSectorStream({ data }) {
  const plan=neighborChunkPlan(data.chapterId);
  const group=new THREE.Group(); group.name='neighbor_sector_stream';
  const state={enabled:false,builds:0,disposals:0,active:false,objects:0};
  let chunk=null;
  function build() {
    if(!plan || chunk)return;
    chunk=new THREE.Group();chunk.name=plan.id;
    const resources=[];
    const floorMat=new THREE.MeshLambertMaterial({color:0x424e46,flatShading:true});
    const roadMat=new THREE.MeshLambertMaterial({color:0x5b5446,flatShading:true});
    const colorMat=new Map();
    const boxGeo=new THREE.BoxGeometry(1,1,1);
    resources.push(boxGeo,floorMat,roadMat);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(plan.width+7,.05,NEIGHBOR_CHUNK_RADIUS+1),floorMat);
    resources.push(floor.geometry);
    floor.position.set(plan.center[0],0.012,plan.center[1]+plan.outward*NEIGHBOR_CHUNK_RADIUS/2);
    chunk.add(floor);
    for(const p of plan.paths) {
      const length=distance(p.a,p.b);
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(p.width,.021,length),roadMat);
      mesh.position.set((p.a[0]+p.b[0])/2,.049,(p.a[1]+p.b[1])/2);
      mesh.rotation.y=Math.atan2(p.b[0]-p.a[0],p.b[1]-p.a[1]);
      resources.push(mesh.geometry);chunk.add(mesh);
    }
    const byVisual=new Map();
    for(const s of plan.structures) {
      const visual=palette[s.visual]===undefined?'default':s.visual;
      if(!byVisual.has(visual))byVisual.set(visual,[]);
      byVisual.get(visual).push(s);
    }
    const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion();
    for(const [visual,list] of byVisual) {
      const mat=new THREE.MeshLambertMaterial({color:palette[visual],flatShading:true});
      colorMat.set(visual,mat);resources.push(mat);
      const mesh=new THREE.InstancedMesh(boxGeo,mat,list.length);
      mesh.name='proxy_'+visual;mesh.castShadow=false;mesh.receiveShadow=false;
      list.forEach((s,i)=>{
        pos.set(s.pos[0],s.size[1]*.5,s.pos[1]);
        scale.set(...s.size);matrix.compose(pos,q,scale);mesh.setMatrixAt(i,matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
      chunk.add(mesh);
    }
    group.add(chunk);
    chunk.userData.resources=resources;
    state.active=true;state.builds++;state.objects=plan.structures.length+plan.paths.length+1;
  }
  function unload() {
    if(!chunk)return;
    group.remove(chunk);
    chunk.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
    for(const r of chunk.userData.resources)r.dispose();
    chunk=null;state.active=false;state.objects=0;state.disposals++;
  }
  return {
    group,plan,
    setUnlocked(value){
      state.enabled=!!value;
      if(!state.enabled)unload();
    },
    update(player){
      if(!plan || !state.enabled || !player)return;
      const dist=Math.hypot(player.x-plan.portal[0],player.z-plan.portal[1]);
      if(chunk && dist>NEIGHBOR_UNLOAD_DISTANCE)unload();
      else if(!chunk && dist<NEIGHBOR_LOAD_DISTANCE)build();
    },
    stats(){return {...state,destination:plan?.destination??null,
      structures:plan?.structures.length??0,paths:plan?.paths.length??0};},
    dispose(){unload();},
  };
}
