// Bundles src/*.js into the single self-contained ../index.html
//   node build.mjs              minified (needs `npm install` for esbuild)
//   node build.mjs --readable   plain concatenation, no dependencies
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['geom.js', 'city.js', 'shaders.js', 'audio.js', 'animals.js', 'main.js']; // order matters
const readable = process.argv.includes('--readable');

let js = FILES.map((f) => readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
const tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
const wrap = (b) => `(async()=>{${b}\n})().catch(e=>{console.error(e);document.body.className='l e';document.getElementById('s').textContent='Impossibile avviare: '+e.message});`;

let html;
if (readable) html = tpl.replace('/*SCRIPT*/', () => wrap(js));
else {
  const { transformSync } = await import('esbuild');
  // GLSL: drop comments and whitespace, keeping preprocessor lines (#version...) on lines of their own
  const minGlsl = (s) => {
    let out = '';
    for (let l of s.replace(/\/\/[^\n]*/g, '').split('\n')) {
      l = l.trim(); if (!l) continue;
      if (l[0] === '#') out += (out && !out.endsWith('\n') ? '\n' : '') + l + '\n';
      else out += l.replace(/[ \t]+/g, ' ').replace(/ ?([{}()\[\];,=+\-*\/<>&|!?:]) ?/g, '$1') + ' ';
    }
    return out.replace(/ ([{}()\[\];,=+\-*\/<>&|!?:])/g, '$1').trim();
  };
  js = js.replace(/\/\*glsl\*\/`([^`]*)`/g, (_, g) => '`' + minGlsl(g).replace(/\$\{GLSL_COMMON\}/g, '${GLSL_COMMON}') + '`');
  const code = transformSync(wrap(js), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim();
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  html = tpl.replace(/<style>([^]*?)(?=<\/style>)/, css).replace(/>\s+</g, '><').replace('/*SCRIPT*/', () => code).replace(/<script>\s+/, '<script>').replace(/\s+<\/script>/, '</script>');
}
writeFileSync(path.join(here, '..', 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} kB${readable ? ' (readable)' : ''}, ${(gzipSync(Buffer.from(html), { level: 9 }).length / 1024).toFixed(1)} kB gzipped`);

// the photorealistic version: ../modena-3d.html (CesiumJS + Google Photorealistic 3D Tiles)
{
  const tplR = readFileSync(path.join(here, 'reale', 'template.html'), 'utf8');
  const jsR = ['../src/audio.js', 'main.js'].map((f) => readFileSync(path.join(here, 'reale', f), 'utf8')).join('\n');
  const wrapR = (b) => `(async()=>{${b}\n})().catch(e=>{console.error(e);const s=document.getElementById('s');s.textContent='Impossibile avviare: '+e.message;s.className='err'});`;
  writeFileSync(path.join(here, '..', 'modena-3d.html'), tplR.replace('/*SCRIPT*/', () => wrapR(jsR)));
  console.log('modena-3d.html written');
}
