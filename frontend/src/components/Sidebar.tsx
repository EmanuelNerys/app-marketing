import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Clapperboard, Megaphone, Link2, Send,
  Zap, Users, Settings, CreditCard, Building2, LogOut,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import api from '../services/api'
import AccountSwitcher from './AccountSwitcher'

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

const baseLinks: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/studio', label: 'Studio de Criação', icon: Clapperboard },
  { to: '/app/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/app/conexao', label: 'Conexão Meta', icon: Link2 },
  { to: '/app/publicar', label: 'Publicar', icon: Send },
  { to: '/app/automacao', label: 'Automação', icon: Zap },
  { to: '/app/leads', label: 'Leads', icon: Users },
]

const bottomLinks: NavItem[] = [
  { to: '/app/configuracoes', label: 'Configurações', icon: Settings },
  { to: '/pricing', label: 'Planos', icon: CreditCard },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const [planType, setPlanType] = useState<string | null>(null)

  useEffect(() => {
    api.get('/auth/me').then(({ data }) => {
      if (data?.plan_type) setPlanType(data.plan_type)
    }).catch(() => {})
  }, [])

  const mainLinks = baseLinks
  const isAgency = planType === 'agencia'

  function handleLogout() {
    localStorage.clear()
    navigate('/login')
  }

  return (
    <aside className="w-64 bg-[#07070c] min-h-screen flex flex-col border-r border-white/[0.05]">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 group"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Clapperboard size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white">
            ad<span className="text-indigo-400">Studio</span>AI
          </span>
        </button>
      </div>

      {/* Account switcher (agência ↔ clientes) */}
      <AccountSwitcher />

      {/* Main nav */}
      <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3a3a4a] px-2 mb-2 mt-1">
          Principal
        </p>
        {mainLinks.map((link) => {
          const Icon = link.icon
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={'end' in link ? link.end : false}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                    : 'text-[#5a5a6e] hover:bg-white/[0.04] hover:text-[#c0c0d0]'
                }`
              }
            >
              <Icon size={15} strokeWidth={1.75} />
              <span className="flex-1">{link.label}</span>
            </NavLink>
          )
        })}

        {isAgency && (
          <>
            <div className="h-px bg-white/[0.05] my-3 mx-2" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3a3a4a] px-2 mb-2">
              Agência
            </p>
            <NavLink
              to="/app/clientes"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                    : 'text-[#5a5a6e] hover:bg-white/[0.04] hover:text-[#c0c0d0]'
                }`
              }
            >
              <Building2 size={15} strokeWidth={1.75} />
              <span className="flex-1">Clientes</span>
              <ChevronRight size={12} className="opacity-40" />
            </NavLink>
          </>
        )}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-4 border-t border-white/[0.05] pt-3 flex flex-col gap-0.5">
        {bottomLinks.map((link) => {
          const Icon = link.icon
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                    : 'text-[#5a5a6e] hover:bg-white/[0.04] hover:text-[#c0c0d0]'
                }`
              }
            >
              <Icon size={15} strokeWidth={1.75} />
              {link.label}
            </NavLink>
          )
        })}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#5a5a6e] hover:bg-white/[0.04] hover:text-red-400 transition-all w-full mt-1"
        >
          <LogOut size={15} strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </aside>
  )
}
