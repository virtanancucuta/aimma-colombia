/* =============================================
   AIMMA Financiero · App MVP v0.1
   ============================================= */

const STORAGE_KEY = 'aimma_financiero_v1';
// Incrementar cuando cambie el parser. Si el storage tiene otra versión, se limpia
// automáticamente para forzar re-parseo con la lógica nueva.
const APP_VERSION = '2026-06-11.1-gastos-analisis-fix';

const state = {
  ventas: [],       // [{archivo, codigo, descripcion, cantidad, precio, subtotal, iva, total, fecha, cliente}]
  inventario: [],   // [{archivo, codigo, nombre, costoUnitario, stockActual}]
  gastos: [],       // [{archivo, concepto, proveedor, subtotal, iva, total, fecha}]
  archivos: { ventas: [], inventario: [], gastos: [] },  // metadata por archivo
  filterMonth: 'all',
  conIva: true,     // true = Responsable de IVA, false = No responsable
  manejaInventario: true,  // true = empresa de productos/stock. false = servicios/dropshipping (oculta inventario, COGS, rotacion, sobrestock, rentabilidad y ruptura)
  // Periodo del informe de VENTAS (proyección a 30 días)
  // factor = 30/dias. Si user subió 20 días, factor=1.5 (proyecta arriba).
  // Si subió 45 días, factor=0.667 (proyecta abajo). 30 días = factor 1 (sin cambio).
  ventasFechaDesde: null,
  ventasFechaHasta: null,
  ventasPeriodoDias: null,    // entero, ej: 20, 30, 45
  ventasPeriodoFactor: null   // 30/dias, ej: 1.5, 1.0, 0.667
};

/* ============= UTILS ============= */

function fmtMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(n);
}

function fmtPercent(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function toast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Canonicaliza un código de producto que puede venir como string, número (Excel
// auto-convirtió "00103" a 103), float (1891971.0), datetime (POS guardó código
// '3099-02-01' que Excel interpretó como fecha), null, etc. Garantiza string limpio.
function canonicalizeCodigo(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  // Cross-realm safe Date check (instanceof falla entre contextos)
  const isDate = Object.prototype.toString.call(raw) === '[object Date]';
  if (isDate && !isNaN(raw.getTime())) {
    // Excel convirtió un código a fecha (bug típico del POS al exportar).
    // Recuperamos como ISO YYYY-MM-DD — el usuario verá un código raro pero
    // al menos podrá reconocerlo y corregirlo en su Excel.
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === 'number') {
    if (isNaN(raw)) return '';
    // Entero: trunc para evitar ".0" de floats que en realidad son enteros
    if (Number.isInteger(raw) || raw % 1 === 0) return String(Math.trunc(raw));
    return String(raw);
  }
  return String(raw).trim();
}

// Similaridad de textos (Jaccard sobre palabras) para tiebreak por descripción.
// Útil cuando hay varios candidatos en inventario y uno solo se parece al nombre.
function normalizeTextForMatch(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function textSimilarity(a, b) {
  const na = normalizeTextForMatch(a);
  const nb = normalizeTextForMatch(b);
  if (!na || !nb) return 0;
  const wa = new Set(na.split(' ').filter(w => w.length >= 2));
  const wb = new Set(nb.split(' ').filter(w => w.length >= 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  wa.forEach(w => { if (wb.has(w)) inter++; });
  return inter / new Set([...wa, ...wb]).size;
}

function parseNumber(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (v === null || v === undefined || v === '') return 0;
  let s = String(v).trim();

  // Detecta negativos en formato contable: (1.234) = -1234
  const isNegative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()]/g, '');

  // Quita todo menos dígitos, puntos, comas y signo negativo
  s = s.replace(/[^\d.,\-]/g, '');
  if (!s) return 0;

  // Si después de limpiar no queda dígito alguno, es 0
  if (!/\d/.test(s)) return 0;

  // Formato colombiano: 1.234.567,89 (coma decimal)
  // Formato US: 1,234,567.89 (punto decimal)
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // Ambos: el último símbolo es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // Solo comas: si la última coma tiene 1 o 2 dígitos después, es decimal
    const parts = s.split(',');
    const last = parts[parts.length - 1];
    if (last.length <= 2 && parts.length === 2) {
      s = parts[0] + '.' + last;
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasDot && !hasComma) {
    // Solo puntos: si el último punto tiene 1 o 2 dígitos y solo hay 1 punto, es decimal
    const parts = s.split('.');
    const last = parts[parts.length - 1];
    if (parts.length > 2) {
      // Múltiples puntos = separadores de miles colombianos (1.234.567)
      s = s.replace(/\./g, '');
    } else if (last.length === 3 && parts[0].length <= 3) {
      // "234.567" en Colombia es 234567 (miles), en US 234.567 sería decimal — asumimos miles si parte entera < 4 dígitos
      s = s.replace(/\./g, '');
    }
    // Si last.length === 1 o 2, es decimal — dejamos así
  }

  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return isNegative ? -Math.abs(n) : n;
}

// Meses en español/abreviados para parsear fechas tipo "28/Feb/2026" o "28 de febrero de 2026"
const MES_TXT = {
  ene: 0, enero: 0, jan: 0, january: 0,
  feb: 1, febrero: 1, february: 1,
  mar: 2, marzo: 2, march: 2,
  abr: 3, abril: 3, apr: 3, april: 3,
  may: 4, mayo: 4,
  jun: 5, junio: 5, june: 5,
  jul: 6, julio: 6, july: 6,
  ago: 7, agosto: 7, aug: 7, august: 7,
  sep: 8, sept: 8, septiembre: 8, september: 8,
  oct: 9, octubre: 9, october: 9,
  nov: 10, noviembre: 10, november: 10,
  dic: 11, diciembre: 11, dec: 11, december: 11,
};

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  // Excel serial number
  if (typeof v === 'number' && v > 25000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d) ? null : d;
  }
  const s = String(v).trim();
  // ISO YYYY-MM-DD
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // DD/MM/YYYY
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  // DD/MM/YY
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2})/);
  if (m) return new Date(2000 + +m[3], +m[2] - 1, +m[1]);
  // DD/MMM/YYYY o DD-Mmm-YYYY (mes abreviado en texto, ej "28/Feb/2026")
  m = s.match(/(\d{1,2})[-/\s]([A-Za-zñÑáéíóú]{3,12})[-/\s](\d{2,4})/);
  if (m) {
    const mesIdx = MES_TXT[m[2].toLowerCase().replace(/[áéíóú]/g, c => 'aeiou'['áéíóú'.indexOf(c)])];
    if (mesIdx !== undefined) {
      const year = +m[3];
      const fullYear = year < 100 ? 2000 + year : year;
      return new Date(fullYear, mesIdx, +m[1]);
    }
  }
  // "28 de febrero de 2026" / "28 de feb de 2026"
  m = s.match(/(\d{1,2})\s+de\s+([A-Za-zñÑáéíóú]{3,12})\s+de\s+(\d{4})/i);
  if (m) {
    const mesIdx = MES_TXT[m[2].toLowerCase().replace(/[áéíóú]/g, c => 'aeiou'['áéíóú'.indexOf(c)])];
    if (mesIdx !== undefined) return new Date(+m[3], mesIdx, +m[1]);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function monthKey(d) {
  if (!d) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ============= COLUMN MAPPERS ============= */

// IMPORTANTE: el orden de las opciones importa. Más específico PRIMERO.
// Si una palabra genérica matchea ANTES que una específica, podemos quedarnos con la
// columna equivocada (ej: "Referencia" vacía en lugar de "Codigo Articulo").
// 'codigaarticulo' / 'codigaart' contemplan typos comunes ("codiga" en vez de "codigo").
// IMPORTANTE: 'cod' al final, después de variantes más específicas, para que NUNCA
// matchee 'Codigo Tercero' / 'Codigo Cliente' por accidente cuando hay una mejor.
// KUBAP (POS de Cúcuta) usa "Producto" como CÓDIGO y "Nombre del Producto" como nombre.
// Por eso 'nombredelproducto' va PRIMERO en nombre/descripcion (exact match en step 1)
// para que el código NO se confunda con el nombre cuando ambas columnas existen.
const COL_MAP = {
  ventas: {
    codigo: ['codigoarticulo', 'codigaarticulo', 'codigoart', 'codigaart', 'codigoproducto', 'idproducto', 'codigo', 'codiga', 'sku', 'producto', 'referencia', 'ref', 'cod'],
    descripcion: ['nombredelproducto', 'descripciondelproducto', 'descripcionarticulo', 'descripcion', 'producto', 'articulo', 'detalle', 'concepto', 'item', 'nombre'],
    cantidad: ['cantidadvendida', 'cantidad', 'cant', 'qty', 'unidades', 'und'],
    precio: ['preciounitario', 'valorunitario', 'precioventa', 'precio', 'preciound', 'pvu', 'unitario', 'valor'],
    subtotal: ['baseimponible', 'totalsiniva', 'subtotal', 'subt', 'base', 'valorbase', 'valorventa', 'valor'],
    iva: ['valoriva', 'totaliva', 'impuestoventas', 'iva', 'impuesto'],
    total: ['totalfactura', 'valortotal', 'totalconiva', 'total'],
    fecha: ['fechafactura', 'fechaemision', 'fecha', 'date'],
    factura: ['numfactura', 'numerofactura', 'numeroconsecutivo', 'consecutivo', 'factura', 'numero', 'documento'],
    cliente: ['nombrecliente', 'razonsocial', 'cliente', 'tercero']
  },
  inventario: {
    codigo: ['codigoarticulo', 'codigaarticulo', 'codigoart', 'codigaart', 'codigoproducto', 'idproducto', 'codigo', 'codiga', 'sku', 'producto', 'referencia', 'ref', 'cod'],
    nombre: ['nombredelproducto', 'nombrearticulo', 'nombreproducto', 'descripciondelproducto', 'descripcionarticulo', 'descripcion', 'producto', 'articulo', 'nombre', 'detalle'],
    costoUnitario: ['costounitario', 'costopromedio', 'costoactual', 'preciocosto', 'valorcosto', 'costo', 'cost'],
    stockActual: ['stockactual', 'existencias', 'existencia', 'cantactual', 'stock', 'inventario', 'saldo', 'cantidad']
  },
  gastos: {
    concepto: ['concepto', 'descripcion', 'detalle', 'producto', 'articulo', 'item'],
    proveedor: ['nombreproveedor', 'razonsocial', 'proveedor', 'tercero', 'emisor', 'nombre'],
    subtotal: ['baseimponible', 'totalsiniva', 'subtotal', 'base', 'valor'],
    iva: ['valoriva', 'totaliva', 'iva', 'impuesto'],
    total: ['totalfactura', 'valortotal', 'totalconiva', 'total'],
    fecha: ['fechafactura', 'fechaemision', 'fecha', 'date'],
    factura: ['numfactura', 'numerofactura', 'nfactura', 'nfact', 'factura', 'numero', 'documento']
  }
};

function isEmptyVal(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// Excluir headers que empiezan con "%" para opciones de dinero/cantidad — esos son
// columnas de PORCENTAJE (ej KUBAP "% I.V.A." = 19, no el monto $) y romperian la suma.
// El header original (no normalizado) se compara — "%" en cualquier posicion del trim.
function isPercentageHeader(rawHeader) {
  return typeof rawHeader === 'string' && rawHeader.trim().startsWith('%');
}

// Keywords negativos por campo: si una option es 'iva'/'impuesto' debemos
// excluir columnas de retencion fuente / reteica / reterenta que matchean
// parcialmente "impuesto". POS Helisa/Siigo Desktop usan estas columnas
// separadas y son distintas al IVA real.
const NEGATIVE_KEYWORDS = {
  iva: ['retencion', 'retefuente', 'reteica', 'reterenta', 'ret.fte', 'ret.ica', 'rete'],
};

function findCol(row, options) {
  const keys = Object.keys(row);
  // Filtrar keys que empiezan con "%" — esas son columnas de porcentaje, no valor.
  // (Si la opción específicamente busca "porcentaje" o "pct" — futuro caso — se podría re-permitir,
  // pero por ahora siempre las excluimos del cruce con dinero/cantidad/iva).
  let eligibleKeys = keys.filter(k => !isPercentageHeader(k));
  // Si las options coinciden con un campo con negative keywords, descartar
  // headers que contengan esos negative keywords (ej al buscar 'iva',
  // descartar 'retencionfuente' aunque matchearía 'impuesto' parcialmente).
  const negativeSet = options.some(o => NEGATIVE_KEYWORDS[o]) ? NEGATIVE_KEYWORDS[options.find(o => NEGATIVE_KEYWORDS[o])] : null;
  if (negativeSet) {
    eligibleKeys = eligibleKeys.filter(k => {
      const norm = normalizeKey(k);
      return !negativeSet.some(neg => norm.includes(neg));
    });
  }

  // Paso 1: exact match con valor NO vacío
  for (const opt of options) {
    const k = eligibleKeys.find(k => normalizeKey(k) === opt);
    if (k && !isEmptyVal(row[k])) return row[k];
  }
  // Paso 2: partial match con valor NO vacío
  for (const opt of options) {
    const k = eligibleKeys.find(k => normalizeKey(k).includes(opt));
    if (k && !isEmptyVal(row[k])) return row[k];
  }
  // Paso 3: último recurso, cualquier match (aunque vacío)
  for (const opt of options) {
    const k = eligibleKeys.find(k => normalizeKey(k) === opt);
    if (k) return row[k];
  }
  for (const opt of options) {
    const k = eligibleKeys.find(k => normalizeKey(k).includes(opt));
    if (k) return row[k];
  }
  return undefined;
}

function mapVentaRow(row) {
  const subtotal = parseNumber(findCol(row, COL_MAP.ventas.subtotal));
  // Fix #5 2026-05-28: distinguir "celda ausente" (default 1 unidad) vs "celda con
  // 0 explicito" (devolucion a cantidad cero, mantener 0 para no inflar COGS).
  const rawCantidad = findCol(row, COL_MAP.ventas.cantidad);
  const cantidadParsed = parseNumber(rawCantidad);
  const cantidad = (cantidadParsed === 0 && (rawCantidad === '' || rawCantidad === null || rawCantidad === undefined))
    ? 1
    : cantidadParsed;
  const precio = parseNumber(findCol(row, COL_MAP.ventas.precio));
  const iva = parseNumber(findCol(row, COL_MAP.ventas.iva));
  const total = parseNumber(findCol(row, COL_MAP.ventas.total));
  const calcSubtotal = subtotal || (precio && cantidad ? precio * cantidad : (total - iva)) || 0;
  return {
    codigo: canonicalizeCodigo(findCol(row, COL_MAP.ventas.codigo)),
    descripcion: String(findCol(row, COL_MAP.ventas.descripcion) || '').trim(),
    cantidad: cantidad,
    precio: precio || (calcSubtotal / (cantidad || 1)),
    subtotal: calcSubtotal,
    iva: iva || (total && calcSubtotal ? total - calcSubtotal : 0),
    total: total || (calcSubtotal + iva),
    fecha: parseDate(findCol(row, COL_MAP.ventas.fecha)),
    factura: String(findCol(row, COL_MAP.ventas.factura) || '').trim(),
    cliente: String(findCol(row, COL_MAP.ventas.cliente) || '').trim()
  };
}

function mapInventarioRow(row) {
  return {
    codigo: canonicalizeCodigo(findCol(row, COL_MAP.inventario.codigo)),
    nombre: String(findCol(row, COL_MAP.inventario.nombre) || '').trim(),
    costoUnitario: parseNumber(findCol(row, COL_MAP.inventario.costoUnitario)),
    stockActual: parseNumber(findCol(row, COL_MAP.inventario.stockActual))
  };
}

function mapGastoRow(row) {
  const subtotal = parseNumber(findCol(row, COL_MAP.gastos.subtotal));
  const iva = parseNumber(findCol(row, COL_MAP.gastos.iva));
  const total = parseNumber(findCol(row, COL_MAP.gastos.total));
  return {
    concepto: String(findCol(row, COL_MAP.gastos.concepto) || '').trim(),
    proveedor: String(findCol(row, COL_MAP.gastos.proveedor) || '').trim(),
    subtotal: subtotal || (total - iva) || 0,
    iva: iva,
    total: total || (subtotal + iva),
    fecha: parseDate(findCol(row, COL_MAP.gastos.fecha)),
    factura: String(findCol(row, COL_MAP.gastos.factura) || '').trim()
  };
}

/* ============= PARSERS ============= */

// Detecta inteligentemente dónde están los headers reales en una hoja.
// Algunos POS (Siigo, Alegra) ponen título en fila 1 y headers en fila 2 o 3.
function findHeaderRow(rows2D, category) {
  const expectedFields = COL_MAP[category];
  const allKeywords = [];
  Object.values(expectedFields).forEach(arr => allKeywords.push(...arr));

  let bestRowIdx = 0;
  let bestScore = -1;

  // Hasta 25 filas: algunos POS (Helisa Desktop) imprimen 16-20 filas de
  // metadata empresa/filtros/fechas/separadores antes del header real.
  const maxRowsToScan = Math.min(25, rows2D.length);
  for (let i = 0; i < maxRowsToScan; i++) {
    const row = rows2D[i] || [];
    const nonEmpty = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmpty.length < 2) continue; // título de una sola celda, skip

    let score = 0;
    nonEmpty.forEach(cell => {
      const norm = normalizeKey(cell);
      if (!norm) return;
      if (allKeywords.some(k => norm === k)) score += 2;
      else if (allKeywords.some(k => norm.includes(k))) score += 1;
    });

    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = i;
    }
  }

  return bestScore >= 2 ? bestRowIdx : 0;
}

// Detector de offset por columna: cuando un POS (ej KUBAP/BUV) exporta con
// merged cells, el header de una columna puede estar en col X pero los datos
// en X±N (N = 1, 2 o 3). Escaneamos las primeras N data rows: si col X esta
// vacia pero col X±N tiene valores consistentes, ese header lee de col X±N.
// Por header individual (no global).
// BUV (.xls con NIT-PROVEEDOR agrupado): FACTURA header en col 0, datos en
// col 2 → offset +2 requerido.
function resolveColumnOffsets(headers, dataRows) {
  const offsets = headers.map(() => 0);
  const isEmpty = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  // Filtrar filas no-vacias del slice inicial
  const rawSample = dataRows.slice(0, Math.min(40, dataRows.length))
    .filter(r => r && r.some(c => !isEmpty(c)));
  if (rawSample.length < 2) return offsets;

  // Pre-filtrar a filas DETALLE (>= 4 cells populadas). KAYBU/BUV intercalan
  // agrupadores "NIT - PROVEEDOR" (1 cell) y totales por proveedor (3 cells)
  // entre filas de detalle (6+ cells). Con sample mixto, los offsets reales
  // quedan diluidos. El pre-filter usa filas con suficientes cells para
  // confirmar evidencia de offset. Fallback al sample raw si quedan <3 filas.
  let sample = rawSample.filter(r => r.filter(c => !isEmpty(c)).length >= 4)
                        .slice(0, 20);
  if (sample.length < 3) sample = rawSample.slice(0, 20);
  // Threshold mas estricto cuando hay pocas filas — con sample=2 una sola
  // coincidencia casual generaria 50% y falso positivo de offset.
  const minThreshold = sample.length >= 4 ? 0.5 : 0.6;

  const ncols = sample[0]?.length || 0;
  for (let h = 0; h < headers.length; h++) {
    if (!headers[h]) continue;
    const emptiesHere = sample.filter(r => isEmpty(r[h])).length;
    const ratio = emptiesHere / sample.length;
    if (ratio < 0.7) continue; // header populado normalmente, no hace shift
    // Elegir el offset con MAYOR ratio de cells populadas en col target,
    // no el primero que supera threshold. Evita que offset +1 casual gane
    // sobre el verdadero +2 (caso BUV documentado). Constraint: la columna
    // target NO debe ser otro header.
    let bestOff = 0, bestRatio = -1;
    for (const tryOff of [1, 2, 3, -1, -2, -3]) {
      const targetCol = h + tryOff;
      if (targetCol < 0 || targetCol >= ncols) continue;
      if (headers[targetCol] && headers[targetCol] !== '') continue;
      const nonEmptyTarget = sample.filter(r => !isEmpty(r[targetCol])).length;
      const targetRatio = nonEmptyTarget / sample.length;
      if (targetRatio > minThreshold && targetRatio > bestRatio) {
        bestRatio = targetRatio;
        bestOff = tryOff;
      }
    }
    offsets[h] = bestOff;
  }
  return offsets;
}

// Detecta si una fila parsed es la "TOTAL INFORME" / "TOTAL <PROVEEDOR>" /
// agrupador / header repetido de POS tipo KUBAP/BUV/similar.
// Recibe rawObj (mapeado por headers), parsed (post-mapper), category, y
// rawRow (array completo de cells del raw, no solo las mapeadas).
function esFilaTotalKubap(rawObj, parsed, category, rawRow) {
  // Filtro 1: header repetido (KUBAP imprime headers cada N filas) + footers de
  // reportes de ventas POS (Maraldo Laureles imprime "TOTAL VENTA DE ARTICULOS"
  // al final del Excel, otros POS imprimen variantes).
  const valoresHeaderRepetido = ['CODIGO','PRODUCTO','TOTAL INFORME','TOTAL INFORME :','NOMBRE DEL PRODUCTO','CANTIDAD','SUBTOTAL','I.V.A.','REFERENCIA','FACTURA','NOMBRE DEL TERCERO',
    'TOTAL VENTA DE ARTICULOS','TOTAL VENTA DE ARTÍCULOS','TOTAL VENTAS','TOTAL VENTA','TOTAL DE VENTAS','GRAN TOTAL','GRAN TOTAL VENTAS'];
  const codeUpper = String(parsed.codigo || '').trim().toUpperCase();
  const descUpper = String(parsed.descripcion || '').trim().toUpperCase();
  const provUpper = String(parsed.proveedor || '').trim().toUpperCase();
  const factUpper = String(parsed.factura || '').trim().toUpperCase();
  const concUpper = String(parsed.concepto || '').trim().toUpperCase();
  if (valoresHeaderRepetido.includes(codeUpper) || valoresHeaderRepetido.includes(descUpper)
      || valoresHeaderRepetido.includes(factUpper) || valoresHeaderRepetido.includes(provUpper)) return true;

  // Filtro 2: cualquier cell del raw contiene "TOTAL INFORME" o "TOTAL GENERAL"
  // o "TOTAL <NIT>" — cross-check con identificadores parsed para evitar falsos
  // positivos en facturas legitimas con texto similar.
  const cells = Array.isArray(rawRow) ? rawRow : Object.values(rawObj || {});
  // Cross-check: filas con factura + (subtotal o total) mapeados son detalle real,
  // no se descartan aunque algun cell empiece con "TOTAL ..." (caso proveedor
  // legitimo "TOTAL COLOMBIA - DISTRIBUIDORA").
  const tieneDatosReales = !!(parsed.factura && parsed.factura.length > 1
                              && (Math.abs(parsed.subtotal || 0) > 0 || Math.abs(parsed.total || 0) > 0));
  for (const v of cells) {
    if (typeof v !== 'string') continue;
    const upper = v.trim().toUpperCase();
    if (!upper) continue;
    // "TOTAL INFORME" / "TOTAL GENERAL" — siempre footers, sin falso positivo posible.
    if (upper.includes('TOTAL INFORME') || upper.includes('TOTAL GENERAL')) return true;
    // "TOTAL VENTA DE ARTICULOS" / "GRAN TOTAL VENTAS" — footers de POS Maraldo
    // y reportes de ventas tabulares en general. Siempre footers, sin falso
    // positivo posible (productos legitimos no contienen estas frases en desc).
    if (upper.includes('TOTAL VENTA DE ARTICULOS') || upper.includes('TOTAL VENTA DE ARTÍCULOS')) return true;
    if (upper.includes('GRAN TOTAL VENTA') || upper.includes('TOTAL DE VENTAS')) return true;
    // Patron generico para reportes de ventas: fila SIN codigo y desc empieza
    // por "TOTAL " y tiene monto > 0 -> casi seguro footer. Solo aplica a
    // ventas/inventario (gastos usa cross-check con tieneDatosReales).
    if (category !== 'gastos' && !parsed.codigo
        && /^TOTAL\s+/.test(upper)
        && (Math.abs(parsed.subtotal || 0) > 0 || Math.abs(parsed.total || 0) > 0)) return true;
    // "TOTAL 901579796 - VIKATS S.A.S" (TOTAL + NIT 6+ digits) — solo descartar
    // si la fila NO tiene factura+monto reales (cross-check con tieneDatosReales).
    if (!tieneDatosReales && /^TOTAL\s+\d{6,}/.test(upper)) return true;
  }

  // Filtro 3: anonymous total row — sin identificadores principales + monto alto.
  // Adaptado por category porque cada tipo tiene identificadores distintos:
  //   ventas       → codigo + descripcion + subtotal/total
  //   inventario   → codigo + nombre + costoUnitario/stockActual
  //   gastos       → proveedor + factura + concepto + subtotal/total
  //
  // Fix 2026-05-27 (Maraldo COGS $953M fantasma): la rama 'else' anterior
  // chequeaba parsed.subtotal/parsed.total que SON undefined para mapInventarioRow,
  // asi que el filtro nunca se aplicaba a inventario. Footer R944 con
  // (null,null,null,null,null,36728820,422455230) entraba como producto fantasma
  // con codigo='' y costoUnitario=$36.7M, inflando el COGS.
  // Fix #13 2026-05-28: codigo='0' (cero como string) es truthy en JS pero
  // algunos POS lo exportan como default cuando no hay codigo real. Tratarlo
  // como ausente para que no se cuele un footer/fantasma con codigo '0'.
  const codigoVacio = !parsed.codigo || parsed.codigo === '0';
  if (category === 'gastos') {
    if (!parsed.proveedor && !parsed.factura && !parsed.concepto
        && (Math.abs(parsed.subtotal || 0) > 1000 || Math.abs(parsed.total || 0) > 1000)) {
      return true;
    }
  } else if (category === 'inventario') {
    if (codigoVacio && !parsed.nombre
        && (Math.abs(parsed.costoUnitario || 0) > 1000 || Math.abs(parsed.stockActual || 0) > 1000)) {
      return true;
    }
  } else {
    if (codigoVacio && !parsed.descripcion
        && (Math.abs(parsed.subtotal || 0) > 1000 || Math.abs(parsed.total || 0) > 1000)) {
      return true;
    }
  }

  // Filtro 4: filas de titulo del informe (ej "KAYBU SAS - NIT 901541539",
  // "INFORME DE SERVICIOS DEL..."). Cross-check con tieneDatosReales para
  // proteger proveedores legitimos cuya razon social contiene NIT/INFORME/EMPRESA
  // (ej "INFORME CONTABLE LTDA" o "TOTAL COLOMBIA EMPRESA S.A.S").
  const sospechosoTexto = /\b(NIT|INFORME|EMPRESA|FACTURA DEL|MARGEN DE|DESDE|HASTA)\b/i;
  const matchesSospechoso = sospechosoTexto.test(codeUpper) || sospechosoTexto.test(descUpper)
                            || sospechosoTexto.test(provUpper) || sospechosoTexto.test(factUpper)
                            || sospechosoTexto.test(concUpper);
  // Para ventas/inventario el cross-check no aplica (no usan factura como ID).
  if (matchesSospechoso) {
    if (category !== 'gastos' || !tieneDatosReales) return true;
  }
  // "<NIT> - <PROVEEDOR>" agrupador BUV: factura contiene NIT (>=6 digitos) +
  // dash + nombre con letra (espacios obligatorios para distinguir de facturas
  // legitimas "1234567-001"). Cross-check con falta de datos reales.
  if (!tieneDatosReales && /^\d{6,}\s+-\s+[A-ZÁÉÍÓÚÑ]/.test(factUpper)) return true;

  // Fix #9 2026-05-28: filtro plan de cuentas contable Maraldo (DATOS MARALDO.xlsx).
  // Codigos tipo "00.", "01.01.", "01.01.12" con descripcion = nombre de grupo
  // contable (SERVICIOS, INVENTARIO, GIRLS, GRUPO MAYOR) son agrupadores, no
  // productos reales. Si la fila parece producto pero el codigo es plan de
  // cuentas Y la descripcion es nombre de grupo conocido -> filtrar.
  const PATRON_PLAN_CUENTAS = /^\d{1,3}(\.\d{1,3}){1,3}\.?$/;
  const GRUPOS_CONTABLES_CONOCIDOS = new Set([
    'SERVICIOS','INVENTARIO','MARALDO','GIRLS','DEPORTIVO','PLATAFORMA','TACON',
    'PLANA','VALETA','MB','PANTALON','USA','COTIZA','INVENTARIO GENERAL',
    'SIN GRUPO CONTABLE','ARTICULO UNICO','GRUPO MAYOR','GRUPO','SUBGRUPO',
    'NOM. GRUPO CONTABLE','COD. GRUPO CONTABLE'
  ]);
  if (category !== 'gastos' && PATRON_PLAN_CUENTAS.test(codeUpper) && GRUPOS_CONTABLES_CONOCIDOS.has(descUpper)) {
    return true;
  }

  // Filtro 5 (solo gastos): filas de subtotal/total intercaladas. POS que agrupan
  // por dia o proveedor intercalan estas filas (ej "RESUMEN DE COMPRAS" de Maraldo:
  // una fila "TOTALES" por dia + un gran total "TOTALES <rango de fechas>"). Los
  // filtros previos solo cubren "TOTAL INFORME"/"TOTAL GENERAL"/"TOTAL <NIT>";
  // esto cubre la palabra "TOTAL"/"TOTALES"/"SUBTOTAL"/"GRAN TOTAL" a secas.
  if (category === 'gastos') {
    const patronTotalizador = /^(GRAN\s+)?(SUB\s*-?\s*)?TOTAL(ES)?\b/;
    // 5a: el campo factura es un totalizador -> jamas es un N° de factura real.
    if (factUpper && patronTotalizador.test(factUpper)) return true;
    // 5b: proveedor/concepto es un totalizador y la fila no trae factura real.
    //     El cross-check tieneDatosReales protege proveedores legitimos cuya
    //     razon social empiece por "Total" (ej "Total Colombia S.A.S").
    if (!tieneDatosReales
        && ((provUpper && patronTotalizador.test(provUpper))
            || (concUpper && patronTotalizador.test(concUpper)))) return true;
    // Filtro 6: meta-lineas de la seccion "ANALISIS DEL MES" de informes operacionales
    // hechos a mano ("Gasto total del mes", "Gastos extraordinarios", "Base operativa
    // recurrente", "Peso de lo extraordinario"). DUPLICAN el total. Red de seguridad por
    // si el corte de seccion no aplica (archivo sin el encabezado de seccion). El
    // cross-check tieneDatosReales protege gastos POS legitimos (con factura+monto reales).
    const PATRON_META_ANALISIS = /^(GASTO\s+TOTAL|GASTOS?\s+EXTRAORDINARI|BASE\s+(OPERATIVA|RECURRENTE)|PESO\s+DE\s+LO\s+EXTRAORDINARIO)/;
    if (!tieneDatosReales
        && ((concUpper && PATRON_META_ANALISIS.test(concUpper))
            || (provUpper && PATRON_META_ANALISIS.test(provUpper)))) return true;
  }

  return false;
}

// === FALLBACK GASTOS: formato "resumen 2 columnas" (concepto | monto) ===
// Informes operacionales internos (ej Maraldo Laureles "GASTOS OPERACIONALES")
// que NO traen encabezados POS ni proveedor/factura/IVA/fecha: solo una columna
// de concepto y otra de monto. Se detecta y parsea SOLO como fallback aditivo
// cuando el camino normal por encabezados no encontro ninguna fila (ver parseExcel).
// Robustez aditiva, nunca restrictiva: el path POS existente queda intacto.

// ¿La celda parece un monto de dinero? (numero, "-" contable = 0, o "$1.234.567")
function pareceMonto(v) {
  if (typeof v === 'number') return isFinite(v);
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (s === '') return false;
  if (s === '-' || s === '$-' || s === '$ -') return true; // dash contable = 0
  // opcional $, miles con . o , , decimales, negativos contables (1.234)
  return /^\$?\s*-?\(?\s*\d[\d.,\s]*\)?\s*$/.test(s);
}

// ¿La celda parece un concepto de gasto? (texto con al menos una letra)
function pareceConcepto(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s.length > 0 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s);
}

// Deriva una fecha (mes/año) desde texto libre: nombre de archivo o título de hoja.
// "...Mayo2026", "MAYO 2026", "gastos_mayo_2026" -> Date(2026, 4, 1). null si no detecta.
function parseMesAnioTexto(str) {
  if (!str) return null;
  let s = String(str).toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, ' ');
  // separar letras pegadas a dígitos: "mayo2026" -> "mayo 2026"
  s = s.replace(/([a-záéíóúñ])(\d)/g, '$1 $2').replace(/(\d)([a-záéíóúñ])/g, '$1 $2');
  const ym = s.match(/(?:^|\s)(20\d{2})(?:\s|$)/);
  if (!ym) return null;
  const anio = parseInt(ym[1], 10);
  // tokens largos primero (mayo antes que may) para no cortar el mes
  const tokens = Object.keys(MES_TXT).sort((a, b) => b.length - a.length);
  for (const tok of tokens) {
    const re = new RegExp('(?:^|\\s)' + tok + '(?:\\s|$)');
    if (re.test(s)) return new Date(anio, MES_TXT[tok], 1);
  }
  return null;
}

// Extrae filas {obj, rawRow} de una matriz 2D con formato concepto|monto.
// Por fila: primera celda que parece concepto + última celda (a su derecha) que
// parece monto. Tolera columnas vacías/índice a la izquierda. La fila título
// (sin monto) y las filas "TOTAL ..." se descartan despues por el pipeline normal
// (filtro subtotal/total === 0 y esFilaTotalKubap).
function extraerResumenGastos2Col(rows2D, fecha) {
  const out = [];
  for (const row of rows2D) {
    if (!Array.isArray(row)) continue;
    let conceptoCell = null, conceptoIdx = -1;
    for (let c = 0; c < row.length; c++) {
      if (pareceConcepto(row[c])) { conceptoCell = row[c]; conceptoIdx = c; break; }
    }
    if (conceptoIdx === -1) continue;
    let montoCell = null;
    for (let c = row.length - 1; c > conceptoIdx; c--) {
      if (pareceMonto(row[c])) { montoCell = row[c]; break; }
    }
    if (montoCell === null) continue;
    const obj = { concepto: String(conceptoCell).trim(), total: montoCell };
    if (fecha) obj.fecha = fecha;
    out.push({ obj, rawRow: row });
  }
  return out;
}

// ¿Es la fila el encabezado de una SECCION DE CIERRE (analisis/resumen) que viene
// despues de la tabla de datos? Informes operacionales hechos a mano cierran con una
// fila TOTAL y luego una seccion tipo "ANALISIS DEL MES" cuyas meta-lineas
// ("Gasto total del mes", "Base operativa recurrente"...) DUPLICAN el total. El
// marcador es texto puro (sin ningun monto en la fila). Detectarlo permite cortar la
// hoja y descartar todo lo posterior, sin importar como se llamen las meta-lineas.
const PATRON_SECCION_CIERRE = /^\s*(AN[ÁA]LISIS|RESUMEN|OBSERVACIONES|NOTAS)\b/i;
function esMarcadorSeccionCierre(row) {
  if (!Array.isArray(row)) return false;
  let textoCierre = false;
  for (const c of row) {
    // Cualquier monto real en la fila -> no es un marcador de seccion, es dato.
    if (typeof c === 'number' && isFinite(c) && c !== 0) return false;
    if (typeof c === 'string' && PATRON_SECCION_CIERRE.test(c.trim())) textoCierre = true;
  }
  return textoCierre;
}

async function parseExcel(file, category) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const allRows = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    // Leer como matriz 2D para detectar dónde están los headers reales
    const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    if (rows2D.length === 0) continue;

    const headerIdx = findHeaderRow(rows2D, category);
    const headers = (rows2D[headerIdx] || []).map(h => String(h ?? '').trim());
    // Skip sheets sin headers reconocibles. Sin esto, un libro con "Hoja1"
    // (portada/resumen) + "Hoja2" (detalle real) inyecta filas basura desde
    // Hoja1 con headers vacios. Si todos los headers detectados son vacios
    // probablemente este sheet es portada/resumen — saltar.
    const headersNoVacios = headers.filter(h => h && h.trim() !== '').length;
    if (headersNoVacios < 2) continue;

    // Fix #1 2026-05-28: Excel multi-hoja con tipos mezclados. Si el libro tiene
    // hoja INVENTARIO + hoja VENTAS y el cliente sube como "ventas", el parser
    // antiguo iteraba TODAS y la hoja INVENTARIO contaminaba (caso DATA ABRIL
    // CIERRE LAURELES: suma fantasma $573M). Skip hojas cuyos headers EXCLUSIVOS
    // son del tipo opuesto al esperado.
    const headerKeysHoja = headers.map(h => normalizeKey(h));
    const EXCLUSIVE_INVENTARIO = ['existencias','existencia','vrparcial','costopromedio','stockactual','costoparcial','vrunitario'];
    const EXCLUSIVE_VENTAS = ['valorventa','vrutilid','utilid','margen','cantidadvendida','rentabilidad','valorprom'];
    const EXCLUSIVE_GASTOS = ['nombreproveedor','razonsocial','nombredelproveedor'];
    const matchInv = headerKeysHoja.filter(h => h && EXCLUSIVE_INVENTARIO.some(k => h.includes(k))).length;
    const matchVen = headerKeysHoja.filter(h => h && EXCLUSIVE_VENTAS.some(k => h.includes(k))).length;
    const matchGas = headerKeysHoja.filter(h => h && EXCLUSIVE_GASTOS.some(k => h.includes(k))).length;
    if (category === 'ventas' && matchInv >= 2 && matchVen === 0) continue;
    if (category === 'inventario' && matchVen >= 2 && matchInv === 0) continue;
    if (category === 'gastos' && (matchInv >= 2 || matchVen >= 2) && matchGas === 0) continue;

    // Detector de offset por columna (FIX KUBAP merged cells)
    const dataSlice = rows2D.slice(headerIdx + 1);
    const offsets = resolveColumnOffsets(headers, dataSlice);

    let filasConMontoHoja = 0;
    for (let i = headerIdx + 1; i < rows2D.length; i++) {
      const row = rows2D[i] || [];
      if (row.every(c => c === null || c === undefined || String(c).trim() === '')) continue;
      // CORTE DE SECCION (solo gastos): una vez vistos datos reales, si aparece el
      // encabezado de una seccion de analisis/resumen de cierre ("ANALISIS DEL MES"),
      // cortar la hoja. Todo lo posterior son meta-lineas que duplican el total.
      // El guard (>=3 filas con monto) evita cortar en un titulo POS al inicio.
      if (category === 'gastos' && filasConMontoHoja >= 3 && esMarcadorSeccionCierre(row)) break;
      const obj = {};
      headers.forEach((h, idx) => {
        if (!h) return;
        const sourceIdx = idx + (offsets[idx] || 0);
        obj[h] = row[sourceIdx];
      });
      if (row.some(c => typeof c === 'number' && isFinite(c) && c !== 0)) filasConMontoHoja++;
      // Guardar tambien el rawRow completo para que esFilaTotalKubap
      // pueda detectar "TOTAL <PROVEEDOR>" en cells NO mapeadas (col fuera
      // de headers, ej col 1 de BUV que tiene los subtotales por proveedor).
      allRows.push({ obj, rawRow: row });
    }
  }

  // FALLBACK aditivo (solo gastos): formato "resumen 2 columnas" (concepto | monto).
  // Se activa SOLO si el camino normal por encabezados no encontró NINGUNA fila, así
  // que no puede alterar ningún archivo POS que ya parsea bien. Deriva el mes del
  // nombre del archivo (o del título de la hoja) para que el gasto caiga en el mes
  // correcto y sobreviva el filtro por mes; si no detecta mes queda sin fecha
  // (visible solo en "Todos los meses").
  if (category === 'gastos' && allRows.length === 0) {
    let fechaResumen = parseMesAnioTexto(file.name);
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
      if (!fechaResumen) {
        for (let i = 0; i < Math.min(5, rows2D.length) && !fechaResumen; i++) {
          fechaResumen = parseMesAnioTexto((rows2D[i] || []).join(' '));
        }
      }
      const detalle = extraerResumenGastos2Col(rows2D, fechaResumen);
      if (detalle.length >= 3) { allRows.push(...detalle); break; } // primera hoja válida
    }
  }

  const mapper = { ventas: mapVentaRow, inventario: mapInventarioRow, gastos: mapGastoRow }[category];
  let parsed = allRows.map(({ obj, rawRow }) => {
    const mapped = mapper(obj);
    return { ...mapped, archivo: file.name, _raw: obj, _rawRow: rawRow };
  }).filter(r => {
    if (esFilaTotalKubap(r._raw, r, category, r._rawRow)) return false;
    if (category === 'ventas') {
      return r.subtotal !== 0 || r.total !== 0 || r.cantidad !== 0;
    }
    if (category === 'inventario') return r.codigo;
    if (category === 'gastos') return r.subtotal !== 0 || r.total !== 0;
  }).map(r => { delete r._raw; delete r._rawRow; return r; });

  // PROYECCION A 30 DIAS solo en ventas: si el usuario indico que el informe es de X dias,
  // escalamos cada venta por factor = 30/X. Cantidad se redondea a entero (Math.round),
  // monetarios (subtotal/iva/total/precio) mantienen decimales. Si subio 20 dias y vendio
  // 100 und, proyeccion = 100/20*30 = 150 und/mes. Si subio 45 dias = 100/45*30 = 67 und.
  if (category === 'ventas' && state.ventasPeriodoFactor && Math.abs(state.ventasPeriodoFactor - 1) >= 0.001) {
    const f = state.ventasPeriodoFactor;
    parsed = parsed.map(v => ({
      ...v,
      cantidad: Math.round((v.cantidad || 0) * f),
      subtotal: (v.subtotal || 0) * f,
      iva: (v.iva || 0) * f,
      total: (v.total || 0) * f
      // precio (unitario) no se escala porque no depende del periodo
    }));
  }
  return parsed;
}

async function parsePDF(file, category) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  if (category === 'inventario') {
    return await parseInventoryPDF(pdf, file.name);
  }

  // Fix 2026-05-25: para PDFs de VENTAS, intentar PRIMERO el parser table-aware
  // (reportes POS Maraldo y similares con CODIGO/DESCRIPCION/CANTIDAD/TOTAL).
  // Si NO es tabular (factura individual), cae al parsePDFText preservando
  // el comportamiento original. Robustez aditiva, no restrictiva.
  if (category === 'ventas') {
    try {
      const rows = await parseSalesReportPDF(pdf, file.name);
      if (rows && rows.length > 0) return rows;
    } catch (e) {
      console.warn('[parsePDF] sales report parser fallback to factura mode:', e && e.message);
    }
  }

  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return parsePDFText(text, file.name, category);
}

// Parsea un PDF de inventario. Estrategia: mapeo por posición/índice cuando
// la fila tiene el mismo número de items que los headers (caso común en
// exports de Siigo, Alegra, etc.). Fallback a mapeo por proximidad X si
// el conteo no coincide.
async function parseInventoryPDF(pdf, filename) {
  const allItems = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    content.items.forEach(item => {
      const text = (item.str || '').trim();
      if (!text) return;
      allItems.push({
        text,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        page: i
      });
    });
  }

  if (allItems.length === 0) {
    throw new Error('PDF parece escaneado o vacío. Súbelo en Excel.');
  }

  const yTolerance = 3;
  const rowsRaw = [];
  for (const item of allItems) {
    const row = rowsRaw.find(r => r[0].page === item.page && Math.abs(r[0].y - item.y) <= yTolerance);
    if (row) row.push(item);
    else rowsRaw.push([item]);
  }

  rowsRaw.sort((a, b) => {
    if (a[0].page !== b[0].page) return a[0].page - b[0].page;
    return b[0].y - a[0].y;
  });
  rowsRaw.forEach(row => row.sort((a, b) => a.x - b.x));

  const allKeywords = [];
  Object.values(COL_MAP.inventario).forEach(arr => allKeywords.push(...arr));

  // Detectar fila de headers
  let headerIdx = -1;
  let headerNames = [];
  let headerItems = [];
  for (let i = 0; i < Math.min(25, rowsRaw.length); i++) {
    const row = rowsRaw[i];
    if (row.length < 2) continue;
    const matches = row.filter(item => {
      const norm = normalizeKey(item.text);
      if (!norm) return false;
      return allKeywords.some(k => norm === k || norm.includes(k));
    });
    if (matches.length >= 2) {
      headerIdx = i;
      headerNames = row.map(r => r.text.trim());
      headerItems = row.map(r => ({ name: r.text.trim(), x: r.x }));
      break;
    }
  }

  if (headerIdx === -1) {
    throw new Error('No se detectaron columnas estándar en el PDF (código, nombre, costo, existencia). Súbelo en Excel para máxima precisión.');
  }

  const numCols = headerNames.length;

  // Detectar columnas numéricas que Siigo formatea con ".000" decorativo.
  // Stock y costo unitario sufren el mismo problema: "800.000" debe leerse 800, no 800,000.
  const stockKeyOpts = ['existencia', 'existencias', 'stockactual', 'stock'];
  const stockKey = headerNames.find(h => {
    const n = normalizeKey(h);
    return stockKeyOpts.some(k => n === k);
  });
  const costoKeyOpts = ['costounitario', 'costopromedio', 'costoactual', 'preciocosto', 'valorcosto', 'costo'];
  const costoKey = headerNames.find(h => {
    const n = normalizeKey(h);
    return costoKeyOpts.some(k => n === k);
  });

  const items = [];
  rowsRaw.forEach((row, idx) => {
    if (idx <= headerIdx) return;

    // saltar re-headers en páginas siguientes
    const rowKeywords = row.filter(item => {
      const norm = normalizeKey(item.text);
      return allKeywords.some(k => norm === k);
    });
    if (rowKeywords.length >= 2) return;

    let obj = null;

    if (row.length === numCols) {
      // Mapeo por POSICIÓN: 1 a 1 con los headers (caso estándar Siigo)
      obj = {};
      headerNames.forEach((h, i) => { obj[h] = row[i].text.trim(); });
    } else if (row.length > 1 && row.length <= numCols + 2) {
      // Fallback: mapeo por proximidad X usando midpoints como boundaries
      obj = {};
      const sortedHeaders = [...headerItems].sort((a, b) => a.x - b.x);
      // Calcular boundaries (midpoint entre headers consecutivos)
      const boundaries = [];
      for (let k = 0; k < sortedHeaders.length - 1; k++) {
        boundaries.push((sortedHeaders[k].x + sortedHeaders[k + 1].x) / 2);
      }
      row.forEach(item => {
        let colIdx = sortedHeaders.length - 1;
        for (let k = 0; k < boundaries.length; k++) {
          if (item.x < boundaries[k]) { colIdx = k; break; }
        }
        const key = sortedHeaders[colIdx].name;
        obj[key] = obj[key] ? `${obj[key]} ${item.text}` : item.text;
      });
    } else {
      return; // fila rara, descartar
    }

    // Normalizar formato Siigo "N.000" en stock y costo unitario.
    // Sin esto, "800.000" se interpreta como 800,000 (separador de miles colombiano)
    // cuando en realidad es 800 con tres ceros decorativos de alineación.
    const stripSiigoZeros = (key) => {
      if (!key || !obj[key]) return;
      const v = String(obj[key]).trim();
      if (/^\d+\.0+$/.test(v)) obj[key] = v.replace(/\.0+$/, '');
    };
    stripSiigoZeros(stockKey);
    stripSiigoZeros(costoKey);

    items.push(obj);
  });

  const mapped = items.map(r => ({ ...mapInventarioRow(r), archivo: filename })).filter(r => r.codigo);

  if (mapped.length === 0) {
    throw new Error('PDF leído pero no se extrajeron productos con código. Súbelo en Excel.');
  }

  return mapped;
}

// Parsea un PDF que sea REPORTE DE VENTAS tabular (POS Maraldo y similares)
// con header CODIGO/DESCRIPCION/CANTIDAD/VALOR/TOTAL en cada pagina. Misma
// estrategia que parseInventoryPDF: extraer items con coordenadas (x, y, page),
// agrupar por Y, detectar headers, mapear por posicion (numCols match) o
// por proximidad X (fallback).
//
// IMPORTANTE: devuelve [] si NO detecta tabla (headerIdx === -1 o 0 mapped),
// para que el caller (parsePDF) caiga limpiamente al parsePDFText (modo
// factura individual). NO tira excepcion para no romper el flujo original.
async function parseSalesReportPDF(pdf, filename) {
  const allItems = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    content.items.forEach(item => {
      const text = (item.str || '').trim();
      if (!text) return;
      allItems.push({
        text,
        x: Math.round(item.transform[4]),
        y: Math.round(item.transform[5]),
        page: i
      });
    });
  }

  if (allItems.length === 0) return [];

  const yTolerance = 3;
  const rowsRaw = [];
  for (const item of allItems) {
    const row = rowsRaw.find(r => r[0].page === item.page && Math.abs(r[0].y - item.y) <= yTolerance);
    if (row) row.push(item);
    else rowsRaw.push([item]);
  }
  rowsRaw.sort((a, b) => {
    if (a[0].page !== b[0].page) return a[0].page - b[0].page;
    return b[0].y - a[0].y;
  });
  rowsRaw.forEach(row => row.sort((a, b) => a.x - b.x));

  // Detectar fila de headers — UNA sola fila con AL MENOS 4 columnas estandar
  // (codigo + descripcion + cantidad + total + valor/precio o unidad).
  // Threshold 4 (no 3) para evitar falsos positivos en filas de filtros como
  // "Sucursal:... Vendedor Ref:..." (que tienen 2 partial-matches y romperian
  // la deteccion). Reportes POS tabulares siempre tienen >=4 columnas reales.
  const allKeywords = [];
  Object.values(COL_MAP.ventas).forEach(arr => allKeywords.push(...arr));

  let headerIdx = -1;
  let headerNames = [];
  let headerItems = [];
  for (let i = 0; i < Math.min(25, rowsRaw.length); i++) {
    const row = rowsRaw[i];
    if (row.length < 4) continue;
    const matches = row.filter(item => {
      const norm = normalizeKey(item.text);
      if (!norm) return false;
      return allKeywords.some(k => norm === k || norm.includes(k));
    });
    // Mayoria de celdas deben ser keywords (50%+) — evita falsos positivos
    // donde una fila de filtros tiene 3-4 matches por partial pero la mayoria
    // de la fila es texto normal.
    if (matches.length >= 4 && matches.length / row.length >= 0.5) {
      headerIdx = i;
      headerNames = row.map(r => r.text.trim());
      headerItems = row.map(r => ({ name: r.text.trim(), x: r.x }));
      break;
    }
  }

  if (headerIdx === -1) return []; // No es tabular -> fallback parsePDFText
  const numCols = headerNames.length;

  const items = [];
  rowsRaw.forEach((row, idx) => {
    if (idx <= headerIdx) return;

    // Skip re-headers en paginas siguientes
    const rowKeywords = row.filter(item => {
      const norm = normalizeKey(item.text);
      return allKeywords.some(k => norm === k);
    });
    if (rowKeywords.length >= 3) return;

    // Skip subheaders, metadata del reporte y fila final TOTAL VENTA DE ARTICULOS
    const rowText = row.map(r => r.text).join(' ').trim();
    // Headers repetidos por pagina (POS Maraldo: "MARALDO LAURELES 2026 PAG: N", "Fecha: ...", etc)
    if (/^[A-Z][A-Z\s]{4,}\s+\d{4}\s+PAG:/i.test(rowText)) return; // "EMPRESA NOMBRE YYYY PAG:..."
    if (/^Fecha:\s*\d/i.test(rowText)) return;
    if (/^PAG:/i.test(rowText)) return;
    if (/^VENTA\s+TOTAL\s+DE\s+ARTICULOS$|^VALOR\s+PROM/i.test(rowText)) return;
    if (/^(Sucursal|Bodega|Zonas|Vendedor|Cliente|Usuario|[ÁA]rea|Linea|Clasificaci[oó]n|Centro\s+de\s+Costo|Fechas|Despachar):/i.test(rowText)) return;
    // Fila final "TOTAL VENTA DE ARTICULOS 3,758.00 213,138,224.88" o subtotales por grupo
    if (/^TOTAL\s+VENTA\s+DE\s+ARTICULOS|^TOTAL(ES)?\s+(GENERAL|INFORME)/i.test(rowText)) return;
    // Primera celda empieza con TOTAL (subtotales por dia/grupo)
    if (row[0] && /^TOTAL(ES)?\b/i.test(row[0].text.trim())) return;
    // Re-header columna repetido en cada pagina (primera celda = "CODIGO" exact)
    if (row[0] && /^CODIGO$/i.test(row[0].text.trim())) return;
    // Fix 2026-05-27 (Maraldo VENTA ABRIL bug $132K extra): "Grupo:" no estaba
    // en el regex de metadata superior, asi que filas tipo "Grupo: TODOS Fecha:..."
    // se procesaban como producto. Agregamos cobertura defensiva.
    if (/^Grupo:/i.test(rowText)) return;

    let obj = null;

    // === MAPEO UNIDAD-AWARE (Fix 2026-05-27 $669K perdidos Maraldo) ===
    // Cuando el PDF tiene columna UNIDAD, usar el token UND/PAR/BLS/KIT/CJA/etc
    // como ancla para detectar donde empiezan las columnas posteriores
    // (CANTIDAD, VALOR_VENTA, etc). Esto corrige 2 casos comunes:
    //
    // 1) Descripcion multi-palabra (ej "BL047007 ROSADO CUERO UND 2.00 ..."):
    //    row.length = numCols pero "CUERO" cae en UNIDAD y desplaza todo.
    //    Mapeo 1:1 posicional leeria 2.00 en VALOR_VENTA -> $2 en vez de $109,243.
    //
    // 2) Fila sin UND/PAR (ej "BLS1908 NEGRO 4.00 283,626.29 ..."): row.length
    //    = numCols-1. Saltar la columna UNIDAD para que CANTIDAD/VALOR_VENTA
    //    se mapeen correctamente.
    const unidadHeaderIdx = headerNames.findIndex(h => /^UNIDAD$|^UND$|^UM$/i.test(h.trim()));
    const TOKENS_UNIDAD_RE = /^(UND|PAR|BLS|KIT|CJA|BOL|PQT|PIE|LTS|MTS|BL|LIT|MT|UN)$/i;
    const unidadRowIdx = row.findIndex(it => TOKENS_UNIDAD_RE.test(it.text.trim()));

    if (row.length === numCols && unidadHeaderIdx >= 0 && unidadRowIdx === unidadHeaderIdx) {
      // Caso ideal: UND/PAR esta exactamente donde el header dice UNIDAD -> mapeo 1:1
      obj = {};
      headerNames.forEach((h, i) => { obj[h] = row[i].text.trim(); });
    } else if (unidadHeaderIdx >= 0 && unidadRowIdx > 0) {
      // Fix #6 2026-05-28: requerir unidadRowIdx > 0 (no >= 0). Si UND/PAR esta
      // en posicion 0 (caso muy raro), row[0] se usaria como CODIGO Y UNIDAD a
      // la vez, perdiendo el producto. Mejor caer al fallback de proximidad X.
      //
      // UND/PAR identificado en la fila. Mapeo robusto en 2 partes:
      //  - Lado IZQUIERDO (CODIGO + DESCRIPCION): combinar items [1, unidadRowIdx-1] como DESCRIPCION
      //  - Lado DERECHO (post-UNIDAD): mapear cada item por PROXIMIDAD X al header correspondiente
      //
      // Fix 2026-05-27 (Maraldo COGS bug): productos del PDF Maraldo omiten
      // columnas distintas segun el caso (PLTF948001 omite CANTIDAD, 0001
      // DOMICILIOS omite COSTO). No hay heuristica universal de "que columna
      // falta", pero los X de los items siguen aproximadamente las posiciones
      // de los headers. Usar proximidad X resuelve ambos casos correctamente.
      obj = {};
      obj[headerNames[0]] = row[0].text.trim(); // CODIGO
      const descParts = [];
      for (let i = 1; i < unidadRowIdx; i++) descParts.push(row[i].text.trim());
      obj[headerNames[1]] = descParts.join(' ');
      for (let k = 2; k < unidadHeaderIdx; k++) obj[headerNames[k]] = '';
      obj[headerNames[unidadHeaderIdx]] = row[unidadRowIdx].text.trim();
      // Lado derecho: mapear cada item por proximidad X + resolver colisiones
      // Cuando 2+ items caen en la misma columna (caso DOMICILIOS donde "3.00"
      // y "49,000.00" ambos caen en VALOR_VENTA por estar cerca del boundary),
      // mover el item con MENOR X a la columna anterior si esta vacia.
      const headersDerechaItems = headerItems.slice(unidadHeaderIdx + 1);
      headersDerechaItems.forEach(h => { obj[h.name] = ''; });
      const itemsPorCol = new Map(); // colIdx -> [item, item, ...]
      for (let i = unidadRowIdx + 1; i < row.length; i++) {
        const item = row[i];
        let bestIdx = 0;
        let bestDist = Math.abs(item.x - headersDerechaItems[0].x);
        for (let k = 1; k < headersDerechaItems.length; k++) {
          const dist = Math.abs(item.x - headersDerechaItems[k].x);
          if (dist < bestDist) { bestIdx = k; bestDist = dist; }
        }
        if (!itemsPorCol.has(bestIdx)) itemsPorCol.set(bestIdx, []);
        itemsPorCol.get(bestIdx).push(item);
      }
      // Resolver colisiones: si col k tiene 2+ items y col k-1 esta vacia,
      // mover el item con MENOR X (mas a la izquierda) a k-1. Repetir si necesario.
      let resolved = false;
      let iterations = 0;
      while (!resolved && iterations < 5) {
        resolved = true;
        const cols = Array.from(itemsPorCol.keys()).sort((a, b) => a - b);
        for (const col of cols) {
          const its = itemsPorCol.get(col);
          if (its.length > 1 && col > 0 && !itemsPorCol.has(col - 1)) {
            its.sort((a, b) => a.x - b.x);
            const moved = its.shift();
            itemsPorCol.set(col - 1, [moved]);
            resolved = false;
            break;
          }
        }
        iterations++;
      }
      // Asignar a obj
      // Fix #7 2026-05-28: si tras el loop quedan 2+ items en misma columna
      // (caso que el resolver de colisiones no logro deshacer en 5 iter),
      // preferir el item con MAYOR X (es el dato monetario mas a la derecha
      // de la columna). Concatenar daria un parseNumber bug (ej "3.00 49000"
      // se parsea como 3.0 perdiendo el valor real).
      itemsPorCol.forEach((its, idx) => {
        its.sort((a, b) => a.x - b.x);
        const key = headersDerechaItems[idx].name;
        if (its.length > 1) {
          obj[key] = its[its.length - 1].text.trim();
        } else {
          obj[key] = its[0].text.trim();
        }
      });
    } else if (row.length === numCols - 1 && unidadHeaderIdx >= 0 && unidadRowIdx === -1) {
      // No hay UND/PAR en la fila (POS lo omitio para este producto). Mapear
      // posicional saltando la columna UNIDAD.
      obj = {};
      let rowIdx = 0;
      headerNames.forEach((h, i) => {
        if (i === unidadHeaderIdx) { obj[h] = ''; return; }
        if (rowIdx < row.length) {
          obj[h] = row[rowIdx].text.trim();
          rowIdx++;
        }
      });
    } else if (row.length === numCols) {
      // PDF sin columna UNIDAD (otros formatos POS): mapeo 1:1 directo
      obj = {};
      headerNames.forEach((h, i) => { obj[h] = row[i].text.trim(); });
    } else if (row.length > 1 && row.length <= numCols * 2) {
      // Fallback: mapeo por proximidad X (caso fila con celdas mergeadas, ej
      // producto sin UNIDAD, descripcion multi-palabra que ocupa varios items).
      //
      // Threshold ampliado 2026-05-27 de numCols+2 a numCols*2 para soportar
      // descripciones con muchas palabras. Bug reportado: VENTA ABRIL.pdf de
      // Maraldo Laureles tenia items tipo "BODY AMANDA CAFE COPA 34" (5 palabras
      // de descripcion -> row.length=12 con numCols=8). Con threshold viejo
      // numCols+2=10 estas filas se descartaban como "fila rara" -> dashboard
      // perdia $669,806 vs ground truth POS de $255,433,091.
      // Los filtros previos (lineas 880-895) ya excluyen metadata/headers/
      // totales/subtotales antes de llegar aqui, asi que ampliar el threshold
      // no introduce falsos positivos.
      obj = {};
      const sortedHeaders = [...headerItems].sort((a, b) => a.x - b.x);
      const boundaries = [];
      for (let k = 0; k < sortedHeaders.length - 1; k++) {
        boundaries.push((sortedHeaders[k].x + sortedHeaders[k + 1].x) / 2);
      }
      row.forEach(item => {
        let colIdx = sortedHeaders.length - 1;
        for (let k = 0; k < boundaries.length; k++) {
          if (item.x < boundaries[k]) { colIdx = k; break; }
        }
        const key = sortedHeaders[colIdx].name;
        obj[key] = obj[key] ? `${obj[key]} ${item.text}` : item.text;
      });
    } else {
      return; // fila rara, descartar
    }

    items.push(obj);
  });

  // Detectar si el PDF tiene columna SUBTOTAL/BASE explicita.
  // Reportes POS retail Col (Maraldo) solo tienen CODIGO/DESC/UNIDAD/CANT/VALOR PROM/TOTAL,
  // sin separar IVA por linea. mapVentaRow puede mapear erroneamente VALOR PROM.
  // a 'subtotal' via partial-match 'valor' (keyword incluido en COL_MAP.ventas.subtotal),
  // resultando en subtotal = precio promedio (no el total real).
  // Si NO hay header subtotal/base explicito, forzamos subtotal = total.
  // El dashboard luego separa IVA dividiendo /1.19 si toggle 'Facturo con IVA' ON.
  const SUBTOTAL_HEADER_KEYS = ['subtotal', 'base', 'valorbase', 'baseimponible', 'totalsiniva', 'subt'];
  const hasSubtotalHeader = headerNames.some(h => SUBTOTAL_HEADER_KEYS.includes(normalizeKey(h)));

  // Mapear a estructura ventas usando mapVentaRow existente (mismo flujo que Excel).
  // Filtro: requerir codigo + dato MONETARIO no-cero (subtotal o total).
  // No usar cantidad: mapVentaRow tiene default `cantidad=1` que dispara falsos
  // positivos en filas multi-linea donde solo aparece "CODIGO UND" sin monto
  // (el monto real se atribuye a otra fila). Devoluciones (sub<0 o total<0)
  // siguen pasando porque !=0 es true para negativos.
  let mapped = items
    .map(r => {
      const v = mapVentaRow(r);
      // Fix 2026-05-25: reporte POS sin SUBTOTAL/BASE explicita -> subtotal=total
      // para no contaminar KPI "Ventas (base sin IVA)" con suma de precios promedio.
      if (!hasSubtotalHeader && v.total) {
        v.subtotal = v.total;
        v.iva = 0;
      }
      return { ...v, archivo: filename };
    })
    .filter(r => r.codigo && (r.subtotal !== 0 || r.total !== 0));

  // PROYECCION A 30 DIAS: identico a parseExcel linea 597-607.
  // Sin esto, el dashboard divide el raw por factor en el bloque "informe"
  // (mostrando $163M en vez de $213M para 23 dias) y el bloque "proyeccion"
  // muestra el raw (interpretandolo como ya escalado). Resultado: valor real
  // del PDF aparece en "proyeccion 30 dias" y valor reducido en "informe 23 dias".
  if (state.ventasPeriodoFactor && Math.abs(state.ventasPeriodoFactor - 1) >= 0.001) {
    const f = state.ventasPeriodoFactor;
    mapped = mapped.map(v => ({
      ...v,
      cantidad: Math.round((v.cantidad || 0) * f),
      subtotal: (v.subtotal || 0) * f,
      iva: (v.iva || 0) * f,
      total: (v.total || 0) * f
      // precio (unitario) no se escala porque no depende del periodo
    }));
  }

  return mapped;
}

function parsePDFText(text, filename, category) {
  // Detect if scanned (almost no text)
  if (text.trim().length < 50) {
    throw new Error('PDF parece escaneado (sin texto). Súbelo en Excel.');
  }

  // === FECHA ROBUSTA (v4) ===
  // Bug: regex tomaba PRIMERA fecha del texto, pero esa suele ser "Resolución DIAN del XX/XX/XXXX"
  // o "Numeración vigente desde/hasta" — NO la fecha del documento.
  // Fix 3 niveles de prioridad:
  //   1. Label especifico ("Fecha factura:", "FECHA FACTURA:", "Fecha emisión", "Generación:", "Fecha y hora", "Fecha:")
  //   2. Cualquier fecha NO precedida por contextos filtrados (Resolución/Vigencia/Numeración/Desde/Hasta/Autorretenedores/prefijo)
  //   3. Fallback: primera fecha del texto (comportamiento legacy)
  // Soporta formatos: DD/MM/AAAA, AAAA-MM-DD, DD/Mes/AAAA (28/Feb/2026), "28 de febrero de 2026"
  let fecha = null;
  const DATE_PATTERN = '(?:\\d{1,2}[/\\-](?:\\d{1,2}|[A-Za-zñÑ]{3,12})[/\\-]\\d{2,4}|\\d{4}[/\\-]\\d{1,2}[/\\-]\\d{1,2}|\\d{1,2}\\s+de\\s+[A-Za-zñÑ]{3,12}\\s+de\\s+\\d{4})';
  const isValidYear = (d) => d && d.getFullYear() > 2000 && d.getFullYear() < 2100;

  // NIVEL 1: label especifico cerca de fecha
  // Agente A ampliado: Siigo Nube ("Fecha de elaboración"), Alegra, Helisa, Loggro,
  // World Office ("Fecha elaboración"), DIAN literal ("Fecha y hora de generación/expedicion",
  // "FecFac"), Terpel térmico ("Fec:" abreviado), cuentas de cobro ("Ciudad, DD de mmmm")
  const LABELS_FECHA = [
    'FECHA\\s+FACTURA',
    'Fecha\\s+factura',
    'Fecha\\s+(?:de\\s+)?emisi[óo]n',
    'Fecha\\s+(?:de\\s+)?elaboraci[óo]n',
    'Fecha\\s+(?:de\\s+)?generaci[óo]n(?:\\s+Erp)?',
    'Fecha\\s+y\\s+hora\\s+(?:de\\s+)?(?:generaci[óo]n|comprobante|expedici[oó]n|factura)',
    'Fecha\\s+y\\s+hora',
    'Fecha\\s+(?:de\\s+)?expedici[óo]n',
    'Fec[Ff]ac',
    'Generaci[óo]n',
    'Expedici[óo]n',
    'Elaboraci[óo]n',
    'Date\\s*\\/\\s*Fecha',
    'Issue\\s+date',
    'Fec(?:ha)?(?!\\s+(?:V|venc|de\\s+venc|vencimiento|vto|l[ií]mite|de\\s+suspensi[óo]n|de\\s+inscripci[óo]n))[:\\.]',  // "Fec:" / "Fec." Terpel térmico
    'Fecha(?!\\s+(?:V|venc|de\\s+venc|vencimiento|vto|l[ií]mite|de\\s+suspensi[óo]n|de\\s+inscripci[óo]n))',
    'FECHA(?!\\s+(?:V|venc|de\\s+venc|vencimiento|vto|l[ií]mite|de\\s+suspensi[óo]n|de\\s+inscripci[óo]n))',
  ];
  for (const label of LABELS_FECHA) {
    const re = new RegExp(label + '[:\\s]{0,8}(' + DATE_PATTERN + ')', 'i');
    const m = text.match(re);
    if (m) {
      const d = parseDate(m[1]);
      if (isValidYear(d)) { fecha = d; break; }
    }
  }

  // NIVEL 2: fechas NO precedidas por contextos no-documento
  // Agente A ampliado: agregar habilitacion, autorizacion vigente, fecha limite/suspension,
  // proxima lectura, periodo facturado, fecha inscripcion RUT
  if (!fecha) {
    const FILTRO_CONTEXTO = /(resoluci[oó]n|vigencia|vigente|numeraci[oó]n|aprobad[oa]\s+en|autorretenedores|prefijo|habilitaci[oó]n|autorizaci[oó]n|desde\s*el?|hasta\s*el?|\bdel\b|\bde\b\s+\d|periodo|lectura|l[ií]mite|suspensi[óo]n|inscripci[oó]n|venc(?:\.|imiento)?|vto|pr[oó]xima)\s*$/i;
    const reAll = new RegExp(DATE_PATTERN, 'gi');
    let mm;
    while ((mm = reAll.exec(text)) !== null) {
      const before = text.slice(Math.max(0, mm.index - 40), mm.index);
      if (FILTRO_CONTEXTO.test(before)) continue;
      const d = parseDate(mm[0]);
      if (isValidYear(d)) { fecha = d; break; }
    }
  }

  // NIVEL 3 fallback: comportamiento legacy (primera fecha del texto)
  if (!fecha) {
    const dateMatches = text.match(new RegExp(DATE_PATTERN, 'gi'));
    if (dateMatches) {
      for (const md of dateMatches) {
        const d = parseDate(md);
        if (isValidYear(d)) { fecha = d; break; }
      }
    }
  }

  // === IVA ROBUSTO (v3 ampliado) ===
  // Agente A: agregar "Impuesto sobre las Ventas", "Total IVA", "Impto.", "Vlr. Impto."
  // Agente A: BAJAR filtro a >=10 (facturas pequeñas tienen IVA bajo, Caso 9)
  // Excluir "INC" (Impuesto Nacional al Consumo restaurantes 8%) e "IBUA" (no son IVA)
  let iva = 0;
  const ivaMatches = [];
  const ivaRegex = /(?:iva|impuesto\s*sobre\s*las?\s*ventas?|impto\.?|vlr\.?\s*impto\.?|total\s*iva)[\s:\.]*(?:\d{1,3}[\.,]?\d*\s*%)?[\s:\$]*(?:COP|USD|EUR)?\s*\$?\s*([\d][\d.,]+)/gi;
  let m;
  while ((m = ivaRegex.exec(text)) !== null) {
    const pos = m.index;
    const before = text.slice(Math.max(0, pos - 20), pos).toLowerCase();
    // Excluir contextos NO-IVA (INC, IBUA, ICUI, IPC)
    if (/(?:inc|ibua|icui|impuesto\s+nacional)\s*$/i.test(before)) continue;
    const val = parseNumber(m[1]);
    if (val >= 10) ivaMatches.push(val);
  }
  if (ivaMatches.length > 0) iva = Math.max(...ivaMatches);

  // === TOTAL ROBUSTO (v3 ampliado) ===
  // Agente A: agregar "Valor Total de la venta", "Total Neto", "Total Factura", "Total Documento",
  //           "Gran Total", "Neto a Pagar", "Precio Neto", "Total Operacion"
  // Agente C Caso 7: "T O T A L" espaciado (POS termico restaurantes)
  // Agente C Caso 2: "Valor:" + "Cuantia" (cuentas de cobro)
  // Filtros: ignorar "SALDO A PAGAR" / "CUOTA A PAGAR" (estados de cuenta)
  let total = 0;
  const totalRegex = /(?:total\s*a\s*pagar|valor\s*total(?:\s*de\s*la\s*venta)?|valor\s*a\s*pagar|a\s*pagar|totales?|total\s*factura|total\s*documento|total\s*neto|neto\s*a\s*pagar|gran\s*total|precio\s*neto|total\s*operaci[óo]n|t\s+o\s+t\s+a\s+l|cuant[ií]a|suma\s*de)[^\d\n]{0,12}\$?\s*([\d][\d.,]{3,})/gi;
  const totalMatches = [];
  while ((m = totalRegex.exec(text)) !== null) {
    const pos = m.index;
    const before = text.slice(Math.max(0, pos - 30), pos).toLowerCase();
    if (/(saldo|cuota|anterior|abono|pendiente|sub)\s*$/.test(before)) continue;
    const val = parseNumber(m[1]);
    if (val >= 1000) totalMatches.push(val);
  }
  if (totalMatches.length > 0) total = Math.max(...totalMatches);

  // === SUBTOTAL ROBUSTO (v3 ampliado) ===
  // Agente A: agregar "Valor Bruto", "Vlr. Bruto", "Total Antes de Impuestos", "Base IVA"
  // Agente C Caso 4/8: filtrar "Subtotal + IVA" (incluye IVA, NO es subtotal real)
  let subtotal = 0;
  const subRegex = /(?:total\s*bruto|subtotal(?!\s*\+)|base\s*imponible|base\s*gravable|valor\s*base|vlr\.?\s*bruto|valor\s*bruto|total\s*antes\s*de\s*impuestos?|base\s*iva|\bbruto\b)[^\d\n]{0,12}\$?\s*([\d][\d.,]{3,})/gi;
  const subMatches = [];
  while ((m = subRegex.exec(text)) !== null) {
    const val = parseNumber(m[1]);
    if (val >= 1000) subMatches.push(val);
  }
  if (subMatches.length > 0) subtotal = Math.max(...subMatches);

  // Si subtotal no se detecto pero total si y iva si -> derivar
  if (!subtotal && total && iva) subtotal = total - iva;
  // Si total no se detecto pero subtotal si -> derivar (con iva o sin)
  if (!total && subtotal) total = subtotal + iva;
  // Si ni total ni subtotal pero iva si -> error
  if (!total && !subtotal) {
    throw new Error('No se pudo extraer el total de la factura PDF');
  }

  // === FACTURA NUMERO ROBUSTO ===
  // Bug viejo: /(?:factura|fac|fe|fv)[:\s\-#]*([a-z0-9\-]{2,20})/i ante "Factura electronica de venta No. FE 711"
  // capturaba "electronica" (palabra siguiente). Fix: buscar "No." o "#" o "N°" como anchor PRO con filtro de contexto.
  // Tambien excluye contextos "Resolucion N°", "CUFE", "Autorizacion N°" (NO son numeros de factura).
  // Agente A: agregar prefijos FEV, FVE, SETP, POS, POSE, NC, NCE, ND, NDE, DS, CC
  // Agente A: filtrar CUFE/CUDE 96-chars hex
  // Agente C Caso 5: agregar Contrato/Referencia para servicios publicos
  let factura = '';
  const facCandidates = [];
  const facRegex = /(?:No\.?|N[°º]\.?|#|N[uú]mero|Contrato|Referencia|Fact\s*POS)\s*([A-Z]{0,6}[\-\s]?\d{2,15}[A-Z0-9\-]*)/gi;
  let fm;
  while ((fm = facRegex.exec(text)) !== null) {
    const pos = fm.index;
    const before = text.slice(Math.max(0, pos - 50), pos).toLowerCase();
    if (/(resoluci[oó]n|cufe|cude|autorizaci[oó]n|aprobado en|del\s+\d|desde\s+\w|hasta\s+\w|prefijo)/.test(before)) continue;
    const captured = fm[1].replace(/\s+/g, '').slice(0, 25);
    // Filtrar si parece hash CUFE/CUDE (>50 chars o todo hex)
    if (captured.length > 30 || /^[a-f0-9]{32,}$/i.test(captured)) continue;
    facCandidates.push(captured);
  }
  factura = facCandidates.find(c => /[A-Z]/.test(c)) || facCandidates[0] || '';
  if (!factura) {
    const m2 = text.match(/\b(FE|FV|FEV|FVE|SETP|SETT|FECP|POS|POSE|TPOS|NC|NCE|ND|NDE|DS|DSNE|REM|REMISION|TENJ|FM\d*)\s*#?\s*[\-\s]?(\d{2,15}[A-Z0-9\-]*)/i);
    if (m2) factura = (m2[1] + m2[2]).slice(0, 25);
  }

  // === PROVEEDOR (regex global sobre TODO el texto, no por lineas) ===
  // pdf.js junta items con espacios -> no hay lineas reales. Buscar patrones distintivos.
  let proveedor = '';

  // Patron A: nombre + sufijo legal en HEADER (primeros 1500 chars)
  // Adv-FIX 10: charset con mayusculas acentuadas (DROGUERÍA con I tilde)
  // Agente A: agregar S.A., E.U., E.S.P., & CIA, SAS BIC
  const headTxt = text.slice(0, 1500);
  const SUFIJO_LEGAL = '(SAS|S\\.A\\.S\\.?(?:\\s*BIC)?|S\\.A\\.?|LTDA\\.?|LTD\\.?|CIA\\.?|E\\.U\\.?|E\\.S\\.P\\.?|S\\.\\s*EN\\s*C\\.?|&?\\s*CIA\\.?)';
  const reA = new RegExp('\\b([A-ZÑÁÉÍÓÚ][a-zñáéíóúA-ZÁÉÍÓÚÑ\\.]{1,30}(?:\\s+[A-ZÑÁÉÍÓÚ&][a-zñáéíóúA-ZÁÉÍÓÚÑ\\.]{0,30}){0,4})\\s+' + SUFIJO_LEGAL + '\\b');
  const mA = headTxt.match(reA);
  if (mA) proveedor = (mA[1] + ' ' + mA[2]).trim().replace(/\s+/g, ' ');
  // Fallback: TODO el texto (NALSANI aparece solo en clausula)
  if (!proveedor) {
    const mA2 = text.match(reA);
    if (mA2) {
      const cap = (mA2[1] + ' ' + mA2[2]).trim().replace(/\s+/g, ' ');
      if (!/\b(seg[uú]n|para que|favor|autorizo|presente|aplican|com[uú]n|persona)\b/i.test(mA2[1])) {
        proveedor = cap;
      }
    }
  }

  // Patron B: nombre + rubro tipico Col (ampliado por Agente A)
  if (!proveedor) {
    const RUBROS = 'ACCESORIOS|MODA|MUEBLES|TEXTILES|CALZADO|CONFECCIONES|DISTRIBUCIONES|COMERCIALIZADORA|PRODUCTOS|SUMINISTROS|MARKETING|FERRETER[IÍ]A|DROGUER[IÍ]A|PAPELER[IÍ]A|JOYER[IÍ]A|FARMACIA|RESTAURANTE|COMIDAS|PANADER[IÍ]A|FLORER[IÍ]A|OPTICA|PELUQUER[IÍ]A|ESTETICA|LAVANDER[IÍ]A|CAFETER[IÍ]A|HELADER[IÍ]A|LICORERA|MINIMERCADO|AUTOSERVICIO|SUPERMERCADO|PIZZER[IÍ]A|MISCEL[AÁ]NEA|VARIEDADES|REPUESTOS|AUTOPARTES|LLANTAS|LUBRICANTES|ESTACION\\s*DE\\s*SERVICIO|GASOLINA|COMBUSTIBLE|TRANSPORTE|MENSAJER[IÍ]A|IMPRENTA|LITOGRAF[IÍ]A|PUBLICIDAD|EVENTOS|AGENCIA|INMOBILIARIA|NOTAR[IÍ]A|ABOGADOS|CONSULTORES|INGENIER[IÍ]A|ARQUITECTURA|CONTADUR[IÍ]A|ODONTOLOG[IÍ]A|CL[IÍ]NICA|LABORATORIO';
    const reB = new RegExp('\\b([A-ZÑÁÉÍÓÚ]{2,20}\\s+(?:' + RUBROS + '))\\b');
    const mB = text.match(reB);
    if (mB) proveedor = mB[1].trim();
  }

  // Patron C: persona natural / empresa MAYUS seguida de "NIT" (primeros 800 chars)
  if (!proveedor) {
    const head = text.slice(0, 800);
    const mC = head.match(/\b([A-ZÑÁÉÍÓÚ]{3,}(?:\s+[A-ZÑÁÉÍÓÚ]{2,}){1,4})\s+NIT\b/);
    if (mC) {
      const candidate = mC[1].trim();
      if (!/^(FACTURA|REMISION|DOCUMENTO|CUENTA|RECIBO|RESPONSABLE|SOMOS|ACTIVIDAD|RESOLUCION|RESPONSABLES)/i.test(candidate)) {
        proveedor = candidate;
      }
    }
  }
  // Patron D (nuevo Agente C Caso 1): "EDS XXX" / "ESTACION DE SERVICIO XXX" (gasolineras Terpel/Texaco/Esso/Mobil)
  if (!proveedor) {
    const mD = text.match(/\b(EDS\s+[A-ZÑÁÉÍÓÚ\s]+?|ESTACI[OÓ]N\s+DE\s+SERVICIO\s+[A-ZÑÁÉÍÓÚ\s]+?|TERPEL\s+[A-ZÑÁÉÍÓÚ\s]*?|TEXACO|MOBIL|ESSO|BIOMAX)\s+NIT/);
    if (mD) proveedor = mD[1].trim();
  }
  proveedor = proveedor.replace(/[\s\.,;\-]+$/, '');

  // === CONCEPTO ===
  // Antes: '(factura PDF)' generico para todos. Ahora: usar proveedor o filename (sin ext).
  const fileNameSinExt = filename.replace(/\.(pdf|PDF)$/i, '').trim();
  const concepto = proveedor || fileNameSinExt || '(factura PDF)';

  // === TIPO DE DOCUMENTO (deteccion automatica) ===
  // Detecta: Remision, Factura Electronica, Factura, Recibo, Cuenta de Cobro, Nota Credito, default Documento PDF
  let tipoDoc = 'DOCUMENTO PDF';
  const textUpper = text.toUpperCase();
  if (/REMISI[OÓ]N|REM\s*#|\bREM\s+\d/.test(textUpper) && !/FACTURA\s+ELECTR[OÓ]NICA/.test(textUpper)) {
    tipoDoc = 'REMISIÓN';
  } else if (/FACTURA\s+ELECTR[OÓ]NICA|CUFE/.test(textUpper)) {
    tipoDoc = 'FACTURA ELECTRÓNICA';
  } else if (/NOTA\s+(CR[EÉ]DITO|D[EÉ]BITO)/.test(textUpper)) {
    tipoDoc = 'NOTA CRÉDITO';
  } else if (/CUENTA\s+DE\s+COBRO/.test(textUpper)) {
    tipoDoc = 'CUENTA DE COBRO';
  } else if (/\bFACTURA\b/.test(textUpper)) {
    tipoDoc = 'FACTURA';
  } else if (/\bRECIBO\b/.test(textUpper)) {
    tipoDoc = 'RECIBO';
  }

  if (category === 'ventas') {
    return [{
      archivo: filename,
      codigo: '',
      descripcion: '(factura PDF — sin detalle de productos)',
      cantidad: 1,
      precio: subtotal || total,
      subtotal: subtotal || (total - iva),
      iva: iva,
      total: total || (subtotal + iva),
      fecha,
      factura,
      cliente: '',
      tipoDoc: tipoDoc,                 // MEDIUM-4 review fix: tambien expuesto en ventas
      _pdfTotalOnly: true
    }];
  } else if (category === 'gastos') {
    return [{
      archivo: filename,
      tipoDoc: tipoDoc,
      concepto: concepto,
      proveedor: proveedor,
      subtotal: subtotal || (total - iva),
      iva: iva,
      total: total || (subtotal + iva),
      fecha,
      factura
    }];
  }
  // Inventario PDF se maneja en parseInventoryPDF (table-aware) directamente desde parsePDF
}

async function parseFile(file, category) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return await parseExcel(file, category);
  } else if (ext === 'pdf') {
    return await parsePDF(file, category);
  } else {
    throw new Error(`Formato no soportado: .${ext}`);
  }
}

/* ============= CALC FINANCIERO ============= */

function filterByMonth(items) {
  if (state.filterMonth === 'all') return items;
  return items.filter(i => i.fecha && monthKey(i.fecha) === state.filterMonth);
}

function calc() {
  const ventas = filterByMonth(state.ventas);
  const gastos = filterByMonth(state.gastos);

  // Si NO responsable de IVA: trata el total como neto (no separa base/IVA)
  const totalVentas = state.conIva
    ? ventas.reduce((s, v) => s + (v.subtotal || 0), 0)
    : ventas.reduce((s, v) => s + (v.total || v.subtotal || 0), 0);
  const totalGastos = state.conIva
    ? gastos.reduce((s, g) => s + (g.subtotal || 0), 0)
    : gastos.reduce((s, g) => s + (g.total || g.subtotal || 0), 0);

  const ivaGenerado = state.conIva ? ventas.reduce((s, v) => s + (v.iva || 0), 0) : 0;
  const ivaDescontable = state.conIva ? gastos.reduce((s, g) => s + (g.iva || 0), 0) : 0;
  const saldoDian = state.conIva ? ivaGenerado - ivaDescontable : 0;

  // COGS cross-reference
  let cogs = null, utilidadBruta = null, margen = null;
  let productosSinCosto = [];
  let utilOperacional = null;

  const ventasConCodigo = ventas.filter(v => v.codigo && !v._pdfTotalOnly);
  if (ventasConCodigo.length > 0 && state.inventario.length > 0) {
    const invMap = new Map();
    state.inventario.forEach(i => {
      if (i.codigo) invMap.set(i.codigo.toUpperCase(), i);
    });
    let cogsSum = 0;
    const yaSinCosto = new Set();
    ventasConCodigo.forEach(v => {
      const k = v.codigo.toUpperCase();
      // Cruce con tiebreak por descripción: si "103" en ventas y descripción
      // "ESTAMPADA", evita matchear con inv "103" PANTALONETA y prefiere "00103" ESTAMPADA.
      const invItem = findBestInventoryMatch(k, v.descripcion, invMap);
      const costo = invItem?.costoUnitario;
      if (costo && costo > 0) {
        cogsSum += v.cantidad * costo;
      } else if ((v.cantidad || 0) > 0 && !yaSinCosto.has(k)) {
        yaSinCosto.add(k);
        productosSinCosto.push({ codigo: v.codigo, descripcion: v.descripcion });
      }
    });
    cogs = cogsSum;
    utilidadBruta = totalVentas - cogs;
    margen = totalVentas > 0 ? utilidadBruta / totalVentas : 0;
    utilOperacional = utilidadBruta - totalGastos;
  } else {
    utilOperacional = totalVentas - totalGastos;
  }

  // Inventario a costo + rotación
  let inventarioACosto = 0;
  state.inventario.forEach(i => {
    if (i.stockActual && i.costoUnitario) inventarioACosto += i.stockActual * i.costoUnitario;
  });
  let diasInventario = null, rotacionMensual = null;
  if (inventarioACosto > 0 && cogs && cogs > 0) {
    diasInventario = (inventarioACosto / cogs) * 30;
    rotacionMensual = cogs / inventarioACosto;
  }

  // Solo recolectar las KEYS de meses para alimentar el filtro de mes del header
  // (los valores totales ya no se usan tras eliminar el chart Evolucion Mensual).
  // Esto evita un loop O(n) sobre ventasConCodigo + findBestInventoryMatch en cada render.
  const meses = new Map();
  ventas.forEach(v => {
    if (!v.fecha) return;
    const k = monthKey(v.fecha);
    if (!meses.has(k)) meses.set(k, { ventas: 0, gastos: 0, cogs: 0 });
  });
  gastos.forEach(g => {
    if (!g.fecha) return;
    const k = monthKey(g.fecha);
    if (!meses.has(k)) meses.set(k, { ventas: 0, gastos: 0, cogs: 0 });
  });

  return {
    totalVentas, ivaGenerado, totalGastos, ivaDescontable, saldoDian,
    cogs, utilidadBruta, margen, utilOperacional,
    inventarioACosto, diasInventario, rotacionMensual,
    productosSinCosto,
    ventasCount: ventas.length, gastosCount: gastos.length,
    meses: Array.from(meses.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  };
}

/* ============= RENDER ============= */

// Aplica visibilidad del upload-box de inventario y de los KPIs/secciones que
// dependen de stock. Cuando manejaInventario === false (empresa de servicios o
// dropshipping), se ocultan: upload inventario, KPI COGS/Utilidad bruta/Margen
// bruto. Las secciones de rotacion/reorden/rentabilidad/sobrestock/sin-costo
// ya estan ocultas si no hay inventario cargado — agregamos guardas extras.
function applyManejaInventario() {
  const muestra = state.manejaInventario;

  // Upload box de inventario (carga de archivo)
  const uploadInv = document.querySelector('.upload-box[data-category="inventario"]');
  if (uploadInv) uploadInv.classList.toggle('hidden', !muestra);

  // KPI cards que dependen de costo: en ambos bloques (informe y proyeccion)
  ['kpi-cogs', 'kpi-bruta', 'kpi-margen',
   'kpi-inf-cogs', 'kpi-inf-bruta', 'kpi-inf-margen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const card = el.closest('.kpi-card');
      if (card) card.classList.toggle('hidden', !muestra);
    }
  });
}

function render() {
  const totalArchivos = state.archivos.ventas.length + state.archivos.inventario.length + state.archivos.gastos.length;
  const dashboard = document.getElementById('dashboard');
  if (totalArchivos === 0) {
    dashboard.classList.add('hidden');
    return;
  }
  dashboard.classList.remove('hidden');

  const f = calc();

  // ─── Bloque dual: informe (X dias) + proyeccion (30 dias) ───────────────
  // Si dias != 30 mostramos 2 bloques apilados. Si dias == 30 (o sin factor)
  // solo se muestra el bloque "proyeccion" con titulo simple "Resumen financiero".
  const factorPeriodo = state.ventasPeriodoFactor;
  const diasPeriodo = state.ventasPeriodoDias;
  const hayProyeccion = factorPeriodo && Math.abs(factorPeriodo - 1) >= 0.001 && diasPeriodo && diasPeriodo !== 30;

  const blockInforme = document.getElementById('kpi-block-informe');
  const blockProyTitle = document.getElementById('kpi-block-proy-title');

  if (hayProyeccion) {
    blockInforme.classList.remove('hidden');
    document.getElementById('kpi-block-informe-dias').textContent = diasPeriodo;
    blockProyTitle.textContent = 'Resumen financiero · proyectado a 30 días';

    // KPIs del INFORME (valores reales del periodo cargado, dividiendo por factor)
    const ventasInf = f.totalVentas / factorPeriodo;
    document.getElementById('kpi-inf-ventas').textContent = fmtMoney(ventasInf);
    document.getElementById('kpi-inf-ventas-sub').textContent = `${f.ventasCount} líneas de venta`;

    if (f.cogs !== null) {
      const cogsInf = f.cogs / factorPeriodo;
      const utilInf = f.utilidadBruta / factorPeriodo;
      document.getElementById('kpi-inf-cogs').textContent = fmtMoney(cogsInf);
      document.getElementById('kpi-inf-cogs-sub').textContent = 'Cruce código × costo';
      document.getElementById('kpi-inf-bruta').textContent = fmtMoney(utilInf);
      document.getElementById('kpi-inf-bruta-sub').textContent = utilInf >= 0 ? 'positiva' : 'negativa';
      document.getElementById('kpi-inf-margen').textContent = fmtPercent(f.margen);
      document.getElementById('kpi-inf-margen-sub').textContent = f.margen > 0.3 ? 'saludable' : f.margen > 0.15 ? 'medio' : 'bajo';
    } else {
      document.getElementById('kpi-inf-cogs').textContent = '—';
      document.getElementById('kpi-inf-cogs-sub').textContent = state.inventario.length === 0
        ? 'Sube inventario para calcular'
        : 'Sube ventas con código de producto (Excel)';
      document.getElementById('kpi-inf-bruta').textContent = '—';
      document.getElementById('kpi-inf-bruta-sub').textContent = '—';
      document.getElementById('kpi-inf-margen').textContent = '—';
      document.getElementById('kpi-inf-margen-sub').textContent = '—';
    }

    // Label del kpi ventas dentro del bloque informe respeta IVA
    const kpiInfVentasLabel = document.querySelector('#kpi-block-informe .kpi-ventas .kpi-label');
    if (kpiInfVentasLabel) kpiInfVentasLabel.textContent = state.conIva ? 'Ventas (base sin IVA)' : 'Ventas totales';
  } else {
    blockInforme.classList.add('hidden');
    blockProyTitle.textContent = 'Resumen financiero';
  }

  // KPIs proyeccion (o resumen normal cuando factor==1)
  document.getElementById('kpi-ventas').textContent = fmtMoney(f.totalVentas);
  document.getElementById('kpi-ventas-sub').textContent = `${f.ventasCount} líneas de venta`;

  if (f.cogs !== null) {
    document.getElementById('kpi-cogs').textContent = fmtMoney(f.cogs);
    document.getElementById('kpi-cogs-sub').textContent = `Cruce código × costo`;
    document.getElementById('kpi-bruta').textContent = fmtMoney(f.utilidadBruta);
    document.getElementById('kpi-bruta-sub').textContent = f.margen >= 0 ? 'positiva' : 'negativa';
    document.getElementById('kpi-margen').textContent = fmtPercent(f.margen);
    document.getElementById('kpi-margen-sub').textContent = f.margen > 0.3 ? 'saludable' : f.margen > 0.15 ? 'medio' : 'bajo';
  } else {
    document.getElementById('kpi-cogs').textContent = '—';
    document.getElementById('kpi-cogs-sub').textContent = state.inventario.length === 0
      ? 'Sube inventario para calcular'
      : 'Sube ventas con código de producto (Excel)';
    document.getElementById('kpi-bruta').textContent = '—';
    document.getElementById('kpi-bruta-sub').textContent = '—';
    document.getElementById('kpi-margen').textContent = '—';
    document.getElementById('kpi-margen-sub').textContent = '—';
  }

  // P&L
  document.getElementById('pnl-ventas').textContent = fmtMoney(f.totalVentas);
  document.getElementById('pnl-cogs').textContent = f.cogs !== null ? fmtMoney(f.cogs) : '—';
  document.getElementById('pnl-bruta').textContent = f.utilidadBruta !== null ? fmtMoney(f.utilidadBruta) : '—';
  document.getElementById('pnl-gastos').textContent = fmtMoney(f.totalGastos);
  document.getElementById('pnl-operacional').textContent = fmtMoney(f.utilOperacional);

  // IVA section — hide if "no responsable de IVA"
  const ivaSection = document.getElementById('section-iva');
  if (!state.conIva) {
    ivaSection.classList.add('hidden');
  } else {
    ivaSection.classList.remove('hidden');
    document.getElementById('iva-generado').textContent = fmtMoney(f.ivaGenerado);
    document.getElementById('iva-descontable').textContent = fmtMoney(f.ivaDescontable);
    document.getElementById('iva-saldo').textContent = fmtMoney(Math.abs(f.saldoDian));
    const ivaSaldoCard = document.getElementById('iva-saldo-card');
    const ivaSaldoSub = document.getElementById('iva-saldo-sub');
    ivaSaldoCard.classList.remove('alert-pay', 'alert-favor');
    if (f.saldoDian > 0) {
      ivaSaldoCard.classList.add('alert-pay');
      ivaSaldoSub.textContent = '🔴 A pagar a la DIAN';
    } else if (f.saldoDian < 0) {
      ivaSaldoCard.classList.add('alert-favor');
      ivaSaldoSub.textContent = '✅ A favor del contribuyente';
    } else {
      ivaSaldoSub.textContent = 'Equilibrado';
    }
  }

  // KPI labels — adjust wording based on régimen (scope al bloque proyeccion;
  // el bloque informe ya lo seteamos arriba dentro del if hayProyeccion)
  const kpiVentasLabel = document.querySelector('#kpi-block-proyeccion .kpi-ventas .kpi-label');
  if (kpiVentasLabel) kpiVentasLabel.textContent = state.conIva ? 'Ventas (base sin IVA)' : 'Ventas totales';
  const pnlVentasLabel = document.querySelector('#section-pnl .pnl-row:first-child .pnl-label');
  if (pnlVentasLabel) pnlVentasLabel.textContent = state.conIva
    ? '+ Ingresos brutos (ventas sin IVA)'
    : '+ Ingresos brutos (ventas)';

  // Rotación
  const rotSection = document.getElementById('section-rotacion');
  if (f.inventarioACosto > 0) {
    rotSection.classList.remove('hidden');
    document.getElementById('rotacion-capital').textContent = fmtMoney(f.inventarioACosto);
    if (f.diasInventario !== null) {
      const dias = Math.round(f.diasInventario);
      document.getElementById('rotacion-dias').textContent = `${dias}`;
      const sub = document.getElementById('rotacion-dias-sub');
      if (dias > 180) sub.innerHTML = '🔴 capital amarrado';
      else if (dias > 90) sub.innerHTML = '🟡 alto';
      else if (dias > 30) sub.innerHTML = '🟢 saludable';
      else sub.innerHTML = '🟢 muy ágil';
      document.getElementById('rotacion-veces').textContent = `${f.rotacionMensual.toFixed(2)}x`;
    } else {
      document.getElementById('rotacion-dias').textContent = '—';
      document.getElementById('rotacion-dias-sub').textContent = 'Faltan ventas con código';
      document.getElementById('rotacion-veces').textContent = '—';
    }
  } else {
    rotSection.classList.add('hidden');
  }

  // Sección de reorden y reportes (visible si hay inventario)
  const reordenSection = document.getElementById('section-reorden');
  if (state.inventario.length > 0) {
    reordenSection.classList.remove('hidden');
    updateReordenCounts();
  } else {
    reordenSection.classList.add('hidden');
  }

  // Punto de equilibrio + Participación de gastos (visible si hay ventas Y gastos)
  const peSection = document.getElementById('section-punto-equilibrio');
  if (peSection) {
    if (state.ventas.length > 0 && state.gastos.length > 0) {
      peSection.classList.remove('hidden');
      renderTerminalPuntoEquilibrio();
      renderTerminalParticipacionGastos();
      const btnPE = document.getElementById('btn-punto-equilibrio');
      const btnPG = document.getElementById('btn-participacion-gastos');
      if (btnPE) btnPE.disabled = !(f.totalVentas > 0 && f.totalGastos > 0);
      if (btnPG) btnPG.disabled = !(state.gastos.length > 0);
    } else {
      peSection.classList.add('hidden');
    }
  }

  // Análisis de Marketing AIMMA — visible si hay base de utilidad positiva:
  //  · Empresas con inventario: usa utilidad bruta (ventas - COGS)
  //  · Empresas SIN inventario (servicios/dropshipping): usa utilidad neta (ventas - gastos)
  const mktSection = document.getElementById('section-marketing');
  if (mktSection) {
    const baseMkt = state.manejaInventario
      ? f.utilidadBruta
      : (f.totalVentas - (f.totalGastos || 0));
    if (baseMkt !== null && baseMkt > 0) {
      mktSection.classList.remove('hidden');
      renderTerminalMarketing();
      const btnMkt = document.getElementById('btn-marketing');
      if (btnMkt) btnMkt.disabled = false;
    } else {
      mktSection.classList.add('hidden');
    }
  }

  // Descarga consolidada (visible si hay al menos ventas Y un reporte con datos)
  const descSection = document.getElementById('section-descarga-todo');
  if (descSection) {
    const hayDatos = state.ventas.length > 0 || state.inventario.length > 0 || state.gastos.length > 0;
    descSection.classList.toggle('hidden', !hayDatos);
  }

  // Month filter options (basado en meses detectados)
  updateMonthFilter(f.meses);

  // Alertas
  renderAlerts(f);
}

// Month filter removido del UI (user lo elimino para ahorrar espacio en header).
// Se mantiene la funcion como no-op por compatibilidad y por si se reintroduce despues.
function updateMonthFilter(meses) {
  const sel = document.getElementById('month-filter');
  if (!sel) return; // elemento eliminado del DOM
  const current = state.filterMonth;
  const allMonths = new Set();
  state.ventas.forEach(v => v.fecha && allMonths.add(monthKey(v.fecha)));
  state.gastos.forEach(g => g.fecha && allMonths.add(monthKey(g.fecha)));
  const sorted = Array.from(allMonths).sort();
  sel.innerHTML = '<option value="all">Todo el período</option>';
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  sorted.forEach(k => {
    const [y, m] = k.split('-');
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = `${names[+m - 1]} ${y}`;
    sel.appendChild(opt);
  });
  sel.value = current;
}

function renderAlerts(f) {
  const list = document.getElementById('alerts-list');
  list.innerHTML = '';
  const alerts = [];

  if (state.ventas.length === 0) alerts.push({ type: 'info', msg: 'Sube tus facturas de venta para empezar.' });
  if (state.inventario.length === 0 && state.ventas.length > 0) {
    alerts.push({ type: 'info', msg: 'Sube tu inventario en Excel para calcular el costo real de ventas (COGS) y el margen real del negocio.' });
  }
  if (f.cogs === null && state.inventario.length > 0 && state.ventas.length > 0) {
    alerts.push({ type: 'warning', msg: 'Tus facturas de venta no tienen código de producto (probablemente subiste PDFs). Súbelas en Excel para desbloquear el cálculo de margen y rotación.' });
  }
  if (f.productosSinCosto && f.productosSinCosto.length > 0) {
    alerts.push({
      type: 'warning',
      msg: `${f.productosSinCosto.length} productos vendidos no tienen costo en tu inventario. Códigos: ${f.productosSinCosto.slice(0, 5).map(p => p.codigo).join(', ')}${f.productosSinCosto.length > 5 ? '...' : ''}`
    });
  }
  if (f.diasInventario !== null && f.diasInventario > 180) {
    alerts.push({ type: 'danger', msg: `Tienes ${Math.round(f.diasInventario)} días de inventario. Eso es capital amarrado en bodega que no está rotando.` });
  }
  if (state.conIva && f.saldoDian > 0) {
    alerts.push({ type: 'warning', msg: `Tu saldo a la DIAN es de ${fmtMoney(f.saldoDian)}. Verifica tu fecha de declaración bimestral.` });
  }
  if (state.conIva && f.saldoDian < -50000) {
    alerts.push({ type: 'success', msg: `Tienes ${fmtMoney(Math.abs(f.saldoDian))} a favor con la DIAN. Puedes solicitar devolución o compensar.` });
  }
  if (!state.conIva) {
    alerts.push({ type: 'info', msg: 'Modo No Responsable de IVA activo: los totales se calculan netos, sin separar IVA.' });
  }
  if (f.margen !== null && f.margen < 0.15 && f.margen > 0) {
    alerts.push({ type: 'warning', msg: `Tu margen bruto es ${fmtPercent(f.margen)} — bajo para retail. Revisa costos o precios.` });
  }
  if (f.utilOperacional !== null && f.utilOperacional < 0) {
    alerts.push({ type: 'danger', msg: `Estás operando con utilidad negativa de ${fmtMoney(f.utilOperacional)}. Tus gastos superan tu margen.` });
  }
  if (alerts.length === 0) alerts.push({ type: 'success', msg: 'Todo en orden. Sigue así.' });

  alerts.forEach(a => {
    const li = document.createElement('li');
    li.className = `alert alert-${a.type}`;
    li.textContent = a.msg;
    list.appendChild(li);
  });
}

function renderFileList(category) {
  const box = document.querySelector(`.upload-box[data-category="${category}"]`);
  const dropEmpty = box.querySelector('.drop-empty');
  const dropFilled = box.querySelector('.drop-filled');
  const list = box.querySelector(`[data-list="${category}"]`);
  const countEl = box.querySelector(`[data-count="${category}"]`);

  const files = state.archivos[category];
  countEl.textContent = files.length;

  if (files.length === 0) {
    dropEmpty.classList.remove('hidden');
    dropFilled.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  dropEmpty.classList.add('hidden');
  dropFilled.classList.remove('hidden');
  list.innerHTML = '';
  files.forEach((f, idx) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    // Escape f.name (filename del user) para evitar self-XSS si el archivo
    // tiene un nombre con HTML/JS — defensa en profundidad, no es exploit real
    // (el user solo se afecta a si mismo) pero es buena higiene.
    li.innerHTML = `
      <span class="file-item-name">${escapeHtml(f.name)}</span>
      <span class="file-item-status ${escapeHtml(f.status)}">${f.status === 'ok' ? `${f.rows} líneas` : f.status === 'error' ? 'error' : '...'}</span>
      <button class="file-item-remove" data-idx="${idx}" title="Eliminar">×</button>
    `;
    list.appendChild(li);
  });
  list.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const i = +btn.dataset.idx;
      removeFile(category, i);
    });
  });
}

/* ============= FILE HANDLING ============= */

async function handleFiles(files, category) {
  // Ventas: bloqueado hasta que haya periodo definido
  if (category === 'ventas' && !state.ventasPeriodoFactor) {
    toast('Primero selecciona el periodo de tu informe de ventas (fechas Desde y Hasta).', 'error');
    return;
  }
  // Inventario: solo 1 archivo. Si ya hay uno, preguntar antes de reemplazar.
  if (category === 'inventario') {
    if (files.length > 1) {
      toast('Solo se acepta un archivo de inventario. Tomaré el último.', 'info');
      files = [files[files.length - 1]];
    }
    if (state.archivos.inventario.length > 0) {
      const ok = confirm('Ya hay un inventario cargado. ¿Reemplazarlo con el nuevo archivo?');
      if (!ok) return;
      state.inventario = [];
      state.archivos.inventario = [];
      renderFileList('inventario');
    }
  }

  for (const file of files) {
    const meta = { name: file.name, status: 'parsing', rows: 0 };
    state.archivos[category].push(meta);
    renderFileList(category);
    try {
      const rows = await parseFile(file, category);
      state[category].push(...rows);
      meta.status = 'ok';
      meta.rows = rows.length;
      toast(`✓ ${file.name}: ${rows.length} ${category === 'inventario' ? 'productos' : 'registros'}`, 'success');
      // Fix #2 2026-05-28: detectar reporte "por cliente" cuando >80% filas
      // tienen codigo='' Y >80% tienen cantidad=1 default. Caso 2025 mayoristas.xlsx
      // con headers "Cliente|Total Factura": pasa el parser pero no es por producto.
      if (category === 'ventas' && rows.length >= 20) {
        const sinCodigo = rows.filter(r => !r.codigo || r.codigo === '').length;
        const cantUno = rows.filter(r => r.cantidad === 1).length;
        if (sinCodigo / rows.length > 0.8 && cantUno / rows.length > 0.8) {
          toast(`⚠ ${file.name}: parece reporte por cliente (no por producto). Top Ventas y rotación pueden salir incorrectos.`, 'error');
        }
      }
      // Fix #10 2026-05-28: warning si hay items con stock negativo (cuadre POS pendiente).
      // Genera rotacion infinita en informes; alertar sin bloquear.
      if (category === 'inventario') {
        const stockNeg = rows.filter(r => typeof r.stockActual === 'number' && r.stockActual < 0).length;
        if (stockNeg > 0) {
          toast(`⚠ ${stockNeg} producto(s) con stock negativo (POS desincronizado). Pueden inflar la rotación.`, 'info');
        }
      }
    } catch (err) {
      meta.status = 'error';
      meta.error = err.message;
      toast(`✗ ${file.name}: ${err.message}`, 'error');
    }
    renderFileList(category);
  }
  saveState();
  render();
}

function removeFile(category, idx) {
  const file = state.archivos[category][idx];
  if (!file) return;
  state.archivos[category].splice(idx, 1);
  state[category] = state[category].filter(r => r.archivo !== file.name);
  renderFileList(category);
  saveState();
  render();
}

function resetAll() {
  if (!confirm('¿Borrar todos los archivos y empezar de nuevo?')) return;
  state.ventas = []; state.inventario = []; state.gastos = [];
  state.archivos = { ventas: [], inventario: [], gastos: [] };
  state.filterMonth = 'all';
  state.ventasFechaDesde = null;
  state.ventasFechaHasta = null;
  state.ventasPeriodoDias = null;
  state.ventasPeriodoFactor = null;
  ['ventas', 'inventario', 'gastos'].forEach(renderFileList);
  // Limpiar inputs visuales
  const fd = document.getElementById('ventas-fecha-desde');
  const fh = document.getElementById('ventas-fecha-hasta');
  if (fd) fd.value = '';
  if (fh) fh.value = '';
  updatePeriodoVentas(); // refresca el mensaje y bloquea el input
  localStorage.removeItem(STORAGE_KEY);
  render();
  toast('Análisis reiniciado', 'info');
}

/* ============= PERSISTENCIA ============= */

function saveState() {
  try {
    const serialized = JSON.stringify({
      version: APP_VERSION,
      ventas: state.ventas,
      inventario: state.inventario,
      gastos: state.gastos,
      archivos: state.archivos,
      filterMonth: state.filterMonth,
      conIva: state.conIva,
      manejaInventario: state.manejaInventario,
      ventasFechaDesde: state.ventasFechaDesde,
      ventasFechaHasta: state.ventasFechaHasta,
      ventasPeriodoDias: state.ventasPeriodoDias,
      ventasPeriodoFactor: state.ventasPeriodoFactor
    });
    if (serialized.length < 4 * 1024 * 1024) {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
  } catch (e) {
    console.warn('No se pudo guardar en localStorage:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    // Si la versión del storage no coincide con la actual, invalidar y forzar re-upload.
    // Esto evita que un parser viejo deje datos malos cacheados después de actualizar el app.
    if (data.version !== APP_VERSION) {
      console.info(`AIMMA: parser actualizado (${data.version || 'sin versión'} → ${APP_VERSION}). Limpiando datos antiguos.`);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    state.ventas = (data.ventas || []).map(v => ({ ...v, fecha: v.fecha ? new Date(v.fecha) : null }));
    state.inventario = data.inventario || [];
    state.gastos = (data.gastos || []).map(g => ({ ...g, fecha: g.fecha ? new Date(g.fecha) : null }));
    state.archivos = data.archivos || { ventas: [], inventario: [], gastos: [] };
    state.filterMonth = data.filterMonth || 'all';
    state.conIva = data.conIva !== undefined ? data.conIva : true;
    state.manejaInventario = data.manejaInventario !== undefined ? data.manejaInventario : true;
    state.ventasFechaDesde = data.ventasFechaDesde || null;
    state.ventasFechaHasta = data.ventasFechaHasta || null;
    state.ventasPeriodoDias = data.ventasPeriodoDias || null;
    // Fix #12 2026-05-28: validar que el factor sea numero finito > 0. Si esta
    // corrupto en localStorage (NaN, Infinity, negativo), todas las cantidades
    // escaladas se vuelven Infinity y el COGS explota.
    const rawFactor = data.ventasPeriodoFactor;
    state.ventasPeriodoFactor = (typeof rawFactor === 'number' && Number.isFinite(rawFactor) && rawFactor > 0) ? rawFactor : null;
    ['ventas', 'inventario', 'gastos'].forEach(renderFileList);
  } catch (e) {
    console.warn('No se pudo cargar de localStorage:', e);
  }
}

/* ============= REPORTES DE STOCK Y REORDEN ============= */

// Agrupa ventas por código (después de aplicar el filtro de mes)
function ventasPorCodigo() {
  const ventas = filterByMonth(state.ventas);
  const map = new Map();
  ventas.forEach(v => {
    if (!v.codigo) return;
    const k = v.codigo.toUpperCase();
    const prev = map.get(k) || { codigo: v.codigo, descripcion: v.descripcion, cantidad: 0, total: 0 };
    prev.cantidad += (v.cantidad || 0);
    // FIX auditoria: usar el mismo criterio que calc().totalVentas para evitar
    // discrepancia entre KPI principal y Top Rentabilidad cuando NO responsable IVA.
    // Responsable IVA: usar subtotal (base sin IVA). No responsable: usar total (cifra neta del POS).
    prev.total += state.conIva ? (v.subtotal || 0) : (v.total || v.subtotal || 0);
    if (!prev.descripcion && v.descripcion) prev.descripcion = v.descripcion;
    map.set(k, prev);
  });
  return map;
}

// Calcula resurtido óptimo y sobrestock por producto del inventario
function calcResurtido(diasDeseados) {
  const ventasMap = ventasPorCodigo();
  const resurtido = [];
  const sobrestock = [];

  state.inventario.forEach(item => {
    if (!item.codigo) return;
    const k = item.codigo.toUpperCase();
    // Cruce inverso con tiebreak por nombre del inv: si ventas tiene "103" + "00103"
    // y inv "00103" se llama ESTAMPADA, escogerá la venta cuyo descripcion contiene ESTAMPADA.
    const venta = findBestInventoryMatch(k, item.nombre, ventasMap);
    const unidadesVendidas = venta ? venta.cantidad : 0;
    const promedioDiario = unidadesVendidas / 30;
    const stockOptimo = Math.ceil(promedioDiario * diasDeseados);
    const diferencia = stockOptimo - (item.stockActual || 0);

    if (diferencia > 0) {
      resurtido.push({
        codigo: item.codigo,
        nombre: item.nombre,
        stockActual: item.stockActual || 0,
        unidadesVendidasMes: unidadesVendidas,
        promedioDiario: Number(promedioDiario.toFixed(2)),
        stockOptimo,
        comprar: diferencia,
        costoUnitario: item.costoUnitario || 0,
        inversionNecesaria: diferencia * (item.costoUnitario || 0)
      });
    } else if (diferencia < 0) {
      const sobrante = -diferencia;
      sobrestock.push({
        codigo: item.codigo,
        nombre: item.nombre,
        stockActual: item.stockActual || 0,
        unidadesVendidasMes: unidadesVendidas,
        promedioDiario: Number(promedioDiario.toFixed(2)),
        stockOptimo,
        sobrante,
        costoUnitario: item.costoUnitario || 0,
        capitalAmarrado: sobrante * (item.costoUnitario || 0)
      });
    }
  });

  // Ordenar: resurtido por MAYOR cantidad vendida (top de ventas primero)
  // Sobrestock por mayor capital amarrado
  resurtido.sort((a, b) => b.unidadesVendidasMes - a.unidadesVendidasMes);
  sobrestock.sort((a, b) => b.capitalAmarrado - a.capitalAmarrado);
  return { resurtido, sobrestock };
}

// Cruce defensivo de codigos cuando ventas e inventario vienen de fuentes distintas
// y uno de los dos pierde los ceros a la izquierda (Excel auto-convierte "00103" a 103
// si la celda esta formateada como numero). Intenta variantes solo si hay UN solo match,
// evitando colapsar dos productos distintos (ej: '103' y '00103' coexisten en inv).
function findCodigoEnMap(codigo, mapa) {
  if (!codigo) return null;
  if (mapa.has(codigo)) return mapa.get(codigo);
  if (!/^\d+$/.test(codigo)) return null;
  const stripped = codigo.replace(/^0+/, '') || '0';
  const candidates = new Set();
  if (stripped !== codigo) candidates.add(stripped);
  for (let z = 1; z <= 6; z++) candidates.add('0'.repeat(z) + stripped);
  candidates.delete(codigo);
  const matches = [...candidates].filter(v => mapa.has(v));
  return matches.length === 1 ? mapa.get(matches[0]) : null;
}

// Devuelve TODOS los candidatos posibles en el mapa (exact + zero-variants).
// Usado para tiebreak por descripción cuando hay ambigüedad real.
function gatherCodigoCandidates(codigo, mapa) {
  const out = [];
  if (!codigo) return out;
  if (mapa.has(codigo)) out.push({ key: codigo, item: mapa.get(codigo), exact: true });
  if (!/^\d+$/.test(codigo)) return out;
  const stripped = codigo.replace(/^0+/, '') || '0';
  const variants = new Set();
  if (stripped !== codigo) variants.add(stripped);
  for (let z = 1; z <= 6; z++) variants.add('0'.repeat(z) + stripped);
  variants.delete(codigo);
  for (const v of variants) {
    if (mapa.has(v)) out.push({ key: v, item: mapa.get(v), exact: false });
  }
  return out;
}

// Cruce robusto ventas→inventario. Cuando hay ambigüedad (ej: ventas "103" puede
// cruzar con inv "103" PANTALONETA o inv "00103" ESTAMPADA), usa la descripción
// de la venta para escoger el candidato cuyo nombre más se parece. Si hay 1 solo
// candidato o ningún descriptor confiable, comportamiento original.
//
// Regresa el ITEM del inventario que mejor matchea, o null.
function findBestInventoryMatch(codigoVenta, descripcionVenta, invMap) {
  const candidates = gatherCodigoCandidates(codigoVenta, invMap);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].item;

  // Múltiples candidatos: si la venta trae descripción, intentar tiebreak por similaridad
  if (descripcionVenta && descripcionVenta.trim().length >= 3) {
    let best = null, bestScore = -1;
    for (const c of candidates) {
      // El candidato puede tener "nombre" (inventario) o "descripcion" (ventas) dependiendo del contexto
      const candText = c.item.nombre || c.item.descripcion || '';
      const score = textSimilarity(descripcionVenta, candText);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    // Threshold: si el mejor tiene >= 0.4 de similaridad Y supera al segundo por
    // un margen, es señal fuerte. Si no, no inventamos: caemos a heurística menor.
    if (bestScore >= 0.4) return best.item;
    if (bestScore >= 0.2) {
      // Mejor que nada, pero verificar que NO esté empatado
      const otrosEmpate = candidates.filter(c => c !== best &&
        textSimilarity(descripcionVenta, c.item.nombre || '') >= bestScore - 0.05);
      if (otrosEmpate.length === 0) return best.item;
    }
  }
  // Sin descripción confiable: preferir el candidato con stock > 0 si solo hay uno
  const withStock = candidates.filter(c => (c.item.stockActual || 0) > 0);
  if (withStock.length === 1) return withStock[0].item;
  // Preferir exact match
  const exact = candidates.find(c => c.exact);
  if (exact) return exact.item;
  // Sin forma de decidir: no cruzar para no inventar relaciones
  return null;
}

// REPORTE UNIFICADO de Top Ventas: TODOS los códigos vendidos en el período,
// ordenados por unidades vendidas, con su estado de stock al lado.
// Esto resuelve el problema de que productos best-seller con stock abundante
// quedaran INVISIBLES en el reporte anterior (que solo traía los que necesitaban
// reabastecimiento). El user pide "top de ventas" y obtiene EXACTAMENTE eso.
function topVentasConEstado(diasDeseados) {
  const ventasMap = ventasPorCodigo();
  const invMap = new Map();
  state.inventario.forEach(i => { if (i.codigo) invMap.set(i.codigo.toUpperCase(), i); });

  const filas = [];
  // 1) Iteramos por TODOS los códigos vendidos (incluso si no están en inventario)
  ventasMap.forEach((v, kUpper) => {
    // Cruce robusto: si hay ambigüedad (ej: cod "103" vs inv "103" PANTALONETA + "00103" ESTAMPADA),
    // usa la descripción de la venta como tiebreaker. findBestInventoryMatch maneja todos los casos.
    const inv = findBestInventoryMatch(kUpper, v.descripcion, invMap);
    const unidadesVendidas = v.cantidad; // ya neto (con devoluciones restadas)
    const stockActual = inv ? (inv.stockActual || 0) : 0;
    const costoUnitario = inv ? (inv.costoUnitario || 0) : 0;
    const promedioDiario = unidadesVendidas > 0 ? unidadesVendidas / 30 : 0;
    const stockOptimo = Math.ceil(promedioDiario * diasDeseados);
    const diferencia = stockOptimo - stockActual;
    const diasInv = (promedioDiario > 0) ? stockActual / promedioDiario : null;

    // Estado claro y accionable
    let estado, accion, comprar = 0, sobrante = 0;
    if (unidadesVendidas < 0) {
      // Más devoluciones que ventas en el período: el "neto" es negativo.
      // Etiqueta especial para que el usuario lo entienda en el ranking.
      estado = 'DEVUELTO NETO';
      accion = `${Math.abs(unidadesVendidas)} unidades devueltas más que vendidas. Revisar`;
    } else if (unidadesVendidas === 0) {
      // Vendido y devuelto en la misma cantidad — neto cero.
      estado = 'NETO CERO';
      accion = 'Mismas unidades vendidas que devueltas en el período';
    } else if (!inv) {
      estado = 'SIN INVENTARIO';
      accion = 'Producto vendido pero no está en tu archivo de inventario';
    } else if (stockActual === 0 && unidadesVendidas > 0) {
      estado = 'SIN STOCK';
      accion = `Resurtir urgente: vendiste ${unidadesVendidas} und/mes y no tienes stock`;
      comprar = stockOptimo;
    } else if (diferencia > 0) {
      estado = 'RESURTIR';
      accion = `Comprar ${diferencia} unidades (alcanza para ${diasDeseados} días)`;
      comprar = diferencia;
    } else if (diasInv !== null && diasInv <= diasDeseados * 2) {
      estado = 'OK';
      accion = `Stock suficiente para ~${Math.round(diasInv)} días`;
    } else {
      estado = 'SOBRESTOCK';
      sobrante = -diferencia;
      const diasTxt = diasInv === null || !isFinite(diasInv) ? '∞' : Math.round(diasInv);
      accion = `Exceso: tienes para ${diasTxt} días. Liquidar/promocionar ${sobrante} unidades`;
    }

    filas.push({
      codigo: v.codigo,
      nombre: (inv && inv.nombre) || v.descripcion || '',
      unidadesVendidasMes: unidadesVendidas,
      valorVendido: v.total,
      stockActual,
      promedioDiario: Number(promedioDiario.toFixed(2)),
      stockOptimo,
      diasInventario: diasInv === null || !isFinite(diasInv) ? null : Math.round(diasInv),
      estado,
      accion,
      comprar,
      sobrante,
      costoUnitario,
      inversionNecesaria: comprar * costoUnitario,
      capitalAmarrado: sobrante * costoUnitario
    });
  });

  // Orden: primero los que más vendieron (independiente del estado)
  filas.sort((a, b) => b.unidadesVendidasMes - a.unidadesVendidasMes);
  return filas;
}

// Top de productos MAS RENTABLES (por utilidad bruta en $).
// Utilidad = valorVendido - (cantidad × costoUnitario).
// Excluye productos SIN costo en inventario (no se puede calcular utilidad).
// Excluye productos con utilidadVendida <= 0 (devoluciones o sin venta neta).
// Ordena por utilidad TOTAL descendente para responder "¿qué le da más PLATA al negocio?".
function topRentabilidad() {
  const ventasMap = ventasPorCodigo();
  const invMap = new Map();
  state.inventario.forEach(i => { if (i.codigo) invMap.set(i.codigo.toUpperCase(), i); });

  const filas = [];
  ventasMap.forEach((v, kUpper) => {
    const inv = findBestInventoryMatch(kUpper, v.descripcion, invMap);
    const unidadesVendidas = v.cantidad;
    const valorVendido = v.total;
    if (!inv || !inv.costoUnitario || inv.costoUnitario <= 0) return; // sin costo, no se puede calcular
    if (unidadesVendidas <= 0) return; // devolucion neta o sin venta

    const costoTotal = unidadesVendidas * inv.costoUnitario;
    const utilidad = valorVendido - costoTotal;
    if (utilidad <= 0) return; // vendiste a perdida — no es "rentable"
    const margenPct = valorVendido > 0 ? utilidad / valorVendido : 0;

    filas.push({
      codigo: v.codigo,
      nombre: inv.nombre || v.descripcion || '',
      unidadesVendidasMes: unidadesVendidas,
      valorVendido,
      costoUnitario: inv.costoUnitario,
      costoTotal,
      utilidad,
      margenPct,
      stockActual: inv.stockActual || 0
    });
  });

  // Ordenar por utilidad TOTAL desc — el que mas plata genera primero
  filas.sort((a, b) => b.utilidad - a.utilidad);
  return filas;
}

// ============= PUNTO DE EQUILIBRIO + PARTICIPACION DE GASTOS =============

// Calcula el punto de equilibrio financiero: ¿cuántas ventas necesito para no perder?
// Fórmula: PE = totalGastos / margenBruto(%)
// Margen bruto = (ventas - cogs) / ventas. Si vendes con 39% de margen, cada $100
// vendidos te dejan $39 para cubrir gastos. PE = gastos / 0.39.
function calcPuntoEquilibrio() {
  const f = calc();
  const { totalVentas, cogs, utilidadBruta, totalGastos, margen, utilOperacional } = f;

  // Margen bruto absoluto (decimal, ej 0.39 = 39%)
  const margenBruto = margen;
  // Si no hay cogs (no se subió inventario), usar utilidad operacional sobre ventas
  const margenEfectivo = (margenBruto !== null && margenBruto > 0)
    ? margenBruto
    : (totalVentas > 0 ? (totalVentas - totalGastos) / totalVentas : 0);

  // Punto de equilibrio en pesos: ventas requeridas para que utilidad operacional = 0
  let puntoEquilibrioVentas = null;
  if (margenEfectivo > 0 && totalGastos > 0) {
    puntoEquilibrioVentas = totalGastos / margenEfectivo;
  }

  // Brecha: cuanto ESTÁS por encima/debajo del PE
  const brecha = (puntoEquilibrioVentas !== null && totalVentas) ? totalVentas - puntoEquilibrioVentas : null;
  const cobertura = (puntoEquilibrioVentas && puntoEquilibrioVentas > 0)
    ? totalVentas / puntoEquilibrioVentas
    : null;

  return {
    totalVentas,
    totalGastos,
    cogs,
    utilidadBruta,
    margenBruto: margenEfectivo,
    puntoEquilibrioVentas,
    brecha,
    cobertura, // >1 significa que cubres con margen
    utilOperacional,
    diasInventario: f.diasInventario,
    inventarioACosto: f.inventarioACosto
  };
}

// Calcula participación porcentual de cada gasto vs utilidad bruta.
// Agrupa por concepto+proveedor para resumir. Ordena desc por valor.
function calcParticipacionGastos() {
  const f = calc();
  const utilidadBruta = f.utilidadBruta;
  const gastos = filterByMonth(state.gastos);

  // === FILAS POR FACTURA (cada gasto = una fila) — NUEVO ===
  // Jorge: "EN EL INFORME COLOCAR CADA FACTURA Y PROVEEDOR PARA SABER DE QUIEN ES O QUIEN LA EXPIDIO
  // DEBE SALIR SI EL % DE EL GASTO PERO POR SEPARADO POR FACTURA EN EL ANALISIS"
  const filasPorFactura = [];
  gastos.forEach(g => {
    const monto = state.conIva ? (g.subtotal || 0) : (g.total || g.subtotal || 0);
    // HIGH-2 review fix: incluir notas credito y docs con monto 0 explicito (no silent skip).
    // Solo skip si AMBOS subtotal y total son null/undefined (parse fallido).
    if (g.subtotal == null && g.total == null) return;
    filasPorFactura.push({
      tipoDoc: g.tipoDoc || 'DOCUMENTO',
      archivo: g.archivo || '',
      proveedor: (g.proveedor || '').trim() || '(sin proveedor)',
      factura: (g.factura || '').trim() || '(sin nro)',
      concepto: (g.concepto || '').trim() || (g.proveedor || 'Sin concepto'),
      fecha: g.fecha || null,
      subtotal: g.subtotal || 0,
      iva: g.iva || 0,
      total: g.total || ((g.subtotal || 0) + (g.iva || 0)),
      monto: monto, // segun estado conIva
      porcentajeRentabilidad: (utilidadBruta && utilidadBruta > 0) ? monto / utilidadBruta : null,
      porcentajeVentas: (f.totalVentas > 0) ? monto / f.totalVentas : null,
    });
  });
  filasPorFactura.sort((a, b) => b.monto - a.monto);

  // === FILAS AGRUPADAS POR PROVEEDOR (resumen ejecutivo) ===
  // HIGH-1 review fix: si proveedor es '(sin proveedor)' fallback a concepto
  // (mantiene compat con fixtures legacy que solo tienen {concepto, subtotal, total})
  const grupos = new Map();
  filasPorFactura.forEach(f => {
    const claveBase = (f.proveedor && f.proveedor !== '(sin proveedor)') ? f.proveedor : f.concepto;
    const clave = (claveBase || 'Sin clasificar').toUpperCase();
    if (!grupos.has(clave)) {
      grupos.set(clave, { proveedor: claveBase || 'Sin clasificar', total: 0, registros: 0, facturas: [] });
    }
    const entry = grupos.get(clave);
    entry.total += f.monto;
    entry.registros += 1;
    entry.facturas.push(f.factura);
  });

  const filasAgrupadasPorProveedor = [];
  grupos.forEach(g => {
    filasAgrupadasPorProveedor.push({
      proveedor: g.proveedor,
      total: g.total,
      registros: g.registros,
      facturas: g.facturas.join(', '),
      porcentajeRentabilidad: (utilidadBruta && utilidadBruta > 0) ? g.total / utilidadBruta : null,
      porcentajeVentas: (f.totalVentas > 0) ? g.total / f.totalVentas : null,
    });
  });
  filasAgrupadasPorProveedor.sort((a, b) => b.total - a.total);

  // Compatibilidad: mantener "filas" como alias de agrupado por proveedor (codigo legacy lo usa)
  const filas = filasAgrupadasPorProveedor.map(g => ({
    concepto: g.proveedor,
    total: g.total,
    registros: g.registros,
    porcentajeRentabilidad: g.porcentajeRentabilidad,
    porcentajeVentas: g.porcentajeVentas,
  }));

  // Totales
  const totalGastos = filasPorFactura.reduce((s, x) => s + x.monto, 0);
  const porcentajeTotalRentabilidad = (utilidadBruta && utilidadBruta > 0) ? totalGastos / utilidadBruta : null;

  return {
    filas,                         // legacy: agrupado por proveedor (concepto+total)
    filasPorFactura,               // NUEVO: una fila por factura con todo el detalle
    filasAgrupadasPorProveedor,    // NUEVO: resumen agrupado
    totalGastos,
    utilidadBruta,
    porcentajeTotalRentabilidad,
    totalVentas: f.totalVentas
  };
}

// ============= ANALISIS DE MARKETING AIMMA =============
// Dispersa el presupuesto de marketing entre canales segun framework profesional.
// Los porcentajes vienen de mejores practicas: Meta Ads escala, TikTok CPM mas bajo,
// Google captura intencion, Produccion es combustible, Micro-influencers > macro,
// CRM/WhatsApp el ROAS mas alto (>15x).
const CANALES_MARKETING = [
  {
    canal: 'Meta Ads (Facebook + Instagram)',
    pct: 0.40,
    razon: 'Escala mas grande del mercado + targeting granular + retargeting potente. El caballo de batalla del e-commerce colombiano.'
  },
  {
    canal: 'TikTok Ads',
    pct: 0.20,
    razon: 'CPM mas barato del mercado actualmente. Canal de descubrimiento ideal para audiencias jovenes y productos visuales.'
  },
  {
    canal: 'Google Ads (Search + Performance Max)',
    pct: 0.18,
    razon: 'Captura intencion de compra alta (busqueda activa). Complementa a Meta cerrando ventas de quien ya investigo.'
  },
  {
    canal: 'Produccion de contenido',
    pct: 0.10,
    razon: 'Combustible de TODO lo demas. Sin foto de producto, video corto y diseno de piezas, Meta/TikTok/organico no funciona.'
  },
  {
    canal: 'Influencers / UGC',
    pct: 0.07,
    razon: 'Priorizar micro-influencers locales (10K-80K seguidores) con audiencias reales sobre macros caros. UGC se reutiliza como creativo en Meta = doble uso del presupuesto.'
  },
  {
    canal: 'CRM / WhatsApp',
    pct: 0.05,
    razon: 'ROAS mas alto de todos los canales (puede superar 15-20x). Hablas con clientes que ya compraron. El canal mas subutilizado en empresas colombianas.'
  }
];

function calcAnalisisMarketing(porcentajeUtilidad) {
  const f = calc();
  // Empresas sin inventario (servicios/dropshipping) no tienen COGS → utilidad bruta
  // no aplica; se usa utilidad neta = ventas - gastos como base del presupuesto MKT.
  const baseUtilidad = state.manejaInventario
    ? f.utilidadBruta
    : (f.totalVentas - (f.totalGastos || 0));
  const pct = Math.max(0, Math.min(50, porcentajeUtilidad || 5)) / 100;
  const presupuestoTotal = (baseUtilidad && baseUtilidad > 0) ? baseUtilidad * pct : 0;
  const totalVentas = f.totalVentas;
  // Mantenemos exportada como "utilidadBruta" por compatibilidad con render terminal/excel,
  // pero conceptualmente es "utilidad base" (bruta si hay inventario, neta si es servicios).
  const utilidadBruta = baseUtilidad;

  // Validar alertas segun el % elegido
  let alerta = null;
  if (porcentajeUtilidad < 8) {
    alerta = { tipo: 'danger', msg: `${porcentajeUtilidad}% es muy bajo. Recomendado nunca bajar del 8% para mantener flujo de adquisicion de clientes.` };
  } else if (porcentajeUtilidad < 10) {
    alerta = { tipo: 'warning', msg: `${porcentajeUtilidad}% esta en el limite inferior. Considera subir al rango optimo 10%-20%.` };
  } else if (porcentajeUtilidad > 25) {
    alerta = { tipo: 'warning', msg: `${porcentajeUtilidad}% es agresivo. Asegurate que el ROAS justifique este nivel.` };
  } else {
    alerta = { tipo: 'ok', msg: `${porcentajeUtilidad}% esta en el rango optimo (10%-20%). Excelente para crecer sin comprometer rentabilidad.` };
  }

  const filas = CANALES_MARKETING.map(c => ({
    canal: c.canal,
    pct: c.pct,
    monto: presupuestoTotal * c.pct,
    razon: c.razon
  }));

  return {
    utilidadBruta,
    totalVentas,
    porcentajeUtilidad,
    presupuestoTotal,
    pctVentas: (totalVentas > 0) ? presupuestoTotal / totalVentas : null,
    filas,
    alerta
  };
}

function renderTerminalMarketing() {
  const id = 'terminal-marketing';
  const el = document.getElementById(id);
  if (!el) return;
  const pctInput = Number(document.getElementById('pct-marketing')?.value) || 5;
  const data = calcAnalisisMarketing(pctInput);

  if (!data.utilidadBruta || data.utilidadBruta <= 0) {
    renderTerminal(id, [
      termPrompt('analizar', `--marketing --pct=${pctInput}`),
      '<div class="term-spacer"></div>',
      termMsg('Sin utilidad bruta positiva no podemos calcular presupuesto de marketing. Revisa COGS y gastos.', 'warning')
    ]);
    return;
  }

  const lines = [
    termPrompt('analizar', `--marketing --pct=${pctInput} --canales=6`),
    termStep('Calculando presupuesto total'),
    termStep('Dispersando por canal segun mejores practicas'),
    termStep('Generando recomendaciones'),
    '<div class="term-spacer"></div>',
    termMetric('Utilidad bruta del periodo', fmtMoney(data.utilidadBruta)),
    termMetric(`Presupuesto marketing (${pctInput}% de utilidad)`, fmtMoney(data.presupuestoTotal)),
  ];
  if (data.pctVentas !== null) {
    lines.push(termMetric('% sobre ventas brutas', `${(data.pctVentas * 100).toFixed(1)}%`));
  }
  lines.push('<div class="term-spacer"></div>');
  lines.push(termMsg('--- DISPERSION POR CANAL ---'));

  data.filas.forEach(f => {
    lines.push(termMetric(f.canal, `${fmtMoney(f.monto)} · ${(f.pct * 100).toFixed(0)}%`));
    lines.push(termArrow(f.razon));
  });

  lines.push('<div class="term-spacer"></div>');
  // Alerta segun % elegido
  const alertCls = data.alerta.tipo === 'danger' ? 'danger' : data.alerta.tipo === 'warning' ? 'warning' : 'value';
  lines.push(termMetric('Diagnostico de tu %', data.alerta.msg, alertCls));

  renderTerminal(id, lines);
}

function downloadAnalisisMarketing() {
  const pctInput = Number(document.getElementById('pct-marketing')?.value) || 5;
  const data = calcAnalisisMarketing(pctInput);
  if (!data.utilidadBruta || data.utilidadBruta <= 0) {
    toast('Sin utilidad bruta no se puede generar el reporte de marketing', 'info');
    return;
  }
  // Filas detalladas
  const rows = data.filas.map(f => ({
    canal: f.canal,
    pctBudget: f.pct,
    monto: f.monto,
    razon: f.razon
  }));
  // Filas de resumen al final
  rows.push({ canal: '', pctBudget: null, monto: null, razon: '' });
  rows.push({ canal: 'TOTAL PRESUPUESTO MARKETING', pctBudget: 1, monto: data.presupuestoTotal, razon: `${pctInput}% de utilidad bruta` });
  rows.push({ canal: 'Utilidad bruta (referencia)', pctBudget: null, monto: data.utilidadBruta, razon: '' });
  rows.push({ canal: 'Ventas brutas (referencia)', pctBudget: null, monto: data.totalVentas, razon: data.pctVentas !== null ? `Mkt = ${(data.pctVentas * 100).toFixed(1)}% de ventas` : '' });

  downloadReportExcel(
    `AIMMA-analisis-marketing-${pctInput}pct.xlsx`,
    `Marketing ${pctInput}%`,
    rows,
    [
      { key: 'canal', label: 'Canal', width: 38 },
      { key: 'pctBudget', label: '% del presupuesto', width: 18, format: 'percent' },
      { key: 'monto', label: 'Monto a invertir', width: 20, format: 'money' },
      { key: 'razon', label: 'Razon / Recomendacion AIMMA', width: 70 }
    ]
  );
}

// Devoluciones del período (cantidad o subtotal negativo).
// Se separan del top de ventas para análisis aparte.
function getDevoluciones() {
  const ventas = filterByMonth(state.ventas);
  return ventas
    .filter(v => !v._pdfTotalOnly && ((v.cantidad || 0) < 0 || (v.subtotal || 0) < 0))
    .map(v => ({
      fecha: v.fecha,
      factura: v.factura,
      codigo: v.codigo,
      descripcion: v.descripcion,
      cantidad: v.cantidad,
      valor: v.subtotal
    }));
}

// Productos del inventario que NO se vendieron en el período
function getReferenciasSinVenta() {
  const ventas = filterByMonth(state.ventas);
  // Map de codigos vendidos a su descripción más frecuente (para tiebreak en cruce inverso)
  const ventasMap = new Map();
  ventas.forEach(v => {
    if (!v.codigo) return;
    const k = v.codigo.toUpperCase();
    if (!ventasMap.has(k)) ventasMap.set(k, { codigo: v.codigo, descripcion: v.descripcion });
  });
  const lista = state.inventario
    .filter(i => {
      if (!i.codigo) return false;
      const k = i.codigo.toUpperCase();
      // Cruce inverso con tiebreak por nombre de inventario: si ventas tiene candidato(s)
      // y el nombre coincide, considerar vendido. Si no coincide, considerar SIN venta.
      const venta = findBestInventoryMatch(k, i.nombre, ventasMap);
      return !venta;
    })
    .map(i => ({
      codigo: i.codigo,
      nombre: i.nombre,
      stockActual: i.stockActual || 0,
      costoUnitario: i.costoUnitario || 0,
      valorTotal: (i.stockActual || 0) * (i.costoUnitario || 0)
    }));
  lista.sort((a, b) => b.valorTotal - a.valorTotal);
  return lista;
}

// Productos vendidos que no tienen costo en el inventario actual
function getProductosVendidosSinCosto() {
  const invMap = new Map();
  state.inventario.forEach(i => { if (i.codigo) invMap.set(i.codigo.toUpperCase(), i); });
  const grupos = ventasPorCodigo();
  const lista = [];
  grupos.forEach((v, k) => {
    // Cruce con descripción para evitar falsos sin-costo: si hay ambigüedad y la
    // descripción coincide con un candidato, considera que SÍ está en inventario.
    const inv = findBestInventoryMatch(k, v.descripcion, invMap);
    if (!inv) {
      lista.push({
        codigo: v.codigo,
        descripcion: v.descripcion,
        cantidadVendida: v.cantidad,
        totalVendido: v.total
      });
    }
  });
  lista.sort((a, b) => b.totalVendido - a.totalVendido);
  return lista;
}

// Helper: descarga datos como Excel con anchos de columna y headers en negrita
function downloadReportExcel(filename, sheetName, rows, columns) {
  if (rows.length === 0) {
    toast(`No hay datos para "${sheetName}"`, 'info');
    return;
  }
  const headers = columns.map(c => c.label);
  const data = rows.map(r => columns.map(c => r[c.key] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = columns.map(c => ({ wch: c.width || 16 }));

  // Aplicar formato de celda Excel a columnas marcadas como money o percent.
  // SheetJS Community soporta number format via cell.z aunque no soporta colores/bordes.
  const MONEY_FMT = '"$"#,##0;[Red]-"$"#,##0';   // $1.234.567 con negativos en rojo
  const PERCENT_FMT = '0.0%';
  const fmtFor = (col) => col.format === 'money' ? MONEY_FMT : (col.format === 'percent' ? PERCENT_FMT : null);
  columns.forEach((col, cIdx) => {
    const fmt = fmtFor(col);
    if (!fmt) return;
    for (let r = 1; r <= rows.length; r++) {
      const addr = XLSX.utils.encode_cell({ c: cIdx, r });
      const cell = ws[addr];
      if (!cell) continue;
      cell.z = fmt;
      // Asegurar tipo numérico si el valor es numérico
      if (typeof cell.v === 'number') cell.t = 'n';
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
  toast(`✓ ${rows.length} filas descargadas: ${filename}`, 'success');
}

// HELPER: si hay proyeccion (factor != 1), devuelve las filas enriquecidas con
// los valores ORIGINALES del informe (sin proyectar) en campos *Informe.
// Asi el cliente ve "cantidad vendida (15 dias)" + "cantidad proyectada (30 dias)".
function enriquecerConValoresInforme(filas) {
  const factor = state.ventasPeriodoFactor;
  if (!factor || Math.abs(factor - 1) < 0.001) return filas;
  return filas.map(r => {
    const enriched = { ...r };
    if (r.unidadesVendidasMes != null)
      enriched.unidadesVendidasInforme = Math.round(r.unidadesVendidasMes / factor);
    if (r.valorVendido != null)
      enriched.valorVendidoInforme = r.valorVendido / factor;
    if (r.cantidadVendida != null)
      enriched.cantidadVendidaInforme = Math.round(r.cantidadVendida / factor);
    if (r.totalVendido != null)
      enriched.totalVendidoInforme = r.totalVendido / factor;
    return enriched;
  });
}

// HELPER: si hay proyeccion, inserta columnas "informe" antes de las "30 dias"
// en la definicion de columnas del Excel. Si factor == 1, retorna columnas sin cambio.
function agregarColumnasInforme(columns, mapping) {
  const factor = state.ventasPeriodoFactor;
  const dias = state.ventasPeriodoDias;
  if (!factor || Math.abs(factor - 1) < 0.001 || !dias || dias === 30) return columns;
  const result = [];
  columns.forEach(col => {
    const mp = mapping[col.key];
    if (mp) {
      // Insertar columna informe ANTES de la proyectada
      result.push({
        key: mp.informeKey,
        label: mp.informeLabel.replace('{DIAS}', dias),
        width: col.width,
        format: col.format
      });
    }
    result.push(col);
  });
  return result;
}

// Construye una hoja Excel con titulo + headers + datos + formato money/percent
// para incluirla en el workbook consolidado (downloadAllReports).
function buildSheetForBulk(rows, columns, titleText) {
  const MONEY_FMT = '"$"#,##0;[Red]-"$"#,##0';
  const PERCENT_FMT = '0.0%';
  if (!rows || !rows.length) {
    const ws = XLSX.utils.aoa_to_sheet([[titleText], [], ['Sin datos para este reporte.']]);
    ws['!cols'] = [{ wch: Math.max(titleText.length + 4, 40) }];
    return ws;
  }
  const headers = columns.map(c => c.label);
  const dataArr = rows.map(r => columns.map(c => r[c.key] ?? ''));
  // Estructura: row0=titulo, row1=vacio, row2=headers, row3+=data
  const aoa = [[titleText], [], headers, ...dataArr];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Merge titulo a lo ancho de todas las columnas
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];
  ws['!cols'] = columns.map(c => ({ wch: c.width || 16 }));
  // Aplicar formato money/percent a las filas de datos (empiezan en row index 3)
  columns.forEach((col, cIdx) => {
    const fmt = col.format === 'money' ? MONEY_FMT : (col.format === 'percent' ? PERCENT_FMT : null);
    if (!fmt) return;
    for (let r = 3; r < 3 + rows.length; r++) {
      const addr = XLSX.utils.encode_cell({ c: cIdx, r });
      const cell = ws[addr];
      if (!cell) continue;
      cell.z = fmt;
      if (typeof cell.v === 'number') cell.t = 'n';
    }
  });
  return ws;
}

// Descarga TODOS los reportes en UN SOLO archivo Excel con hojas separadas
// y titulo descriptivo arriba de cada hoja. El usuario obtiene un dossier
// completo de su negocio en un click.
function downloadAllReports() {
  const dias = Number(document.getElementById('dias-resurtido')?.value) || 45;
  const pctMkt = Number(document.getElementById('pct-marketing')?.value) || 5;
  const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const proyTxt = (state.ventasPeriodoDias && state.ventasPeriodoDias !== 30)
    ? ` · Datos proyectados a 30 días (fuente: ${state.ventasPeriodoDias} días)`
    : '';
  const wb = XLSX.utils.book_new();
  const f = calc();
  let hojas = 0;

  // ── HOJA 1: RESUMEN EJECUTIVO ──
  // Si hubo proyeccion, agregar filas con valores ORIGINALES del informe antes de los proyectados
  const factorRes = state.ventasPeriodoFactor;
  const diasRes = state.ventasPeriodoDias;
  const hayProy = factorRes && Math.abs(factorRes - 1) >= 0.001 && diasRes && diasRes !== 30;
  const resumenRows = [];
  if (hayProy) {
    resumenRows.push({ metrica: `Ventas del informe (${diasRes} días, base sin IVA)`, valor: f.totalVentas / factorRes, fmt: 'money' });
    resumenRows.push({ metrica: `IVA del informe (${diasRes} días)`, valor: f.ivaGenerado / factorRes, fmt: 'money' });
  }
  resumenRows.push(
    { metrica: 'Ventas proyectadas a 30 días (base sin IVA)', valor: f.totalVentas, fmt: 'money' },
    { metrica: 'IVA proyectado a 30 días', valor: f.ivaGenerado, fmt: 'money' },
    { metrica: 'Total con IVA proyectado a 30 días', valor: f.totalVentas + f.ivaGenerado, fmt: 'money' }
  );
  // Filas que dependen de inventario: solo se incluyen si manejaInventario=true
  if (state.manejaInventario) {
    resumenRows.push(
      { metrica: 'Costo de ventas (COGS) proyectado 30 días', valor: f.cogs || 0, fmt: 'money' },
      { metrica: 'Utilidad bruta proyectada 30 días', valor: f.utilidadBruta || 0, fmt: 'money' },
      { metrica: 'Margen bruto', valor: f.margen || 0, fmt: 'percent' }
    );
  }
  resumenRows.push(
    { metrica: 'Total gastos operativos', valor: f.totalGastos, fmt: 'money' },
    { metrica: 'Utilidad operacional', valor: f.utilOperacional || 0, fmt: 'money' },
    { metrica: 'IVA descontable (gastos)', valor: f.ivaDescontable, fmt: 'money' },
    { metrica: 'Saldo DIAN (positivo=pagar, negativo=a favor)', valor: f.saldoDian || 0, fmt: 'money' }
  );
  // Filas adicionales de inventario solo si aplica
  if (state.manejaInventario) {
    resumenRows.push(
      { metrica: 'Inventario a costo (capital amarrado)', valor: f.inventarioACosto || 0, fmt: 'money' },
      { metrica: 'Días de inventario al ritmo actual', valor: f.diasInventario ? Math.round(f.diasInventario) : 0, fmt: null }
    );
  }
  resumenRows.push(
    { metrica: 'Líneas de venta procesadas', valor: f.ventasCount, fmt: null },
    { metrica: 'Líneas de gasto procesadas', valor: f.gastosCount, fmt: null }
  );
  // Si NO hay proyeccion, simplificar labels (sin "proyectada 30 días")
  // Renombrar por contenido del string para no romper si manejaInventario=false (filas COGS/Bruta omitidas)
  if (!hayProy) {
    const renames = [
      ['Ventas proyectadas a 30 días (base sin IVA)', 'Ventas totales (base sin IVA)'],
      ['IVA proyectado a 30 días',                    'IVA generado'],
      ['Total con IVA proyectado a 30 días',          'Total con IVA'],
      ['Costo de ventas (COGS) proyectado 30 días',   'Costo de ventas (COGS)'],
      ['Utilidad bruta proyectada 30 días',           'Utilidad bruta']
    ];
    renames.forEach(([from, to]) => {
      const row = resumenRows.find(r => r.metrica === from);
      if (row) row.metrica = to;
    });
  }
  // Como las filas mezclan money/percent, separamos en 2 columnas o por filas con format dinamico.
  // Solucion: dejarlo como money por default y forzar percent en margen via post-processing.
  const ws_res = buildSheetForBulk(
    resumenRows.map(r => ({ metrica: r.metrica, valor: r.valor })),
    [
      { key: 'metrica', label: 'Métrica', width: 44 },
      { key: 'valor', label: 'Valor', width: 22, format: 'money' }
    ],
    `RESUMEN EJECUTIVO AIMMA — ${fechaHoy}${proyTxt}`
  );
  // Override formato individual: row del margen → percent, dias/conteos → integer sin $
  // Si la celda no existe (valor 0 o vacio), la creamos para que el formato se aplique siempre.
  resumenRows.forEach((r, idx) => {
    const dataRowIdx = 3 + idx;
    const addr = XLSX.utils.encode_cell({ c: 1, r: dataRowIdx });
    if (!ws_res[addr]) {
      ws_res[addr] = { t: 'n', v: r.valor || 0 };
    }
    const cell = ws_res[addr];
    if (r.fmt === 'percent') { cell.z = '0.0%'; cell.t = 'n'; }
    else if (!r.fmt) { cell.z = '0'; cell.t = 'n'; }
    // money se mantiene del default aplicado en buildSheetForBulk
  });
  XLSX.utils.book_append_sheet(wb, ws_res, '1. Resumen Ejecutivo');
  hojas++;

  // ── HOJA 2: TOP RANKING DE VENTAS Y RESURTIDO ──
  const topVentas = topVentasConEstado(dias);
  if (topVentas.length) {
    const conRanking = enriquecerConValoresInforme(topVentas.map((r, idx) => ({ rankingVentas: idx + 1, ...r })));
    const colsBase = [
      { key: 'rankingVentas', label: '# Ranking', width: 10 },
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'nombre', label: 'Nombre', width: 36 },
      { key: 'unidadesVendidasMes', label: 'Cantidad proyectada (30 días)', width: 22 },
      { key: 'valorVendido', label: 'Valor proyectado (30 días)', width: 24, format: 'money' },
      { key: 'stockActual', label: 'Stock actual', width: 12 },
      { key: 'diasInventario', label: 'Días inv. al ritmo actual', width: 22 },
      { key: 'estado', label: 'Estado', width: 14 },
      { key: 'accion', label: 'Acción recomendada', width: 50 },
      { key: 'comprar', label: 'Comprar (und)', width: 14 },
      { key: 'sobrante', label: 'Sobrante (und)', width: 14 },
      { key: 'costoUnitario', label: 'Costo unit.', width: 14, format: 'money' },
      { key: 'inversionNecesaria', label: 'Inversión a resurtido', width: 20, format: 'money' },
      { key: 'capitalAmarrado', label: 'Capital amarrado', width: 18, format: 'money' }
    ];
    const cols = agregarColumnasInforme(colsBase, {
      unidadesVendidasMes: { informeKey: 'unidadesVendidasInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' },
      valorVendido: { informeKey: 'valorVendidoInforme', informeLabel: 'Valor vendido ({DIAS} días)' }
    });
    const ws = buildSheetForBulk(conRanking, cols, `TOP RANKING DE VENTAS Y RESURTIDO — ${fechaHoy}${proyTxt}`);
    XLSX.utils.book_append_sheet(wb, ws, '2. Top ventas');
    hojas++;
  }

  // ── HOJA 3: TOP PRODUCTOS MAS RENTABLES ──
  const rent = topRentabilidad();
  if (rent.length) {
    const conRanking = enriquecerConValoresInforme(rent.map((r, idx) => ({ rankingRentabilidad: idx + 1, ...r })));
    const colsBase = [
      { key: 'rankingRentabilidad', label: '# Ranking', width: 10 },
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'nombre', label: 'Nombre', width: 36 },
      { key: 'unidadesVendidasMes', label: 'Cantidad proyectada (30 días)', width: 22 },
      { key: 'valorVendido', label: 'Valor proyectado (30 días)', width: 24, format: 'money' },
      { key: 'costoUnitario', label: 'Costo unit.', width: 14, format: 'money' },
      { key: 'costoTotal', label: 'Costo total', width: 18, format: 'money' },
      { key: 'utilidad', label: 'Utilidad $', width: 18, format: 'money' },
      { key: 'margenPct', label: 'Margen %', width: 12, format: 'percent' },
      { key: 'stockActual', label: 'Stock actual', width: 12 }
    ];
    const cols = agregarColumnasInforme(colsBase, {
      unidadesVendidasMes: { informeKey: 'unidadesVendidasInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' },
      valorVendido: { informeKey: 'valorVendidoInforme', informeLabel: 'Valor vendido ({DIAS} días)' }
    });
    const ws = buildSheetForBulk(conRanking, cols, `TOP PRODUCTOS MÁS RENTABLES — ${fechaHoy}${proyTxt}`);
    XLSX.utils.book_append_sheet(wb, ws, '3. Top rentabilidad');
    hojas++;
  }

  // ── HOJA 4: SOBRESTOCK ──
  const { sobrestock } = calcResurtido(dias);
  if (sobrestock.length) {
    const sobrestockEnriched = enriquecerConValoresInforme(sobrestock);
    const colsBase = [
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'nombre', label: 'Nombre', width: 36 },
      { key: 'stockActual', label: 'Stock actual', width: 12 },
      { key: 'unidadesVendidasMes', label: 'Cantidad proyectada (30 días)', width: 22 },
      { key: 'promedioDiario', label: 'Promedio diario', width: 14 },
      { key: 'stockOptimo', label: `Stock óptimo (${dias}d)`, width: 18 },
      { key: 'sobrante', label: 'Sobrante (und)', width: 14 },
      { key: 'costoUnitario', label: 'Costo unit.', width: 14, format: 'money' },
      { key: 'capitalAmarrado', label: 'Capital amarrado', width: 20, format: 'money' }
    ];
    const cols = agregarColumnasInforme(colsBase, {
      unidadesVendidasMes: { informeKey: 'unidadesVendidasInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' }
    });
    const ws = buildSheetForBulk(sobrestockEnriched, cols, `SOBRESTOCK — Productos con exceso (${dias}d) — ${fechaHoy}${proyTxt}`);
    XLSX.utils.book_append_sheet(wb, ws, '4. Sobrestock');
    hojas++;
  }

  // ── HOJA 5: REFERENCIAS SIN VENTA ──
  const sinVenta = getReferenciasSinVenta();
  if (sinVenta.length) {
    const ws = buildSheetForBulk(sinVenta, [
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'nombre', label: 'Nombre', width: 40 },
      { key: 'stockActual', label: 'Stock actual', width: 14 },
      { key: 'costoUnitario', label: 'Costo unitario', width: 16, format: 'money' },
      { key: 'valorTotal', label: 'Valor total inventario', width: 22, format: 'money' }
    ], `REFERENCIAS SIN VENTA DEL MES — ${fechaHoy}`);
    XLSX.utils.book_append_sheet(wb, ws, '5. Sin venta');
    hojas++;
  }

  // ── HOJA 6: VENDIDOS SIN COSTO / POSIBLE RUPTURA INVENTARIO ──
  const sinCosto = enriquecerConValoresInforme(getProductosVendidosSinCosto());
  if (sinCosto.length) {
    const colsBase = [
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'descripcion', label: 'Descripción', width: 40 },
      { key: 'cantidadVendida', label: 'Cantidad proyectada (30 días)', width: 22 },
      { key: 'totalVendido', label: 'Valor proyectado (30 días)', width: 24, format: 'money' }
    ];
    const cols = agregarColumnasInforme(colsBase, {
      cantidadVendida: { informeKey: 'cantidadVendidaInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' },
      totalVendido: { informeKey: 'totalVendidoInforme', informeLabel: 'Valor vendido ({DIAS} días)' }
    });
    const ws = buildSheetForBulk(sinCosto, cols, `VENDIDOS SIN COSTO (POSIBLE RUPTURA DE INVENTARIO) — ${fechaHoy}${proyTxt}`);
    XLSX.utils.book_append_sheet(wb, ws, '6. Posible ruptura');
    hojas++;
  }

  // ── HOJA 7: DEVOLUCIONES ──
  const devs = getDevoluciones();
  if (devs.length) {
    const ws = buildSheetForBulk(devs, [
      { key: 'fecha', label: 'Fecha', width: 14 },
      { key: 'factura', label: 'Factura', width: 14 },
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'descripcion', label: 'Descripción', width: 40 },
      { key: 'cantidad', label: 'Cantidad', width: 12 },
      { key: 'valor', label: 'Valor', width: 14, format: 'money' }
    ], `DEVOLUCIONES DEL PERÍODO — ${fechaHoy}`);
    XLSX.utils.book_append_sheet(wb, ws, '7. Devoluciones');
    hojas++;
  }

  // ── HOJA 8: PUNTO DE EQUILIBRIO FINANCIERO ──
  const pe = calcPuntoEquilibrio();
  if (pe.totalVentas && pe.totalGastos) {
    const peRows = [
      { metrica: 'Ventas reales del período', valor: pe.totalVentas },
      { metrica: 'Costo de ventas (COGS)', valor: pe.cogs || 0 },
      { metrica: 'Utilidad bruta', valor: pe.utilidadBruta || 0 },
      { metrica: 'Margen bruto (decimal)', valor: pe.margenBruto || 0 },
      { metrica: 'Gastos operativos del período', valor: pe.totalGastos },
      { metrica: 'Punto de equilibrio (ventas mínimas)', valor: pe.puntoEquilibrioVentas || 0 },
      { metrica: 'Brecha sobre punto de equilibrio', valor: pe.brecha || 0 },
      { metrica: 'Cobertura del PE (decimal)', valor: pe.cobertura || 0 },
      { metrica: 'Utilidad operacional', valor: pe.utilOperacional || 0 }
    ];
    const ws = buildSheetForBulk(peRows, [
      { key: 'metrica', label: 'Métrica', width: 44 },
      { key: 'valor', label: 'Valor', width: 22, format: 'money' }
    ], `PUNTO DE EQUILIBRIO FINANCIERO — ${fechaHoy}`);
    XLSX.utils.book_append_sheet(wb, ws, '8. Punto equilibrio');
    hojas++;
  }

  // ── HOJA 9: % PARTICIPACION DE GASTOS ──
  const pg = calcParticipacionGastos();
  if (pg.filas.length) {
    const pgRows = [...pg.filas, {
      concepto: 'TOTAL GASTOS',
      total: pg.totalGastos,
      registros: pg.filas.reduce((s, x) => s + x.registros, 0),
      porcentajeRentabilidad: pg.porcentajeTotalRentabilidad,
      porcentajeVentas: pg.totalVentas > 0 ? pg.totalGastos / pg.totalVentas : null
    }];
    const ws = buildSheetForBulk(pgRows, [
      { key: 'concepto', label: 'Concepto / Categoría', width: 36 },
      { key: 'total', label: 'Total gastado', width: 18, format: 'money' },
      { key: 'registros', label: '# Facturas', width: 12 },
      { key: 'porcentajeRentabilidad', label: '% de Utilidad Bruta', width: 22, format: 'percent' },
      { key: 'porcentajeVentas', label: '% de Ventas', width: 16, format: 'percent' }
    ], `% PARTICIPACIÓN DE TUS GASTOS — ${fechaHoy}`);
    XLSX.utils.book_append_sheet(wb, ws, '9. Participacion gastos');
    hojas++;
  }

  // ── HOJA 10: ANALISIS DE MARKETING AIMMA ──
  const am = calcAnalisisMarketing(pctMkt);
  if (am.presupuestoTotal > 0) {
    const amRows = am.filas.map(c => ({
      canal: c.canal, pctBudget: c.pct, monto: c.monto, razon: c.razon
    }));
    amRows.push({ canal: '', pctBudget: null, monto: null, razon: '' });
    amRows.push({ canal: 'TOTAL PRESUPUESTO MARKETING', pctBudget: 1, monto: am.presupuestoTotal, razon: `${pctMkt}% de utilidad bruta` });
    amRows.push({ canal: 'Utilidad bruta (referencia)', pctBudget: null, monto: am.utilidadBruta, razon: '' });
    amRows.push({ canal: 'Ventas brutas (referencia)', pctBudget: null, monto: am.totalVentas, razon: am.pctVentas !== null ? `Mkt = ${(am.pctVentas * 100).toFixed(1)}% de ventas` : '' });
    const ws = buildSheetForBulk(amRows, [
      { key: 'canal', label: 'Canal', width: 38 },
      { key: 'pctBudget', label: '% del presupuesto', width: 18, format: 'percent' },
      { key: 'monto', label: 'Monto a invertir', width: 20, format: 'money' },
      { key: 'razon', label: 'Razón / Recomendación AIMMA', width: 70 }
    ], `ANÁLISIS DE MARKETING AIMMA (${pctMkt}% utilidad bruta) — ${fechaHoy}`);
    XLSX.utils.book_append_sheet(wb, ws, '10. Marketing');
    hojas++;
  }

  if (hojas === 0) {
    toast('No hay datos suficientes para generar el informe consolidado', 'info');
    return;
  }

  const fechaArchivo = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `AIMMA-informe-completo-${fechaArchivo}.xlsx`);
  toast(`✓ Informe consolidado: ${hojas} hojas descargadas en un solo archivo`, 'success');
}

function downloadResurtido() {
  const dias = Number(document.getElementById('dias-resurtido').value) || 45;
  const top = topVentasConEstado(dias);
  const conRanking = enriquecerConValoresInforme(top.map((r, idx) => ({ rankingVentas: idx + 1, ...r })));
  const colsBase = [
    { key: 'rankingVentas', label: '# Ranking', width: 10 },
    { key: 'codigo', label: 'Código', width: 14 },
    { key: 'nombre', label: 'Nombre', width: 36 },
    { key: 'unidadesVendidasMes', label: 'Cantidad proyectada (30 días)', width: 22 },
    { key: 'valorVendido', label: 'Valor proyectado (30 días)', width: 24, format: 'money' },
    { key: 'stockActual', label: 'Stock actual', width: 12 },
    { key: 'diasInventario', label: 'Días inv. al ritmo actual', width: 22 },
    { key: 'estado', label: 'Estado', width: 14 },
    { key: 'accion', label: 'Acción recomendada', width: 50 },
    { key: 'comprar', label: 'Comprar (und)', width: 14 },
    { key: 'sobrante', label: 'Sobrante (und)', width: 14 },
    { key: 'costoUnitario', label: 'Costo unit.', width: 14, format: 'money' },
    { key: 'inversionNecesaria', label: 'Inversión a resurtido', width: 20, format: 'money' },
    { key: 'capitalAmarrado', label: 'Capital amarrado', width: 18, format: 'money' }
  ];
  const columns = agregarColumnasInforme(colsBase, {
    unidadesVendidasMes: { informeKey: 'unidadesVendidasInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' },
    valorVendido: { informeKey: 'valorVendidoInforme', informeLabel: 'Valor vendido ({DIAS} días)' }
  });
  downloadReportExcel(`AIMMA-top-ventas-${dias}dias.xlsx`, `Top ventas ${dias}d`, conRanking, columns);
}

function downloadRentabilidad() {
  const lista = topRentabilidad();
  if (lista.length === 0) {
    toast('No hay productos con costo cargado para calcular rentabilidad', 'info');
    return;
  }
  const conRanking = enriquecerConValoresInforme(lista.map((r, idx) => ({ rankingRentabilidad: idx + 1, ...r })));
  const colsBase = [
    { key: 'rankingRentabilidad', label: '# Ranking', width: 10 },
    { key: 'codigo', label: 'Código', width: 14 },
    { key: 'nombre', label: 'Nombre', width: 36 },
    { key: 'unidadesVendidasMes', label: 'Cantidad proyectada (30 días)', width: 22 },
    { key: 'valorVendido', label: 'Valor proyectado (30 días)', width: 24, format: 'money' },
    { key: 'costoUnitario', label: 'Costo unit.', width: 14, format: 'money' },
    { key: 'costoTotal', label: 'Costo total', width: 18, format: 'money' },
    { key: 'utilidad', label: 'Utilidad $', width: 18, format: 'money' },
    { key: 'margenPct', label: 'Margen %', width: 12, format: 'percent' },
    { key: 'stockActual', label: 'Stock actual', width: 12 }
  ];
  const columns = agregarColumnasInforme(colsBase, {
    unidadesVendidasMes: { informeKey: 'unidadesVendidasInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' },
    valorVendido: { informeKey: 'valorVendidoInforme', informeLabel: 'Valor vendido ({DIAS} días)' }
  });
  downloadReportExcel(`AIMMA-top-rentabilidad.xlsx`, 'Top rentabilidad', conRanking, columns);
}

function downloadDevoluciones() {
  const lista = getDevoluciones();
  if (lista.length === 0) { toast('No hay devoluciones registradas en el período', 'info'); return; }
  const periodo = state.filterMonth === 'all' ? 'todo-el-periodo' : state.filterMonth;
  downloadReportExcel(
    `AIMMA-devoluciones-${periodo}.xlsx`,
    'Devoluciones',
    lista,
    [
      { key: 'fecha', label: 'Fecha', width: 14 },
      { key: 'factura', label: 'Factura', width: 14 },
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'descripcion', label: 'Descripción', width: 40 },
      { key: 'cantidad', label: 'Cantidad', width: 12 },
      { key: 'valor', label: 'Valor', width: 14, format: 'money' }
    ]
  );
}

function downloadSobrestock() {
  const dias = Number(document.getElementById('dias-resurtido').value) || 45;
  const { sobrestock } = calcResurtido(dias);
  const sobrestockEnriched = enriquecerConValoresInforme(sobrestock);
  const colsBase = [
    { key: 'codigo', label: 'Código', width: 14 },
    { key: 'nombre', label: 'Nombre', width: 36 },
    { key: 'stockActual', label: 'Stock actual', width: 12 },
    { key: 'unidadesVendidasMes', label: 'Cantidad proyectada (30 días)', width: 22 },
    { key: 'promedioDiario', label: 'Promedio diario', width: 14 },
    { key: 'stockOptimo', label: `Stock óptimo (${dias}d)`, width: 18 },
    { key: 'sobrante', label: 'Sobrante (unidades)', width: 18 },
    { key: 'costoUnitario', label: 'Costo unit.', width: 14, format: 'money' },
    { key: 'capitalAmarrado', label: 'Capital amarrado', width: 20, format: 'money' }
  ];
  const columns = agregarColumnasInforme(colsBase, {
    unidadesVendidasMes: { informeKey: 'unidadesVendidasInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' }
  });
  downloadReportExcel(`AIMMA-sobrestock-${dias}dias.xlsx`, `Sobrestock ${dias} dias`, sobrestockEnriched, columns);
}

function downloadSinVenta() {
  const lista = getReferenciasSinVenta();
  const periodo = state.filterMonth === 'all' ? 'todo-el-periodo' : state.filterMonth;
  downloadReportExcel(
    `AIMMA-referencias-sin-venta-${periodo}.xlsx`,
    'Sin venta',
    lista,
    [
      { key: 'codigo', label: 'Código', width: 14 },
      { key: 'nombre', label: 'Nombre', width: 40 },
      { key: 'stockActual', label: 'Stock actual', width: 14 },
      { key: 'costoUnitario', label: 'Costo unitario', width: 16, format: 'money' },
      { key: 'valorTotal', label: 'Valor total inventario', width: 22, format: 'money' }
    ]
  );
}

function downloadSinCosto() {
  const lista = enriquecerConValoresInforme(getProductosVendidosSinCosto());
  const colsBase = [
    { key: 'codigo', label: 'Código', width: 14 },
    { key: 'descripcion', label: 'Descripción', width: 40 },
    { key: 'cantidadVendida', label: 'Cantidad proyectada (30 días)', width: 22 },
    { key: 'totalVendido', label: 'Valor proyectado (30 días)', width: 24, format: 'money' }
  ];
  const columns = agregarColumnasInforme(colsBase, {
    cantidadVendida: { informeKey: 'cantidadVendidaInforme', informeLabel: 'Cantidad vendida ({DIAS} días)' },
    totalVendido: { informeKey: 'totalVendidoInforme', informeLabel: 'Valor vendido ({DIAS} días)' }
  });
  downloadReportExcel(`AIMMA-vendidos-sin-costo-posible-ruptura.xlsx`, 'Posible ruptura inventario', lista, columns);
}

/* Render de "terminal AIMMA" — animación tipo consola con stats clave */

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Construye una línea con delay de animación basada en su posición
function termLine(html, idx) {
  return `<div class="term-line" style="animation-delay:${idx * 90}ms">${html}</div>`;
}

function renderTerminal(elId, lines) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = lines.map((html, i) => termLine(html, i)).join('');
}

function termPrompt(cmd, flags = '') {
  return `<span class="term-prompt">aimma@dashboard ~$</span>` +
         `<span class="term-cmd">${escapeHtml(cmd)}</span>` +
         (flags ? `<span class="term-flag"> ${escapeHtml(flags)}</span>` : '');
}

function termStep(label) {
  // padding con puntos hasta 36 chars + [OK]
  const dotsCount = Math.max(2, 38 - label.length);
  return `<span class="term-label">${escapeHtml(label)} ${'.'.repeat(dotsCount)}</span><span class="term-ok">OK</span>`;
}

function termMetric(label, value, type = 'value') {
  const cls = type === 'warning' ? 'term-value-warning'
            : type === 'danger' ? 'term-value-danger'
            : 'term-value';
  return `<span class="term-label">${escapeHtml(label)}:</span> <span class="${cls}">${escapeHtml(value)}</span>`;
}

function termMsg(text, type = '') {
  const cls = type === 'warning' ? 'term-msg-warning' : 'term-msg';
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function termArrow(text) {
  return `<span class="term-arrow">▸</span> <span class="term-msg">${escapeHtml(text)}</span>`;
}

// --- TERMINAL TOP DE VENTAS (con estado de stock) ---
function renderTerminalResurtido(topVentas, dias) {
  const id = 'terminal-resurtido';
  if (topVentas.length === 0) {
    renderTerminal(id, [
      termPrompt('analizar', `--top-ventas --dias=${dias}`),
      termStep('Cruzando ventas vs inventario'),
      '<div class="term-spacer"></div>',
      termMsg('No detecté ventas con código de producto en el período.', 'warning')
    ]);
    return;
  }
  const top = topVentas[0];
  const porEstado = topVentas.reduce((acc, t) => { acc[t.estado] = (acc[t.estado]||0) + 1; return acc; }, {});
  const totalInv = topVentas.reduce((s, r) => s + (r.inversionNecesaria || 0), 0);
  const totalUndComprar = topVentas.reduce((s, r) => s + (r.comprar || 0), 0);

  // Si hubo proyeccion, agregar aviso
  const proyAviso = (state.ventasPeriodoDias && state.ventasPeriodoDias !== 30)
    ? termMsg(`(AIMMA ha proyectado este informe a 30 días de venta — tu data original era de ${state.ventasPeriodoDias} días)`, 'warning')
    : null;

  const lines = [
    termPrompt('analizar', `--top-ventas --dias=${dias}`),
    termStep('Cruzando ventas vs inventario'),
    termStep('Calculando estado de stock por referencia'),
    termStep('Ordenando por unidades vendidas (neto)'),
    '<div class="term-spacer"></div>'
  ];
  if (proyAviso) {
    lines.push(proyAviso);
    lines.push('<div class="term-spacer"></div>');
  }
  lines.push(termMetric('Top venta', `${top.codigo} ${top.nombre} → ${top.unidadesVendidasMes} und/mes`));
  lines.push(termMetric('Total códigos vendidos', topVentas.length.toLocaleString('es-CO')));
  lines.push(termMetric('Resurtir', `${(porEstado['RESURTIR']||0) + (porEstado['SIN STOCK']||0)} productos · ${fmtMoney(totalInv)}`, 'warning'));
  lines.push(termMetric('Stock OK', (porEstado['OK']||0).toLocaleString('es-CO')));
  lines.push(termMetric('Sobrestock', (porEstado['SOBRESTOCK']||0).toLocaleString('es-CO'), 'warning'));
  lines.push('<div class="term-spacer"></div>');
  lines.push(termArrow('Descarga el informe: incluye TODOS los códigos vendidos con estado y acción recomendada.'));

  renderTerminal(id, lines);
}

// --- TERMINAL TOP RENTABILIDAD (productos más rentables por utilidad $) ---
function renderTerminalRentabilidad(lista) {
  const id = 'terminal-rentabilidad';
  if (lista.length === 0) {
    renderTerminal(id, [
      termPrompt('analizar', '--top-rentabilidad'),
      termStep('Calculando utilidad por producto'),
      '<div class="term-spacer"></div>',
      termMsg('No hay productos con costo cargado en inventario para calcular rentabilidad.', 'warning'),
      termMsg('Recuerda: solo aparecen productos que tienen costo unitario en tu archivo de inventario.')
    ]);
    return;
  }
  const top1 = lista[0];
  const totalUtilidad = lista.reduce((s, r) => s + (r.utilidad || 0), 0);
  const totalVentas = lista.reduce((s, r) => s + (r.valorVendido || 0), 0);
  const margenPromedio = totalVentas > 0 ? totalUtilidad / totalVentas : 0;

  renderTerminal(id, [
    termPrompt('analizar', '--top-rentabilidad --por-utilidad-total'),
    termStep('Cruzando ventas vs costo unitario'),
    termStep('Calculando utilidad por producto'),
    termStep('Ordenando por utilidad total descendente'),
    '<div class="term-spacer"></div>',
    termMetric('Producto más rentable', `${top1.codigo} ${top1.nombre}`),
    termMetric('Utilidad #1', `${fmtMoney(top1.utilidad)} (${(top1.margenPct*100).toFixed(1)}% margen)`),
    termMetric('Total códigos rentables', lista.length.toLocaleString('es-CO')),
    termMetric('Utilidad total del período', fmtMoney(totalUtilidad)),
    termMetric('Margen promedio ponderado', `${(margenPromedio*100).toFixed(1)}%`),
    '<div class="term-spacer"></div>',
    termArrow('Descarga el informe completo con ranking, utilidad $ y margen % por producto.')
  ]);
}

// --- TERMINAL SOBRESTOCK ---
function renderTerminalSobrestock(sobrestock, dias) {
  const id = 'terminal-sobrestock';
  if (sobrestock.length === 0) {
    renderTerminal(id, [
      termPrompt('analizar', `--sobrestock --dias=${dias}`),
      termStep('Identificando exceso de stock'),
      '<div class="term-spacer"></div>',
      termMsg('No detecté sobrestock con tu configuración actual.')
    ]);
    return;
  }
  const totalCapital = sobrestock.reduce((s, r) => s + r.capitalAmarrado, 0);
  const totalUnd = sobrestock.reduce((s, r) => s + r.sobrante, 0);
  renderTerminal(id, [
    termPrompt('analizar', `--sobrestock --dias=${dias}`),
    termStep('Identificando exceso de stock'),
    termStep('Calculando capital amarrado'),
    '<div class="term-spacer"></div>',
    termMetric('Costo de tu sobrestock', fmtMoney(totalCapital), 'warning'),
    termMetric('Unidades sobrantes', totalUnd.toLocaleString('es-CO')),
    termMetric('Productos con exceso', sobrestock.length.toLocaleString('es-CO')),
    '<div class="term-spacer"></div>',
    termArrow('Descarga el informe para reducir inventario amarrado y liberar caja.')
  ]);
}

// --- TERMINAL SIN VENTA ---
function renderTerminalSinVenta(sinVenta) {
  const id = 'terminal-sin-venta';
  if (sinVenta.length === 0) {
    renderTerminal(id, [
      termPrompt('analizar', '--sin-rotacion'),
      termStep('Cruzando ventas vs inventario'),
      '<div class="term-spacer"></div>',
      termMsg('Todas tus referencias tuvieron movimiento en el período. Excelente rotación.')
    ]);
    return;
  }
  const totalValor = sinVenta.reduce((s, r) => s + r.valorTotal, 0);
  const totalUnd = sinVenta.reduce((s, r) => s + r.stockActual, 0);
  renderTerminal(id, [
    termPrompt('analizar', '--sin-rotacion'),
    termStep('Cruzando ventas vs inventario'),
    termStep('Detectando referencias sin movimiento'),
    '<div class="term-spacer"></div>',
    termMetric('Costo sin ventas este mes', fmtMoney(totalValor), 'danger'),
    termMetric('Referencias sin rotación', sinVenta.length.toLocaleString('es-CO')),
    termMetric('Unidades inmovilizadas', totalUnd.toLocaleString('es-CO')),
    '<div class="term-spacer"></div>',
    termArrow('Descarga el informe para identificar productos a promocionar o liquidar.')
  ]);
}

// --- TERMINAL VENDIDOS SIN COSTO ---
function renderTerminalSinCosto(sinCosto) {
  const id = 'terminal-sin-costo';
  if (sinCosto.length === 0) {
    renderTerminal(id, [
      termPrompt('analizar', '--vendidos-sin-costo --posible-ruptura-inventario'),
      termStep('Cruzando ventas vs inventario'),
      '<div class="term-spacer"></div>',
      termMsg('Todas tus ventas tienen costo registrado en el inventario. ')
    ]);
    return;
  }
  const totalVendido = sinCosto.reduce((s, r) => s + r.totalVendido, 0);
  const totalUnd = sinCosto.reduce((s, r) => s + r.cantidadVendida, 0);
  renderTerminal(id, [
    termPrompt('analizar', '--vendidos-sin-costo --posible-ruptura-inventario'),
    termStep('Cruzando ventas vs inventario'),
    termStep('Detectando ventas sin registro de costo'),
    '<div class="term-spacer"></div>',
    termMetric('Ventas sin costo encontradas', fmtMoney(totalVendido), 'warning'),
    termMetric('Códigos sin match en inventario', `${sinCosto.length.toLocaleString('es-CO')} (${totalUnd.toLocaleString('es-CO')} und)`),
    '<div class="term-spacer"></div>',
    termMsg('POSIBLE RUPTURA DE INVENTARIO: vendiste estos productos pero no aparecen en tu archivo de inventario actual.', 'warning'),
    termMsg('Causas comunes: producto agotado y no se repuso · cambio de código entre venta e inventario · referencia nueva no registrada.'),
    '<div class="term-spacer"></div>',
    termArrow('Descarga el informe para revisar códigos y resurtir lo que falte en bodega.')
  ]);
}

// --- TERMINAL PUNTO DE EQUILIBRIO FINANCIERO ---
// Calcula y muestra cuántas ventas necesitas para cubrir gastos, y entrega
// recomendaciones comerciales accionables según los días de inventario.
function renderTerminalPuntoEquilibrio() {
  const id = 'terminal-punto-equilibrio';
  const el = document.getElementById(id);
  if (!el) return;
  const pe = calcPuntoEquilibrio();

  if (!pe.totalVentas || pe.totalVentas <= 0) {
    renderTerminal(id, [
      termPrompt('analizar', '--punto-equilibrio'),
      '<div class="term-spacer"></div>',
      termMsg('No hay ventas suficientes para calcular el punto de equilibrio.', 'warning')
    ]);
    return;
  }
  if (!pe.totalGastos || pe.totalGastos <= 0) {
    renderTerminal(id, [
      termPrompt('analizar', '--punto-equilibrio'),
      termStep('Calculando ventas para cubrir gastos'),
      '<div class="term-spacer"></div>',
      termMsg('Sin gastos cargados: cualquier venta es ganancia. Sube tus gastos para un análisis real.', 'warning')
    ]);
    return;
  }

  const margenPct = pe.margenBruto * 100;
  const lines = [
    termPrompt('analizar', '--punto-equilibrio --recomendaciones-comerciales'),
    termStep('Calculando margen efectivo'),
    termStep('Estimando ventas mínimas para cubrir gastos'),
    termStep('Generando recomendaciones según rotación'),
    '<div class="term-spacer"></div>',
    termMetric('Tu margen bruto actual', `${margenPct.toFixed(1)}%`),
    termMetric('Tus gastos del período', fmtMoney(pe.totalGastos)),
    termMetric('Ventas mínimas para cubrir gastos', fmtMoney(pe.puntoEquilibrioVentas), pe.cobertura >= 1 ? 'value' : 'warning'),
    termMetric('Tus ventas reales', fmtMoney(pe.totalVentas)),
  ];

  if (pe.cobertura >= 1) {
    lines.push(termMetric('Excedente sobre punto de equilibrio', fmtMoney(pe.brecha)));
    lines.push(termMetric('Cobertura del punto de equilibrio', `${(pe.cobertura * 100).toFixed(1)}%`));
  } else {
    lines.push(termMetric('Faltante para cubrir gastos', fmtMoney(-pe.brecha), 'danger'));
    lines.push(termMetric('Cobertura del punto de equilibrio', `${(pe.cobertura * 100).toFixed(1)}%`, 'danger'));
  }
  lines.push('<div class="term-spacer"></div>');

  // Recomendaciones según rotación / días de inventario
  const dias = pe.diasInventario;
  if (dias === null || !isFinite(dias)) {
    lines.push(termArrow('Sin datos de rotación. Sube inventario+costo para análisis completo.'));
  } else if (dias <= 30) {
    lines.push(termMsg(`Estás con ${Math.round(dias)} días de inventario — rotación EXCELENTE.`));
    lines.push(termArrow('Mantén el ritmo. Considera ampliar surtido o subir precio en best-sellers.'));
  } else if (dias <= 60) {
    lines.push(termMsg(`Estás con ${Math.round(dias)} días de inventario — rotación saludable.`));
    lines.push(termArrow('Foco en mantener: revisa estrategia de precios y comunicación constante.'));
  } else if (dias <= 90) {
    lines.push(termMsg(`Estás con ${Math.round(dias)} días de inventario — rotación lenta empieza a acumularse.`, 'warning'));
    lines.push(termArrow('Físico: reorganizar exhibición · resaltar lo lento en góndolas frontales.'));
    lines.push(termArrow('Digital: rotar productos lentos a HOME web · 3 historias semanales · 2 reels/mes.'));
  } else if (dias <= 180) {
    lines.push(termMsg(`Estás con ${Math.round(dias)} días de inventario — capital amarrado.`, 'warning'));
    lines.push(termArrow('Físico: descuentos focalizados 15-25% en sobrestock · exhibición frontal y combos.'));
    lines.push(termArrow('Digital: campañas Meta/Google a las referencias sobrestockeadas · banner HOME · stories diarias.'));
  } else {
    lines.push(termMsg(`Estás con ${Math.round(dias)} días de inventario — LIQUIDACIÓN URGENTE.`, 'danger'));
    lines.push(termArrow('Físico: liquidación 30-50% · combos · venta especial fin de semana.'));
    lines.push(termArrow('Digital: anuncios Meta + Google · email a clientes recurrentes · reels diarios · HOME web tipo outlet.'));
  }

  lines.push('<div class="term-spacer"></div>');
  lines.push(termMsg(`Punto de equilibrio = Gastos / Margen bruto = ${fmtMoney(pe.totalGastos)} / ${margenPct.toFixed(1)}% = ${fmtMoney(pe.puntoEquilibrioVentas)}`));

  renderTerminal(id, lines);
}

// --- TERMINAL PARTICIPACIÓN DE GASTOS ---
// Muestra cuánto % de tu utilidad bruta se consume cada categoría de gasto.
function renderTerminalParticipacionGastos() {
  const id = 'terminal-participacion-gastos';
  const el = document.getElementById(id);
  if (!el) return;
  const data = calcParticipacionGastos();

  if (!data.filas.length) {
    renderTerminal(id, [
      termPrompt('analizar', '--participacion-gastos'),
      '<div class="term-spacer"></div>',
      termMsg('No hay gastos registrados en el período.', 'warning')
    ]);
    return;
  }
  if (!data.utilidadBruta || data.utilidadBruta <= 0) {
    renderTerminal(id, [
      termPrompt('analizar', '--participacion-gastos'),
      termStep('Agrupando gastos por concepto'),
      '<div class="term-spacer"></div>',
      termMsg('Tu utilidad bruta no es positiva: revisa costo de ventas antes de calcular participaciones.', 'warning')
    ]);
    return;
  }

  const lines = [
    termPrompt('analizar', '--participacion-gastos --vs-utilidad-bruta'),
    termStep('Agrupando gastos por concepto/proveedor'),
    termStep('Calculando % vs utilidad bruta'),
    '<div class="term-spacer"></div>',
    termMetric('Utilidad bruta del período', fmtMoney(data.utilidadBruta)),
    termMetric('Total gastos', `${fmtMoney(data.totalGastos)} (${(data.porcentajeTotalRentabilidad * 100).toFixed(1)}% de utilidad bruta)`,
      data.porcentajeTotalRentabilidad < 0.7 ? 'value' : data.porcentajeTotalRentabilidad < 1 ? 'warning' : 'danger'),
    '<div class="term-spacer"></div>',
  ];

  // Top 5 categorías
  data.filas.slice(0, 5).forEach(f => {
    const pctTxt = f.porcentajeRentabilidad !== null ? `${(f.porcentajeRentabilidad * 100).toFixed(1)}%` : '—';
    lines.push(termMetric(f.concepto, `${fmtMoney(f.total)} → ${pctTxt} de tu utilidad bruta`,
      (f.porcentajeRentabilidad || 0) > 0.3 ? 'warning' : 'value'));
  });
  if (data.filas.length > 5) {
    lines.push(termMsg(`+ ${data.filas.length - 5} categorías más (ver Excel descargable)`));
  }

  lines.push('<div class="term-spacer"></div>');
  if (data.porcentajeTotalRentabilidad >= 1) {
    lines.push(termArrow('Tus gastos consumen TODA tu utilidad bruta. Renegociar contratos grandes (arriendo, nómina) o subir margen es prioridad.'));
  } else if (data.porcentajeTotalRentabilidad >= 0.7) {
    lines.push(termArrow('Más del 70% de tu utilidad bruta va a gastos. Revisa las top 3 categorías para optimizar.'));
  } else {
    lines.push(termArrow('Estructura de gastos saludable. Mantén disciplina en los pesos altos del top.'));
  }

  renderTerminal(id, lines);
}

function downloadPuntoEquilibrio() {
  const pe = calcPuntoEquilibrio();
  if (!pe.totalVentas || !pe.totalGastos) {
    toast('Insuficientes datos para descargar punto de equilibrio', 'info');
    return;
  }
  const filas = [
    { metrica: 'Ventas reales del período', valor: pe.totalVentas },
    { metrica: 'Costo de ventas (COGS)', valor: pe.cogs || 0 },
    { metrica: 'Utilidad bruta', valor: pe.utilidadBruta || 0 },
    { metrica: 'Margen bruto (decimal)', valor: pe.margenBruto || 0 },
    { metrica: 'Gastos operativos del período', valor: pe.totalGastos },
    { metrica: 'Punto de equilibrio (ventas mínimas)', valor: pe.puntoEquilibrioVentas || 0 },
    { metrica: 'Brecha sobre punto de equilibrio', valor: pe.brecha || 0 },
    { metrica: 'Cobertura del PE (decimal)', valor: pe.cobertura || 0 },
    { metrica: 'Utilidad operacional', valor: pe.utilOperacional || 0 },
    { metrica: 'Días de inventario al ritmo actual', valor: pe.diasInventario || 0 },
    { metrica: 'Inventario a costo (capital amarrado)', valor: pe.inventarioACosto || 0 }
  ];
  // Marcar las filas que son % (usar formato distinto en Excel)
  const data = filas.map((f, i) => {
    const isPct = ['Margen bruto (decimal)','Cobertura del PE (decimal)'].includes(f.metrica);
    const isDias = f.metrica.includes('Días');
    return { ...f, _isPct: isPct, _isDias: isDias };
  });
  downloadReportExcel(
    `AIMMA-punto-equilibrio.xlsx`,
    'Punto de equilibrio',
    data,
    [
      { key: 'metrica', label: 'Métrica', width: 40 },
      { key: 'valor', label: 'Valor', width: 22, format: 'money' }
    ]
  );
}

function downloadParticipacionGastos() {
  const data = calcParticipacionGastos();
  if (!data.filasPorFactura || !data.filasPorFactura.length) {
    toast('Sin gastos para descargar', 'info');
    return;
  }

  // Helper para fecha legible
  const fmtFecha = (d) => {
    if (!d) return '';
    if (d instanceof Date) {
      return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return String(d);
  };

  // SECCION 1: detalle por factura (lo que pidio Jorge — "POR SEPARADO POR FACTURA")
  const detalleRows = data.filasPorFactura.map(f => ({
    tipoDoc: f.tipoDoc,
    archivo: f.archivo,
    proveedor: f.proveedor,
    factura: f.factura,
    concepto: f.concepto,
    fecha: fmtFecha(f.fecha),
    subtotal: f.subtotal,
    iva: f.iva,
    total: f.total,
    porcentajeRentabilidad: f.porcentajeRentabilidad,
    porcentajeVentas: f.porcentajeVentas,
  }));

  // Fila separadora visual + total general
  detalleRows.push({
    tipoDoc: '', archivo: '', proveedor: '', factura: '', concepto: '',
    fecha: '', subtotal: '', iva: '', total: '', porcentajeRentabilidad: null, porcentajeVentas: null,
  });
  detalleRows.push({
    tipoDoc: '═══',
    archivo: '═══ TOTAL GENERAL ═══',
    proveedor: '',
    factura: '',
    concepto: '',
    fecha: '',
    subtotal: '',
    iva: '',
    total: data.totalGastos,
    porcentajeRentabilidad: data.porcentajeTotalRentabilidad,
    porcentajeVentas: data.totalVentas > 0 ? data.totalGastos / data.totalVentas : null,
  });

  // Fila separadora vacia
  detalleRows.push({
    tipoDoc: '', archivo: '', proveedor: '', factura: '', concepto: '',
    fecha: '', subtotal: '', iva: '', total: '', porcentajeRentabilidad: null, porcentajeVentas: null,
  });
  // Header de seccion resumen
  detalleRows.push({
    tipoDoc: '',
    archivo: '═══ RESUMEN POR PROVEEDOR ═══',
    proveedor: '',
    factura: '',
    concepto: '',
    fecha: '',
    subtotal: '',
    iva: '',
    total: '',
    porcentajeRentabilidad: null,
    porcentajeVentas: null,
  });
  // SECCION 2: agrupado por proveedor (mismo Excel)
  data.filasAgrupadasPorProveedor.forEach(g => {
    detalleRows.push({
      tipoDoc: '',
      archivo: '',
      proveedor: g.proveedor,
      factura: `(${g.registros} facturas)`,
      concepto: g.facturas.length > 100 ? g.facturas.slice(0, 100) + '...' : g.facturas,
      fecha: '',
      subtotal: '',
      iva: '',
      total: g.total,
      porcentajeRentabilidad: g.porcentajeRentabilidad,
      porcentajeVentas: g.porcentajeVentas,
    });
  });

  downloadReportExcel(
    `AIMMA-participacion-gastos.xlsx`,
    'Detalle Gastos',
    detalleRows,
    [
      { key: 'tipoDoc', label: 'Tipo Doc', width: 22 },
      { key: 'archivo', label: 'Archivo', width: 38 },
      { key: 'proveedor', label: 'Proveedor', width: 32 },
      { key: 'factura', label: '# Factura', width: 18 },
      { key: 'concepto', label: 'Concepto', width: 32 },
      { key: 'fecha', label: 'Fecha', width: 14 },
      { key: 'subtotal', label: 'Subtotal', width: 16, format: 'money' },
      { key: 'iva', label: 'IVA', width: 14, format: 'money' },
      { key: 'total', label: 'Total', width: 16, format: 'money' },
      { key: 'porcentajeRentabilidad', label: '% Utilidad Bruta', width: 18, format: 'percent' },
      { key: 'porcentajeVentas', label: '% Ventas', width: 14, format: 'percent' },
    ]
  );
}

// Actualizar los conteos + gráficos de los reportes (live preview)
function updateReordenCounts() {
  const dias = Number(document.getElementById('dias-resurtido')?.value) || 45;
  const tieneInv = state.inventario.length > 0;
  const tieneVentasConCodigo = state.ventas.some(v => v.codigo);

  if (!tieneInv) return;

  const topVentas = topVentasConEstado(dias);
  const { sobrestock } = calcResurtido(dias);
  const sinVenta = getReferenciasSinVenta();
  const sinCosto = getProductosVendidosSinCosto();
  const rentabilidad = topRentabilidad();

  const setCount = (id, n, label) => {
    const el = document.getElementById(id);
    if (el) el.textContent = `${n.toLocaleString('es-CO')} ${label}`;
  };
  setCount('count-resurtido', topVentas.length, 'códigos vendidos · ordenado del más vendido al menos vendido');
  setCount('count-rentabilidad', rentabilidad.length, 'productos con utilidad · ordenado por utilidad $ descendente');
  setCount('count-sobrestock', sobrestock.length, 'productos con exceso');
  setCount('count-sin-venta', sinVenta.length, 'sin movimiento');
  setCount('count-sin-costo', sinCosto.length, 'sin match en inventario');

  renderTerminalResurtido(topVentas, dias);
  renderTerminalRentabilidad(rentabilidad);
  renderTerminalSobrestock(sobrestock, dias);
  renderTerminalSinVenta(sinVenta);
  renderTerminalSinCosto(sinCosto);

  document.getElementById('btn-resurtido').disabled = !tieneVentasConCodigo || topVentas.length === 0;
  const btnRent = document.getElementById('btn-rentabilidad');
  if (btnRent) btnRent.disabled = rentabilidad.length === 0;
  document.getElementById('btn-sobrestock').disabled = sobrestock.length === 0;
  document.getElementById('btn-sin-venta').disabled = sinVenta.length === 0;
  document.getElementById('btn-sin-costo').disabled = sinCosto.length === 0;
}

/* ============= TEMPLATES ============= */

function downloadTemplate(category) {
  const suffix = state.conIva ? '' : '-sin-iva';
  const templatesConIva = {
    ventas: {
      filename: `AIMMA-plantilla-ventas${suffix}.xlsx`,
      headers: ['Fecha', 'Factura', 'Cliente', 'Codigo', 'Producto', 'Cantidad', 'Precio Unitario', 'Subtotal', 'IVA', 'Total'],
      sample: [
        ['2026-05-01', 'F-001', 'Juan Perez', 'PROD-A', 'Camiseta azul talla M', 5, 60000, 300000, 57000, 357000],
        ['2026-05-01', 'F-001', 'Juan Perez', 'PROD-B', 'Jean negro talla 32', 3, 120000, 360000, 68400, 428400],
        ['2026-05-02', 'F-002', 'Maria Lopez', 'PROD-A', 'Camiseta azul talla M', 2, 60000, 120000, 22800, 142800]
      ]
    },
    inventario: {
      filename: `AIMMA-plantilla-inventario.xlsx`,
      headers: ['Codigo', 'Nombre', 'Costo Unitario', 'Stock Actual'],
      sample: [
        ['PROD-A', 'Camiseta azul talla M', 25000, 95],
        ['PROD-B', 'Jean negro talla 32', 50000, 12],
        ['PROD-C', 'Tenis blanco talla 40', 80000, 20]
      ]
    },
    gastos: {
      filename: `AIMMA-plantilla-gastos${suffix}.xlsx`,
      headers: ['Fecha', 'Factura', 'Proveedor', 'Concepto', 'Subtotal', 'IVA', 'Total'],
      sample: [
        ['2026-05-01', 'AR-001', 'Inmobiliaria XYZ', 'Arriendo local', 2000000, 380000, 2380000],
        ['2026-05-03', 'EN-555', 'Centrales Electricas', 'Energia mes Mayo', 350000, 66500, 416500],
        ['2026-05-05', 'IN-333', 'ETB', 'Internet fibra', 120000, 22800, 142800]
      ]
    }
  };
  const templatesSinIva = {
    ventas: {
      filename: `AIMMA-plantilla-ventas-sin-iva.xlsx`,
      headers: ['Fecha', 'Factura', 'Cliente', 'Codigo', 'Producto', 'Cantidad', 'Precio Unitario', 'Total'],
      sample: [
        ['2026-05-01', 'F-001', 'Juan Perez', 'PROD-A', 'Camiseta azul talla M', 5, 60000, 300000],
        ['2026-05-01', 'F-001', 'Juan Perez', 'PROD-B', 'Jean negro talla 32', 3, 120000, 360000],
        ['2026-05-02', 'F-002', 'Maria Lopez', 'PROD-A', 'Camiseta azul talla M', 2, 60000, 120000]
      ]
    },
    inventario: {
      filename: `AIMMA-plantilla-inventario.xlsx`,
      headers: ['Codigo', 'Nombre', 'Costo Unitario', 'Stock Actual'],
      sample: [
        ['PROD-A', 'Camiseta azul talla M', 25000, 95],
        ['PROD-B', 'Jean negro talla 32', 50000, 12],
        ['PROD-C', 'Tenis blanco talla 40', 80000, 20]
      ]
    },
    gastos: {
      filename: `AIMMA-plantilla-gastos-sin-iva.xlsx`,
      headers: ['Fecha', 'Factura', 'Proveedor', 'Concepto', 'Total'],
      sample: [
        ['2026-05-01', 'AR-001', 'Inmobiliaria XYZ', 'Arriendo local', 2000000],
        ['2026-05-03', 'EN-555', 'Centrales Electricas', 'Energia mes Mayo', 350000],
        ['2026-05-05', 'IN-333', 'ETB', 'Internet fibra', 120000]
      ]
    }
  };
  const templates = state.conIva ? templatesConIva : templatesSinIva;
  const t = templates[category];
  const ws = XLSX.utils.aoa_to_sheet([t.headers, ...t.sample]);
  ws['!cols'] = t.headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, category.toUpperCase());
  XLSX.writeFile(wb, t.filename);
  toast(`Plantilla de ${category} descargada`, 'success');
}

/* ============= PERIODO DE VENTAS (proyección a 30 días) ============= */

// Calcula dias entre desde y hasta (inclusive) y el factor de proyeccion (30/dias).
// Actualiza state, persiste, habilita/deshabilita el input file de ventas, muestra mensaje.
function updatePeriodoVentas() {
  const desdeEl = document.getElementById('ventas-fecha-desde');
  const hastaEl = document.getElementById('ventas-fecha-hasta');
  const resultadoEl = document.getElementById('ventas-periodo-resultado');
  const fileInput = document.querySelector('input[type="file"][data-category="ventas"]');
  if (!desdeEl || !hastaEl || !resultadoEl || !fileInput) return;

  // Placeholder propio: marca la casilla vacia con .pf-empty para que el CSS
  // muestre "dd/mm/aaaa". El placeholder nativo del input[type=date] no se
  // pinta de forma fiable en Chrome Android (casilla vacia totalmente blanca).
  [desdeEl, hastaEl].forEach(el => {
    const field = el.closest('.periodo-field');
    if (field) field.classList.toggle('pf-empty', !el.value);
  });

  const d1 = desdeEl.value;
  const d2 = hastaEl.value;

  if (!d1 || !d2) {
    fileInput.disabled = true;
    state.ventasFechaDesde = d1 || null;
    state.ventasFechaHasta = d2 || null;
    state.ventasPeriodoDias = null;
    state.ventasPeriodoFactor = null;
    resultadoEl.innerHTML = '<span class="periodo-empty">Selecciona ambas fechas para habilitar la carga del Excel.</span>';
    saveState();
    return;
  }

  const inicio = new Date(d1 + 'T00:00:00');
  const fin = new Date(d2 + 'T00:00:00');
  // dias inclusivo: del 1 al 30 = 30 dias
  const dias = Math.round((fin - inicio) / (1000 * 60 * 60 * 24)) + 1;

  if (dias <= 0) {
    fileInput.disabled = true;
    state.ventasPeriodoDias = null;
    state.ventasPeriodoFactor = null;
    resultadoEl.innerHTML = '<span class="periodo-warning">⚠ La fecha "Hasta" debe ser igual o posterior a "Desde".</span>';
    saveState();
    return;
  }

  const factor = 30 / dias;
  const factorPrevio = state.ventasPeriodoFactor;
  state.ventasFechaDesde = d1;
  state.ventasFechaHasta = d2;
  state.ventasPeriodoDias = dias;
  state.ventasPeriodoFactor = factor;
  fileInput.disabled = false;

  let msg = `<span class="periodo-ok">✓ Tu informe es de ${dias} día${dias === 1 ? '' : 's'} de venta.</span>`;
  if (dias !== 30) {
    const accion = dias < 30 ? 'proyectado al alza' : 'reducido proporcionalmente';
    msg += `<span class="periodo-info-projection">AIMMA proyectará los datos a 30 días (${accion} con factor ${factor.toFixed(3)}).</span>`;
  } else {
    msg += '<span class="periodo-info-projection">Periodo exacto de 30 días — no se aplica proyección.</span>';
  }
  resultadoEl.innerHTML = msg;
  saveState();

  // FIX auditoria: si ya hay ventas cargadas con factor anterior distinto, avisar al user
  // que los datos siguen escalados con el factor viejo hasta que vuelva a subir el archivo.
  if (state.ventas.length > 0 && factorPrevio !== null && Math.abs(factorPrevio - factor) > 0.001) {
    toast('Tus ventas cargadas siguen usando el periodo anterior. Vuelve a subir el archivo para aplicar la nueva proyección.', 'error');
  }
}

/* ============= EVENTS ============= */

function initEvents() {
  // File inputs
  document.querySelectorAll('input[type="file"][data-category]').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const cat = inp.dataset.category;
      handleFiles(Array.from(e.target.files), cat);
      e.target.value = '';
    });
  });

  // Drag & drop
  document.querySelectorAll('.upload-drop').forEach(drop => {
    drop.addEventListener('dragover', (e) => {
      e.preventDefault(); drop.classList.add('dragover');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
      const cat = drop.dataset.category;
      // Bloquear drag-drop de ventas si no hay periodo definido
      if (cat === 'ventas' && !state.ventasPeriodoFactor) {
        toast('Primero selecciona el periodo de tu informe de ventas (fechas desde y hasta).', 'error');
        return;
      }
      handleFiles(Array.from(e.dataTransfer.files), cat);
    });
  });

  // Periodo de ventas (fechas desde/hasta para proyeccion a 30 dias)
  const fechaDesde = document.getElementById('ventas-fecha-desde');
  const fechaHasta = document.getElementById('ventas-fecha-hasta');
  if (fechaDesde && fechaHasta) {
    // Restaurar valores guardados
    if (state.ventasFechaDesde) fechaDesde.value = state.ventasFechaDesde;
    if (state.ventasFechaHasta) fechaHasta.value = state.ventasFechaHasta;
    fechaDesde.addEventListener('change', updatePeriodoVentas);
    fechaHasta.addEventListener('change', updatePeriodoVentas);
    updatePeriodoVentas(); // primera ejecucion (puede habilitar o deshabilitar el input)
  }

  // Templates
  document.querySelectorAll('[data-template]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      downloadTemplate(btn.dataset.template);
    });
  });

  // Reset
  document.getElementById('reset-btn').addEventListener('click', resetAll);

  // Month filter
  // Month filter eliminado del UI — se mantiene el listener por compatibilidad si reaparece
  const monthFilter = document.getElementById('month-filter');
  if (monthFilter) {
    monthFilter.addEventListener('change', (e) => {
      state.filterMonth = e.target.value;
      saveState();
      render();
    });
  }

  // IVA toggle
  const ivaToggle = document.getElementById('iva-toggle-input');
  ivaToggle.checked = state.conIva;
  ivaToggle.addEventListener('change', (e) => {
    state.conIva = e.target.checked;
    saveState();
    render();
    toast(state.conIva
      ? 'Modo: Responsable de IVA (régimen común)'
      : 'Modo: No responsable de IVA (régimen simple)', 'info');
  });

  // Toggle "Manejo inventario" — empresas de servicios o dropshipping desactivan
  // esto y se oculta upload de inventario + KPIs/secciones que dependen de stock.
  const invToggle = document.getElementById('inv-toggle-input');
  if (invToggle) {
    invToggle.checked = state.manejaInventario;
    applyManejaInventario();
    invToggle.addEventListener('change', (e) => {
      state.manejaInventario = e.target.checked;
      saveState();
      applyManejaInventario();
      render();
      toast(state.manejaInventario
        ? 'Modo: Empresa con inventario (productos)'
        : 'Modo: Empresa sin inventario (servicios/dropshipping)', 'info');
    });
  }

  // Input de días deseados de inventario (actualiza conteos y gráficos en vivo)
  const diasInput = document.getElementById('dias-resurtido');
  if (diasInput) {
    const updateDias = () => {
      let v = parseInt(diasInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 365) v = 365;
      if (String(v) !== diasInput.value) diasInput.value = v;
      // Solo los presets de dias (con data-preset)
      document.querySelectorAll('.preset-btn[data-preset]').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.preset) === v);
      });
      updateReordenCounts();
    };
    diasInput.addEventListener('input', updateDias);
    diasInput.addEventListener('change', updateDias);

    // Tap en el wrap del input dias enfoca (utilísimo en móvil)
    const diasWrap = diasInput.closest('.reorden-input-wrap');
    diasWrap?.addEventListener('click', () => {
      diasInput.focus();
      diasInput.select();
    });

    // Presets rápidos de dias (data-preset)
    document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        diasInput.value = btn.dataset.preset;
        updateDias();
      });
    });

    updateDias();
  }

  // Input de % de marketing (analisis de marketing AIMMA)
  const mktInput = document.getElementById('pct-marketing');
  if (mktInput) {
    const updateMkt = () => {
      let v = parseInt(mktInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 50) v = 50;
      if (String(v) !== mktInput.value) mktInput.value = v;
      // Marcar preset activo
      document.querySelectorAll('.preset-btn[data-preset-mkt]').forEach(b => {
        b.classList.toggle('active', Number(b.dataset.presetMkt) === v);
      });
      renderTerminalMarketing();
    };
    mktInput.addEventListener('input', updateMkt);
    mktInput.addEventListener('change', updateMkt);

    // Tap en el wrap del input mkt enfoca
    const mktWrap = mktInput.closest('.reorden-input-wrap');
    mktWrap?.addEventListener('click', () => {
      mktInput.focus();
      mktInput.select();
    });

    // Presets rapidos de marketing (data-preset-mkt)
    document.querySelectorAll('.preset-btn[data-preset-mkt]').forEach(btn => {
      btn.addEventListener('click', () => {
        mktInput.value = btn.dataset.presetMkt;
        updateMkt();
      });
    });
  }

  // Botones de descarga de reportes
  document.getElementById('btn-resurtido')?.addEventListener('click', downloadResurtido);
  document.getElementById('btn-rentabilidad')?.addEventListener('click', downloadRentabilidad);
  document.getElementById('btn-sobrestock')?.addEventListener('click', downloadSobrestock);
  document.getElementById('btn-sin-venta')?.addEventListener('click', downloadSinVenta);
  document.getElementById('btn-sin-costo')?.addEventListener('click', downloadSinCosto);
  document.getElementById('btn-punto-equilibrio')?.addEventListener('click', downloadPuntoEquilibrio);
  document.getElementById('btn-participacion-gastos')?.addEventListener('click', downloadParticipacionGastos);
  document.getElementById('btn-marketing')?.addEventListener('click', downloadAnalisisMarketing);
  document.getElementById('btn-descarga-todo')?.addEventListener('click', downloadAllReports);
}

/* ============= AI AGENT — guia de voz con MP3 pregrabado (Isbelia / ElevenLabs)
   El audio assets/aimma-voz.mp3 se reproduce con <audio> + Web Audio API
   AnalyserNode para que las ondas reaccionen al volumen real del audio.
   El guion se mantiene aqui solo como referencia (no se usa runtime). */

const AI_AGENT_SCRIPT = [
  'Hola, soy Aimma IA. Quiero felicitarte.',
  'Ya tienes en tus manos un gerente financiero, un gerente comercial, un gerente de planeación de gastos y un analista tributario. Todo en segundos.',
  'Este panel Aimma te permitirá, las veinticuatro horas, tener la información que necesita tu empresa para que tomes las mejores decisiones.',
  'Te daré un recorrido del panel.',
  'En la parte superior encontrarás tres botones.',
  'El primer botón dice Nuevo Análisis. Úsalo cada vez que desees un nuevo informe.',
  'El segundo botón dice Manejo de Inventario. Si tu negocio maneja inventario, debes activarlo. Pero si no tienes inventario, por ejemplo un consultorio o un dropshipping, déjalo desactivado.',
  'El tercer botón dice Facturo con IVA. Enciéndelo si tu empresa es régimen común, para darte un análisis de tus gastos, compras y ventas con IVA de manera efectiva.',
  'Ahora vienen las tres casillas.',
  'La primera casilla es Ventas. Te permite subir tus ventas para analizarlas, en formato Excel o PDF. Puedes subir múltiples archivos: yo los reorganizaré para tu informe. Debe tener código, descripción, cantidad y valor, o las variables que desees. No importa si el Excel viene con celdas separadas o combinadas: puedo organizarlas en segundos.',
  'Importante: debes colocar las fechas de tu informe, y deben coincidir con las fechas de tus ventas, para que tu informe sea objetivo y cien por ciento confiable. Por ejemplo, si tu informe es del primero de abril al trece de abril, puedes subir trece Excel de ventas, uno por día, y en fecha colocar este rango. Con esto yo reorganizo y estructuro todo.',
  'La segunda casilla es Inventario. Sube tu Excel o PDF de inventario. Recuerda: el código debe coincidir con el de ventas, y debe tener código, descripción, cantidad y costo. Se permite un solo archivo.',
  'Por último, la casilla de Gastos, donde puedes subir múltiples facturas y archivos PDF. Recuerda: si quieres medir márgenes, no subas ventas de abril y gastos de otro mes; no sería lógico. Siempre dentro del mismo rango de fechas.',
  'Cuando los subas, desplázate hacia abajo y encontrarás los siguientes informes.',
  'Primero: Ranking de Ventas y Resurtido. Puedes modificarlo a siete días o treinta días, para darte un resurtido según tu venta para los días que requieras.',
  'Después: Ranking por Utilidad, donde verás el producto que más renta y el que menos.',
  'Luego: el informe de Sobrestock. Si pusiste treinta días de resurtido, este informe te dirá lo que tienes de más a treinta días de venta. Si colocas sesenta días, tomará cada artículo y te dirá qué tienes de más a sesenta días.',
  'Sigue: el informe Sin Ventas, con todo lo que no ha tenido rotación.',
  'Después encontrarás el análisis de Gastos por porcentaje según tu rentabilidad. Verifica en qué gastas más y en qué puedes mejorar.',
  'Por último, un informe de Pauta y Marketing. Puedes colocar cuánto porcentaje deseas invertir en pauta, y Aimma te dará una dispersión de tu gasto.',
  'Al final del panel podrás exportar un solo archivo consolidado.',
  'Recuerda: si no puedes cargar un archivo o tienes dificultades, nuestro Aimma IA por WhatsApp te atenderá las veinticuatro horas. Y si él no logra solucionarlo, nuestro jefe de servicio al cliente, en máximo cuarenta y ocho horas, se pondrá en contacto contigo.'
].join(' ');

// Timestamps exactos extraidos del alignment de ElevenLabs (with-timestamps API).
// Cada cue dispara un highlight amarillo sobre el elemento mencionado en la voz.
const AI_CUE_POINTS = [
  { time: 24.93, selector: '#reset-btn',                              label: 'Nuevo Análisis' },
  { time: 30.10, selector: '#inv-toggle-input',    closestTag: 'label', label: 'Manejo inventario' },
  { time: 42.34, selector: '#iva-toggle-input',    closestTag: 'label', label: 'Facturo con IVA' },
  { time: 53.06, selector: '.upload-box[data-category="ventas"]',    label: 'Ventas' },
  { time: 95.32, selector: '.upload-box[data-category="inventario"]',label: 'Inventario' },
  { time: 108.67, selector: '.upload-box[data-category="gastos"]',   label: 'Gastos' },
];

const aiAgent = {
  audio: null,           // <audio> element
  audioCtx: null,        // AudioContext
  analyser: null,        // AnalyserNode
  sourceNode: null,      // MediaElementAudioSourceNode
  rafId: null,           // requestAnimationFrame ID
  isPlaying: false,
  firedCues: new Set()   // indices de cues ya disparados en esta reproduccion
};

function aiSetSpeakingUI(speaking) {
  const avatar = document.querySelector('.ai-avatar');
  const waves = document.getElementById('ai-waves');
  const icon = document.getElementById('ai-play-icon');
  const text = document.getElementById('ai-play-text');
  const status = document.getElementById('ai-intro-status');
  if (avatar) avatar.classList.toggle('ai-speaking', speaking);
  if (waves) waves.classList.toggle('ai-active', speaking);
  if (icon) icon.textContent = speaking ? '■' : '▶';
  if (text) text.textContent = speaking ? 'DETENER REPRODUCCIÓN' : 'CÓMO FUNCIONA EL DASHBOARD IA · REPRODUCIR';
  if (status) status.textContent = speaking ? '> AIMMA hablando...' : '';
  aiAgent.isPlaying = speaking;
}

// Inicia loop de animacion: lee amplitud por banda del AnalyserNode y aplica
// scaleY a cada barra de .ai-waves. Si AnalyserNode no esta disponible,
// la animacion CSS pura sigue funcionando como fallback.
function aiStartWavesLoop() {
  if (!aiAgent.analyser) return;
  const bars = document.querySelectorAll('#ai-waves .ai-wave-bar');
  if (!bars.length) return;
  const bufferLength = aiAgent.analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);
  const step = Math.floor(bufferLength / bars.length);

  const tick = () => {
    if (!aiAgent.isPlaying) return;
    aiAgent.analyser.getByteFrequencyData(data);
    bars.forEach((bar, i) => {
      // tomar promedio de un slice de frecuencias por barra
      let sum = 0;
      for (let k = 0; k < step; k++) sum += data[i * step + k] || 0;
      const avg = sum / step;
      const scale = Math.max(0.18, avg / 180);
      bar.style.transform = `scaleY(${scale})`;
      bar.style.transformOrigin = 'center';
    });
    aiAgent.rafId = requestAnimationFrame(tick);
  };
  tick();
}

function aiHighlightElement(cue) {
  let el = document.querySelector(cue.selector);
  if (!el) return;
  if (cue.closestTag) el = el.closest(cue.closestTag);
  if (!el) return;
  el.classList.remove('ai-highlight');
  // Forzar reflow para reiniciar la animacion si ya estaba activa
  void el.offsetWidth;
  el.classList.add('ai-highlight');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => el.classList.remove('ai-highlight'), 3000);
}

function aiStopWavesLoop() {
  if (aiAgent.rafId) {
    cancelAnimationFrame(aiAgent.rafId);
    aiAgent.rafId = null;
  }
  // resetear barras a altura base
  document.querySelectorAll('#ai-waves .ai-wave-bar').forEach(bar => {
    bar.style.transform = '';
  });
}

function aiSetupAudioGraph() {
  if (aiAgent.audioCtx) return; // ya inicializado
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx || !aiAgent.audio) return;
    aiAgent.audioCtx = new AudioCtx();
    aiAgent.sourceNode = aiAgent.audioCtx.createMediaElementSource(aiAgent.audio);
    aiAgent.analyser = aiAgent.audioCtx.createAnalyser();
    aiAgent.analyser.fftSize = 64;  // 32 bins, suficiente para 9 barras
    aiAgent.sourceNode.connect(aiAgent.analyser);
    aiAgent.analyser.connect(aiAgent.audioCtx.destination);
  } catch (e) {
    console.warn('AudioContext no disponible, fallback a animacion CSS:', e);
  }
}

function aiPlayVoice() {
  const audio = aiAgent.audio;
  if (!audio) {
    toast('No se pudo cargar el audio.', 'warning');
    return;
  }
  // Si ya esta sonando: pausar
  if (aiAgent.isPlaying) {
    audio.pause();
    return;
  }
  aiSetupAudioGraph();
  // Reanudar contexto si esta suspendido (algunos navegadores empiezan suspended)
  if (aiAgent.audioCtx && aiAgent.audioCtx.state === 'suspended') {
    aiAgent.audioCtx.resume();
  }
  audio.play().catch(err => {
    console.warn('No se pudo reproducir audio:', err);
    toast('No se pudo iniciar la reproduccion del audio.', 'warning');
  });
}

function initAIAgent() {
  const playBtn = document.getElementById('ai-play-btn');
  const closeBtn = document.getElementById('ai-intro-close');
  const section = document.getElementById('ai-intro');
  const audio = document.getElementById('ai-audio');
  if (!playBtn || !section || !audio) return;

  aiAgent.audio = audio;

  // Si el usuario lo cerro antes, ocultar
  if (localStorage.getItem('aimma_ai_intro_dismissed') === '1') {
    section.classList.add('ai-intro-collapsed');
  }

  playBtn.addEventListener('click', aiPlayVoice);

  audio.addEventListener('play', () => {
    aiSetSpeakingUI(true);
    aiStartWavesLoop();
    // Reiniciar cues si el usuario volvio al principio (nuevo play desde 0)
    if (audio.currentTime < 1) aiAgent.firedCues.clear();
  });
  audio.addEventListener('pause', () => {
    aiSetSpeakingUI(false);
    aiStopWavesLoop();
  });
  audio.addEventListener('ended', () => {
    aiSetSpeakingUI(false);
    aiStopWavesLoop();
    aiAgent.firedCues.clear();
  });
  // Highlight sincronizado: dispara cuando currentTime cruza cada cue point
  audio.addEventListener('timeupdate', () => {
    if (!aiAgent.isPlaying) return;
    const t = audio.currentTime;
    AI_CUE_POINTS.forEach((cue, i) => {
      if (t >= cue.time && !aiAgent.firedCues.has(i)) {
        aiAgent.firedCues.add(i);
        aiHighlightElement(cue);
      }
    });
  });
  audio.addEventListener('error', (e) => {
    console.warn('Audio error:', e);
    toast('No se pudo cargar el audio de AIMMA.', 'warning');
    aiSetSpeakingUI(false);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (aiAgent.isPlaying) audio.pause();
      section.classList.add('ai-intro-collapsed');
      localStorage.setItem('aimma_ai_intro_dismissed', '1');
    });
  }

  window.addEventListener('beforeunload', () => {
    if (aiAgent.isPlaying && audio) audio.pause();
  });
}

/* ============= INIT ============= */

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initEvents();
  render();
  initAIAgent();
});
