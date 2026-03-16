/**
 * BugCal embed entry point.
 *
 * Drop these two lines anywhere on your website and BugCal renders itself:
 *
 *   <div id="bugcal-root"></div>
 *   <script type="module" src="bugcal.embed.js"></script>
 *
 * Optional: override the mount target ID via a data attribute:
 *   <div id="my-calendar" data-bugcal></div>
 *   BugCal will find the first [data-bugcal] element if #bugcal-root is absent.
 */
import { createRoot } from 'react-dom/client'
import BugCalendar from './BugCal.jsx'

function mount() {
  const target =
    document.getElementById('bugcal-root') ||
    document.querySelector('[data-bugcal]')

  if (!target) {
    console.warn('[BugCal] No mount target found. Add <div id="bugcal-root"></div> to your page.')
    return
  }

  createRoot(target).render(<BugCalendar />)
}

// Mount immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
