import { sql } from './_db.js'

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const rows = await sql`
        select id, todo, note, due_date, completed, created_at
        from todo
        order by created_at desc
      `
      return response.status(200).json(rows)
    }

    if (request.method === 'POST') {
      const { todo, note, due_date } = request.body ?? {}

      if (!String(todo ?? '').trim()) {
        return response.status(400).json({ error: 'Todo is required.' })
      }

      const [row] = await sql`
        insert into todo (todo, note, due_date, completed)
        values (
          ${String(todo).trim()},
          ${note ? String(note).trim() : null},
          ${due_date || null},
          false
        )
        returning id, todo, note, due_date, completed, created_at
      `

      return response.status(201).json(row)
    }

    if (request.method === 'PATCH') {
      const { id, completed } = request.body ?? {}

      if (!id) {
        return response.status(400).json({ error: 'Todo id is required.' })
      }

      const [row] = await sql`
        update todo
        set completed = ${Boolean(completed)}
        where id = ${id}
        returning id, todo, note, due_date, completed, created_at
      `

      return response.status(200).json(row)
    }

    return response.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    console.error(error)
    return response.status(500).json({ error: 'Database request failed.' })
  }
}
