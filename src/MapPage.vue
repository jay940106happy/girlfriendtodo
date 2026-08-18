<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const locations = ref([])
const loading = ref(true)
const errorMessage = ref('')
const selectedItems = ref([])
const selectedIndex = ref(0)
const mapElement = ref(null)
let map = null
let markerLayer = null

const selected = computed(() => selectedItems.value[selectedIndex.value] ?? null)

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function groupLocations(rows) {
  const groups = new Map()
  for (const item of rows) {
    const key = `${Number(item.latitude).toFixed(5)},${Number(item.longitude).toFixed(5)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.values()]
}

async function loadLocations() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await fetch('/api/locations')
    const data = await response.json().catch(() => [])
    if (!response.ok) throw new Error(data?.error || '讀取定位失敗')
    locations.value = Array.isArray(data) ? data : []
    await nextTick()
    drawMap()
  } catch (error) {
    errorMessage.value = error?.message || '讀取定位失敗'
  } finally {
    loading.value = false
  }
}

function drawMap() {
  if (!mapElement.value || !window.L) return

  if (!map) {
    map = window.L.map(mapElement.value, { zoomControl: false }).setView([25.08, 121.52], 11)
    window.L.control.zoom({ position: 'topright' }).addTo(map)
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)
    markerLayer = window.L.layerGroup().addTo(map)
  }

  markerLayer.clearLayers()
  const groups = groupLocations(locations.value)
  const bounds = []

  for (const group of groups) {
    const first = group[0]
    const lat = Number(first.latitude)
    const lng = Number(first.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    bounds.push([lat, lng])

    const icon = window.L.divIcon({
      className: 'memory-map-marker-wrap',
      html: `<button class="memory-map-marker" aria-label="${escapeHtml(first.title || '回憶')}"><span>♥</span>${group.length > 1 ? `<b>${group.length}</b>` : ''}</button>`,
      iconSize: [44, 44],
      iconAnchor: [22, 39]
    })

    const marker = window.L.marker([lat, lng], { icon }).addTo(markerLayer)
    marker.on('click', () => {
      selectedItems.value = group
      selectedIndex.value = 0
      map.panTo([lat, lng], { animate: true, duration: 0.5 })
    })
  }

  if (bounds.length === 1) map.setView(bounds[0], 14)
  else if (bounds.length > 1) map.fitBounds(bounds, { padding: [44, 44], maxZoom: 14 })
}

function previousItem() {
  if (!selectedItems.value.length) return
  selectedIndex.value = (selectedIndex.value - 1 + selectedItems.value.length) % selectedItems.value.length
}

function nextItem() {
  if (!selectedItems.value.length) return
  selectedIndex.value = (selectedIndex.value + 1) % selectedItems.value.length
}

function closeCard() {
  selectedItems.value = []
  selectedIndex.value = 0
}

onMounted(loadLocations)
onUnmounted(() => {
  if (map) map.remove()
  map = null
})
</script>

<template>
  <main class="memory-map-page">
    <div class="map-toolbar">
      <a class="map-back" href="/">← 日常</a>
      <div>
        <strong>我們走過的地方</strong>
        <small>{{ locations.length ? `${locations.length} 張有定位的照片` : '把回憶放回地圖上' }}</small>
      </div>
      <a class="map-admin-link" href="/admin">管理</a>
    </div>

    <div ref="mapElement" class="memory-map-canvas" aria-label="回憶地圖"></div>

    <div v-if="loading" class="map-status">正在打開我們的足跡…</div>
    <div v-else-if="errorMessage" class="map-status error">{{ errorMessage }}</div>
    <div v-else-if="!locations.length" class="map-empty">
      <span>♡</span>
      <strong>地圖還是空的</strong>
      <p>之後補上照片位置，回憶就會出現在這裡。</p>
    </div>

    <Transition name="memory-sheet">
      <article v-if="selected" class="map-memory-sheet">
        <button class="sheet-close" type="button" aria-label="關閉" @click="closeCard">×</button>
        <img :src="selected.image_url" :alt="selected.title || '回憶照片'" loading="lazy" />
        <div class="sheet-copy">
          <div class="sheet-meta">
            <span>{{ String(selected.memory_date || '').slice(0, 10).replaceAll('-', '.') }}</span>
            <span v-if="selected.location_name">{{ selected.location_name }}</span>
          </div>
          <h2>{{ selected.title }}</h2>
          <p v-if="selected.story">{{ selected.story }}</p>
          <small>這張照片屬於這則回憶</small>
        </div>
        <div v-if="selectedItems.length > 1" class="sheet-nav">
          <button type="button" @click="previousItem">‹</button>
          <span>{{ selectedIndex + 1 }} / {{ selectedItems.length }}</span>
          <button type="button" @click="nextItem">›</button>
        </div>
      </article>
    </Transition>
  </main>
</template>

<style scoped>
.memory-map-page{position:fixed;inset:0;background:#f7f3ee;color:#3b302b;overflow:hidden}.memory-map-canvas{position:absolute;inset:0;z-index:1}.map-toolbar{position:absolute;z-index:600;top:max(14px,env(safe-area-inset-top));left:14px;right:14px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:11px 13px;border:1px solid rgba(88,65,52,.12);border-radius:22px;background:rgba(255,250,246,.9);backdrop-filter:blur(18px);box-shadow:0 8px 28px rgba(68,48,38,.12)}.map-toolbar>div{text-align:center;min-width:0}.map-toolbar strong{display:block;font-size:15px;font-weight:650}.map-toolbar small{display:block;margin-top:2px;color:#927d72;font-size:11px}.map-back,.map-admin-link{color:#7c5e50;text-decoration:none;font-size:13px;white-space:nowrap}.map-status,.map-empty{position:absolute;z-index:500;left:50%;top:50%;transform:translate(-50%,-50%);padding:16px 20px;border-radius:18px;background:rgba(255,250,246,.92);box-shadow:0 8px 30px rgba(68,48,38,.1);text-align:center}.map-status.error{color:#9b463d}.map-empty span{display:block;font-size:30px;color:#c27d78}.map-empty strong{display:block;margin-top:4px}.map-empty p{margin:5px 0 0;color:#917b70;font-size:13px}.map-memory-sheet{position:absolute;z-index:650;left:14px;right:14px;bottom:max(14px,env(safe-area-inset-bottom));display:grid;grid-template-columns:112px 1fr;gap:14px;max-width:620px;margin:0 auto;padding:10px;border-radius:24px;background:rgba(255,250,246,.96);backdrop-filter:blur(22px);box-shadow:0 16px 48px rgba(64,43,34,.2);border:1px solid rgba(100,74,60,.1)}.map-memory-sheet>img{width:112px;height:126px;object-fit:cover;border-radius:18px}.sheet-copy{min-width:0;padding:6px 34px 6px 0}.sheet-meta{display:flex;gap:8px;flex-wrap:wrap;color:#a0796b;font-size:11px}.sheet-copy h2{margin:7px 0 5px;font-size:18px;font-weight:650;line-height:1.25}.sheet-copy p{display:-webkit-box;overflow:hidden;margin:0 0 6px;color:#69574e;font-size:13px;line-height:1.5;-webkit-line-clamp:3;-webkit-box-orient:vertical}.sheet-copy small{color:#ab9589;font-size:11px}.sheet-close{position:absolute;right:12px;top:10px;width:30px;height:30px;border:0;border-radius:50%;background:#efe5df;color:#795e52;font-size:20px}.sheet-nav{position:absolute;right:12px;bottom:10px;display:flex;align-items:center;gap:7px;color:#8c7469;font-size:11px}.sheet-nav button{width:26px;height:26px;border:0;border-radius:50%;background:#efe5df;color:#74594e;font-size:19px;line-height:1}.memory-sheet-enter-active,.memory-sheet-leave-active{transition:.25s ease}.memory-sheet-enter-from,.memory-sheet-leave-to{opacity:0;transform:translateY(24px)}:global(.leaflet-control-attribution){font-size:9px!important;background:rgba(255,255,255,.65)!important}:global(.memory-map-marker-wrap){background:transparent!important;border:0!important}:global(.memory-map-marker){position:relative;width:42px;height:42px;border:0;border-radius:50% 50% 50% 14px;transform:rotate(-45deg);background:#bf6d70;color:white;box-shadow:0 5px 16px rgba(94,51,53,.3)}:global(.memory-map-marker span){display:block;transform:rotate(45deg);font-size:19px}:global(.memory-map-marker b){position:absolute;right:-5px;top:-5px;display:grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:10px;background:#fff7f2;color:#9e5e60;font:600 10px/1 sans-serif;transform:rotate(45deg);box-shadow:0 2px 7px rgba(60,40,30,.18)}@media(max-width:520px){.map-memory-sheet{grid-template-columns:92px 1fr}.map-memory-sheet>img{width:92px;height:116px}.sheet-copy h2{font-size:16px}.sheet-copy p{-webkit-line-clamp:2}}
</style>
