import { useEffect, useState } from 'react'
import api from '../services/api'

type Provider = 'instagram' | 'whatsapp' | 'ads'

interface Connection {
  id: string
  provider: Provider
  page_id: string | null
  ig_business_account_id: string | null
  waba_id: string | null
  ad_account_id: string | null
  status: 'active' | 'expired' | 'needs_reauth' | 'revoked'
  expires_at: string | null
  scopes: string[]
  created_at: string
}

const PROVIDERS: { key: Provider; label: string; icon: string; description: string }[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    icon: '📸',
    description: 'DMs, comentários, publicação de posts e mídias.',
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp Business',
    icon: '💬',
    description: 'Envio de mensagens e templates via WhatsApp Business.',
  },
  {
    key: 'ads',
    label: 'Meta Ads',
    icon: '📊',
    description: 'Gerenciamento e análise de campanhas de anúncios.',
  },
]

const STATUS_LABEL: Record<Connection['status'], string> = {
  active: 'Conectado',
  expired: 'Expirado',
  needs_reauth: 'Reautenticação necessária',
  revoked: 'Revogado',
}

const STATUS_COLOR: Record<Connection['status'], string> = {
  active: 'text-green-400',
  expired: 'text-yellow-400',
  needs_reauth: 'text-orange-400',
  revoked: 'text-red-400',
}

export default function ConexaoMeta() {
  const accountId = localStorage.getItem('tenant_id') ?? localStorage.getItem('account_id') ?? ''
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<Provider | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (accountId) loadConnections()
    else setLoading(false)
  }, [accountId])

  async function loadConnections() {
    try {
      const res = await api.get<Connection[]>('/auth/meta/connections')
      setConnections(res.data)
    } catch {
      setError('Erro ao carregar conexões.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect(provider: Provider) {
    const tid = localStorage.getItem('tenant_id')
    if (!tid) {
      setError('Conta não identificada. Faça login primeiro.')
      return
    }
    setError('')
    setConnecting(provider)
    try {
      const res = await api.get<{ auth_url: string }>('/auth/meta/start', {
        params: { account_id: tid, provider },
      })
      if (res.data.auth_url) {
        window.location.href = res.data.auth_url
      } else {
        setError('Erro ao obter URL de autenticação.')
      }
    } catch {
      setError('Erro de conexão com o servidor.')
    } finally {
      setConnecting(null)
    }
  }

  async function handleDisconnect(connection: Connection) {
    const tid = localStorage.getItem('tenant_id')
    if (!confirm(`Desconectar ${PROVIDERS.find(p => p.key === connection.provider)?.label}?`)) return
    setDisconnecting(connection.id)
    setError('')
    try {
      await api.delete(`/auth/meta/connections/${connection.id}`, {
        params: { account_id: tid },
      })
      setConnections(prev => prev.filter(c => c.id !== connection.id))
    } catch {
      setError('Erro ao desconectar. Tente novamente.')
    } finally {
      setDisconnecting(null)
    }
  }

  function getConnection(provider: Provider): Connection | undefined {
    return connections.find(c => c.provider === provider)
  }

  if (!accountId) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-dark-600 mb-6">Conexão Meta</h2>
        <div className="bg-surface-card rounded-xl border border-dark-50 p-8 max-w-lg text-center">
          <p className="text-dark-400 text-sm">Complete o onboarding para conectar suas contas.</p>
        </div>
      </div>
    )
  }

  const token = localStorage.getItem('access_token')
  if (!token) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-dark-600 mb-6">Conexão Meta</h2>
        <div className="bg-surface-card rounded-xl border border-dark-50 p-8 max-w-lg text-center">
          <p className="text-dark-400 text-sm">Faça login primeiro para conectar suas contas.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-600 mb-2">Conexão Meta</h2>
      <p className="text-dark-400 text-sm mb-6">
        Conecte suas contas do Instagram, WhatsApp e Meta Ads para automatizar a gestão.
      </p>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-900/40 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-dark-400 text-sm">Carregando conexões...</div>
      ) : (
        <div className="grid gap-4 max-w-2xl">
          {PROVIDERS.map(({ key, label, icon, description }) => {
            const conn = getConnection(key)
            const isConnected = conn?.status === 'active'
            const needsAction = conn && conn.status !== 'active'

            return (
              <div
                key={key}
                className="bg-surface-card rounded-xl border border-dark-50 p-6 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-brand-900/40 flex items-center justify-center text-2xl flex-shrink-0">
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-dark-600 font-semibold text-sm">{label}</h3>
                    {conn && (
                      <span className={`text-xs font-medium ${STATUS_COLOR[conn.status]}`}>
                        • {STATUS_LABEL[conn.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-dark-400 text-xs mt-0.5">{description}</p>
                  {conn?.expires_at && (
                    <p className="text-dark-300 text-xs mt-1">
                      Expira em: {new Date(conn.expires_at).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(conn)}
                      disabled={disconnecting === conn.id}
                      className="px-3 py-1.5 bg-red-900/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-900/40 transition-colors disabled:opacity-50"
                    >
                      {disconnecting === conn.id ? 'Removendo...' : 'Desconectar'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(key)}
                      disabled={connecting === key}
                      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/50 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      {connecting === key
                        ? 'Redirecionando...'
                        : needsAction
                        ? 'Reconectar'
                        : 'Conectar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
