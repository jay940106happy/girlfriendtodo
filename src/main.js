import { createApp } from 'vue'
import App from './App.vue'
import MapPage from './MapPage.vue'
import AdminPage from './AdminPage.vue'
import './styles.css'

const path = window.location.pathname.replace(/\/+$/, '') || '/'
const RootComponent = path === '/map' ? MapPage : path === '/admin' ? AdminPage : App

createApp(RootComponent).mount('#app')

if (path === '/') {
  const mapLink = document.createElement('a')
  mapLink.href = '/map'
  mapLink.textContent = '♡ 地圖'
  mapLink.className = 'global-map-link'
  document.body.appendChild(mapLink)
}
