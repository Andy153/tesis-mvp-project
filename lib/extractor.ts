import type { Thumbnail, OcrPage, OcrWord } from "./types"
import * as pdfjs from "pdfjs-dist"
import Tesseract from "tesseract.js"

// Configure PDF.js worker
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`
}

interface ExtractionProgress {
  progress: number
  message: string
}

interface ExtractionResult {
  text: string
  thumbnails: Thumbnail[]
  method: "pdf-text" | "ocr"
  ocrWords: OcrPage[]
}

export async function extractText(
  file: File,
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractionResult> {
  const type = file.type
  if (type === "application/pdf") return extractFromPdf(file, onProgress)
  if (type.startsWith("image/")) return extractFromImage(file, onProgress)
  throw new Error("Formato no soportado: " + type)
}

async function extractFromPdf(
  file: File,
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractionResult> {
  onProgress?.({ progress: 0.1, message: "Leyendo PDF..." })
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let allText = ""
  const thumbnails: Thumbnail[] = []
  let ocrWords: OcrPage[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const SCALE = 1.8
    const viewport = page.getViewport({ scale: SCALE })

    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((i) => ("str" in i ? i.str : "")).join(" ")
    allText += pageText + "\n"

    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport }).promise
    }
    thumbnails.push({
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    })

    // Convert embedded text items to words with bboxes
    if (pageText.trim().length > 20) {
      const pageWords: OcrWord[] = []
      for (const item of textContent.items) {
        if (!("str" in item) || !item.str || !item.str.trim()) continue
        const tx = item.transform
        const m = pdfjs.Util.transform(viewport.transform, tx)
        const fontHeight = Math.hypot(m[2], m[3])
        const widthPdf = item.width || item.str.length * (Math.abs(tx[0]) || 12) * 0.5
        const widthCanvas = widthPdf * SCALE
        const baseX = m[4]
        const baseY = m[5]
        const x0 = baseX
        const y0 = baseY - fontHeight
        const x1 = baseX + widthCanvas
        const y1 = baseY

        const tokens = item.str.split(/\s+/).filter((t: string) => t.length > 0)
        if (tokens.length === 0) continue
        const totalChars = item.str.length || 1
        let cursor = 0
        for (const tok of tokens) {
          const wx0 = x0 + (cursor / totalChars) * widthCanvas
          const wx1 = x0 + ((cursor + tok.length) / totalChars) * widthCanvas
          pageWords.push({
            text: tok,
            bbox: { x0: wx0, y0, x1: wx1, y1 },
          })
          cursor += tok.length + 1
        }
      }
      ocrWords.push({ page: p - 1, words: pageWords, width: canvas.width, height: canvas.height })
    }

    onProgress?.({
      progress: 0.1 + 0.3 * (p / pdf.numPages),
      message: `Procesando pagina ${p}/${pdf.numPages}...`,
    })
  }

  let method: "pdf-text" | "ocr" = "pdf-text"
  if (allText.trim().length < 50) {
    method = "ocr"
    allText = ""
    ocrWords = []
    for (let i = 0; i < thumbnails.length; i++) {
      const res = await ocrImageWithWords(thumbnails[i].dataUrl, (p) => {
        onProgress?.({
          progress: 0.4 + 0.55 * ((i + p) / thumbnails.length),
          message: `OCR pagina ${i + 1}/${thumbnails.length}`,
        })
      })
      allText += res.text + "\n"
      ocrWords.push({
        page: i,
        words: res.words,
        width: thumbnails[i].width,
        height: thumbnails[i].height,
      })
    }
  }

  onProgress?.({ progress: 1, message: "Listo" })
  return { text: allText, thumbnails, method, ocrWords }
}

async function extractFromImage(
  file: File,
  onProgress?: (p: ExtractionProgress) => void
): Promise<ExtractionResult> {
  onProgress?.({ progress: 0.1, message: "Cargando imagen..." })
  const dataUrl = await fileToDataUrl(file)
  const dim = await imageDimensions(dataUrl)
  onProgress?.({ progress: 0.2, message: "Aplicando OCR..." })
  const res = await ocrImageWithWords(dataUrl, (p) => {
    onProgress?.({ progress: 0.2 + 0.75 * p, message: "Reconociendo texto..." })
  })
  onProgress?.({ progress: 1, message: "Listo" })
  return {
    text: res.text,
    thumbnails: [{ dataUrl, width: dim.width, height: dim.height }],
    method: "ocr",
    ocrWords: [{ page: 0, words: res.words, width: dim.width, height: dim.height }],
  }
}

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = dataUrl
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function ocrImageWithWords(
  dataUrl: string,
  onProg?: (p: number) => void
): Promise<{ text: string; words: OcrWord[] }> {
  const { data } = await Tesseract.recognize(dataUrl, "spa", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProg) onProg(m.progress || 0)
    },
  })
  return {
    text: data.text,
    words: (data.words || []).map((w) => ({
      text: w.text,
      bbox: w.bbox,
      confidence: w.confidence,
    })),
  }
}
