<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const locations = ref([])
const loading = ref(true)
const errorMessage = ref('')
const selected = ref(null)
const memoryModalOpen = ref(false)
const mapElement = ref(null)
let map = null
let markerLayer = null

const memoryImages = computed(() => {
  if (!selected.value) return []
  const urls = Array.isArray(selected.value.image_urls) ? selected.value.image_urls.filter(Boolean) : []
  return urls.length ? urls : selected.value.memory_cover_url ? [selected.value.memory_cover_url] : []
})

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
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
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 21, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    markerLayer = window.L.layerGroup().addTo(map)
  }

  markerLayer.clearLayers()
  const bounds = []
  for (const item of locations.value) {
    const lat = Number(item.latitude)
    const lng = Number(item.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    bounds.push([lat, lng])
    const imageUrl = escapeHtml(item.thumbnail_url || item.image_url)
    const label = escapeHtml(item.title || '照片')
    const icon = window.L.divIcon({
      className: 'photo-map-marker-wrap',
      html: `<div class="photo-map-marker" role="img" aria-label="${label}"><img src="${imageUrl}" alt="" /></div>`,
      iconSize: [68, 68], iconAnchor: [34, 68]
    })
    const marker = window.L.marker([lat, lng], { icon }).addTo(markerLayer)
    marker.on('click', () => { selected.value = item; memoryModalOpen.value = false; map.panTo([lat, lng], { animate: true, duration: 0.35 }) })
  }
  if (bounds.length === 1) map.setView(bounds[0], 16)
  else if (bounds.length > 1) map.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 })
}

function closePhoto() { selected.value = null; memoryModalOpen.value = false }
function openMemory() { if (selected.value) memoryModalOpen.value = true }
function closeMemory() { memoryModalOpen.value = false }
onMounted(loadLocations)
onUnmounted(() => { if (map) map.remove(); map = null })
</script>

<template>
  <main class="memory-map-page">
    <div class="map-toolbar"><a class="map-back" href="/">← 日常</a><div><strong>我們走過的地方</strong><small>{{ locations.length ? `${locations.length} 張有定位的照片` : '把回憶放回地圖上' }}</small></div><span class="toolbar-spacer" aria-hidden="true"></span></div>
    <div ref="mapElement" class="memory-map-canvas" aria-label="回憶地圖"></div>
    <div v-if="loading" class="map-status">正在打開我們的足跡…</div>
    <div v-else-if="errorMessage" class="map-status error">{{ errorMessage }}</div>
    <div v-else-if="!locations.length" class="map-empty"><span>♡</span><strong>地圖還是空的</strong><p>之後補上照片位置，回憶就會出現在這裡。</p></div>
    <Transition name="photo-sheet"><article v-if="selected" class="map-photo-sheet"><button class="photo-close" type="button" aria-label="關閉" @click="closePhoto">×</button><img :src="selected.image_url" alt="地圖上的照片" /><div class="photo-actions"><div class="photo-meta"><span>{{ String(selected.memory_date || '').slice(0, 10).replaceAll('-', '.') }}</span><span v-if="selected.location_name">{{ selected.location_name }}</span></div><button class="open-memory" type="button" @click="openMemory">查看這段回憶</button></div></article></Transition>
    <Transition name="memory-modal"><div v-if="memoryModalOpen && selected" class="memory-modal-backdrop" @click.self="closeMemory"><article class="memory-modal" role="dialog" aria-modal="true" aria-label="回憶內容"><button class="modal-close" type="button" aria-label="關閉回憶" @click="closeMemory">×</button><div class="modal-head"><span>{{ String(selected.memory_date || '').slice(0, 10).replaceAll('-', '.') }}</span><h2>{{ selected.title }}</h2><p v-if="selected.story">{{ selected.story }}</p></div><div v-if="memoryImages.length" class="memory-photo-grid"><img v-for="url in memoryImages" :key="url" :src="url" alt="回憶照片" loading="lazy" /></div></article></div></Transition>
  </main>
</template>

<style scoped>
.memory-map-page{position:fixed;inset:0;background:#f7f3ee;color:#3b302b;overflow:hidden}.memory-map-canvas{position:absolute;inset:0;z-index:1}.map-toolbar{position:absolute;z-index:600;top:max(14px,env(safe-area-inset-top));left:14px;right:14px;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding:11px 13px;border:1px solid rgba(88,65,52,.12);border-radius:22px;background:rgba(255,250,246,.9);backdrop-filter:blur(18px);box-shadow:0 8px 28px rgba(68,48,38,.12)}.map-toolbar>div{text-align:center;min-width:0}.map-toolbar strong{display:block;font-size:15px;font-weight:650}.map-toolbar small{display:block;margin-top:2px;color:#927d72;font-size:11px}.map-back{color:#7c5e50;text-decoration:none;font-size:13px;white-space:nowrap}.toolbar-spacer{width:38px}.map-status,.map-empty{position:absolute;z-index:500;left:50%;top:50%;transform:translate(-50%,-50%);padding:16px 20px;border-radius:18px;background:rgba(255,250,246,.92);box-shadow:0 8px 30px rgba(68,48,38,.1);text-align:center}.map-status.error{color:#9b463d}.map-empty span{display:block;font-size:30px;color:#c27d78}.map-empty strong{display:block;margin-top:4px}.map-empty p{margin:5px 0 0;color:#917b70;font-size:13px}.map-photo-sheet{position:absolute;z-index:650;left:14px;right:14px;bottom:max(14px,env(safe-area-inset-bottom));max-width:520px;margin:0 auto;padding:10px;border:1px solid rgba(100,74,60,.1);border-radius:24px;background:rgba(255,250,246,.97);backdrop-filter:blur(22px);box-shadow:0 16px 48px rgba(64,43,34,.2)}.map-photo-sheet>img{display:block;width:100%;max-height:56vh;object-fit:contain;border-radius:18px;background:#eee6e0}.photo-close{position:absolute;z-index:2;right:16px;top:16px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(42,32,28,.7);color:white;font-size:22px}.photo-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px 2px}.photo-meta{display:flex;flex-wrap:wrap;gap:7px;color:#967b70;font-size:11px}.open-memory{border:0;border-radius:13px;background:#9f6b62;color:white;padding:9px 13px;font-weight:650;white-space:nowrap}.memory-modal-backdrop{position:absolute;z-index:900;inset:0;display:grid;place-items:center;padding:18px;background:rgba(38,28,24,.45);backdrop-filter:blur(7px)}.memory-modal{position:relative;width:min(680px,100%);max-height:min(82vh,760px);overflow:auto;border:1px solid rgba(100,74,60,.12);border-radius:26px;background:#fffaf6;box-shadow:0 24px 70px rgba(44,30,25,.28)}.modal-close{position:sticky;z-index:2;float:right;right:14px;top:14px;margin:14px 14px 0 0;width:34px;height:34px;border:0;border-radius:50%;background:#efe4dd;color:#76584d;font-size:22px}.modal-head{padding:24px 24px 16px}.modal-head>span{color:#a17f72;font-size:12px}.modal-head h2{margin:5px 44px 8px 0;font-size:24px;line-height:1.25}.modal-head p{white-space:pre-wrap;margin:0;color:#68564d;font-size:14px;line-height:1.7}.memory-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 14px 14px}.memory-photo-grid img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:15px;background:#eee6e0}.photo-sheet-enter-active,.photo-sheet-leave-active,.memory-modal-enter-active,.memory-modal-leave-active{transition:.22s ease}.photo-sheet-enter-from,.photo-sheet-leave-to{opacity:0;transform:translateY(22px)}.memory-modal-enter-from,.memory-modal-leave-to{opacity:0}:global(.leaflet-control-attribution){font-size:9px!important;background:rgba(255,255,255,.65)!important}:global(.photo-map-marker-wrap){width:68px!important;height:68px!important;background:transparent!important;border:0!important;overflow:visible!important}:global(.photo-map-marker){box-sizing:border-box;display:block;width:68px;height:68px;padding:3px;border:3px solid #fff;border-radius:17px;background:#ddd0c9;box-shadow:0 7px 20px rgba(54,37,30,.34);overflow:hidden;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}:global(.photo-map-marker:hover){transform:translateY(-2px) scale(1.05);box-shadow:0 10px 25px rgba(54,37,30,.4)}:global(.photo-map-marker img){display:block;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important;border-radius:12px!important;background:#ddd0c9!important;pointer-events:none}@media(max-width:520px){.map-photo-sheet{left:10px;right:10px;bottom:max(10px,env(safe-area-inset-bottom))}.map-photo-sheet>img{max-height:52vh}.memory-photo-grid{grid-template-columns:1fr 1fr}.modal-head h2{font-size:21px}}
</style>
