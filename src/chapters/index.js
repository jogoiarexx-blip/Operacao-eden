import data01 from '../data/chapter01.json';
import script01 from './ch01.js';

/** Registro de capítulos: { data (JSON), script (hooks) }. ch02 entra na Task 7. */
const REG = { ch01: { data: data01, script: script01 } };
export const CHAPTER_IDS = Object.keys(REG);
export function getChapter(id) { const c = REG[id]; if (!c) throw new Error(`Capítulo desconhecido: ${id}`); return c; }
