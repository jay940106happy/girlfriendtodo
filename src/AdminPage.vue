<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const memories = ref([])
const locations = ref([])
const filter = ref('all')
const searchText = ref('')
const page = ref(1)
const pageSize = 20
const selectedMemoryId = ref('')
const selectedImageUrl = ref('')
const latitude = ref('')
const longitude = ref('')
const locationName = ref('')
const saving = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')
const mode = ref('review')
const mapElement = ref(null)
let map = null
let pin = null

function imageUrls(memory) {
  if (Array.isArray(memory?.image_urls)) return memory.image_urls.filter(Boolean)
  return memory?.image_url ? [memory.image_url] : []
}

function thumbnailUrl(memory, imageUrl) {
  const urls = imageUrls(memory)
  const index = urls.indexOf(imageUrl)
  const thumbs = Array.isArray(memory?.thumbnail_urls) ? memory.thumbnail_urls : []
  const thumb = index >= 0 ? thumbs[index] : ''
  return typeof thumb === 'string' && thumb.trim() ? thumb : imageUrl
}

function getLocation(memoryId, imageUrl) {
  return locations.value.find((x) => x.memory_id === memoryId && x.image_url === imageUrl) || null
}

function hasLocation(memoryId, imageUrl) {
  return Boolean(getLocation(memoryId, imageUrl))
}

const allPhotos = computed(() => {
  const rows = []
  for (const memory of memories.value) {
    imageUrls(memory).forEach((url, index) => {
      const location = getLocation(memory.id, url)
      rows.push({ memory, url, thumbnailUrl: thumbnailUrl(memory, url), index, location, located: Boolean(location) })
    })
  }
  return rows.sort((a, b) => String(b.memory.memory_date || '').localeCompare(String(a.memory.memory_date || '')))
})

const counts = computed(() => {
  const total = allPhotos.value.length
  const located = allPhotos.value.filter((x) => x.located).length
  return { total, located, missing: total - located }
})

const filteredPhotos = computed(() => {
  const q = searchText.value.trim().toLowerCase()
  return allPhotos.value.filter((item) => {
    if (filter.value === 'located' && !item.located) return false
    if (filter.value === 'missing' && item.located) return false
    if (!q) return true
    const text = `${item.memory.title || ''} ${item.memory.story || ''} ${item.memory.memory_date || ''} ${item.location?.location_name || ''} ${item.location?.source || ''}`.toLowerCase()
    return text.includes(q)
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredPhotos.value.length / pageSize)))
const pagedPhotos = computed(() => {
  if (page.value > totalPages.value) page.value = totalPages.value
  const start = (page.value - 1) * pageSize
  return filteredPhotos.value.slice(start, start + pageSize)
})

const selectedMemory = computed(() => memories.value.find((m) => m.id === selectedMemoryId.value) || null)
const selectedImageLocation = computed(() => getLocation(selectedMemoryId.value, selectedImageUrl.value))
const selectedFilteredIndex = computed(() => filteredPhotos.value.findIndex((x) => x.memory.id === selectedMemoryId.value && x.url === selectedImageUrl.value))

function setFilter(value) { filter.value = value; page.value = 1 }

async function openEditor(item) {
  selectedMemoryId.value = item.memory.id
  selectedImageUrl.value = item.url
  statusMessage.value = ''
  errorMessage.value = ''
  mode.value = 'edit'
  await nextTick()
  initMap()
  loadSelectedLocation()
  setTimeout(() => map?.invalidateSize(), 0)
}

function backToReview() {
  mode.value = 'review'
  statusMessage.value = ''
  errorMessage.value = ''
  if (map) { map.remove(); map = null; pin = null }
}

function selectImage(url) { selectedImageUrl.value = url; statusMessage.value = ''; errorMessage.value = ''; loadSelectedLocation() }

function loadSelectedLocation() {
  const existing = selectedImageLocation.value
  if (existing) {
    const lat = Number(existing.latitude)
    const lng = Number(existing.longitude)
    latitude.value = Number.isFinite(lat) ? lat.toFixed(7) : ''
    longitude.value = Number.isFinite(lng) ? lng.toFixed(7) : ''
    locationName.value = existing.location_name || ''
    if (Number.isFinite(lat) && Number.isFinite(lng)) movePin(lat, lng, 19)
  } else {
    latitude.value = ''
    longitude.value = ''
    locationName.value = ''
    if (pin && map) map.removeLayer(pin)
    pin = null
    if (map) map.setView([25.08, 121.52], 11)
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
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
  map.on('click', (event) => {
    latitude.value = event.latlng.lat.toFixed(7)
    longitude.value = event.latlng.lng.toFixed(7)
    movePin(event.latlng.lat, event.latlng.lng)
  })
}

function goRelative(step) {
  if (!filteredPhotos.value.length) return
  let index = selectedFilteredIndex.value
  if (index < 0) index = 0
  const next = (index + step + filteredPhotos.value.length) % filteredPhotos.value.length
  openEditor(filteredPhotos.value[next])
}

async function saveLocation() {
  const lat = Number(latitude.value)
  const lng = Number(longitude.value)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) { errorMessage.value = '請先在右側地圖點一下放置圖釘。'; return }
  saving.value = true
  statusMessage.value = ''
  errorMessage.value = ''
  try {
    const response = await fetch('/api/locations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory_id: selectedMemoryId.value, image_url: selectedImageUrl.value, latitude: lat, longitude: lng, location_name: locationName.value.trim() || null, source: 'manual' })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || '儲存失敗')
    const index = locations.value.findIndex((x) => x.memory_id === data.memory_id && x.image_url === data.image_url)
    if (index >= 0) locations.value[index] = { ...locations.value[index], ...data }
    else locations.value.push(data)
    statusMessage.value = '已儲存這張照片的定位。'
    await nextTick()
    loadSelectedLocation()
  } catch (error) { errorMessage.value = error?.message || '儲存失敗' } finally { saving.value = false }
}

async function removeLocation() {
  if (!selectedImageLocation.value) return
  if (!window.confirm('確定要清除這張照片的位置嗎？')) return
  const response = await fetch('/api/locations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memory_id: selectedMemoryId.value, image_url: selectedImageUrl.value }) })
  if (!response.ok) { errorMessage.value = '清除失敗。'; return }
  locations.value = locations.value.filter((x) => !(x.memory_id === selectedMemoryId.value && x.image_url === selectedImageUrl.value))
  loadSelectedLocation()
  statusMessage.value = '已清除定位。'
}

async function loadData() {
  try {
    const [memoryResponse, locationResponse] = await Promise.all([fetch('/api/memories'), fetch('/api/locations')])
    const memoryData = await memoryResponse.json().catch(() => [])
    const locationData = await locationResponse.json().catch(() => [])
    if (!memoryResponse.ok) throw new Error('讀取回憶失敗')
    if (!locationResponse.ok) throw new Error('讀取定位失敗')
    memories.value = Array.isArray(memoryData) ? memoryData : []
    locations.value = Array.isArray(locationData) ? locationData : []
  } catch (error) { errorMessage.value = error?.message || '讀取資料失敗' }
}

onMounted(loadData)
onUnmounted(() => map?.remove())
</script>

<template>
  <main class="admin-page">
    <header class="topbar"><div><a href="/">← 回首頁</a><h1>照片定位管理</h1><p>全部 {{ counts.total }} · 未定位 {{ counts.missing }} · 已定位 {{ counts.located }}</p></div><button v-if="mode === 'edit'" type="button" @click="backToReview">回照片牆</button></header>

    <section v-if="mode === 'review'" class="review">
      <div class="review-toolbar"><div class="segmented" role="tablist" aria-label="定位狀態篩選"><button type="button" :class="{ active: filter === 'all' }" @click="setFilter('all')">全部 <span>{{ counts.total }}</span></button><button type="button" :class="{ active: filter === 'missing' }" @click="setFilter('missing')">未定位 <span>{{ counts.missing }}</span></button><button type="button" :class="{ active: filter === 'located' }" @click="setFilter('located')">已定位 <span>{{ counts.located }}</span></button></div><input v-model="searchText" type="search" placeholder="搜尋標題、日期、地點或來源" @input="page = 1" /></div>
      <div class="review-intro"><h2>{{ filter === 'located' ? '檢查已定位照片' : filter === 'missing' ? '待補定位照片' : '全部照片' }}</h2><p>{{ filter === 'located' ? '點照片後，右側地圖會直接跳到目前定位點。' : '點任一張照片即可查看或調整定位。' }}</p></div>
      <div class="photo-wall"><button v-for="item in pagedPhotos" :key="item.memory.id + item.url" type="button" class="photo-card" @click="openEditor(item)"><div class="photo-frame"><img :src="item.thumbnailUrl" alt="" loading="lazy" decoding="async" /><span class="status-badge" :class="item.located ? 'located' : 'missing'">{{ item.located ? '已定位' : '未定位' }}</span></div><div class="photo-copy"><strong>{{ item.memory.title }}</strong><span>{{ String(item.memory.memory_date || '').slice(0,10) }} · 第 {{ item.index + 1 }} 張</span><small v-if="item.location?.location_name">{{ item.location.location_name }}</small><small v-else-if="item.location">{{ Number(item.location.latitude).toFixed(5) }}, {{ Number(item.location.longitude).toFixed(5) }}</small></div></button></div>
      <p v-if="!filteredPhotos.length" class="empty">這個篩選目前沒有照片。</p>
      <div v-if="totalPages > 1" class="pagination"><button type="button" :disabled="page <= 1" @click="page--">上一頁</button><span>{{ page }} / {{ totalPages }}</span><button type="button" :disabled="page >= totalPages" @click="page++">下一頁</button></div>
    </section>

    <section v-else class="editor">
      <div class="photo-pane"><div class="stepbar"><button type="button" @click="goRelative(-1)">← 上一張</button><strong>1. 看照片</strong><button type="button" @click="goRelative(1)">下一張 →</button></div><div v-if="selectedMemory" class="memory-title"><small>{{ String(selectedMemory.memory_date || '').slice(0,10) }}</small><h2>{{ selectedMemory.title }}</h2></div><img class="main-photo" :src="selectedImageUrl" alt="目前要定位的照片" loading="lazy" /><div v-if="selectedMemory" class="siblings"><button v-for="url in imageUrls(selectedMemory)" :key="url" type="button" :class="{active:url===selectedImageUrl,located:hasLocation(selectedMemory.id,url)}" @click="selectImage(url)"><img :src="thumbnailUrl(selectedMemory, url)" alt="" loading="lazy" decoding="async" /><span>{{ hasLocation(selectedMemory.id,url) ? '已定位' : '未定位' }}</span></button></div></div>

      <div class="map-pane"><div class="map-callout" :class="{ existing: selectedImageLocation }"><div class="pin-icon">📍</div><div><strong>{{ selectedImageLocation ? '目前定位點' : '2. 直接點地圖插針' }}</strong><span>{{ selectedImageLocation ? '已自動移到目前座標；拖曳圖釘可修正位置' : '點一下就會出現圖釘，也可以拖曳微調' }}</span></div></div><div v-if="selectedImageLocation" class="current-location"><div><span>地點</span><strong>{{ selectedImageLocation.location_name || '未命名' }}</strong></div><div><span>緯度</span><strong>{{ Number(selectedImageLocation.latitude).toFixed(7) }}</strong></div><div><span>經度</span><strong>{{ Number(selectedImageLocation.longitude).toFixed(7) }}</strong></div><div><span>來源</span><strong>{{ selectedImageLocation.source || 'unknown' }}</strong></div></div><div ref="mapElement" class="admin-map"></div><div class="form-card"><strong class="step-label">3. 確認後儲存</strong><label>地點名稱<input v-model="locationName" placeholder="例如：軍艦岩、淡水老街" /></label><div class="coords"><label>緯度<input v-model="latitude" inputmode="decimal" /></label><label>經度<input v-model="longitude" inputmode="decimal" /></label></div><button class="save" type="button" :disabled="saving" @click="saveLocation">{{ saving ? '儲存中…' : selectedImageLocation ? '儲存修正後的位置' : '儲存這張照片的定位' }}</button><button v-if="selectedImageLocation" class="remove" type="button" @click="removeLocation">清除這張照片的定位</button><p v-if="statusMessage" class="ok">{{ statusMessage }}</p><p v-if="errorMessage" class="error">{{ errorMessage }}</p></div></div>
    </section>
  </main>
</template>

<style scoped>
.admin-page{min-height:100vh;box-sizing:border-box;background:#f6f2ed;color:#372d29;padding:20px}.topbar{max-width:1440px;margin:0 auto 18px;display:flex;align-items:end;justify-content:space-between;gap:16px}.topbar a{color:#7a5d52;text-decoration:none;font-size:13px}.topbar h1{margin:7px 0 2px;font-size:28px}.topbar p{margin:0;color:#8d7970;font-size:13px}.topbar button{border:1px solid #dccfc8;border-radius:12px;background:#fffaf7;padding:9px 12px;color:#70544b}.review{max-width:1440px;margin:0 auto}.review-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px}.review-toolbar>input{width:min(360px,42vw);border:1px solid #ddd0c8;border-radius:12px;background:#fffdfa;padding:10px 12px;font:inherit;color:inherit}.segmented{display:inline-flex;padding:4px;border:1px solid #ddd0c8;border-radius:14px;background:#eee5df}.segmented button{border:0;border-radius:10px;background:transparent;padding:8px 12px;color:#775f55;font-weight:650}.segmented button.active{background:#fffdfa;box-shadow:0 2px 8px rgba(60,42,34,.1);color:#3d302b}.segmented span{margin-left:4px;color:#9a8176;font-size:11px}.review-intro{margin-bottom:14px}.review-intro h2{margin:0 0 4px}.review-intro p{margin:0;color:#8d7970}.photo-wall{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.photo-card{padding:0;border:1px solid #e1d6cf;border-radius:18px;background:#fffdfa;color:inherit;overflow:hidden;text-align:left;box-shadow:0 4px 14px rgba(60,42,34,.05)}.photo-frame{position:relative}.photo-frame img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:#ece5e0}.status-badge{position:absolute;right:8px;top:8px;padding:5px 8px;border-radius:999px;color:white;font-size:10px;font-weight:700}.status-badge.located{background:#68836d}.status-badge.missing{background:#aa6c62}.photo-copy{padding:10px 11px}.photo-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px}.photo-copy>span,.photo-copy small{display:block;margin-top:4px;color:#9a867c;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pagination{display:flex;justify-content:center;align-items:center;gap:12px;margin:22px 0}.pagination button{border:1px solid #ddd0c8;border-radius:10px;background:#fffdfa;padding:7px 11px;color:#70564d}.pagination button:disabled{opacity:.4}.pagination span{color:#8d7970;font-size:12px}.empty{text-align:center;color:#8e7b72;padding:60px 0}.editor{max-width:1440px;margin:0 auto;display:grid;grid-template-columns:minmax(360px,44%) minmax(0,56%);gap:18px;align-items:start}.photo-pane,.map-pane{border:1px solid #e1d6cf;border-radius:20px;background:#fffdfa;padding:14px}.stepbar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:10px}.stepbar strong{text-align:center}.stepbar button{border:1px solid #ddd0c8;border-radius:11px;background:#fff7f3;padding:8px 10px;color:#73564d}.stepbar button:last-child{justify-self:end}.memory-title small{color:#9a867c}.memory-title h2{margin:4px 0 10px;font-size:20px}.main-photo{display:block;width:100%;max-height:62vh;object-fit:contain;border-radius:15px;background:#ece5e0}.siblings{display:flex;gap:8px;overflow-x:auto;padding-top:10px}.siblings button{position:relative;flex:0 0 82px;height:82px;padding:0;border:3px solid transparent;border-radius:12px;overflow:hidden;background:#eee}.siblings button.active{border-color:#a46c62}.siblings button.located{opacity:.7}.siblings img{width:100%;height:100%;object-fit:cover}.siblings span{position:absolute;left:4px;right:4px;bottom:4px;padding:3px;border-radius:7px;background:rgba(40,30,26,.72);color:#fff;font-size:9px}.map-callout{display:flex;gap:10px;align-items:center;margin-bottom:10px;padding:14px;border:2px solid #dca99a;border-radius:15px;background:#fff0e9}.map-callout.existing{border-color:#a9c0ad;background:#eef6ef}.pin-icon{font-size:28px}.map-callout strong{display:block;font-size:18px;color:#6d493e}.map-callout span{display:block;margin-top:3px;color:#9a7165;font-size:12px}.current-location{display:grid;grid-template-columns:1.3fr 1fr 1fr .8fr;gap:8px;margin-bottom:10px}.current-location>div{padding:9px 10px;border:1px solid #e1d6cf;border-radius:11px;background:#f8f4f1;min-width:0}.current-location span{display:block;color:#9a867c;font-size:9px}.current-location strong{display:block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px}.admin-map{height:58vh;min-height:480px;border-radius:16px;overflow:hidden;box-shadow:inset 0 0 0 1px #ded2ca}.form-card{padding-top:13px}.step-label{display:block;margin-bottom:9px;font-size:16px}.form-card label{display:block;color:#6b5951;font-size:12px}.form-card input{box-sizing:border-box;width:100%;margin-top:5px;border:1px solid #dccfc8;border-radius:11px;background:white;padding:10px 11px;font:inherit;color:inherit}.coords{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}.save,.remove{width:100%;margin-top:12px;border:0;border-radius:13px;padding:12px;font-weight:700}.save{background:#9d675e;color:white}.remove{background:#efe4de;color:#8b5951}.ok{color:#5f7c64}.error{color:#a14e48}@media(max-width:920px){.photo-wall{grid-template-columns:repeat(2,minmax(0,1fr))}.editor{grid-template-columns:1fr}.admin-map{height:52vh;min-height:360px}.current-location{grid-template-columns:1fr 1fr}}@media(max-width:620px){.admin-page{padding:10px}.review-toolbar{align-items:stretch;flex-direction:column}.review-toolbar>input{width:100%;box-sizing:border-box}.segmented{display:grid;grid-template-columns:1fr 1fr 1fr}.segmented button{padding:9px 7px}.photo-wall{grid-template-columns:1fr 1fr;gap:8px}.photo-copy{padding:8px}.topbar h1{font-size:22px}.stepbar{grid-template-columns:1fr 1fr}.stepbar strong{grid-column:1/-1;grid-row:1}.stepbar button{grid-row:2;font-size:11px}.admin-map{min-height:340px;height:48vh}.coords{grid-template-columns:1fr}.current-location{grid-template-columns:1fr 1fr}.map-callout strong{font-size:16px}}
</style>
