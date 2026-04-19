import { put } from '@vercel/blob'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return Response.json({ error: 'Image file is required.' }, { status: 400 })
    }

    const blob = await put(`memories/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true
    })

    return Response.json({
      url: blob.url,
      pathname: blob.pathname
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Image upload failed.' }, { status: 500 })
  }
}
