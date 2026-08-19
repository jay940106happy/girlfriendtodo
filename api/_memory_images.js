import { sql } from './_db.js'

let thumbnailColumnReady = false

export async function ensureMemoryThumbnailColumn() {
  if (thumbnailColumnReady) return

  await sql`
    alter table memories
    add column if not exists thumbnail_urls text[] not null default '{}'::text[]
  `

  thumbnailColumnReady = true
}

export function normalizeThumbnailUrls(thumbnailUrls, imageUrls) {
  const source = Array.isArray(thumbnailUrls) ? thumbnailUrls : []

  return imageUrls.map((_, index) => {
    const value = source[index]
    return typeof value === 'string' ? value.trim() : ''
  })
}
