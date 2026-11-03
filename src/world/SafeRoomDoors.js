import * as THREE from 'three';

/**
 * Portas de acesso visual para os postos interiores existentes. Não adiciona
 * colisores: as paredes/caixas do mapa continuam decidindo se é possível
 * atravessar. A IA permanece excluída pelas SafeZones.
 */
export function createSafeDoorFrames({ data, world }) {
  const group = new THREE.Group();
  group.name = 'safe_room_door_frames';
  const doors = [];
  const matFrame = new THREE.MeshLambertMaterial({color:0x44585a,flatShading:true});
  const matLeaf = new THREE.MeshLambertMaterial({color:0x374b49,flatShading:true});
  const matStrip = new THREE.MeshBasicMaterial({color:0x4fb69a});
  const frameGeo = new THREE.BoxGeometry(.18, 2.45, .16);
  const topGeo = new THREE.BoxGeometry(.2, .18, 1);
  const leafGeo = new THREE.BoxGeometry(.11, 2.13, 1);
  const stripGeo = new THREE.BoxGeometry(.14, .07, .18);
  const make = (geo,material,x,y,z,parent=group)=>{
    const mesh=new THREE.Mesh(geo,material); mesh.position.set(x,y,z);
    mesh.castShadow=false; mesh.receiveShadow=true; parent.add(mesh); return mesh;
  };
  for(const room of data.safeRooms ?? []){
    if(!room.entrance) continue;
    const width=room.doorWidth ?? 2.15;
    const container=new THREE.Group();
    container.name='safe_door_'+room.id;
    container.position.set(room.entrance[0],0,room.entrance[1]);
    group.add(container);
    make(frameGeo,matFrame,0,1.23,-width/2-.1,container);
    make(frameGeo,matFrame,0,1.23, width/2+.1,container);
    const header=make(topGeo,matFrame,0,2.48,0,container);header.scale.z=width+.4;
    const strip=make(stripGeo,matStrip,0,2.36,0,container);strip.scale.z=width*5;
    const left=make(leafGeo,matLeaf,0,1.13,-width/4,container);
    const right=make(leafGeo,matLeaf,0,1.13,width/4,container);
    left.scale.z=width*.48;right.scale.z=width*.48;
    // Uma abertura acessível ao jogador; animação de correr e parar junto ao portal.
    doors.push({room,container,left,right,width,open:0});
  }
  return {
    group,
    doors,
    update(player,dt=1/60){
      if(!player) return;
      for(const d of doors){
        const locked=!!(d.room.requiresBroken && world?.byId?.has(d.room.requiresBroken));
        const near=Math.hypot(player.x-d.room.entrance[0],player.z-d.room.entrance[1]) < 3.3;
        const target=near && !locked ? 1 : 0;
        d.open += (target-d.open)*Math.min(1,Math.max(0,dt)*7);
        d.left.position.z = -d.width/4 - d.open*d.width*.265;
        d.right.position.z = d.width/4 + d.open*d.width*.265;
      }
    },
    stats(){return{doors:doors.length,open:doors.filter(d=>d.open>.55).map(d=>d.room.id)}},
    dispose(){ /* Recursos compartilhados descartados pelo SectorScenery.group.traverse */ },
  };
}
