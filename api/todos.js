import { sql } from './_db.js'

export async function GET() {
  try {
    const rows = await sql`
      select id, todo, note, completed, created_at
      from todo
      where completed = false
      order by created_at desc
    `

    return Response.json(rows)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const { todo, note } = await request.json()

    if (!String(todo ?? '').trim()) {
      return Response.json({ error: 'Todo is required.' }, { status: 400 })
    }

    const [row] = await sql`
      insert into todo (todo, note, completed)
      values (${String(todo).trim()}, ${note ? String(note).trim() : null}, false)
      returning id, todo, note, completed, created_at
    `

    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    const { id, completed } = await request.json()

    if (!id) {
      return Response.json({ error: 'Todo id is required.' }, { status: 400 })
    }

    const [todo] = await sql`
      update todo
      set completed = ${Boolean(completed)}
      where id = ${id}
      returning id, todo, note, completed, created_at
    `

    if (!todo) {
      return Response.json({ error: 'Todo not found.' }, { status: 404 })
    }

    if (Boolean(completed)) {
      await sql`
        insert into memories (title, story, source_todo_id)
        values (${todo.todo}, ${todo.note ?? ''}, ${todo.id})
        on conflict (source_todo_id) do nothing
      `
    }

    return Response.json(todo)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}
