import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Idioma da interface. Padrão é sempre português (clientes reais nunca veem
 * mudança nenhuma). Ativa inglês de duas formas:
 *   - ?lang=en na URL (também grava no localStorage, então persiste
 *     mesmo navegando por link/menu depois)
 *   - o botão de idioma no Sidebar (toggleLang), usado pra gravar o
 *     screencast do App Review da Meta sem precisar digitar ?lang=en
 *     em toda URL.
 */
export type Lang = 'pt' | 'en'

const STORAGE_KEY = 'ui_lang'

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'pt'
  } catch {
    return 'pt'
  }
}

export function useLang() {
  const [params] = useSearchParams()
  const urlLang = params.get('lang')
  const [lang, setLang] = useState<Lang>(() =>
    urlLang === 'en' || urlLang === 'pt' ? urlLang : readStoredLang(),
  )

  useEffect(() => {
    if (urlLang === 'en' || urlLang === 'pt') {
      setLang(urlLang)
      try { localStorage.setItem(STORAGE_KEY, urlLang) } catch { /* ignore */ }
    }
  }, [urlLang])

  function t(pt: string, en: string): string {
    return lang === 'en' ? en : pt
  }

  return { lang, t }
}

/** Alterna PT/EN persistindo no localStorage e recarrega a página atual
 * para que todo componente já montado releia o idioma novo. */
export function toggleLang(): void {
  const next: Lang = readStoredLang() === 'en' ? 'pt' : 'en'
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  window.location.reload()
}
