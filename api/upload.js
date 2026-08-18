import { put } from '@vercel/blob'
import { sql } from './_db.js'
import { ensurePendingImageLocationsTable, normalizeCoordinate } from './_locations.js'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return Response.json({ error: 'Image file is required.' }, { status: 400 })
    }

    const blob = await put(`memories/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true
    })

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
      pathname: blob.pathname,
      has_location: latitude !== null && longitude !== null
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Image upload failed.' }, { status: 500 })
  }
}
