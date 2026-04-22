import { sql } from './_db.js'

let todoSchemaEnsured = false

async function ensureTodoSchema() {
  if (todoSchemaEnsured) return
  await sql`alter table todo add column if not exists due_date date`
  await sql`
    create index if not exists idx_todo_completed_due_created
    on todo (completed, due_date, created_at desc)
  `
  todoSchemaEnsured = true
}

export async function GET() {
  try {
    await ensureTodoSchema()

    const rows = await sql`
      select id, todo, note, due_date, completed, created_at
      from todo
      where completed = false
      order by due_date asc nulls last, created_at desc
    `

    return Response.json(rows)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    await ensureTodoSchema()
    const { todo, note, due_date } = await request.json()

    if (!String(todo ?? '').trim()) {
      return Response.json({ error: 'Todo is required.' }, { status: 400 })
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

    return Response.json(row, { status: 201 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function PATCH(request) {
  try {
    await ensureTodoSchema()
    const { id, completed, todo, note, due_date } = await request.json()

    if (!id) {
      return Response.json({ error: 'Todo id is required.' }, { status: 400 })
    }

    const isCompleteUpdate = typeof completed === 'boolean' && todo === undefined
    let updatedTodo = null

    if (isCompleteUpdate) {
      ;[updatedTodo] = await sql`
        update todo
        set completed = ${Boolean(completed)}
        where id = ${id}
        returning id, todo, note, due_date, completed, created_at
      `
    } else {
      if (!String(todo ?? '').trim()) {
        return Response.json({ error: 'Todo is required.' }, { status: 400 })
      }

      ;[updatedTodo] = await sql`
        update todo
        set
          todo = ${String(todo).trim()},
          note = ${note ? String(note).trim() : null},
          due_date = ${due_date || null}
        where id = ${id}
        returning id, todo, note, due_date, completed, created_at
      `
    }

    if (!updatedTodo) {
      return Response.json({ error: 'Todo not found.' }, { status: 404 })
    }

    if (Boolean(completed)) {
      await sql`
        insert into memories (title, story, source_todo_id)
        values (${updatedTodo.todo}, ${updatedTodo.note ?? ''}, ${updatedTodo.id})
        on conflict (source_todo_id) do nothing
      `
    }

    return Response.json(updatedTodo)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    await ensureTodoSchema()
    const { id } = await request.json()

    if (!id) {
      return Response.json({ error: 'Todo id is required.' }, { status: 400 })
    }

    await sql`delete from todo where id = ${id}`
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Database request failed.' }, { status: 500 })
  }
}
