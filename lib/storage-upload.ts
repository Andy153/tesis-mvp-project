export async function uploadDocumentToStorage(
  file: File,
  documentId: string,
): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('documentId', documentId)

    const res = await fetch('/api/documents/storage-upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[TRAZA] Storage upload error:', body)
      return null
    }

    const data = (await res.json()) as { path?: string }
    return data.path ?? null
  } catch (e) {
    console.error('[TRAZA] Storage upload unexpected error:', e)
    return null
  }
}
