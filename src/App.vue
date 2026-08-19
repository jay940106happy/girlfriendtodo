<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

const todoForm = reactive({ id: null, todo: '', note: '', due_date: '' })
const memoryForm = reactive({ id: null, title: '', story: '', memory_date: '', image_urls: [], thumbnail_urls: [] })

const activePage = ref('home')
const TODO_CACHE_KEY = 'girlfriendtodo_todos_cache_v1'
const RELATIONSHIP_START_DATE = '2026-04-10'
const todos = ref(readTodoCache())
const memories = ref([])
const todosLoading = ref(todos.value.length === 0)
const memoriesLoading = ref(true)
const submittingTodo = ref(false)
const submittingMemory = ref(false)
const uploadingImage = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')
const composerOpen = ref(false)
const menuOpenId = ref(null)
const detailMemory = ref(null)
const pendingTodoToMove = ref(null)
const todosFetchDone = ref(false)
const memoriesFetchDone = ref(false)
const demoDataApplied = ref(false)
const memoriesFetchStarted = ref(false)
const memoryVisibleCount = ref(20)
const MEMORY_PAGE_SIZE = 20
const UPLOAD_RETRY_ATTEMPTS = 3
const UPLOAD_TIMEOUT_MS = 25000
const UPLOAD_MAX_DIMENSION = 1920
const UPLOAD_TARGET_BYTES = 1200 * 1024
const UPLOAD_MIN_QUALITY = 0.6
const FIREFLY_COUNT = 38
const BIRTHDAY_EVENTS = [
  { month: 1, day: 6, title: '曜生日', story: '生日' },
  { month: 5, day: 22, title: '卿生日', story: '生日' }
]
const VALENTINE_EVENTS = [
  { month: 1, day: 14, title: '日記情人節' }, { month: 2, day: 14, title: '西洋情人節' },
  { month: 3, day: 14, title: '白色情人節' }, { month: 4, day: 14, title: '黑色情人節' },
  { month: 5, day: 14, title: '玫瑰情人節' }, { month: 5, day: 20, title: '網路情人節' },
  { month: 6, day: 14, title: '親吻情人節' }, { month: 7, day: 14, title: '銀色情人節' },
  { month: 8, day: 14, title: '綠色情人節' }, { month: 9, day: 14, title: '音樂情人節' },
  { month: 10, day: 14, title: '葡萄酒情人節' }, { month: 11, day: 14, title: '電影情人節' },
  { month: 12, day: 14, title: '擁抱情人節' }
]

const totalMemoryCount = computed(() => memories.value.length)
const totalPhotoCount = computed(() => memories.value.reduce((sum, memory) => sum + (memory.image_urls?.length ?? 0), 0))
const relationshipDayCount = computed(() => {
  const start = parseDateOnly(RELATIONSHIP_START_DATE)
  const today = parseDateOnly(getTodayISOInTaipei())
  if (!start || !today || today < start) return 0
  return Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
})
const thirtyDaysAgoDate = computed(() => shiftDate(getTodayISOInTaipei(), -30))
const thirtyDaysAgoMemories = computed(() => memoriesByDate.value.get(thirtyDaysAgoDate.value) ?? [])
const visibleMemories = computed(() => memories.value.slice(0, memoryVisibleCount.value))
const hasMoreMemories = computed(() => memoryVisibleCount.value < memories.value.length)
const pageTitle = computed(() => activePage.value === 'todos' ? '待辦' : '回憶')
const isEditingMemory = computed(() => Boolean(memoryForm.id))
const isEditingTodo = computed(() => Boolean(todoForm.id))
const calendarMonth = ref(getTodayISOInTaipei().slice(0, 7))
const selectedCalendarDate = ref(getTodayISOInTaipei())
const celebrationActive = ref(false)
const celebrationTitle = ref('')
const celebrationSubtitle = ref('')
const fireflyParticles = ref([])
const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']
let celebrationTimerId = null

const memoriesByDate = computed(() => {
  const map = new Map()
  for (const memory of memories.value) {
    if (!memory.memory_date) continue
    const key = String(memory.memory_date).slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(memory)
  }
  return map
})
const todosByDate = computed(() => {
  const map = new Map()
  for (const todo of todos.value) {
    if (!todo?.due_date) continue
    const key = String(todo.due_date).slice(0, 10)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(todo)
  }
  return map
})
const calendarDays = computed(() => {
  const [year, month] = calendarMonth.value.split('-').map(Number)
  if (!year || !month) return []
  const firstDate = new Date(year, month - 1, 1)
  const firstWeekday = (firstDate.getDay() + 6) % 7
  const totalDays = new Date(year, month, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + totalDays) / 7) * 7
  const startDate = new Date(year, month - 1, 1 - firstWeekday)
  return Array.from({ length: cellCount }, (_, index) => {
    const current = new Date(startDate)
    current.setDate(startDate.getDate() + index)
    const date = `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`
    const dayItems = getCalendarItemsByDate(date)
    const previewItems = dayItems.slice(0, 2)
    return { date, day: current.getDate(), inMonth: current.getMonth() === month - 1, eventCount: dayItems.length, previewItems, hiddenCount: Math.max(0, dayItems.length - previewItems.length) }
  })
})
const selectedCalendarItems = computed(() => selectedCalendarDate.value ? getCalendarItemsByDate(selectedCalendarDate.value) : [])
const calendarMonthLabel = computed(() => {
  const [year, month] = calendarMonth.value.split('-').map(Number)
  if (!year || !month) return ''
  return new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1))
})

onMounted(async () => {
  checkCelebrationTrigger()
  fetchTodos().catch(console.error).finally(() => {
    todosLoading.value = false
    todosFetchDone.value = true
    maybeApplyDemoData()
  })
  startMemoriesFetch()
})

onUnmounted(() => {
  if (celebrationTimerId) clearTimeout(celebrationTimerId)
})

watch(activePage, (nextPage) => {
  if (nextPage === 'home' || nextPage === 'memories' || nextPage === 'calendar') startMemoriesFetch()
  if (nextPage === 'memories') memoryVisibleCount.value = MEMORY_PAGE_SIZE
})

async function fetchTodos() {
  const response = await fetch('/api/todos')
  const data = await response.json().catch(() => [])
  if (!response.ok) return handleError('讀取代辦失敗。', data)
  todos.value = (data ?? []).map(normalizeTodo)
  writeTodoCache(todos.value)
}

async function fetchMemories() {
  const response = await fetch('/api/memories')
  const data = await response.json().catch(() => [])
  if (!response.ok) return handleError('讀取回憶失敗。', data)
  memories.value = (data ?? []).map(normalizeMemory)
  memoryVisibleCount.value = MEMORY_PAGE_SIZE
}

function startMemoriesFetch() {
  if (memoriesFetchStarted.value) return
  memoriesFetchStarted.value = true
  memoriesLoading.value = true
  fetchMemories().catch(console.error).finally(() => {
    memoriesLoading.value = false
    memoriesFetchDone.value = true
    maybeApplyDemoData()
  })
}

function normalizeMemory(memory) {
  const imageUrls = Array.isArray(memory.image_urls)
    ? memory.image_urls.filter((v) => typeof v === 'string').map((v) => v.trim()).filter((v) => v && /^https?:\/\//.test(v))
    : memory.image_url ? [String(memory.image_url).trim()].filter((v) => v && /^https?:\/\//.test(v)) : []
  const rawThumbs = Array.isArray(memory.thumbnail_urls) ? memory.thumbnail_urls : []
  const thumbnailUrls = imageUrls.map((url, index) => {
    const thumb = typeof rawThumbs[index] === 'string' ? rawThumbs[index].trim() : ''
    return /^https?:\/\//.test(thumb) ? thumb : url
  })
  return { ...memory, memory_date: normalizeDateInputValue(memory.memory_date), image_urls: imageUrls, thumbnail_urls: thumbnailUrls }
}

function normalizeTodo(todo) { return { ...todo, due_date: normalizeDateInputValue(todo?.due_date) } }
function normalizeDateInputValue(value) {
  if (!value) return ''
  const text = String(value).trim()
  if (!text) return ''
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const slash = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (slash) return `${slash[1]}-${pad2(Number(slash[2]))}-${pad2(Number(slash[3]))}`
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`
}

function getCalendarItemsByDate(date) {
  const items = []
  const [year, month, day] = String(date).split('-').map(Number)
  if (!year || !month || !day) return items
  for (const event of VALENTINE_EVENTS) if (event.month === month && event.day === day) items.push({ type: 'festival', title: event.title, story: '情人節' })
  for (const event of BIRTHDAY_EVENTS) if (event.month === month && event.day === day) items.push({ type: 'birthday', title: event.title, story: event.story })
  items.push(...getRelationshipEvents(date))
  for (const todo of todosByDate.value.get(date) ?? []) items.push({ type: 'todo', title: todo.todo, story: todo.note ?? '' })
  for (const memory of memoriesByDate.value.get(date) ?? []) items.push({ type: 'memory', title: memory.title, story: memory.story ?? '', memory })
  return items
}

function getRelationshipEvents(date) {
  const events = []
  const start = parseDateOnly(RELATIONSHIP_START_DATE)
  const current = parseDateOnly(date)
  if (!start || !current) return events
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000) + 1
  if (diffDays >= 100 && diffDays % 100 === 0) events.push({ type: 'anniversary', title: `交往第 ${diffDays} 天`, story: '交往百日紀念' })
  if (current.getMonth() === start.getMonth() && current.getDate() === start.getDate() && current >= start) {
    const years = current.getFullYear() - start.getFullYear()
    events.push({ type: 'anniversary', title: years === 0 ? '交往開始紀念日' : `交往 ${years} 週年`, story: '每年紀念' })
  }
  return events
}

function checkCelebrationTrigger() {
  const params = new URLSearchParams(window.location.search)
  const forcedName = (params.get('celebrate') ?? '').trim()
  const forcedDays = Number(params.get('celebrate_days') ?? '')
  if (Number.isFinite(forcedDays) && forcedDays > 0) return triggerCelebration(`在一起的第 ${forcedDays} 天`, '網址測試觸發')
  if (forcedName) return triggerCelebration(`${forcedName}快樂`, '網址測試觸發')
  const candidates = getCalendarItemsByDate(getTodayISOInTaipei()).filter((item) => ['birthday', 'anniversary', 'festival'].includes(item.type))
  if (!candidates.length) return
  const selected = chooseCelebrationEvent(candidates)
  const isDayMilestone = selected.type === 'anniversary' && selected.title.includes('交往第 ')
  triggerCelebration(isDayMilestone ? selected.title.replace('交往第 ', '在一起的第 ') : `${selected.title}快樂`, selected.story ?? '今天是特別的一天')
}
function chooseCelebrationEvent(items) {
  const priority = { birthday: 3, anniversary: 2, festival: 1 }
  return [...items].sort((a, b) => (priority[b.type] ?? 0) - (priority[a.type] ?? 0))[0]
}
function triggerCelebration(title, subtitle) {
  celebrationTitle.value = title
  celebrationSubtitle.value = subtitle
  fireflyParticles.value = generateFireflyParticles(FIREFLY_COUNT)
  celebrationActive.value = true
  if (celebrationTimerId) clearTimeout(celebrationTimerId)
  celebrationTimerId = setTimeout(() => { celebrationActive.value = false }, 6000)
}
function generateFireflyParticles(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `f-${index}-${Date.now()}`, size: `${6 + Math.random() * 11}px`, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`,
    duration: `${4.8 + Math.random() * 4.6}s`, delay: `${Math.random() * 1.5}s`, moveX1: `${-24 + Math.random() * 48}px`, moveY1: `${-24 + Math.random() * 48}px`,
    moveX2: `${-40 + Math.random() * 80}px`, moveY2: `${-40 + Math.random() * 80}px`, twinkle: `${0.9 + Math.random() * 1.6}s`
  }))
}
function getTodayISOInTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type, fallback) => parts.find((p) => p.type === type)?.value ?? fallback
  return `${get('year','1970')}-${get('month','01')}-${get('day','01')}`
}
function shiftDate(value, days) {
  const date = parseDateOnly(value)
  if (!date) return ''
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}
function getHomeMemoryImage(memory) {
  return memory?.thumbnail_urls?.[0] || memory?.image_urls?.[0] || ''
}

function openTodoComposer(todo = null) {
  composerOpen.value = true; menuOpenId.value = null
  Object.assign(todoForm, { id: todo?.id ?? null, todo: todo?.todo ?? '', note: todo?.note ?? '', due_date: todo?.due_date ?? '' })
  statusMessage.value = ''; errorMessage.value = ''
}
function openMemoryComposer(memory = null) {
  composerOpen.value = true; statusMessage.value = ''; errorMessage.value = ''; menuOpenId.value = null; pendingTodoToMove.value = null
  if (memory) {
    Object.assign(memoryForm, { id: memory.id, title: memory.title ?? '', story: memory.story ?? '', memory_date: memory.memory_date ?? '', image_urls: [...(memory.image_urls ?? [])], thumbnail_urls: [...(memory.thumbnail_urls ?? memory.image_urls ?? [])] })
  } else {
    Object.assign(memoryForm, { id: null, title: '', story: '', memory_date: '', image_urls: [], thumbnail_urls: [] })
  }
  activePage.value = 'memories'
}
function closeComposer() { composerOpen.value = false; todoForm.id = null; memoryForm.id = null; pendingTodoToMove.value = null }
function toggleMenu(memoryId) { menuOpenId.value = menuOpenId.value === memoryId ? null : memoryId }
function openMemoryDetail(memory) { detailMemory.value = memory; menuOpenId.value = null }
function closeMemoryDetail() { detailMemory.value = null }

async function addTodo() {
  if (!todoForm.todo.trim()) return errorMessage.value = '先寫下一件想一起完成的小事吧。'
  submittingTodo.value = true; errorMessage.value = ''
  const payload = { todo: todoForm.todo.trim(), note: todoForm.note.trim() || null, due_date: todoForm.due_date || null }
  const response = await fetch('/api/todos', { method: isEditingTodo.value ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isEditingTodo.value ? { id: todoForm.id, ...payload } : payload) })
  const data = await response.json().catch(() => ({})); submittingTodo.value = false
  if (!response.ok) return handleError(isEditingTodo.value ? '更新待辦失敗。' : '新增代辦失敗。', data)
  closeComposer(); statusMessage.value = isEditingTodo.value ? '待辦已更新。' : '已加入新的待辦。'; await fetchTodos()
}
function moveTodoToMemory(todo) { openMemoryComposer(); pendingTodoToMove.value = todo; memoryForm.title = todo.todo ?? ''; memoryForm.story = todo.note ?? ''; memoryForm.memory_date = todo.due_date ?? '' }
async function markTodoAsCompleted(todoId) {
  const response = await fetch('/api/todos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: todoId, completed: true }) })
  const data = await response.json().catch(() => ({})); if (!response.ok) throw data
}

async function saveMemory() {
  if (!memoryForm.title.trim()) return errorMessage.value = '回憶標題要填寫。'
  submittingMemory.value = true; errorMessage.value = ''
  const payload = { title: memoryForm.title.trim(), story: memoryForm.story.trim(), memory_date: memoryForm.memory_date || null, image_urls: memoryForm.image_urls, thumbnail_urls: memoryForm.thumbnail_urls }
  const response = await fetch('/api/memories', { method: isEditingMemory.value ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(isEditingMemory.value ? { id: memoryForm.id, ...payload } : payload) })
  const data = await response.json().catch(() => ({})); submittingMemory.value = false
  if (!response.ok) return handleError(isEditingMemory.value ? '更新回憶失敗。' : '新增回憶失敗。', data)
  const movingTodoId = !isEditingMemory.value ? pendingTodoToMove.value?.id : null
  const shouldMark = !isEditingMemory.value && pendingTodoToMove.value && !pendingTodoToMove.value.is_demo
  let moveFailed = false
  if (shouldMark && movingTodoId) try { await markTodoAsCompleted(movingTodoId) } catch (e) { moveFailed = true; console.error(e); errorMessage.value = '回憶已儲存，但移動待辦失敗，請稍後重試。' }
  closeComposer()
  if (shouldMark && movingTodoId && !moveFailed) { statusMessage.value = '已移動到回憶。'; activePage.value = 'memories'; await Promise.all([fetchTodos(), fetchMemories()]); return }
  statusMessage.value = isEditingMemory.value ? '回憶已更新。' : '已新增回憶。'; await fetchMemories()
}

async function removeMemory(memory) {
  if (!window.confirm(`確定要刪除「${memory.title}」嗎？`)) return
  const response = await fetch('/api/memories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: memory.id }) })
  if (!response.ok) return handleError('刪除回憶失敗。', await response.json().catch(() => ({})))
  if (memoryForm.id === memory.id) closeComposer(); if (detailMemory.value?.id === memory.id) closeMemoryDetail()
  menuOpenId.value = null; statusMessage.value = '已刪除回憶。'; await fetchMemories()
}

async function uploadImages(event) {
  const files = Array.from(event.target.files ?? []); if (!files.length) return
  uploadingImage.value = true; errorMessage.value = ''; statusMessage.value = ''
  try {
    const uploaded = []; let failedCount = 0
    for (const file of files) {
      try { const prepared = await prepareImageForUpload(file); uploaded.push(await uploadImageWithRetry(prepared)) }
      catch (error) { failedCount += 1; console.error(error) }
    }
    if (uploaded.length) {
      memoryForm.image_urls = [...memoryForm.image_urls, ...uploaded.map((x) => x.url)]
      memoryForm.thumbnail_urls = [...memoryForm.thumbnail_urls, ...uploaded.map((x) => x.thumbnail_url || x.url)]
    }
    if (failedCount > 0 && uploaded.length > 0) statusMessage.value = `已上傳 ${uploaded.length} 張，另有 ${failedCount} 張失敗，請重試失敗的照片。`
    else if (failedCount > 0) handleError('圖片上傳失敗，請稍後重試。', { failedCount })
    event.target.value = ''
  } finally { uploadingImage.value = false }
}
async function uploadImageWithRetry(file) {
  let lastError = null
  for (let attempt = 1; attempt <= UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try { return await uploadSingleImage(file) } catch (error) { lastError = error; if (attempt < UPLOAD_RETRY_ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 700)) }
  }
  throw lastError ?? new Error('Unknown upload error')
}
async function prepareImageForUpload(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(1, UPLOAD_MAX_DIMENSION / Math.max(image.width, image.height))
    const targetWidth = Math.max(1, Math.round(image.width * scale)); const targetHeight = Math.max(1, Math.round(image.height * scale))
    if (scale === 1 && file.size <= UPLOAD_TARGET_BYTES) return file
    const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight
    const context = canvas.getContext('2d'); if (!context) return file
    context.drawImage(image, 0, 0, targetWidth, targetHeight)
    let quality = 0.85; let blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    while (blob && blob.size > UPLOAD_TARGET_BYTES && quality > UPLOAD_MIN_QUALITY) { quality = Math.max(UPLOAD_MIN_QUALITY, quality - 0.08); blob = await canvasToBlob(canvas, 'image/jpeg', quality) }
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch (error) { console.error(error); return file } finally { URL.revokeObjectURL(objectUrl) }
}
function loadImage(objectUrl) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Image decode failed')); image.src = objectUrl }) }
function canvasToBlob(canvas, type, quality) { return new Promise((resolve) => canvas.toBlob(resolve, type, quality)) }
async function uploadSingleImage(file) {
  const formData = new FormData(); formData.append('file', file)
  const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData, signal: controller.signal })
    const data = await response.json().catch(() => ({})); if (!response.ok || !data.url) throw new Error(data?.error || 'Upload request failed')
    return { url: data.url, thumbnail_url: data.thumbnail_url || data.url }
  } finally { clearTimeout(timeoutId) }
}
function removeImage(index) { memoryForm.image_urls.splice(index, 1); memoryForm.thumbnail_urls.splice(index, 1) }
function getPreviewImages(memory) { return (memory.thumbnail_urls?.length ? memory.thumbnail_urls : memory.image_urls ?? []).slice(0, 4) }
function getHiddenImageCount(memory) { return Math.max(0, (memory.image_urls?.length ?? 0) - 4) }
function loadMoreMemories() { memoryVisibleCount.value = Math.min(memories.value.length, memoryVisibleCount.value + MEMORY_PAGE_SIZE) }

async function removeTodo(todo) {
  if (!window.confirm(`確定要刪除待辦「${todo.todo}」嗎？`)) return
  const response = await fetch('/api/todos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: todo.id }) })
  if (!response.ok) return handleError('刪除待辦失敗。', await response.json().catch(() => ({})))
  if (todoForm.id === todo.id) closeComposer(); menuOpenId.value = null; statusMessage.value = '待辦已刪除。'; await fetchTodos()
}
function getCalendarDetailImages(item) {
  if (item.type !== 'memory') return []
  const memory = item.memory
  return (memory?.thumbnail_urls?.length ? memory.thumbnail_urls : memory?.image_urls ?? []).slice(0, 6)
}
function getCalendarItemTypeLabel(type) { return type === 'anniversary' ? '紀念日' : type === 'festival' ? '情人節' : type === 'birthday' ? '生日' : type === 'todo' ? '待辦' : '回憶' }
function handleError(message, error) { statusMessage.value = ''; errorMessage.value = message; console.error(error) }
function formatDate(value) { return value ? new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '' }
function parseDateOnly(value) { if (!value) return null; const [y,m,d] = String(value).split('-').map(Number); return y && m && d ? new Date(y,m-1,d) : null }
function pad2(value) { return String(value).padStart(2, '0') }
function shiftCalendarMonth(offset) {
  const [year, month] = calendarMonth.value.split('-').map(Number); const next = new Date(year, month - 1 + offset, 1)
  calendarMonth.value = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`
  const today = getTodayISOInTaipei(); if (selectedCalendarDate.value.slice(0, 7) !== calendarMonth.value) selectedCalendarDate.value = `${calendarMonth.value}-01`; if (calendarMonth.value === today.slice(0, 7)) selectedCalendarDate.value = today
}
function selectCalendarDate(date) { selectedCalendarDate.value = date }
function readTodoCache() { try { const raw = localStorage.getItem(TODO_CACHE_KEY); if (!raw) return []; const data = JSON.parse(raw); return Array.isArray(data) ? data.map(normalizeTodo) : [] } catch { return [] } }
function maybeApplyDemoData() {
  if (demoDataApplied.value || !todosFetchDone.value || !memoriesFetchDone.value || todos.value.length || memories.value.length) return
  todos.value = [{ id: 'demo-todo-1', todo: '一起去看海邊日落', note: '帶野餐墊和保溫瓶', due_date: '2026-05-03', is_demo: true }, { id: 'demo-todo-2', todo: '挑一間新咖啡店約會', note: '拍一張店門口合照', due_date: null, is_demo: true }]
  memories.value = [{ id: 'demo-memory-1', title: '第一次一起騎車夜遊', story: '從河堤一路騎到橋邊，風很涼，聊到不想回家。', memory_date: '2026-03-30', image_urls: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80'], thumbnail_urls: ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=560&q=70'] }]
  demoDataApplied.value = true; statusMessage.value = '目前顯示範例資料（因為尚未有待辦與回憶）。'; errorMessage.value = ''
}
function writeTodoCache(nextTodos) { try { localStorage.setItem(TODO_CACHE_KEY, JSON.stringify(nextTodos)) } catch {} }
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--celebration': celebrationActive }">
    <div v-if="celebrationActive" class="celebration-overlay" aria-hidden="true">
      <span v-for="particle in fireflyParticles" :key="particle.id" class="firefly-dot" :style="{ top: particle.top, left: particle.left, width: particle.size, height: particle.size, '--float-duration': particle.duration, '--float-delay': particle.delay, '--move-x1': particle.moveX1, '--move-y1': particle.moveY1, '--move-x2': particle.moveX2, '--move-y2': particle.moveY2, '--twinkle-duration': particle.twinkle }" />
    </div>
    <div v-if="celebrationActive" class="celebration-banner" role="status" aria-live="polite"><p class="celebration-banner__title">{{ celebrationTitle }}</p><p class="celebration-banner__subtitle">{{ celebrationSubtitle }}</p></div>

    <header class="hero-strip">
      <div class="hero-title"><h1>和她的計畫與回憶</h1></div>
      <nav class="page-switcher" aria-label="頁面切換">
        <button class="switch-button" :class="{ active: activePage === 'home' }" type="button" @click="activePage = 'home'">首頁</button>
        <button class="switch-button" :class="{ active: activePage === 'todos' }" type="button" @click="activePage = 'todos'">待辦 {{ todos.length }}</button>
        <button class="switch-button" :class="{ active: activePage === 'memories' }" type="button" @click="activePage = 'memories'">回憶 {{ totalMemoryCount }}</button>
        <button class="switch-button" :class="{ active: activePage === 'calendar' }" type="button" @click="activePage = 'calendar'">月曆</button>
      </nav>
    </header>

    <p v-if="statusMessage" class="toast toast--ok">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="toast toast--error">{{ errorMessage }}</p>

    <main class="content-surface">
      <section v-if="activePage === 'home'" class="home-dashboard">
        <section class="home-hero">
          <span class="home-heart">♡</span>
          <p>我們在一起</p>
          <h2>第 {{ relationshipDayCount }} 天</h2>
          <small>{{ formatDate(getTodayISOInTaipei()) }}</small>
        </section>

        <section class="home-section home-totals">
          <div class="home-section-title"><span>我們累積了</span></div>
          <div class="home-stat-grid">
            <div><strong>{{ relationshipDayCount }}</strong><span>天</span></div>
            <div><strong>{{ totalMemoryCount }}</strong><span>段回憶</span></div>
            <div><strong>{{ totalPhotoCount }}</strong><span>張照片</span></div>
          </div>
        </section>

        <section class="home-section home-past">
          <div class="home-section-title">
            <span>30 天前的今天</span>
            <small>{{ formatDate(thirtyDaysAgoDate) }}</small>
          </div>
          <div v-if="memoriesLoading" class="home-empty">正在翻以前的回憶…</div>
          <div v-else-if="thirtyDaysAgoMemories.length" class="home-memory-list">
            <button v-for="memory in thirtyDaysAgoMemories" :key="memory.id" class="home-memory-card" type="button" @click="openMemoryDetail(memory)">
              <img v-if="getHomeMemoryImage(memory)" :src="getHomeMemoryImage(memory)" :alt="memory.title" loading="lazy" decoding="async" />
              <div>
                <strong>{{ memory.title }}</strong>
                <p v-if="memory.story">{{ memory.story }}</p>
                <span>看看那天 →</span>
              </div>
            </button>
          </div>
          <div v-else class="home-empty">這一天還沒有留下回憶。</div>
        </section>
      </section>

      <section v-else-if="activePage === 'todos'" class="content-list">
        <div v-if="todosLoading" class="quiet-state">讀取中...</div><div v-else-if="!todos.length" class="quiet-state">還沒有待辦</div>
        <article v-for="item in todos" :key="item.id" class="story-card story-card--todo" :class="{ 'story-card--menu-open': menuOpenId === `todo-${item.id}` }">
          <div class="story-card__body"><div class="story-meta story-meta--top"><span>預計：{{ item.due_date ? formatDate(item.due_date) : '未決定' }}</span><div class="memory-menu-wrap" @click.stop><button class="menu-trigger" type="button" @click="toggleMenu(`todo-${item.id}`)">•••</button><div v-if="menuOpenId === `todo-${item.id}`" class="memory-menu"><button type="button" @click="openTodoComposer(item), (menuOpenId = null)">編輯</button><button type="button" @click="moveTodoToMemory(item), (menuOpenId = null)">移動到回憶</button><button type="button" @click="removeTodo(item)">刪除</button></div></div></div><h3>{{ item.todo }}</h3><p v-if="item.note">{{ item.note }}</p></div>
        </article>
      </section>

      <section v-else-if="activePage === 'memories'" class="content-list">
        <div v-if="memoriesLoading" class="quiet-state">讀取中...</div><div v-else-if="!memories.length" class="quiet-state">還沒有回憶</div>
        <article v-for="memory in visibleMemories" :key="memory.id" class="story-card story-card--memory" :class="{ 'story-card--menu-open': menuOpenId === `memory-${memory.id}` }" @click="openMemoryDetail(memory)">
          <div v-if="memory.image_urls.length" class="story-cover story-cover--grid">
            <div v-for="(image, index) in getPreviewImages(memory)" :key="`${memory.id}-preview-${index}`" class="story-grid-item">
              <img :src="image" :alt="memory.title" class="story-image" loading="lazy" decoding="async" />
              <span v-if="index === 3 && getHiddenImageCount(memory) > 0" class="image-count">+{{ getHiddenImageCount(memory) }}</span>
            </div>
          </div>
          <div class="story-card__body"><div class="story-meta story-meta--top"><span v-if="memory.memory_date">{{ formatDate(memory.memory_date) }}</span><div class="memory-menu-wrap" @click.stop><button class="menu-trigger" type="button" @click="toggleMenu(`memory-${memory.id}`)">•••</button><div v-if="menuOpenId === `memory-${memory.id}`" class="memory-menu"><button type="button" @click="openMemoryComposer(memory), (menuOpenId = null)">編輯</button><button type="button" @click="removeMemory(memory)">刪除</button></div></div></div><h3>{{ memory.title }}</h3><p class="memory-excerpt">{{ memory.story || ' ' }}</p></div>
        </article>
        <button v-if="hasMoreMemories" class="primary-button" type="button" @click="loadMoreMemories">載入更多回憶</button>
      </section>

      <section v-else class="content-list calendar-view">
        <div class="calendar-legend"><span class="calendar-chip calendar-chip--festival">節日/生日</span><span class="calendar-chip calendar-chip--todo">待辦</span><span class="calendar-chip calendar-chip--memory">回憶</span></div>
        <div class="calendar-head"><button class="calendar-nav" type="button" @click="shiftCalendarMonth(-1)">‹</button><h3>{{ calendarMonthLabel }}</h3><button class="calendar-nav" type="button" @click="shiftCalendarMonth(1)">›</button></div>
        <div class="calendar-grid calendar-grid--weekday"><div v-for="label in weekdayLabels" :key="label" class="calendar-weekday">{{ label }}</div></div>
        <div class="calendar-grid calendar-grid--days"><button v-for="(dayCell, index) in calendarDays" :key="`${dayCell.date}-${index}`" class="calendar-day" :class="{ 'calendar-day--outside': !dayCell.inMonth, 'calendar-day--has-memory': dayCell.eventCount > 0, 'calendar-day--selected': dayCell.date === selectedCalendarDate }" type="button" @click="selectCalendarDate(dayCell.date)"><span class="calendar-day__num">{{ dayCell.day }}</span><div v-if="dayCell.eventCount > 0" class="calendar-day__events"><p v-for="item in dayCell.previewItems" :key="`${dayCell.date}-${item.type}-${item.title}`" class="calendar-day__event-title" :class="`calendar-day__event-title--${item.type}`">{{ item.title }}</p><p v-if="dayCell.hiddenCount > 0" class="calendar-day__event-more">+{{ dayCell.hiddenCount }} 則</p></div></button></div>
        <div v-if="selectedCalendarDate" class="calendar-memory-panel"><h4>當日詳情：{{ formatDate(selectedCalendarDate) }}</h4><div v-if="selectedCalendarItems.length" class="calendar-memory-list"><article v-for="(item, index) in selectedCalendarItems" :key="`calendar-item-${selectedCalendarDate}-${index}-${item.title}`" class="calendar-memory-item" :class="{ 'calendar-memory-item--memory': item.type === 'memory' }"><p class="calendar-memory-item__type">{{ getCalendarItemTypeLabel(item.type) }}</p><h5>{{ item.title }}</h5><p>{{ item.story || ' ' }}</p><div v-if="item.type === 'memory' && getCalendarDetailImages(item).length" class="calendar-memory-item__gallery"><img v-for="(image, imageIndex) in getCalendarDetailImages(item)" :key="`calendar-detail-${selectedCalendarDate}-${index}-${imageIndex}`" :src="image" :alt="item.title" loading="lazy" decoding="async" /></div></article></div><p v-else class="quiet-state">這天沒有事件</p></div>
      </section>
    </main>

    <button v-if="activePage === 'todos' || activePage === 'memories' || activePage === 'calendar'" class="floating-add" type="button" :aria-label="`新增${pageTitle}`" @click="activePage === 'todos' ? openTodoComposer() : openMemoryComposer()">+</button>

    <div v-if="composerOpen" class="composer-backdrop" @click.self="closeComposer"><section class="composer-sheet"><div class="composer-head"><h2>{{ activePage === 'todos' ? (isEditingTodo ? '編輯待辦' : '新增待辦') : (isEditingMemory ? '編輯回憶' : '新增回憶') }}</h2><button class="close-button" type="button" @click="closeComposer">關閉</button></div>
      <form v-if="activePage === 'todos'" class="composer-form" @submit.prevent="addTodo"><input v-model="todoForm.todo" type="text" placeholder="想一起做什麼" /><label class="date-field"><span class="date-label">預計日期（可選）</span><input v-model="todoForm.due_date" type="date" /><small v-if="!todoForm.due_date" class="date-hint">未選擇時會顯示「未決定」</small></label><textarea v-model="todoForm.note" rows="4" placeholder="留一句話"></textarea><button class="primary-button" type="submit" :disabled="submittingTodo">{{ submittingTodo ? '儲存中...' : '儲存' }}</button></form>
      <form v-else class="composer-form" @submit.prevent="saveMemory"><input v-model="memoryForm.title" type="text" placeholder="回憶標題" /><label class="date-field"><span class="date-label">活動日期（可選）</span><input v-model="memoryForm.memory_date" type="date" /><small v-if="!memoryForm.memory_date" class="date-hint">點日期欄位可選擇日期</small></label><textarea v-model="memoryForm.story" rows="5" placeholder="寫下來"></textarea><label class="upload-box upload-box--sheet"><span>上傳照片</span><input type="file" accept="image/*" multiple @change="uploadImages" /><small>{{ uploadingImage ? '上傳中...' : '可以一次選多張' }}</small></label><div v-if="memoryForm.image_urls.length" class="preview-grid"><div v-for="(image, index) in memoryForm.thumbnail_urls" :key="`${memoryForm.image_urls[index]}-${index}`" class="preview-tile"><img :src="image || memoryForm.image_urls[index]" alt="回憶照片預覽" loading="lazy" /><button class="preview-remove" type="button" @click="removeImage(index)">移除</button></div></div><div class="composer-actions"><button class="primary-button" type="submit" :disabled="submittingMemory || uploadingImage">{{ submittingMemory ? '儲存中...' : '儲存' }}</button></div></form>
    </section></div>

    <div v-if="detailMemory" class="composer-backdrop" @click.self="closeMemoryDetail"><section class="composer-sheet composer-sheet--detail"><div class="composer-head"><div><h2>{{ detailMemory.title }}</h2><p v-if="detailMemory.memory_date" class="detail-date">{{ formatDate(detailMemory.memory_date) }}</p></div><button class="close-button" type="button" @click="closeMemoryDetail">關閉</button></div><div v-if="detailMemory.image_urls.length" class="detail-gallery"><img v-for="(image, index) in detailMemory.image_urls" :key="`${detailMemory.id}-detail-${index}`" :src="image" :alt="detailMemory.title" class="detail-image" loading="lazy" decoding="async" /></div><p class="detail-story">{{ detailMemory.story || '還沒有補上文字。' }}</p></section></div>
  </div>
</template>

<style scoped>
.home-dashboard{width:min(760px,100%);margin:0 auto;display:grid;gap:18px}.home-hero{position:relative;overflow:hidden;padding:54px 24px 48px;border:1px solid rgba(151,108,91,.16);border-radius:30px;background:linear-gradient(145deg,#fffaf6 0%,#f6e9e3 100%);text-align:center;box-shadow:0 18px 50px rgba(91,62,50,.08)}.home-hero::before{content:'♡';position:absolute;right:-18px;top:-54px;font-size:190px;line-height:1;color:rgba(169,112,101,.08);transform:rotate(12deg)}.home-heart{display:block;color:#aa7469;font-size:27px;line-height:1}.home-hero p{margin:12px 0 2px;color:#92766b;font-size:14px;letter-spacing:.14em}.home-hero h2{margin:0;color:#4d3931;font-size:clamp(42px,8vw,66px);font-weight:720;letter-spacing:-.045em}.home-hero small{display:block;margin-top:10px;color:#a28b81;font-size:12px}.home-section{padding:22px;border:1px solid rgba(128,94,79,.13);border-radius:24px;background:#fffdfb;box-shadow:0 9px 28px rgba(72,48,39,.05)}.home-section-title{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:17px}.home-section-title>span{color:#503b33;font-size:18px;font-weight:700}.home-section-title small{color:#a18a80;font-size:11px}.home-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.home-stat-grid>div{padding:17px 8px;border-radius:18px;background:#f8f1ed;text-align:center}.home-stat-grid strong{display:block;color:#61483e;font-size:28px;line-height:1;font-variant-numeric:tabular-nums}.home-stat-grid span{display:block;margin-top:7px;color:#9b8277;font-size:11px}.home-memory-list{display:grid;gap:10px}.home-memory-card{display:grid;grid-template-columns:128px 1fr;gap:15px;width:100%;padding:0;border:1px solid #eadfd9;border-radius:19px;background:#fffaf7;color:inherit;overflow:hidden;text-align:left;cursor:pointer}.home-memory-card>img{width:128px;height:128px;object-fit:cover;background:#eee4df}.home-memory-card>div{align-self:center;min-width:0;padding:14px 16px 14px 0}.home-memory-card strong{display:block;color:#4b3730;font-size:17px}.home-memory-card p{display:-webkit-box;margin:6px 0 9px;overflow:hidden;color:#806c63;font-size:13px;line-height:1.55;-webkit-line-clamp:2;-webkit-box-orient:vertical}.home-memory-card span{color:#a16e63;font-size:11px;font-weight:650}.home-empty{padding:30px 12px;border-radius:17px;background:#faf5f1;color:#a08a80;text-align:center;font-size:13px}@media(max-width:620px){.home-dashboard{gap:12px}.home-hero{padding:42px 18px 38px;border-radius:24px}.home-section{padding:17px;border-radius:20px}.home-stat-grid strong{font-size:24px}.home-memory-card{grid-template-columns:104px 1fr}.home-memory-card>img{width:104px;height:104px}.home-memory-card>div{padding:10px 12px 10px 0}.home-memory-card strong{font-size:15px}}
</style>
