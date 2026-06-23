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

type ModalState = 'waiting' | 'success' | null

export default function ConexaoMeta() {
  const accountId = localStorage.getItem('tenant_id') ?? localStorage.getItem('account_id') ?? ''
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<Provider | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<{ state: ModalState; provider: Provider | null; username?: string }>({
    state: null,
    provider: null,
  })

  useEffect(() => {
    if (accountId) loadConnections()
    else setLoading(false)
  }, [accountId])

  useEffect(() => {
    // Recebe mensagem do popup OAuth quando conectar com sucesso
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'OAUTH_SUCCESS' && event.data?.provider === 'instagram') {
        setConnecting(null)
        setModal({ state: 'success', provider: 'instagram', username: event.data.username || '' })
        loadConnections()
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

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
    setModal({ state: 'waiting', provider })

    try {
      const endpoint = provider === 'instagram' ? '/auth/instagram/start' : '/auth/meta/start'
      const params: Record<string, string> = provider === 'instagram'
        ? { account_id: tid }
        : { account_id: tid, provider }
      const res = await api.get<{ auth_url: string }>(endpoint, { params })

      if (!res.data.auth_url) {
        setError('Erro ao obter URL de autenticação.')
        setConnecting(null)
        setModal({ state: null, provider: null })
        return
      }

      const w = 520, h = 700
      const left = Math.round((window.screen.width - w) / 2)
      const top = Math.round((window.screen.height - h) / 2)
      const popup = window.open(
        res.data.auth_url,
        'oauth_popup',
        `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`,
      )

      if (!popup) {
        window.location.href = res.data.auth_url
        return
      }

      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type === 'OAUTH_SUCCESS') {
          cleanup()
          setConnecting(null)
          setModal({ state: 'success', provider, username: event.data.username || '' })
          loadConnections()
        }
      }
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          cleanup()
          setConnecting(null)
          setModal(prev => prev.state === 'waiting' ? { state: null, provider: null } : prev)
        }
      }, 500)
      const cleanup = () => {
        clearInterval(pollTimer)
        window.removeEventListener('message', onMessage)
      }
      window.addEventListener('message', onMessage)
    } catch {
      setError('Erro de conexão com o servidor.')
      setConnecting(null)
      setModal({ state: null, provider: null })
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

  function closeModal() {
    setModal({ state: null, provider: null })
  }

  if (!accountId) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-[#e2e2e8] mb-6">Conexão Meta</h2>
        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 max-w-lg text-center">
          <p className="text-[#555] text-sm">Complete o onboarding para conectar suas contas.</p>
        </div>
      </div>
    )
  }

  const token = localStorage.getItem('access_token')
  if (!token) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-[#e2e2e8] mb-6">Conexão Meta</h2>
        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 max-w-lg text-center">
          <p className="text-[#555] text-sm">Faça login primeiro para conectar suas contas.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#e2e2e8] mb-2">Conexão Meta</h2>
      <p className="text-[#555] text-sm mb-6">
        Conecte suas contas do Instagram, WhatsApp e Meta Ads para automatizar a gestão.
      </p>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[#555] text-sm">Carregando conexões...</div>
      ) : (
        <div className="grid gap-4 max-w-2xl">
          {PROVIDERS.map(({ key, label, icon, description }) => {
            const conn = getConnection(key)
            const isConnected = conn?.status === 'active'
            const needsAction = conn && conn.status !== 'active'

            return (
              <div
                key={key}
                className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-2xl flex-shrink-0">
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[#e2e2e8] font-semibold text-sm">{label}</h3>
                    {conn && (
                      <span className={`text-xs font-medium ${STATUS_COLOR[conn.status]}`}>
                        • {STATUS_LABEL[conn.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-[#555] text-xs mt-0.5">{description}</p>
                  {conn?.expires_at && (
                    <p className="text-[#444] text-xs mt-1">
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
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      {connecting === key ? 'Aguardando...' : needsAction ? 'Reconectar' : 'Conectar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de conexão OAuth */}
      {modal.state !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111118] border border-white/[0.08] rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl">
            {/* Header com gradiente Instagram */}
            <div className="h-1.5 bg-gradient-to-r from-[#f09433] via-[#e6683c] via-[#dc2743] via-[#cc2366] to-[#bc1888]" />

            <div className="p-8 flex flex-col items-center text-center">
              {modal.state === 'waiting' ? (
                <>
                  {/* Ícone animado */}
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center mb-5 shadow-lg">
                    <span className="text-3xl">📸</span>
                  </div>
                  <h3 className="text-[#e2e2e8] font-semibold text-base mb-2">Conectando Instagram</h3>
                  <p className="text-[#555] text-sm mb-6">
                    Autorize o acesso na janela do Instagram que abriu. Aguardando...
                  </p>
                  {/* Spinner */}
                  <div className="flex gap-1.5 mb-6">
                    {[0, 1, 2].map(i => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-indigo-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={closeModal}
                    className="text-[#444] text-xs hover:text-[#666] transition-colors"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  {/* Sucesso */}
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center mb-5 shadow-lg">
                    <span className="text-3xl">📸</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center -mt-10 ml-10 mb-3 border-2 border-[#111118]">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-[#e2e2e8] font-semibold text-base mb-1">Instagram conectado!</h3>
                  {modal.username && (
                    <p className="text-indigo-400 text-sm font-medium mb-1">@{modal.username}</p>
                  )}
                  <p className="text-[#555] text-xs mb-6">
                    Sua conta está pronta para DMs, comentários e publicações.
                  </p>
                  <button
                    onClick={closeModal}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
