'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const escapeClassName=require('tailwindcss/lib/util/escapeClassName').default;
const css=fs.readFileSync('assets/practice.css','utf8');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>['node_modules','.git'].includes(entry.name)?[]:entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
let pages=0;
for(const file of walk('.').filter(file=>file.endsWith('.html'))){
 const html=fs.readFileSync(file,'utf8');
 assert(!html.includes('cdn.tailwindcss.com'),file+': runtime style compiler removed');
 assert(!html.includes('tailwind.config'),file+': theme compiled ahead of time');
 assert(!/<script\b[^>]+src=["'][^"']*(?:html2canvas|canvas-confetti)/i.test(html),file+': optional library absent from startup');
 const href=/href="([^"]*assets\/practice.css\?v=[^"]+)"/.exec(html);
 if(href){pages++;assert(fs.existsSync(path.resolve(path.dirname(file),href[1].split('?')[0])),file+': CSS file resolves');}
 if(html.includes('captureReport(')||html.includes('gamify.js')||html.includes('withConfetti(')){
  assert.equal((html.match(/src="[^\"]*optional-features.js\?v=/g)||[]).length,1,file+': one helper before interaction');
 }
 for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!script[2].trim())continue;
  if(/type=['"](?:application\/ld\+json|importmap)/.test(script[1])){JSON.parse(script[2]);continue;}
  if(/type=['"]module/.test(script[1])){
   const checked=spawnSync(process.execPath,['--check','--input-type=module'],{input:script[2],encoding:'utf8'});
   assert.equal(checked.status,0,file+': '+checked.stderr);
  }else new vm.Script(script[2],{filename:file+' inline'});
 }
}
assert.equal(pages,59,'all previously Tailwind-powered pages share the prepared stylesheet');
for(const token of ['hidden','grid','flex','md:grid-cols-2','text-5xl','bg-white/15','border-white/25','min-h-screen','text-brand','focus:ring-brand/20','animate-fade-in-up',...['blue','green','amber','red'].flatMap(c=>[`bg-${c}-50`,`border-${c}-200`])]){
 assert(css.includes('.'+escapeClassName(token)),token+': retained in compiled CSS');
}
assert(css.length<150000,'prepared CSS stays below 150 KB');
new vm.Script(fs.readFileSync('gamify.js','utf8'));
new vm.Script(fs.readFileSync('optional-features.js','utf8'));
console.log(`PASS: ${pages} shared CSS links, dynamic colours, custom theme, responsive utilities, lazy assets and inline script syntax.`);
