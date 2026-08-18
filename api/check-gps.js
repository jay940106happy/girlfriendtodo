import { sql } from './_db.js'

export const maxDuration = 60

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length))
}

function parseTiffGps(bytes, tiffStart) {
  try {
    if (tiffStart < 0 || tiffStart + 8 > bytes.length) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const byteOrder = ascii(bytes, tiffStart, 2)
    const little = byteOrder === 'II'
    if (!little && byteOrder !== 'MM') return null

    const u16 = (offset) => view.getUint16(offset, little)
    const u32 = (offset) => view.getUint32(offset, little)
    const tiffU16 = (rel) => u16(tiffStart + rel)
    const tiffU32 = (rel) => u32(tiffStart + rel)

    if (tiffU16(2) !== 42) return null
    const ifd0Rel = tiffU32(4)
    const ifd0 = tiffStart + ifd0Rel
    if (ifd0 + 2 > bytes.length) return null

    const count = u16(ifd0)
    let gpsIfdRel = null
    for (let i = 0; i < count; i += 1) {
      const entry = ifd0 + 2 + i * 12
      if (entry + 12 > bytes.length) break
      const tag = u16(entry)
      if (tag === 0x8825) {
        gpsIfdRel = u32(entry + 8)
        break
      }
    }
    if (gpsIfdRel == null) return null

    const gpsIfd = tiffStart + gpsIfdRel
    if (gpsIfd + 2 > bytes.length) return null
    const gpsCount = u16(gpsIfd)
    const tags = new Map()

    for (let i = 0; i < gpsCount; i += 1) {
      const entry = gpsIfd + 2 + i * 12
      if (entry + 12 > bytes.length) break
      const tag = u16(entry)
      const type = u16(entry + 2)
      const valueCount = u32(entry + 4)
      const valueField = entry + 8
      tags.set(tag, { type, valueCount, valueField, valueOffset: u32(valueField) })
    }

    const readAscii = (tagNo) => {
      const tag = tags.get(tagNo)
      if (!tag) return null
      const total = tag.valueCount
      const start = total <= 4 ? tag.valueField : tiffStart + tag.valueOffset
      if (start < 0 || start + total > bytes.length) return null
      return ascii(bytes, start, total).replace(/\0/g, '').trim()
    }

    const readRationals = (tagNo) => {
      const tag = tags.get(tagNo)
      if (!tag || tag.type !== 5) return null
      const start = tiffStart + tag.valueOffset
      const values = []
      for (let i = 0; i < tag.valueCount; i += 1) {
        const pos = start + i * 8
        if (pos + 8 > bytes.length) return null
        const numerator = u32(pos)
        const denominator = u32(pos + 4)
        values.push(denominator ? numerator / denominator : 0)
      }
      return values
    }

    const latRef = readAscii(1)
    const latDms = readRationals(2)
    const lonRef = readAscii(3)
    const lonDms = readRationals(4)
    if (!latRef || !lonRef || !latDms || !lonDms || latDms.length < 3 || lonDms.length < 3) return null

    const toDegrees = (dms, ref) => {
      let value = dms[0] + dms[1] / 60 + dms[2] / 3600
      if (ref === 'S' || ref === 'W') value *= -1
      return value
    }

    const latitude = toDegrees(latDms, latRef)
    const longitude = toDegrees(lonDms, lonRef)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null

    return { latitude, longitude }
  } catch {
    return null
  }
}

function parseGps(buffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 12) return null

  // JPEG APP1 / EXIF
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xff) {
        pos += 1
        continue
      }
      const marker = bytes[pos + 1]
      pos += 2
      if (marker === 0xd8 || marker === 0xd9) continue
      if (marker === 0xda) break
      if (pos + 2 > bytes.length) break
      const length = (bytes[pos] << 8) | bytes[pos + 1]
      if (length < 2 || pos + length > bytes.length) break
      const payload = pos + 2
      if (marker === 0xe1 && length >= 8 && ascii(bytes, payload, 6) === 'Exif\0\0') {
        const gps = parseTiffGps(bytes, payload + 6)
        if (gps) return gps
      }
      pos += length
    }
    return null
  }

  // WebP EXIF chunk, if metadata happened to be preserved.
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    let pos = 12
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    while (pos + 8 <= bytes.length) {
      const chunkId = ascii(bytes, pos, 4)
      const chunkSize = view.getUint32(pos + 4, true)
      const dataStart = pos + 8
      if (dataStart + chunkSize > bytes.length) break
      if (chunkId === 'EXIF') {
        const hasExifHeader = chunkSize >= 6 && ascii(bytes, dataStart, 6) === 'Exif\0\0'
        const gps = parseTiffGps(bytes, dataStart + (hasExifHeader ? 6 : 0))
        if (gps) return gps
      }
      pos = dataStart + chunkSize + (chunkSize % 2)
    }
  }

  return null
}

async function inspectImage(item) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(item.url, { signal: controller.signal })
    if (!response.ok) {
      return { ...item, status: 'fetch_error', http_status: response.status }
    }
    const buffer = await response.arrayBuffer()
    const gps = parseGps(buffer)
    return {
      ...item,
      status: gps ? 'gps' : 'no_gps',
      bytes: buffer.byteLength,
      ...(gps ?? {})
    }
  } catch (error) {
    return { ...item, status: 'fetch_error', error: error?.name || String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const offset = Math.max(0, Number(searchParams.get('offset') || 0) || 0)
    const limit = Math.min(40, Math.max(1, Number(searchParams.get('limit') || 20) || 20))

    const rows = await sql`
      select id, title, memory_date, image_url, image_urls
      from memories
      order by coalesce(memory_date, created_at::date) desc, created_at desc
    `

    const images = []
    for (const row of rows) {
      const urls = Array.isArray(row.image_urls) && row.image_urls.length
        ? row.image_urls
        : row.image_url
          ? [row.image_url]
          : []
      urls.forEach((url, index) => {
        if (typeof url === 'string' && url) {
          images.push({
            memory_id: row.id,
            title: row.title,
            memory_date: row.memory_date,
            image_index: index,
            url
          })
        }
      })
    }

    const batch = images.slice(offset, offset + limit)
    const results = []
    const concurrency = 5
    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency)
      results.push(...await Promise.all(chunk.map(inspectImage)))
    }

    const counts = results.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1
      return acc
    }, {})

    return Response.json({
      read_only: true,
      total_images: images.length,
      offset,
      limit,
      returned: results.length,
      next_offset: offset + results.length < images.length ? offset + results.length : null,
      counts,
      results
    }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'GPS audit failed.', detail: String(error) }, { status: 500 })
  }
}
