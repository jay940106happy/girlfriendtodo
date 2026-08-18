import { sql } from './_db.js'
import { ensureImageLocationsTable } from './_locations.js'

const recovered = [
  { memory_id: '00a9d3d8-20a5-423c-ad36-890dd75ae9e9', blob_name: 'IMG_6544-w2afumVR119xFJbWFHhvbjCEH68OyM.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: '0d475001-859f-4b1b-8723-5e145168e4a1', blob_name: 'IMG_7823-MAJBZ1KctKfa6wvovEDXzcFUWReCcU.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: '11713c22-b2a4-43ec-bcf9-073f15de058a', blob_name: 'IMG_6284-8VfZfUvj0lgnPB6Ic3ybabWFmo4dSc.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: '11713c22-b2a4-43ec-bcf9-073f15de058a', blob_name: 'IMG_1217-MAiZzybEtwr5RQE73akFvmknEzbelc.jpg', latitude: 25.10226666666667, longitude: 121.5491416666667 },
  { memory_id: '1781830e-e533-4224-8947-a7540427df67', blob_name: 'IMG_1259-BZWWgaSigror0zehF7BHY7Pq9i17KE.jpg', latitude: 25.17599444444445, longitude: 121.426375 },
  { memory_id: '1d9599f5-5c51-4d1b-b59b-82985f845b39', blob_name: 'IMG_6626-bys7Q4Yln7BQHVDtDf4hPAoI0hdwc0.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: '20807cfb-196b-4a35-a427-f9f762bbd2be', blob_name: 'IMG_5980-aFhiC4tcq4VikUoIbPsyBonpQNFVCC.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: '21a02429-3893-4b2d-a3b7-f0e279079a7a', blob_name: 'IMG_9188-qzx22poyVXy5VUgjfwq8SRAG3VAlGh.jpg', latitude: 25.03418055555556, longitude: 121.55445 },
  { memory_id: '2548c2ca-0406-4ee7-a20f-186865b467e7', blob_name: 'IMG_7853-7pfO7INNR80tUfxF4O8Xb3kBBCFY5m.jpg', latitude: 25.03418055555556, longitude: 121.55445 },
  { memory_id: '2b776252-f54c-48a1-af2c-10378b79141f', blob_name: 'IMG_1074-wLqkP98GocF2KaMhguExDuB9LbCXn7.jpg', latitude: 25.03961111111111, longitude: 121.4607861111111 },
  { memory_id: '2b776252-f54c-48a1-af2c-10378b79141f', blob_name: 'IMG_5911-RkH9CTEheCBjF4wnykAE4x2ZwLPdXj.jpg', latitude: 25.05827222222222, longitude: 121.4328305555556 },
  { memory_id: '2b776252-f54c-48a1-af2c-10378b79141f', blob_name: 'IMG_1069-MDptnvnBUvI4x5w5oquWMqGchZoCsF.jpg', latitude: 25.05004444444445, longitude: 121.4598305555556 },
  { memory_id: '2bf14b4c-5a9d-4fa1-a8ab-001c8c4d7d18', blob_name: 'IMG_1196-SdX8DEPD7VhHy9rXjxNqzjhGVfNVsC.jpg', latitude: 25.11847222222222, longitude: 121.5186611111111 },
  { memory_id: '2e3aabc9-ea47-4167-9829-217e8e2cf079', blob_name: 'IMG_6431-gYrkeFhXOntKRlXPJzEJLew2mvAn3a.jpg', latitude: 25.14344166666667, longitude: 121.5289694444444 },
  { memory_id: '2e3aabc9-ea47-4167-9829-217e8e2cf079', blob_name: 'IMG_6432-F5l7v2P93W65x5uL0bOi5ULKs7fmLa.jpg', latitude: 25.14344166666667, longitude: 121.5289694444444 },
  { memory_id: '4402bf35-29ae-4eb3-8314-7feb5d05248e', blob_name: 'IMG_9630-MIJV401wQOBjT9Fggvh0HbVPvVrOAB.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: '490c69e7-0752-4fc1-a05f-a8b79bddb988', blob_name: 'IMG_6461-obOhq3g3jCYSo9ErWtpMxlm8KxRxzv.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: '490c69e7-0752-4fc1-a05f-a8b79bddb988', blob_name: 'IMG_6469-9AbgrjtdiEoIiWsbXD3PD9TWw1tIE5.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: '65b00158-1cdd-4e25-bec4-ccd54124fe0a', blob_name: 'IMG_5829-O8r4I1AlNxPLU3ij7NLUC3MQBFQSeD.jpg', latitude: 25.03418055555556, longitude: 121.55445 },
  { memory_id: '65b00158-1cdd-4e25-bec4-ccd54124fe0a', blob_name: 'IMG_5836-mmyZvTtySaFCVYl66AazqflJ2evT6Z.jpg', latitude: 25.03418055555556, longitude: 121.55445 },
  { memory_id: '6aed07d0-531a-4f06-a1fa-fd914b381201', blob_name: 'IMG_9873-0xqk1PkCAnpOA4HsWvLV1Cvth0AdSw.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: '6aed07d0-531a-4f06-a1fa-fd914b381201', blob_name: 'IMG_9874-HvrGrvkUuqYeCickeAyGUM4efNM85C.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: '753e3429-0575-450e-b0ac-3d539dd94dc2', blob_name: 'IMG_5977-zEo88QhCEcDUyX7qdnLZVT6SqVjpfc.jpg', latitude: 25.164625, longitude: 121.4848027777778 },
  { memory_id: '9448ad31-8b1a-4c17-a293-f84e11796269', blob_name: 'IMG_6509-ItmaQQD4dXBlnn71IekIyzVIfoghFM.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: '9b33a902-04ef-4649-a722-8163d54eb711', blob_name: 'IMG_8518-K3rmfCBC85FTfE4yBdFzwjYNhNLoxO.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: 'a69ca19e-d1a4-4f0f-ba8d-db65e19acd14', blob_name: 'IMG_5736-NJUkqxpHMn1zvNtKFkhVOGTIF837Mh.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: 'a69ca19e-d1a4-4f0f-ba8d-db65e19acd14', blob_name: 'IMG_5737-CljkZ1afFQz5j3Rt0zf7UA1GpeB6T0.jpg', latitude: 25.13686111111111, longitude: 121.5457916666667 },
  { memory_id: 'ae8a8487-448b-4c42-a454-8f83280aea7e', blob_name: 'IMG_6745-TghnezgpOuC9agFKWNuYAaZnUMscwJ.jpg', latitude: 25.03418055555556, longitude: 121.55445 },
  { memory_id: 'b7f9c4fa-d826-4e81-920a-e835a545fccc', blob_name: 'IMG_9829-pOXn1ZSaWeQbgwn0AWf0NNOUYZuo4U.jpg', latitude: 25.08853888888889, longitude: 121.5050138888889 },
  { memory_id: 'bde28e42-6aa5-4d2f-97b9-caef762b2a33', blob_name: 'IMG_3754-ZQ7WcSTn1DgbcvTKZSQFYkKZlzRfCZ.jpg', latitude: 25.11851388888889, longitude: 121.5186083333333 },
  { memory_id: 'bde28e42-6aa5-4d2f-97b9-caef762b2a33', blob_name: 'IMG_3756-NMDshVa82Q4avPxaIcMBPrvR6p2y93.jpg', latitude: 25.11855277777778, longitude: 121.5186388888889 },
  { memory_id: 'f5600266-88cb-4d19-8086-b51a7cb1763d', blob_name: 'IMG_9158-MQ5PEyyPvnYRbwXa5cWJvgy4iYM7DX.jpg', latitude: 25.03418055555556, longitude: 121.55445 }
]

export async function POST() {
  try {
    await ensureImageLocationsTable()
    let inserted = 0
    let notFound = 0

    for (const item of recovered) {
      const [memory] = await sql`
        select image_url, image_urls
        from memories
        where id = ${item.memory_id}
      `
      const urls = Array.isArray(memory?.image_urls) && memory.image_urls.length
        ? memory.image_urls
        : memory?.image_url ? [memory.image_url] : []
      const imageUrl = urls.find((url) => String(url).endsWith('/' + item.blob_name))
      if (!imageUrl) {
        notFound += 1
        continue
      }

      await sql`
        insert into image_locations (memory_id, image_url, latitude, longitude, source)
        values (${item.memory_id}, ${imageUrl}, ${item.latitude}, ${item.longitude}, 'recovered_exif')
        on conflict (memory_id, image_url)
        do update set latitude = excluded.latitude, longitude = excluded.longitude, source = excluded.source, updated_at = now()
      `
      inserted += 1
    }

    return Response.json({ total: recovered.length, inserted, not_found: notFound })
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Recovery seed failed.', detail: String(error) }, { status: 500 })
  }
}
