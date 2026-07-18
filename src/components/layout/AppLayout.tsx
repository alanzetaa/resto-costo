import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="rc-app-layout">
      <Sidebar />
      <main className="rc-main">
        <Outlet />
      </main>
    </div>
  )
}
