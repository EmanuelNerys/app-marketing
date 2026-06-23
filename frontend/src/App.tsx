import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import ConexaoMeta from './pages/ConexaoMeta'
import Automacao from './pages/Automacao'
import Leads from './pages/Leads'
import Configuracoes from './pages/Configuracoes'
import Studio from './pages/Studio'
import PublicarInstagram from './pages/PublicarInstagram'
import Privacy from './pages/Privacy'
import Pricing from './pages/Pricing'
import CompletarCadastro from './pages/CompletarCadastro'
import Clients from './pages/Clients'
import Marketing from './pages/Marketing'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/completar-cadastro" element={<CompletarCadastro />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route element={<Layout />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/studio" element={<Studio />} />
          <Route path="/app/conexao" element={<ConexaoMeta />} />
          <Route path="/app/automacao" element={<Automacao />} />
          <Route path="/app/publicar" element={<PublicarInstagram />} />
          <Route path="/app/leads" element={<Leads />} />
          <Route path="/app/configuracoes" element={<Configuracoes />} />
          <Route path="/app/clientes" element={<Clients />} />
          <Route path="/app/marketing" element={<Marketing />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
