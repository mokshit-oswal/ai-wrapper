import { mountApp } from './App'

const root = document.getElementById('app')
if (!root) throw new Error('#app missing')
void mountApp(root)
