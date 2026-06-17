import { useEffect, useState } from 'react'
import api from '../services/api'
import type { DashboardData, PerformancePoint } from '../types'

const emptyData: DashboardData = {
  total_leads: 0,
  total_customers: 0,
  new_customers_30d: 0,
  conversion_rate: 0,
  total_revenue: 0,
  monthly_revenue: 0,
  average_ticket: 0,
  projected_revenue: 0,
  ads_spent: 0,
  ads_impressions: 0,
  ads_clicks: 0,
  ads_ctr: 0,
  ads_cpm: 0,
  ads_roas: 0,
  instagram_posts: 0,
  instagram_reach: 0,
  instagram_engagement: 0,
  instagram_followers_delta: 0,
  videos_generated_month: 0,
  credits_total: 50,
  credits_used: 0,
  last_video_title: null,
  last_video_created_at: null,
  performance: [],
  recent_activity: [],
  alerts: [],
}

function PerformanceChart({ data }: { data: PerformancePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-dark-400 text-sm">
        Conecte uma conta de anúncios para ver o gráfico de performance.
      </div>
    )
  }

  const metrics = [
    { key: 'impressions' as const, label: 'Impressões', color: '#818cf8' },
    { key: 'clicks' as const, label: 'Cliques', color: '#34d399' },
    { key: 'conversions' as const, label: 'Conversões', color: '#fbbf24' },
  ]

  const chartData = data.slice(-14)
  const maxVal = Math.max(...chartData.map(d => Math.max(d.impressions, d.clicks, d.conversions)), 1)
  const chartHeight = 180
  const barWidth = Math.max(8, Math.min(24, Math.floor(280 / chartData.length)))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-dark-500">Performance (14 dias)</h4>
        <div className="flex gap-4 text-xs text-dark-400">
          {metrics.map((m) => (
            <div key={m.key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
              {m.label}
            </div>
          ))}
        </div>
      </div>
      <div className="relative" style={{ height: chartHeight }}>
        <svg
          viewBox={`0 0 ${chartData.length * (barWidth + 4) + 40} ${chartHeight + 20}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
            <line
              key={frac}
              x1="0" y1={chartHeight - chartHeight * frac + 10}
              x2={chartData.length * (barWidth + 4) + 40}
              y2={chartHeight - chartHeight * frac + 10}
              stroke="#1e293b"
              strokeWidth="1"
            />
          ))}
          {metrics.map((m) => {
            const points = chartData.map((d, i) => {
              const x = i * (barWidth + 4) + 20 + barWidth / 2
              const y = chartHeight - (d[m.key] / maxVal) * chartHeight + 10
              return `${x},${y}`
            }).join(' ')
            return (
              <polyline
                key={m.key}
                points={points}
                fill="none"
                stroke={m.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
          {chartData.length > 0 && metrics.map((m) => {
            const last = chartData[chartData.length - 1]
            const x = (chartData.length - 1) * (barWidth + 4) + 20 + barWidth / 2
            const y = chartHeight - (last[m.key] / maxVal) * chartHeight + 10
            return (
              <circle key={m.key} cx={x} cy={y} r="3" fill={m.color} />
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(emptyData)
  const [period, setPeriod] = useState(30)

  useEffect(() => {
    api.get('/dashboard', { params: { account_id: '' } })
      .then((res) => setData(res.data))
      .catch(() => {})
  }, [])

  const creditsRemaining = data.credits_total - data.credits_used
  const creditsPercent = data.credits_total > 0
    ? Math.round((data.credits_used / data.credits_total) * 100)
    : 0

  const kpiAds = [
    { label: 'Investimento Total', value: data.ads_spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), icon: '💰', color: 'bg-emerald-600', prefix: 'R$ ' },
    { label: 'Impressões', value: data.ads_impressions.toLocaleString('pt-BR'), icon: '👁️', color: 'bg-violet-600' },
    { label: 'Cliques', value: data.ads_clicks.toLocaleString('pt-BR'), icon: '👆', color: 'bg-blue-600' },
    { label: 'CTR', value: data.ads_ctr.toFixed(2), icon: '📈', color: 'bg-cyan-600', suffix: '%' },
    { label: 'CPM', value: data.ads_cpm.toFixed(2), icon: '💵', color: 'bg-amber-600', prefix: 'R$ ' },
    { label: 'ROAS', value: data.ads_roas.toFixed(2), icon: '🎯', color: 'bg-rose-600', suffix: 'x' },
  ]

  const kpiInstagram = [
    { label: 'Posts (30 dias)', value: data.instagram_posts, icon: '📸', color: 'bg-pink-600' },
    { label: 'Alcance Total', value: data.instagram_reach.toLocaleString('pt-BR'), icon: '🌐', color: 'bg-purple-600' },
    { label: 'Engajamento Médio', value: data.instagram_engagement.toFixed(0), icon: '❤️', color: 'bg-red-600' },
    { label: 'Seguidores', value: data.instagram_followers_delta.toLocaleString('pt-BR'), icon: '👥', color: 'bg-orange-600' },
  ]

  const kpiVideos = [
    { label: 'Vídeos no Mês', value: data.videos_generated_month, icon: '🎬', color: 'bg-indigo-600' },
    { label: 'Créditos Restantes', value: creditsRemaining, icon: '💳', color: 'bg-teal-600' },
    {
      label: 'Créditos Usados',
      value: `${creditsPercent}%`,
      icon: '📊',
      color: 'bg-sky-600',
      sub: `${data.credits_used}/${data.credits_total}`,
    },
    {
      label: 'Último Vídeo',
      value: data.last_video_title || 'Nenhum',
      icon: '🎥',
      color: 'bg-brand-600',
      sub: data.last_video_created_at
        ? new Date(data.last_video_created_at).toLocaleDateString('pt-BR')
        : '',
    },
  ]

  const kpiNegocio = [
    { label: 'Total de Clientes', value: String(data.total_customers), icon: '👥', color: 'bg-brand-500' },
    { label: 'Novos (30 dias)', value: String(data.new_customers_30d), icon: '📈', color: 'bg-green-600' },
    { label: 'Taxa de Conversão', value: `${data.conversion_rate}%`, icon: '🎯', color: 'bg-purple-600' },
    { label: 'Leads Captados', value: String(data.total_leads), icon: '📋', color: 'bg-orange-600' },
  ]

  const kpiFinanceiro = [
    { label: 'Faturamento Total', value: `R$ ${data.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '💰', color: 'bg-emerald-600' },
    { label: 'Faturamento (mês)', value: `R$ ${data.monthly_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '📊', color: 'bg-cyan-600' },
    { label: 'Ticket Médio', value: `R$ ${data.average_ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '🎫', color: 'bg-violet-600' },
    { label: 'Receita Projetada', value: `R$ ${data.projected_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '🚀', color: 'bg-rose-600' },
  ]

  function renderKpiGrid(items: { label: string; value: string | number; icon: string; color: string; prefix?: string; suffix?: string; sub?: string }[]) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((stat) => (
          <div key={stat.label} className="bg-surface-card rounded-xl border border-dark-50 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center text-white text-sm`}>
                {stat.icon}
              </div>
            </div>
            <p className="text-2xl font-bold text-white">
              {stat.prefix || ''}{stat.value}{stat.suffix || ''}
            </p>
            <p className="text-sm text-dark-400 mt-1">{stat.label}</p>
            {stat.sub && <p className="text-xs text-dark-300 mt-0.5">{stat.sub}</p>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-dark-600">Dashboard</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                period === d
                  ? 'bg-brand-600 text-white'
                  : 'bg-dark border border-dark-50 text-dark-400 hover:text-dark-600'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data.alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-dark-500 uppercase tracking-wider">Alertas</h3>
          <div className="space-y-2">
            {data.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                  alert.severity === 'critical'
                    ? 'bg-red-900/20 border-red-900/40 text-red-400'
                    : alert.severity === 'warning'
                    ? 'bg-yellow-900/20 border-yellow-900/40 text-yellow-400'
                    : 'bg-blue-900/20 border-blue-900/40 text-blue-400'
                }`}
              >
                <span className="mt-0.5">
                  {alert.severity === 'critical' ? '🔴' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
                </span>
                <div>
                  <p className="font-medium">{alert.title}</p>
                  {alert.description && <p className="text-xs mt-0.5 opacity-80">{alert.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-dark-500 uppercase tracking-wider mb-3">Anúncios</h3>
        {renderKpiGrid(kpiAds)}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-dark-500 uppercase tracking-wider mb-3">Instagram</h3>
        {renderKpiGrid(kpiInstagram)}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-dark-500 uppercase tracking-wider mb-3">Vídeos Gerados</h3>
        {renderKpiGrid(kpiVideos)}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-dark-500 uppercase tracking-wider mb-3">Clientes</h3>
        {renderKpiGrid(kpiNegocio)}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-dark-500 uppercase tracking-wider mb-3">Faturamento</h3>
        {renderKpiGrid(kpiFinanceiro)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-card rounded-xl border border-dark-50 p-6">
          <PerformanceChart data={data.performance} />
        </div>

        <div className="bg-surface-card rounded-xl border border-dark-50 p-6">
          <h4 className="text-sm font-semibold text-dark-500 mb-4">Atividade Recente</h4>
          {data.recent_activity.length === 0 ? (
            <p className="text-dark-400 text-sm">Nenhuma atividade recente.</p>
          ) : (
            <div className="space-y-3">
              {data.recent_activity.map((act) => (
                <div key={act.id} className="flex items-start gap-3">
                  <span className="text-base mt-0.5">
                    {act.type === 'lead' ? '👤' : act.type === 'video' ? '🎬' : '📌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-dark-600 truncate">{act.description}</p>
                    <p className="text-xs text-dark-400">
                      {new Date(act.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
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
