import { NavLink, useNavigate } from 'react-router-dom'

const links = [
  { to: '/app', label: 'Dashboard', icon: '📊' },
  { to: '/app/conexao', label: 'Conexão Meta', icon: '🔗' },
  { to: '/app/automacao', label: 'Automação', icon: '⚙️' },
  { to: '/app/leads', label: 'Leads', icon: '👥' },
  { to: '/app/configuracoes', label: 'Configurações', icon: '⚡' },
]

export default function Sidebar() {
  const navigate = useNavigate()

  return (
    <aside className="w-64 bg-dark min-h-screen p-4 flex flex-col border-r border-dark-50">
      <button onClick={() => navigate('/')} className="text-xl font-bold text-white mb-8 px-3 hover:text-brand-400 transition-colors text-left">
        App Marketing
      </button>
      <nav className="flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-dark-400 hover:bg-surface-card hover:text-dark-600'
              }`
            }
          >
            <span>{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-6 border-t border-dark-50">
        <button onClick={() => navigate('/login')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-dark-400 hover:bg-surface-card hover:text-dark-600 transition-colors">
          <span>🚪</span>
          Sair
        </button>
      </div>
    </aside>
  )
}
