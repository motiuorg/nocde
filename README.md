# Mapa de centros de datos y resistencias en España

Prototipo de [Motiu](https://motiu.org): un mapa que reúne, con enlaces a sus fuentes, los proyectos de centros de datos en España y las organizaciones vecinales y ecologistas que se movilizan frente a ellos. Sitio estático hecho con [Astro](https://astro.build), en español (`/`) e inglés (`/en/`).

> **Es un prototipo.** No existía un agregador de este tipo en España, pero sí mucho trabajo previo. Casi todo lo que aparece aquí lo han investigado, documentado y mapeado antes otras personas; este proyecto solo lo reúne y lo enlaza. Véase [Reconocimientos](#reconocimientos).

## Cómo funciona

```
Notion (2 bases de datos) ──exportación──▶ data/raw/*.json ──npm run data──▶ src/data/*.json ──npm run build──▶ dist/
```

- **Fuente de verdad:** dos bases de datos de Notion de Motiu, «Centros de datos» y «Organizaciones e iniciativas», enlazadas por una relación bidireccional.
- **Solo se publica lo confirmado.** Cada registro tiene un campo `Verificación`:
  - **Confirmado:** la existencia, el municipio, el promotor y el estado están respaldados por una fuente oficial o por al menos dos fuentes independientes sin contradicción de estado. Es lo único que llega a la web.
  - **Por verificar:** se queda en Notion hasta que se investigue más. Nunca se escribe en `src/data`.
- **Exportación:** `data/raw/` contiene la exportación completa de Notion, incluidos los registros por verificar, por eso está en `.gitignore`. `scripts/normalize-notion.mjs` la valida y escribe en `src/data/` solo los confirmados, que sí se versionan. Falla ante coordenadas ausentes, valores desconocidos o relaciones colgantes o asimétricas.
- **Mapa:** SVG de España por comunidades autónomas (datos del IGN vía `es-atlas`) con recuadro de Canarias, dibujado en build con `d3-geo`. No necesita servidor de teselas.
- **Analítica:** [GoatCounter](https://www.goatcounter.com) (sin cookies) en `https://nocde.goatcounter.com`.

## Cómo se muestran los datos

- **Potencia (MW):** las fuentes discrepan mucho y miden cosas distintas (potencia informática, demanda total, capacidad de conexión). La ficha muestra lo que publica cada una, sin sumarlas ni presentarlas como consumo. El tamaño del círculo solo se usa cuando hay una cifra única razonable; si no, el círculo es de tamaño fijo.
- **Ubicación:** siempre aproximada. Procede del mapa de la campaña *No es sequía, es saqueo* o es la del municipio, y cada ficha lo indica. No señala la parcela.
- **Resistencias:** una organización solo se vincula a un proyecto cuando la relación está documentada. Lo que dicen las organizaciones son afirmaciones y estimaciones suyas, no impactos medidos. Cada tipo de resistencia tiene su icono (plataforma vecinal, campaña, organización, otro).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias |
| `npm run data` | Normaliza `data/raw/*.json` y escribe `src/data/*.json` (solo confirmados) |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build estático en `dist/` (con `BASE=/nocde` para GitHub Pages) |
| `npm run build:preview` | Build con rutas relativas, servible desde cualquier carpeta |

## Actualizar los datos

1. Consultar ambas bases de datos de Notion en modo filas (máx. 100 por consulta; paginar si hace falta).
2. Guardar cada resultado como `data/raw/centros.json` y `data/raw/organizaciones.json`, con los campos `results` y `has_more`.
3. `npm run data && npm run build`, y versionar los cambios de `src/data/`.

## Diseño

«Tierra, agua y luz»: papel cálido y tinta, almagre para los centros de datos, ocre para lo planificado y azul agua para la resistencia, sin colores asociados a partidos. Archivo (ancho variable) para títulos e interfaz y Literata para el texto, autoalojadas con `@fontsource`. El estado de un proyecto nunca se indica solo con color: cada estado tiene su propio relleno (sólido, rayado, claro, tachado o discontinuo).

## Reconocimientos

Este mapa se apoya en el trabajo de otras personas y colectivos. Gracias a:

- **[No es sequía, es saqueo](https://nocentrosdedatosaragon.org/)**: su [mapa de centros de datos en Aragón](https://nocentrosdedatosaragon.org/informacion-y-mapa/), su [cronología](https://nocentrosdedatosaragon.org/recorrido/) y el [visor DCMaps](https://dvdmc.github.io/DCMaps/) ([código](https://github.com/dvdmc/DCMaps)) son la base de muchas ubicaciones, estados y vínculos. Las ubicaciones aproximadas de varios proyectos aragoneses proceden de su mapa.
- **[Tu Nube Seca Mi Río](https://tunubesecamirio.com/)**: su informe [«El precio de las nubes»](https://tunubesecamirio.com/2026/02/05/informe-sobre-los-centros-de-datos-de-aragon-el-precio-de-las-nubes/) y sus publicaciones sobre alegaciones.
- **[Ecologistas en Acción](https://www.ecologistasenaccion.org/)** y sus grupos territoriales: comunicados, alegaciones y recursos.
- **[Observatorio Español de Data Centers](https://observatorioedc.com/directorio/)**: directorio sectorial, usado como pista para contrastar estados y cifras, nunca como prueba.
- **[Stop Dirty Data Centres](https://stopdirtydatacentres.eu/)** y **[Down With Data Centers](https://downwithdatacenters.now/)**.
- La prensa local y regional (AraInfo, elDiario.es, Heraldo, Hoy Aragón, Tribuna de Zamora, Tot Cerdanyola, El Diario de Asturias…), enlazada en cada ficha.
- Cartografía: © Instituto Geográfico Nacional (CC BY 4.0), vía [es-atlas](https://github.com/martgnz/es-atlas).

Si formas parte de alguno de los colectivos citados y quieres que se corrija, se amplíe o se retire algo, díselo a Motiu.

## Licencia

Textos bajo CC BY-SA 4.0. Los datos enlazan a sus fuentes originales, que mantienen sus propias condiciones de uso.
