/** Estados do aplicativo (GDD 9.3 e 9.11) com tabela de transições explícita. */
export const S = Object.freeze({
  BOOT: 'BOOT', MAIN_MENU: 'MAIN_MENU', DIFFICULTY_SELECT: 'DIFFICULTY_SELECT', LOADING: 'LOADING',
  PLAYING: 'PLAYING', PAUSED: 'PAUSED', SHOP: 'SHOP', CUTSCENE: 'CUTSCENE', GAME_OVER: 'GAME_OVER',
  CHAPTER_COMPLETE: 'CHAPTER_COMPLETE', OPTIONS: 'OPTIONS', EXTRAS: 'EXTRAS', BENCHMARK: 'BENCHMARK', BENCH_RESULTS: 'BENCH_RESULTS',
});

const T = {
  BOOT: ['MAIN_MENU'],
  MAIN_MENU: ['DIFFICULTY_SELECT', 'LOADING', 'OPTIONS', 'EXTRAS'],
  DIFFICULTY_SELECT: ['LOADING', 'MAIN_MENU'],
  LOADING: ['CUTSCENE', 'PLAYING', 'BENCHMARK', 'MAIN_MENU'],
  CUTSCENE: ['PLAYING', 'CHAPTER_COMPLETE', 'MAIN_MENU'],
  PLAYING: ['PAUSED', 'SHOP', 'CUTSCENE', 'GAME_OVER', 'CHAPTER_COMPLETE'],
  PAUSED: ['PLAYING', 'MAIN_MENU', 'OPTIONS'],
  SHOP: ['PLAYING'],
  GAME_OVER: ['LOADING', 'MAIN_MENU'],
  CHAPTER_COMPLETE: ['MAIN_MENU', 'LOADING', 'PLAYING'],
  OPTIONS: ['MAIN_MENU', 'PAUSED'],
  EXTRAS: ['MAIN_MENU', 'LOADING', 'BENCHMARK'],
  BENCHMARK: ['BENCH_RESULTS', 'EXTRAS', 'MAIN_MENU'],
  BENCH_RESULTS: ['EXTRAS', 'MAIN_MENU', 'LOADING'],
};

export class StateMachine {
  constructor(initial = S.BOOT) { this.state = initial; this.prev = null; this.listeners = []; }
  can(next) { return (T[this.state] || []).includes(next); }
  go(next) {
    if (!this.can(next)) { console.warn(`[estado] transição inválida ${this.state} → ${next}`); return false; }
    this.prev = this.state; this.state = next;
    for (const fn of this.listeners) fn(next, this.prev);
    return true;
  }
  onChange(fn) { this.listeners.push(fn); }
  is(...s) { return s.includes(this.state); }
}
