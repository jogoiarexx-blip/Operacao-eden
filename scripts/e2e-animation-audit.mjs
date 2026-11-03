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
        rightArm:pos(rig.model.getObjectByName('RightArm')) });
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
    return {ready:rig.ready, sourceClips:rig.sourceClipCount, bones:boneNames, idle, states, armSignTrials};
  });
  console.log('ANIMATION_AUDIT',JSON.stringify(animation));
  if(!animation.ready || errors.length)throw Error('Falha no Chromium: '+JSON.stringify(errors));
  if(animation.states.some(s=>s.actual!==s.name || !s.tracks))throw Error('Estados não executados');
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
    await page.waitForTimeout(5600);
    const after=await page.evaluate((id)=>{
      const g=window.__game;return {sim:g.simMs,remaining:g.agents.some(x=>x.agent.id===id),
        meshInScene:g.scene.children.some(o=>o.userData?.agentId===id)};
    },corpse.id);
    console.log('CORPSE_AFTER',JSON.stringify(after));
    if(after.remaining)throw Error('Cadáver não foi removido após cinco segundos');
  }
  if(errors.length)throw Error('Erros de navegador: '+JSON.stringify(errors));
  console.log('ANIMATION_AND_CORPSE_AUDIT_PASS');
} finally { await browser.close(); }
