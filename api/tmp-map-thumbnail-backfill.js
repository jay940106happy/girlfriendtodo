import { list, put } from '@vercel/blob'
import sharp from 'sharp'
import { sql } from './_db.js'
import { ensureMemoryThumbnailColumn } from './_memory_images.js'

const THUMBNAIL_MAX_DIMENSION = 560
const THUMBNAIL_QUALITY = 72
const DEFAULT_BATCH = 5
const MAX_BATCH = 8

function validUrl(value) {
  return typeof value === 'string' && /^https?:\/\//.test(value.trim())
}

async function loadMapMemories() {
  await ensureMemoryThumbnailColumn()
  const rows = await sql`
    select m.id, m.image_urls, m.thumbnail_urls, array_agg(l.image_url) as located_image_urls
    from memories m
    join image_locations l on l.memory_id = m.id
    group by m.id, m.image_urls, m.thumbnail_urls
    order by m.created_at desc
  `
  return rows
}

function collectTasks(rows) {
  const tasks = []
  for (const row of rows) {
    const images = Array.isArray(row.image_urls) ? row.image_urls : []
    const thumbs = Array.isArray(row.thumbnail_urls) ? row.thumbnail_urls : []
    const located = new Set(Array.isArray(row.located_image_urls) ? row.located_image_urls : [])
    for (let index = 0; index < images.length; index += 1) {
      const imageUrl = images[index]
      if (!located.has(imageUrl)) continue
      if (validUrl(thumbs[index])) continue
      tasks.push({ memoryId: row.id, imageUrl, index })
    }
  }
  return tasks
}

async function listAllBlobs() {
  const blobs = []
  let cursor
  do {
    const page = await list({ cursor, limit: 1000 })
    blobs.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return blobs
}

async function getStatus() {
  const rows = await loadMapMemories()
  const tasks = collectTasks(rows)
  const blobs = await listAllBlobs()
  const sizeByUrl = new Map(blobs.map((blob) => [blob.url, Number(blob.size) || 0]))
  const resolvedUrls = []
  let locationImageCount = 0

  for (const row of rows) {
    const images = Array.isArray(row.image_urls) ? row.image_urls : []
    const thumbs = Array.isArray(row.thumbnail_urls) ? row.thumbnail_urls : []
    const located = new Set(Array.isArray(row.located_image_urls) ? row.located_image_urls : [])
    for (let index = 0; index < images.length; index += 1) {
      if (!located.has(images[index])) continue
      locationImageCount += 1
      resolvedUrls.push(validUrl(thumbs[index]) ? thumbs[index].trim() : images[index])
    }
  }

  const uniqueUrls = [...new Set(resolvedUrls)]
  const mapBytes = uniqueUrls.reduce((sum, url) => sum + (sizeByUrl.get(url) || 0), 0)
  return {
    locationImageCount,
    uniqueMapImages: uniqueUrls.length,
    missingThumbnails: tasks.length,
    mapBytes
  }
}

async function processBatch(limit) {
  const rows = await loadMapMemories()
  const tasks = collectTasks(rows).slice(0, limit)
  const stateByMemory = new Map()
  const results = []

  for (const task of tasks) {
    try {
      const response = await fetch(task.imageUrl)
      if (!response.ok) throw new Error(`source ${response.status}`)
      const inputBuffer = Buffer.from(await response.arrayBuffer())
      const thumbnailBuffer = await sharp(inputBuffer, { failOn: 'none' })
        .rotate()
        .resize({
          width: THUMBNAIL_MAX_DIMENSION,
          height: THUMBNAIL_MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: THUMBNAIL_QUALITY, effort: 4 })
        .toBuffer()

      const thumbnailBlob = await put(`thumbnails/map-${task.memoryId}-${task.index + 1}.webp`, thumbnailBuffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/webp'
      })

      let state = stateByMemory.get(String(task.memoryId))
      if (!state) {
        const current = rows.find((row) => String(row.id) === String(task.memoryId))
        const images = Array.isArray(current?.image_urls) ? current.image_urls : []
        const thumbs = Array.isArray(current?.thumbnail_urls) ? [...current.thumbnail_urls] : []
        while (thumbs.length < images.length) thumbs.push('')
        state = { memoryId: task.memoryId, thumbs }
        stateByMemory.set(String(task.memoryId), state)
      }
      state.thumbs[task.index] = thumbnailBlob.url
      results.push({ memoryId: task.memoryId, index: task.index, bytes: thumbnailBuffer.length })
    } catch (error) {
      console.error('Map thumbnail backfill failed:', task.imageUrl, error)
      results.push({ memoryId: task.memoryId, index: task.index, error: error?.message || 'failed' })
    }
  }

  for (const state of stateByMemory.values()) {
    await sql`
      update memories
      set thumbnail_urls = ${state.thumbs}
      where id = ${state.memoryId}
    `
  }

  const remainingRows = await loadMapMemories()
  const remaining = collectTasks(remainingRows).length
  return {
    processed: results.length,
    succeeded: results.filter((item) => !item.error).length,
    failed: results.filter((item) => item.error).length,
    thumbnailBytesCreated: results.reduce((sum, item) => sum + (item.bytes || 0), 0),
    remaining,
    results
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('run') === '1') {
      const requested = Number(searchParams.get('limit'))
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_BATCH, Math.floor(requested))) : DEFAULT_BATCH
      return Response.json(await processBatch(limit))
    }
    return Response.json(await getStatus())
  } catch (error) {
    console.error(error)
    return Response.json({ error: error?.message || 'map thumbnail task failed' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const requested = Number(body?.limit)
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_BATCH, Math.floor(requested))) : DEFAULT_BATCH
    return Response.json(await processBatch(limit))
  } catch (error) {
    console.error(error)
    return Response.json({ error: error?.message || 'backfill failed' }, { status: 500 })
  }
}
