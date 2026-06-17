import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    navigate('/app')
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-600/25">
            <span className="text-2xl font-bold text-white">AM</span>
          </div>
          <h1 className="text-2xl font-bold text-dark-600">adStudioAI</h1>
          <p className="text-dark-400 text-sm mt-1">Automação de captação de leads</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-surface-card rounded-2xl border border-dark-50 p-8 space-y-5">
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
          <div>
            <label className="block text-sm font-medium text-dark-500 mb-2">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              className="w-full px-4 py-2.5 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row pt-2">
            <button 
              type="button" 
              onClick={() => navigate('/onboarding')}
              className="w-full py-2.5 bg-dark-50 hover:bg-dark-100 text-dark-600 font-semibold rounded-lg transition-colors shadow-md border border-dark-50"
            >
              Escolher Plano
            </button>
            <button type="submit" className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors shadow-md">
              Entrar
            </button>
          </div>
          <p className="text-xs text-dark-300 text-center">Acesso sem validação — clique em Entrar</p>
          <p className="text-xs text-dark-400 text-center">
            <a href="/" className="hover:text-brand-400 underline">Voltar para página inicial</a>
          </p>
        </form>
      </div>
    </div>
  )
}
