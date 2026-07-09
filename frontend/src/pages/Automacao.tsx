import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, UserCheck, Camera, Plus } from 'lucide-react'
import api from '../services/api'

interface AutomationConfig {
  id: string
  account_id: string
  keyword: string
  auto_reply_message: string
  trigger_type: string
  media_id: string | null
  comment_reply_message: string | null
  dm_message: string | null
  link_message: string | null
  handoff_to_human: boolean
  is_active: boolean
  created_at: string
}

const emptyForm = {
  keyword: '',
  auto_reply_message: '',
  handoff_to_human: false,
}

export default function Automacao() {
  const [automations, setAutomations] = useState<AutomationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => { loadAutomations() }, [])

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

  // Bots de mensagem = automações sem post associado (DM/WhatsApp por palavra-chave)
  const messageBots = automations.filter((a) => !a.media_id)
  // Funis de post = criados na aba Publicar (amarrados a um post específico)
  const postFunnels = automations.filter((a) => !!a.media_id)

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
      handoff_to_human: a.handoff_to_human,
    })
    setFeedback(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    // Bot de mensagem: sempre trigger_type "dm" (cobre DM do Instagram + WhatsApp),
    // nunca amarrado a post (funil de post é criado na aba Publicar).
    const payload = {
      keyword: form.keyword,
      auto_reply_message: form.auto_reply_message,
      trigger_type: 'dm',
      handoff_to_human: form.handoff_to_human,
      is_active: true,
    }
    try {
      if (editingId) {
        await api.put(`/automations/${editingId}`, payload)
      } else {
        await api.post('/automations', payload)
      }
      setFeedback({ type: 'success', message: 'Bot de mensagem salvo!' })
      startCreate()
      loadAutomations()
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.response?.data?.detail || 'Erro ao salvar.' })
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
      <h2 className="text-2xl font-bold text-[#e2e2e8] mb-1">Automação</h2>
      <p className="text-[#555] text-sm mb-6">
        Bots de resposta automática por palavra-chave no direto e no WhatsApp.
        Os funis de comentário são criados junto com o post, na aba{' '}
        <Link to="/app/publicar" className="text-indigo-400">Publicar</Link>.
      </p>

      {feedback && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm max-w-2xl ${feedback.type === 'success' ? 'bg-green-900/20 border border-green-500/20 text-green-400' : 'bg-red-900/20 border border-red-500/20 text-red-400'}`}>
          {feedback.message}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------- Bot de mensagem (form) ---------- */}
        <form onSubmit={handleSave} className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 space-y-4 h-fit">
          <h3 className="text-[#e2e2e8] font-semibold text-sm flex items-center gap-2">
            <MessageSquare size={15} className="text-emerald-400" />
            {editingId ? 'Editar bot de mensagem' : 'Novo bot de mensagem'}
          </h3>
          <p className="text-[11px] text-[#555] -mt-1">
            Quando alguém mandar essa palavra-chave no <b>direto do Instagram ou no WhatsApp</b>, o bot responde automaticamente.
          </p>

          <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-lg px-3 py-2">
            <p className="text-[10px] text-[#666] mb-1">Personalize com variáveis:</p>
            <div className="flex flex-wrap gap-1.5">
              {['{{primeiro_nome}}', '{{nome}}', '{{usuario}}'].map((v) => (
                <code key={v} className="text-[10px] bg-black/30 text-indigo-200 px-1.5 py-0.5 rounded">{v}</code>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">Palavra-chave</label>
            <input
              type="text"
              value={form.keyword}
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              placeholder="Ex: PREÇO"
              required
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333] text-sm"
            />
            <p className="text-xs text-[#444] mt-1">Ativa quando a mensagem contém esta palavra.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#666] mb-1">Resposta automática</label>
            <textarea
              value={form.auto_reply_message}
              onChange={(e) => setForm({ ...form, auto_reply_message: e.target.value })}
              rows={3}
              required
              placeholder="Oi {{primeiro_nome}}! Nossos planos começam em R$97/mês..."
              className="w-full px-3 py-2 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] rounded-lg resize-none placeholder-[#333] text-sm"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${form.handoff_to_human ? 'bg-indigo-500' : 'bg-white/[0.1]'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.handoff_to_human ? 'left-4' : 'left-0.5'}`} />
            </span>
            <input
              type="checkbox"
              checked={form.handoff_to_human}
              onChange={(e) => setForm({ ...form, handoff_to_human: e.target.checked })}
              className="hidden"
            />
            <span className="text-sm text-[#c0c0d0] flex items-center gap-1.5">
              <UserCheck size={13} className="text-amber-400" />
              Passar para atendente depois de responder
            </span>
          </label>
          <p className="text-[11px] text-[#555] -mt-2 ml-11">
            O bot responde uma vez e a conversa vai para a fila "Espera" do atendimento humano.
          </p>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar bot'}
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

        {/* ---------- Listas ---------- */}
        <div className="space-y-6">
          {/* Bots de mensagem */}
          <div>
            <h3 className="text-[#e2e2e8] font-semibold text-sm mb-3 flex items-center gap-2">
              <MessageSquare size={15} className="text-emerald-400" />
              Bots de mensagem
            </h3>
            {loading ? (
              <div className="text-[#555] text-sm">Carregando...</div>
            ) : messageBots.length === 0 ? (
              <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 text-center">
                <p className="text-[#555] text-sm">Nenhum bot de mensagem ainda.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {messageBots.map((a) => (
                  <div key={a.id} className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-[#e2e2e8]">"{a.keyword}"</span>
                          {a.handoff_to_human && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 flex items-center gap-1">
                              <UserCheck size={9} /> vai p/ humano
                            </span>
                          )}
                          <span className={`text-xs font-medium ${a.is_active ? 'text-green-400' : 'text-[#555]'}`}>
                            {a.is_active ? 'Ativa' : 'Pausada'}
                          </span>
                        </div>
                        <p className="text-[#888] text-xs truncate">{a.auto_reply_message}</p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => handleToggleActive(a)} className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-[#888] rounded-lg text-xs font-medium transition-colors">
                          {a.is_active ? 'Pausar' : 'Ativar'}
                        </button>
                        <button onClick={() => startEdit(a)} className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded-lg text-xs font-medium transition-colors">
                          Editar
                        </button>
                        <button onClick={() => handleDelete(a.id)} className="px-2.5 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg text-xs font-medium transition-colors">
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Funis de post (criados no Publicar) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#e2e2e8] font-semibold text-sm flex items-center gap-2">
                <Camera size={15} className="text-pink-400" />
                Funis de comentário (por post)
              </h3>
              <Link to="/app/publicar" className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 no-underline">
                <Plus size={12} /> Criar no Publicar
              </Link>
            </div>
            {postFunnels.length === 0 ? (
              <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 text-center">
                <p className="text-[#555] text-sm">
                  Nenhum funil de post. Crie um ao publicar/agendar um post na aba{' '}
                  <Link to="/app/publicar" className="text-indigo-400">Publicar</Link>.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {postFunnels.map((a) => (
                  <div key={a.id} className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-[#e2e2e8]">"{a.keyword}"</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-900/30 text-pink-300">📷 post</span>
                          {a.link_message && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-[#888]">2 passos + link</span>
                          )}
                          <span className={`text-xs font-medium ${a.is_active ? 'text-green-400' : 'text-[#555]'}`}>
                            {a.is_active ? 'Ativa' : 'Pausada'}
                          </span>
                        </div>
                        {a.dm_message && <p className="text-[#888] text-xs truncate">📩 {a.dm_message}</p>}
                        {a.link_message && <p className="text-[#666] text-xs truncate mt-0.5">🔗 {a.link_message}</p>}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => handleToggleActive(a)} className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-[#888] rounded-lg text-xs font-medium transition-colors">
                          {a.is_active ? 'Pausar' : 'Ativar'}
                        </button>
                        <button onClick={() => handleDelete(a.id)} className="px-2.5 py-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg text-xs font-medium transition-colors">
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
    </div>
  )
}
