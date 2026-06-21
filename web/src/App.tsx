import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Sessions from './pages/Sessions'
import CreateSession from './pages/CreateSession'
import LiveSession from './pages/LiveSession'
import Resumes from './pages/Resumes'
import Documents from './pages/Documents'
import Settings from './pages/Settings'
import TranscriptViewer from './pages/TranscriptViewer'
import Analytics from './pages/Analytics'
import Help from './pages/Help'
import ConversationMode from './pages/ConversationMode'


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/new" element={<CreateSession />} />
          <Route path="sessions/:id/live" element={<LiveSession />} />
          <Route path="sessions/:id/transcript" element={<TranscriptViewer />} />
          <Route path="sessions/:id/conversation" element={<ConversationMode />} />

          <Route path="resumes" element={<Resumes />} />
          <Route path="documents" element={<Documents />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
