<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const memories = ref([])
const locations = ref([])
const searchText = ref('')
const selectedMemoryId = ref('')
const selectedImageUrl = ref('')
const latitude = ref('')
const longitude = ref('')
const locationName = ref('')
const saving = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')
const mapElement = ref(null)
let map = null
let pin = null

const selectedMemory = computed(() => memories.value.find((m) => m.id === selectedMemoryId.value) ?? null)
const selectedImageLocation = computed(() => locations.value.find((x) => x.memory_id === selectedMemoryId.value && x.image_url === selectedImageUrl.value) ?? null)
const filteredMemories = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  const list = q
    ? memories.value.filter((m) => `${m.title || ''} ${m.story || ''} ${m.memory_date || ''}`.toLowerCase().includes(q))
    : memories.value
  return [...list].sort((a, b) => {
    const aMissing = countMissing(a)
    const bMissing = countMissing(b)
    return bMissing - aMissing
  })
})

function imageUrls(memory) {
  if (Array.isArray(memory?.image_urls)) return memory.image_urls.filter(Boolean)
  return memory?.image_url ? [memory.image_url] : []
}

function hasLocation(memoryId, imageUrl) {
  return locations.value.some((x) => x.memory_id === memoryId && x.image_url === imageUrl)
}

function countMissing(memory) {
  return imageUrls(memory).filter((url) => !hasLocation(memory.id, url)).length
}

function selectMemory(memory) {
  selectedMemoryId.value = memory.id
  const urls = imageUrls(memory)
  const firstMissing = urls.find((url) => !hasLocation(memory.id, url))
  selectImage(firstMissing || urls[0] || '')
}

function selectImage(url) {
  selectedImageUrl.value = url
  statusMessage.value = ''
  errorMessage.value = ''
  const existing = locations.value.find((x) => x.memory_id === selectedMemoryId.value && x.image_url === url)
  if (existing) {
    latitude.value = Number(existing.latitude).toFixed(6)
    longitude.value = Number(existing.longitude).toFixed(6)
    locationName.value = existing.location_name || ''
    movePin(Number(existing.latitude), Number(existing.longitude), 15)
  } else {
    latitude.value = ''
    longitude.value = ''
    locationName.value = ''
    if (pin && map) {
      map.removeLayer(pin)
      pin = null
    }
  }
}

function movePin(lat, lng, zoom = null) {
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  if (!pin) pin = window.L.marker([lat, lng], { draggable: true }).addTo(map)
  else pin.setLatLng([lat, lng])
  pin.off('dragend')
  pin.on('dragend', () => {
    const point = pin.getLatLng()
    latitude.value = point.lat.toFixed(6)
    longitude.value = point.lng.toFixed(6)
  })
  if (zoom) map.setView([lat, lng], zoom)
}

function initMap() {
  if (!mapElement.value || !window.L || map) return
  map = window.L.map(mapElement.value).setView([25.08, 121.52], 11)
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)
  map.on('click', (event) => {
    latitude.value = event.latlng.lat.toFixed(6)
    longitude.value = event.latlng.lng.toFixed(6)
    movePin(event.latlng.lat, event.latlng.lng)
  })
}

async function loadData() {
  try {
    const [memoryResponse, locationResponse] = await Promise.all([
      fetch('/api/memories'),
      fetch('/api/locations')
    ])
    const memoryData = await memoryResponse.json().catch(() => [])
    const locationData = await locationResponse.json().catch(() => [])
    if (!memoryResponse.ok) throw new Error('讀取回憶失敗')
    if (!locationResponse.ok) throw new Error('讀取定位失敗')
    memories.value = Array.isArray(memoryData) ? memoryData : []
    locations.value = Array.isArray(locationData) ? locationData : []
    await nextTick()
    initMap()
    if (memories.value.length) selectMemory(filteredMemories.value[0] || memories.value[0])
  } catch (error) {
    errorMessage.value = error?.message || '讀取資料失敗'
  }
}

async function saveLocation() {
  if (!selectedMemoryId.value || !selectedImageUrl.value) {
    errorMessage.value = '先選一張照片。'
    return
  }
  const lat = Number(latitude.value)
  const lng = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errorMessage.value = '請在地圖上點一下要放的位置。'
    return
  }

  saving.value = true
  errorMessage.value = ''
  statusMessage.value = ''
  try {
    const response = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memory_id: selectedMemoryId.value,
        image_url: selectedImageUrl.value,
        latitude: lat,
        longitude: lng,
        location_name: locationName.value.trim() || null,
        source: 'manual'
      })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || '儲存失敗')
    const index = locations.value.findIndex((x) => x.memory_id === data.memory_id && x.image_url === data.image_url)
    if (index >= 0) locations.value[index] = { ...locations.value[index], ...data }
    else locations.value.push(data)
    statusMessage.value = '已儲存這張照片的位置。'
  } catch (error) {
    errorMessage.value = error?.message || '儲存失敗'
  } finally {
    saving.value = false
  }
}

async function removeLocation() {
  if (!selectedImageLocation.value) return
  if (!window.confirm('確定要清除這張照片的位置嗎？')) return
  const response = await fetch('/api/locations', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory_id: selectedMemoryId.value, image_url: selectedImageUrl.value })
  })
  if (!response.ok) {
    errorMessage.value = '清除失敗。'
    return
  }
  locations.value = locations.value.filter((x) => !(x.memory_id === selectedMemoryId.value && x.image_url === selectedImageUrl.value))
  latitude.value = ''
  longitude.value = ''
  locationName.value = ''
  if (pin && map) map.removeLayer(pin)
  pin = null
  statusMessage.value = '已清除定位。'
}

onMounted(loadData)
onUnmounted(() => {
  if (map) map.remove()
  map = null
})
</script>

<template>
  <main class="admin-page">
    <header class="admin-header">
      <div>
        <a href="/">← 回首頁</a>
        <h1>回憶定位管理</h1>
        <p>選照片 → 在地圖點一下 → 儲存。就這樣。</p>
      </div>
      <a class="view-map" href="/map">看地圖</a>
    </header>

    <div class="admin-layout">
      <aside class="memory-panel">
        <label class="search-label">搜尋回憶
          <input v-model="searchText" type="search" placeholder="標題、日期…" />
        </label>
        <div class="memory-list">
          <button
            v-for="memory in filteredMemories"
            :key="memory.id"
            class="memory-row"
            :class="{ active: memory.id === selectedMemoryId }"
            type="button"
            @click="selectMemory(memory)"
          >
            <img v-if="imageUrls(memory)[0]" :src="imageUrls(memory)[0]" alt="" loading="lazy" />
            <span>
              <strong>{{ memory.title }}</strong>
              <small>{{ String(memory.memory_date || '').slice(0, 10) }}</small>
              <em :class="{ done: countMissing(memory) === 0 }">
                {{ countMissing(memory) === 0 ? '定位完成' : `還有 ${countMissing(memory)} 張` }}
              </em>
            </span>
          </button>
        </div>
      </aside>

      <section class="edit-panel">
        <template v-if="selectedMemory">
          <div class="selected-heading">
            <div>
              <small>{{ String(selectedMemory.memory_date || '').slice(0, 10) }}</small>
              <h2>{{ selectedMemory.title }}</h2>
            </div>
            <span>{{ imageUrls(selectedMemory).length }} 張照片</span>
          </div>

          <div class="photo-strip">
            <button
              v-for="url in imageUrls(selectedMemory)"
              :key="url"
              type="button"
              :class="{ active: url === selectedImageUrl, located: hasLocation(selectedMemory.id, url) }"
              @click="selectImage(url)"
            >
              <img :src="url" alt="" loading="lazy" />
              <span>{{ hasLocation(selectedMemory.id, url) ? '✓' : '＋' }}</span>
            </button>
          </div>

          <div v-if="selectedImageUrl" class="workspace">
            <div class="selected-photo-wrap">
              <img :src="selectedImageUrl" alt="目前選取的照片" />
              <span v-if="selectedImageLocation">這張已有定位</span>
              <span v-else>這張還沒定位</span>
            </div>

            <div class="map-and-form">
              <div ref="mapElement" class="admin-map"></div>
              <p class="map-tip">直接點地圖放針，也可以拖曳圖釘微調。</p>
              <div class="coord-grid">
                <label>緯度<input v-model="latitude" inputmode="decimal" /></label>
                <label>經度<input v-model="longitude" inputmode="decimal" /></label>
              </div>
              <label>地點名稱（可不填）<input v-model="locationName" placeholder="例如：淡水河邊、軍艦岩" /></label>
              <div class="actions">
                <button class="save" type="button" :disabled="saving" @click="saveLocation">{{ saving ? '儲存中…' : '儲存定位' }}</button>
                <button v-if="selectedImageLocation" class="remove" type="button" @click="removeLocation">清除定位</button>
              </div>
              <p v-if="statusMessage" class="message ok">{{ statusMessage }}</p>
              <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
            </div>
          </div>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.admin-page{min-height:100vh;background:#f7f4ef;color:#352c28;padding:24px}.admin-header{max-width:1180px;margin:0 auto 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.admin-header a{color:#8a6558;text-decoration:none;font-size:14px}.admin-header h1{margin:8px 0 3px;font-size:26px}.admin-header p{margin:0;color:#8f7d74;font-size:14px}.view-map{padding:10px 14px;border:1px solid #dfd2cb;border-radius:14px;background:#fffaf7}.admin-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px;max-width:1180px;margin:0 auto}.memory-panel,.edit-panel{border:1px solid #e5dbd5;border-radius:22px;background:#fffdfa}.memory-panel{padding:14px;height:calc(100vh - 130px);overflow:hidden}.search-label{display:block;color:#76645b;font-size:12px}.search-label input,.map-and-form input{box-sizing:border-box;width:100%;margin-top:6px;border:1px solid #ded2cb;border-radius:12px;background:white;padding:10px 11px;font:inherit;color:inherit}.memory-list{height:calc(100% - 62px);margin-top:12px;overflow:auto}.memory-row{display:grid;grid-template-columns:58px 1fr;gap:10px;width:100%;padding:8px;border:0;border-radius:14px;background:transparent;text-align:left;color:inherit}.memory-row:hover,.memory-row.active{background:#f4ece7}.memory-row img{width:58px;height:58px;object-fit:cover;border-radius:11px}.memory-row span{min-width:0}.memory-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.memory-row small{display:block;margin-top:3px;color:#a18e84;font-size:11px}.memory-row em{display:inline-block;margin-top:5px;color:#a05858;font-size:10px;font-style:normal}.memory-row em.done{color:#66806c}.edit-panel{padding:18px;min-height:680px}.selected-heading{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.selected-heading small{color:#9a8479}.selected-heading h2{margin:3px 0 0;font-size:20px}.selected-heading>span{color:#9a8479;font-size:12px}.photo-strip{display:flex;gap:8px;overflow-x:auto;padding:14px 0}.photo-strip button{position:relative;flex:0 0 74px;height:74px;padding:0;border:2px solid transparent;border-radius:13px;background:#eee;overflow:hidden}.photo-strip button.active{border-color:#a96e65}.photo-strip button.located span{background:#6d8971}.photo-strip img{width:100%;height:100%;object-fit:cover}.photo-strip span{position:absolute;right:4px;bottom:4px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#b9766e;color:white;font-size:12px}.workspace{display:grid;grid-template-columns:minmax(230px,360px) 1fr;gap:18px}.selected-photo-wrap{position:relative}.selected-photo-wrap img{width:100%;max-height:520px;object-fit:contain;border-radius:16px;background:#eee8e3}.selected-photo-wrap span{position:absolute;left:10px;bottom:10px;padding:6px 9px;border-radius:10px;background:rgba(49,38,33,.76);color:white;font-size:11px}.admin-map{height:390px;border-radius:16px;overflow:hidden}.map-tip{margin:6px 0 12px;color:#8f7b70;font-size:12px}.coord-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.map-and-form label{display:block;margin-top:10px;color:#6f5e56;font-size:12px}.actions{display:flex;gap:9px;margin-top:14px}.actions button{border:0;border-radius:12px;padding:10px 14px;font-weight:600}.actions .save{background:#9e6a61;color:white}.actions .remove{background:#efe5df;color:#8e5c56}.message{margin:10px 0 0;font-size:13px}.message.ok{color:#5e7a64}.message.error{color:#a14e48}@media(max-width:760px){.admin-page{padding:12px}.admin-layout{display:block}.memory-panel{height:300px;margin-bottom:12px}.edit-panel{min-height:0}.workspace{display:block}.selected-photo-wrap{margin-bottom:12px}.selected-photo-wrap img{max-height:260px}.admin-map{height:330px}.admin-header h1{font-size:21px}.admin-header p{font-size:12px}.coord-grid{grid-template-columns:1fr 1fr}}
</style>
