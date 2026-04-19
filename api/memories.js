import { sql } from './_db.js'

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const rows = await sql`
        select id, title, story, memory_date, image_url, created_at
        from memories
        order by memory_date desc, created_at desc
      `
      return response.status(200).json(rows)
    }

    if (request.method === 'POST') {
      const { title, story, memory_date, image_url } = request.body ?? {}

      if (!String(title ?? '').trim() || !String(story ?? '').trim()) {
        return response.status(400).json({ error: 'Title and story are required.' })
      }

      const [row] = await sql`
        insert into memories (title, story, memory_date, image_url)
        values (
          ${String(title).trim()},
          ${String(story).trim()},
          ${memory_date || null},
          ${image_url ? String(image_url).trim() : null}
        )
        returning id, title, story, memory_date, image_url, created_at
      `

      return response.status(201).json(row)
    }

    if (request.method === 'DELETE') {
      const { id } = request.body ?? {}

      if (!id) {
        return response.status(400).json({ error: 'Memory id is required.' })
      }

      await sql`delete from memories where id = ${id}`
      return response.status(204).end()
    }

    return response.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Database request failed.' })
  }
}
