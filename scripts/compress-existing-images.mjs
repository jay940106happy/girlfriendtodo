import { existsSync, readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { put } from '@vercel/blob'
import sharp from 'sharp'

const MAX_DIMENSION = 1920
const WEBP_QUALITY = 80
const DRY_RUN = process.argv.includes('--dry-run')

loadEnvFromFile('.env.local')
loadEnvFromFile('.env')

const databaseUrl = process.env.DATABASE_URL
const blobToken = process.env.BLOB_READ_WRITE_TOKEN

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL. Please set it in env or .env.local.')
}

if (!blobToken) {
  throw new Error('Missing BLOB_READ_WRITE_TOKEN. Please set it in env or .env.local.')
}

const sql = neon(databaseUrl)

const memories = await sql`
  select id, title, image_url, image_urls
  from memories
  order by id asc
`

let scanned = 0
let updated = 0
let skipped = 0
let failed = 0

for (const memory of memories) {
  scanned += 1
  const urls = normalizeImageUrls(memory)

  if (!urls.length) {
    skipped += 1
    continue
  }

  const nextUrls = []
  let memoryFailed = false

  for (let index = 0; index < urls.length; index += 1) {
    const sourceUrl = urls[index]

    try {
      const compressed = await compressRemoteImage(sourceUrl)
      const pathname = `compressed/memory-${memory.id}-${index + 1}.webp`

      if (DRY_RUN) {
        nextUrls.push(sourceUrl)
      } else {
        const blob = await put(pathname, compressed, {
          access: 'public',
          addRandomSuffix: true,
          contentType: 'image/webp',
          token: blobToken
        })
        nextUrls.push(blob.url)
      }
    } catch (error) {
      memoryFailed = true
      failed += 1
      console.error(`[memory ${memory.id}] failed image ${index + 1}: ${sourceUrl}`)
      console.error(error)
      nextUrls.push(sourceUrl)
    }
  }

  if (memoryFailed || DRY_RUN) {
    skipped += 1
    continue
  }

  await sql`
    update memories
    set
      image_url = ${nextUrls[0] ?? null},
      image_urls = ${nextUrls}
    where id = ${memory.id}
  `
  updated += 1
}

console.log('--- Compress Existing Images Summary ---')
console.log(`Scanned memories: ${scanned}`)
console.log(`Updated memories: ${updated}`)
console.log(`Skipped memories: ${skipped}`)
console.log(`Failed images: ${failed}`)
console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)

function normalizeImageUrls(memory) {
  if (Array.isArray(memory.image_urls)) {
    return memory.image_urls
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.startsWith('http://') || value.startsWith('https://'))
  }

  if (typeof memory.image_url === 'string' && memory.image_url.trim()) {
    const value = memory.image_url.trim()
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return [value]
    }
  }

  return []
}

async function compressRemoteImage(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`)
  }

  const inputBuffer = Buffer.from(await response.arrayBuffer())
  const outputBuffer = await sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })
    .toBuffer()

  return outputBuffer
}

function loadEnvFromFile(filename) {
  if (!existsSync(filename)) return

  const content = readFileSync(filename, 'utf8')
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const index = trimmed.indexOf('=')
    if (index <= 0) continue

    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}
