import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inkBounds, trimmedSignatureDataUrl } from '../src/lib/signature.js'

// RGBA pixel data like getImageData returns, with opaque ink at the given [x, y] points.
const pixels = (width, height, ink = []) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of ink) data[(y * width + x) * 4 + 3] = 255
  return { data, width, height }
}

test('the ink box hugs everything that was drawn', () => {
  assert.deepEqual(inkBounds(pixels(8, 6, [[2, 1], [5, 3], [3, 2]])), { x: 2, y: 1, width: 4, height: 3 })
})

test('one pixel of ink is a 1 x 1 box', () => {
  assert.deepEqual(inkBounds(pixels(8, 6, [[4, 4]])), { x: 4, y: 4, width: 1, height: 1 })
})

test('ink in opposite corners spans the whole canvas', () => {
  assert.deepEqual(inkBounds(pixels(8, 6, [[0, 0], [7, 5]])), { x: 0, y: 0, width: 8, height: 6 })
})

test('an empty canvas has no ink box', () => {
  assert.equal(inkBounds(pixels(8, 6)), null)
})

test('transparent pixels do not count as ink, whatever their colour', () => {
  const { data, width, height } = pixels(4, 4, [[1, 1]])
  data[(3 * width + 3) * 4] = 255 // a red pixel with alpha 0
  assert.deepEqual(inkBounds({ data, width, height }), { x: 1, y: 1, width: 1, height: 1 })
})

// A stand-in for a canvas: the pixels it holds, and a record of what was drawn onto it.
function fakeCanvas(width, height, ink) {
  const drawn = []
  const canvas = {
    width, height, drawn,
    getContext: () => ({ getImageData: () => pixels(width, height, ink), drawImage: (...args) => drawn.push(args) }),
    // Read the size when asked, not when the fake was made: cropping resizes the canvas.
    toDataURL: type => `${canvas.width}x${canvas.height}:${type}`,
  }
  return canvas
}

test('the signature is cropped onto a new canvas and the pad canvas is left alone', () => {
  const pad = fakeCanvas(8, 6, [[2, 1], [5, 3]])
  const cropped = fakeCanvas(0, 0, [])
  const url = trimmedSignatureDataUrl(pad, () => cropped)

  assert.equal(url, '4x3:image/png')
  assert.deepEqual([cropped.width, cropped.height], [4, 3])
  assert.deepEqual(cropped.drawn, [[pad, 2, 1, 4, 3, 0, 0, 4, 3]])
  assert.deepEqual([pad.width, pad.height], [8, 6])
  assert.deepEqual(pad.drawn, [])
})

test('a canvas with nothing drawn on it is returned as it is', () => {
  const pad = fakeCanvas(8, 6, [])
  const url = trimmedSignatureDataUrl(pad, () => { throw new Error('should not crop') })
  assert.equal(url, '8x6:image/png')
})
