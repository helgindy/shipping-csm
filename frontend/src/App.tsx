import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import CreateLabel from './components/CreateLabel'
import ScanForms from './components/ScanForms'
import Settings from './components/Settings'

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-dark-950">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/create" element={<CreateLabel />} />
            <Route path="/scanforms" element={<ScanForms />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
