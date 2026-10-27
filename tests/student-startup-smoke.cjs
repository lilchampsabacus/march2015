'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = file => fs.readFileSync(file, 'utf8');
const login = read('login.html');
const dashboard = read('practice_options.html');
const access = read('level-access.js');
const daily = read('daily-practice.js');
const loader = read('level-page-loader.js');
const homepage = read('index.html');

for (const file of ['level-access.js','daily-practice.js','plus-minus-access.js','level-page-loader.js','daily-card.js','class-updates.js','low-level-access.js']) {
  new vm.Script(read(file), {filename:file});
}
for (const [filename, html] of [['login.html',login],['practice_options.html',dashboard],['daily-practice.html',read('daily-practice.html')]]) {
  const scripts = html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    if (script[1].trim()) new vm.Script(script[1], {filename:filename+' inline'});
  }
}
assert(!dashboard.includes('level-page-loader.js'), 'dashboard should have no second HTML fetch');
assert(!dashboard.includes('document.write('), 'dashboard should not re-render document');
assert(dashboard.includes('role="status"') && dashboard.includes('practice-startup'), 'loading indicator must exist');
assert(dashboard.includes('levelAccessHide'), 'student options should be hidden until authorized');
assert(dashboard.includes('class-updates.js?v=20261027-speed2'), 'class updates retained');
assert(!dashboard.includes('report-access.js') && !dashboard.includes('low-level-access.js'), 'duplicate profile checks removed');
assert(dashboard.includes('id="formulaReportDefaultHide"'), 'formula access starts hidden');
assert(dashboard.includes('id="formulaPracticeDefaultHide"'), 'formula practice access starts hidden');
assert(dashboard.includes('data-page="practice-options"'), 'access script identifies page');
assert(dashboard.includes('href="daily-practice.html') === false, 'daily card continues as independent script');
assert(access.includes('Promise.all(['), 'profile/settings fetched concurrently');
assert(access.includes("if (level <= 2)"), 'Level 1/2 formula links retained');
assert(access.includes("if (level === 1)"), 'Level 1 restricted reports retained');
assert(access.includes("profile.role === 'student'"), 'student protection retained');
assert(access.includes("practice-dashboard-ready"), 'class-updates event emitted after authorized reveal');
assert(login.includes("window.location.replace('practice_options.html')"), 'login no longer waits one second');
assert(!login.includes("setTimeout(()=>window.location.href='practice_options.html',1000)"), 'old delay removed');
assert(loader.includes("cache: 'default'"), 'versioned practice templates can be cached');
assert(!loader.includes("cache: 'no-store'"), 'no forced network refresh');
assert(homepage.includes('lil-champs-logo-600.webp'), 'optimized homepage logo untouched');

const start = daily.indexOf('function randInt(');
const stop = daily.indexOf('function correctAnswer(');
assert(start > 0 && stop > start, 'pure daily generator should exist');
const gen = vm.runInNewContext(daily.slice(start,stop) + '\n({generateDailyQuestions})');
function formats(q) { return Array.from(new Set(q.map(x=>x.label))).sort().join(','); }
const seven = gen.generateDailyQuestions({plusminus:7,multiplication:7,division:7},8);
const mixed = gen.generateDailyQuestions({plusminus:7,multiplication:8,division:7},8);
assert.equal(seven.plusminus.length,10);
assert.equal(seven.multiplication.length,10);
assert.equal(seven.division.length,10);
assert.equal(formats(seven.multiplication),'2×2,3×2');
assert.equal(formats(seven.division),'4÷2,5÷2');
assert.equal(formats(mixed.multiplication),'3×2,4×2');
assert.equal(formats(mixed.division),'4÷2,5÷2');
assert.equal(seven._practice_levels.multiplication,7);
assert(daily.includes('Promise.all(['), 'student profile and assignment loaded together');
console.log('PASS: static page loading, authorization safeguards, JS syntax, Daily Practice patterns and cache rules.');
