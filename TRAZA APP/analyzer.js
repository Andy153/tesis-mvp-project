// Trazá — Motor de análisis de documentos v2
// Valida partes quirúrgicos/documentos contra reglas de prepagas.
// Devuelve findings con severidad (error | warn | ok) y — cuando corresponde —
// "spans" con la ubicación del hallazgo en el texto para resaltar en el preview.

// Prepagas reconocidas
window.TRAZA_PREPAGAS = [
  'Swiss Medical', 'OSDE', 'Galeno', 'Medicus', 'Omint', 'Medifé',
  'Sancor Salud', 'Hospital Italiano', 'Hospital Británico', 'Prevención Salud'
];

// Sanatorios frecuentes
window.TRAZA_SANATORIOS = [
  'Otamendi', 'Mater Dei', 'Los Arcos', 'Suizo Argentino', 'Finochietto',
  'Clínica Santa Isabel', 'Instituto Argentino de Diagnóstico', 'Clínica Bazterrica'
];

// Campos verificables que todo parte quirúrgico debería tener.
// Sacamos los no-verificables (paciente, DNI, afiliado, cirujano, firma) porque
// el usuario pidió no mostrarlos como findings hasta resolver cómo encararlos.
window.TRAZA_REQUIRED_FIELDS = [
  { key: 'prepaga', labels: ['prepaga', 'obra social', 'convenio', 'financiador', 'cobertura'], severity: 'error' },
  { key: 'fecha', labels: ['fecha'], severity: 'error' },
  { key: 'procedimiento', labels: ['procedimiento', 'práctica', 'intervención', 'cirugía', 'operación'], severity: 'error' },
  { key: 'codigo', labels: ['código', 'codigo nomenclador', 'nomenclador', 'cod. nomenclador'], severity: 'error' },
  { key: 'sanatorio', labels: ['sanatorio', 'clínica', 'institución', 'centro asistencial'], severity: 'warn' },
  { key: 'anestesia', labels: ['anestesia', 'tipo de anestesia'], severity: 'warn' },
  { key: 'diagnostico', labels: ['diagnóstico', 'dx'], severity: 'error' },
];

// Mapa de procedimientos (keywords) → código sugerido
// Cargado desde nomenclador_data.js (generado automáticamente desde las 18 hojas oficiales Swiss).
// Si aún no se cargó, se usa un fallback vacío.
window.TRAZA_PROC_KEYWORDS = window.TRAZA_PROC_KEYWORDS || [];

// =============================================================
// EXTRACCIÓN DE TEXTO (PDF + OCR)
// =============================================================

window.extractText = async function(file, onProgress) {
  const type = file.type;
  if (type === 'application/pdf') return extractFromPdf(file, onProgress);
  if (type.startsWith('image/')) return extractFromImage(file, onProgress);
  throw new Error('Formato no soportado: ' + type);
};

async function extractFromPdf(file, onProgress) {
  onProgress?.({ progress: 0.1, message: 'Leyendo PDF...' });
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let allText = '';
  const thumbnails = [];
  let ocrWords = []; // SIEMPRE completamos bboxes por página (desde texto embebido o OCR)

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const SCALE = 1.8;
    const viewport = page.getViewport({ scale: SCALE });

    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(i => i.str).join(' ');
    allText += pageText + '\n';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    thumbnails.push({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });

    // Convertir items del texto embebido a "words" con bbox en coords del canvas
    if (pageText.trim().length > 20) {
      const pageWords = [];
      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;
        const tx = item.transform; // [a, b, c, d, e, f] en coords PDF
        // Aplicar viewport.transform para obtener coords del canvas
        const m = window.pdfjsLib.Util.transform(viewport.transform, tx);
        // m = [a, b, c, d, e, f]; en canvas: origen arriba-izquierda
        // Altura de la línea: magnitud de la columna Y del transform final
        const fontHeight = Math.hypot(m[2], m[3]);
        const widthPdf = item.width || (item.str.length * (Math.abs(tx[0]) || 12) * 0.5);
        const widthCanvas = widthPdf * SCALE;
        // En coords PDF el origen del texto es la baseline-izq; al transformar, m[4], m[5] es el origen en canvas
        const baseX = m[4];
        const baseY = m[5];
        // Bbox: desde baseline sube fontHeight
        const x0 = baseX;
        const y0 = baseY - fontHeight;
        const x1 = baseX + widthCanvas;
        const y1 = baseY;
        // Partir en palabras individuales
        const tokens = item.str.split(/\s+/).filter(t => t.length > 0);
        if (tokens.length === 0) continue;
        const totalChars = item.str.length || 1;
        let cursor = 0;
        for (const tok of tokens) {
          const wx0 = x0 + (cursor / totalChars) * widthCanvas;
          const wx1 = x0 + ((cursor + tok.length) / totalChars) * widthCanvas;
          pageWords.push({
            text: tok,
            bbox: { x0: wx0, y0, x1: wx1, y1 },
          });
          cursor += tok.length + 1;
        }
      }
      ocrWords.push({ page: p - 1, words: pageWords, width: canvas.width, height: canvas.height });
    }

    onProgress?.({ progress: 0.1 + 0.3 * (p / pdf.numPages), message: `Procesando página ${p}/${pdf.numPages}...` });
  }

  let method = 'pdf-text';
  if (allText.trim().length < 50) {
    method = 'ocr';
    allText = '';
    ocrWords = [];
    for (let i = 0; i < thumbnails.length; i++) {
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (p) => {
        onProgress?.({ progress: 0.4 + 0.55 * ((i + p) / thumbnails.length), message: `OCR página ${i+1}/${thumbnails.length}` });
      });
      allText += res.text + '\n';
      ocrWords.push({ page: i, words: res.words, width: thumbnails[i].width, height: thumbnails[i].height });
    }
  }

  onProgress?.({ progress: 1, message: 'Listo' });
  return { text: allText, thumbnails, method, ocrWords };
}

async function extractFromImage(file, onProgress) {
  onProgress?.({ progress: 0.1, message: 'Cargando imagen...' });
  const dataUrl = await fileToDataUrl(file);
  const dim = await imageDimensions(dataUrl);
  onProgress?.({ progress: 0.2, message: 'Aplicando OCR...' });
  const res = await ocrImageWithWords(dataUrl, (p) => {
    onProgress?.({ progress: 0.2 + 0.75 * p, message: 'Reconociendo texto...' });
  });
  onProgress?.({ progress: 1, message: 'Listo' });
  return {
    text: res.text,
    thumbnails: [{ dataUrl, width: dim.width, height: dim.height }],
    method: 'ocr',
    ocrWords: [{ page: 0, words: res.words, width: dim.width, height: dim.height }],
  };
}

function imageDimensions(dataUrl) {
  return new Promise(r => {
    const img = new Image();
    img.onload = () => r({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataUrl;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function ocrImageWithWords(dataUrl, onProg) {
  const Tesseract = window.Tesseract;
  const { data } = await Tesseract.recognize(dataUrl, 'spa', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProg) onProg(m.progress || 0);
    }
  });
  return {
    text: data.text,
    words: (data.words || []).map(w => ({
      text: w.text,
      bbox: w.bbox, // { x0, y0, x1, y1 }
      confidence: w.confidence,
    })),
  };
}

// =============================================================
// ANÁLISIS / VALIDACIÓN
// =============================================================

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Busca los bounding boxes en las palabras OCR/PDF que componen una frase
// Soporta needles multi-palabra: busca secuencias consecutivas de palabras
function findSpans(needle, ocrPages) {
  if (!ocrPages || !needle) return [];
  const needleTokens = stripAccents(needle.toLowerCase())
    .replace(/[^\w\s.\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
  if (needleTokens.length === 0) return [];

  const spans = [];
  for (const page of ocrPages) {
    const words = page.words || [];
    for (let i = 0; i <= words.length - needleTokens.length; i++) {
      let matched = true;
      for (let j = 0; j < needleTokens.length; j++) {
        const wordText = stripAccents((words[i + j].text || '').toLowerCase())
          .replace(/[^\w.\-]/g, '');
        const nt = needleTokens[j];
        // Match exacto, o la palabra contiene el token (p.ej. "cesárea," matchea "cesárea")
        if (wordText !== nt && !wordText.includes(nt) && !nt.includes(wordText)) {
          matched = false;
          break;
        }
      }
      if (matched) {
        // Unir bboxes de las palabras consecutivas en un único span
        const bboxes = [];
        for (let j = 0; j < needleTokens.length; j++) bboxes.push(words[i + j].bbox);
        const x0 = Math.min(...bboxes.map(b => b.x0));
        const y0 = Math.min(...bboxes.map(b => b.y0));
        const x1 = Math.max(...bboxes.map(b => b.x1));
        const y1 = Math.max(...bboxes.map(b => b.y1));
        spans.push({
          page: page.page,
          bbox: { x0, y0, x1, y1 },
          canvasWidth: page.width,
          canvasHeight: page.height,
        });
        i += needleTokens.length - 1; // saltar las palabras ya matcheadas
      }
    }
  }
  return spans;
}

window.analyzeDocument = function(text, fileName, ocrWords) {
  const lower = stripAccents(text.toLowerCase());
  const findings = [];

  // 1. CAMPOS PRESENTES
  const foundFields = {};
  for (const field of window.TRAZA_REQUIRED_FIELDS) {
    const hit = field.labels.find(l => lower.includes(stripAccents(l.toLowerCase())));
    if (hit) foundFields[field.key] = true;
  }

  // 2. DETECTAR PROCEDIMIENTO MENCIONADO (por keyword)
  let procedureGuess = null;
  for (const entry of window.TRAZA_PROC_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(stripAccents(kw.toLowerCase()))) {
        procedureGuess = { keyword: kw, code: entry.code, desc: window.TRAZA_NOMENCLADOR_FULL[entry.code]?.desc };
        break;
      }
    }
    if (procedureGuess) break;
  }

  // 3. DETECTAR CÓDIGOS DE NOMENCLADOR EN TEXTO
  // Matchea formatos: NNNNNN, NN.NN.NN, NN-NN-NN
  const codeRegex = /\b(\d{2}[.\-]\d{2}[.\-]\d{2}|\d{4,6})\b/g;
  const rawCodes = [...new Set([...text.matchAll(codeRegex)].map(m => m[1]))];
  const validCodes = [];
  for (const raw of rawCodes) {
    // Normalizar separadores a punto para buscar en el diccionario
    const normalized = raw.replace(/-/g, '.');
    if (window.TRAZA_NOMENCLADOR_FULL[normalized]) validCodes.push(normalized);
    else if (window.TRAZA_NOMENCLADOR_FULL[raw]) validCodes.push(raw);
  }

  // Si hay código válido → OK
  if (validCodes.length > 0) {
    for (const code of validCodes) {
      findings.push({
        severity: 'ok',
        code: `CODE_OK_${code}`,
        title: `Código ${code} válido`,
        body: `${window.TRAZA_NOMENCLADOR_FULL[code].desc} — reconocido en el nomenclador de Swiss Medical.`,
        spans: findSpans(code, ocrWords),
      });
    }
  } else {
    // No hay código → error con sugerencia inteligente si detectamos procedimiento
    if (procedureGuess) {
      findings.push({
        severity: 'error',
        code: 'NO_CODE_SUGGEST',
        title: 'Falta el código de nomenclador',
        body: `El documento menciona "${procedureGuess.keyword}" pero no incluye el código correspondiente. Sin código la prepaga no puede procesar la liquidación.`,
        action: `Agregar código ${procedureGuess.code} — ${procedureGuess.desc}.`,
        suggestion: { code: procedureGuess.code, desc: procedureGuess.desc },
        spans: findSpans(procedureGuess.keyword, ocrWords),
      });
    } else {
      findings.push({
        severity: 'error',
        code: 'NO_CODE',
        title: 'Falta el código de nomenclador',
        body: `No se detectó un código de facturación en el documento. Sin código la prepaga no puede procesar la liquidación.`,
        action: 'Agregar el código correspondiente del nomenclador de la prepaga.',
      });
    }
  }

  // 4. CAMPOS FALTANTES (verificables)
  for (const field of window.TRAZA_REQUIRED_FIELDS) {
    // El campo "codigo" ya se reportó arriba — skip
    if (field.key === 'codigo') continue;
    if (!foundFields[field.key]) {
      findings.push({
        severity: field.severity,
        code: `MISSING_${field.key.toUpperCase()}`,
        title: `Falta ${fieldLabel(field.key)}`,
        body: `No se detecta el campo "${field.labels[0]}" en el documento. Este campo es requerido por las prepagas para procesar la liquidación.`,
        action: `Agregar ${fieldLabel(field.key)} al documento antes de presentar.`,
      });
    }
  }

  // 5. PREPAGAS / SANATORIOS DETECTADOS
  const prepagasDetectadas = window.TRAZA_PREPAGAS.filter(p => lower.includes(stripAccents(p.toLowerCase())));
  const sanatoriosDetectados = window.TRAZA_SANATORIOS.filter(s => lower.includes(stripAccents(s.toLowerCase())));

  // 6. FECHAS + PLAZO
  const fechaRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
  const fechas = [...text.matchAll(fechaRegex)].map(m => m[0]);
  if (fechas.length > 0) {
    try {
      const fechaStr = fechas[0];
      const parts = fechaStr.split(/[\/\-]/).map(Number);
      let [d, m, y] = parts;
      if (y < 100) y += 2000;
      const fechaPractica = new Date(y, m - 1, d);
      const hoy = new Date();
      const diasDesde = Math.floor((hoy - fechaPractica) / 86400000);
      const plazoLimite = 60;
      if (diasDesde > plazoLimite) {
        findings.push({
          severity: 'error',
          code: 'PLAZO_VENCIDO',
          title: 'Plazo de presentación posiblemente vencido',
          body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} días. El plazo estándar de re-facturación es de 60 días.`,
          action: 'Verificar con la prepaga si la presentación es aún admisible.',
          spans: findSpans(fechaStr, ocrWords),
        });
      } else if (diasDesde > 30) {
        findings.push({
          severity: 'warn',
          code: 'PLAZO_CERCANO',
          title: 'Plazo de presentación próximo',
          body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} días. Quedan ${plazoLimite - diasDesde} días hasta el vencimiento.`,
          action: 'Presentar la liquidación en los próximos días.',
          spans: findSpans(fechaStr, ocrWords),
        });
      } else {
        findings.push({
          severity: 'ok',
          code: 'PLAZO_OK',
          title: 'Dentro del plazo de presentación',
          body: `La fecha detectada (${fechaStr}) está dentro del plazo normal de 60 días.`,
        });
      }
    } catch (e) {}
  }

  // 7. LEGIBILIDAD
  const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
  if (wordCount < 20) {
    findings.push({
      severity: 'warn',
      code: 'LOW_CONTENT',
      title: 'Contenido escaso o ilegible',
      body: `Solo se pudieron reconocer ${wordCount} palabras. El documento puede estar mal escaneado o incompleto.`,
      action: 'Re-escanear en mayor resolución o solicitar copia legible.',
    });
  }

  const summary = {
    ok: findings.filter(f => f.severity === 'ok').length,
    warn: findings.filter(f => f.severity === 'warn').length,
    error: findings.filter(f => f.severity === 'error').length,
  };
  const overall = summary.error > 0 ? 'error' : summary.warn > 0 ? 'warn' : 'ok';

  return {
    findings,
    summary,
    overall,
    detected: {
      codes: validCodes,
      prepagas: prepagasDetectadas,
      sanatorios: sanatoriosDetectados,
      fechas: fechas.slice(0, 3),
      procedureGuess,
    },
    fileName,
    analyzedAt: new Date().toISOString(),
  };
};

function fieldLabel(key) {
  return {
    prepaga: 'prepaga / obra social',
    fecha: 'fecha',
    procedimiento: 'procedimiento',
    codigo: 'código de nomenclador',
    sanatorio: 'sanatorio / institución',
    anestesia: 'tipo de anestesia',
    diagnostico: 'diagnóstico',
  }[key] || key;
}
