import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

interface Plan {
  id: string
  name: string
  value: number
  description: string
  features: string[]
  interval_days: number
}

const faq = [
  { q: 'Como funciona a captura de leads pelo Instagram?', a: 'Nosso sistema monitora comentários e mensagens da sua página do Instagram. Quando um seguidor comenta com a palavra-chave que você definiu, automaticamente salvamos o lead e enviamos uma mensagem personalizada.' },
  { q: 'Preciso ter uma página do Facebook?', a: 'Sim, o Instagram Business exige uma página do Facebook vinculada. O processo de conexão é simples e leva menos de 2 minutos.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'Sim! Você pode cancelar sua assinatura quando quiser, sem multas ou taxas. Seus dados ficam salvos por 30 dias após o cancelamento.' },
]

const partners = ['Empresa A', 'Empresa B', 'Empresa C', 'Empresa D', 'Empresa E']

export default function Landing() {
  const navigate = useNavigate()
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalPlan, setModalPlan] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalLoading, setModalLoading] = useState(false)

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const response = await api.get('/payments/plans')
      setPlans(response.data)
    } catch (error) {
      console.error('Error fetching plans:', error)
    }
  }

  const handlePlanClick = (planId: string) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      setSelectedPlan(planId)
      checkoutLoggedIn(planId)
    } else {
      setModalPlan(planId)
      setName('')
      setEmail('')
      setModalError('')
      setShowModal(true)
    }
  }

  const checkoutLoggedIn = async (planId: string) => {
    setSelectedPlan(planId)
    try {
      const response = await api.post('/payments/subscribe', { plan: planId })
      if (response.data.payment_link) {
        window.location.href = response.data.payment_link
      } else {
        navigate('/app')
      }
    } catch (error) {
      alert('Erro ao criar assinatura. Tente novamente.')
    } finally {
      setSelectedPlan(null)
    }
  }

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError('')
    if (!name.trim() || !email.trim()) {
      setModalError('Preencha nome e email')
      return
    }
    setModalLoading(true)
    try {
      const response = await api.post('/payments/checkout', {
        plan: modalPlan,
        name: name.trim(),
        email: email.trim(),
      })
      window.location.href = response.data.payment_link
    } catch (err: any) {
      setModalError(err.response?.data?.detail || 'Erro ao processar checkout')
    } finally {
      setModalLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface text-dark-600">

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/40 via-surface to-dark pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, #4f46e5 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="max-w-6xl mx-auto px-4 py-20 md:py-32 relative z-10">
          <div className="flex items-center justify-between mb-12">
            <button onClick={() => navigate('/')} className="text-2xl font-bold text-white hover:text-brand-400 transition-colors">adStudioAI</button>
            <div className="flex gap-3">
              <button onClick={() => navigate('/login')} className="px-5 py-2 text-sm font-medium text-dark-400 hover:text-white transition-colors">Entrar</button>
              <button onClick={() => navigate('/login')} className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-md">Começar Grátis</button>
            </div>
          </div>
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block px-4 py-1.5 bg-brand-600/20 text-brand-400 text-xs font-semibold rounded-full mb-6 border border-brand-600/30">#1 em automação de marketing para Instagram</span>
            <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
              Transforme seguidores em{' '}
              <span className="text-brand-400">clientes reais</span>
            </h2>
            <p className="text-lg md:text-xl text-dark-400 max-w-2xl mx-auto mb-8">
              Automatize a captação de leads pelo Instagram. Conecte sua conta, defina palavras-chave e deixe o resto com a gente. Enquanto você dorme, seu funil de vendas trabalha.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => navigate('/login')} className="px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-brand-600/25 text-lg">Quero Automatizar Minhas Vendas</button>
              <button onClick={() => document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' })} className="px-8 py-3.5 border border-dark-50 text-dark-400 hover:text-white hover:border-dark-200 font-semibold rounded-xl transition-colors text-lg">Ver Planos</button>
            </div>
            <p className="text-dark-300 text-sm mt-4">⏱️ Conexão em menos de 2 minutos. Sem cartão de crédito.</p>
          </div>
        </div>
      </section>

      <section className="border-y border-dark-50">
        <div className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '+12.000', label: 'Leads captados' },
            { value: '98%', label: 'Taxa de entrega' },
            { value: '< 5s', label: 'Tempo de resposta' },
            { value: '4.8', label: 'Avaliação média ⭐' },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-3xl md:text-4xl font-bold text-white">{item.value}</p>
              <p className="text-dark-400 text-sm mt-1">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-20">
        <h3 className="text-3xl font-bold text-white text-center mb-4">Como funciona</h3>
        <p className="text-dark-400 text-center max-w-xl mx-auto mb-12">Três passos simples para nunca mais perder uma venda no Instagram.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { step: '01', title: 'Conecte sua conta', desc: 'Vincule sua página do Facebook/Instagram com um clique. Seguro e rápido.' },
            { step: '02', title: 'Configure a automação', desc: 'Defina a palavra-chave (ex: "QUERO") e a mensagem de resposta automática.' },
            { step: '03', title: 'Acompanhe os leads', desc: 'Receba leads no dashboard, acompanhe conversões e veja seu faturamento crescer.' },
          ].map((item) => (
            <div key={item.step} className="bg-surface-card border border-dark-50 rounded-xl p-6 hover:border-brand-600/40 transition-colors">
              <span className="text-brand-400 text-sm font-bold">{item.step}</span>
              <h4 className="text-lg font-semibold text-white mt-2 mb-2">{item.title}</h4>
              <p className="text-dark-400 text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-dark-50 py-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-dark-400 text-sm mb-6">Empresas que confiam no adStudioAI</p>
          <div className="flex flex-wrap justify-center gap-8 gap-y-4">
            {partners.map((name) => (
              <div key={name} className="px-6 py-3 bg-surface-card border border-dark-50 rounded-lg">
                <span className="text-dark-300 text-sm font-medium">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" className="bg-dark py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h3 className="text-3xl font-bold text-white text-center mb-4">Planos para todo negócio</h3>
          <p className="text-dark-400 text-center max-w-xl mx-auto mb-12">Escolha o plano ideal para o seu momento. Todos incluem 7 dias de teste grátis.</p>
          {plans.length === 0 ? (
            <p className="text-dark-400 text-center">Carregando planos...</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {plans.filter(p => p.value > 0).map((plan, index) => (
                <div key={plan.id} className={`rounded-xl border p-6 flex flex-col ${index === 1 ? 'bg-brand-600 border-brand-500 shadow-xl shadow-brand-600/20 scale-105' : 'bg-surface-card border-dark-50'}`}>
                  {index === 1 && <span className="text-white text-xs font-semibold bg-white/20 rounded-full px-3 py-1 w-fit mb-3">Mais popular</span>}
                  <h4 className="text-xl font-bold text-white">{plan.name}</h4>
                  <p className={`text-sm mt-1 ${index === 1 ? 'text-white/80' : 'text-dark-400'}`}>{plan.description}</p>
                  <div className="mt-4 mb-6">
                    <span className="text-4xl font-bold text-white">R$ {plan.value.toFixed(0)}</span>
                    <span className={`text-sm ${index === 1 ? 'text-white/70' : 'text-dark-400'}`}>/mês</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className={`flex items-center gap-2 text-sm ${index === 1 ? 'text-white/90' : 'text-dark-400'}`}>
                        <span className="text-brand-400">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handlePlanClick(plan.id)}
                    disabled={selectedPlan !== null}
                    className={`w-full py-3 font-semibold rounded-xl transition-colors text-sm ${
                      selectedPlan === plan.id
                        ? 'bg-opacity-50 cursor-wait'
                        : index === 1
                        ? 'bg-white text-brand-700 hover:bg-white/90'
                        : 'bg-brand-600 hover:bg-brand-700 text-white'
                    } ${selectedPlan !== null ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {selectedPlan === plan.id ? 'Redirecionando...' : 'Assinar Agora'}
                  </button>
                </div>
              ))}
              {plans.filter(p => p.value === 0).map(plan => (
                <div key={plan.id} className="rounded-xl border p-6 flex flex-col bg-surface-card border-dark-50">
                  <h4 className="text-xl font-bold text-white">{plan.name}</h4>
                  <p className="text-sm mt-1 text-dark-400">{plan.description}</p>
                  <div className="mt-4 mb-6">
                    <span className="text-4xl font-bold text-white">Grátis</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-dark-400">
                        <span className="text-brand-400">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => navigate('/login')} className="w-full py-3 font-semibold rounded-xl transition-colors text-sm bg-brand-600 hover:bg-brand-700 text-white">Começar Grátis</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-20">
        <h3 className="text-3xl font-bold text-white text-center mb-12">Dúvidas frequentes</h3>
        <div className="space-y-4">
          {faq.map((item) => (
            <details key={item.q} className="bg-surface-card border border-dark-50 rounded-xl p-5 group">
              <summary className="text-white font-medium cursor-pointer list-none flex items-center justify-between">
                {item.q}
                <span className="text-dark-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="text-dark-400 text-sm mt-3 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-dark-50">
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h3 className="text-3xl font-bold text-white mb-4">Pronto para transformar seu Instagram em máquina de vendas?</h3>
          <p className="text-dark-400 mb-8">Mais de 200 empresas já automatizam a captação de leads com a gente.</p>
          <button onClick={() => navigate('/login')} className="px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-brand-600/25 text-lg">Começar Agora — é Grátis</button>
          <p className="text-dark-300 text-xs mt-4">7 dias de teste. Sem compromisso. Sem cartão de crédito.</p>
        </div>
      </section>

      <footer className="border-t border-dark-50 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-dark-400 text-sm">© 2026 adStudioAI. Todos os direitos reservados.</p>
          <div className="flex gap-6 text-dark-400 text-sm">
            <span className="hover:text-white cursor-pointer transition-colors">Termos</span>
            <span className="hover:text-white cursor-pointer transition-colors">Privacidade</span>
            <span className="hover:text-white cursor-pointer transition-colors">Contato</span>
          </div>
        </div>
      </footer>

      {/* Modal de cadastro pré-pagamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-card border border-dark-50 rounded-2xl p-8 w-full max-w-md mx-4">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-white">Quase lá!</h3>
              <p className="text-dark-400 text-sm mt-1">Preencha seus dados para seguir para o pagamento.</p>
            </div>
            <form onSubmit={handleModalSubmit} className="space-y-4">
              {modalError && (
                <div className="bg-red-900/20 border border-red-900/40 text-red-400 text-sm rounded-lg px-4 py-3 text-center">{modalError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-dark-500 mb-2">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-4 py-2.5 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-500 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2.5 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-dark-50 text-dark-400 hover:text-white font-semibold rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-600/50 text-white font-semibold rounded-lg transition-colors shadow-md"
                >
                  {modalLoading ? 'Redirecionando...' : 'Ir para Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
