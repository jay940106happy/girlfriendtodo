import { sql } from './_db.js'

export async function ensureImageLocationsTable() {
  await sql`
    create table if not exists image_locations (
      memory_id uuid not null references memories(id) on delete cascade,
      image_url text not null,
      latitude double precision not null,
      longitude double precision not null,
      location_name text,
      source text not null default 'manual',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (memory_id, image_url)
    )
  `

  await sql`
    create index if not exists idx_image_locations_memory_id
      on image_locations (memory_id)
  `

  await sql`
    create index if not exists idx_image_locations_coordinates
      on image_locations (latitude, longitude)
  `
}

export function normalizeCoordinate(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    return null
  }
  return number
}
