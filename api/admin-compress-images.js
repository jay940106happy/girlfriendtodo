import { put } from '@vercel/blob'
import sharp from 'sharp'
import { sql } from './_db.js'

const MAX_DIMENSION = 1920
const WEBP_QUALITY = 80
const DEFAULT_LIMIT = 5

export async function POST(request) {
  const adminKey = request.headers.get('x-admin-key')
  const expectedKey = process.env.ADMIN_MAINTENANCE_KEY

  if (expectedKey && adminKey !== expectedKey) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const limit = clampLimit(body?.limit)

    const rows = await sql`
      select id, image_url, image_urls
      from memories
      order by id asc
    `

    const candidates = rows
      .map((row) => ({ id: row.id, urls: normalizeUrls(row.image_urls, row.image_url) }))
      .filter((row) => row.urls.some((url) => !isCompressedUrl(url)))
      .slice(0, limit)

    let processedMemories = 0
    let compressedImages = 0
    let failedImages = 0

    for (const memory of candidates) {
      const nextUrls = []
      let memoryTouched = false
      let memoryFailed = false

      for (let index = 0; index < memory.urls.length; index += 1) {
        const sourceUrl = memory.urls[index]

        if (isCompressedUrl(sourceUrl)) {
          nextUrls.push(sourceUrl)
          continue
        }

        try {
          const buffer = await downloadAndCompress(sourceUrl)
          const blob = await put(`compressed/memory-${memory.id}-${index + 1}.webp`, buffer, {
            access: 'public',
            addRandomSuffix: true,
            contentType: 'image/webp'
          })
          nextUrls.push(blob.url)
          compressedImages += 1
          memoryTouched = true
        } catch (error) {
          console.error(`[compress] memory=${memory.id} index=${index}`, error)
          nextUrls.push(sourceUrl)
          failedImages += 1
          memoryFailed = true
        }
      }

      if (memoryTouched && !memoryFailed) {
        await sql`
          update memories
          set image_url = ${nextUrls[0] ?? null},
              image_urls = ${nextUrls}
          where id = ${memory.id}
        `
      }

      processedMemories += 1
    }

    const hasMore = rows
      .map((row) => normalizeUrls(row.image_urls, row.image_url))
      .some((urls) => urls.some((url) => !isCompressedUrl(url)))

    return Response.json({
      processedMemories,
      compressedImages,
      failedImages,
      hasMore
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Compression job failed.' }, { status: 500 })
  }
}

function clampLimit(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(20, Math.floor(number)))
}

function normalizeUrls(imageUrls, imageUrl) {
  if (Array.isArray(imageUrls)) {
    return imageUrls
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => /^https?:\/\//.test(value))
  }

  if (typeof imageUrl === 'string') {
    const value = imageUrl.trim()
    if (/^https?:\/\//.test(value)) return [value]
  }

  return []
}

function isCompressedUrl(url) {
  return /\/compressed\//.test(url)
}

async function downloadAndCompress(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status}`)
  }

  const input = Buffer.from(await response.arrayBuffer())
  return sharp(input, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer()
}
