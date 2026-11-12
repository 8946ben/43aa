'use strict';
const { createEnv } = require('./harness');

const env = createEnv();
console.log('boot errors:', env.errors.length, env.errors.slice(0,3));
const X = env.game();
console.log('__XINGHUO__:', !!X);
if (!X) process.exit(1);
env.step(10);
console.log('state:', X.G.state, 't:', X.G.t.toFixed(2));
console.log('hud dust/fuel/hp:', env.el['hud-dust'].textContent, env.el['hud-fuel'].textContent, env.el['hud-hp'].textContent);
console.log('menu cards:', env.el['constel-grid'].children.length);
