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

export async function ensurePendingImageLocationsTable() {
  await sql`
    create table if not exists pending_image_locations (
      image_url text primary key,
      latitude double precision not null,
      longitude double precision not null,
      created_at timestamptz not null default now()
    )
  `
}

export async function claimPendingLocations(memoryId, imageUrls = []) {
  await ensureImageLocationsTable()
  await ensurePendingImageLocationsTable()

  for (const imageUrl of imageUrls) {
    const [pending] = await sql`
      select latitude, longitude
      from pending_image_locations
      where image_url = ${imageUrl}
    `
    if (!pending) continue

    await sql`
      insert into image_locations (memory_id, image_url, latitude, longitude, source)
      values (${memoryId}, ${imageUrl}, ${pending.latitude}, ${pending.longitude}, 'upload_exif')
      on conflict (memory_id, image_url)
      do update set
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        source = excluded.source,
        updated_at = now()
    `

    await sql`delete from pending_image_locations where image_url = ${imageUrl}`
  }
}

export function normalizeCoordinate(value, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    return null
  }
  return number
}
