# Love Todo Memory

A romantic Vue 3 + Vite + Neon app for shared couple todos and memory journaling.

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill in your Neon `DATABASE_URL`
3. Add your `BLOB_READ_WRITE_TOKEN` for image uploads
4. Run the SQL in `neon/setup.sql`
5. Install dependencies with `npm install`
6. Start with `npm run dev`

## One-time Existing Image Compression

Use this when older uploaded images are too large for some phones to decode reliably.

1. Ensure `.env.local` has both `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`
2. Preview what will be processed:
   - `npm run compress:existing-images -- --dry-run`
3. Run the actual migration:
   - `npm run compress:existing-images`

What it does:

- Downloads each memory image URL from database
- Resizes to max 1920px (no upscale), converts to WebP
- Uploads new compressed files to Vercel Blob
- Updates `memories.image_urls` and `memories.image_url` to new URLs

## Deploy

Deploy to Vercel as a Vite project.

Environment variables:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
