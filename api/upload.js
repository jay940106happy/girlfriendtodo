import { put } from '@vercel/blob'
import sharp from 'sharp'
import { sql } from './_db.js'
import { ensurePendingImageLocationsTable, normalizeCoordinate } from './_locations.js'

const THUMBNAIL_MAX_DIMENSION = 560
const THUMBNAIL_QUALITY = 72

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return Response.json({ error: 'Image file is required.' }, { status: 400 })
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer())
    const blob = await put(`memories/${file.name}`, inputBuffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || undefined
    })

    let thumbnailUrl = null
    if (String(file.type || '').startsWith('image/') && file.type !== 'image/gif') {
      try {
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

        const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '')
        const thumbnailBlob = await put(`thumbnails/${baseName}.webp`, thumbnailBuffer, {
          access: 'public',
          addRandomSuffix: true,
          contentType: 'image/webp'
        })
        thumbnailUrl = thumbnailBlob.url
      } catch (thumbnailError) {
        console.error('Thumbnail generation failed:', thumbnailError)
      }
    }

    const latitude = normalizeCoordinate(formData.get('latitude'), -90, 90)
    const longitude = normalizeCoordinate(formData.get('longitude'), -180, 180)

    if (latitude !== null && longitude !== null) {
      await ensurePendingImageLocationsTable()
      await sql`
        insert into pending_image_locations (image_url, latitude, longitude)
        values (${blob.url}, ${latitude}, ${longitude})
        on conflict (image_url)
        do update set latitude = excluded.latitude, longitude = excluded.longitude, created_at = now()
      `
    }

    return Response.json({
      url: blob.url,
      thumbnail_url: thumbnailUrl,
      pathname: blob.pathname,
      has_location: latitude !== null && longitude !== null
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Image upload failed.' }, { status: 500 })
  }
}
