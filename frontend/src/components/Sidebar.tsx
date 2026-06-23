import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import api from '../services/api'

const baseLinks = [
  { to: '/app', label: 'Dashboard', icon: '📊' },
  { to: '/app/studio', label: 'Studio de Criação', icon: '🎬' },
  { to: '/app/marketing', label: 'Marketing', icon: '📈' },
  { to: '/app/conexao', label: 'Conexão Meta', icon: '🔗' },
  { to: '/app/publicar', label: 'Publicar', icon: '📤' },
  { to: '/app/automacao', label: 'Automação', icon: '⚙️' },
  { to: '/app/leads', label: 'Leads', icon: '👥' },
  { to: '/app/configuracoes', label: 'Configurações', icon: '⚡' },
  { to: '/pricing', label: 'Planos', icon: '💰' },
]

const planosAgencia = ['pro', 'premium']

export default function Sidebar() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<string | null>(null)

  useEffect(() => {
    api.get('/payments/current').then(({ data }) => {
      if (data?.plan) setPlan(data.plan)
    }).catch(() => {})
  }, [])

  const links = plan && planosAgencia.includes(plan)
    ? [...baseLinks.slice(0, 7), { to: '/app/clientes', label: 'Clientes', icon: '🏢' }, ...baseLinks.slice(7)]
    : baseLinks

  return (
    <aside className="w-64 bg-[#0a0a0f] min-h-screen p-4 flex flex-col border-r border-white/[0.06]">
      <button onClick={() => navigate('/')} className="text-base font-semibold text-white mb-8 px-3 hover:text-indigo-400 transition-colors text-left">
        ad<span className="text-indigo-400">Studio</span>AI
      </button>
      <nav className="flex flex-col gap-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-[#666] hover:bg-[#111118] hover:text-[#e2e2e8]'
              }`
            }
          >
            <span>{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-6 border-t border-white/[0.06]">
        <button onClick={() => navigate('/login')} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#666] hover:bg-[#111118] hover:text-[#e2e2e8] transition-colors">
          <span>🚪</span>
          Sair
        </button>
      </div>
    </aside>
  )
}
