export async function uploadDocumentToStorage(
  file: File,
  documentId: string,
  operationDate?: Date | string | null,
): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('documentId', documentId)

    // Si tenemos la fecha de la operación, la pasamos como ISO string.
    // El endpoint la parsea y la usa para armar el path YYYY-MM.
    if (operationDate) {
      const dateStr =
        operationDate instanceof Date
          ? operationDate.toISOString()
          : String(operationDate)
      formData.append('operationDate', dateStr)
    }

    const res = await fetch('/api/documents/storage-upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[TRAZA] Storage upload error:', body)
      return null
    }

    const data = (await res.json()) as { path?: string; folder?: string }
    if (data.folder) {
      console.log(`[TRAZA] Storage upload folder: ${data.folder}`)
    }
    return data.path ?? null
  } catch (e) {
    console.error('[TRAZA] Storage upload unexpected error:', e)
    return null
  }
}
