import { useEffect, useState } from 'react'
import { Camera, MessageSquare, UserCheck } from 'lucide-react'
import api from '../services/api'

type Tab = 'publish_auto' | 'scheduled' | 'media'

interface Schedule {
  id: string
  ig_user_id: string
  media_type: string
  media_url: string
  caption: string | null
  hashtags: string | null
  thumbnail_url: string | null
  scheduled_for: string
  published_at: string | null
  status: string
  error_message: string | null
  media_id_response: string | null
  created_at: string
}

interface MediaItem {
  id: string
  media_type: string
  media_url: string | null
  thumbnail_url: string | null
  caption: string | null
  timestamp: string | null
  like_count: number
  comments_count: number
}

interface AutomationConfig {
  id: string
  keyword: string
  auto_reply_message: string
  media_id: string | null
  comment_reply_message: string | null
  dm_message: string | null
  link_message: string | null
  handoff_to_human: boolean
  is_active: boolean
}

const emptyAutomationForm = { keyword: '', auto_reply_message: '', handoff_to_human: false }

export default function PublicarInstagram() {
  const [tab, setTab] = useState<Tab>('publish_auto')
  const [igUserId, setIgUserId] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('IMAGE')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Automação de comentário deste post
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoKeyword, setAutoKeyword] = useState('')
  const [autoCommentReply, setAutoCommentReply] = useState('')
  const [autoDmMessage, setAutoDmMessage] = useState('')
  const [autoLinkMessage, setAutoLinkMessage] = useState('')

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [insights, setInsights] = useState<any>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [stories, setStories] = useState<any[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [automations, setAutomations] = useState<AutomationConfig[]>([])
  const [loadingAutomations, setLoadingAutomations] = useState(false)
  const [automationForm, setAutomationForm] = useState(emptyAutomationForm)
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null)
  const [savingAutomation, setSavingAutomation] = useState(false)

  useEffect(() => {
    if (tab === 'scheduled') loadSchedules()
    if (tab === 'media') { loadMedia(); loadInsights(); loadStories() }
    if (tab === 'publish_auto') { loadAutomations(); loadMedia() }
  }, [tab])

  useEffect(() => {
    const stored = localStorage.getItem('tenant_id')
    if (stored) loadIgUserId(stored)
  }, [])

  async function loadIgUserId(_tid?: string) {
    try {
      const res = await api.get('/auth/meta/connections')
      const ig = res.data.find((c: any) => c.provider === 'instagram' && c.status === 'active')
      if (ig) setIgUserId(ig.ig_business_account_id || ig.meta_user_id || '')
    } catch {}
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setSuccess(''); setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/instagram/upload-media', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setMediaUrl(res.data.media_url)
      setMediaType(res.data.media_type)
      setUploadedName(file.name)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao enviar o arquivo.')
    } finally {
      setUploading(false)
    }
  }

  function automationPayload() {
    if (!autoEnabled || !autoKeyword.trim()) return {}
    return {
      automation_keyword: autoKeyword.trim(),
      automation_comment_reply: autoCommentReply.trim() || null,
      automation_dm_message: autoDmMessage.trim() || null,
      automation_link_message: autoLinkMessage.trim() || null,
    }
  }

  function resetForm() {
    setMediaUrl(''); setCaption(''); setHashtags(''); setUploadedName('')
    setAutoEnabled(false); setAutoKeyword(''); setAutoCommentReply('')
    setAutoDmMessage(''); setAutoLinkMessage('')
  }

  async function handlePublish() {
    if (!mediaUrl) { setError('URL da mídia é obrigatória.'); return }
    setError(''); setSuccess(''); setPublishing(true)
    try {
      const res = await api.post('/instagram/publish', {
        ig_user_id: igUserId,
        media_url: mediaUrl,
        media_type: mediaType,
        caption,
        hashtags,
        ...automationPayload(),
      })
      setSuccess(`Publicado com sucesso! ID: ${res.data.media_id}`)
      resetForm()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao publicar.')
    } finally { setPublishing(false) }
  }

  async function handleSchedule() {
    if (!mediaUrl) { setError('URL da mídia é obrigatória.'); return }
    if (!scheduledFor) { setError('Data de agendamento é obrigatória.'); return }
    setError(''); setSuccess(''); setPublishing(true)
    try {
      await api.post('/instagram/schedule', {
        ig_user_id: igUserId,
        media_url: mediaUrl,
        media_type: mediaType,
        caption,
        hashtags,
        scheduled_for: new Date(scheduledFor).toISOString(),
        ...automationPayload(),
      })
      setSuccess('Agendado com sucesso!')
      resetForm(); setScheduledFor('')
      loadSchedules()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao agendar.')
    } finally { setPublishing(false) }
  }

  async function loadSchedules() {
    setLoadingSchedules(true)
    try {
      const res = await api.get('/instagram/schedule')
      setSchedules(res.data)
    } catch {} finally { setLoadingSchedules(false) }
  }

  async function loadMedia() {
    setLoadingMedia(true)
    try {
      const res = await api.get('/instagram/media', { params: { ig_user_id: igUserId, limit: 20 } })
      setMediaList(res.data)
    } catch {} finally { setLoadingMedia(false) }
  }

  async function loadInsights() {
    setLoadingInsights(true)
    try {
      const res = await api.get('/instagram/insights', { params: { ig_user_id: igUserId } })
      setInsights(res.data)
    } catch {} finally { setLoadingInsights(false) }
  }

  async function loadStories() {
    setLoadingStories(true)
    try {
      const res = await api.get('/instagram/stories-insights', { params: { ig_user_id: igUserId, limit: 10 } })
      setStories(res.data.stories || [])
    } catch {} finally { setLoadingStories(false) }
  }

  async function loadAutomations() {
    setLoadingAutomations(true)
    try {
      const res = await api.get<AutomationConfig[]>('/automations')
      setAutomations(res.data)
    } catch {
      setError('Não foi possível carregar as automações.')
    } finally { setLoadingAutomations(false) }
  }

  function startAutomationEdit(automation?: AutomationConfig) {
    setEditingAutomationId(automation?.id ?? null)
    setAutomationForm(automation ? {
      keyword: automation.keyword,
      auto_reply_message: automation.auto_reply_message,
      handoff_to_human: automation.handoff_to_human,
    } : emptyAutomationForm)
  }

  async function saveAutomation(e: React.FormEvent) {
    e.preventDefault()
    if (!automationForm.keyword.trim() || !automationForm.auto_reply_message.trim()) return
    setSavingAutomation(true); setError(''); setSuccess('')
    const payload = { ...automationForm, keyword: automationForm.keyword.trim(), trigger_type: 'dm', is_active: true }
    try {
      if (editingAutomationId) await api.put(`/automations/${editingAutomationId}`, payload)
      else await api.post('/automations', payload)
      startAutomationEdit()
      setSuccess('Automação salva com sucesso!')
      loadAutomations()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar automação.')
    } finally { setSavingAutomation(false) }
  }

  async function toggleAutomation(automation: AutomationConfig) {
    try {
      await api.put(`/automations/${automation.id}`, { is_active: !automation.is_active })
      loadAutomations()
    } catch { setError('Erro ao atualizar automação.') }
  }

  async function deleteAutomation(id: string) {
    if (!confirm('Remover esta automação?')) return
    try {
      await api.delete(`/automations/${id}`)
      if (editingAutomationId === id) startAutomationEdit()
      loadAutomations()
    } catch { setError('Erro ao remover automação.') }
  }
      {tab === 'scheduled' && (
        <div>
          {loadingSchedules ? (
            <div className="text-[#555] text-sm">Carregando agendamentos...</div>
          ) : schedules.length === 0 ? (
            <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 text-center">
              <p className="text-[#555] text-sm">Nenhum agendamento encontrado.</p>
            </div>
          ) : (
            <div className="grid gap-4 max-w-2xl">
              {schedules.map(s => (
                <div key={s.id} className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/[0.04] text-[#666]">{s.media_type}</span>
                        <span className={`text-xs font-medium ${statusLabel[s.status]?.color || 'text-[#555]'}`}>
                          {statusLabel[s.status]?.label || s.status}
                        </span>
                        {s.media_id_response && <span className="text-xs text-[#444]">ID: {s.media_id_response}</span>}
                      </div>
                      <p className="text-[#e2e2e8] text-sm truncate">{s.caption || 'Sem legenda'}</p>
                      {s.hashtags && <p className="text-[#555] text-xs truncate mt-0.5">{s.hashtags}</p>}
                      <div className="flex gap-4 mt-2 text-xs text-[#444]">
                        <span>Agendado: {new Date(s.scheduled_for).toLocaleString('pt-BR')}</span>
                        {s.published_at && <span>Publicado: {new Date(s.published_at).toLocaleString('pt-BR')}</span>}
                      </div>
                      {s.error_message && <p className="text-red-400 text-xs mt-1">Erro: {s.error_message}</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {s.status === 'scheduled' && (
                        <button onClick={() => handlePublishNow(s.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors">
                          Publicar Agora
                        </button>
                      )}
                      <button onClick={() => handleDeleteSchedule(s.id)}
                        className="px-3 py-1.5 bg-red-900/20 text-red-400 rounded-lg text-xs font-medium hover:bg-red-900/40 transition-colors">
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Antiga aba de automations foi movida para publish_auto */}

      {tab === 'media' && (
        <div className="space-y-6">
          {loadingInsights ? (
            <div className="text-[#555] text-sm">Carregando métricas...</div>
          ) : insights && (
            <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6">
              <h3 className="text-[#e2e2e8] font-semibold text-sm mb-4">Métricas do Instagram (últimos 30 dias)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Seguidores', value: insights.followers_count },
                  { label: 'Seguindo', value: insights.follows_count },
                  { label: 'Posts', value: insights.media_count },
                  { label: 'Alcance', value: insights.reach },
                  { label: 'Impressões', value: insights.impressions },
                  { label: 'Engajamento', value: `${insights.engagement}%` },
                  { label: 'Visitas ao Perfil', value: insights.profile_views },
                  { label: 'Cliques em Links', value: insights.website_clicks },
                ].map(m => (
                  <div key={m.label} className="bg-white/[0.03] rounded-lg p-3">
                    <p className="text-[#555] text-xs">{m.label}</p>
                    <p className="text-[#e2e2e8] text-lg font-bold">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingStories ? (
            <div className="text-[#555] text-sm">Carregando stories...</div>
          ) : stories.length > 0 && (
            <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6">
              <h3 className="text-[#e2e2e8] font-semibold text-sm mb-4">Stories Recentes</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#555] text-xs text-left">
                      <th className="pb-2 pr-4">Tipo</th>
                      <th className="pb-2 pr-4">Alcance</th>
                      <th className="pb-2 pr-4">Impressões</th>
                      <th className="pb-2 pr-4">Saídas</th>
                      <th className="pb-2 pr-4">Respostas</th>
                      <th className="pb-2 pr-4">Toques p/ Frente</th>
                      <th className="pb-2 pr-4">Toques p/ Trás</th>
                      <th className="pb-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stories.map((s: any) => (
                      <tr key={s.id} className="border-t border-white/[0.06] text-[#888]">
                        <td className="py-2 pr-4">{s.media_type}</td>
                        <td className="py-2 pr-4">{s.reach}</td>
                        <td className="py-2 pr-4">{s.impressions}</td>
                        <td className="py-2 pr-4">{s.exits}</td>
                        <td className="py-2 pr-4">{s.replies}</td>
                        <td className="py-2 pr-4">{s.taps_forward}</td>
                        <td className="py-2 pr-4">{s.taps_back}</td>
                        <td className="py-2">                      {s.timestamp ? new Date(s.timestamp as string).toLocaleDateString('pt-BR') : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loadingMedia ? (
            <div className="text-[#555] text-sm">Carregando mídias...</div>
          ) : mediaList.length === 0 ? (
            <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 text-center">
              <p className="text-[#555] text-sm">Nenhuma mídia encontrada.</p>
            </div>
          ) : (
            <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6">
              <h3 className="text-[#e2e2e8] font-semibold text-sm mb-4">Mídias Recentes</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {mediaList.map(m => (
                  <div key={m.id} className="bg-white/[0.03] rounded-lg overflow-hidden">
                    {m.thumbnail_url || m.media_url ? (
                      <img src={m.thumbnail_url || m.media_url || undefined} alt={m.caption || undefined} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 flex items-center justify-center text-[#444] text-xs">
                        {m.media_type}
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-[#e2e2e8] text-xs truncate">{m.caption || 'Sem legenda'}</p>
                      <div className="flex gap-3 mt-1 text-[#555] text-xs">
                        <span>❤️ {m.like_count}</span>
                        <span>💬 {m.comments_count}</span>
                      </div>
                      {m.timestamp && <p className="text-[#444] text-xs mt-1">{new Date(m.timestamp).toLocaleDateString('pt-BR')}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AutomationList({
  items,
  loading,
  media = [],
  onEdit,
  onToggle,
  onDelete,
}: {
  items: AutomationConfig[]
  loading: boolean
  media?: MediaItem[]
  onEdit?: (automation: AutomationConfig) => void
  onToggle: (automation: AutomationConfig) => void
  onDelete: (id: string) => void
}) {
  if (loading) return <p className="text-[#555] text-sm">Carregando...</p>
  if (!items.length) return <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-5 text-center text-[#555] text-sm">Nenhuma automação criada.</div>

  return <div className="space-y-2.5">
    {items.map(automation => {
      const post = media.find(item => item.id === automation.media_id)
      return <div key={automation.id} className="bg-[#111118] rounded-xl border border-white/[0.06] p-3.5 flex gap-3">
        {automation.media_id && (
          post?.thumbnail_url || post?.media_url
            ? <img src={post.thumbnail_url || post.media_url || undefined} alt="Post vinculado" className="w-14 h-14 rounded-lg object-cover shrink-0" />
            : <div className="w-14 h-14 rounded-lg bg-pink-500/10 text-pink-300 flex items-center justify-center shrink-0"><Camera size={16} /></div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#e2e2e8]">“{automation.keyword}”</span>
            {automation.media_id && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-900/30 text-pink-300">post específico</span>}
            <span className={`text-[11px] ${automation.is_active ? 'text-green-400' : 'text-[#555]'}`}>{automation.is_active ? 'Ativa' : 'Pausada'}</span>
          </div>
          <p className="text-[#888] text-xs mt-1 truncate">{automation.dm_message || automation.auto_reply_message}</p>
          {post?.caption && <p className="text-[#555] text-[11px] mt-1 truncate">Post: {post.caption}</p>}
        </div>
        <div className="flex gap-1.5 shrink-0 self-start">
          <button onClick={() => onToggle(automation)} className="px-2 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-[#888] rounded-md text-[11px]">{automation.is_active ? 'Pausar' : 'Ativar'}</button>
          {onEdit && <button onClick={() => onEdit(automation)} className="px-2 py-1.5 bg-indigo-600/20 text-indigo-300 rounded-md text-[11px]">Editar</button>}
          <button onClick={() => onDelete(automation.id)} className="px-2 py-1.5 bg-red-900/20 text-red-400 rounded-md text-[11px]">Remover</button>
        </div>
      </div>
    })}
  </div>
}
