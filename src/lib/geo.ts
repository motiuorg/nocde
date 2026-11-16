// Build-time map geometry: Spain by autonomous community (IGN via es-atlas),
// peninsula + Balearics + Ceuta/Melilla in a conic conformal projection.
// Canarias is left out on purpose: no published project is there (re-add an inset if one appears).
import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from 'es-atlas/es/autonomous_regions.json';

export const W = 800;

// Short display names for the IGN region names.
const SHORT: Record<string, string> = {
  'Cataluña/Catalunya': 'Cataluña',
  'País Vasco/Euskadi': 'País Vasco',
  'Comunidad Foral de Navarra': 'Navarra',
  'Principado de Asturias': 'Asturias',
  'Ciudad Autónoma de Ceuta': 'Ceuta',
  'Ciudad Autónoma de Melilla': 'Melilla',
};

const all = (feature(topo as any, (topo as any).objects.autonomous_regions) as any).features.filter(
  (f: any) => !String(f.properties.name).startsWith('Gibraltar') && f.properties.name !== 'Canarias',
);
const main = all;

const mainProj = geoConicConformal().rotate([3.5, 0]).parallels([37, 43]);
const collection = { type: 'FeatureCollection', features: main } as any;
// Fit by width, then size the frame to the land so there is no empty sea at the bottom.
mainProj.fitWidth(W - 24, collection);
const [tx, ty] = mainProj.translate();
mainProj.translate([tx + 12, ty + 12]);
const [, [, by]] = geoPath(mainProj).bounds(collection);
export const H = Math.ceil(by) + 12;

export function project(lon: number, lat: number): [number, number] {
  const p = mainProj([lon, lat]);
  if (!p) throw new Error(`cannot project ${lon},${lat}`);
  return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
}

const pathFor = (proj: GeoProjection) => geoPath(proj);

export const regions = all.map((f: any) => {
  const name = SHORT[f.properties.name] ?? f.properties.name;
  return { id: f.id as string, name, d: pathFor(mainProj)(f) ?? '' };
});
