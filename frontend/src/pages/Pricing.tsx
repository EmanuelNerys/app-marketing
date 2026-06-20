import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Plan {
  id: string;
  name: string;
  value: number;
  description: string;
  features: string[];
  interval_days: number;
}

interface Subscription {
  id: string;
  plan: string;
  status: string;
  is_active: boolean;
}

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlans();
    fetchCurrentSubscription();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await api.get('/payments/plans');
      setPlans(response.data);
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const fetchCurrentSubscription = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await api.get('/payments/current');
      setCurrentSubscription(response.data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      navigate('/login');
      return;
    }
    setSelectedPlan(planId);
    try {
      const response = await api.post('/payments/subscribe', {
        plan: planId,
      });

      // If there's a payment link, redirect to it
      if (response.data.payment_link) {
        window.location.href = response.data.payment_link;
      } else {
        // For free plans, just show success
        alert('Bem-vindo ao plano ' + plans.find(p => p.id === planId)?.name + '!');
        fetchCurrentSubscription();
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      alert('Erro ao criar assinatura. Tente novamente.');
    } finally {
      setSelectedPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Carregando planos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Planos e Preços</h1>
          <p className="text-xl text-slate-300">
            Escolha o plano perfeito para suas necessidades
          </p>
        </div>

        {/* Current Subscription Info */}
        {currentSubscription && (
          <div className="mb-8 p-4 bg-green-900/30 border border-green-500 rounded-lg">
            <p className="text-white">
              ✓ Você está no plano{' '}
              <strong>{plans.find(p => p.id === currentSubscription.plan)?.name}</strong>
            </p>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-lg overflow-hidden transition-all duration-300 ${
                currentSubscription?.plan === plan.id
                  ? 'ring-2 ring-blue-500 shadow-2xl'
                  : 'hover:shadow-xl'
              }`}
            >
              <div className="bg-slate-800 p-6 h-full flex flex-col">
                {/* Badge */}
                {plan.id === 'premium' && (
                  <div className="absolute top-0 right-0 bg-yellow-500 text-slate-900 px-3 py-1 text-xs font-bold rounded-bl-lg">
                    MAIS POPULAR
                  </div>
                )}

                {currentSubscription?.plan === plan.id && (
                  <div className="absolute top-0 left-0 bg-green-500 text-white px-3 py-1 text-xs font-bold rounded-br-lg">
                    ATUAL
                  </div>
                )}

                {/* Plan Name */}
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-slate-300 text-sm mb-4">{plan.description}</p>

                {/* Price */}
                <div className="mb-6">
                  <div className="text-4xl font-bold text-white">
                    R$ {plan.value === 0 ? '0' : plan.value.toFixed(0)}
                  </div>
                  <p className="text-slate-400 text-sm">
                    {plan.value > 0 ? '/mês' : 'Para sempre'}
                  </p>
                </div>

                {/* Features */}
                <div className="mb-8 flex-grow">
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-green-400 mr-3">✓</span>
                        <span className="text-slate-300 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={
                    selectedPlan !== null ||
                    (currentSubscription?.plan === plan.id &&
                      currentSubscription?.is_active)
                  }
                  className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 ${
                    currentSubscription?.plan === plan.id &&
                    currentSubscription?.is_active
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : selectedPlan === plan.id
                      ? 'bg-slate-600 text-white cursor-wait'
                      : plan.id === 'premium'
                      ? 'bg-yellow-500 text-slate-900 hover:bg-yellow-600'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {selectedPlan === plan.id
                    ? 'Processando...'
                    : currentSubscription?.plan === plan.id &&
                      currentSubscription?.is_active
                    ? 'Plano Atual'
                    : 'Escolher'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="bg-slate-800 rounded-lg p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Perguntas Frequentes</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-white font-semibold mb-2">
                Posso mudar de plano a qualquer momento?
              </h3>
              <p className="text-slate-300">
                Sim! Você pode fazer upgrade ou downgrade de plano a qualquer momento. A mudança
                será refletida no próximo ciclo de cobrança.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">
                Há período de trial?
              </h3>
              <p className="text-slate-300">
                Sim, todos os planos pagos têm 7 dias de teste gratuito. Sem necessidade de cartão
                de crédito.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">
                O que acontece se eu cancelar?
              </h3>
              <p className="text-slate-300">
                Você pode cancelar a qualquer momento. O acesso permanecerá até o final do período
                pago.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
