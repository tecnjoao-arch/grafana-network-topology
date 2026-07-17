// scripts/package.js — Gera um zip distribuível do plugin (dist/ → zip).
// Uso: npm run package  (roda o build antes). Saída em dist-zip/.
//
// O zip contém uma pasta raiz "grafana-network-topology/" com o conteúdo do
// build — assim extrair dentro da pasta de plugins do Grafana já cria o
// diretório certo (plugins/grafana-network-topology/plugin.json).

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'dist-zip');
const PLUGIN_ID = 'grafana-network-topology';

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(path.join(DIST, 'plugin.json'))) {
  fail('dist/plugin.json não encontrado — rode "npm run build" antes.');
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `${PLUGIN_ID}-${version}.zip`);
if (fs.existsSync(outFile)) fs.rmSync(outFile);

const zip = new AdmZip();
zip.addLocalFolder(DIST, PLUGIN_ID); // conteúdo do dist sob a pasta raiz do plugin
zip.writeZip(outFile);

const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`\n✓ Pacote gerado: dist-zip/${PLUGIN_ID}-${version}.zip (${sizeKb} KB)`);
console.log('  Extraia dentro da pasta de plugins do Grafana e reinicie.\n');
