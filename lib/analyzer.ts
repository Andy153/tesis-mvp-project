import type { Analysis, Finding, OcrPage, Span } from "./types"
import { NOMENCLADOR_FULL, PROC_KEYWORDS, PREPAGAS, SANATORIOS, REQUIRED_FIELDS } from "./nomenclador-data"

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function findSpans(needle: string, ocrPages: OcrPage[] | undefined): Span[] {
  if (!ocrPages || !needle) return []
  const needleTokens = stripAccents(needle.toLowerCase())
    .replace(/[^\w\s.\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (needleTokens.length === 0) return []

  const spans: Span[] = []
  for (const page of ocrPages) {
    const words = page.words || []
    for (let i = 0; i <= words.length - needleTokens.length; i++) {
      let matched = true
      for (let j = 0; j < needleTokens.length; j++) {
        const wordText = stripAccents((words[i + j].text || "").toLowerCase()).replace(/[^\w.\-]/g, "")
        const nt = needleTokens[j]
        if (wordText !== nt && !wordText.includes(nt) && !nt.includes(wordText)) {
          matched = false
          break
        }
      }
      if (matched) {
        const bboxes = []
        for (let j = 0; j < needleTokens.length; j++) bboxes.push(words[i + j].bbox)
        const x0 = Math.min(...bboxes.map((b) => b.x0))
        const y0 = Math.min(...bboxes.map((b) => b.y0))
        const x1 = Math.max(...bboxes.map((b) => b.x1))
        const y1 = Math.max(...bboxes.map((b) => b.y1))
        spans.push({
          page: page.page,
          bbox: { x0, y0, x1, y1 },
          canvasWidth: page.width,
          canvasHeight: page.height,
        })
        i += needleTokens.length - 1
      }
    }
  }
  return spans
}

function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    prepaga: "prepaga / obra social",
    fecha: "fecha",
    procedimiento: "procedimiento",
    codigo: "codigo de nomenclador",
    sanatorio: "sanatorio / institucion",
    anestesia: "tipo de anestesia",
    diagnostico: "diagnostico",
  }
  return labels[key] || key
}

export function analyzeDocument(text: string, fileName: string, ocrWords?: OcrPage[]): Analysis {
  const lower = stripAccents(text.toLowerCase())
  const findings: Finding[] = []

  // 1. CAMPOS PRESENTES
  const foundFields: Record<string, boolean> = {}
  for (const field of REQUIRED_FIELDS) {
    const hit = field.labels.find((l) => lower.includes(stripAccents(l.toLowerCase())))
    if (hit) foundFields[field.key] = true
  }

  // 2. DETECTAR PROCEDIMIENTO MENCIONADO
  let procedureGuess: { keyword: string; code: string; desc: string } | null = null
  for (const entry of PROC_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (lower.includes(stripAccents(kw.toLowerCase()))) {
        const nomencladorEntry = NOMENCLADOR_FULL[entry.code]
        procedureGuess = {
          keyword: kw,
          code: entry.code,
          desc: nomencladorEntry?.desc || "",
        }
        break
      }
    }
    if (procedureGuess) break
  }

  // 3. DETECTAR CODIGOS DE NOMENCLADOR EN TEXTO
  const codeRegex = /\b(\d{2}[.\-]\d{2}[.\-]\d{2}|\d{4,6})\b/g
  const rawCodes = [...new Set([...text.matchAll(codeRegex)].map((m) => m[1]))]
  const validCodes: string[] = []
  for (const raw of rawCodes) {
    const normalized = raw.replace(/-/g, ".")
    if (NOMENCLADOR_FULL[normalized]) validCodes.push(normalized)
    else if (NOMENCLADOR_FULL[raw]) validCodes.push(raw)
  }

  if (validCodes.length > 0) {
    for (const code of validCodes) {
      findings.push({
        severity: "ok",
        code: `CODE_OK_${code}`,
        title: `Codigo ${code} valido`,
        body: `${NOMENCLADOR_FULL[code].desc} - reconocido en el nomenclador de Swiss Medical.`,
        spans: findSpans(code, ocrWords),
      })
    }
  } else {
    if (procedureGuess) {
      findings.push({
        severity: "error",
        code: "NO_CODE_SUGGEST",
        title: "Falta el codigo de nomenclador",
        body: `El documento menciona "${procedureGuess.keyword}" pero no incluye el codigo correspondiente. Sin codigo la prepaga no puede procesar la liquidacion.`,
        action: `Agregar codigo ${procedureGuess.code} - ${procedureGuess.desc}.`,
        suggestion: { code: procedureGuess.code, desc: procedureGuess.desc },
        spans: findSpans(procedureGuess.keyword, ocrWords),
      })
    } else {
      findings.push({
        severity: "error",
        code: "NO_CODE",
        title: "Falta el codigo de nomenclador",
        body: `No se detecto un codigo de facturacion en el documento. Sin codigo la prepaga no puede procesar la liquidacion.`,
        action: "Agregar el codigo correspondiente del nomenclador de la prepaga.",
      })
    }
  }

  // 4. CAMPOS FALTANTES
  for (const field of REQUIRED_FIELDS) {
    if (field.key === "codigo") continue
    if (!foundFields[field.key]) {
      findings.push({
        severity: field.severity,
        code: `MISSING_${field.key.toUpperCase()}`,
        title: `Falta ${fieldLabel(field.key)}`,
        body: `No se detecta el campo "${field.labels[0]}" en el documento. Este campo es requerido por las prepagas para procesar la liquidacion.`,
        action: `Agregar ${fieldLabel(field.key)} al documento antes de presentar.`,
      })
    }
  }

  // 5. PREPAGAS / SANATORIOS DETECTADOS
  const prepagasDetectadas = PREPAGAS.filter((p) => lower.includes(stripAccents(p.toLowerCase())))
  const sanatoriosDetectados = SANATORIOS.filter((s) => lower.includes(stripAccents(s.toLowerCase())))

  // 6. FECHAS + PLAZO
  const fechaRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g
  const fechas = [...text.matchAll(fechaRegex)].map((m) => m[0])
  if (fechas.length > 0) {
    try {
      const fechaStr = fechas[0]
      const parts = fechaStr.split(/[\/\-]/).map(Number)
      let [d, m, y] = parts
      if (y < 100) y += 2000
      const fechaPractica = new Date(y, m - 1, d)
      const hoy = new Date()
      const diasDesde = Math.floor((hoy.getTime() - fechaPractica.getTime()) / 86400000)
      const plazoLimite = 60
      if (diasDesde > plazoLimite) {
        findings.push({
          severity: "error",
          code: "PLAZO_VENCIDO",
          title: "Plazo de presentacion posiblemente vencido",
          body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} dias. El plazo estandar de re-facturacion es de 60 dias.`,
          action: "Verificar con la prepaga si la presentacion es aun admisible.",
          spans: findSpans(fechaStr, ocrWords),
        })
      } else if (diasDesde > 30) {
        findings.push({
          severity: "warn",
          code: "PLAZO_CERCANO",
          title: "Plazo de presentacion proximo",
          body: `La fecha detectada (${fechaStr}) es de hace ${diasDesde} dias. Quedan ${plazoLimite - diasDesde} dias hasta el vencimiento.`,
          action: "Presentar la liquidacion en los proximos dias.",
          spans: findSpans(fechaStr, ocrWords),
        })
      } else {
        findings.push({
          severity: "ok",
          code: "PLAZO_OK",
          title: "Dentro del plazo de presentacion",
          body: `La fecha detectada (${fechaStr}) esta dentro del plazo normal de 60 dias.`,
        })
      }
    } catch {
      // ignore date parsing errors
    }
  }

  // 7. LEGIBILIDAD
  const wordCount = text.split(/\s+/).filter((w) => w.length > 2).length
  if (wordCount < 20) {
    findings.push({
      severity: "warn",
      code: "LOW_CONTENT",
      title: "Contenido escaso o ilegible",
      body: `Solo se pudieron reconocer ${wordCount} palabras. El documento puede estar mal escaneado o incompleto.`,
      action: "Re-escanear en mayor resolucion o solicitar copia legible.",
    })
  }

  const summary = {
    ok: findings.filter((f) => f.severity === "ok").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    error: findings.filter((f) => f.severity === "error").length,
  }
  const overall = summary.error > 0 ? "error" : summary.warn > 0 ? "warn" : "ok"

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
  }
}
