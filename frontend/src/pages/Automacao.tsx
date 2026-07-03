import { useEffect, useState } from 'react'
import api from '../services/api'

type TriggerType = 'comment' | 'dm' | 'both'

interface AutomationConfig {
  id: string
  account_id: string
  keyword: string
  auto_reply_message: string
  trigger_type: TriggerType
  media_id: string | null
  comment_reply_message: string | null
  dm_message: string | null
  is_active: boolean
  created_at: string
}

interface MediaItem {
  id: string
  media_type: string
  media_url: string | null
  thumbnail_url: string | null
  caption: string | null
}

const triggerLabel: Record<TriggerType, string> = {
  comment: 'Comentário',
  dm: 'DM / WhatsApp',
  both: 'Comentário + DM/WhatsApp',
}

const emptyForm = {
  keyword: '',
  auto_reply_message: '',
  trigger_type: 'both' as TriggerType,
  media_id: '',
  comment_reply_message: '',
  dm_message: '',
  is_active: true,
}

export default function Automacao() {
  const [automations, setAutomations] = useState<AutomationConfig[]>([])
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadAutomations()
    loadMedia()
  }, [])

  async function loadAutomations() {
    setLoading(true)
    try {
      const res = await api.get('/automations')
      setAutomations(res.data)
    } catch {
      // sem automações ainda ou erro de rede — mantém lista vazia
    } finally {
      setLoading(false)
    }
  }

  async function loadMedia() {
    try {
      const res = await api.get('/instagram/media', { params: { limit: 20 } })
      setMediaList(res.data)
    } catch {
      // Instagram pode não estar conectado ainda — o seletor de post fica vazio
    }
  }

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFeedback(null)
  }

  function startEdit(a: AutomationConfig) {
    setEditingId(a.id)
    setForm({
      keyword: a.keyword,
      auto_reply_message: a.auto_reply_message,
      trigger_type: a.trigger_type,
      media_id: a.media_id || '',
      comment_reply_message: a.comment_reply_message || '',
      dm_message: a.dm_message || '',
      is_active: a.is_active,
    })
    setFeedback(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    const payload = {
      keyword: form.keyword,
      auto_reply_message: form.auto_reply_message,
      trigger_type: form.trigger_type,
      media_id: form.media_id || null,
      comment_reply_message: form.comment_reply_message || null,
      dm_message: form.dm_message || null,
      is_active: form.is_active,
    }
    try {
      if (editingId) {
        await api.put(`/automations/${editingId}`, payload)
      } else {
        await api.post('/automations', payload)
      }
      setFeedback({ type: 'success', message: 'Automação salva com sucesso!' })
      startCreate()
      loadAutomations()
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.detail || 'Erro ao salvar automação.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta automação?')) return
    try {
      await api.delete(`/automations/${id}`)
      if (editingId === id) startCreate()
      loadAutomations()
    } catch {}
  }

  async function handleToggleActive(a: AutomationConfig) {
    try {
      await api.put(`/automations/${a.id}`, { is_active: !a.is_active })
      loadAutomations()
    } catch {}
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#e2e2e8] mb-2">Automação</h2>
      <p className="text-[#555] text-sm mb-6">
        Responda automaticamente comentários e DMs do Instagram (e mensagens do WhatsApp) por palavra-chave —
        incluindo o disparo de uma DM privada a partir de um comentário público.
      </p>

      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm max-w-2xl ${feedback.type === 'success' ? 'bg-green-900/20 border border-green-500/20 text-green-400' : 'bg-red-900/20 border border-red-500/20 text-red-400'}`}>
          {feedback.message}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <form onSubmit={handleSave} className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 space-y-4 h-fit">
          <h3 className="text-[#e2e2e8] font-semibold text-sm">
            {editingId ? 'Editar automação' : 'Nova automação'}
          </h3>

          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">Palavra-chave</label>
            <input
              type="text"
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              placeholder="Ex: QUERO"
              required
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333] text-sm"
            />
            <p className="text-xs text-[#444] mt-1">Ativa quando o texto (comentário, DM ou mensagem de WhatsApp) contém esta palavra.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">Onde disparar</label>
            <select
              value={form.trigger_type}
              onChange={(e) => setForm({ ...form, trigger_type: e.target.value as TriggerType })}
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg text-sm"
            >
              <option value="both">Comentário + DM/WhatsApp</option>
              <option value="comment">Somente comentário do Instagram</option>
              <option value="dm">Somente DM do Instagram / WhatsApp</option>
            </select>
          </div>

          {(form.trigger_type === 'comment' || form.trigger_type === 'both') && (
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Restringir a um post (opcional)</label>
              <select
                value={form.media_id}
                onChange={(e) => setForm({ ...form, media_id: e.target.value })}
                className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg text-sm"
              >
                <option value="">Todos os posts</option>
                {mediaList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.caption || m.media_type || m.id).slice(0, 60)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[#444] mt-1">Se a lista estiver vazia, conecte o Instagram em "Conexão Meta" primeiro.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">Mensagem padrão (fallback)</label>
            <textarea
              value={form.auto_reply_message}
              onChange={(e) => setForm({ ...form, auto_reply_message: e.target.value })}
              rows={3}
              required
              placeholder="Usada como resposta de DM/WhatsApp e como resposta pública do comentário quando os campos abaixo não forem preenchidos."
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg resize-none placeholder-[#333] text-sm"
            />
          </div>

          {(form.trigger_type === 'comment' || form.trigger_type === 'both') && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">Resposta pública no comentário (opcional)</label>
                <textarea
                  value={form.comment_reply_message}
                  onChange={(e) => setForm({ ...form, comment_reply_message: e.target.value })}
                  rows={2}
                  placeholder="Ex: Te chamei no direto! 📩"
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg resize-none placeholder-[#333] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1">DM automática ao comentar (opcional)</label>
                <textarea
                  value={form.dm_message}
                  onChange={(e) => setForm({ ...form, dm_message: e.target.value })}
                  rows={3}
                  placeholder="Mensagem privada enviada por DM para quem comentou com a palavra-chave."
                  className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg resize-none placeholder-[#333] text-sm"
                />
                <p className="text-xs text-[#444] mt-1">
                  A Meta só permite 1 DM privada por comentário e até 7 dias depois dele — reenvios no mesmo comentário falham silenciosamente.
                </p>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-[#888]">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-white/[0.08]"
            />
            Ativa
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar automação'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={startCreate}
                className="px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#666] rounded-lg text-sm hover:bg-white/[0.04] transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div>
          <h3 className="text-[#e2e2e8] font-semibold text-sm mb-3">Automações cadastradas</h3>
          {loading ? (
            <div className="text-[#555] text-sm">Carregando...</div>
          ) : automations.length === 0 ? (
            <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 text-center">
              <p className="text-[#555] text-sm">Nenhuma automação cadastrada ainda.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((a) => (
                <div key={a.id} className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-[#e2e2e8]">"{a.keyword}"</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-white/[0.04] text-[#888]">{triggerLabel[a.trigger_type]}</span>
                        {a.media_id && <span className="text-xs px-2 py-0.5 rounded bg-white/[0.04] text-[#888]">1 post específico</span>}
                        <span className={`text-xs font-medium ${a.is_active ? 'text-green-400' : 'text-[#555]'}`}>
                          {a.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                      <p className="text-[#888] text-xs truncate">{a.auto_reply_message}</p>
                      {a.dm_message && (
                        <p className="text-[#666] text-xs truncate mt-1">📩 DM: {a.dm_message}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(a)}
                        className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-[#888] rounded-lg text-xs font-medium transition-colors"
                      >
                        {a.is_active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => startEdit(a)}
                        className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-lg text-xs font-medium transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="px-2.5 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg text-xs font-medium transition-colors"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
