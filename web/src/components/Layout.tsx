import { Outlet, Link, useLocation } from 'react-router-dom'
import { Home, MessageSquare, BarChart3, FileText, FolderOpen, HelpCircle } from 'lucide-react'
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

  const NavLink = ({ item }: { item: typeof mainNavItems[0] }) => {
    const isActive = location.pathname === item.path
    return (
      <Link
        to={item.path}
        className={isActive ? 'sidebar-link-active' : 'sidebar-link'}
      >
        <item.icon size={20} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="p-6">
          <Logo />
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-4 space-y-1">
          {mainNavItems.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}

          <div className="h-px bg-gray-200 my-4" />

          {resourceNavItems.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}

          <div className="h-px bg-gray-200 my-4" />

          {bottomNavItems.map((item) => (
            <NavLink key={item.path} item={item} />
          ))}
        </nav>

        <div className="p-4">
          <Link
            to="/settings"
            className="block w-full text-center bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            Settings
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
