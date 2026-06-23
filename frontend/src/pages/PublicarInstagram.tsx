import { useEffect, useState } from 'react'
import api from '../services/api'

type Tab = 'publish' | 'scheduled' | 'media'

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

export default function PublicarInstagram() {
  const [tab, setTab] = useState<Tab>('publish')
  const [igUserId, setIgUserId] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('IMAGE')
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [loadingMedia, setLoadingMedia] = useState(false)
  const [insights, setInsights] = useState<any>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)
  const [stories, setStories] = useState<any[]>([])
  const [loadingStories, setLoadingStories] = useState(false)

  useEffect(() => {
    if (tab === 'scheduled') loadSchedules()
    if (tab === 'media') { loadMedia(); loadInsights(); loadStories() }
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
      })
      setSuccess(`Publicado com sucesso! ID: ${res.data.media_id}`)
      setMediaUrl(''); setCaption(''); setHashtags('')
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
      })
      setSuccess('Agendado com sucesso!')
      setMediaUrl(''); setCaption(''); setHashtags(''); setScheduledFor('')
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

  async function handlePublishNow(id: string) {
    try {
      await api.post(`/instagram/schedule/${id}/publish-now`)
      setSuccess('Publicado agora!')
      loadSchedules()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao publicar.')
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!confirm('Remover este agendamento?')) return
    try {
      await api.delete(`/instagram/schedule/${id}`)
      loadSchedules()
    } catch {}
  }

  const statusLabel: Record<string, { label: string; color: string }> = {
    scheduled: { label: 'Agendado', color: 'text-blue-400' },
    published: { label: 'Publicado', color: 'text-green-400' },
    failed: { label: 'Falhou', color: 'text-red-400' },
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#e2e2e8] mb-2">Publicar no Instagram</h2>
      <p className="text-[#555] text-sm mb-6">Publique imagens, vídeos e Reels diretamente no Instagram.</p>

      <div className="flex gap-1 mb-6 bg-[#111118] rounded-lg p-1 border border-white/[0.06] w-fit">
        {(['publish', 'scheduled', 'media'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-[#666] hover:text-[#e2e2e8]'}`}>
            {t === 'publish' ? 'Publicar' : t === 'scheduled' ? 'Agendados' : 'Mídias & Métricas'}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>}
      {success && <div className="mb-4 bg-green-900/20 border border-green-500/20 text-green-400 text-sm rounded-lg px-4 py-3">{success}</div>}

      {tab === 'publish' && (
        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 max-w-xl">
          <div className="mb-4">
            <label className="block text-[#666] text-xs font-medium mb-1">Tipo de Mídia</label>
            <select value={mediaType} onChange={e => setMediaType(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-[#e2e2e8]">
              <option value="IMAGE">Imagem</option>
              <option value="VIDEO">Vídeo / Reel</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-[#666] text-xs font-medium mb-1">URL da Mídia</label>
            <input type="url" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
              placeholder="https://exemplo.com/imagem.jpg"
              className="w-full bg-[#0a0a0f] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-[#e2e2e8] placeholder-[#333]" />
          </div>
          <div className="mb-4">
            <label className="block text-[#666] text-xs font-medium mb-1">Legenda</label>
            <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
              placeholder="Escreva a legenda do post..."
              className="w-full bg-[#0a0a0f] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-[#e2e2e8] placeholder-[#333] resize-none" />
          </div>
          <div className="mb-4">
            <label className="block text-[#666] text-xs font-medium mb-1">Hashtags</label>
            <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)}
              placeholder="#marketing #instagram #negocios"
              className="w-full bg-[#0a0a0f] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-[#e2e2e8] placeholder-[#333]" />
          </div>
          <div className="mb-4">
            <label className="block text-[#666] text-xs font-medium mb-1">Agendar para (opcional)</label>
            <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-[#e2e2e8]" />
          </div>
          <div className="flex gap-3">
            <button onClick={handlePublish} disabled={publishing}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white rounded-lg text-sm font-semibold transition-colors">
              {publishing ? 'Publicando...' : 'Publicar Agora'}
            </button>
            <button onClick={handleSchedule} disabled={publishing || !scheduledFor}
              className="px-4 py-2 bg-[#111118] border border-white/[0.06] hover:bg-white/[0.04] disabled:opacity-50 text-[#666] rounded-lg text-sm font-semibold transition-colors">
              {publishing ? 'Salvando...' : 'Agendar'}
            </button>
          </div>
        </div>
      )}

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
