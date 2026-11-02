import data01 from '../data/chapter01.json';
import script01 from './ch01.js';
import data02 from '../data/chapter02.json';
import script02 from './ch02.js';

/** Registro de capítulos: { data (JSON), script (hooks) }. */
const REG = { ch01: { data: data01, script: script01 }, ch02: { data: data02, script: script02 } };
export const CHAPTER_IDS = Object.keys(REG);
export function getChapter(id) { const c = REG[id]; if (!c) throw new Error(`Capítulo desconhecido: ${id}`); return c; }
