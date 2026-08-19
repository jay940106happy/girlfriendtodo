import { sql } from './_db.js'
import { ensureImageLocationsTable, normalizeCoordinate } from './_locations.js'
import { ensureMemoryThumbnailColumn } from './_memory_images.js'

export async function GET(request) {
  try {
    await Promise.all([ensureImageLocationsTable(), ensureMemoryThumbnailColumn()])
    const { searchParams } = new URL(request.url)
    const memoryId = searchParams.get('memory_id')

    if (memoryId) {
      const rows = await sql`
        select memory_id, image_url, latitude, longitude, location_name, source, created_at, updated_at
        from image_locations
        where memory_id = ${memoryId}
        order by created_at asc
      `
      return Response.json(rows)
    }

    const rows = await sql`
      select
        l.memory_id,
        l.image_url,
        coalesce(nullif(m.thumbnail_urls[array_position(m.image_urls, l.image_url)], ''), l.image_url) as thumbnail_url,
        l.latitude,
        l.longitude,
        l.location_name,
        l.source,
        l.created_at,
        l.updated_at,
        m.title,
        m.story,
        m.memory_date,
        m.image_url as memory_cover_url,
        m.image_urls,
        m.thumbnail_urls
      from image_locations l
      join memories m on m.id = l.memory_id
      order by coalesce(m.memory_date, m.created_at::date) desc, l.created_at asc
    `

    return Response.json(rows)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Location request failed.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await ensureImageLocationsTable()
    const body = await request.json()
    const memoryId = String(body.memory_id ?? '').trim()
    const imageUrl = String(body.image_url ?? '').trim()
    const latitude = normalizeCoordinate(body.latitude, -90, 90)
    const longitude = normalizeCoordinate(body.longitude, -180, 180)
    const locationName = body.location_name ? String(body.location_name).trim() : null
    const source = body.source ? String(body.source).trim() : 'manual'

    if (!memoryId || !imageUrl || latitude === null || longitude === null) {
      return Response.json({ error: 'memory_id, image_url, latitude and longitude are required.' }, { status: 400 })
    }

    const [row] = await sql`
      insert into image_locations (memory_id, image_url, latitude, longitude, location_name, source)
      values (${memoryId}, ${imageUrl}, ${latitude}, ${longitude}, ${locationName}, ${source})
      on conflict (memory_id, image_url)
      do update set latitude = excluded.latitude, longitude = excluded.longitude, location_name = excluded.location_name, source = excluded.source, updated_at = now()
      returning memory_id, image_url, latitude, longitude, location_name, source, created_at, updated_at
    `

    return Response.json(row)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Location request failed.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    await ensureImageLocationsTable()
    const body = await request.json()
    const memoryId = String(body.memory_id ?? '').trim()
    const imageUrl = String(body.image_url ?? '').trim()
    if (!memoryId || !imageUrl) return Response.json({ error: 'memory_id and image_url are required.' }, { status: 400 })
    await sql`delete from image_locations where memory_id = ${memoryId} and image_url = ${imageUrl}`
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Location request failed.' }, { status: 500 })
  }
}
