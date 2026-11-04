import { chromium } from 'playwright';

const url = process.env.URL || 'http://localhost:4177/?debug=1';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__eden && !!window.__game, null, { timeout: 25000 });
  await page.evaluate(async () => { await window.__eden.startChapter('ch01'); window.__eden.skip(); });
  await page.waitForFunction(() => window.__game.sm.state === 'PLAYING', null, { timeout: 20000 });
  const animation = await page.evaluate(async () => {
    const g = window.__game, rig = g.playerView.regina;
    await rig.load();
    const boneNames = [];
    rig.model.traverse(n => { if (n.isBone) boneNames.push(n.name); });
    const player = (changes = {}) => ({
      dead:false, dodging:false, hurtT:0, using:null, reloading:false,
      aiming:false, simShooting:false, sprinting:false,
      weaponId:'pistol', speed:0, vx:0, vz:0, yaw:0, ...changes,
    });
    const hand = (side) => rig.model.getObjectByName(side + 'Hand') || rig.model.getObjectByName(side + 'HandWeaponSocket');
    const pos = (bone) => {
      if (!bone) return null;
      rig.model.updateMatrixWorld(true);
      const w = bone.getWorldPosition(rig.model.position.clone());
      return rig.model.worldToLocal(w).toArray().map(x => +x.toFixed(4));
    };
    const idle = { left:pos(hand('Left')), right:pos(hand('Right')) };
    const weapon = rig.weapon;
    const muzzle = weapon?.children.find(n => n.geometry?.type === 'BoxGeometry');
    rig.model.updateMatrixWorld(true);
    const muzzleForward = weapon
      ? weapon.getWorldDirection(new (rig.model.position.constructor)()).normalize()
        .dot(rig.model.getWorldDirection(new (rig.model.position.constructor)()).normalize())
      : null;
    const walkClip = rig.actions.walk?.getClip();
    const legTrack = walkClip?.tracks.find(t=>t.name==='LeftUpLeg.quaternion');
    const legKeys = legTrack?.times.length ?? 0;
    const values = legTrack?.values ?? [];
    const times = legTrack?.times ?? [];
    const legCycle = {
      finite: Array.from(values).every(Number.isFinite) && Array.from(times).every(Number.isFinite),
      increasing: Array.from(times).every((t, i) => i === 0 || t > times[i - 1]),
      span: legKeys >= 2 ? times[legKeys - 1] - times[0] : 0,
      loopDot: legKeys >= 2 ? Math.abs(Array.from({length:4}, (_,i) => values[i] * values[values.length - 4 + i]).reduce((a,b)=>a+b,0)) : 0,
      movement: legKeys >= 2 ? Math.max(...Array.from({length:legKeys}, (_,k) =>
        1 - Math.abs(Array.from({length:4}, (_,i) => values[i] * values[k*4+i]).reduce((a,b)=>a+b,0)))) : 0,
    };
    const states = [];
    for (const [name, overrides] of [
      ['walk',{speed:3.2,vz:-3.2}],
      ['run',{speed:5.6,vz:-5.6,sprinting:true}],
      ['aim',{aiming:true}],
      ['aimWalk',{speed:2,vz:-2,aiming:true}],
      ['reload',{reloading:true}],
    ]) {
      for(let n=0;n<60;n++)rig.sync(player(overrides), 1/60,0,1);
      const action = rig.actions[name];
      states.push({ name, actual:rig.state, tracks: action?.getClip().tracks.length,
        left:pos(hand('Left')), right:pos(hand('Right')),
        leftArm:pos(rig.model.getObjectByName('LeftArm')),
        rightArm:pos(rig.model.getObjectByName('RightArm')),
        footOffset:rig.footOffset,
        support:{...rig.weaponSupport} });
    }
    const armSignTrials = {};
    for(const side of ['Left','Right']) {
      const arm = rig.model.getObjectByName(side+'Arm');
      const wrist = hand(side);
      if(!arm||!wrist) continue;
      rig.mixer.stopAllAction(); arm.quaternion.copy(rig.bindArmQuaternions?.[side] ?? arm.quaternion);
      const start = arm.quaternion.clone();
      armSignTrials[side] = {};
      for(const degrees of [-1.2,0,1.2]) {
        arm.quaternion.copy(start).multiply(new (arm.quaternion.constructor)().setFromAxisAngle({x:1,y:0,z:0},degrees));
        armSignTrials[side][degrees] = pos(wrist);
      }
      arm.quaternion.copy(start);
    }
    return {ready:rig.ready, sourceClips:rig.sourceClipCount, bones:boneNames, idle, states, armSignTrials,
      muzzleForward, hasWeapon:!!weapon, hasGun:!!muzzle, legKeys, legCycle};
  });
  console.log('ANIMATION_AUDIT',JSON.stringify(animation));
  // Recarregar/atirar andando: a perna continua oscilando enquanto a parte
  // superior executa a ação, sem voltar à pose T ou congelar os joelhos.
  const layers = await page.evaluate(() => {
    const g = window.__game, rig = g.playerView.regina;
    const p = (o = {}) => ({
      dead:false, dodging:false, hurtT:0, using:null, reloading:false,
      aiming:false, simShooting:false, sprinting:false, speed:3.1,
      vx:0,vz:-3.1,yaw:0, weaponId:'pistol',
      weapon:{reloadMs:1100}, mag:8,magSize:12,...o,
    });
    for(let i=0;i<12;i++)rig.sync(p(),1/60,0,1);
    const before = rig.baseAction?.time ?? 0;
    const leg = rig.model.getObjectByName('LeftUpLeg');
    const legAngles=[];
    for(let i=0;i<24;i++){
      rig.sync(p({reloading:true}),1/60,0,1);
      if(i%4===0)legAngles.push(leg?.quaternion.x ?? null);
    }
    const reload={state:rig.state,base:rig.baseState,overlay:rig.overlayState,
      lowerClip:rig.baseAction?.getClip().name ?? null,
      baseRunning:rig.baseAction?.isRunning() ?? false,
      overlayRunning:rig.overlayAction?.isRunning() ?? false,
      legAngles,after:rig.baseAction?.time ?? null,before};
    rig.triggerShot();
    for(let i=0;i<6;i++)rig.sync(p({aiming:true,speed:2,vz:-2,reloading:false}),1/60,0,1);
    const shot={state:rig.state,base:rig.baseState,overlay:rig.overlayState,
      lowerClip:rig.baseAction?.getClip().name ?? null,
      baseRunning:rig.baseAction?.isRunning() ?? false};
    for(let i=0;i<12;i++)rig.sync(p(),1/60,0,1);
    const exit={state:rig.state,base:rig.baseState,overlay:rig.overlayState,
      clip:rig.baseAction?.getClip().name ?? null};
    return {reload,shot,exit};
  });
  console.log('ANIMATION_LAYERS',JSON.stringify(layers));
  const legValues=layers.reload.legAngles.filter(n=>typeof n==='number');
  if(layers.reload.state!=='reload' || layers.reload.base!=='walk' ||
     layers.reload.overlay!=='reload' || !layers.reload.baseRunning ||
     !layers.reload.overlayRunning || !/ReginaLower_walk$/.test(layers.reload.lowerClip) ||
     legValues.length<3 || Math.max(...legValues)-Math.min(...legValues)<0.015 ||
     layers.shot.state!=='shoot' || layers.shot.overlay!=='shoot' ||
     layers.shot.base!=='aimWalk' || !layers.shot.baseRunning ||
     !/ReginaLower_aimWalk$/.test(layers.shot.lowerClip) ||
     layers.exit.overlay!==null || layers.exit.state!=='walk' ||
     layers.exit.clip!=='Regina_walk')
    throw Error('Ação superior interrompeu a passada: '+JSON.stringify(layers));

  if(!animation.ready || errors.length)throw Error('Falha no Chromium: '+JSON.stringify(errors));
  if(animation.states.some(s=>s.actual!==s.name || !s.tracks))throw Error('Estados não executados');
  for(const state of animation.states) {
    if(!Number.isFinite(state.footOffset) || Math.abs(state.footOffset)>0.071)
      throw Error('Correção vertical instável: '+JSON.stringify(state));
    if(['aim','aimWalk'].includes(state.name) &&
      (!state.support.active || !Number.isFinite(state.support.before) ||
       state.support.after > state.support.before + 0.001))
      throw Error('Mão esquerda perdeu apoio da arma: '+JSON.stringify(state));
  }
  if(!animation.hasWeapon || !animation.hasGun || animation.muzzleForward < 0.98 || animation.legKeys < 3 ||
     !animation.legCycle.finite || !animation.legCycle.increasing ||
     animation.legCycle.span < 0.1 || animation.legCycle.loopDot < 0.999 ||
     animation.legCycle.movement < 0.001)
    throw Error('Cano invertido ou ciclo de marcha incompleto: '+JSON.stringify({
      hasWeapon:animation.hasWeapon,hasGun:animation.hasGun,
      muzzleForward:animation.muzzleForward,legKeys:animation.legKeys,legCycle:animation.legCycle,
    }));
  const reloadAudit = await page.evaluate(() => {
    const rig = window.__game.playerView.regina;
    const base = {
      dead:false,dodging:false,hurtT:0,using:null,reloading:true,
      aiming:false,simShooting:false,sprinting:false,speed:0,vx:0,vz:0,yaw:0,
      mag:4,magSize:12,weapon:{reloadMs:1400,reloadShellMs:520,reloadOpenMs:250},
    };
    const results=[];
    for (const id of ['pistol','shotgun']) {
      const p={...base,weaponId:id};
      for(let i=0;i<20;i++)rig.sync(p,1/60,0,1);
      results.push({
        weaponId:id, state:rig.state,
        overlay:rig.overlayAction?.getClip().name,
        running:rig.overlayAction?.isRunning(),
        magazine:rig.magazine?.visible,
        shell:rig.shell?.visible,
        shellExists:!!rig.shell,
        magazineExists:!!rig.magazine,
        timeScale:rig.overlayAction?.getEffectiveTimeScale(),
      });
      // Sair da recarga permite que a animação retorne à mira.
      for(let i=0;i<16;i++)rig.sync({...p,reloading:false,aiming:true},1/60,0,1);
    }
    return results;
  });
  console.log('RELOAD_WEAPONS',JSON.stringify(reloadAudit));
  if (reloadAudit.length!==2 || reloadAudit.some(x=>!x.running || !x.shellExists || !x.magazineExists ||
    !Number.isFinite(x.timeScale) || x.timeScale<=0 ||
    x.overlay!==(x.weaponId==='shotgun'?'Regina_reloadShotgun':'Regina_reloadPistol')))
    throw Error('Recargas não independentes: '+JSON.stringify(reloadAudit));
  const corpse = await page.evaluate(() => {
    const g=window.__game;
    if(!g.agents.length) {
      g.spawnAgent({id:'qa_dead_dinosaur',type:'forest_runner',pos:[g.player.x+7,g.player.z+7]},'qa');
    }
    const x=g.agents[0]; x.agent.dead=true; x.agent.deadAt=g.simMs;
    return {id:x.agent.id,count:g.agents.length,started:g.simMs};
  });
  console.log('CORPSE_START',JSON.stringify(corpse));
  if(!corpse.id)throw Error('Não foi possível preparar o cadáver de teste');
  {
    // O Chromium headless com SwiftShader pode renderizar mais lento do que
    // tempo real; o prazo é medido em simulação, não em relógio de parede.
    const checks = await page.evaluate(({id,started}) => {
      const g=window.__game;
      g.simMs = started + 4950;
      g.step(1/60);
      const before = g.agents.some(x=>x.agent.id===id);
      g.simMs = started + 5050;
      g.step(1/60);
      const after = g.agents.some(x=>x.agent.id===id);
      return {before, after, elapsed:g.simMs-started};
    },corpse);
    console.log('CORPSE_SIM_TIME',JSON.stringify(checks));
    if(!checks.before || checks.after)throw Error('Prazo de remoção incorreto: '+JSON.stringify(checks));
  }
  if(errors.length)throw Error('Erros de navegador: '+JSON.stringify(errors));
  console.log('ANIMATION_AND_CORPSE_AUDIT_PASS');
} finally { await browser.close(); }
