import { useSearchParams } from 'react-router-dom'

/**
 * Idioma da interface. Padrão é sempre português (clientes reais nunca veem
 * mudança nenhuma) — inglês só ativa explicitamente via ?lang=en na URL,
 * usado para gravar o screencast do App Review da Meta.
 */
export function useLang() {
  const [params] = useSearchParams()
  const lang: 'pt' | 'en' = params.get('lang') === 'en' ? 'en' : 'pt'

  function t(pt: string, en: string): string {
    return lang === 'en' ? en : pt
  }

  return { lang, t }
}
