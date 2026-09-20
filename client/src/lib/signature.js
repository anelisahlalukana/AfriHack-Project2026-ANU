// Cropping a drawn signature to just its ink. This replaces react-signature-canvas's own
// getTrimmedCanvas(), which throws "(0, import_build.default) is not a function" once bundled:
// it calls the trim-canvas package through an ESM default import, and trim-canvas is a
// CommonJS bundle whose function lives on `exports.default`.

// The smallest box around everything drawn, from RGBA pixel data ({ data, width, height }, as
// returned by getImageData). null when nothing has been drawn.
export function inkBounds({ data, width, height }) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

// A PNG data URL of the signature cropped to its ink. The pad's own canvas is left untouched, so
// the person can still see and edit what they drew if saving fails.
export function trimmedSignatureDataUrl(canvas, makeCanvas = () => document.createElement('canvas')) {
  const box = inkBounds(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height))
  if (!box) return canvas.toDataURL('image/png')

  const cropped = makeCanvas()
  cropped.width = box.width
  cropped.height = box.height
  cropped.getContext('2d').drawImage(canvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height)
  return cropped.toDataURL('image/png')
}
