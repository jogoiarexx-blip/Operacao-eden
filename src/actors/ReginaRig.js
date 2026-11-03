import * as THREE from 'three';

// O GLB original tem 17 clips experimentais (slots 00-14, 38 e 39).
// Em vez de presumir que os slots TESTE são definitivos, usamos ações normalizadas
// de tempo fixo sobre o próprio esqueleto, preservando os 17 clips no arquivo.
const CLIP_DURATIONS = {
  idle: 1.8, walk: 0.88, walkBack: 1.02, run: 0.62, aim: 0.9, aimWalk: 0.88,
  aimBack: 1.04, aimStrafeLeft: 0.95, aimStrafeRight: 0.95,
  shoot: 0.28, reload: 1.1, use: 0.8, dodge: 0.34, hurt: 0.35, death: 0.95,
};
const ONESHOT = new Set(['shoot', 'reload', 'use', 'dodge', 'hurt', 'death']);
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

function createAnimations(scene) {
  const bones = {};
  scene.traverse((node) => { if (node.isBone) bones[node.name] = node; });
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
        const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
        return bone.quaternion.clone().multiply(offset).toArray();
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, samples));
    }
    // Passos, sem root motion para não desalinhar as colisões.
    if (bones.Hips && (['walk', 'walkBack', 'run', 'aimWalk', 'aimBack', 'aimStrafeLeft', 'aimStrafeRight', 'idle', 'dodge'].includes(state))) {
      const base = bones.Hips.position;
      const offsets = state === 'run' ? [0, 0.037, 0, 0.037, 0] :
        ['walk', 'walkBack', 'aimWalk', 'aimBack', 'aimStrafeLeft', 'aimStrafeRight'].includes(state) ? [0, 0.014, 0, 0.014, 0] :
        state === 'dodge' ? [0, -0.14, -0.28, -0.14, 0] : [0, 0.012, 0];
      const times = offsets.map((_, idx) => idx * duration / (offsets.length - 1));
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position',times,offsets.flatMap(y=>[base.x,base.y+y,base.z])));
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
    this.state = null;
    this.flashT = 0;
    this.shotAnimT = 0;
    this.loadPromise = null;
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
    }
    this.sourceClipCount = gltf.animations.length;
    const socket = model.getObjectByName('RightHandWeaponSocket') || model.getObjectByName('RightHand');
    if (socket) {
      this.weapon = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x252b30, metalness: 0.55, roughness: 0.48 });
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.10, 0.32),mat);
      gun.position.z = -0.14;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.17,0.095),mat);
      grip.position.set(0,-0.11,0);
      this.weapon.add(gun,grip);
      this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.11,6,4), new THREE.MeshBasicMaterial({color:0xffdd9b,depthWrite:false}));
      this.flash.position.z=-0.32;
      this.flash.visible=false;
      this.weapon.add(this.flash);
      socket.add(this.weapon);
    }
    model.visible = this.active;
    this.root.add(model);
    this.model = model;
    this.ready = true;
    this.state = null;
    return true;
  }

  triggerShot() {
    this.shotAnimT = CLIP_DURATIONS.shoot;
    if (this.state === 'shoot' && this.actions.shoot) this.actions.shoot.reset().play();
  }

  setActive(active) {
    this.active = !!active;
    if (this.model) this.model.visible = this.active;
  }

  sync(player,dt,flashT,opacity) {
    if (!this.ready || !this.active) return;
    this.shotAnimT = Math.max(0, this.shotAnimT - Math.max(0, dt));
    const wanted = stateForRegina(player,Math.max(flashT,this.shotAnimT));
    if (wanted !== this.state) {
      const prev = this.actions[this.state];
      const next = this.actions[wanted];
      const transition = wanted === 'shoot' || wanted === 'dodge' || wanted === 'hurt' ? 0.07 : 0.16;
      if (prev && prev !== next) prev.fadeOut(transition);
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(transition).play();
      this.state = wanted;
    }
    if (['walk','walkBack','aimWalk','aimBack','aimStrafeLeft','aimStrafeRight'].includes(wanted))
      this.actions[wanted].setEffectiveTimeScale(Math.max(0.65, Math.min(1.5, player.speed / 3.7)));
    if (wanted === 'run')
      this.actions[wanted].setEffectiveTimeScale(Math.max(0.75, Math.min(1.45, player.speed / 5.6)));
    this.mixer.update(Math.min(Math.max(dt,0), 0.05));
    if (this.weapon) {
      this.weapon.scale.z = player.weaponId === 'shotgun' ? 2.2 : 1;
      this.flash.visible = flashT > 0;
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
