// Turn uploads into PNG blobs sized for the board (and for sending to the AI later).
const MAX_W = 1600

const canvasPng = (canvas) => new Promise(res => canvas.toBlob(b => res(b), 'image/png'))

export const toDataURL = blob => new Promise(res => {
  const r = new FileReader()
  r.onload = () => res(r.result)
  r.readAsDataURL(blob)
})

export async function imageToPng(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, MAX_W / bmp.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return { blob: await canvasPng(canvas), w: canvas.width, h: canvas.height }
}

// pdf.js is big, so it only loads when someone actually picks a PDF.
export async function pdfToPngs(file, maxPages = 20) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const out = []
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const page = await pdf.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: MAX_W / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    out.push({ blob: await canvasPng(canvas), w: canvas.width, h: canvas.height })
  }
  return { pages: out, total: pdf.numPages }
}
