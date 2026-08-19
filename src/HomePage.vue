<script setup>
import { computed, onMounted, ref } from 'vue'

const RELATIONSHIP_START_DATE = '2026-04-10'

const memories = ref([])
const loading = ref(true)
const errorMessage = ref('')

const today = getTodayISOInTaipei()
const relationshipDays = computed(() => daysBetweenInclusive(RELATIONSHIP_START_DATE, today))
const thirtyDaysAgo = computed(() => addDays(today, -30))
const thirtyDaysAgoMemory = computed(() => {
  return memories.value.find((memory) => normalizeDate(memory.memory_date) === thirtyDaysAgo.value) || null
})
const memoryCount = computed(() => memories.value.length)
const photoCount = computed(() => {
  return memories.value.reduce((total, memory) => total + getImageUrls(memory).length, 0)
})
const thirtyDaysAgoImage = computed(() => {
  const memory = thirtyDaysAgoMemory.value
  if (!memory) return ''
  const thumbs = Array.isArray(memory.thumbnail_urls) ? memory.thumbnail_urls : []
  const images = getImageUrls(memory)
  return thumbs.find((value) => typeof value === 'string' && value.trim()) || images[0] || ''
})

onMounted(loadMemories)

async function loadMemories() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await fetch('/api/memories')
    const data = await response.json().catch(() => [])
    if (!response.ok) throw new Error(data?.error || '讀取回憶失敗')
    memories.value = Array.isArray(data) ? data : []
  } catch (error) {
    errorMessage.value = error?.message || '讀取回憶失敗'
  } finally {
    loading.value = false
  }
}

function getImageUrls(memory) {
  if (Array.isArray(memory?.image_urls)) return memory.image_urls.filter(Boolean)
  return memory?.image_url ? [memory.image_url] : []
}

function normalizeDate(value) {
  return value ? String(value).slice(0, 10) : ''
}

function parseDateOnly(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

function daysBetweenInclusive(start, end) {
  const startDate = parseDateOnly(start)
  const endDate = parseDateOnly(end)
  return Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
}

function addDays(value, amount) {
  const date = parseDateOnly(value)
  date.setDate(date.getDate() + amount)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function getTodayISOInTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const get = (type, fallback) => parts.find((part) => part.type === type)?.value ?? fallback
  return `${get('year', '1970')}-${get('month', '01')}-${get('day', '01')}`
}

function formatDate(value) {
  const date = parseDateOnly(normalizeDate(value))
  return new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric' }).format(date)
}
</script>

<template>
  <main class="home-page">
    <header class="home-topbar">
      <span class="home-brand">我們的日常</span>
      <a href="/app">進入日常 →</a>
    </header>

    <section class="days-card">
      <span class="heart">♡</span>
      <p>在一起</p>
      <h1>第 {{ relationshipDays }} 天</h1>
      <small>{{ today.replaceAll('-', '.') }}</small>
    </section>

    <section class="memory-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">30 天前的今天</p>
          <small>{{ thirtyDaysAgo.replaceAll('-', '.') }}</small>
        </div>
      </div>

      <div v-if="loading" class="quiet">正在翻找回憶…</div>
      <div v-else-if="errorMessage" class="quiet">{{ errorMessage }}</div>
      <button
        v-else-if="thirtyDaysAgoMemory"
        class="memory-preview"
        type="button"
        @click="window.location.href = '/app'"
      >
        <img v-if="thirtyDaysAgoImage" :src="thirtyDaysAgoImage" alt="30 天前的回憶" loading="lazy" decoding="async" />
        <div class="memory-copy">
          <span>{{ formatDate(thirtyDaysAgoMemory.memory_date) }}</span>
          <strong>{{ thirtyDaysAgoMemory.title }}</strong>
          <p v-if="thirtyDaysAgoMemory.story">{{ thirtyDaysAgoMemory.story }}</p>
        </div>
      </button>
      <div v-else class="quiet">這一天還沒有留下回憶。</div>
    </section>

    <section class="stats-card">
      <p class="eyebrow">我們累積了</p>
      <div class="stats-grid">
        <div>
          <strong>{{ memoryCount }}</strong>
          <span>段回憶</span>
        </div>
        <div>
          <strong>{{ photoCount }}</strong>
          <span>張照片</span>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  width: min(820px, calc(100% - 28px));
  margin: 0 auto;
  padding: 28px 0 70px;
}

.home-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding: 0 4px;
}

.home-brand {
  color: #4f5947;
  font-family: 'Palatino Linotype', 'Book Antiqua', serif;
  font-size: 1.04rem;
  font-weight: 600;
}

.home-topbar a {
  color: #5a5c54;
  text-decoration: none;
  font-size: .9rem;
}

.days-card,
.memory-card,
.stats-card {
  border: 1px solid rgba(255, 255, 255, .82);
  background: rgba(255, 252, 247, .88);
  box-shadow: 0 16px 40px rgba(60, 58, 49, .08);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.days-card {
  position: relative;
  overflow: hidden;
  padding: clamp(42px, 9vw, 78px) 28px;
  border-radius: 32px;
  text-align: center;
}

.days-card::after {
  content: '';
  position: absolute;
  width: 220px;
  height: 220px;
  right: -95px;
  top: -105px;
  border-radius: 50%;
  background: rgba(102, 114, 91, .08);
}

.heart {
  display: block;
  margin-bottom: 8px;
  color: #66725b;
  font-size: 2rem;
}

.days-card p {
  margin: 0;
  color: #5a5c54;
  font-size: .95rem;
  letter-spacing: .12em;
}

.days-card h1 {
  margin: 5px 0 10px;
  font-family: 'Palatino Linotype', 'Book Antiqua', serif;
  font-size: clamp(3.15rem, 12vw, 6.2rem);
  font-weight: 500;
  line-height: 1;
  letter-spacing: -.055em;
  color: #2f312c;
}

.days-card small,
.section-head small {
  color: #7b7d74;
}

.memory-card,
.stats-card {
  margin-top: 16px;
  padding: 20px;
  border-radius: 26px;
}

.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 14px;
}

.eyebrow {
  margin: 0 0 4px;
  color: #4f5947;
  font-family: 'Palatino Linotype', 'Book Antiqua', serif;
  font-size: 1.25rem;
  font-weight: 600;
}

.memory-preview {
  display: grid;
  grid-template-columns: minmax(120px, 42%) 1fr;
  gap: 16px;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 20px;
  overflow: hidden;
  background: rgba(244, 240, 232, .72);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.memory-preview img {
  width: 100%;
  height: 100%;
  min-height: 170px;
  object-fit: cover;
}

.memory-copy {
  align-self: center;
  padding: 18px 18px 18px 0;
}

.memory-copy span {
  color: #7b7d74;
  font-size: .8rem;
}

.memory-copy strong {
  display: block;
  margin-top: 5px;
  font-family: 'Palatino Linotype', 'Book Antiqua', serif;
  font-size: 1.45rem;
  line-height: 1.25;
}

.memory-copy p {
  display: -webkit-box;
  margin: 8px 0 0;
  overflow: hidden;
  color: #5a5c54;
  font-size: .9rem;
  line-height: 1.55;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.quiet {
  padding: 26px 4px 12px;
  color: #7b7d74;
  text-align: center;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.stats-grid > div {
  padding: 22px 18px;
  border-radius: 20px;
  background: rgba(244, 240, 232, .72);
  text-align: center;
}

.stats-grid strong {
  display: block;
  font-family: 'Palatino Linotype', 'Book Antiqua', serif;
  font-size: clamp(2.35rem, 8vw, 3.7rem);
  font-weight: 500;
  line-height: 1;
}

.stats-grid span {
  display: block;
  margin-top: 8px;
  color: #66685f;
  font-size: .86rem;
}

@media (max-width: 560px) {
  .home-page { padding-top: 18px; }
  .days-card { border-radius: 26px; }
  .memory-card, .stats-card { padding: 15px; border-radius: 22px; }
  .memory-preview { grid-template-columns: 1fr; gap: 0; }
  .memory-preview img { max-height: 280px; min-height: 0; aspect-ratio: 16 / 10; }
  .memory-copy { padding: 15px; }
}
</style>
