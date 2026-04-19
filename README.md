# Love Todo Memory

A romantic Vue 3 + Vite + Neon app for shared couple todos and memory journaling.

## Setup

1. Copy `.env.example` to `.env.local`
2. Fill in your Neon `DATABASE_URL`
3. Add your `BLOB_READ_WRITE_TOKEN` for image uploads
4. Run the SQL in `neon/setup.sql`
5. Install dependencies with `npm install`
6. Start with `npm run dev`

## Deploy

Deploy to Vercel as a Vite project.

Environment variables:

- `DATABASE_URL`
- `BLOB_READ_WRITE_TOKEN`
