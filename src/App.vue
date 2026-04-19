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

const totalMemoryCount = computed(() => memories.value.length)

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

  todoForm.todo = ''
  todoForm.note = ''
  statusMessage.value = '新的代辦已經加入。'
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

  statusMessage.value = '這件事已經移進回憶，現在可以去補照片和內容。'
  activePage.value = 'memories'
  await Promise.all([fetchTodos(), fetchMemories()])
}

function startCreateMemory() {
  memoryForm.id = null
  memoryForm.title = ''
  memoryForm.story = ''
  memoryForm.memory_date = ''
  memoryForm.image_url = ''
  statusMessage.value = ''
  errorMessage.value = ''
}

function startEditMemory(memory) {
  memoryForm.id = memory.id
  memoryForm.title = memory.title ?? ''
  memoryForm.story = memory.story ?? ''
  memoryForm.memory_date = memory.memory_date ?? ''
  memoryForm.image_url = memory.image_url ?? ''
  activePage.value = 'memories'
  statusMessage.value = ''
  errorMessage.value = ''
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

  const isEditing = Boolean(memoryForm.id)
  const response = await fetch('/api/memories', {
    method: isEditing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(isEditing ? { id: memoryForm.id, ...payload } : payload)
  })

  const data = await response.json().catch(() => ({}))
  submittingMemory.value = false

  if (!response.ok) {
    handleError(isEditing ? '更新回憶失敗。' : '新增回憶失敗。', data)
    return
  }

  statusMessage.value = isEditing ? '回憶已更新。' : '新的回憶已經記下來了。'
  startCreateMemory()
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
    startCreateMemory()
  }

  statusMessage.value = '這段回憶已經移除。'
  await fetchMemories()
}

async function uploadImage(event) {
  const [file] = event.target.files ?? []

  if (!file) {
    return
  }

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
  statusMessage.value = '圖片已上傳，可以一起存進回憶。'
  event.target.value = ''
}

function handleError(message, error) {
  statusMessage.value = ''
  errorMessage.value = message
  console.error(error)
}

function formatDate(value) {
  if (!value) {
    return '尚未設定日期'
  }

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(value))
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Shared Space</p>
        <h1>兩個人的日常清單</h1>
        <p class="topbar-lead">代辦完成後會進回憶，回憶則可以慢慢補上照片和文字。</p>
      </div>

      <div class="summary-cards">
        <article>
          <strong>{{ todos.length }}</strong>
          <span>待完成</span>
        </article>
        <article>
          <strong>{{ totalMemoryCount }}</strong>
          <span>回憶</span>
        </article>
      </div>
    </header>

    <nav class="page-switcher" aria-label="頁面切換">
      <button
        class="switch-button"
        :class="{ active: activePage === 'todos' }"
        type="button"
        @click="activePage = 'todos'"
      >
        代辦
      </button>
      <button
        class="switch-button"
        :class="{ active: activePage === 'memories' }"
        type="button"
        @click="activePage = 'memories'"
      >
        回憶
      </button>
    </nav>

    <main class="page-stack">
      <section v-if="activePage === 'todos'" class="panel">
        <div class="panel-head">
          <div>
            <p class="section-tag">Todo</p>
            <h2>一起想做的事</h2>
          </div>
          <span class="badge">完成後自動進回憶</span>
        </div>

        <form class="love-form" @submit.prevent="addTodo">
          <label>
            <span>代辦內容</span>
            <input v-model="todoForm.todo" type="text" placeholder="例如：一起去看海邊日出" />
          </label>

          <label>
            <span>備註</span>
            <textarea
              v-model="todoForm.note"
              rows="3"
              placeholder="可以先寫一點想法，之後完成後會自動帶進回憶。"
            ></textarea>
          </label>

          <button class="primary-button" type="submit" :disabled="submittingTodo">
            {{ submittingTodo ? '儲存中...' : '新增代辦' }}
          </button>
        </form>

        <div class="todo-layout todo-layout--single">
          <div class="todo-column">
            <div class="column-head">
              <h3>待完成</h3>
              <span>{{ todos.length }}</span>
            </div>

            <div v-if="loading" class="empty-card shimmer">讀取中...</div>
            <div v-else-if="!todos.length" class="empty-card">目前沒有待辦，先新增一件想一起做的事吧。</div>

            <article v-for="item in todos" :key="item.id" class="todo-card">
              <div class="todo-copy">
                <h4>{{ item.todo }}</h4>
                <p v-if="item.note">{{ item.note }}</p>
              </div>
              <button class="secondary-button" type="button" @click="completeTodo(item)">完成並放進回憶</button>
            </article>
          </div>
        </div>
      </section>

      <section v-else class="panel">
        <div class="panel-head">
          <div>
            <p class="section-tag">Memories</p>
            <h2>回憶紀錄</h2>
          </div>
          <button class="secondary-button" type="button" @click="startCreateMemory">手動新增回憶</button>
        </div>

        <form class="love-form" @submit.prevent="saveMemory">
          <label>
            <span>回憶標題</span>
            <input v-model="memoryForm.title" type="text" placeholder="例如：第一次一起逛夜市" />
          </label>

          <label>
            <span>日期</span>
            <input v-model="memoryForm.memory_date" type="date" />
          </label>

          <label>
            <span>文字紀錄</span>
            <textarea
              v-model="memoryForm.story"
              rows="5"
              placeholder="完成代辦後，可以再慢慢補上那天發生的事和感覺。"
            ></textarea>
          </label>

          <label class="upload-box">
            <span>上傳照片</span>
            <input type="file" accept="image/*" @change="uploadImage" />
            <small>{{ uploadingImage ? '上傳中...' : '圖片會存到 Vercel Blob。' }}</small>
          </label>

          <div v-if="memoryForm.image_url" class="preview-card">
            <img :src="memoryForm.image_url" alt="回憶照片預覽" />
          </div>

          <div class="action-row">
            <button class="primary-button" type="submit" :disabled="submittingMemory || uploadingImage">
              {{ submittingMemory ? '儲存中...' : memoryForm.id ? '更新回憶' : '新增回憶' }}
            </button>
            <button
              v-if="memoryForm.id"
              class="secondary-button"
              type="button"
              @click="startCreateMemory"
            >
              取消編輯
            </button>
          </div>
        </form>

        <div class="message-stack">
          <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        </div>

        <div class="memory-stack">
          <div v-if="loading" class="empty-card shimmer">讀取中...</div>
          <div v-else-if="!memories.length" class="empty-card">還沒有回憶，完成一件代辦或手動新增一段吧。</div>

          <article v-for="memory in memories" :key="memory.id" class="memory-card">
            <div class="memory-top">
              <div>
                <span class="date-chip">{{ formatDate(memory.memory_date) }}</span>
                <h3>{{ memory.title }}</h3>
              </div>
              <div class="memory-actions">
                <button class="icon-button" type="button" @click="startEditMemory(memory)">編輯</button>
                <button class="icon-button" type="button" @click="removeMemory(memory)">刪除</button>
              </div>
            </div>

            <p>{{ memory.story || '還沒補文字，可以之後再編輯。' }}</p>
            <img v-if="memory.image_url" :src="memory.image_url" :alt="memory.title" />
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
