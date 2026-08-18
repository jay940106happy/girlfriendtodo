<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const memories = ref([])
const locations = ref([])
const loading = ref(true)
const mode = ref('review')
const searchText = ref('')
const page = ref(1)
const pageSize = 16
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

function imageUrls(memory) {
  if (Array.isArray(memory?.image_urls)) return memory.image_urls.filter(Boolean)
  return memory?.image_url ? [memory.image_url] : []
}

function hasLocation(memoryId, imageUrl) {
  return locations.value.some((x) => x.memory_id === memoryId && x.image_url === imageUrl)
}

const missingPhotos = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  const rows = []
  for (const memory of memories.value) {
    const urls = imageUrls(memory)
    urls.forEach((url, index) => {
      if (hasLocation(memory.id, url)) return
      const text = `${memory.title || ''} ${memory.story || ''} ${memory.memory_date || ''}`.toLowerCase()
      if (q && !text.includes(q)) return
      rows.push({
        memoryId: memory.id,
        title: memory.title || '未命名回憶',
        story: memory.story || '',
        memoryDate: memory.memory_date,
        imageUrl: url,
        imageIndex: index + 1,
        imageCount: urls.length
      })
    })
  }
  return rows.sort((a, b) => String(b.memoryDate || '').localeCompare(String(a.memoryDate || '')))
})

const totalPages = computed(() => Math.max(1, Math.ceil(missingPhotos.value.length / pageSize)))
const pagedPhotos = computed(() => {
  if (page.value > totalPages.value) page.value = totalPages.value
  const start = (page.value - 1) * pageSize
  return missingPhotos.value.slice(start, start + pageSize)
})
const selectedMemory = computed(() => memories.value.find((m) => m.id === selectedMemoryId.value) ?? null)
const selectedImageLocation = computed(() => locations.value.find((x) => x.memory_id === selectedMemoryId.value && x.image_url === selectedImageUrl.value) ?? null)

function resetMessages() {
  statusMessage.value = ''
  errorMessage.value = ''
}

async function openEditor(item) {
  selectedMemoryId.value = item.memoryId
  selectedImageUrl.value = item.imageUrl
  mode.value = 'edit'
  latitude.value = ''
  longitude.value = ''
  locationName.value = ''
  resetMessages()
  await nextTick()
  initMap()
  loadSelectedLocation()
}

function backToReview() {
  mode.value = 'review'
  selectedMemoryId.value = ''
  selectedImageUrl.value = ''
  resetMessages()
  if (map) {
    map.remove()
    map = null
    pin = null
  }
}

function selectImage(url) {
  selectedImageUrl.value = url
  resetMessages()
  loadSelectedLocation()
}

function loadSelectedLocation() {
  const existing = selectedImageLocation.value
  if (existing) {
    latitude.value = Number(existing.latitude).toFixed(7)
    longitude.value = Number(existing.longitude).toFixed(7)
    locationName.value = existing.location_name || ''
    movePin(Number(existing.latitude), Number(existing.longitude), 17)
  } else {
    latitude.value = ''
    longitude.value = ''
    locationName.value = ''
    if (pin && map) map.removeLayer(pin)
    pin = null
  }
}

function movePin(lat, lng, zoom = null) {
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return
  if (!pin) pin = window.L.marker([lat, lng], { draggable: true }).addTo(map)
  else pin.setLatLng([lat, lng])
  pin.off('dragend')
  pin.on('dragend', () => {
    const point = pin.getLatLng()
    latitude.value = point.lat.toFixed(7)
    longitude.value = point.lng.toFixed(7)
  })
  if (zoom) map.setView([lat, lng], zoom)
}

function initMap() {
  if (!mapElement.value || !window.L || map) return
  map = window.L.map(mapElement.value).setView([25.08, 121.52], 11)
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxNativeZoom: 19,
    maxZoom: 21,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map)
  map.on('click', (event) => {
    latitude.value = event.latlng.lat.toFixed(7)
    longitude.value = event.latlng.lng.toFixed(7)
    movePin(event.latlng.lat, event.latlng.lng)
  })
  setTimeout(() => map?.invalidateSize(), 0)
}

async function loadData() {
  loading.value = true
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
  } catch (error) {
    errorMessage.value = error?.message || '讀取資料失敗'
  } finally {
    loading.value = false
  }
}

async function saveLocation() {
  if (!selectedMemoryId.value || !selectedImageUrl.value) return
  const lat = Number(latitude.value)
  const lng = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errorMessage.value = '請先在地圖上放置圖釘。'
    return
  }

  saving.value = true
  resetMessages()
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
    statusMessage.value = '已儲存定位。'
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
  loadSelectedLocation()
  statusMessage.value = '已清除定位。'
}

onMounted(loadData)
onUnmounted(() => map?.remove())
</script>

<template>
  <main class="admin-page">
    <header class="admin-header">
      <div>
        <a href="/">← 回首頁</a>
        <h1>照片定位管理</h1>
        <p v-if="mode === 'review'">先看照片內容，再決定真正的位置。</p>
        <p v-else>精準點選或拖曳圖釘後儲存。</p>
      </div>
      <a href="/map" class="map-link">看地圖</a>
    </header>

    <section v-if="mode === 'review'" class="review-wrap">
      <div class="review-toolbar">
        <div>
          <strong>待補定位</strong>
          <span>共 {{ missingPhotos.length }} 張</span>
        </div>
        <input v-model="searchText" @input="page = 1" type="search" placeholder="搜尋標題、日期或內容" />
      </div>

      <div v-if="loading" class="empty-state">載入中…</div>
      <div v-else-if="errorMessage" class="empty-state error">{{ errorMessage }}</div>
      <div v-else-if="!missingPhotos.length" class="empty-state">全部照片都有定位了 🎉</div>

      <div v-else class="photo-grid">
        <button v-for="item in pagedPhotos" :key="`${item.memoryId}-${item.imageUrl}`" class="review-card" type="button" @click="openEditor(item)">
          <div class="photo-frame">
            <img :src="item.imageUrl" :alt="item.title" loading="lazy" />
            <span>{{ item.imageIndex }}/{{ item.imageCount }}</span>
          </div>
          <div class="review-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ String(item.memoryDate || '').slice(0, 10) }}</small>
          </div>
        </button>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <button type="button" :disabled="page <= 1" @click="page--">上一頁</button>
        <span>{{ page }} / {{ totalPages }}</span>
        <button type="button" :disabled="page >= totalPages" @click="page++">下一頁</button>
      </div>
    </section>

    <section v-else class="editor-wrap">
      <button class="back-review" type="button" @click="backToReview">← 回待補照片</button>

      <div v-if="selectedMemory" class="editor-heading">
        <div>
          <small>{{ String(selectedMemory.memory_date || '').slice(0, 10) }}</small>
          <h2>{{ selectedMemory.title }}</h2>
          <p v-if="selectedMemory.story">{{ selectedMemory.story }}</p>
        </div>
      </div>

      <div v-if="selectedMemory" class="photo-strip">
        <button v-for="url in imageUrls(selectedMemory)" :key="url" type="button" :class="{ active: url === selectedImageUrl, located: hasLocation(selectedMemory.id, url) }" @click="selectImage(url)">
          <img :src="url" alt="" />
          <span>{{ hasLocation(selectedMemory.id, url) ? '✓' : '＋' }}</span>
        </button>
      </div>

      <div class="workspace">
        <div class="selected-photo">
          <img v-if="selectedImageUrl" :src="selectedImageUrl" alt="目前選取照片" />
          <span>{{ selectedImageLocation ? '這張已有定位' : '這張還沒定位' }}</span>
        </div>

        <div class="map-form">
          <div ref="mapElement" class="admin-map"></div>
          <p class="map-tip">地圖可放大到街道層級；直接點一下放針，也可以拖曳微調。</p>
          <div class="coords">
            <label>緯度<input v-model="latitude" inputmode="decimal" /></label>
            <label>經度<input v-model="longitude" inputmode="decimal" /></label>
          </div>
          <label>地點名稱<input v-model="locationName" placeholder="例如：軍艦岩觀景點" /></label>
          <div class="actions">
            <button class="save" type="button" :disabled="saving" @click="saveLocation">{{ saving ? '儲存中…' : '儲存定位' }}</button>
            <button v-if="selectedImageLocation" class="remove" type="button" @click="removeLocation">清除定位</button>
          </div>
          <p v-if="statusMessage" class="message ok">{{ statusMessage }}</p>
          <p v-if="errorMessage" class="message error">{{ errorMessage }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.admin-page{min-height:100vh;box-sizing:border-box;background:#f6f2ed;color:#382f2b;padding:24px}.admin-header{max-width:1260px;margin:0 auto 20px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px}.admin-header a{color:#816256;text-decoration:none;font-size:13px}.admin-header h1{margin:8px 0 3px;font-size:27px}.admin-header p{margin:0;color:#958078;font-size:13px}.map-link{padding:9px 13px;border:1px solid #ded0c8;border-radius:13px;background:#fffaf7}.review-wrap,.editor-wrap{max-width:1260px;margin:0 auto}.review-toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px}.review-toolbar>div{display:flex;align-items:baseline;gap:9px}.review-toolbar strong{font-size:20px}.review-toolbar span{color:#9a857b;font-size:12px}.review-toolbar input{width:min(340px,46vw);border:1px solid #ddd0c8;border-radius:13px;background:#fffdfa;padding:10px 12px;font:inherit;color:inherit}.photo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.review-card{padding:0;border:1px solid #e4d9d3;border-radius:18px;background:#fffdfa;color:inherit;overflow:hidden;text-align:left;box-shadow:0 4px 14px rgba(75,53,42,.05);transition:.15s ease}.review-card:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(75,53,42,.1)}.photo-frame{position:relative;aspect-ratio:4/3;background:#ebe4df;overflow:hidden}.photo-frame img{display:block;width:100%;height:100%;object-fit:cover}.photo-frame span{position:absolute;right:8px;bottom:8px;padding:4px 7px;border-radius:9px;background:rgba(43,32,27,.72);color:#fff;font-size:10px}.review-copy{padding:10px 11px 12px}.review-copy strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.review-copy small{display:block;margin-top:4px;color:#9b877d;font-size:11px}.pagination{display:flex;justify-content:center;align-items:center;gap:13px;margin:22px 0}.pagination button,.back-review{border:1px solid #dfd1ca;border-radius:12px;background:#fffaf7;padding:8px 12px;color:#76594e}.pagination button:disabled{opacity:.4}.pagination span{color:#8e786e;font-size:12px}.empty-state{padding:70px 20px;text-align:center;color:#907c73}.empty-state.error{color:#a35049}.back-review{margin-bottom:14px}.editor-wrap{padding:18px;border:1px solid #e3d8d1;border-radius:22px;background:#fffdfa}.editor-heading small{color:#9a857b}.editor-heading h2{margin:3px 0 5px;font-size:22px}.editor-heading p{margin:0;max-width:760px;color:#746159;font-size:13px;line-height:1.5}.photo-strip{display:flex;gap:8px;overflow:auto;padding:14px 0}.photo-strip button{position:relative;flex:0 0 76px;height:76px;padding:0;border:2px solid transparent;border-radius:13px;background:#eee7e2;overflow:hidden}.photo-strip button.active{border-color:#a46d64}.photo-strip img{width:100%;height:100%;object-fit:cover}.photo-strip span{position:absolute;right:4px;bottom:4px;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#b6766d;color:white;font-size:11px}.photo-strip button.located span{background:#68836d}.workspace{display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:18px}.selected-photo{position:relative;min-height:300px}.selected-photo img{width:100%;max-height:620px;object-fit:contain;border-radius:16px;background:#eee7e2}.selected-photo span{position:absolute;left:10px;bottom:10px;padding:6px 9px;border-radius:9px;background:rgba(44,33,28,.75);color:white;font-size:11px}.admin-map{height:470px;border-radius:16px;overflow:hidden}.map-tip{margin:7px 0 12px;color:#8e796f;font-size:12px}.coords{display:grid;grid-template-columns:1fr 1fr;gap:10px}.map-form label{display:block;margin-top:9px;color:#705d54;font-size:12px}.map-form input{box-sizing:border-box;width:100%;margin-top:5px;border:1px solid #ded2ca;border-radius:11px;background:white;padding:9px 10px;font:inherit}.actions{display:flex;gap:9px;margin-top:14px}.actions button{border:0;border-radius:12px;padding:10px 14px;font-weight:650}.save{background:#99665d;color:white}.remove{background:#eee3dd;color:#885b54}.message{margin:9px 0 0;font-size:13px}.message.ok{color:#5f7e66}.message.error{color:#a14f48}@media(max-width:980px){.photo-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.workspace{grid-template-columns:1fr}.selected-photo img{max-height:430px}}@media(max-width:650px){.admin-page{padding:12px}.photo-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.review-toolbar{align-items:stretch;flex-direction:column}.review-toolbar input{width:100%}.photo-frame{aspect-ratio:1/1}.admin-header h1{font-size:22px}.editor-wrap{padding:12px}.admin-map{height:360px}.coords{grid-template-columns:1fr 1fr}}
</style>
