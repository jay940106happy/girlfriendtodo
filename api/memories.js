import { sql } from './_db.js'
import { claimPendingLocations, ensureImageLocationsTable } from './_locations.js'
import { ensureMemoryThumbnailColumn, normalizeThumbnailUrls } from './_memory_images.js'

export async function GET() {
  try {
    await ensureMemoryThumbnailColumn()
    const rows = await sql`
      select id, title, story, memory_date, image_url, image_urls, thumbnail_urls, created_at, source_todo_id
      from memories
      order by coalesce(memory_date, created_at::date) desc, created_at desc
    `

    return Response.json(rows)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await ensureMemoryThumbnailColumn()
    const { title, story, memory_date, image_url, image_urls, thumbnail_urls } = await request.json()

    if (!String(title ?? '').trim()) {
      return Response.json({ error: 'Title is required.' }, { status: 400 })
    }

    const normalizedImageUrls = Array.isArray(image_urls)
      ? image_urls.filter((value) => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
      : image_url
        ? [String(image_url).trim()]
        : []
    const normalizedThumbnailUrls = normalizeThumbnailUrls(thumbnail_urls, normalizedImageUrls)

    const [row] = await sql`
      insert into memories (title, story, memory_date, image_url, image_urls, thumbnail_urls)
      values (
        ${String(title).trim()},
        ${story ? String(story).trim() : ''},
        ${memory_date || null},
        ${normalizedImageUrls[0] ?? null},
        ${normalizedImageUrls},
        ${normalizedThumbnailUrls}
      )
      returning id, title, story, memory_date, image_url, image_urls, thumbnail_urls, created_at, source_todo_id
    `

    await claimPendingLocations(row.id, normalizedImageUrls)
    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    await ensureMemoryThumbnailColumn()
    const { id, title, story, memory_date, image_url, image_urls, thumbnail_urls } = await request.json()

    if (!id || !String(title ?? '').trim()) {
      return Response.json({ error: 'Memory id and title are required.' }, { status: 400 })
    }

    const normalizedImageUrls = Array.isArray(image_urls)
      ? image_urls.filter((value) => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
      : image_url
        ? [String(image_url).trim()]
        : []
    const normalizedThumbnailUrls = normalizeThumbnailUrls(thumbnail_urls, normalizedImageUrls)

    const [row] = await sql`
      update memories
      set
        title = ${String(title).trim()},
        story = ${story ? String(story).trim() : ''},
        memory_date = ${memory_date || null},
        image_url = ${normalizedImageUrls[0] ?? null},
        image_urls = ${normalizedImageUrls},
        thumbnail_urls = ${normalizedThumbnailUrls}
      where id = ${id}
      returning id, title, story, memory_date, image_url, image_urls, thumbnail_urls, created_at, source_todo_id
    `

    await claimPendingLocations(id, normalizedImageUrls)
    await ensureImageLocationsTable()
    if (normalizedImageUrls.length) {
      await sql`
        delete from image_locations
        where memory_id = ${id} and not (image_url = any(${normalizedImageUrls}))
      `
    } else {
      await sql`delete from image_locations where memory_id = ${id}`
    }

    return Response.json(row)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json()

    if (!id) {
      return Response.json({ error: 'Memory id is required.' }, { status: 400 })
    }

    await sql`delete from memories where id = ${id}`
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}
