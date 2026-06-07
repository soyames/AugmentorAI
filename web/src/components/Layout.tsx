import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, MessageSquare, BarChart3, FileText, FolderOpen, HelpCircle, Menu, X, Settings } from 'lucide-react'
import Logo from './Logo'

const mainNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/sessions', icon: MessageSquare, label: 'Call Sessions' },
]

const resourceNavItems = [
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/resumes', icon: FileText, label: 'CVs / Resumes' },
  { path: '/documents', icon: FolderOpen, label: 'Documents' },
]

const bottomNavItems = [
  { path: '/help', icon: HelpCircle, label: 'Get Help' },
]

export default function Layout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const NavLink = ({ item, onClick }: { item: typeof mainNavItems[0]; onClick?: () => void }) => {
    const isActive = location.pathname === item.path
    return (
      <Link
        to={item.path}
        onClick={onClick}
        className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
      >
        <item.icon size={20} />
        <span>{item.label}</span>
      </Link>
    )
  }

  const closeSidebar = () => setSidebarOpen(false)

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 sm:p-6">
        <Logo />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 sm:px-4 space-y-1 overflow-y-auto">
        {mainNavItems.map((item) => (
          <NavLink key={item.path} item={item} onClick={closeSidebar} />
        ))}

        <div className="h-px bg-gray-200 my-3 sm:my-4" />

        {resourceNavItems.map((item) => (
          <NavLink key={item.path} item={item} onClick={closeSidebar} />
        ))}

        <div className="h-px bg-gray-200 my-3 sm:my-4" />

        {bottomNavItems.map((item) => (
          <NavLink key={item.path} item={item} onClick={closeSidebar} />
        ))}
      </nav>

      <div className="p-3 sm:p-4">
        <Link
          to="/settings"
          onClick={closeSidebar}
          className="flex items-center justify-center gap-2 w-full text-center bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          <Settings size={18} />
          Settings
        </Link>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 sm:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-30 sm:hidden bg-white shadow-md rounded-lg p-2.5 hover:bg-gray-50 transition-colors"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed sm:relative inset-y-0 left-0 z-20
        w-64 sm:w-72
        bg-white border-r border-gray-200 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
      `}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto pt-14 sm:pt-0">
        <Outlet />
      </main>
    </div>
  )
}
