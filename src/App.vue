<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const todoForm = reactive({
  todo: '',
  note: '',
  due_date: ''
})

const memoryForm = reactive({
  id: null,
  title: '',
  story: '',
  memory_date: '',
  image_urls: []
})

const activePage = ref('todos')
const TODO_CACHE_KEY = 'girlfriendtodo_todos_cache_v1'
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
const UPLOAD_RETRY_ATTEMPTS = 3
const UPLOAD_TIMEOUT_MS = 25000
const UPLOAD_MAX_DIMENSION = 1920
const UPLOAD_TARGET_BYTES = 1200 * 1024
const UPLOAD_MIN_QUALITY = 0.6

const totalMemoryCount = computed(() => memories.value.length)
const pageTitle = computed(() => (activePage.value === 'todos' ? '待辦' : '回憶'))
const isEditingMemory = computed(() => Boolean(memoryForm.id))
const calendarMonth = ref(new Date().toISOString().slice(0, 7))
const selectedCalendarDate = ref('')
const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']
const memoriesByDate = computed(() => {
  const map = new Map()

  for (const memory of memories.value) {
    if (!memory.memory_date) continue
    const key = String(memory.memory_date).slice(0, 10)
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key).push(memory)
  }

  return map
})
const calendarDays = computed(() => {
  const [year, month] = calendarMonth.value.split('-').map(Number)
  if (!year || !month) return []

  const firstDate = new Date(year, month - 1, 1)
  const firstWeekday = (firstDate.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate
  const cells = []

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`
    const dayMemories = memoriesByDate.value.get(date) ?? []
    cells.push({
      date,
      day,
      memoryCount: dayMemories.length
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
})
const selectedCalendarMemories = computed(() => {
  if (!selectedCalendarDate.value) return []
  return memoriesByDate.value.get(selectedCalendarDate.value) ?? []
})
const calendarMonthLabel = computed(() => {
  const [year, month] = calendarMonth.value.split('-').map(Number)
  if (!year || !month) return ''

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long'
  }).format(new Date(year, month - 1, 1))
})

onMounted(async () => {
  fetchTodos()
    .catch((error) => {
      console.error(error)
    })
    .finally(() => {
      todosLoading.value = false
      todosFetchDone.value = true
      maybeApplyDemoData()
    })

  fetchMemories()
    .catch((error) => {
      console.error(error)
    })
    .finally(() => {
      memoriesLoading.value = false
      memoriesFetchDone.value = true
      maybeApplyDemoData()
    })
})

async function fetchTodos() {
  const response = await fetch('/api/todos')
  const data = await response.json().catch(() => [])

  if (!response.ok) {
    handleError('讀取代辦失敗。', data)
    return
  }

  todos.value = data ?? []
  writeTodoCache(todos.value)
}

async function fetchMemories() {
  const response = await fetch('/api/memories')
  const data = await response.json().catch(() => [])

  if (!response.ok) {
    handleError('讀取回憶失敗。', data)
    return
  }

  memories.value = (data ?? []).map(normalizeMemory)
}

function normalizeMemory(memory) {
  const imageUrls = Array.isArray(memory.image_urls)
    ? memory.image_urls
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value && /^https?:\/\//.test(value))
    : memory.image_url
      ? [String(memory.image_url).trim()].filter((value) => value && /^https?:\/\//.test(value))
      : []

  return {
    ...memory,
    image_urls: imageUrls
  }
}

function openTodoComposer() {
  composerOpen.value = true
  todoForm.todo = ''
  todoForm.note = ''
  todoForm.due_date = ''
  statusMessage.value = ''
  errorMessage.value = ''
}

function openMemoryComposer(memory = null) {
  composerOpen.value = true
  statusMessage.value = ''
  errorMessage.value = ''
  menuOpenId.value = null

  if (memory) {
    pendingTodoToMove.value = null
    memoryForm.id = memory.id
    memoryForm.title = memory.title ?? ''
    memoryForm.story = memory.story ?? ''
    memoryForm.memory_date = memory.memory_date ?? ''
    memoryForm.image_urls = [...(memory.image_urls ?? [])]
    activePage.value = 'memories'
    return
  }

  pendingTodoToMove.value = null
  memoryForm.id = null
  memoryForm.title = ''
  memoryForm.story = ''
  memoryForm.memory_date = ''
  memoryForm.image_urls = []
  activePage.value = 'memories'
}

function closeComposer() {
  composerOpen.value = false
  memoryForm.id = null
  pendingTodoToMove.value = null
}

function toggleMenu(memoryId) {
  menuOpenId.value = menuOpenId.value === memoryId ? null : memoryId
}

function openMemoryDetail(memory) {
  detailMemory.value = memory
  menuOpenId.value = null
}

function closeMemoryDetail() {
  detailMemory.value = null
}

async function addTodo() {
  if (!todoForm.todo.trim()) {
    errorMessage.value = '先寫下一件想一起完成的小事吧。'
    return
  }

  submittingTodo.value = true
  errorMessage.value = ''

  const response = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      todo: todoForm.todo.trim(),
      note: todoForm.note.trim() || null,
      due_date: todoForm.due_date || null
    })
  })

  const data = await response.json().catch(() => ({}))
  submittingTodo.value = false

  if (!response.ok) {
    handleError('新增代辦失敗。', data)
    return
  }

  closeComposer()
  statusMessage.value = '已加入新的待辦。'
  await fetchTodos()
}

function moveTodoToMemory(todo) {
  openMemoryComposer()
  pendingTodoToMove.value = todo
  memoryForm.title = todo.todo ?? ''
  memoryForm.story = todo.note ?? ''
  memoryForm.memory_date = todo.due_date ?? ''
}

async function markTodoAsCompleted(todoId) {
  const response = await fetch('/api/todos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: todoId,
      completed: true
    })
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw data
  }
}

async function saveMemory() {
  if (!memoryForm.title.trim()) {
    errorMessage.value = '回憶標題要填寫。'
    return
  }

  submittingMemory.value = true
  errorMessage.value = ''

  const payload = {
    title: memoryForm.title.trim(),
    story: memoryForm.story.trim(),
    memory_date: memoryForm.memory_date || null,
    image_urls: memoryForm.image_urls
  }

  const response = await fetch('/api/memories', {
    method: isEditingMemory.value ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isEditingMemory.value ? { id: memoryForm.id, ...payload } : payload)
  })

  const data = await response.json().catch(() => ({}))
  submittingMemory.value = false

  if (!response.ok) {
    handleError(isEditingMemory.value ? '更新回憶失敗。' : '新增回憶失敗。', data)
    return
  }

  const movingTodoId = !isEditingMemory.value ? pendingTodoToMove.value?.id : null
  const shouldMarkTodoCompleted =
    !isEditingMemory.value && pendingTodoToMove.value && !pendingTodoToMove.value.is_demo
  let moveFailed = false

  if (shouldMarkTodoCompleted && movingTodoId) {
    try {
      await markTodoAsCompleted(movingTodoId)
    } catch (moveError) {
      moveFailed = true
      console.error(moveError)
      errorMessage.value = '回憶已儲存，但移動待辦失敗，請稍後重試。'
    }
  }

  closeComposer()

  if (shouldMarkTodoCompleted && movingTodoId && !moveFailed) {
    statusMessage.value = '已移動到回憶。'
    activePage.value = 'memories'
    await Promise.all([fetchTodos(), fetchMemories()])
    return
  }

  statusMessage.value = isEditingMemory.value ? '回憶已更新。' : '已新增回憶。'
  await fetchMemories()
}

async function removeMemory(memory) {
  if (!window.confirm(`確定要刪除「${memory.title}」嗎？`)) {
    return
  }

  const response = await fetch('/api/memories', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: memory.id })
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    handleError('刪除回憶失敗。', data)
    return
  }

  if (memoryForm.id === memory.id) {
    closeComposer()
  }

  if (detailMemory.value?.id === memory.id) {
    closeMemoryDetail()
  }

  menuOpenId.value = null
  statusMessage.value = '已刪除回憶。'
  await fetchMemories()
}

async function uploadImages(event) {
  const files = Array.from(event.target.files ?? [])
  if (!files.length) return

  uploadingImage.value = true
  errorMessage.value = ''
  statusMessage.value = ''

  try {
    const uploadedUrls = []
    let failedCount = 0

    for (const file of files) {
      try {
        const preparedFile = await prepareImageForUpload(file)
        const url = await uploadImageWithRetry(preparedFile)
        uploadedUrls.push(url)
      } catch (error) {
        failedCount += 1
        console.error(error)
      }
    }

    if (uploadedUrls.length) {
      memoryForm.image_urls = [...memoryForm.image_urls, ...uploadedUrls]
    }

    if (failedCount > 0 && uploadedUrls.length > 0) {
      statusMessage.value = `已上傳 ${uploadedUrls.length} 張，另有 ${failedCount} 張失敗，請重試失敗的照片。`
      errorMessage.value = ''
    } else if (failedCount > 0) {
      handleError('圖片上傳失敗，請稍後重試。', { failedCount })
    }

    event.target.value = ''
  } finally {
    uploadingImage.value = false
  }
}

async function uploadImageWithRetry(file) {
  let lastError = null

  for (let attempt = 1; attempt <= UPLOAD_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await uploadSingleImage(file)
    } catch (error) {
      lastError = error

      if (attempt < UPLOAD_RETRY_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 700))
      }
    }
  }

  throw lastError ?? new Error('Unknown upload error')
}

async function prepareImageForUpload(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return file
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const image = await loadImage(objectUrl)
    const scale = Math.min(1, UPLOAD_MAX_DIMENSION / Math.max(image.width, image.height))
    const targetWidth = Math.max(1, Math.round(image.width * scale))
    const targetHeight = Math.max(1, Math.round(image.height * scale))

    if (scale === 1 && file.size <= UPLOAD_TARGET_BYTES) {
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const context = canvas.getContext('2d')
    if (!context) {
      return file
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    let quality = 0.85
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality)

    while (blob && blob.size > UPLOAD_TARGET_BYTES && quality > UPLOAD_MIN_QUALITY) {
      quality = Math.max(UPLOAD_MIN_QUALITY, quality - 0.08)
      blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    }

    if (!blob) {
      return file
    }

    const compressedName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], compressedName, { type: 'image/jpeg', lastModified: Date.now() })
  } catch (error) {
    console.error(error)
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image decode failed'))
    image.src = objectUrl
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality)
  })
}

async function uploadSingleImage(file) {
  const formData = new FormData()
  formData.append('file', file)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok || !data.url) {
      throw new Error(data?.error || 'Upload request failed')
    }

    return data.url
  } finally {
    clearTimeout(timeoutId)
  }
}

function removeImage(index) {
  memoryForm.image_urls = memoryForm.image_urls.filter((_, imageIndex) => imageIndex !== index)
}

function getPreviewImages(memory) {
  return (memory.image_urls ?? []).slice(0, 4)
}

function getHiddenImageCount(memory) {
  return Math.max(0, (memory.image_urls?.length ?? 0) - 4)
}

function handleError(message, error) {
  statusMessage.value = ''
  errorMessage.value = message
  console.error(error)
}

function formatDate(value) {
  if (!value) return ''

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value))
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function shiftCalendarMonth(offset) {
  const [year, month] = calendarMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + offset, 1)
  calendarMonth.value = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`
  selectedCalendarDate.value = ''
}

function selectCalendarDate(date) {
  selectedCalendarDate.value = date
}

function readTodoCache() {
  try {
    const raw = localStorage.getItem(TODO_CACHE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function maybeApplyDemoData() {
  if (demoDataApplied.value) return
  if (!todosFetchDone.value || !memoriesFetchDone.value) return
  if (todos.value.length || memories.value.length) return

  todos.value = [
    {
      id: 'demo-todo-1',
      todo: '一起去看海邊日落',
      note: '帶野餐墊和保溫瓶',
      due_date: '2026-05-03',
      is_demo: true
    },
    {
      id: 'demo-todo-2',
      todo: '挑一間新咖啡店約會',
      note: '拍一張店門口合照',
      due_date: null,
      is_demo: true
    }
  ]

  memories.value = [
    {
      id: 'demo-memory-1',
      title: '第一次一起騎車夜遊',
      story: '從河堤一路騎到橋邊，風很涼，聊到不想回家。',
      memory_date: '2026-03-30',
      image_urls: [
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80'
      ]
    },
    {
      id: 'demo-memory-2',
      title: '雨天散步的小旅行',
      story: '原本怕下雨，結果走在傘下更浪漫。',
      memory_date: '2026-02-14',
      image_urls: [
        'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1200&q=80'
      ]
    }
  ]

  demoDataApplied.value = true
  statusMessage.value = '目前顯示範例資料（因為尚未有待辦與回憶）。'
  errorMessage.value = ''
}

function writeTodoCache(nextTodos) {
  try {
    localStorage.setItem(TODO_CACHE_KEY, JSON.stringify(nextTodos))
  } catch {
    // Ignore storage errors (private mode / quota)
  }
}

</script>

<template>
  <div class="app-shell">
    <header class="hero-strip">
      <div class="hero-title">
        <h1>和她的計畫與回憶</h1>
      </div>
      <nav class="page-switcher" aria-label="頁面切換">
        <button
          class="switch-button"
          :class="{ active: activePage === 'todos' }"
          type="button"
          @click="activePage = 'todos'"
        >
          待辦 {{ todos.length }}
        </button>
        <button
          class="switch-button"
          :class="{ active: activePage === 'memories' }"
          type="button"
          @click="activePage = 'memories'"
        >
          回憶 {{ totalMemoryCount }}
        </button>
        <button
          class="switch-button"
          :class="{ active: activePage === 'calendar' }"
          type="button"
          @click="activePage = 'calendar'"
        >
          月曆
        </button>
      </nav>
    </header>

    <p v-if="statusMessage" class="toast toast--ok">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="toast toast--error">{{ errorMessage }}</p>

    <main class="content-surface">
      <section v-if="activePage === 'todos'" class="content-list">
        <div v-if="todosLoading" class="quiet-state">讀取中...</div>
        <div v-else-if="!todos.length" class="quiet-state">還沒有待辦</div>

        <article v-for="item in todos" :key="item.id" class="story-card story-card--todo">
          <div class="story-card__body">
            <div class="story-meta">
              <span>預計：{{ item.due_date ? formatDate(item.due_date) : '未決定' }}</span>
            </div>
            <h3>{{ item.todo }}</h3>
            <p v-if="item.note">{{ item.note }}</p>
          </div>
          <button
            class="inline-action inline-action--complete"
            type="button"
            title="先編輯回憶再移動"
            @click="moveTodoToMemory(item)"
          >
            移動到回憶
          </button>
        </article>
      </section>

      <section v-else-if="activePage === 'memories'" class="content-list">
        <div v-if="memoriesLoading" class="quiet-state">讀取中...</div>
        <div v-else-if="!memories.length" class="quiet-state">還沒有回憶</div>

        <article
          v-for="memory in memories"
          :key="memory.id"
          class="story-card story-card--memory"
          @click="openMemoryDetail(memory)"
        >
          <div v-if="memory.image_urls.length" class="story-cover story-cover--grid">
            <div
              v-for="(image, index) in getPreviewImages(memory)"
              :key="`${memory.id}-preview-${index}`"
              class="story-grid-item"
            >
              <img :src="image" :alt="memory.title" class="story-image" />
              <span v-if="index === 3 && getHiddenImageCount(memory) > 0" class="image-count">
                +{{ getHiddenImageCount(memory) }}
              </span>
            </div>
          </div>
          <div class="story-card__body">
            <div class="story-meta story-meta--top">
              <span v-if="memory.memory_date">{{ formatDate(memory.memory_date) }}</span>
              <div class="memory-menu-wrap" @click.stop>
                <button class="menu-trigger" type="button" @click="toggleMenu(memory.id)">•••</button>
                <div v-if="menuOpenId === memory.id" class="memory-menu">
                  <button
                    type="button"
                    @click="openMemoryComposer(memory), (menuOpenId = null)"
                  >
                    編輯
                  </button>
                  <button type="button" @click="removeMemory(memory)">刪除</button>
                </div>
              </div>
            </div>
            <h3>{{ memory.title }}</h3>
            <p class="memory-excerpt">{{ memory.story || ' ' }}</p>
          </div>
        </article>
      </section>

      <section v-else class="content-list calendar-view">
        <div class="calendar-head">
          <button class="calendar-nav" type="button" @click="shiftCalendarMonth(-1)">‹</button>
          <h3>{{ calendarMonthLabel }}</h3>
          <button class="calendar-nav" type="button" @click="shiftCalendarMonth(1)">›</button>
        </div>

        <div class="calendar-grid calendar-grid--weekday">
          <div v-for="label in weekdayLabels" :key="label" class="calendar-weekday">{{ label }}</div>
        </div>

        <div class="calendar-grid calendar-grid--days">
          <button
            v-for="(dayCell, index) in calendarDays"
            :key="dayCell ? dayCell.date : `empty-${index}`"
            class="calendar-day"
            :class="{
              'calendar-day--empty': !dayCell,
              'calendar-day--has-memory': dayCell && dayCell.memoryCount > 0,
              'calendar-day--selected': dayCell && dayCell.date === selectedCalendarDate
            }"
            type="button"
            :disabled="!dayCell"
            @click="dayCell && selectCalendarDate(dayCell.date)"
          >
            <span v-if="dayCell" class="calendar-day__num">{{ dayCell.day }}</span>
            <span v-if="dayCell && dayCell.memoryCount > 0" class="calendar-day__dot"></span>
          </button>
        </div>

        <div v-if="selectedCalendarDate" class="calendar-memory-panel">
          <h4>回憶：{{ formatDate(selectedCalendarDate) }}</h4>
          <div v-if="selectedCalendarMemories.length" class="calendar-memory-list">
            <article
              v-for="memory in selectedCalendarMemories"
              :key="`calendar-${memory.id}`"
              class="calendar-memory-item"
              @click="openMemoryDetail(memory)"
            >
              <h5>{{ memory.title }}</h5>
              <p>{{ memory.story || ' ' }}</p>
            </article>
          </div>
          <p v-else class="quiet-state">這天還沒有回憶</p>
        </div>
      </section>
    </main>

    <button
      class="floating-add"
      type="button"
      :aria-label="`新增${pageTitle}`"
      @click="activePage === 'todos' ? openTodoComposer() : openMemoryComposer()"
    >
      +
    </button>

    <div v-if="composerOpen" class="composer-backdrop" @click.self="closeComposer">
      <section class="composer-sheet">
        <div class="composer-head">
          <h2>
            {{
              activePage === 'todos'
                ? '新增待辦'
                : isEditingMemory
                  ? '編輯回憶'
                  : '新增回憶'
            }}
          </h2>
          <button class="close-button" type="button" @click="closeComposer">關閉</button>
        </div>

        <form v-if="activePage === 'todos'" class="composer-form" @submit.prevent="addTodo">
          <input v-model="todoForm.todo" type="text" placeholder="想一起做什麼" />
          <label class="date-field">
            <span class="date-label">預計日期（可選）</span>
            <input v-model="todoForm.due_date" type="date" />
            <small v-if="!todoForm.due_date" class="date-hint">未選擇時會顯示「未決定」</small>
          </label>
          <textarea v-model="todoForm.note" rows="4" placeholder="留一句話"></textarea>
          <button class="primary-button" type="submit" :disabled="submittingTodo">
            {{ submittingTodo ? '儲存中...' : '儲存' }}
          </button>
        </form>

        <form v-else class="composer-form" @submit.prevent="saveMemory">
          <input v-model="memoryForm.title" type="text" placeholder="回憶標題" />
          <label class="date-field">
            <span class="date-label">活動日期（可選）</span>
            <input v-model="memoryForm.memory_date" type="date" />
            <small v-if="!memoryForm.memory_date" class="date-hint">點日期欄位可選擇日期</small>
          </label>
          <textarea v-model="memoryForm.story" rows="5" placeholder="寫下來"></textarea>

          <label class="upload-box upload-box--sheet">
            <span>上傳照片</span>
            <input type="file" accept="image/*" multiple @change="uploadImages" />
            <small>{{ uploadingImage ? '上傳中...' : '可以一次選多張' }}</small>
          </label>

          <div v-if="memoryForm.image_urls.length" class="preview-grid">
            <div v-for="(image, index) in memoryForm.image_urls" :key="`${image}-${index}`" class="preview-tile">
              <img :src="image" alt="回憶照片預覽" />
              <button class="preview-remove" type="button" @click="removeImage(index)">移除</button>
            </div>
          </div>

          <div class="composer-actions">
            <button class="primary-button" type="submit" :disabled="submittingMemory || uploadingImage">
              {{ submittingMemory ? '儲存中...' : '儲存' }}
            </button>
          </div>
        </form>
      </section>
    </div>

    <div v-if="detailMemory" class="composer-backdrop" @click.self="closeMemoryDetail">
      <section class="composer-sheet composer-sheet--detail">
        <div class="composer-head">
          <div>
            <h2>{{ detailMemory.title }}</h2>
            <p v-if="detailMemory.memory_date" class="detail-date">{{ formatDate(detailMemory.memory_date) }}</p>
          </div>
          <button class="close-button" type="button" @click="closeMemoryDetail">關閉</button>
        </div>

        <div v-if="detailMemory.image_urls.length" class="detail-gallery">
          <img
            v-for="(image, index) in detailMemory.image_urls"
            :key="`${detailMemory.id}-detail-${index}`"
            :src="image"
            :alt="detailMemory.title"
            class="detail-image"
          />
        </div>

        <p class="detail-story">{{ detailMemory.story || '還沒有補上文字。' }}</p>
      </section>
    </div>
  </div>
</template>

