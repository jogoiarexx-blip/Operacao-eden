import { describe, expect, it } from 'vitest';
import { getChapter } from '../src/chapters/index.js';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { BACKTRACK_PORTALS } from '../src/gameplay/Backtrack.js';
import { SERVICE_PASSAGES, canUseServicePassage, crossedServicePassage,
  createServicePassage } from '../src/world/ServicePassage.js';

const opened = chapterId => ({
  chapterId, chapterStats: { ch01: {grade:'B'} }, storyFlags: {outpost_access:true},
});

describe('Travessia física entre Selva Norte e Posto Norte', () => {
  it('não libera a travessia antes de concluir o primeiro capítulo', () => {
    for(const chapterId of ['ch01','ch02']){
      expect(canUseServicePassage({chapterId,chapterStats:{},storyFlags:{}})).toBe(false);
      const p=SERVICE_PASSAGES[chapterId];
      expect(crossedServicePassage({chapterId,chapterStats:{},storyFlags:{}},
        p.x,p.thresholdZ)).toBe(false);
    }
  });
  it('detecta somente a saída caminhável, sem viajar ao nascer ou passar de lado', () => {
    for (const id of ['ch01','ch02']) {
      const p=SERVICE_PASSAGES[id], save=opened(id);
      expect(crossedServicePassage(save,p.x,p.thresholdZ)).toBe(true);
      expect(crossedServicePassage(save,p.x+2,p.thresholdZ)).toBe(false);
      expect(crossedServicePassage(save,p.x,p.thresholdZ-p.outbound*1.5)).toBe(false);
      expect(crossedServicePassage(save,p.x,p.thresholdZ+p.outbound*4)).toBe(false);
      expect(BACKTRACK_PORTALS[id].to).toBe(p.to);
    }
    expect(crossedServicePassage(opened('ch02'),11.3,34)).toBe(false);
    expect(crossedServicePassage(opened('ch01'),0,-37)).toBe(false);
    expect(crossedServicePassage(opened('invalid'),0,-37)).toBe(false);
  });
  it('mantém faixa livre, limites laterais e geometria equivalente dos dois lados', () => {
    const results=[];
    for (const id of ['ch01','ch02']) {
      const {data}=getChapter(id), world=new CollisionWorld(data.bounds);
      const passage=createServicePassage({data,world});
      const p=SERVICE_PASSAGES[id];
      expect(passage.stats()).toMatchObject({active:true,id:p.id,
        destination:p.to, colliderCount:2,unlocked:false});
      expect(world.byId.size).toBe(2);
      expect(world.blockedAt(p.x,p.thresholdZ,.42)).toBe(false);
      expect(world.blockedAt(p.x+p.width/2+.24,p.centerZ,.42)).toBe(true);
      expect(world.blockedAt(p.x-p.width/2-.24,p.centerZ,.42)).toBe(true);
      passage.setUnlocked(true);
      expect(passage.stats().unlocked).toBe(true);
      passage.setUnlocked(false);
      expect(passage.stats().unlocked).toBe(false);
      results.push({width:p.width,parts:passage.stats().parts,colliders:world.byId.size});
      passage.group.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});
    }
    expect(results[0]).toEqual(results[1]);
  });
});
