import { list } from '@vercel/blob'
import { sql } from './_db.js'

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : []
}

function normalizedThumbs(memory) {
  const images = normalizeArray(memory.image_urls)
  const thumbs = Array.isArray(memory.thumbnail_urls) ? memory.thumbnail_urls : []
  return images.map((url, index) => {
    const thumb = typeof thumbs[index] === 'string' ? thumbs[index].trim() : ''
    return /^https?:\/\//.test(thumb) ? thumb : url
  })
}

function dateKey(value) {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const text = String(value)
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
}

function taipeiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = (type) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function shiftDate(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function byteSum(urls, sizeByUrl) {
  return [...new Set(urls)].reduce((sum, url) => sum + (sizeByUrl.get(url) || 0), 0)
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

export async function GET() {
  try {
    const [memories, locations, blobs, todos] = await Promise.all([
      sql`select id, title, memory_date, image_urls, thumbnail_urls, created_at from memories order by coalesce(memory_date, created_at::date) desc, created_at desc`,
      sql`select memory_id, image_url from image_locations`,
      listAllBlobs(),
      sql`select id, todo, note, due_date, completed, created_at from todo where completed = false order by due_date asc nulls last, created_at desc`
    ])

    const sizeByUrl = new Map(blobs.map((blob) => [blob.url, Number(blob.size) || 0]))
    const today = taipeiToday()
    const thirtyDaysAgo = shiftDate(today, -30)

    const homeMemories = memories.filter((memory) => dateKey(memory.memory_date) === thirtyDaysAgo)
    const homeUrls = homeMemories.map((memory) => normalizedThumbs(memory)[0]).filter(Boolean)

    const first20 = memories.slice(0, 20)
    const first20PreviewUrls = first20.flatMap((memory) => normalizedThumbs(memory).slice(0, 4))
    const first1PreviewUrls = first20.slice(0, 1).flatMap((memory) => normalizedThumbs(memory).slice(0, 4))
    const first2PreviewUrls = first20.slice(0, 2).flatMap((memory) => normalizedThumbs(memory).slice(0, 4))
    const first3PreviewUrls = first20.slice(0, 3).flatMap((memory) => normalizedThumbs(memory).slice(0, 4))

    const memoryById = new Map(memories.map((memory) => [String(memory.id), memory]))
    const mapMarkerUrls = locations.map((location) => {
      const memory = memoryById.get(String(location.memory_id))
      const images = normalizeArray(memory?.image_urls)
      const thumbs = normalizedThumbs(memory || {})
      const index = images.indexOf(String(location.image_url))
      return index >= 0 ? (thumbs[index] || location.image_url) : location.image_url
    }).filter(Boolean)

    const todayMemories = memories.filter((memory) => dateKey(memory.memory_date) === today)
    const calendarTodayUrls = todayMemories.flatMap((memory) => normalizedThumbs(memory).slice(0, 6))

    const memoriesJsonBytes = Buffer.byteLength(JSON.stringify(memories))
    const todosJsonBytes = Buffer.byteLength(JSON.stringify(todos))

    return Response.json({
      today,
      thirtyDaysAgo,
      blobStore: {
        blobCount: blobs.length,
        totalBytes: blobs.reduce((sum, blob) => sum + (Number(blob.size) || 0), 0)
      },
      apiPayloadUncompressedBytes: {
        memories: memoriesJsonBytes,
        todos: todosJsonBytes
      },
      pages: {
        home: { imageCount: new Set(homeUrls).size, blobBytes: byteSum(homeUrls, sizeByUrl) },
        todos: { imageCount: 0, blobBytes: 0 },
        memoriesFirstCard: { imageCount: new Set(first1PreviewUrls).size, blobBytes: byteSum(first1PreviewUrls, sizeByUrl) },
        memoriesFirst2Cards: { imageCount: new Set(first2PreviewUrls).size, blobBytes: byteSum(first2PreviewUrls, sizeByUrl) },
        memoriesFirst3Cards: { imageCount: new Set(first3PreviewUrls).size, blobBytes: byteSum(first3PreviewUrls, sizeByUrl) },
        memoriesFirst20FullyViewed: { imageCount: new Set(first20PreviewUrls).size, blobBytes: byteSum(first20PreviewUrls, sizeByUrl) },
        calendarToday: { imageCount: new Set(calendarTodayUrls).size, blobBytes: byteSum(calendarTodayUrls, sizeByUrl) },
        mapMarkers: { locationRows: locations.length, imageCount: new Set(mapMarkerUrls).size, blobBytes: byteSum(mapMarkerUrls, sizeByUrl) }
      }
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: error?.message || 'audit failed' }, { status: 500 })
  }
}
