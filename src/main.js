import { createApp } from 'vue'
import App from './App.vue'
import MapPage from './MapPage.vue'
import AdminPage from './AdminPage.vue'
import './styles.css'

const path = window.location.pathname.replace(/\/+$/, '') || '/'

if (path === '/') {
  installUploadGpsCapture()
}

const RootComponent = path === '/map' ? MapPage : path === '/admin' ? AdminPage : App
createApp(RootComponent).mount('#app')

function installUploadGpsCapture() {
  const gpsByStem = new Map()
  const stemOf = (name) => String(name || '').replace(/\.[^.]+$/, '').toLowerCase()

  document.addEventListener('change', (event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.type !== 'file') return

    for (const file of Array.from(input.files || [])) {
      const stem = stemOf(file.name)
      if (!stem || !window.exifr?.gps) continue
      gpsByStem.set(
        stem,
        window.exifr.gps(file).catch((error) => {
          console.warn('EXIF GPS read failed:', file.name, error)
          return null
        })
      )
    }
  }, true)

  const nativeFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url
    const body = init?.body

    if (url === '/api/upload' && body instanceof FormData) {
      const file = body.get('file')
      if (file instanceof File) {
        const gpsPromise = gpsByStem.get(stemOf(file.name))
        if (gpsPromise) {
          const gps = await gpsPromise
          if (Number.isFinite(gps?.latitude) && Number.isFinite(gps?.longitude)) {
            body.set('latitude', String(gps.latitude))
            body.set('longitude', String(gps.longitude))
          }
        }
      }
    }

    return nativeFetch(input, init)
  }
}
