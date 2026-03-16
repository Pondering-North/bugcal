import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import BugCalendar from './BugCal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BugCalendar />
  </StrictMode>
)
