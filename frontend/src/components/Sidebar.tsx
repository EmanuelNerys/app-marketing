import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Clapperboard, Megaphone, Link2, Send,
  Zap, Users, Settings, CreditCard, Building2, LogOut,
  ChevronRight,
} from 'lucide-react'
import api from '../services/api'

const baseLinks = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/studio', label: 'Studio de Criação', icon: Clapperboard },
  { to: '/app/marketing', label: 'Marketing', icon: Megaphone },
  { to: '/app/conexao', label: 'Conexão Meta', icon: Link2 },
  { to: '/app/publicar', label: 'Publicar', icon: Send },
  { to: '/app/automacao', label: 'Automação', icon: Zap },
  { to: '/app/leads', label: 'Leads', icon: Users },
]

const bottomLinks = [
  { to: '/app/configuracoes', label: 'Configurações', icon: Settings },
  { to: '/pricing', label: 'Planos', icon: CreditCard },
]

const agencyLink = { to: '/app/clientes', label: 'Clientes', icon: Building2 }

const planosAgencia = ['pro', 'premium']

export default function Sidebar() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  useEffect(() => {
    api.get('/payments/current').then(({ data }) => {
      if (data?.plan) setPlan(data.plan)
    }).catch(() => {})

    const imp = localStorage.getItem('impersonating_name')
    if (localStorage.getItem('impersonating') === 'true' && imp) {
      setImpersonating(imp)
    }
  }, [])

  const mainLinks = plan && planosAgencia.includes(plan)
    ? [...baseLinks, agencyLink]
    : baseLinks

  function handleLogout() {
    localStorage.clear()
    navigate('/login')
  }

  function handleExitImpersonation() {
    localStorage.removeItem('impersonating')
    localStorage.removeItem('impersonating_name')
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

      {/* Impersonation banner */}
      {impersonating && (
        <div className="mx-3 mb-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-[10px] text-amber-400 font-medium leading-tight">Acessando como</p>
          <p className="text-xs text-amber-300 font-semibold truncate">{impersonating}</p>
          <button
            onClick={handleExitImpersonation}
            className="text-[10px] text-amber-500 hover:text-amber-400 mt-1 underline"
          >
            Sair desta conta
          </button>
        </div>
      )}

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

        {plan && planosAgencia.includes(plan) && (
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
