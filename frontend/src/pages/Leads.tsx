import { useEffect, useState } from 'react'
import api from '../services/api'

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    api.get('/leads').then((res) => setLeads(res.data)).catch(() => {})
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-600 mb-6">Leads</h2>

      {leads.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-dark-50 p-16 text-center">
          <div className="text-6xl mb-6">📭</div>
          <h3 className="text-xl font-semibold text-dark-600 mb-2">Nenhum lead captado</h3>
          <p className="text-dark-400 max-w-md mx-auto">
            Conecte sua conta Meta e configure a automação para começar a captar leads automaticamente pelo Instagram.
          </p>
        </div>
      ) : (
        <div className="bg-surface-card rounded-xl border border-dark-50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 text-dark-400">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Nome</th>
                <th className="text-left px-4 py-3 font-medium">Instagram</th>
                <th className="text-left px-4 py-3 font-medium">Origem</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => (
                <tr key={i} className="border-t border-dark-50 text-dark-500">
                  <td className="px-4 py-3">{lead.name || '-'}</td>
                  <td className="px-4 py-3">{lead.instagram_handle}</td>
                  <td className="px-4 py-3">{lead.source}</td>
                  <td className="px-4 py-3">{lead.status}</td>
                  <td className="px-4 py-3">{new Date(lead.captured_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
