export default function Configuracoes() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-600 mb-6">Configurações</h2>
      <div className="bg-surface-card rounded-xl border border-dark-50 p-8 max-w-lg space-y-6">
        <div>
          <label className="block text-sm font-medium text-dark-500 mb-1">Nome da Marca</label>
          <input type="text" placeholder="Minha Marca" className="w-full px-4 py-2 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300" />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-500 mb-1">Idioma</label>
          <select className="w-full px-4 py-2 bg-dark border border-dark-50 text-dark-600 rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none">
            <option>Português (Brasil)</option>
            <option>English (US)</option>
            <option>Español</option>
          </select>
        </div>
        <div className="pt-4 border-t border-dark-50">
          <h4 className="text-sm font-medium text-dark-400 mb-2">Informações do Sistema</h4>
          <p className="text-xs text-dark-300">Versão: 1.0.0</p>
          <p className="text-xs text-dark-300">Ambiente: Desenvolvimento</p>
        </div>
      </div>
    </div>
  )
}
