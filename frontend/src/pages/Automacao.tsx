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
      <h2 className="text-2xl font-bold text-[#e2e2e8] mb-6">Automação</h2>
      <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 max-w-lg">
        {feedback && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${feedback.type === 'success' ? 'bg-green-900/20 border border-green-500/20 text-green-400' : 'bg-red-900/20 border border-red-500/20 text-red-400'}`}>
            {feedback.message}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[#666] mb-1">Palavra-chave</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ex: QUERO"
              className="w-full px-4 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333]"
            />
            <p className="text-xs text-[#444] mt-1">Comentários no Instagram com esta palavra ativarão a resposta automática.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#666] mb-1">Mensagem de Resposta Automática</label>
            <textarea
              value={autoReplyMessage}
              onChange={(e) => setAutoReplyMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none resize-none placeholder-[#333]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold rounded-xl transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </form>
      </div>
    </div>
  )
}
