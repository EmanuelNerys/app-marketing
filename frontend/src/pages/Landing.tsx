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
  {
    q: 'Como funciona a captura de leads pelo Instagram?',
    a: 'Nosso sistema monitora comentários e mensagens da sua página do Instagram. Quando um seguidor comenta com a palavra-chave que você definiu, salvamos o lead automaticamente e enviamos uma mensagem personalizada em segundos.',
  },
  {
    q: 'Preciso ter uma página do Facebook?',
    a: 'Sim, o Instagram Business exige uma página do Facebook vinculada. O processo de conexão é simples e leva menos de 2 minutos.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim. Cancele quando quiser, sem multas ou taxas. Seus dados ficam salvos por 30 dias após o cancelamento.',
  },
]

const stats = [
  { value: '+12.000', label: 'Leads captados' },
  { value: '98%', label: 'Taxa de entrega' },
  { value: '< 5s', label: 'Resposta automática' },
  { value: '4.8 ⭐', label: 'Avaliação média' },
]

const steps = [
  {
    num: '01',
    icon: '🔗',
    title: 'Conecte sua conta',
    desc: 'Vincule seu Instagram Business ao painel com um clique. Seguro, rápido e sem complicação.',
  },
  {
    num: '02',
    icon: '⚡',
    title: 'Configure a palavra-chave',
    desc: 'Defina a palavra gatilho (ex: "QUERO") e a mensagem automática que será enviada.',
  },
  {
    num: '03',
    icon: '📊',
    title: 'Acompanhe os leads',
    desc: 'Dashboard em tempo real. Veja cada contato capturado e acompanhe suas conversões.',
  },
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
  const [openFaq, setOpenFaq] = useState<number | null>(null)

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
    } catch {
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

  const paidPlans = plans.filter((p) => p.value > 0)
  const freePlans = plans.filter((p) => p.value === 0)

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e2e2e8]">

      {/* ── NAV ─────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 flex items-center justify-between px-6 md:px-10 py-4 border-b border-white/[0.06] bg-[#0a0a0f]/90 backdrop-blur-md">
        <button
          onClick={() => navigate('/')}
          className="text-base font-semibold text-white tracking-tight hover:opacity-80 transition-opacity"
        >
          ad<span className="text-indigo-400">Studio</span>AI
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 text-sm text-[#666] hover:text-white transition-colors"
          >
            Entrar
          </button>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Começar grátis
          </button>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative px-6 md:px-10 pt-20 pb-16 md:pt-28 md:pb-20 overflow-hidden">
        {/* subtle grid bg */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle, #818cf8 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-600/10 blur-[100px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          {/* badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Automação de marketing para Instagram
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-white leading-[1.05] tracking-tight mb-5">
            Seguidores que viram{' '}
            <span className="text-indigo-400">clientes reais</span>
          </h1>

          <p className="text-base md:text-lg text-[#666] max-w-xl mx-auto leading-relaxed mb-10">
            Capture leads automaticamente quando alguém comenta na sua publicação.
            Configure em 2 minutos — depois é só acompanhar o funil crescer.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-lg shadow-indigo-600/20"
            >
              Automatizar minhas vendas →
            </button>
            <button
              onClick={() => document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-7 py-3.5 border border-white/10 text-[#888] hover:text-white hover:border-white/20 font-medium rounded-xl transition-colors text-sm"
            >
              Ver planos
            </button>
          </div>
          <p className="text-xs text-[#3a3a45] mt-4">
            Sem cartão de crédito · 7 dias grátis · Cancele quando quiser
          </p>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────────── */}
      <div className="border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 md:px-10 grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-white/[0.06]">
          {stats.map((s) => (
            <div key={s.label} className="px-6 py-8 text-center">
              <p className="text-3xl font-bold text-white tracking-tight">{s.value}</p>
              <p className="text-xs text-[#555] mt-1.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 md:px-10 py-20 md:py-24">
        <p className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3">Como funciona</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
          Três passos, zero esforço
        </h2>
        <p className="text-sm text-[#555] mb-10 max-w-md">
          Configure uma vez e deixe a automação trabalhar enquanto você foca no que importa.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          {steps.map((s) => (
            <div
              key={s.num}
              className="relative bg-[#111118] border border-white/[0.06] rounded-xl p-6 overflow-hidden group hover:border-indigo-500/30 transition-colors"
            >
              {/* top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-indigo-500 to-transparent" />
              <span className="text-[10px] font-bold text-indigo-400 tracking-widest">{s.num}</span>
              <div className="text-2xl my-3">{s.icon}</div>
              <h3 className="text-sm font-semibold text-[#e2e2e8] mb-2">{s.title}</h3>
              <p className="text-xs text-[#555] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PARTNERS ─────────────────────────────────────── */}
      <div className="border-y border-white/[0.06] py-10">
        <div className="max-w-5xl mx-auto px-6 md:px-10 text-center">
          <p className="text-xs text-[#3a3a45] mb-6 tracking-widest uppercase">Empresas que confiam no adStudioAI</p>
          <div className="flex flex-wrap justify-center gap-3">
            {partners.map((p) => (
              <div
                key={p}
                className="px-5 py-2.5 bg-[#111118] border border-white/[0.06] rounded-lg"
              >
                <span className="text-xs text-[#444] font-medium">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PLANS ─────────────────────────────────────────── */}
      <section id="planos" className="bg-[#07070d] border-b border-white/[0.06] py-20 md:py-24">
        <div className="max-w-5xl mx-auto px-6 md:px-10">
          <p className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 text-center">Planos</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight text-center mb-2">
            Para todo tipo de negócio
          </h2>
          <p className="text-sm text-[#555] text-center mb-12 max-w-sm mx-auto">
            Todos incluem 7 dias de teste gratuito. Cancele quando quiser.
          </p>

          {plans.length === 0 ? (
            <p className="text-center text-[#444] text-sm">Carregando planos...</p>
          ) : (
            <div className="grid md:grid-cols-3 gap-4">
              {/* paid plans */}
              {paidPlans.map((plan, index) => {
                const featured = index === 1
                return (
                  <div
                    key={plan.id}
                    className={`rounded-xl p-6 flex flex-col border transition-all ${
                      featured
                        ? 'bg-[#1a1850] border-indigo-500/40 shadow-xl shadow-indigo-900/20 md:-translate-y-1'
                        : 'bg-[#111118] border-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    {featured && (
                      <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/15 rounded-full px-3 py-1 w-fit mb-4">
                        Mais popular
                      </span>
                    )}
                    <h3 className="text-base font-bold text-white">{plan.name}</h3>
                    <p className={`text-xs mt-1 mb-5 ${featured ? 'text-indigo-300/60' : 'text-[#555]'}`}>
                      {plan.description}
                    </p>
                    <div className="mb-6">
                      <span className="text-3xl font-bold text-white tracking-tight">
                        R$ {plan.value.toFixed(0)}
                      </span>
                      <span className={`text-xs ml-1 ${featured ? 'text-indigo-300/50' : 'text-[#444]'}`}>/mês</span>
                    </div>
                    <ul className="space-y-2.5 mb-8 flex-1">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className={`flex items-start gap-2 text-xs ${featured ? 'text-indigo-200/70' : 'text-[#666]'}`}
                        >
                          <span className="text-indigo-400 mt-px shrink-0">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => handlePlanClick(plan.id)}
                      disabled={selectedPlan !== null}
                      className={`w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        featured
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          : 'bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400'
                      }`}
                    >
                      {selectedPlan === plan.id ? 'Redirecionando...' : 'Assinar agora'}
                    </button>
                  </div>
                )
              })}

              {/* free plans */}
              {freePlans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-xl p-6 flex flex-col bg-[#111118] border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                >
                  <h3 className="text-base font-bold text-white">{plan.name}</h3>
                  <p className="text-xs text-[#555] mt-1 mb-5">{plan.description}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-white">Grátis</span>
                  </div>
                  <ul className="space-y-2.5 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-[#666]">
                        <span className="text-indigo-400 mt-px shrink-0">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => navigate('/login')}
                    className="w-full py-2.5 text-sm font-semibold rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 transition-colors"
                  >
                    Começar grátis
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 md:px-10 py-20 md:py-24">
        <p className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3">Dúvidas</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight mb-10">
          Perguntas frequentes
        </h2>
        <div className="space-y-2">
          {faq.map((item, i) => (
            <div
              key={item.q}
              className="border border-white/[0.06] rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-[#ccc] hover:text-white transition-colors"
              >
                {item.q}
                <span
                  className={`text-[#444] text-xs ml-4 shrink-0 transition-transform duration-200 ${
                    openFaq === i ? 'rotate-180' : ''
                  }`}
                >
                  ▼
                </span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-xs text-[#555] leading-relaxed border-t border-white/[0.04] pt-4">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────────────── */}
      <section className="border-t border-white/[0.06]">
        <div className="max-w-2xl mx-auto px-6 md:px-10 py-20 md:py-24 text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tight leading-tight mb-4">
            Pronto para transformar seu<br />Instagram em máquina de vendas?
          </h2>
          <p className="text-sm text-[#555] mb-8">
            Mais de 200 empresas já automatizam a captação de leads com a gente.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20 text-sm"
          >
            Começar agora — é grátis
          </button>
          <p className="text-xs text-[#333] mt-4">7 dias de teste · Sem compromisso · Cancele quando quiser</p>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#3a3a45]">© 2026 adStudioAI. Todos os direitos reservados.</p>
          <div className="flex gap-5">
            {['Termos', 'Privacidade', 'Contato'].map((l) => (
              <span key={l} className="text-xs text-[#3a3a45] hover:text-white cursor-pointer transition-colors">
                {l}
              </span>
            ))}
          </div>
        </div>
      </footer>

      {/* ── MODAL ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-[#111118] border border-white/[0.08] rounded-2xl p-8 w-full max-w-md">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-white">Quase lá!</h3>
              <p className="text-xs text-[#555] mt-1.5">Preencha seus dados para ir ao pagamento.</p>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {modalError && (
                <div className="bg-red-900/20 border border-red-500/20 text-red-400 text-xs rounded-lg px-4 py-3 text-center">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#666] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-sm rounded-lg focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none placeholder-[#333] transition-colors"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-white/[0.08] text-[#666] hover:text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {modalLoading ? 'Redirecionando...' : 'Ir para pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
