<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { supabase } from './lib/supabase'

const todoForm = reactive({
  todo: '',
  note: '',
  due_date: ''
})

const memoryForm = reactive({
  title: '',
  story: '',
  memory_date: new Date().toISOString().slice(0, 10)
})

const activePage = ref('todos')
const todos = ref([])
const memories = ref([])
const selectedImage = ref(null)
const previewUrl = ref('')
const loading = ref(true)
const submittingTodo = ref(false)
const submittingMemory = ref(false)
const statusMessage = ref('')
const errorMessage = ref('')

const pendingTodos = computed(() => todos.value.filter((item) => !item.completed))
const completedTodos = computed(() => todos.value.filter((item) => item.completed))
const totalLoveScore = computed(() => completedTodos.value.length * 12 + memories.value.length * 18)

onMounted(async () => {
  await Promise.all([fetchTodos(), fetchMemories()])
  loading.value = false
})

async function fetchTodos() {
  const { data, error } = await supabase
    .from('todo')
    .select('id, todo, note, due_date, completed, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    handleError('讀取待辦失敗，請先確認 Supabase 的 todo 資料表欄位是否已建立。', error)
    return
  }

  todos.value = data ?? []
}

async function fetchMemories() {
  const { data, error } = await supabase
    .from('memories')
    .select('id, title, story, memory_date, image_url, image_path, created_at')
    .order('memory_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    handleError('讀取回憶失敗，請先建立 memories 資料表。', error)
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

  const payload = {
    todo: todoForm.todo.trim(),
    note: todoForm.note.trim() || null,
    due_date: todoForm.due_date || null,
    completed: false
  }

  const { error } = await supabase.from('todo').insert(payload)

  submittingTodo.value = false

  if (error) {
    handleError('新增待辦失敗。', error)
    return
  }

  todoForm.todo = ''
  todoForm.note = ''
  todoForm.due_date = ''
  statusMessage.value = '新的約會願望已經放進清單。'
  await fetchTodos()
}

async function toggleTodo(item) {
  errorMessage.value = ''

  const { error } = await supabase
    .from('todo')
    .update({ completed: !item.completed })
    .eq('id', item.id)

  if (error) {
    handleError('更新待辦狀態失敗。', error)
    return
  }

  statusMessage.value = item.completed ? '這個願望已經放回期待清單。' : '甜甜成就已經解鎖。'
  await fetchTodos()
}

function handleImageChange(event) {
  const [file] = event.target.files ?? []

  if (!file) {
    selectedImage.value = null
    clearPreview()
    return
  }

  selectedImage.value = file
  clearPreview()
  previewUrl.value = URL.createObjectURL(file)
}

function clearPreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  previewUrl.value = ''
}

async function addMemory() {
  if (!memoryForm.title.trim() || !memoryForm.story.trim()) {
    errorMessage.value = '回憶名稱和文字內容都要填寫。'
    return
  }

  submittingMemory.value = true
  errorMessage.value = ''

  let imageUrl = null
  let imagePath = null

  if (selectedImage.value) {
    const extension = selectedImage.value.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
    const uploadPath = `memories/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('memory-images')
      .upload(uploadPath, selectedImage.value, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      submittingMemory.value = false
      handleError('圖片上傳失敗，請先確認 memory-images bucket 已建立。', uploadError)
      return
    }

    const { data } = supabase.storage.from('memory-images').getPublicUrl(uploadPath)
    imageUrl = data.publicUrl
    imagePath = uploadPath
  }

  const payload = {
    title: memoryForm.title.trim(),
    story: memoryForm.story.trim(),
    memory_date: memoryForm.memory_date || new Date().toISOString().slice(0, 10),
    image_url: imageUrl,
    image_path: imagePath
  }

  const { error } = await supabase.from('memories').insert(payload)

  submittingMemory.value = false

  if (error) {
    handleError('新增回憶失敗。', error)
    return
  }

  memoryForm.title = ''
  memoryForm.story = ''
  memoryForm.memory_date = new Date().toISOString().slice(0, 10)
  selectedImage.value = null
  clearPreview()
  const input = document.querySelector('#memory-image')
  if (input) {
    input.value = ''
  }
  statusMessage.value = '新的心動片段已經收進回憶花園。'
  await fetchMemories()
}

async function removeMemory(memory) {
  errorMessage.value = ''

  if (memory.image_path) {
    const { error: storageError } = await supabase.storage.from('memory-images').remove([memory.image_path])

    if (storageError) {
      handleError('刪除圖片失敗。', storageError)
      return
    }
  }

  const { error } = await supabase.from('memories').delete().eq('id', memory.id)

  if (error) {
    handleError('刪除回憶失敗。', error)
    return
  }

  statusMessage.value = '這段回憶已從花園中收起。'
  await fetchMemories()
}

function handleError(message, error) {
  statusMessage.value = ''
  errorMessage.value = message
  console.error(error)
}

function formatDate(value) {
  if (!value) {
    return '未設定日期'
  }

  const date = new Date(value)
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date)
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Shared Space</p>
        <h1>兩個人的日常清單</h1>
        <p class="topbar-lead">把想一起完成的事和重要回憶，安靜地放在同一個地方。</p>
      </div>

      <div class="summary-cards">
        <article>
          <strong>{{ pendingTodos.length }}</strong>
          <span>待完成</span>
        </article>
        <article>
          <strong>{{ memories.length }}</strong>
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
      <section v-if="activePage === 'todos'" class="panel panel-todo">
        <div class="panel-head">
          <div>
            <p class="section-tag">Todo</p>
            <h2>一起想做的事</h2>
          </div>
          <span class="badge">{{ completedTodos.length }} 已完成</span>
        </div>

        <form class="love-form" @submit.prevent="addTodo">
          <label>
            <span>下一個約會願望</span>
            <input v-model="todoForm.todo" type="text" placeholder="例如：一起去看海邊日出" />
          </label>

          <label>
            <span>偷偷留一句備註</span>
            <textarea
              v-model="todoForm.note"
              rows="3"
              placeholder="像是：穿白色衣服、帶拍立得、要買熱可可"
            ></textarea>
          </label>

          <label>
            <span>期待日期</span>
            <input v-model="todoForm.due_date" type="date" />
          </label>

          <button class="primary-button" type="submit" :disabled="submittingTodo">
            {{ submittingTodo ? '收藏中...' : '放進戀愛清單' }}
          </button>
        </form>

        <div class="todo-layout">
          <div class="todo-column">
            <div class="column-head">
              <h3>待完成</h3>
              <span>{{ pendingTodos.length }}</span>
            </div>

            <div v-if="loading" class="empty-card shimmer">正在把願望整理進花園...</div>
            <div v-else-if="!pendingTodos.length" class="empty-card">先寫下一個你們想一起完成的小計畫吧。</div>

            <article v-for="item in pendingTodos" :key="item.id" class="todo-card">
              <div class="todo-copy">
                <h4>{{ item.todo }}</h4>
                <p v-if="item.note">{{ item.note }}</p>
                <small v-if="item.due_date">希望在 {{ formatDate(item.due_date) }} 前完成</small>
              </div>
              <button class="secondary-button" type="button" @click="toggleTodo(item)">完成了</button>
            </article>
          </div>

          <div class="todo-column done-column">
            <div class="column-head">
              <h3>已完成</h3>
              <span>{{ completedTodos.length }}</span>
            </div>

            <div v-if="loading" class="empty-card shimmer">正在整理戀愛勳章...</div>
            <div v-else-if="!completedTodos.length" class="empty-card">
              完成後會出現在這裡，像一面專屬於你們的成就牆。
            </div>

            <article v-for="item in completedTodos" :key="item.id" class="todo-card done-card">
              <div class="todo-copy">
                <h4>{{ item.todo }}</h4>
                <p v-if="item.note">{{ item.note }}</p>
              </div>
              <button class="secondary-button" type="button" @click="toggleTodo(item)">改回未完成</button>
            </article>
          </div>
        </div>
      </section>

      <section v-else class="panel panel-memory">
        <div class="panel-head">
          <div>
            <p class="section-tag">Memories</p>
            <h2>回憶紀錄</h2>
          </div>
          <span class="badge">{{ totalLoveScore }} points</span>
        </div>

        <form class="love-form" @submit.prevent="addMemory">
          <label>
            <span>這段回憶的名字</span>
            <input v-model="memoryForm.title" type="text" placeholder="例如：第一次一起逛夜市" />
          </label>

          <label>
            <span>日期</span>
            <input v-model="memoryForm.memory_date" type="date" />
          </label>

          <label>
            <span>把那天的心情寫下來</span>
            <textarea
              v-model="memoryForm.story"
              rows="5"
              placeholder="例如：你笑著幫我擦掉嘴角的醬，我那時候就想把這一幕記一輩子。"
            ></textarea>
          </label>

          <label class="upload-box">
            <input id="memory-image" type="file" accept="image/*" @change="handleImageChange" />
            <span>點這裡上傳回憶照片</span>
            <small>建議先在 Supabase 建立 `memory-images` bucket</small>
          </label>

          <div v-if="previewUrl" class="preview-card">
            <img :src="previewUrl" alt="回憶照片預覽" />
          </div>

          <button class="primary-button" type="submit" :disabled="submittingMemory">
            {{ submittingMemory ? '存進花園中...' : '寫進回憶花園' }}
          </button>
        </form>

        <div class="message-stack">
          <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
          <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        </div>

        <div class="memory-stack">
          <div v-if="loading" class="empty-card shimmer">正在沖洗你們的回憶底片...</div>
          <div v-else-if="!memories.length" class="empty-card">
            第一段回憶還沒放進來，現在就新增一個甜甜瞬間吧。
          </div>

          <article v-for="memory in memories" :key="memory.id" class="memory-card">
            <div class="memory-top">
              <div>
                <span class="date-chip">{{ formatDate(memory.memory_date) }}</span>
                <h3>{{ memory.title }}</h3>
              </div>
              <button class="icon-button" type="button" @click="removeMemory(memory)">刪除</button>
            </div>

            <p>{{ memory.story }}</p>
            <img v-if="memory.image_url" :src="memory.image_url" :alt="memory.title" />
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
