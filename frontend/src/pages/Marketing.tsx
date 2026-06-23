import { useState, useEffect } from 'react'
import api from '../services/api'

interface Campaign {
  id: string
  name: string
  status: string
  objective: string
  daily_budget: string | null
  lifetime_budget: string | null
}

interface Insights {
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpm: number
}

export default function Marketing() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [campName, setCampName] = useState('')
  const [campObjective, setCampObjective] = useState('OUTCOME_LEADS')
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [campRes, insRes] = await Promise.all([
        api.get('/marketing/campaigns'),
        api.get('/marketing/insights'),
      ])
      setCampaigns(campRes.data)
      setInsights(insRes.data)
    } catch {
      setError('Erro ao carregar dados. Conecte uma conta de anúncios primeiro.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!campName.trim()) return
    setCreating(true)
    try {
      await api.post('/marketing/campaigns', {
        name: campName.trim(),
        objective: campObjective,
        status: 'PAUSED',
      })
      setShowCreate(false)
      setCampName('')
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao criar campanha.')
    } finally {
      setCreating(false)
    }
  }

  const objectiveLabels: Record<string, string> = {
    OUTCOME_LEADS: 'Geração de Leads',
    OUTCOME_SALES: 'Vendas',
    OUTCOME_AWARENESS: 'Reconhecimento',
    OUTCOME_ENGAGEMENT: 'Engajamento',
    OUTCOME_TRAFFIC: 'Tráfego',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#e2e2e8]">Marketing</h2>
          <p className="text-[#555] text-sm mt-1">Gerencie suas campanhas de anúncios.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Nova Campanha
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Insights */}
      {insights && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
            <p className="text-[#555] text-xs mb-1">Gastos</p>
            <p className="text-xl font-bold text-[#e2e2e8]">R$ {insights.spend.toFixed(2)}</p>
          </div>
          <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
            <p className="text-[#555] text-xs mb-1">Impressões</p>
            <p className="text-xl font-bold text-[#e2e2e8]">{insights.impressions.toLocaleString()}</p>
          </div>
          <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
            <p className="text-[#555] text-xs mb-1">Cliques</p>
            <p className="text-xl font-bold text-[#e2e2e8]">{insights.clicks.toLocaleString()}</p>
          </div>
          <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
            <p className="text-[#555] text-xs mb-1">CTR</p>
            <p className="text-xl font-bold text-[#e2e2e8]">{insights.ctr.toFixed(2)}%</p>
          </div>
          <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
            <p className="text-[#555] text-xs mb-1">CPM</p>
            <p className="text-xl font-bold text-[#e2e2e8]">R$ {insights.cpm.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Campanhas */}
      <h3 className="text-lg font-semibold text-[#e2e2e8] mb-4">Campanhas</h3>
      {loading ? (
        <div className="text-[#555] text-sm">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-12 text-center">
          <p className="text-[#555]">Nenhuma campanha ainda. Crie uma para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3 max-w-3xl">
          {campaigns.map((c) => (
            <div key={c.id} className="bg-[#111118] rounded-xl border border-white/[0.06] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-[#e2e2e8] font-semibold text-sm">{c.name}</h4>
                  <p className="text-[#555] text-xs mt-0.5">
                    {objectiveLabels[c.objective] || c.objective}
                  </p>
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                  c.status === 'ACTIVE' ? 'bg-green-900/20 text-green-400' : 'bg-white/[0.05] text-[#555]'
                }`}>
                  {c.status === 'ACTIVE' ? 'Ativa' : c.status === 'PAUSED' ? 'Pausada' : c.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar campanha */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#111118] border border-white/[0.08] rounded-2xl p-8 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-6">Nova Campanha</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Nome da campanha</label>
                <input
                  type="text"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="Ex: Captação Leads - Maio"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Objetivo</label>
                <select
                  value={campObjective}
                  onChange={(e) => setCampObjective(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none"
                >
                  {Object.entries(objectiveLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
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
                  disabled={creating || !campName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {creating ? 'Criando...' : 'Criar Campanha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
