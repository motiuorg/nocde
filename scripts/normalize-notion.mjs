// Turn the raw Notion exports (data/raw/*.json, "rows" mode query results) into
// the static snapshot the site reads (src/data/*.json).
//
// Only records marked "Confirmado" and not fictitious are published. Records
// marked "Por verificar" stay in Notion and are never written to src/data.
// Relations are kept only when both sides are published.
//
// Usage: node scripts/normalize-notion.mjs   (or: npm run data)
// Raw exports live in data/raw/ (git-ignored: they include unverified records).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (name) => JSON.parse(readFileSync(join(root, 'data/raw', `${name}.json`), 'utf8'));

const ESTADOS = ['En funcionamiento', 'En construcción', 'Propuesto o planificado', 'Cancelado', 'Desconocido'];
const TIPOS = ['Organización', 'Campaña o iniciativa', 'Plataforma vecinal', 'Otro'];
const ESTADOS_ORG = ['Activa', 'Concluida', 'Por verificar'];
const TEMAS = ['Agua', 'Energía', 'Territorio y suelo', 'Impacto ambiental', 'Participación y transparencia', 'Acción legal'];
const PRECISION = {
  'Aproximada (mapa de la campaña)': 'campana',
  'Municipio (no es la parcela)': 'municipio',
};

const errors = [];
const fail = (msg) => errors.push(msg);

const idFromUrl = (url) => (String(url).match(/([0-9a-f]{32})/) || [])[1];
const parseList = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : JSON.parse(v));
// Notion auto-links bare domains inside text ("[eldiario.es](http://eldiario.es)"): keep the label.
const clean = (s) => (s == null ? null : String(s).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim() || null);
// Drop working notes written for the editors of the database; they are not public copy.
const internalNotesOut = (s) =>
  s == null
    ? null
    : s
        .replace(/[;,]?\s*no se rellena el campo num[eé]rico\.?/gi, '.')
        .replace(/\s*Contradicción sin resolver\.?/gi, ' Las cifras se contradicen.')
        .replace(/\.{2,}/g, '.')
        .replace(/\s+\./g, '.')
        .trim() || null;
const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const uniqueSlug = (base, used) => {
  let s = base, i = 2;
  while (used.has(s)) s = `${base}-${i++}`;
  used.add(s);
  return s;
};

const rawCentros = raw('centros');
const rawOrgs = raw('organizaciones');
if (rawCentros.has_more || rawOrgs.has_more) fail('Export is paginated (has_more=true): fetch every page before normalizing.');

const isPublic = (r) => r['Verificación'] === 'Confirmado' && r['Dato ficticio'] !== '__YES__';

const usedC = new Set();
const allCentros = rawCentros.results.map((r) => {
  const nombre = r['Centro o proyecto'];
  return {
    pub: isPublic(r),
    id: idFromUrl(r.url),
    slug: uniqueSlug(slugify(nombre.replace(/\s*[—–-]\s*/g, ' ')), usedC),
    nombre,
    municipio: r['Municipio'] ?? null,
    ccaa: r['Comunidad autónoma'] ?? null,
    operador: clean(r['Operador o promotor']),
    mw: typeof r['Potencia (MW)'] === 'number' ? r['Potencia (MW)'] : null,
    estado: r['Estado del proyecto'] ?? 'Desconocido',
    lat: r['place:Ubicación:latitude'],
    lon: r['place:Ubicación:longitude'],
    precision: PRECISION[r['Precisión de la ubicación']] ?? null,
    fuente: r['Fuente principal'] ?? null,
    verificado: r['date:Última verificación:start'] ?? null,
    resumen: clean(r['Resumen']),
    cifras: internalNotesOut(clean(r['Cifras de potencia según las fuentes'])),
    organizaciones: parseList(r['Organizaciones e iniciativas vinculadas']).map(idFromUrl),
  };
});

const usedO = new Set();
const allOrgs = rawOrgs.results.map((r) => {
  const nombre = r['Nombre'];
  return {
    pub: isPublic(r),
    id: idFromUrl(r.url),
    slug: uniqueSlug(slugify(nombre), usedO),
    nombre,
    tipo: r['Tipo'] ?? 'Otro',
    temas: parseList(r['Temas']),
    estado: r['Estado de la iniciativa'] ?? 'Por verificar',
    ambito: r['Ámbito territorial'] ?? null,
    web: r['Web o fuente principal'] ?? null,
    verificado: r['date:Última verificación:start'] ?? null,
    resumen: clean(r['Resumen']),
    centros: parseList(r['Centros y proyectos vinculados']).map(idFromUrl),
  };
});

// Validate everything (published or not), so problems in pending records show up too.
for (const c of allCentros) {
  if (!c.id) fail(`centro sin id: ${c.nombre}`);
  if (!ESTADOS.includes(c.estado)) fail(`estado desconocido "${c.estado}" en ${c.nombre}`);
  if (c.pub) {
    if (typeof c.lat !== 'number' || typeof c.lon !== 'number') fail(`centro publicado sin coordenadas: ${c.nombre}`);
    if (!c.precision) fail(`centro publicado sin precisión de ubicación: ${c.nombre}`);
    if (!c.resumen) fail(`centro publicado sin resumen: ${c.nombre}`);
    if (!c.ccaa) fail(`centro publicado sin comunidad autónoma: ${c.nombre}`);
  }
}
for (const o of allOrgs) {
  if (!o.id) fail(`organización sin id: ${o.nombre}`);
  if (!TIPOS.includes(o.tipo)) fail(`tipo desconocido "${o.tipo}" en ${o.nombre}`);
  if (!ESTADOS_ORG.includes(o.estado)) fail(`estado desconocido "${o.estado}" en ${o.nombre}`);
  for (const t of o.temas) if (!TEMAS.includes(t)) fail(`tema desconocido "${t}" en ${o.nombre}`);
  if (o.pub && !o.resumen) fail(`organización publicada sin resumen: ${o.nombre}`);
}

// Relations: both sides must exist and agree (checked on the full set).
const cById = new Map(allCentros.map((c) => [c.id, c]));
const oById = new Map(allOrgs.map((o) => [o.id, o]));
for (const c of allCentros)
  for (const oid of c.organizaciones) {
    const o = oById.get(oid);
    if (!o) fail(`relación colgante: ${c.nombre} → ${oid}`);
    else if (!o.centros.includes(c.id)) fail(`relación asimétrica: ${c.nombre} ↔ ${o.nombre}`);
  }
for (const o of allOrgs) for (const cid of o.centros) if (!cById.has(cid)) fail(`relación colgante: ${o.nombre} → ${cid}`);

if (errors.length) {
  console.error(`✗ ${errors.length} error(es):\n  - ` + errors.join('\n  - '));
  process.exit(1);
}

// Publish: confirmed only, relations restricted to published counterparts.
const pubC = new Set(allCentros.filter((c) => c.pub).map((c) => c.id));
const pubO = new Set(allOrgs.filter((o) => o.pub).map((o) => o.id));
const strip = ({ pub, ...rest }) => rest;
const centros = allCentros
  .filter((c) => c.pub)
  .map((c) => strip({ ...c, organizaciones: c.organizaciones.filter((id) => pubO.has(id)) }));
const organizaciones = allOrgs
  .filter((o) => o.pub)
  .map((o) => strip({ ...o, centros: o.centros.filter((id) => pubC.has(id)) }));

centros.sort((a, b) => (b.mw ?? 0) - (a.mw ?? 0) || a.nombre.localeCompare(b.nombre, 'es'));
organizaciones.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

const meta = {
  exportedAt: rawCentros.exportedAt,
  counts: {
    centros: centros.length,
    organizaciones: organizaciones.length,
    centrosPendientes: allCentros.length - centros.length,
    organizacionesPendientes: allOrgs.length - organizaciones.length,
  },
};

const out = join(root, 'src/data');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'centros.json'), JSON.stringify(centros, null, 1) + '\n');
writeFileSync(join(out, 'organizaciones.json'), JSON.stringify(organizaciones, null, 1) + '\n');
writeFileSync(join(out, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');

const contested = centros.filter((c) => c.organizaciones.length).length;
console.log(
  `✓ publicados: ${centros.length} proyectos (${contested} con resistencia documentada) y ${organizaciones.length} organizaciones; ` +
    `en verificación (no publicados): ${meta.counts.centrosPendientes} proyectos, ${meta.counts.organizacionesPendientes} organizaciones`,
);
