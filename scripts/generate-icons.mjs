/**
 * Generiert die PWA-Icons als PNG-Dateien ohne externe Abhängigkeiten.
 * Nur einmal ausführen: node scripts/generate-icons.mjs
 *
 * Die Icons sind einfache farbige Quadrate – du kannst sie später
 * durch eigene Grafiken ersetzen.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

// Baut einen gültigen PNG-Buffer für ein einfarbiges Quadrat
function makePNG(size, r, g, b) {
  // Jede Zeile beginnt mit einem Filter-Byte (0 = kein Filter)
  const rowSize = 1 + size * 3
  const raw = Buffer.alloc(size * rowSize)

  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0  // filter: none
    for (let x = 0; x < size; x++) {
      const i = y * rowSize + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }

  const compressed = deflateSync(raw)

  // CRC32-Tabelle (wird für jeden PNG-Chunk benötigt)
  const crcTable = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[i] = c
  }

  function crc32(buf) {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii')
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(data.length, 0)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }

  // IHDR: Breite, Höhe, Bit-Tiefe, Farbtyp (2=RGB)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // 8 Bit pro Kanal
  ihdr[9] = 2  // RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),  // PNG-Signatur
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ])
}

// Orange (#f97316) auf dunklem Hintergrund – passend zum App-Design
const ORANGE = [249, 115, 22]

const icons = [
  { file: 'public/pwa-192x192.png',    size: 192 },
  { file: 'public/pwa-512x512.png',    size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
]

for (const { file, size } of icons) {
  writeFileSync(file, makePNG(size, ...ORANGE))
  console.log(`✓ ${file} (${size}×${size} px)`)
}

console.log('\nFertig! Die Icons liegen jetzt in public/')
