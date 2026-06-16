import { useEffect, useState } from 'react'
import api from '../services/api'

export default function Dashboard() {
  const [data, setData] = useState({
    total_leads: 0,
    total_customers: 0,
    new_customers_30d: 0,
    conversion_rate: 0,
    total_revenue: 0,
    monthly_revenue: 0,
    average_ticket: 0,
    projected_revenue: 0,
  })

  useEffect(() => {
    api.get('/dashboard').then((res) => setData(res.data)).catch(() => {})
  }, [])

  const statsClientes = [
    { label: 'Total de Clientes', value: String(data.total_customers), icon: '👥', color: 'bg-brand-500' },
    { label: 'Novos (30 dias)', value: String(data.new_customers_30d), icon: '📈', color: 'bg-green-600' },
    { label: 'Taxa de Conversão', value: `${data.conversion_rate}%`, icon: '🎯', color: 'bg-purple-600' },
    { label: 'Leads Captados', value: String(data.total_leads), icon: '📋', color: 'bg-orange-600' },
  ]

  const statsFaturamento = [
    { label: 'Faturamento Total', value: `R$ ${data.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '💰', color: 'bg-emerald-600' },
    { label: 'Faturamento (mês)', value: `R$ ${data.monthly_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '📊', color: 'bg-cyan-600' },
    { label: 'Ticket Médio', value: `R$ ${data.average_ticket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '🎫', color: 'bg-violet-600' },
    { label: 'Receita Projetada', value: `R$ ${data.projected_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: '🚀', color: 'bg-rose-600' },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-600 mb-6">Dashboard</h2>
      <h3 className="text-lg font-semibold text-dark-500 mb-3">Clientes</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsClientes.map((stat) => (
          <div key={stat.label} className="bg-surface-card rounded-xl border border-dark-50 p-5">
            <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center text-white text-sm mb-3`}>
              {stat.icon}
            </div>
            <p className="text-xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-dark-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
      <h3 className="text-lg font-semibold text-dark-500 mb-3">Faturamento</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsFaturamento.map((stat) => (
          <div key={stat.label} className="bg-surface-card rounded-xl border border-dark-50 p-5">
            <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center text-white text-sm mb-3`}>
              {stat.icon}
            </div>
            <p className="text-xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-dark-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-card rounded-xl border border-dark-50 p-6">
          <h4 className="text-sm font-semibold text-dark-500 mb-4">Últimos Clientes</h4>
          <p className="text-dark-400 text-sm">Nenhum cliente registrado ainda.</p>
        </div>
        <div className="bg-surface-card rounded-xl border border-dark-50 p-6">
          <h4 className="text-sm font-semibold text-dark-500 mb-4">Últimas Vendas</h4>
          <p className="text-dark-400 text-sm">Nenhuma venda registrada ainda.</p>
        </div>
      </div>
    </div>
  )
}
