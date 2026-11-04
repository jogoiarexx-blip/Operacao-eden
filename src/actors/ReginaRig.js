import * as THREE from 'three';
import quaterniusWalk from './quaternius-walk.json';

// O GLB original tem 17 clips experimentais (slots 00-14, 38 e 39).
// Em vez de presumir que os slots TESTE são definitivos, usamos ações normalizadas
// de tempo fixo sobre o próprio esqueleto, preservando os 17 clips no arquivo.
const CLIP_DURATIONS = {
  idle: 1.8, walk: 0.88, walkBack: 1.02, run: 0.62, aim: 0.9, aimWalk: 0.88,
  aimBack: 1.04, aimStrafeLeft: 0.95, aimStrafeRight: 0.95,
  shoot: 0.28, reload: 1.1, use: 0.8, dodge: 0.34, hurt: 0.35, death: 0.95,
};
const ONESHOT = new Set(['shoot', 'reload', 'reloadPistol', 'use', 'dodge', 'hurt', 'death']);
// O corpo continua andando enquanto braços/peito executam recarga ou disparo.
const GAIT_STATES = new Set(['walk','walkBack','run','aimWalk','aimBack','aimStrafeLeft','aimStrafeRight']);
const LOCOMOTION_STATES = new Set(['idle','aim', ...GAIT_STATES]);
const UPPER_ACTIONS = new Set(['shoot','reload','use']);
const FULL_BODY_ACTIONS = new Set(['dodge','hurt','death']);
const LOWER_BONES = new Set(['Hips','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot']);
const step = (...values) => values;
const q = (x = 0, y = 0, z = 0) => [x, y, z];

// Deliberadamente não movimenta o root global ou translada o personagem;
// colisões, velocidade e invulnerabilidade continuam sob Player.step().
const POSES = {
  idle: {
    Hips: step(q(), q(0, 0, 0.008), q()),
    Chest: step(q(), q(0.025), q()),
    LeftArm: step(q(0.04), q(0.06), q(0.04)),
    RightArm: step(q(0.05), q(0.07), q(0.05)),
  },
  walk: {
    Hips: step(q(0, 0, 0.025), q(), q(0, 0, -0.025), q(), q(0, 0, 0.025)),
    LeftUpLeg: step(q(-0.46), q(), q(0.46), q(), q(-0.46)),
    RightUpLeg: step(q(0.46), q(), q(-0.46), q(), q(0.46)),
    LeftLeg: step(q(0.07), q(0.42), q(0.07), q(), q(0.07)),
    RightLeg: step(q(0.07), q(), q(0.07), q(0.42), q(0.07)),
    LeftArm: step(q(0.28), q(), q(-0.28), q(), q(0.28)),
    RightArm: step(q(-0.28), q(), q(0.28), q(), q(-0.28)),
    Chest: step(q(), q(0, 0.045), q(), q(0, -0.045), q()),
  },
  run: {
    LeftUpLeg: step(q(-0.78), q(), q(0.78), q(), q(-0.78)),
    RightUpLeg: step(q(0.78), q(), q(-0.78), q(), q(0.78)),
    LeftLeg: step(q(0.1), q(0.85), q(0.1), q(0.05), q(0.1)),
    RightLeg: step(q(0.1), q(0.05), q(0.1), q(0.85), q(0.1)),
    LeftArm: step(q(0.65), q(0.2), q(-0.65), q(0.2), q(0.65)),
    RightArm: step(q(-0.65), q(0.2), q(0.65), q(0.2), q(-0.65)),
    Chest: step(q(0.13), q(0.15, 0, 0.06), q(0.13), q(0.15, 0, -0.06), q(0.13)),
  },
  aim: {
    RightArm: step(q(1.22), q(1.25), q(1.22)),
    LeftArm: step(q(1.00, 0, -0.18), q(1.02, 0, -0.18), q(1.00, 0, -0.18)),
    RightForeArm: step(q(0.18), q(0.18), q(0.18)),
    LeftForeArm: step(q(0.50), q(0.50), q(0.50)),
    Chest: step(q(0.02), q(0.025), q(0.02)),
  },
  shoot: {
    RightArm: step(q(1.22), q(1.55), q(1.3), q(1.22)),
    LeftArm: step(q(1.00, 0, -0.18), q(1.17, 0, -0.18), q(1.04, 0, -0.18), q(1.0, 0, -0.18)),
    Chest: step(q(0.02), q(-0.16), q(-0.04), q(0.02)),
  },
  reload: {
    RightArm: step(q(1.2), q(0.58), q(0.76), q(1.2)),
    LeftArm: step(q(0.95), q(0.72), q(0.95), q(0.95)),
    LeftForeArm: step(q(0.4), q(1.0), q(0.82), q(0.4)),
    Chest: step(q(), q(0.15), q(0.12), q()),
  },
  use: {
    RightArm: step(q(), q(0.65), q(0.72), q()),
    LeftArm: step(q(), q(0.83), q(1), q()),
    Chest: step(q(), q(0.11), q(0.1), q()),
  },
  dodge: {
    Hips: step(q(), q(-0.65), q(-1.2), q(-0.65), q()),
    Chest: step(q(), q(-0.4), q(-0.9), q(-0.3), q()),
    LeftUpLeg: step(q(), q(-1.0), q(-1.15), q(-0.5), q()),
    RightUpLeg: step(q(), q(-1.0), q(-1.15), q(-0.5), q()),
    LeftArm: step(q(), q(1), q(1.3), q(0.6), q()),
    RightArm: step(q(), q(1), q(1.3), q(0.6), q()),
  },
  hurt: {
    Chest: step(q(), q(-0.35, 0, 0.14), q(-0.15), q()),
    Head: step(q(), q(-0.22), q(-0.08), q()),
    RightArm: step(q(), q(-0.4), q(-0.2), q()),
  },
  death: {
    Chest: step(q(), q(-0.45), q(-0.9), q(-0.95)),
    Head: step(q(), q(0.2), q(0.3), q(0.3)),
    LeftArm: step(q(), q(-0.45), q(-0.7), q(-0.7)),
    RightArm: step(q(), q(-0.5), q(-0.8), q(-0.8)),
  },
};
// Mira em deslocamento combina pernas com braços prontos para disparar.
POSES.aimWalk = {
  ...POSES.walk,
  LeftArm: step(q(1.0, 0, -0.18), q(1.0, 0, -0.18), q(1.0, 0, -0.18), q(1.0, 0, -0.18), q(1.0, 0, -0.18)),
  RightArm: step(q(1.22), q(1.22), q(1.22), q(1.22), q(1.22)),
  LeftForeArm: step(q(0.5), q(0.5), q(0.5), q(0.5), q(0.5)),
};

// Deslocamento relativo à direção do tronco; strafe preserva a direção da mira.
export function directionForRegina(player) {
  const { vx, vz, yaw } = player;
  const speed = Math.hypot(vx ?? 0, vz ?? 0);
  if (!Number.isFinite(speed) || speed < 0.45 || !Number.isFinite(yaw)) return 'forward';
  const forward = -(vx * Math.sin(yaw) + vz * Math.cos(yaw));
  const right = vx * Math.cos(yaw) - vz * Math.sin(yaw);
  if (forward < -Math.max(0.4, Math.abs(right) * 0.85)) return 'back';
  if (Math.abs(right) > Math.abs(forward) * 1.2) return right > 0 ? 'right' : 'left';
  return 'forward';
}

// Passos menores e apoio dos pés evitam "patinação" durante a mira e a marcha ré.
POSES.walk.LeftFoot = step(q(-0.12), q(0.06), q(0.20), q(0.06), q(-0.12));
POSES.walk.RightFoot = step(q(0.20), q(0.06), q(-0.12), q(0.06), q(0.20));
POSES.run.LeftFoot = step(q(-0.23), q(0.14), q(0.33), q(0.14), q(-0.23));
POSES.run.RightFoot = step(q(0.33), q(0.14), q(-0.23), q(0.14), q(0.33));
POSES.walkBack = {
  ...POSES.walk,
  LeftUpLeg: step(q(0.32), q(), q(-0.32), q(), q(0.32)),
  RightUpLeg: step(q(-0.32), q(), q(0.32), q(), q(-0.32)),
  LeftArm: step(q(-0.18), q(), q(0.18), q(), q(-0.18)),
  RightArm: step(q(0.18), q(), q(-0.18), q(), q(0.18)),
};
POSES.aimBack = { ...POSES.walkBack, LeftArm: POSES.aimWalk.LeftArm,
  RightArm: POSES.aimWalk.RightArm, LeftForeArm: POSES.aimWalk.LeftForeArm };
for (const [name, sign] of [['aimStrafeLeft', -1], ['aimStrafeRight', 1]]) {
  POSES[name] = {
    ...POSES.aimWalk,
    Hips: step(q(0, 0, sign * 0.025), q(0, 0, -sign * 0.02),
      q(0, 0, sign * 0.025), q(0, 0, -sign * 0.02), q(0, 0, sign * 0.025)),
    LeftUpLeg: step(q(0, 0, sign * -0.24), q(), q(0, 0, sign * 0.24), q(), q(0, 0, sign * -0.24)),
    RightUpLeg: step(q(0, 0, sign * 0.24), q(), q(0, 0, sign * -0.24), q(), q(0, 0, sign * 0.24)),
    LeftFoot: step(q(-0.1), q(0.08), q(0.17), q(0.08), q(-0.1)),
    RightFoot: step(q(0.17), q(0.08), q(-0.1), q(0.08), q(0.17)),
  };
}
POSES.aimWalk.LeftFoot = POSES.walk.LeftFoot;
POSES.aimWalk.RightFoot = POSES.walk.RightFoot;

// Respiração e balanço dos ombros no repouso, sem deslocar o collider.
POSES.idle.Spine2 = step(q(0.008), q(0.022), q(0.008));
POSES.idle.LeftShoulder = step(q(0), q(0, 0, 0.025), q(0));
POSES.idle.RightShoulder = step(q(0), q(0, 0, -0.025), q(0));


// Ciclos com apoio alternado e tornozelos compensando o avanço das pernas.
// A rotação de braço utiliza o sentido oposto ao das pernas no bind do GLB:
// X positivo levava as mãos para trás durante a mira.
function gaitPose({ stride = 0.36, knee = 0.40, lean = 0.025, armed = false, back = false, strafe = 0 }) {
  const count = 65;
  const sign = back ? -1 : 1;
  const smooth = t => t * t * (3 - 2 * t);
  // 60% de apoio (pé no chão) e 40% de avanço (pé levantado).
  // Evita o joelho dobrado no instante em que o pé deveria suportar o peso.
  const stepAt = (t, side) => {
    const p = ((t / (Math.PI * 2) + side * 0.5) % 1 + 1) % 1;
    const stance = p < 0.6;
    const u = stance ? p / 0.6 : (p - 0.6) / 0.4;
    const travel = stance ? 1 - 2 * smooth(u) : -1 + 2 * smooth(u);
    const lift = stance ? 0 : Math.sin(u * Math.PI);
    const heel = stance ? (p < 0.14 ? (0.14 - p) / 0.14 : 0) : 0;
    return { travel, lift, heel };
  };
  const samples = fn => Array.from({ length: count }, (_, i) => fn(i * Math.PI * 2 / (count - 1)));
  const leg = (t, side) => {
    const {travel}=stepAt(t,side);
    return q(sign * stride * travel * (strafe ? 0.38 : 1), 0, -strafe * stride * travel * 0.52);
  };
  const shin = (t, side) => {
    const {lift,heel}=stepAt(t,side);
    return q(0.035 + knee * lift + heel * 0.08);
  };
  const foot = (t, side) => {
    const {travel,lift,heel}=stepAt(t,side);
    return q(-sign * stride * travel * 0.33 - knee * lift * 0.50 - heel * 0.09);
  };
  return {
    Hips: samples(t => q(lean * 0.30, -0.017 * Math.sin(t), 0.022 * Math.sin(t))),
    Spine: samples(t => q(-lean * 0.35, 0.017 * Math.sin(t), -0.014 * Math.sin(t))),
    Chest: samples(t => q(lean, -0.026 * Math.sin(t), 0.015 * Math.sin(t))),
    LeftUpLeg: samples(t => leg(t, 0)),
    RightUpLeg: samples(t => leg(t, 1)),
    LeftLeg: samples(t => shin(t, 0)),
    RightLeg: samples(t => shin(t, 1)),
    LeftFoot: samples(t => foot(t, 0)),
    RightFoot: samples(t => foot(t, 1)),
    LeftArm: samples(t => q(armed ? -0.96 + 0.012 * Math.sin(t) : -sign * stride * 0.46 * Math.sin(t))),
    RightArm: samples(t => q(armed ? -1.14 - 0.012 * Math.sin(t) : sign * stride * 0.46 * Math.sin(t))),
    ...(armed ? { LeftForeArm: samples(() => q(-0.45)), RightForeArm: samples(() => q(-0.18)) } : {}),
  };
}
POSES.walk = gaitPose({});
POSES.walkBack = gaitPose({ stride: 0.27, knee: 0.28, back: true });
POSES.run = gaitPose({ stride: 0.62, knee: 0.68, lean: 0.12 });
POSES.aimWalk = gaitPose({ stride: 0.23, knee: 0.27, armed: true });
POSES.aimBack = gaitPose({ stride: 0.19, knee: 0.25, armed: true, back: true });
POSES.aimStrafeLeft = gaitPose({ stride: 0.22, knee: 0.27, armed: true, strafe: -1 });
POSES.aimStrafeRight = gaitPose({ stride: 0.22, knee: 0.27, armed: true, strafe: 1 });
POSES.aim = {
  ...POSES.aim,
  Hips: [q(), q(0, 0, 0.005), q()],
  Spine: [q(), q(0.008), q()],
  RightArm: [q(-1.10), q(-1.16), q(-1.10)],
  LeftArm: [q(-0.92, 0, -0.12), q(-0.98, 0, -0.12), q(-0.92, 0, -0.12)],
  RightForeArm: [q(-0.18), q(-0.18), q(-0.18)],
  LeftForeArm: [q(-0.45), q(-0.45), q(-0.45)],
};
POSES.shoot = {
  RightArm: step(q(-1.14), q(-0.93), q(-1.04), q(-1.14)),
  LeftArm: step(q(-0.96), q(-0.85), q(-0.92), q(-0.96)),
  Chest: step(q(0.02), q(-0.10), q(-0.03), q(0.02)),
};
POSES.reload = {
  RightArm: step(q(-1.14), q(-0.67), q(-0.86), q(-1.14)),
  LeftArm: step(q(-0.96), q(-0.65), q(-0.85), q(-0.96)),
  LeftForeArm: step(q(-0.45), q(-0.88), q(-0.70), q(-0.45)),
  Chest: step(q(), q(0.08), q(0.06), q()),
};


/* A recarga de pistola é contínua: baixar a arma, trocar o carregador e
   recolocar a mão de apoio. A escopeta repete o gesto de inserir cartuchos. */
POSES.reloadPistol = {
  RightArm: [q(-1.14),q(-0.95),q(-0.72),q(-0.75),q(-0.92),q(-1.14)],
  LeftArm: [q(-0.96),q(-0.82),q(-0.53),q(-0.40),q(-0.77),q(-0.96)],
  LeftForeArm: [q(-0.45),q(-0.61),q(-1.10),q(-0.94),q(-0.64),q(-0.45)],
  Chest: [q(0.02),q(0.04),q(0.08),q(0.07),q(0.04),q(0.02)],
};
POSES.reloadShotgun = {
  RightArm: [q(-1.14),q(-1.02),q(-1.02),q(-1.02),q(-1.14)],
  LeftArm: [q(-0.96),q(-0.43),q(-0.58),q(-0.80),q(-0.96)],
  LeftForeArm: [q(-0.45),q(-0.80),q(-1.13),q(-0.72),q(-0.45)],
  Chest: [q(0.02),q(0.045),q(0.065),q(0.04),q(0.02)],
};
CLIP_DURATIONS.reloadPistol = 1.4;
CLIP_DURATIONS.reloadShotgun = 0.52;

function createAnimations(scene) {
  const bones = {};
  scene.traverse((node) => { if (node.isBone) bones[node.name] = node; });
  // A orientação local dos ossos depende do exportador GLB. Em vez de supor
  // que X positivo/negativo ergue a mão para a frente, medimos a posição
  // real de cada mão após um giro experimental, sempre restaurando o bind.
  const armCorrection = {};
  scene.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const arm = bones[side + 'Arm'];
    const hand = bones[side + 'Hand'] || bones[side + 'HandWeaponSocket'];
    armCorrection[side + 'Arm'] = 1;
    if (!arm || !hand) continue;
    const base = arm.quaternion.clone();
    const samples = [-0.85, 0.85].map(angle => {
      arm.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)));
      scene.updateMatrixWorld(true);
      const point = hand.getWorldPosition(new THREE.Vector3());
      return scene.worldToLocal(point).z;
    });
    arm.quaternion.copy(base);
    scene.updateMatrixWorld(true);
    // Todas as poses armadas foram autoradas com valores X negativos.
    // Se X positivo coloca a mão mais à frente, inverte apenas esse braço.
    armCorrection[side + 'Arm'] = samples[1] > samples[0] ? -1 : 1;
  }
  const armedStates = new Set(['aim','aimWalk','aimBack','aimStrafeLeft','aimStrafeRight','shoot','reload','reloadPistol','reloadShotgun']);
  const clips = {};
  for (const [state, poses] of Object.entries(POSES)) {
    const duration = CLIP_DURATIONS[state];
    const tracks = [];
    for (const [name, values] of Object.entries(poses)) {
      const bone = bones[name];
      if (!bone) continue;
      const times = values.map((_, idx) => idx * duration / (values.length - 1));
      const samples = values.flatMap(([x, y, z]) => {
        // Multiplicação relativa à pose de bind evita trocar o eixo das juntas.
        const armScale = armedStates.has(state) ? (armCorrection[name] ?? 1) : 1;
        const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x * armScale, y, z));
        return bone.quaternion.clone().multiply(offset).toArray();
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, samples));
    }
    // Passos, sem root motion para não desalinhar as colisões.
    if (bones.Hips && (['walk', 'walkBack', 'run', 'aimWalk', 'aimBack', 'aimStrafeLeft', 'aimStrafeRight', 'idle', 'dodge'].includes(state))) {
      const base = bones.Hips.position;
      const walking = ['walk', 'walkBack', 'run', 'aimWalk', 'aimBack', 'aimStrafeLeft', 'aimStrafeRight'].includes(state);
      const offsets = walking
        ? Array.from({ length: 65 }, (_, i) => (state === 'run' ? 0.024 : 0.010) * (1 - Math.cos(i * Math.PI * 4 / 64)) * 0.5)
        : state === 'dodge' ? [0, -0.14, -0.28, -0.14, 0] : [0, 0.012, 0];
      const times = offsets.map((_, idx) => idx * duration / (offsets.length - 1));
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position',times,offsets.flatMap(y=>[base.x,base.y+y,base.z])));
    }
    if (state === 'walk') {
      // Pernas do ciclo Walk_Loop de Quaternius, ajustadas ao bind da Regina.
      // A posição do quadril continua sob controle do jogo (sem root motion).
      for (const [bone, values] of Object.entries(quaterniusWalk.tracks)) {
        if (!bones[bone]) continue;
        const index = tracks.findIndex(track => track.name === `${bone}.quaternion`);
        const times = quaterniusWalk.times.map(time => time * duration / quaterniusWalk.duration);
        const track = new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values);
        if (index >= 0) tracks[index] = track; else tracks.push(track);
      }
    }
    clips[state] = new THREE.AnimationClip(`Regina_${state}`, duration, tracks);
  }
  return clips;
}

export function stateForRegina(player, flashT) {
  if (player.dead) return 'death';
  if (player.dodging) return 'dodge';
  if (player.hurtT > 0) return 'hurt';
  if (player.using) return 'use';
  if (player.reloading) return 'reload';
  if (flashT > 0) return 'shoot';
  const dir = directionForRegina(player);
  if (player.aiming || player.simShooting) {
    if (player.speed <= 0.5) return 'aim';
    return dir === 'back' ? 'aimBack' : dir === 'left' ? 'aimStrafeLeft' :
      dir === 'right' ? 'aimStrafeRight' : 'aimWalk';
  }
  if (player.sprinting && player.speed > 0.6) return 'run';
  if (player.speed > 0.5) return dir === 'back' ? 'walkBack' : 'walk';
  return 'idle';
}

export class ReginaRig {
  constructor(root) {
    this.root = root;
    this.ready = false;
    this.active = false;
    this.model = null;
    this.actions = {};
    this.lowerActions = {};
    this.baseAction = null; this.baseState = null;
    this.overlayAction = null; this.overlayState = null;
    this.state = null;
    this.flashT = 0;
    this.shotAnimT = 0;
    this.loadPromise = null;
    this.footAnchor = null;
    this.footOffset = 0;
    this.weaponSupport = { active: false, before: null, after: null };
  }

  async load() {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this._load().catch((error) => {
      this.ready = false;
      console.warn('[Regina] Não foi possível carregar o GLB otimizado; mantendo modelo original.', error);
      return false;
    });
    return this.loadPromise;
  }

  async _load() {
    // A base relativa funciona tanto no Vite quanto em GitHub Pages /Operacao-eden/.
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/characters/regina-optimized.glb`);
    const model = gltf.scene;
    model.name = 'Regina_Animated';
    model.traverse((obj) => {
      if (obj.isMesh || obj.isSkinnedMesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
        obj.frustumCulled = false; // bounds de skin deformada variam entre os clips
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height < 0.2) throw new Error('GLB sem bounding box válido');
    const scale = 1.7 / height;
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale; // sola dos pés no plano y=0
    model.rotation.y = Math.PI; // malha importada olha para +Z; gameplay usa -Z

    this.mixer = new THREE.AnimationMixer(model);
    const clips = createAnimations(model);
    for (const [name, clip] of Object.entries(clips)) {
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      action.setLoop(ONESHOT.has(name) ? THREE.LoopOnce : THREE.LoopRepeat);
      action.clampWhenFinished = ONESHOT.has(name);
      this.actions[name] = action;
      if (LOCOMOTION_STATES.has(name)) {
        // Clip de pernas: não disputa transformações dos braços com a ação superior.
        const tracks = clip.tracks.filter(t => LOWER_BONES.has(t.name.split('.')[0]));
        if (tracks.length) {
          const lowerClip = new THREE.AnimationClip('ReginaLower_' + name, clip.duration, tracks);
          const lower = this.mixer.clipAction(lowerClip);
          lower.enabled = true; lower.setLoop(THREE.LoopRepeat);
          this.lowerActions[name] = lower;
        }
      }
    }
    this.sourceClipCount = gltf.animations.length;
    const socket = model.getObjectByName('RightHandWeaponSocket') || model.getObjectByName('RightHand');
    if (socket) {
      this.weapon = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x252b30, metalness: 0.55, roughness: 0.48 });
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.32),mat);
      gun.position.z = 0.15;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.17,0.095),mat);
      grip.position.set(0,-0.11,0);
      this.weapon.add(gun,grip);
      this.magazine = new THREE.Mesh(new THREE.BoxGeometry(0.065,0.13,0.075),mat);
      this.magazine.position.set(0,-0.15,-0.005);
      this.weapon.add(this.magazine);
      this.shell = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.105,8),
        new THREE.MeshStandardMaterial({color:0xb83c25,metalness:0.3,roughness:0.5}));
      this.shell.rotation.x = Math.PI / 2;
      this.shell.visible = false;
      model.add(this.shell);
      this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.11,6,4), new THREE.MeshBasicMaterial({color:0xffdd9b,depthWrite:false}));
      this.flash.position.z=0.34;
      this.flash.visible=false;
      this.weapon.add(this.flash);
      socket.add(this.weapon);
      // O GLB olha para +Z localmente e o personagem vira 180 graus na cena.
      // Desfaz a rotação do socket da mão para apontar o cano para a frente
      // do personagem, não para trás ou para o lado.
      model.updateMatrixWorld(true);
      const socketWorld = socket.getWorldQuaternion(new THREE.Quaternion());
      const modelWorld = model.getWorldQuaternion(new THREE.Quaternion());
      this.weapon.quaternion.copy(socketWorld.invert().multiply(modelWorld));
      this.weapon.userData.forwardAxis = 'model-local +Z';
    }
    model.visible = this.active;
    this.root.add(model);
    // A altura de referência dos tornozelos é medida no bind do GLB; não
    // assumimos que o osso Foot seja exatamente a sola da bota.
    const feet = ['LeftFoot','RightFoot'].map(n=>model.getObjectByName(n)).filter(Boolean);
    model.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    this.footAnchor = feet.length === 2
      ? Math.min(...feet.map(b => this.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())).y))
      : null;
    this.footBones = feet;
    this.footOffset = 0;
    this.baseModelY = model.position.y;
    this.leftForearm = model.getObjectByName('LeftForeArm');
    this.leftHand = model.getObjectByName('LeftHand');

    this.model = model;
    this.ready = true;
    this.state = null; this.baseAction = null; this.baseState = null;
    this.overlayAction = null; this.overlayState = null;
    return true;
  }

  triggerShot() {
    this.shotAnimT = CLIP_DURATIONS.shoot;
    if (this.overlayState === 'shoot' && this.actions.shoot)
      this.actions.shoot.reset().play();
  }

  setActive(active) {
    this.active = !!active;
    if (this.model) this.model.visible = this.active;
  }

  // Corrige pequenas variações verticais do contato dos pés sem mover o
  // collider nem tentar reposicionar artificialmente cada osso do esqueleto.
  _stabilizeFeet(state, dt) {
    const moving = GAIT_STATES.has(state);
    if (this.footAnchor == null || this.footBones?.length !== 2) return;
    this.model.updateMatrixWorld(true);
    const current = Math.min(...this.footBones.map(b =>
      this.root.worldToLocal(b.getWorldPosition(new THREE.Vector3())).y));
    const shift = moving ? THREE.MathUtils.clamp(this.footAnchor - current, -0.035, 0.07) : 0;
    // Filtragem temporal impede os solavancos da correção a cada fotograma.
    this.footOffset = THREE.MathUtils.damp(this.footOffset, this.footOffset + shift, 12, Math.max(0,dt));
    this.footOffset = THREE.MathUtils.clamp(this.footOffset,-0.035,0.07);
    if (!moving) this.footOffset = THREE.MathUtils.damp(this.footOffset,0,14,Math.max(0,dt));
    this.model.position.y = this.baseModelY + this.footOffset;
  }

  // Apoio leve da mão esquerda na arma: verifica a posição real dos ossos
  // após o mixer e testa somente pequenas correções locais de antebraço.
  // Não interfere na recarga, quando a mão precisa ficar livre.
  _supportWeapon(state) {
    this.weaponSupport = {active:false,before:null,after:null};
    if (!['aim','aimWalk','aimBack','aimStrafeLeft','aimStrafeRight','shoot'].includes(state)
        || !this.weapon || !this.leftForearm || !this.leftHand) return;
    const arm = this.leftForearm;
    const start = arm.quaternion.clone();
    const target = this.weapon.localToWorld(new THREE.Vector3(-0.09,0,0.15));
    const distance = () => {
      this.model.updateMatrixWorld(true);
      return this.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
    };
    const before = distance();
    let best = before, bestQ = start;
    for (const [axis,angle] of [[0,-0.12],[0,0.12],[2,-0.12],[2,0.12]]) {
      const e = new THREE.Euler(axis===0?angle:0,0,axis===2?angle:0);
      arm.quaternion.copy(start).multiply(new THREE.Quaternion().setFromEuler(e));
      const d = distance();
      if (d < best) { best=d; bestQ=arm.quaternion.clone(); }
    }
    arm.quaternion.copy(start).slerp(bestQ,0.7);
    this.model.updateMatrixWorld(true);
    this.weaponSupport = {active:true,before,after:distance()};
  }

  sync(player,dt,flashT,opacity) {
    if (!this.ready || !this.active) return;
    this.shotAnimT = Math.max(0, this.shotAnimT - Math.max(0, dt));
    const wanted = stateForRegina(player, Math.max(flashT, this.shotAnimT));
    const upper = UPPER_ACTIONS.has(wanted);
    const full = FULL_BODY_ACTIONS.has(wanted);
    // Em um disparo/recarga, a base continua andando (ou parada) sem
    // animar ossos dos braços. O estado de combate fica numa camada separada.
    const baseWanted = full ? null : upper
      ? stateForRegina({ ...player, reloading: false, using: null, simShooting: false }, 0)
      : wanted;
    const nextBase = baseWanted
      ? (upper ? this.lowerActions[baseWanted] : null) ?? this.actions[baseWanted]
      : null;
    const nextOverlay = upper && wanted === 'reload'
      ? this.actions[player.weaponId === 'shotgun' ? 'reloadShotgun' : 'reloadPistol']
      : (upper || full) ? this.actions[wanted] : null;
    const transition = full || wanted === 'shoot' ? 0.08 : 0.16;

    if (nextBase !== this.baseAction) {
      const previous = this.baseAction;
      const phase = previous && nextBase &&
        GAIT_STATES.has(this.baseState) && GAIT_STATES.has(baseWanted)
        ? (previous.time / previous.getClip().duration) % 1 : null;
      previous?.fadeOut(transition);
      if (nextBase) {
        nextBase.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(transition).play();
        if (phase !== null) nextBase.time = phase * nextBase.getClip().duration;
      }
      this.baseAction = nextBase; this.baseState = baseWanted;
    }
    if (nextOverlay !== this.overlayAction) {
      this.overlayAction?.fadeOut(transition);
      if (nextOverlay) nextOverlay.reset().setEffectiveTimeScale(1)
        .setEffectiveWeight(1).fadeIn(transition).play();
      this.overlayAction = nextOverlay;
      this.overlayState = nextOverlay ? wanted : null;
    }
    this.state = wanted;

    if (nextBase && ['walk','walkBack','aimWalk','aimBack','aimStrafeLeft','aimStrafeRight'].includes(baseWanted))
      nextBase.setEffectiveTimeScale(Math.max(0.55, Math.min(1.45, player.speed / (baseWanted.startsWith('aim') ? 2.0 : 3.1))));
    if (nextBase && baseWanted === 'run')
      nextBase.setEffectiveTimeScale(Math.max(0.7, Math.min(1.4, player.speed / 5.4)));
    if (wanted === 'reload' && nextOverlay) {
      const w = player.weapon;
      const isShell = player.weaponId === 'shotgun';
      // Cada cartucho tem um ciclo independente; o movimento não desacelera
      // conforme o número de cartuchos faltantes.
      nextOverlay.setEffectiveTimeScale(isShell
        ? CLIP_DURATIONS.reloadShotgun / Math.max(0.2,(w?.reloadShellMs ?? 520)/1000)
        : CLIP_DURATIONS.reloadPistol / Math.max(0.25,(w?.reloadMs ?? 1400)/1000));
    }
    this.mixer.update(Math.min(Math.max(dt, 0), 0.05));
    this._stabilizeFeet(baseWanted ?? wanted, dt);
    this._supportWeapon(wanted);
    if (this.weapon) {
      const shotgun = player.weaponId === 'shotgun';
      this.weapon.scale.z = shotgun ? 2.2 : 1;
      this.flash.visible = flashT > 0;
      // Carregador desce durante a troca; cartucho aparece perto da mão de
      // apoio durante a inserção. Elementos são apenas visuais.
      const reloading = wanted === 'reload';
      const phase = nextOverlay && reloading
        ? (nextOverlay.time / nextOverlay.getClip().duration) % 1 : 0;
      this.magazine.visible = !shotgun;
      this.magazine.position.y = reloading && !shotgun
        ? -0.15 - 0.15*Math.max(0,Math.sin(phase*Math.PI)) : -0.15;
      this.shell.visible = reloading && shotgun && phase > 0.12 && phase < 0.8;
      if (this.shell.visible && this.leftHand) {
        this.model.updateMatrixWorld(true);
        const world = this.leftHand.getWorldPosition(new THREE.Vector3());
        this.shell.position.copy(this.model.worldToLocal(world));
        this.shell.position.y -= 0.035;
      }
    }
    // Mantém transparência durante a aproximação de câmera.
    if (this._opacity !== opacity) {
      this.model.traverse((obj) => {
        if (!obj.isMesh && !obj.isSkinnedMesh) return;
        if (!obj.userData.reginaMaterialCloned) {
          obj.material = Array.isArray(obj.material) ? obj.material.map(m=>m.clone()) : obj.material.clone();
          obj.userData.reginaMaterialCloned = true;
        }
        for (const m of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
          m.transparent = opacity < 0.99;
          m.opacity = opacity;
          m.depthWrite = opacity >= 0.99;
        }
      });
      this._opacity = opacity;
    }
  }
}
