'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('assets/local-resources.json','utf8'));
for(const entry of manifest.resources){
 const data=fs.readFileSync(entry.file);
 assert.equal(data.length,entry.bytes,entry.file+': original size retained');
 assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256,entry.file+': original bytes retained');
 if(entry.file.endsWith('.woff2'))assert.equal(data.subarray(0,4).toString(),'wOF2');
}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>['.git','node_modules'].includes(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let libraries=0,fonts=0;
for(const file of walk('.').filter(p=>p.endsWith('.html'))){
 const html=fs.readFileSync(file,'utf8');
 assert(!html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js'),file+': no external Supabase library');
 assert(!/fonts.googleapis.com[^'"\s)]*Nunito/.test(html),file+': no external Nunito stylesheet');
 for(const match of html.matchAll(/(?:src|href)="([^"\s]*(?:assets\/vendor\/supabase-js-|assets\/fonts\/nunito)[^"]*)"/g)){
  const target=path.resolve(path.dirname(file),match[1].split('?')[0]);assert(fs.existsSync(target),file+': local asset exists');
  if(match[1].includes('/vendor/'))libraries++;else fonts++;
 }
}
assert(libraries>=50 && fonts>=40,'main pages use shared assets');
assert(fs.readFileSync('taught-formula-practice.html','utf8').includes('supabase-js-2.49.8.js'),'older explicitly pinned library is preserved');
for(const [file,weights] of [['nunito.css',[400,600,700,800]],['nunito-900.css',[400,600,700,800,900]]]){
 const css=fs.readFileSync('assets/fonts/'+file,'utf8');
 assert(!css.includes('https://'),'font files are local');
 assert(css.includes('font-display: swap'),'text can render before font download');
 assert.deepEqual([...new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map(m=>Number(m[1])))],weights);
 for(const match of css.matchAll(/url\(([^)]+)\)/g))assert(fs.existsSync(path.join('assets/fonts',match[1])));
}
assert(fs.readFileSync('assets/vendor/SUPABASE-LICENSE.txt','utf8').startsWith('MIT License'));
assert(fs.readFileSync('assets/fonts/NUNITO-OFL.txt','utf8').includes('SIL Open Font License'));
console.log(`PASS: checksums, licenses, ${libraries} local SDK references, ${fonts} font links, valid paths and original font weights.`);
