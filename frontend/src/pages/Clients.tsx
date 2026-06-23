import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface Client {
  id: string
  brand_name: string
  username: string
  full_name: string | null
  is_active: boolean
  plan: string
  created_at: string
}

export default function Clients() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // modal criar
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createFullName, setCreateFullName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    try {
      const { data } = await api.get('/auth/clients')
      setClients(data)
    } catch {
      setError('Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    if (!createName.trim() || !createUsername.trim() || !createPassword.trim()) {
      setCreateError('Preencha todos os campos obrigatórios.')
      return
    }
    setCreating(true)
    try {
      await api.post('/auth/clients', {
        brand_name: createName.trim(),
        username: createUsername.trim(),
        password: createPassword,
        full_name: createFullName.trim() || null,
      })
      setShowCreate(false)
      setCreateName('')
      setCreateUsername('')
      setCreatePassword('')
      setCreateFullName('')
      await loadClients()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Erro ao criar cliente.')
    } finally {
      setCreating(false)
    }
  }

  async function handleImpersonate(clientId: string) {
    try {
      const { data } = await api.post(`/auth/clients/${clientId}/impersonate`)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      localStorage.setItem('user_id', data.user_id)
      localStorage.setItem('tenant_id', data.tenant_id)
      localStorage.setItem('impersonating', 'true')
      localStorage.setItem('impersonating_name', data.client_brand_name)
      navigate('/app')
    } catch {
      alert('Erro ao acessar conta do cliente.')
    }
  }

  async function handleDelete(clientId: string) {
    if (!confirm('Tem certeza que deseja desativar este cliente?')) return
    try {
      await api.delete(`/auth/clients/${clientId}`)
      await loadClients()
    } catch {
      alert('Erro ao remover cliente.')
    }
  }

  const planLabel: Record<string, string> = {
    free: 'Grátis',
    starter: 'Iniciante',
    pro: 'Profissional',
    premium: 'Premium',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#e2e2e8]">Meus Clientes</h2>
          <p className="text-[#555] text-sm mt-1">Gerencie as contas dos seus clientes como agência.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Novo Cliente
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {loading ? (
        <div className="text-[#555] text-sm">Carregando clientes...</div>
      ) : clients.length === 0 ? (
        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-16 text-center">
          <div className="text-6xl mb-6">🏢</div>
          <h3 className="text-xl font-semibold text-[#e2e2e8] mb-2">Nenhum cliente ainda</h3>
          <p className="text-[#555] max-w-md mx-auto mb-6">
            Crie contas para seus clientes e gerencie tudo de um só lugar.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Criar primeiro cliente
          </button>
        </div>
      ) : (
        <div className="grid gap-4 max-w-3xl">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-[#111118] rounded-xl border border-white/[0.06] p-5 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
                {client.brand_name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[#e2e2e8] font-semibold text-sm">{client.brand_name}</h3>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    client.is_active ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
                  }`}>
                    {client.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                  <span className="text-[10px] text-[#444] px-1.5 py-0.5 rounded bg-white/[0.04]">
                    {planLabel[client.plan] || client.plan}
                  </span>
                </div>
                <p className="text-[#555] text-xs mt-0.5">@{client.username}</p>
                <p className="text-[#444] text-[10px] mt-0.5">
                  Criado em {new Date(client.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleImpersonate(client.id)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Acessar
                </button>
                <button
                  onClick={() => handleDelete(client.id)}
                  className="px-3 py-1.5 bg-red-900/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-900/40 transition-colors"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL CRIAR CLIENTE */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#111118] border border-white/[0.08] rounded-2xl p-8 w-full max-w-md">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-white">Novo Cliente</h3>
              <p className="text-xs text-[#555] mt-1.5">Crie uma conta para seu cliente gerenciar.</p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="bg-red-900/20 border border-red-500/20 text-red-400 text-xs rounded-lg px-4 py-3 text-center">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Nome da empresa/cliente *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Ex: Padaria do João"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Nome de usuário *</label>
                <input
                  type="text"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  placeholder="Ex: padariajoao"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Senha *</label>
                <input
                  type="password"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Nome completo (opcional)</label>
                <input
                  type="text"
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-white/[0.08] text-[#666] hover:text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {creating ? 'Criando...' : 'Criar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
