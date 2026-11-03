import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getChapter } from '../src/chapters/index.js';

describe('Plataforma da Selva Norte após retorno e retry', () => {
  it('restaura as tábuas intactas se o checkpoint antecede a queda', () => {
    const { data, script } = getChapter('ch01');
    const scenery = { group: new THREE.Group(), meshes: new Map() };
    const props = script.buildProps({ scene: new THREE.Scene(), data, scenery, world: {} });
    const p = props.planks[4];
    expect(p.position.y).toBeCloseTo(0.02);
    props.startCollapse();
    props.update(1);
    expect(p.position.y).toBeLessThan(-0.3);
    props.restoreBridge(false);
    expect(p.position.y).toBeCloseTo(0.02);
    expect(p.rotation.z).toBeCloseTo(0);
    expect(p.rotation.x).toBeCloseTo(0);
    props.update(1);
    expect(p.position.y).toBeCloseTo(0.02);
    props.restoreBridge(true);
    expect(p.position.y).toBeLessThan(-0.3);
    props.restoreBridge(false);
    expect(p.position.y).toBeCloseTo(0.02);
    props.dispose();
  });
});
