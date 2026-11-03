// E2E: geometria do cenário vizinho carregada perto da saída, liberada quando
// longe e ao armazenar o mapa no cache. Sem colisores ou IA duplicados.
import { chromium } from 'playwright';
const browser=await chromium.launch({args:[
  '--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',
]});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(process.env.URL||'http://localhost:4177/?debug=1');
  await page.waitForFunction(()=>!!window.__game&&!!window.__eden);
  await page.evaluate(async()=>{await window.__eden.startChapter('ch02');window.__eden.skip();});
  await page.waitForFunction(()=>window.__game.sm.state==='PLAYING');
  const report=await page.evaluate(()=>{
    const g=window.__game;
    g.save.chapterStats.ch01={grade:'A',score:1900};
    g.save.storyFlags.outpost_access=true;
    g.save.completedObjectives=['archive_opened'];
    const firstScene=g.scenery,stream=firstScene.neighborSector;
    const world=g.world,worldSize=world.byId.size;
    const before=stream.stats();
    stream.setUnlocked(true);
    g.player.teleport(11.3,33.8);
    stream.update(g.player);
    const near=stream.stats();
    const chunk=stream.group.children[0];
    const nearVisible=chunk?.children.filter(o=>o.isMesh||o.isInstancedMesh).length??0;
    g.player.teleport(-27,-25);
    stream.update(g.player);
    const far=stream.stats();
    g.player.teleport(11.3,35);
    stream.update(g.player);
    const again=stream.stats();
    g.player.teleport(11.3,34.5);
    const swapped=g._stepBacktrack({interactPressed:true});
    const cachedStream=stream.stats();
    const forest=g.scenery.neighborSector;
    forest.setUnlocked(true);
    g.player.teleport(0,-40.5);
    forest.update(g.player);
    const remoteForest=forest.stats();
    g.player.teleport(0,-42);
    const returnToPost=g._stepBacktrack({interactPressed:true});
    const reused=g.scenery===firstScene;
    const cachedForest=forest.stats();
    const current=g.scenery.neighborSector;
    current.setUnlocked(true);
    current.update({x:11.3,z:35.0});
    const restored=current.stats();
    return {before,near,nearVisible,far,again,swapped,cachedStream,
      remoteForest,returnToPost,reused,cachedForest,restored,
      sameWorld:g.world===world,worldSize,colliderCount:g.world.byId.size,
      objectives:g.save.completedObjectives,cache:g.sceneCache.stats()};
  });
  console.log('NEIGHBOR_STREAM_E2E',JSON.stringify({report,errors}));
  if(report.before.active || !report.near.active || report.near.objects<2 ||
     report.nearVisible<2 || report.far.active || report.far.disposals<1 ||
     !report.again.active || report.again.builds<2 ||
     !report.swapped || report.cachedStream.active ||
     !report.remoteForest.active || !report.returnToPost ||
     !report.reused || report.cachedForest.active ||
     !report.restored.active || !report.sameWorld ||
     report.colliderCount!==report.worldSize ||
     !report.objectives.includes('archive_opened') ||
     report.cache.hits<1 || errors.length) {
    throw Error('Falha no streaming adjacente: '+JSON.stringify({report,errors}));
  }
  await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/neighbor-stream.png'});
  console.log('NEIGHBOR_STREAM_E2E_PASS');
} finally {await browser.close();}
