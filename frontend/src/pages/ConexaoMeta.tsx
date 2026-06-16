import { useState } from 'react'

export default function ConexaoMeta() {
  const [connected] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/meta/login')
      const data = await res.json()
      if (data.auth_url) {
        window.location.href = data.auth_url
      } else {
        setError('Erro ao obter URL de autenticação. Verifique se o META_APP_ID está configurado.')
      }
    } catch {
      setError('Erro de conexão com o servidor. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-600 mb-6">Conexão Meta</h2>
      <div className="bg-surface-card rounded-xl border border-dark-50 p-8 max-w-lg">
        {connected ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-900/40 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">✅</span>
            </div>
            <h3 className="text-lg font-semibold text-dark-600">Conta Conectada</h3>
            <p className="text-sm text-dark-400">Sua página do Facebook/Instagram está vinculada.</p>
            <button className="mt-4 px-4 py-2 bg-red-900/30 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/50 transition-colors">Desconectar</button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-brand-900/50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🔗</span>
            </div>
            <h3 className="text-lg font-semibold text-dark-600">Conectar Conta Meta</h3>
            <p className="text-sm text-dark-400">Conecte sua página do Facebook/Instagram para começar a automatizar a captação de leads.</p>
            {error && (
              <div className="bg-red-900/20 border border-red-900/40 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
            )}
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full py-3 px-6 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/50 text-white font-semibold rounded-xl transition-colors shadow-md"
            >
              {loading ? 'Conectando...' : 'Conectar com Facebook'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
