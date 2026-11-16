// Build-time map geometry: Spain by autonomous community (IGN via es-atlas),
// peninsula + Balearics in a conic conformal projection, Canarias in an inset.
import { geoConicConformal, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import topo from 'es-atlas/es/autonomous_regions.json';

export const W = 800;
export const H = 620;
// Inset box for Canarias (bottom-left corner).
export const INSET = { x: 16, y: 488, w: 250, h: 116 };

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
  (f: any) => !String(f.properties.name).startsWith('Gibraltar'),
);
const canarias = all.filter((f: any) => f.properties.name === 'Canarias');
const main = all.filter((f: any) => f.properties.name !== 'Canarias');

const mainProj = geoConicConformal().rotate([3.5, 0]).parallels([37, 43]);
mainProj.fitExtent([[20, 12], [W - 12, H - 12]], { type: 'FeatureCollection', features: main } as any);

const canProj = geoConicConformal().rotate([15.8, 0]).parallels([27.5, 29.5]);
canProj.fitExtent(
  [[INSET.x + 10, INSET.y + 10], [INSET.x + INSET.w - 10, INSET.y + INSET.h - 10]],
  { type: 'FeatureCollection', features: canarias } as any,
);

const isCanarias = (lon: number, lat: number) => lat < 30.5 && lon < -12;

export function project(lon: number, lat: number): [number, number] {
  const p = (isCanarias(lon, lat) ? canProj : mainProj)([lon, lat]);
  if (!p) throw new Error(`cannot project ${lon},${lat}`);
  return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
}

const pathFor = (proj: GeoProjection) => geoPath(proj);

export const regions = all.map((f: any) => {
  const name = SHORT[f.properties.name] ?? f.properties.name;
  const proj = f.properties.name === 'Canarias' ? canProj : mainProj;
  return { id: f.id as string, name, d: pathFor(proj)(f) ?? '' };
});
