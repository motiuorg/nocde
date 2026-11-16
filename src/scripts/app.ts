// Client-side behaviour: zoom/pan, filters, detail panel, table, organizations.
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { glyph, icon, fmtInt } from '../lib/shared';

type Centro = {
  id: string; slug: string; nombre: string; municipio: string; ccaa: string; operador: string | null; mw: number | null;
  estado: string; x: number; y: number; r: number; k: string; fuente: string | null; verificado: string | null;
  organizaciones: string[]; resumen: string | null; cifras: string | null; precision: 'campana' | 'municipio' | null;
};
type Org = {
  id: string; slug: string; nombre: string; tipo: string; temas: string[]; estado: string; ambito: string | null;
  web: string | null; centros: string[]; icon: string;
};
type Data = {
  lang: 'es' | 'en';
  centros: Centro[];
  organizaciones: Org[];
  clusterNames: Record<string, string>;
  i18n: {
    panel: Record<string, string>;
    table: Record<string, string>;
    values: Record<string, string>;
    showing: string;
  };
};

// Power bands (MW); band 4 = projects without a single reliable figure.
const SIZE_BANDS: [number, number][] = [[0, 20], [20, 100], [100, 300], [300, Infinity]];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function init() {
  const data: Data = JSON.parse(document.getElementById('app-data')!.textContent!);
  const { lang, centros, organizaciones, i18n } = data;
  const L = (v: string) => i18n.values[v] ?? v;
  const cById = new Map(centros.map((c) => [c.id, c]));
  const oById = new Map(organizaciones.map((o) => [o.id, o]));
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso + 'T12:00:00').toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

  // ---------- State ----------
  const state = {
    estados: new Set(centros.map((c) => c.estado)),
    ccaa: '',
    size: '',
    tema: '',
    contested: false,
    focusOrg: '' as string,
    selected: '' as string,
    sort: { key: 'mw', dir: -1 },
  };

  const matches = (c: Centro) => {
    if (state.focusOrg) return oById.get(state.focusOrg)?.centros.includes(c.id) ?? false;
    if (!state.estados.has(c.estado)) return false;
    if (state.ccaa && c.ccaa !== state.ccaa) return false;
    if (state.size !== '') {
      if (state.size === '4') {
        if (c.mw != null) return false;
      } else {
        if (c.mw == null) return false;
        const [a, b] = SIZE_BANDS[Number(state.size)];
        if (c.mw < a || c.mw >= b) return false;
      }
    }
    if (state.contested && c.organizaciones.length === 0) return false;
    if (state.tema && !c.organizaciones.some((id) => oById.get(id)?.temas.includes(state.tema))) return false;
    return true;
  };

  // ---------- Map ----------
  const svgEl = document.getElementById('map') as unknown as SVGSVGElement;
  const svg = select(svgEl);
  const layer = select('#zoom-layer');
  const markerEls = Array.from(svgEl.querySelectorAll<SVGGElement>('.mk'));
  const regionEls = Array.from(svgEl.querySelectorAll<SVGPathElement>('.region'));
  let current: ZoomTransform = zoomIdentity;

  const VB = svgEl.viewBox.baseVal;
  const cx = VB.width / 2, cy = VB.height / 2;
  const hint = document.getElementById('map-hint')!;
  let hintTimer = 0;
  const showHint = () => { hint.classList.add('is-on'); clearTimeout(hintTimer); hintTimer = window.setTimeout(() => hint.classList.remove('is-on'), 2200); };

  // Cluster pills ("Aragón · 11"): one click zooms to a crowded region while the map is zoomed out.
  const NS = 'http://www.w3.org/2000/svg';
  const clusterLayer = document.createElementNS(NS, 'g');
  clusterLayer.setAttribute('id', 'clusters');
  svgEl.appendChild(clusterLayer);
  type Cluster = { el: SVGGElement; members: Centro[]; x: number; y: number };
  const clusters: Cluster[] = [];
  const byCcaa = new Map<string, Centro[]>();
  for (const c of centros) byCcaa.set(c.ccaa, [...(byCcaa.get(c.ccaa) ?? []), c]);
  for (const [ccaa, members] of byCcaa) {
    if (members.length < 4) continue;
    const label = `${data.clusterNames[ccaa] ?? ccaa} · ${members.length}`;
    const w = label.length * 8.2 + 22;
    const g = document.createElementNS(NS, 'g') as SVGGElement;
    g.setAttribute('class', 'cluster-pill');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', label);
    g.innerHTML = `<line class="leader" x1="0" y1="0" x2="0" y2="0"/><rect x="${-w / 2}" y="-13" width="${w}" height="26" rx="13"/><text>${esc(label)}</text>`;
    clusterLayer.appendChild(g);
    const x = members.reduce((a, m) => a + m.x, 0) / members.length;
    const y = members.reduce((a, m) => a + m.y, 0) / members.length;
    const cl = { el: g, members, x, y };
    clusters.push(cl);
    const go = (e: Event) => { e.stopPropagation(); fitTo(members); };
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } });
  }

  const place = (t: ZoomTransform) => {
    current = t;
    layer.attr('transform', t.toString());
    for (const m of markerEls) {
      const x = Number(m.dataset.x), y = Number(m.dataset.y);
      m.setAttribute('transform', `translate(${t.applyX(x)},${t.applyY(y)})`);
    }
    for (const cl of clusters) {
      const px = t.applyX(cl.x), py = t.applyY(cl.y);
      const ox = 70, oy = -70; // pill sits up-right of the cluster, joined by a leader line
      cl.el.setAttribute('transform', `translate(${px + ox},${py + oy})`);
      const ln = cl.el.querySelector('line')!;
      ln.setAttribute('x2', String(-ox)); ln.setAttribute('y2', String(-oy));
      const anyOn = cl.members.some((m) => !dimmed.has(m.id));
      cl.el.classList.toggle('is-hidden', t.k > 2.2 || !anyOn);
    }
  };
  const dimmed = new Set<string>();
  const z = zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 12])
    .translateExtent([[-120, -120], [VB.width + 120, VB.height + 120]])
    // Wheel zooms only with Ctrl/⌘ (so the page can still scroll); on touch, two fingers.
    .wheelDelta((e: any) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.0015))
    .filter((e: any) => {
      if (e.type === 'wheel') {
        if (e.ctrlKey || e.metaKey) return true;
        showHint();
        return false;
      }
      if (e.type.startsWith('touch')) return (e.touches?.length ?? 0) >= 2;
      return !e.button;
    })
    .on('zoom', (e) => { place(e.transform); hideTip(); });
  svg.call(z);
  const smooth = (t: ZoomTransform) => svg.transition().duration(350).call(z.transform, t);
  const zoomBy = (f: number) => svg.transition().duration(250).call(z.scaleBy, f, [cx, cy]);
  document.getElementById('zoom-in')!.addEventListener('click', () => zoomBy(1.7));
  document.getElementById('zoom-out')!.addEventListener('click', () => zoomBy(1 / 1.7));
  document.getElementById('zoom-reset')!.addEventListener('click', () => smooth(zoomIdentity));

  // Fit the view to a set of projects (with some padding).
  const fitTo = (pts: Centro[]) => {
    if (!pts.length) return smooth(zoomIdentity);
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(8, Math.max(1, 0.62 / Math.max((x1 - x0) / VB.width, (y1 - y0) / VB.height, 0.08)));
    smooth(zoomIdentity.translate(cx - ((x0 + x1) / 2) * k, cy - ((y0 + y1) / 2) * k).scale(k));
  };

  const zoomTo = (c: Centro) => {
    const k = Math.max(current.k, 4);
    smooth(zoomIdentity.translate(cx - c.x * k, cy - c.y * k).scale(k));
  };

  // Tooltip
  const frame = document.getElementById('map-frame')!;
  const tip = document.getElementById('tooltip')!;
  const showTip = (m: SVGGElement) => {
    const c = cById.get(m.dataset.id!)!;
    const box = m.getBoundingClientRect(), fb = frame.getBoundingClientRect();
    const mw = c.mw != null ? ` · ${fmtInt(c.mw, lang)} MW` : '';
    tip.innerHTML = `<b>${esc(c.nombre)}</b>${esc(c.municipio)}${mw}<br>${esc(L(c.estado))}`;
    tip.style.left = `${box.left + box.width / 2 - fb.left}px`;
    tip.style.top = `${box.top - fb.top}px`;
    tip.classList.add('is-on');
  };
  const hideTip = () => tip.classList.remove('is-on');
  for (const m of markerEls) {
    m.addEventListener('mouseenter', () => showTip(m));
    m.addEventListener('mouseleave', hideTip);
    m.addEventListener('focus', () => showTip(m));
    m.addEventListener('blur', hideTip);
    m.addEventListener('click', (e) => { e.stopPropagation(); selectCentro(m.dataset.id!); });
    m.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCentro(m.dataset.id!); }
    });
  }

  // ---------- Panel ----------
  const panel = document.getElementById('panel')!;
  const P = i18n.panel;
  const renderPanel = () => {
    const c = cById.get(state.selected);
    if (!c) {
      panel.className = 'panel is-empty';
      panel.innerHTML = `<p>${esc(P.empty)}</p>`;
      return;
    }
    const orgs = c.organizaciones.map((id) => oById.get(id)).filter(Boolean) as Org[];
    const orgHtml = orgs.length
      ? `<ul class="res">${orgs
          .map((o) => {
            const u = safeUrl(o.web);
            return `<li><span class="rico">${icon(o.icon, 20)}</span><div><b>${esc(o.nombre)}</b><span class="meta">${esc(L(o.tipo))} · ${esc(L(o.ambito ?? ''))} · ${esc(L(o.estado))}</span><div class="chips">${o.temas.map((t) => `<span class="chip">${esc(L(t))}</span>`).join('')}</div>${u ? `<a class="src" href="${esc(u)}" rel="noopener" target="_blank">${esc(P.orgLink)} ↗</a>` : ''}</div></li>`;
          })
          .join('')}</ul>`
      : `<p class="none">${esc(P.noOrgs)}</p><p>${esc(P.noOrgsNote)} <a href="#colabora">${esc(P.noOrgsCta)}</a></p>`;
    const fu = safeUrl(c.fuente);
    const loc = c.precision === 'campana' ? P.locCampana : c.precision === 'municipio' ? P.locMunicipio : '';
    panel.className = 'panel';
    panel.innerHTML = `
      <button type="button" class="close" aria-label="${esc(P.close)}">✕</button>
      <span class="badge">${glyph(c.k, orgs.length > 0)}${esc(L(c.estado))}</span>
      <h3>${esc(c.nombre)}</h3>
      <p class="where">${esc(c.municipio)}, ${esc(L(c.ccaa))}</p>
      ${c.mw != null
        ? `<div class="mw-big">${fmtInt(c.mw, lang)}<small>MW · ${esc(P.mw)}</small></div>`
        : `<p class="no-mw-note">${esc(P.noMw)}</p>`}
      ${c.resumen ? `<p class="resumen">${esc(c.resumen)}</p>` : ''}
      ${c.cifras ? `<details class="cifras"><summary>${esc(P.cifras)}</summary><p>${esc(c.cifras)}</p><p class="note">${esc(P.cifrasNote)}</p></details>` : ''}
      <dl>
        ${c.operador ? `<dt>${esc(P.operador)}</dt><dd>${esc(c.operador)}</dd>` : ''}
        ${loc ? `<dt>${esc(P.ubicacion)}</dt><dd>${esc(loc)}</dd>` : ''}
        <dt>${esc(P.verificado)}</dt><dd>${fmtDate(c.verificado)}</dd>
        <dt>${esc(P.fuente)}</dt><dd>${fu ? `<a href="${esc(fu)}" rel="noopener" target="_blank">${esc(P.fuenteLink)} ↗</a>` : '—'}</dd>
      </dl>
      <h4>${esc(P.orgs)} (${orgs.length})</h4>
      ${orgHtml}`;
    panel.querySelector('.close')!.addEventListener('click', () => selectCentro(''));
  };

  const selectCentro = (id: string, opts: { zoom?: boolean; scroll?: boolean } = {}) => {
    state.selected = id;
    for (const m of markerEls) m.classList.toggle('is-selected', m.dataset.id === id);
    for (const tr of tbody.querySelectorAll('tr')) tr.classList.toggle('is-selected', tr.dataset.id === id);
    renderPanel();
    const c = cById.get(id);
    if (c) {
      history.replaceState(null, '', `#c-${c.slug}`);
      if (opts.zoom) zoomTo(c);
      if (opts.scroll) frame.scrollIntoView({ block: 'center' });
    } else if (location.hash.startsWith('#c-')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  };
  svgEl.addEventListener('click', () => state.selected && selectCentro(''));

  // ---------- Table ----------
  const tbody = document.getElementById('tbody')!;
  const tableEmpty = document.getElementById('table-empty')!;
  const T = i18n.table;
  const sortVal = (c: Centro, key: string): string | number => {
    switch (key) {
      case 'mw': return c.mw ?? 0;
      case 'oposicion': return c.organizaciones.length;
      case 'estado': return L(c.estado);
      case 'ccaa': return L(c.ccaa);
      default: return String((c as any)[key] ?? '');
    }
  };
  const renderTable = (rows: Centro[]) => {
    const { key, dir } = state.sort;
    const sorted = [...rows].sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key);
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), lang);
      return r * dir || a.nombre.localeCompare(b.nombre, lang);
    });
    tbody.innerHTML = sorted
      .map((c) => {
        const n = c.organizaciones.length;
        return `<tr data-id="${c.id}" tabindex="0"${c.id === state.selected ? ' class="is-selected"' : ''}>
          <td class="name" data-label="${esc(T.nombre)}">${esc(c.nombre)}</td>
          <td data-label="${esc(T.municipio)}">${esc(c.municipio)}</td>
          <td data-label="${esc(T.ccaa)}">${esc(L(c.ccaa))}</td>
          <td data-label="${esc(T.operador)}" class="op-cell">${esc(c.operador ?? '—')}</td>
          <td class="num" data-label="${esc(T.mw)}">${c.mw != null ? fmtInt(c.mw, lang) : '—'}</td>
          <td data-label="${esc(T.estado)}"><span class="badge">${glyph(c.k)}${esc(L(c.estado))}</span></td>
          <td data-label="${esc(T.oposicion)}"><span class="opp${n ? '' : ' is-zero'}">${n ? icon('campaign', 14) : ''}${n}</span></td>
        </tr>`;
      })
      .join('');
    tableEmpty.hidden = sorted.length > 0;
  };
  tbody.addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest('tr');
    if (tr) selectCentro(tr.dataset.id!, { zoom: true, scroll: true });
  });
  tbody.addEventListener('keydown', (e) => {
    const tr = (e.target as HTMLElement).closest('tr');
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectCentro(tr.dataset.id!, { zoom: true, scroll: true }); }
  });
  for (const th of document.querySelectorAll<HTMLTableCellElement>('#table th[data-sort]')) {
    th.querySelector('button')!.addEventListener('click', () => {
      const key = th.dataset.sort!;
      state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : key === 'mw' || key === 'oposicion' ? -1 : 1 };
      for (const o of document.querySelectorAll('#table th[data-sort]')) o.setAttribute('aria-sort', 'none');
      th.setAttribute('aria-sort', state.sort.dir === 1 ? 'ascending' : 'descending');
      update();
    });
  }

  // ---------- Filters ----------
  const form = document.getElementById('filters') as HTMLFormElement;
  const count = document.getElementById('count')!;
  const focusBar = document.getElementById('org-focus')!;
  const readForm = () => {
    state.estados = new Set(Array.from(form.querySelectorAll<HTMLInputElement>('input[name=estado]:checked')).map((i) => i.value));
    state.ccaa = (form.elements.namedItem('ccaa') as HTMLSelectElement).value;
    state.size = (form.elements.namedItem('size') as HTMLSelectElement).value;
    state.tema = (form.elements.namedItem('tema') as HTMLSelectElement).value;
    state.contested = (form.elements.namedItem('contested') as HTMLInputElement).checked;
  };
  form.addEventListener('change', () => { readForm(); state.focusOrg = ''; update(); });
  document.getElementById('f-reset')!.addEventListener('click', () => {
    form.reset();
    readForm();
    state.focusOrg = '';
    update();
  });
  document.getElementById('org-focus-clear')!.addEventListener('click', () => { state.focusOrg = ''; update(); });

  let lastCcaa = '';
  const update = () => {
    const visible = centros.filter(matches);
    const ids = new Set(visible.map((c) => c.id));
    dimmed.clear();
    for (const m of markerEls) {
      const on = ids.has(m.dataset.id!);
      m.classList.toggle('is-dim', !on);
      m.setAttribute('tabindex', on ? '0' : '-1');
      if (!on) dimmed.add(m.dataset.id!);
    }
    place(current);
    // Picking a region zooms to it; clearing it zooms back out.
    if (state.ccaa !== lastCcaa) {
      lastCcaa = state.ccaa;
      if (lastCcaa) fitTo(centros.filter((c) => c.ccaa === lastCcaa));
      else if (current.k !== 1) smooth(zoomIdentity);
    }
    for (const r of regionEls) r.classList.toggle('is-active', !!state.ccaa && r.dataset.name === state.ccaa);
    const label = i18n.showing.replace('{n}', String(visible.length)).replace('{total}', String(centros.length));
    document.getElementById('count-sum')!.textContent = label;
    count.textContent = label;
    const fo = oById.get(state.focusOrg);
    focusBar.classList.toggle('is-on', !!fo);
    document.getElementById('org-focus-name')!.textContent = fo?.nombre ?? '';
    form.classList.toggle('is-locked', !!fo);
    renderTable(visible);
  };

  // ---------- Organizations ----------
  const temaButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#tema-filter button'));
  const orgCards = Array.from(document.querySelectorAll<HTMLElement>('#orgs .org'));
  for (const b of temaButtons) {
    b.addEventListener('click', () => {
      const tm = b.dataset.tema!;
      for (const o of temaButtons) o.setAttribute('aria-pressed', String(o === b));
      for (const card of orgCards) card.classList.toggle('is-hidden', !!tm && !card.dataset.temas!.split('|').includes(tm));
    });
  }
  document.getElementById('orgs')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-show-org]');
    if (!btn) return;
    state.focusOrg = btn.dataset.showOrg!;
    update();
    const o = oById.get(state.focusOrg)!;
    const pts = o.centros.map((id) => cById.get(id)!).filter(Boolean);
    const first = [...pts].sort((a, b) => (b.mw ?? 0) - (a.mw ?? 0))[0];
    if (first) selectCentro(first.id);
    // Fit the linked centers.
    fitTo(pts);
    frame.scrollIntoView({ block: 'center' });
  });

  // ---------- Prototype forms (they do not send anything) ----------
  for (const f of document.querySelectorAll<HTMLFormElement>('.mock-form')) {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      f.querySelector('.mock-msg')!.textContent = i18n.panel.mock;
    });
  }

  // ---------- Init ----------
  if (window.matchMedia('(max-width: 700px)').matches) document.getElementById('filters-box')!.removeAttribute('open');
  update();
  const openFromHash = () => {
    const m = location.hash.match(/^#c-(.+)$/);
    if (!m) return;
    const c = centros.find((x) => x.slug === decodeURIComponent(m[1]));
    if (c && c.id !== state.selected) selectCentro(c.id, { zoom: true });
  };
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}
