import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import api from '../services/api'
import { useLang } from '../hooks/useLang'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 shrink-0">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useLang()

  const [tab, setTab] = useState<'login' | 'signup'>('login')

  // login fields
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // signup fields
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupError, setSignupError] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { username, password })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      localStorage.setItem('user_id', data.user_id)
      localStorage.setItem('tenant_id', data.tenant_id)
      const redirect = searchParams.get('redirect') || '/app'
      navigate(redirect)
    } catch {
      setError(t('Usuário ou senha inválidos.', 'Invalid username or password.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setSignupError('')
    if (!signupName.trim() || !signupEmail.trim() || !signupPassword.trim()) {
      setSignupError(t('Preencha todos os campos.', 'Please fill in all fields.'))
      return
    }
    if (signupPassword.length < 6) {
      setSignupError(t('A senha deve ter no mínimo 6 caracteres.', 'Password must be at least 6 characters long.'))
      return
    }
    setSignupLoading(true)
    try {
      const { data } = await api.post('/auth/register', {
        brand_name: signupName.trim(),
        username: signupEmail.trim(),
        full_name: signupName.trim(),
        password: signupPassword,
      })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      localStorage.setItem('user_id', data.user_id)
      localStorage.setItem('tenant_id', data.tenant_id)
      navigate('/onboarding')
    } catch (err: any) {
      setSignupError(err.response?.data?.detail || t('Erro ao criar conta.', 'Error creating account.'))
    } finally {
      setSignupLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c10] flex flex-col items-center justify-center px-5 py-10 relative overflow-hidden">

      {/* glows */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[320px] bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-[300px] h-[300px] bg-indigo-500/5 blur-[100px] pointer-events-none" />

      {/* noise overlay */}
      <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")' }}
      />

      {/* top nav */}
      <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-7 py-[18px]">
        <a href="/" className="flex items-center gap-2 no-underline">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white"><path d="M13 3L4 14h8l-1 7 9-11h-8z"/></svg>
          </div>
          <span className="text-[13px] font-semibold text-white tracking-tight">adStudio<span className="text-white/40">AI</span></span>
        </a>
        <a href="#" className="text-xs text-white/25 hover:text-white/60 no-underline transition-colors">{t('Precisa de ajuda?', 'Need help?')}</a>
      </nav>

      <div className="w-full max-w-[360px] relative z-10">
        {/* heading */}
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-white tracking-tight leading-tight mb-1">
            {tab === 'login' ? t('Bem-vindo de volta', 'Welcome back') : t('Crie sua conta', 'Create your account')}
          </h1>
          <p className="text-[13px] text-white/30">
            {tab === 'login' ? t('Entre na sua conta para continuar', 'Sign in to your account to continue') : t('Comece grátis, sem cartão de crédito', 'Start for free, no credit card required')}
          </p>
        </div>

        {/* tabs */}
        <div className="flex border-b border-white/[0.07] mb-6">
          <button
            onClick={() => setTab('login')}
            className={`pb-3 text-[13px] font-medium mr-5 cursor-pointer transition-colors relative ${
              tab === 'login' ? 'text-white' : 'text-white/25 hover:text-white/60'
            }`}
          >
            {t('Entrar', 'Sign in')}
            {tab === 'login' && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-indigo-600 rounded-full" />}
          </button>
          <button
            onClick={() => setTab('signup')}
            className={`pb-3 text-[13px] font-medium mr-5 cursor-pointer transition-colors relative ${
              tab === 'signup' ? 'text-white' : 'text-white/25 hover:text-white/60'
            }`}
          >
            {t('Criar conta', 'Sign up')}
            {tab === 'signup' && <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-indigo-600 rounded-full" />}
          </button>
        </div>

        {/* LOGIN TAB */}
        {tab === 'login' && (
          <div>
            <button className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-[13px] font-medium text-white/70 hover:bg-white/[0.09] hover:border-white/[0.18] hover:text-white transition-all cursor-pointer mb-1">
              <GoogleIcon />
              {t('Continuar com Google', 'Continue with Google')}
            </button>

            <div className="flex items-center gap-2.5 my-[18px]">
              <div className="flex-1 h-px bg-white/[0.07]" />
              <span className="text-[11px] text-white/20 font-medium">{t('ou continue com email', 'or continue with email')}</span>
              <div className="flex-1 h-px bg-white/[0.07]" />
            </div>

            <form onSubmit={handleLogin}>
              {error && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mb-3.5">
                  <svg className="w-3.5 h-3.5 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  <span className="text-xs text-red-400">{error}</span>
                </div>
              )}

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-white/40">{t('Usuário', 'Username')}</span>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('seu usuário', 'your username')}
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] text-white text-[13px] rounded-lg outline-none transition-all placeholder-white/20 hover:border-white/[0.18] focus:bg-white/[0.06] focus:border-indigo-500/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-white/40">{t('Senha', 'Password')}</span>
                  <Link to="/forgot-password" className="text-[11px] text-indigo-400/80 no-underline hover:text-indigo-400 transition-colors">{t('Esqueceu?', 'Forgot?')}</Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] text-white text-[13px] rounded-lg outline-none transition-all placeholder-white/20 hover:border-white/[0.18] focus:bg-white/[0.06] focus:border-indigo-500/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer transition-all relative mt-1 tracking-tight hover:bg-indigo-700 hover:-translate-y-[0.5px] hover:shadow-[0_4px_20px_rgba(79,70,229,0.3)] active:translate-y-0 disabled:opacity-50"
              >
                <span className="relative z-10">{t('Entrar na conta', 'Sign in')}</span>
              </button>
            </form>

            <div className="text-center mt-3.5">
              <p className="text-xs text-white/20">
                {t('Não tem conta?', "Don't have an account?")}{' '}
                <button onClick={() => setTab('signup')} className="text-indigo-400/70 hover:text-indigo-400 no-underline transition-colors bg-none border-none cursor-pointer text-xs">
                  {t('Criar grátis →', 'Sign up free →')}
                </button>
              </p>
            </div>
          </div>
        )}

        {/* SIGNUP TAB */}
        {tab === 'signup' && (
          <div>
            <div className="flex items-start gap-2 bg-indigo-500/5 border border-indigo-500/12 rounded-lg px-3 py-2.5 mb-3.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0 mt-1" />
              <span className="text-[11px] text-white/30 leading-relaxed">{t('7 dias grátis, sem cartão de crédito. Cancele quando quiser.', '7 days free, no credit card required. Cancel anytime.')}</span>
            </div>

            <button className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-[13px] font-medium text-white/70 hover:bg-white/[0.09] hover:border-white/[0.18] hover:text-white transition-all cursor-pointer mb-1">
              <GoogleIcon />
              {t('Criar conta com Google', 'Sign up with Google')}
            </button>

            <div className="flex items-center gap-2.5 my-[18px]">
              <div className="flex-1 h-px bg-white/[0.07]" />
              <span className="text-[11px] text-white/20 font-medium">{t('ou use seu email', 'or use your email')}</span>
              <div className="flex-1 h-px bg-white/[0.07]" />
            </div>

            <form onSubmit={handleSignup}>
              {signupError && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 mb-3.5">
                  <svg className="w-3.5 h-3.5 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  <span className="text-xs text-red-400">{signupError}</span>
                </div>
              )}

              <div className="mb-3">
                <div className="mb-1.5">
                  <span className="text-xs font-medium text-white/40">{t('Nome completo', 'Full name')}</span>
                </div>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder={t('Seu nome', 'Your name')}
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] text-white text-[13px] rounded-lg outline-none transition-all placeholder-white/20 hover:border-white/[0.18] focus:bg-white/[0.06] focus:border-indigo-500/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="mb-3">
                <div className="mb-1.5">
                  <span className="text-xs font-medium text-white/40">Email</span>
                </div>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] text-white text-[13px] rounded-lg outline-none transition-all placeholder-white/20 hover:border-white/[0.18] focus:bg-white/[0.06] focus:border-indigo-500/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>
              <div className="mb-3">
                <div className="mb-1.5">
                  <span className="text-xs font-medium text-white/40">{t('Senha', 'Password')}</span>
                </div>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.1] text-white text-[13px] rounded-lg outline-none transition-all placeholder-white/20 hover:border-white/[0.18] focus:bg-white/[0.06] focus:border-indigo-500/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
                />
              </div>

              <button
                type="submit"
                disabled={signupLoading}
                className="w-full py-2.5 bg-indigo-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer transition-all relative mt-1 tracking-tight hover:bg-indigo-700 hover:-translate-y-[0.5px] hover:shadow-[0_4px_20px_rgba(79,70,229,0.3)] active:translate-y-0 disabled:opacity-50"
              >
                <span className="relative z-10">{t('Criar conta grátis', 'Sign up for free')}</span>
              </button>
            </form>

            <div className="text-center mt-3.5">
              <p className="text-xs text-white/20">
                {t('Já tem conta?', 'Already have an account?')}{' '}
                <button onClick={() => setTab('login')} className="text-indigo-400/70 hover:text-indigo-400 no-underline transition-colors bg-none border-none cursor-pointer text-xs">
                  {t('Entrar →', 'Sign in →')}
                </button>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="absolute bottom-[18px] left-0 right-0 text-center">
        <p className="text-[11px] text-white/[0.12]">
          <a href="#" className="text-white/20 hover:text-white/50 no-underline transition-colors">{t('Termos', 'Terms')}</a>
          {' · '}
          <a href="#" className="text-white/20 hover:text-white/50 no-underline transition-colors">{t('Privacidade', 'Privacy')}</a>
          {' · '}
          <a href="/" className="text-white/20 hover:text-white/50 no-underline transition-colors">{t('← Página inicial', '← Home')}</a>
        </p>
      </div>
    </div>
  )
}
