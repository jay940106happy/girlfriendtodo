<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

const todoForm = reactive({
  todo: '',
  note: ''
})

const memoryForm = reactive({
  id: null,
  title: '',
  story: '',
  memory_date: '',
  image_url: ''
})

const activePage = ref('todos')
const todos = ref([])
const memories = ref([])
const loading = ref(true)
const submittingTodo = ref(false)
const submittingMemory = ref(false)
const uploadingImage = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')
const composerOpen = ref(false)

const totalMemoryCount = computed(() => memories.value.length)
const pageTitle = computed(() => (activePage.value === 'todos' ? '待辦' : '回憶'))
const isEditingMemory = computed(() => Boolean(memoryForm.id))

onMounted(async () => {
  await Promise.all([fetchTodos(), fetchMemories()])
  loading.value = false
})

async function fetchTodos() {
  const response = await fetch('/api/todos')
  const data = await response.json().catch(() => [])

  if (!response.ok) {
    handleError('讀取代辦失敗。', data)
    return
  }

  todos.value = data ?? []
}

async function fetchMemories() {
  const response = await fetch('/api/memories')
  const data = await response.json().catch(() => [])

  if (!response.ok) {
    handleError('讀取回憶失敗。', data)
    return
  }

  memories.value = data ?? []
}

function openTodoComposer() {
  composerOpen.value = true
  todoForm.todo = ''
  todoForm.note = ''
  statusMessage.value = ''
  errorMessage.value = ''
}

function openMemoryComposer(memory = null) {
  composerOpen.value = true
  statusMessage.value = ''
  errorMessage.value = ''

  if (memory) {
    memoryForm.id = memory.id
    memoryForm.title = memory.title ?? ''
    memoryForm.story = memory.story ?? ''
    memoryForm.memory_date = memory.memory_date ?? ''
    memoryForm.image_url = memory.image_url ?? ''
    activePage.value = 'memories'
    return
  }

  memoryForm.id = null
  memoryForm.title = ''
  memoryForm.story = ''
  memoryForm.memory_date = ''
  memoryForm.image_url = ''
  activePage.value = 'memories'
}

function closeComposer() {
  composerOpen.value = false
  memoryForm.id = null
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
      note: todoForm.note.trim() || null
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

async function completeTodo(todo) {
  errorMessage.value = ''

  const response = await fetch('/api/todos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: todo.id,
      completed: true
    })
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    handleError('完成代辦失敗。', data)
    return
  }

  statusMessage.value = '已放進回憶。'
  activePage.value = 'memories'
  await Promise.all([fetchTodos(), fetchMemories()])
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
    image_url: memoryForm.image_url.trim() || null
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

  closeComposer()
  statusMessage.value = isEditingMemory.value ? '回憶已更新。' : '已新增回憶。'
  await fetchMemories()
}

async function removeMemory(memory) {
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

  statusMessage.value = '已刪除回憶。'
  await fetchMemories()
}

async function uploadImage(event) {
  const [file] = event.target.files ?? []
  if (!file) return

  uploadingImage.value = true
  errorMessage.value = ''

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  })

  const data = await response.json().catch(() => ({}))
  uploadingImage.value = false

  if (!response.ok) {
    handleError('圖片上傳失敗。', data)
    return
  }

  memoryForm.image_url = data.url ?? ''
  event.target.value = ''
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
</script>

<template>
  <div class="app-shell">
    <header class="hero-strip">
      <div class="hero-title">
        <h1>日常</h1>
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
      </nav>
    </header>

    <p v-if="statusMessage" class="toast toast--ok">{{ statusMessage }}</p>
    <p v-if="errorMessage" class="toast toast--error">{{ errorMessage }}</p>

    <main class="content-surface">
      <section v-if="activePage === 'todos'" class="content-list">
        <div v-if="loading" class="quiet-state">讀取中...</div>
        <div v-else-if="!todos.length" class="quiet-state">還沒有待辦</div>

        <article v-for="item in todos" :key="item.id" class="story-card story-card--todo">
          <div class="story-card__body">
            <h3>{{ item.todo }}</h3>
            <p v-if="item.note">{{ item.note }}</p>
          </div>
          <button class="inline-action" type="button" @click="completeTodo(item)">完成</button>
        </article>
      </section>

      <section v-else class="content-list">
        <div v-if="loading" class="quiet-state">讀取中...</div>
        <div v-else-if="!memories.length" class="quiet-state">還沒有回憶</div>

        <article v-for="memory in memories" :key="memory.id" class="story-card story-card--memory">
          <img v-if="memory.image_url" :src="memory.image_url" :alt="memory.title" class="story-image" />
          <div class="story-card__body">
            <div class="story-meta">
              <span v-if="memory.memory_date">{{ formatDate(memory.memory_date) }}</span>
            </div>
            <h3>{{ memory.title }}</h3>
            <p>{{ memory.story || ' ' }}</p>
          </div>
          <div class="story-actions">
            <button class="inline-action" type="button" @click="openMemoryComposer(memory)">編輯</button>
            <button class="inline-action inline-action--muted" type="button" @click="removeMemory(memory)">刪除</button>
          </div>
        </article>
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
          <textarea v-model="todoForm.note" rows="4" placeholder="留一句話"></textarea>
          <button class="primary-button" type="submit" :disabled="submittingTodo">
            {{ submittingTodo ? '儲存中...' : '儲存' }}
          </button>
        </form>

        <form v-else class="composer-form" @submit.prevent="saveMemory">
          <input v-model="memoryForm.title" type="text" placeholder="回憶標題" />
          <input v-model="memoryForm.memory_date" type="date" />
          <textarea v-model="memoryForm.story" rows="5" placeholder="寫下來"></textarea>

          <label class="upload-box upload-box--sheet">
            <span>上傳照片</span>
            <input type="file" accept="image/*" @change="uploadImage" />
            <small>{{ uploadingImage ? '上傳中...' : '選一張照片' }}</small>
          </label>

          <div v-if="memoryForm.image_url" class="preview-card">
            <img :src="memoryForm.image_url" alt="回憶照片預覽" />
          </div>

          <button class="primary-button" type="submit" :disabled="submittingMemory || uploadingImage">
            {{ submittingMemory ? '儲存中...' : '儲存' }}
          </button>
        </form>
      </section>
    </div>
  </div>
</template>
