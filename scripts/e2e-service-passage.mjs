// QA da ligação caminhável. O fim do corredor aciona travessia sem F.
import { chromium } from 'playwright';
const browser=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(process.env.URL || 'http://localhost:4177/?debug=1');
  await page.waitForFunction(()=>!!window.__eden && !!window.__game);
  await page.evaluate(async()=>{await window.__eden.startChapter('ch02');window.__eden.skip();});
  await page.waitForFunction(()=>window.__game.sm.state==='PLAYING');
  const report=await page.evaluate(()=>{
    const g=window.__game;
    g.save.chapterStats.ch01={grade:'A',score:2200};
    g.save.storyFlags.outpost_access=true;
    g.save.persistentWorldFlags.chapter.ch01.gateOpen=true;
    g.save.completedObjectives=['radio_online'];
    g.player.hp=47;
    g.scenery.servicePassage.setUnlocked(true);
    const firstPassage=g.scenery.servicePassage;
    const initial={outpost:firstPassage.stats(),
      blocksLeft:g.world.blockedAt(11.3+1.94,35.8,.4),
      walkwayClear:!g.world.blockedAt(11.3,37,.4)};
    g.player.teleport(11.3,34);
    const immediate=g._stepBacktrack({interactPressed:false});
    const nearEntrance=g.chapterId==='ch02';
    // Movimenta o personagem com o passo físico real — não chama o portal diretamente.
    g.player.teleport(11.3,36.3);
    g.camera.yaw=Math.PI; // frente da câmera aponta para +Z (saída do posto)
    const savedSnapshot=g.input.snapshot;
    g.input.snapshot=()=>({moveX:0,moveY:1,run:false,aim:false,interactPressed:false});
    let walkDistance=0;
    for(let i=0;i<90 && g.chapterId==='ch02';i++) {
      const z=g.player.z;
      g.step(1/60);
      if(g.chapterId==='ch02') walkDistance+=Math.max(0,g.player.z-z);
    }
    g.input.snapshot=savedSnapshot;
    const automatic=g.chapterId==='ch01';
    const first={automatic,walkDistance,chapter:g.chapterId,who:g.save.playerId,
      passage:g.scenery.servicePassage.stats(),pos:{x:g.player.x,z:g.player.z}};
    g.scenery.servicePassage.setUnlocked(true);
    const innerSafe=!g.world.blockedAt(0,-42.8,.4);
    g.player.teleport(0,-43.05);
    const reverse=g._stepBacktrack({interactPressed:false});
    const second={reverse,chapter:g.chapterId,who:g.save.playerId,
      sameScene:firstPassage===g.scenery.servicePassage,
      objective:g.save.completedObjectives.includes('radio_online'),
      hp:g.player.hp,cache:g.sceneCache.stats()};
    g.player.teleport(11.3,34.5);
    const keypress=g._stepBacktrack({interactPressed:true});
    const third={keypress,chapter:g.chapterId,who:g.save.playerId,stat:g.save.chapterStats.ch01};
    // Caso-limite: o jogador cruza fora do círculo do atalho F, mas
    // ainda está dentro da faixa física e deve viajar normalmente.
    g.player.teleport(0,-43.05);
    const fourth=g._stepBacktrack({interactPressed:false});
    g.player.teleport(12.45,37.5);
    const edgeReturn=g._stepBacktrack({interactPressed:false});
    const edge={fourth,edgeReturn,chapter:g.chapterId,who:g.save.playerId};
    return {initial,immediate,nearEntrance,first,innerSafe,second,third,edge};
  });
  console.log('WALKABLE_SERVICE_PASSAGE',JSON.stringify({report,errors}));
  if(report.immediate || !report.nearEntrance || !report.initial.walkwayClear ||
     !report.initial.blocksLeft || !report.first.automatic || report.first.walkDistance < .25 ||
     report.first.chapter!=='ch01' || report.first.who!=='lia' ||
     !report.first.passage.active || !report.innerSafe ||
     !report.second.reverse || report.second.chapter!=='ch02' ||
     !report.second.sameScene || !report.second.objective || report.second.hp!==47 ||
     report.second.cache.hits<1 ||
     !report.third.keypress || report.third.chapter!=='ch01' ||
     !report.third.stat || !report.edge.fourth || !report.edge.edgeReturn ||
     report.edge.chapter!=='ch01' || errors.length) {
      throw Error('Falha na travessia: '+JSON.stringify({report,errors}));
  }
  await page.screenshot({path:(process.env.SHOT_DIR||'.')+'/service-passage.png'});
  console.log('SERVICE_PASSAGE_E2E_PASS');
} finally {await browser.close();}
