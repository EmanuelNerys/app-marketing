import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import type { OnboardingStatus, AdAccount } from '../types'

const plans = [
  {
    id: 'autonomo',
    name: 'Autônomo',
    price: 'R$ 97',
    period: '/mês',
    description: 'Para quem está começando a captar leads',
    features: [
      '1 conta Meta conectada',
      'Até 500 leads/mês',
      'Resposta automática por palavra-chave',
      'Dashboard básico',
      'Suporte por email',
    ],
    icon: '🚀',
  },
  {
    id: 'agencia',
    name: 'Agência',
    price: 'R$ 197',
    period: '/mês',
    description: 'Para agências e profissionais de marketing',
    features: [
      '3 contas Meta conectadas',
      'Até 2.000 leads/mês',
      'Resposta automática + DM',
      'Dashboard completo com gráficos',
      'Relatórios de conversão',
      'Suporte prioritário',
    ],
    icon: '🏢',
    featured: true,
  },
]

const steps = [
  { num: 1, label: 'Plano' },
  { num: 2, label: 'Instagram' },
  { num: 3, label: 'Conta de Anúncios' },
  { num: 4, label: 'Primeiro Vídeo' },
]

export default function Onboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [currentStep, setCurrentStep] = useState(1)
  const [accountId, setAccountId] = useState('')
  const [planType, setPlanType] = useState('autonomo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([])
  const [selectedAdAccount, setSelectedAdAccount] = useState('')

  const accountIdParam = searchParams.get('account_id') || accountId

  useEffect(() => {
    if (accountIdParam) {
      setAccountId(accountIdParam)
      loadStatus(accountIdParam)
    }
  }, [accountIdParam])

  async function loadStatus(id: string) {
    try {
      const res = await api.get('/auth/onboarding/status', { params: { account_id: id } })
      const s = res.data as OnboardingStatus
      setCurrentStep(s.onboarding_step + 1)
      setPlanType(s.plan_type)
    } catch {
      setCurrentStep(1)
    }
  }

  async function handleSelectPlan(plan: string) {
    setLoading(true)
    setError('')
    try {
      let id = accountId
      if (!id) {
        id = crypto.randomUUID()
        setAccountId(id)
      }
      await api.post('/auth/onboarding/plan', { plan_type: plan }, { params: { account_id: id } })
      setPlanType(plan)
      setCurrentStep(2)
    } catch {
      setError('Erro ao selecionar plano.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnectInstagram() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/auth/meta/login')
      if (res.data.auth_url) {
        window.location.href = res.data.auth_url
      }
    } catch {
      setError('Erro ao conectar Instagram. Verifique as configurações da API.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLoadAdAccounts() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/auth/meta/ad-accounts', { params: { account_id: accountIdParam } })
      setAdAccounts(res.data.ad_accounts)
      if (res.data.ad_accounts.length > 0) {
        setSelectedAdAccount(res.data.ad_accounts[0].id)
      }
    } catch {
      setError('Nenhuma conta de anúncios encontrada. Você pode pular esta etapa.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmAdAccount() {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/onboarding/complete-step', null, {
        params: { account_id: accountIdParam, step: 3 },
      })
      setCurrentStep(4)
    } catch {
      setError('Erro ao salvar conta de anúncios.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSkipAdAccount() {
    try {
      await api.post('/auth/onboarding/complete-step', null, {
        params: { account_id: accountIdParam, step: 3 },
      })
    } catch {
      // segue mesmo assim
    }
    setCurrentStep(4)
  }

  function handleGoToStudio() {
    navigate('/app')
  }

  useEffect(() => {
    if (currentStep === 3 && accountIdParam && adAccounts.length === 0) {
      handleLoadAdAccounts()
    }
  }, [currentStep])

  function renderStepIndicator() {
    return (
      <div className="flex items-center justify-center gap-2 mb-12 flex-wrap">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                s.num <= currentStep
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#0a0a0f] border border-white/[0.06] text-[#555]'
              }`}
            >
              {s.num < currentStep ? '✓' : s.num}
            </div>
            <span
              className={`text-sm hidden sm:inline ${
                s.num <= currentStep ? 'text-[#e2e2e8]' : 'text-[#555]'
              }`}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`w-8 h-0.5 mx-1 ${
                  s.num < currentStep ? 'bg-indigo-600' : 'bg-white/[0.06]'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    )
  }

  function renderStep1() {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Escolha seu plano</h2>
          <p className="text-[#555]">Todos incluem 7 dias de teste grátis. Sem compromisso.</p>
        </div>
        {error && (
          <div className="max-w-md mx-auto mb-6 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 text-center">{error}</div>
        )}
        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 flex flex-col transition-all cursor-pointer hover:scale-[1.02] ${
                plan.featured
                  ? 'bg-[#1a1850] border-indigo-500/40 shadow-xl shadow-indigo-900/20'
                  : 'bg-[#111118] border-white/[0.06] hover:border-indigo-500/30'
              }`}
              onClick={() => handleSelectPlan(plan.id)}
            >
              {plan.featured && (
                <span className="text-indigo-400 text-[10px] font-semibold bg-indigo-500/15 rounded-full px-3 py-1 w-fit mb-3">Mais popular</span>
              )}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{plan.icon}</span>
                <h4 className="text-xl font-bold text-white">{plan.name}</h4>
              </div>
              <p className={`text-sm mb-4 ${plan.featured ? 'text-indigo-300/60' : 'text-[#555]'}`}>{plan.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                <span className={`text-sm ${plan.featured ? 'text-indigo-300/50' : 'text-[#444]'}`}>{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className={`flex items-center gap-2 text-sm ${plan.featured ? 'text-indigo-200/70' : 'text-[#666]'}`}>
                    <span className="text-indigo-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={loading}
                className={`w-full py-3 font-semibold rounded-xl transition-colors text-sm ${
                  plan.featured
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    : 'bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400'
                } disabled:opacity-50`}
              >
                {loading ? 'Selecionando...' : `Escolher ${plan.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderStep2() {
    return (
      <div className="max-w-md mx-auto text-center">
        <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">📸</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Conectar Instagram</h2>
        <p className="text-[#555] mb-6">
          Conecte sua página do Instagram para começar a automatizar a captação de leads.
        </p>
        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 mb-6 text-left text-sm text-[#666] space-y-3">
          <p className="flex items-center gap-2"><span className="text-green-400">✓</span> Acesso a comentários e mensagens</p>
          <p className="flex items-center gap-2"><span className="text-green-400">✓</span> Publicação de respostas automáticas</p>
          <p className="flex items-center gap-2"><span className="text-green-400">✓</span> Gerenciamento de anúncios</p>
          <p className="flex items-center gap-2"><span className="text-[#444]">○</span> Nenhuma publicação será feita sem sua autorização</p>
        </div>
        <button
          onClick={handleConnectInstagram}
          disabled={loading}
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold rounded-xl transition-colors"
        >
          {loading ? 'Redirecionando...' : 'Conectar com Facebook'}
        </button>
      </div>
    )
  }

  function renderStep3() {
    return (
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">📢</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Conta de Anúncios</h2>
          <p className="text-[#555]">
            {planType === 'agencia'
              ? 'Selecione as contas de anúncios que deseja vincular.'
              : 'Selecione sua conta de anúncios para começar.'}
          </p>
        </div>
        {error && (
          <div className="mb-6 bg-red-900/20 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
        )}
        {loading ? (
          <div className="text-center py-8">
            <p className="text-[#555]">Buscando contas de anúncios...</p>
          </div>
        ) : adAccounts.length > 0 ? (
          <div className="space-y-3 mb-6">
            {adAccounts.map((acc) => (
              <label
                key={acc.id}
                className={`block p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedAdAccount === acc.id
                    ? 'bg-indigo-600/10 border-indigo-500'
                    : 'bg-[#111118] border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="adAccount"
                    value={acc.id}
                    checked={selectedAdAccount === acc.id}
                    onChange={(e) => setSelectedAdAccount(e.target.value)}
                    className="accent-indigo-600"
                  />
                  <div>
                    <p className="text-[#e2e2e8] font-medium">{acc.name}</p>
                    <p className="text-[#555] text-xs">{acc.currency} • ID: {acc.id}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-6 text-center mb-6">
            <p className="text-[#555] text-sm mb-2">Nenhuma conta de anúncios encontrada.</p>
            <p className="text-[#444] text-xs">Você pode pular esta etapa e configurar depois.</p>
          </div>
        )}
        <div className="flex gap-3">
          {adAccounts.length > 0 && (
            <button
              onClick={handleConfirmAdAccount}
              disabled={!selectedAdAccount}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold rounded-xl transition-colors"
            >
              Confirmar
            </button>
          )}
          <button
            onClick={handleSkipAdAccount}
            className="flex-1 py-3 border border-white/[0.06] text-[#666] hover:text-[#e2e2e8] hover:border-white/[0.12] font-semibold rounded-xl transition-colors"
          >
            {adAccounts.length > 0 ? 'Pular' : 'Pular etapa'}
          </button>
        </div>
      </div>
    )
  }

  function renderStep4() {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🎬</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Criar seu primeiro vídeo</h2>
        <p className="text-[#555] mb-8">
          Veja como é fácil criar um vídeo de marketing automatizado em poucos cliques.
        </p>

        <div className="bg-[#111118] rounded-xl border border-white/[0.06] p-8 mb-8 text-left space-y-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">1</div>
            <div>
              <h4 className="text-[#e2e2e8] font-semibold mb-1">Acesse o Studio</h4>
              <p className="text-[#555] text-sm">Clique em "Criar Agora" para abrir o estúdio de criação de vídeos.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">2</div>
            <div>
              <h4 className="text-[#e2e2e8] font-semibold mb-1">Escolha um template</h4>
              <p className="text-[#555] text-sm">Selecione entre dezenas de templates prontos para marketing digital.</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">3</div>
            <div>
              <h4 className="text-[#e2e2e8] font-semibold mb-1">Personalize e publique</h4>
              <p className="text-[#555] text-sm">Edite textos, cores e imagens. Publique diretamente no Instagram.</p>
            </div>
          </div>
        </div>

        <button
          onClick={handleGoToStudio}
          className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20 text-lg"
        >
          Criar Agora
        </button>
        <p className="text-[#444] text-sm mt-4">Você também pode acessar o Studio a qualquer momento pelo painel.</p>
      </div>
    )
  }

  const stepsComponent = [renderStep1, renderStep2, renderStep3, renderStep4]

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      <div className="px-4 py-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-base font-semibold text-white hover:text-indigo-400 transition-colors"
          >
            ad<span className="text-indigo-400">Studio</span>AI
          </button>
          {currentStep > 1 && (
            <p className="text-[#555] text-sm">
              Passo {currentStep} de 4
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 pb-16">
        <div className="max-w-4xl mx-auto">
          {currentStep > 1 && renderStepIndicator()}
          {currentStep <= 4 && stepsComponent[currentStep - 1]()}
        </div>
      </div>
    </div>
  )
}
