import './styles/main.css';
import { Game } from './Game.js';

const game = new Game();
window.__game = game;
game.init().catch((e) => { console.error(e); });
