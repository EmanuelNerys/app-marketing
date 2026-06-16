import { useState, useEffect } from 'react'
import api from '../services/api'

export default function Automacao() {
  const [keyword, setKeyword] = useState('QUERO')
  const [autoReplyMessage, setAutoReplyMessage] = useState('Olá! Recebemos seu interesse. Em breve entraremos em contato.')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    api.get('/automations').then((res) => {
      const configs = res.data
      if (configs.length > 0) {
        setKeyword(configs[0].keyword)
        setAutoReplyMessage(configs[0].auto_reply_message)
      }
    }).catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      await api.post('/automation/config', {
        keyword,
        auto_reply_message: autoReplyMessage,
        account_id: '0000',
      })
      setFeedback({ type: 'success', message: 'Configuração salva com sucesso!' })
    } catch {
      setFeedback({ type: 'error', message: 'Erro ao salvar configuração.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-600 mb-6">Automação</h2>
      <div className="bg-surface-card rounded-xl border border-dark-50 p-8 max-w-lg">
        {feedback && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${feedback.type === 'success' ? 'bg-green-900/20 border border-green-900/40 text-green-400' : 'bg-red-900/20 border border-red-900/40 text-red-400'}`}>
            {feedback.message}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-dark-500 mb-1">Palavra-chave</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ex: QUERO"
              className="w-full px-4 py-2 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300"
            />
            <p className="text-xs text-dark-300 mt-1">Comentários no Instagram com esta palavra ativarão a resposta automática.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-500 mb-1">Mensagem de Resposta Automática</label>
            <textarea
              value={autoReplyMessage}
              onChange={(e) => setAutoReplyMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none resize-none placeholder-dark-300"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-6 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/50 text-white font-semibold rounded-xl transition-colors shadow-md"
          >
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </form>
      </div>
    </div>
  )
}
