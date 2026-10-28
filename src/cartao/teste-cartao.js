// cartao/teste-cartao.js — confere que a copia do cartao funciona neste projeto.
//
//   node src/cartao/teste-cartao.js
//
// So as contas (utils): o leitor das series do Zabbix, achar o link de uma
// ponta, o resumo do grafico e a busca das janelas longas. Os componentes
// React sao conferidos pelo typecheck e pelo build do plugin.
//
// Precisa do pacote `typescript` (transpila os .ts na hora). Este arquivo vem
// do repositorio de origem junto com a pasta — nao precisa editar.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const AQUI = __dirname;

// O datasource falso registra cada pedido e devolve `resposta`.
let pedidos = [];
let resposta = null;
const STUB = {
  '@grafana/data': {
    FieldType: { number: 'number', string: 'string', time: 'time', other: 'other' },
    dateTime: (ms) => ({ valueOf: () => ms }),
  },
  '@grafana/runtime': {
    getDataSourceSrv: () => ({ get: async () => ({ query: (req) => { pedidos.push(req); return resposta; } }) }),
  },
};

const cache = new Map();
function carrega(rel) {
  const chave = path.posix.normalize(rel);
  if (cache.has(chave)) return cache.get(chave);
  const arquivo = path.join(AQUI, chave);
  const { outputText } = ts.transpileModule(fs.readFileSync(arquivo, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: arquivo,
  });
  const mod = { exports: {} };
  cache.set(chave, mod.exports);
  const req = (id) => {
    if (STUB[id]) return STUB[id];
    if (id.startsWith('.')) return carrega(path.posix.join(path.posix.dirname(chave), id) + '.ts');
    return require(id);
  };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, req);
  cache.set(chave, mod.exports);
  return mod.exports;
}

let falhas = 0;
const ok = (cond, msg, extra) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${msg}`);
  if (!cond && extra) console.log('        ' + extra);
};

const D = carrega('utils/dados.ts');
const S = carrega('utils/serie.ts');
const H = carrega('utils/historico.ts');

console.log('\nLEITOR DAS SERIES DO ZABBIX\n');
const T0 = Date.UTC(2026, 9, 5, 12, 0);
const MIN = 60000;
const frame = (nome, vs) => ({
  name: nome,
  fields: [
    { name: 'time', type: 'time', values: vs.map((_, i) => T0 + i * MIN), config: {} },
    { name: nome, type: 'number', values: vs, config: { displayNameFromDS: nome } },
  ],
});
const P = 'ROUTER-01: Interface GigabitEthernet0/0/0/1(INST:EXEMPLO|Anel:NORTE)';
const frames = [
  frame(`${P}: Bits received`, [10e6, 20e6, 30e6]),
  frame(`${P}: Bits sent`, [1e6, 2e6, 3e6]),
  frame(`${P}: Operational status`, [1, 1, 1]),
  frame(`${P}: Speed`, [1e9, 1e9, 1e9]),
  frame('ROUTER-01: GigabitEthernet0/0/0/1 [EXEMPLO] - Rx Power MIN (dBm)', [-5.1, -5.0, -5.2]),
];
const links = D.extrairLinks(frames);
const l = links[0];
ok(links.length === 1 && l.host === 'ROUTER-01' && l.iface === 'GigabitEthernet0/0/0/1', 'uma interface, lida do nome da serie');
ok(l.rx === 30e6 && l.tx === 3e6 && l.estado === 'up' && l.speed === 1e9, 'trafego, status e capacidade: o ultimo valor de cada');
ok(l.historico && l.historico.rx.v.length === 3, 'historico de RX/TX pro grafico');
ok(l.optica && l.optica.rx && l.optica.rx.power === -5.2, 'potencia optica casada com a mesma interface');
ok(Math.abs(D.usoPct(l) - 3) < 1e-9, 'uso: 3% de 1 Gb/s');

console.log('\nACHAR O LINK DE UMA PONTA\n');
ok(D.acharLink(links, { serie: `${P}: Bits received` }) === l, 'pela serie do binding');
ok(D.acharLink(links, { host: 'ROUTER-01', iface: 'Gi0/0/0/1' }) === l, 'por host + interface abreviada');
ok(D.acharLink(links, { host: 'ROUTER-02', iface: 'Gi0/0/0/1' }) === undefined, 'outro host nao casa');

console.log('\nRESUMO DO GRAFICO\n');
const r = S.resumo(l.historico.rx);
ok(r.ultimo === 30e6 && r.media === 20e6 && r.maximo === 30e6, 'Atual / Media / Max');
ok(S.fmtAmostragem(S.amostragemDe(l.historico.rx)) === '1 minuto', 'amostragem de 1 minuto');

async function testaBusca() {
  console.log('\nBUSCA DAS JANELAS LONGAS\n');
  const molde = { refId: 'A', datasource: { uid: 'zbx' }, group: { filter: 'G' }, host: { filter: '/.*/' },
    item: { filter: '/^Interface .*$/' } };
  resposta = { data: frames.slice(0, 2) };
  pedidos = [];
  const h = await H.buscarHistorico({ targets: [molde] }, l, { horas: 168 }, T0 + 2 * MIN);
  ok(pedidos.length === 2, 'dois pedidos: media e pico');
  const pico = pedidos.find((p) => p.targets[0].refId === 'HISTORICO_PICO');
  ok(pico && pico.targets[0].functions.some((f) => f.def.name === 'consolidateBy' && f.params[0] === 'max'),
    'o do pico pede consolidateBy(max)');
  ok(pedidos[0].targets[0].host.filter === '/^ROUTER-01$/', 'so o host do link');
  ok(h.rx && h.rx.v.length === 3, 'a resposta vira a serie do grafico');
}

testaBusca()
  .catch((e) => ok(false, 'a busca estourou', e && e.stack))
  .then(() => {
    console.log(falhas === 0 ? '\nTudo passou.\n' : `\n${falhas} FALHA(S).\n`);
    process.exit(falhas === 0 ? 0 : 1);
  });
