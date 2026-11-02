import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
execFileSync('npm', ['run', 'build:single'], { stdio: 'inherit' });
writeFileSync('index.html', readFileSync('dist-single/index.html', 'utf8').replace(/[ \t]+$/gm, ''));
console.log('index.html pronto para GitHub Pages.');
