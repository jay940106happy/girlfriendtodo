import { sql } from './_db.js'

export async function GET() {
  try {
    const rows = await sql`
      select id, title, story, memory_date, image_url, image_urls, created_at, source_todo_id
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
    const { title, story, memory_date, image_url, image_urls } = await request.json()

    if (!String(title ?? '').trim()) {
      return Response.json({ error: 'Title is required.' }, { status: 400 })
    }

    const normalizedImageUrls = Array.isArray(image_urls)
      ? image_urls.filter((value) => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
      : image_url
        ? [String(image_url).trim()]
        : []

    const [row] = await sql`
      insert into memories (title, story, memory_date, image_url, image_urls)
      values (
        ${String(title).trim()},
        ${story ? String(story).trim() : ''},
        ${memory_date || null},
        ${normalizedImageUrls[0] ?? null},
        ${normalizedImageUrls}
      )
      returning id, title, story, memory_date, image_url, image_urls, created_at, source_todo_id
    `

    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { id, title, story, memory_date, image_url, image_urls } = await request.json()

    if (!id || !String(title ?? '').trim()) {
      return Response.json({ error: 'Memory id and title are required.' }, { status: 400 })
    }

    const normalizedImageUrls = Array.isArray(image_urls)
      ? image_urls.filter((value) => typeof value === 'string' && value.trim() !== '').map((value) => value.trim())
      : image_url
        ? [String(image_url).trim()]
        : []

    const [row] = await sql`
      update memories
      set
        title = ${String(title).trim()},
        story = ${story ? String(story).trim() : ''},
        memory_date = ${memory_date || null},
        image_url = ${normalizedImageUrls[0] ?? null},
        image_urls = ${normalizedImageUrls}
      where id = ${id}
      returning id, title, story, memory_date, image_url, image_urls, created_at, source_todo_id
    `

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
