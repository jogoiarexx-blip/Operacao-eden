import { describe, it, expect } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { SERVICE_PASSAGES } from '../src/world/ServicePassage.js';
import { neighborChunkPlan, createNeighborSectorStream,
  NEIGHBOR_CHUNK_RADIUS, NEIGHBOR_LOAD_DISTANCE, NEIGHBOR_UNLOAD_DISTANCE,
  NEIGHBOR_MAX_STRUCTURES } from '../src/world/NeighborSectorStream.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';

describe('Streaming de continuação do mapa sem duplicar a simulação', () => {
  it.each(['ch01','ch02'])('%s usa estruturas e estradas reais do mapa vizinho', id => {
    const data=getChapter(id).data;
    const plan=neighborChunkPlan(id);
    expect(plan).not.toBeNull();
    expect(plan.source).toBe(id);
    expect(plan.destination).not.toBe(id);
    expect(plan.structures.length).toBeGreaterThan(0);
    expect(plan.structures.length).toBeLessThanOrEqual(NEIGHBOR_MAX_STRUCTURES);
    expect(plan.paths.length).toBeGreaterThan(0);
    const destination=getChapter(plan.destination).data;
    for(const s of plan.structures){
      const src=destination.structures.find(x=>x.id===s.id);
      expect(src).toBeTruthy();
      expect(s.size).toEqual(src.size);
      const progress=(s.pos[1]-plan.center[1])*plan.outward;
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThanOrEqual(NEIGHBOR_CHUNK_RADIUS+.001);
    }
    expect(plan.structures.every(s=>s.pos[1]<data.bounds[1] || s.pos[1]>data.bounds[3])).toBe(true);
    expect(plan.sourceBounds).toEqual(destination.bounds);
  });
  it.each(['ch01','ch02'])('%s transmite recursos perto e descarta integralmente ao afastar', id => {
    const data=getChapter(id).data;
    const stream=createNeighborSectorStream({data});
    const p=SERVICE_PASSAGES[id];
    expect(stream.stats()).toMatchObject({enabled:false,active:false,builds:0,disposals:0,objects:0});
    expect(NEIGHBOR_UNLOAD_DISTANCE).toBeGreaterThan(NEIGHBOR_LOAD_DISTANCE);
    stream.update({x:p.x,z:p.centerZ});
    expect(stream.stats().active).toBe(false);
    stream.setUnlocked(true);
    stream.update({x:p.x,z:p.centerZ});
    expect(stream.stats()).toMatchObject({active:true,builds:1,disposals:0});
    expect(stream.group.children).toHaveLength(1);
    const instances=[];
    stream.group.traverse(o=>{if(o.isInstancedMesh)instances.push(o);});
    expect(instances.length).toBeGreaterThan(0);
    const counts=instances.map(m=>m.count);
    stream.update({x:p.x,z:p.centerZ});
    expect(instances.map(m=>m.count)).toEqual(counts);
    expect(stream.stats().builds).toBe(1);
    stream.update({x:p.x+NEIGHBOR_UNLOAD_DISTANCE+1,z:p.centerZ});
    expect(stream.stats()).toMatchObject({active:false,builds:1,disposals:1,objects:0});
    expect(stream.group.children).toHaveLength(0);
    stream.update({x:p.x,z:p.centerZ});
    expect(stream.stats()).toMatchObject({active:true,builds:2,disposals:1});
    stream.setUnlocked(false);
    expect(stream.stats()).toMatchObject({enabled:false,active:false,builds:2,disposals:2});
    stream.dispose();
    expect(stream.stats().disposals).toBe(2);
  });
  it('não modifica colisores, IA, missões ou a origem do destino', () => {
    for(const id of ['ch01','ch02']){
      const data=getChapter(id).data,world=new CollisionWorld(data.bounds);
      const source=JSON.stringify({
        encounters:data.encounters,objectives:data.objectives,
        pickups:data.pickups,structures:data.structures,paths:data.paths,
      });
      const stream=createNeighborSectorStream({data});
      const p=SERVICE_PASSAGES[id];
      stream.setUnlocked(true);
      stream.update({x:p.x,z:p.centerZ});
      expect(world.list).toHaveLength(0);
      expect(world.byId.size).toBe(0);
      stream.dispose();
      expect(JSON.stringify({
        encounters:data.encounters,objectives:data.objectives,
        pickups:data.pickups,structures:data.structures,paths:data.paths,
      })).toEqual(source);
    }
  });
});
