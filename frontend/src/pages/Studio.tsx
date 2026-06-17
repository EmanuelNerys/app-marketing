import { useState, useCallback } from 'react'
import api from '../services/api'

type Step = 'upload' | 'prompt' | 'config' | 'generating' | 'result' | 'publish'

interface VideoConfig {
  duration: '5' | '10' | '15' | '30'
  format: '9:16' | '1:1' | '16:9'
  style: 'cinematographic' | 'dynamic' | 'minimalist' | 'energetic'
}

interface GenerationState {
  progress: number
  status: string
  estimatedTime: number
}

export default function Studio() {
  const [currentStep, setCurrentStep] = useState<Step>('upload')
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([])
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [config, setConfig] = useState<VideoConfig>({
    duration: '15',
    format: '9:16',
    style: 'cinematographic',
  })
  const [generation, setGeneration] = useState<GenerationState>({
    progress: 0,
    status: 'Iniciando...',
    estimatedTime: 60,
  })
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null)
  const [publishData, setPublishData] = useState({
    type: 'feed',
    caption: '',
    hashtags: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Etapa 1: Upload da Mídia
  const handleImageDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024) {
        const reader = new FileReader()
        reader.onload = (event) => {
          setUploadedImage(event.target?.result as string)
          setCurrentStep('prompt')
          setError('')
        }
        reader.readAsDataURL(file)
      } else {
        setError('Arquivo inválido. Use JPG, PNG ou WebP até 10MB.')
      }
    }
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string)
        setCurrentStep('prompt')
        setError('')
      }
      reader.readAsDataURL(file)
    }
  }

  // Etapa 2: Sugerir Prompts com Claude Vision
  const handleAnalyzeImage = async () => {
    if (!uploadedImage) return
    setLoadingPrompts(true)
    try {
      const response = await api.post('/studio/analyze-image', {
        image_base64: uploadedImage,
      })
      setSuggestedPrompts(response.data.suggested_prompts || [])
      setCurrentStep('prompt')
    } catch (err) {
      setError('Erro ao analisar imagem')
    } finally {
      setLoadingPrompts(false)
    }
  }

  const selectSuggestedPrompt = (suggestedPrompt: string) => {
    setPrompt(suggestedPrompt)
  }

  // Etapa 3: Configurações do Vídeo
  const handleStartGeneration = async () => {
    if (!prompt.trim()) {
      setError('Digite um prompt para o vídeo')
      return
    }
    setCurrentStep('config')
  }

  // Etapa 4: Gerar Vídeo
  const handleGenerateVideo = async () => {
    if (!uploadedImage || !prompt) {
      setError('Imagem e prompt são obrigatórios')
      return
    }

    setCurrentStep('generating')
    setGeneration({ progress: 0, status: 'Iniciando geração...', estimatedTime: 60 })
    setLoading(true)
    setError('')

    try {
      const response = await api.post('/studio/generate-video', {
        image_base64: uploadedImage,
        prompt,
        duration: config.duration,
        format: config.format,
        style: config.style,
      })

      // Simular progresso enquanto o vídeo está sendo gerado
      let progress = 0
      const progressInterval = setInterval(() => {
        progress += Math.random() * 15
        if (progress >= 90) progress = 90
        setGeneration((prev) => ({
          ...prev,
          progress: Math.min(progress, 90),
          status: `Processando... ${Math.round(progress)}%`,
        }))
      }, 500)

      // Aguardar conclusão
      const checkStatusInterval = setInterval(async () => {
        try {
          const statusResponse = await api.get(`/studio/generation-status/${response.data.job_id}`)
          if (statusResponse.data.status === 'completed') {
            clearInterval(progressInterval)
            clearInterval(checkStatusInterval)
            setGeneration({
              progress: 100,
              status: 'Vídeo gerado com sucesso!',
              estimatedTime: 0,
            })
            setGeneratedVideoUrl(statusResponse.data.video_url)
            setCurrentStep('result')
          } else if (statusResponse.data.status === 'failed') {
            clearInterval(progressInterval)
            clearInterval(checkStatusInterval)
            setError('Erro ao gerar vídeo')
            setCurrentStep('config')
          }
        } catch {
          clearInterval(checkStatusInterval)
        }
      }, 2000)
    } catch (err) {
      setError('Erro ao iniciar geração do vídeo')
      setCurrentStep('config')
    } finally {
      setLoading(false)
    }
  }

  // Etapa 5: Refinar Vídeo
  const handleRefineVideo = () => {
    setCurrentStep('config')
  }

  // Etapa 6: Publicar
  const handlePublish = async () => {
    if (!generatedVideoUrl) {
      setError('Nenhum vídeo para publicar')
      return
    }

    setLoading(true)
    try {
      await api.post('/studio/publish-video', {
        video_url: generatedVideoUrl,
        type: publishData.type,
        caption: publishData.caption,
        hashtags: publishData.hashtags,
      })
      alert('Vídeo publicado com sucesso!')
      setCurrentStep('upload')
      setUploadedImage(null)
      setPrompt('')
      setGeneratedVideoUrl(null)
    } catch (err) {
      setError('Erro ao publicar vídeo')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (generatedVideoUrl) {
      const a = document.createElement('a')
      a.href = generatedVideoUrl
      a.download = 'video-adstudioai.mp4'
      a.click()
    }
  }

  return (
    <div className="min-h-screen bg-surface py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Studio de Criação</h1>
          <p className="text-dark-400">Crie vídeos publicitários incríveis com IA em minutos</p>
        </div>

        {/* Step Indicator */}
        <div className="flex justify-between mb-12 max-w-2xl">
          {(['upload', 'prompt', 'config', 'generating', 'result', 'publish'] as Step[]).map((step, i) => (
            <div key={step} className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                  ['upload', 'prompt', 'config', 'generating', 'result', 'publish'].indexOf(currentStep) >= i
                    ? 'bg-brand-600 text-white'
                    : 'bg-dark-50 text-dark-400'
                }`}
              >
                {i + 1}
              </div>
              <p className="text-xs mt-2 text-center text-dark-400">
                {['Upload', 'Prompt', 'Config', 'Gerar', 'Resultado', 'Publicar'][i]}
              </p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="bg-surface-card rounded-2xl border border-dark-50 p-8">
          {error && (
            <div className="mb-6 bg-red-900/20 border border-red-900/40 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Etapa 1: Upload */}
          {currentStep === 'upload' && (
            <div className="space-y-6">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleImageDrop}
                className="border-2 border-dashed border-dark-50 rounded-xl p-12 text-center cursor-pointer hover:border-brand-600 transition-colors"
              >
                <span className="text-4xl block mb-4">📤</span>
                <h3 className="text-xl font-semibold text-white mb-2">Arraste sua imagem aqui</h3>
                <p className="text-dark-400 mb-4">ou</p>
                <label>
                  <span className="px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors cursor-pointer">
                    Selecionar Arquivo
                  </span>
                  <input type="file" accept="image/*" onChange={handleFileInput} className="hidden" />
                </label>
                <p className="text-xs text-dark-300 mt-4">JPG, PNG ou WebP até 10MB</p>
              </div>

              {uploadedImage && (
                <div>
                  <p className="text-sm font-medium text-dark-400 mb-3">Preview da Imagem</p>
                  <img src={uploadedImage} alt="Preview" className="w-full max-w-xs rounded-lg border border-dark-50" />
                  <button
                    onClick={handleAnalyzeImage}
                    disabled={loadingPrompts}
                    className="mt-4 px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {loadingPrompts ? 'Analisando...' : 'Analisar Imagem & Sugerir Prompts'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Etapa 2: Prompt */}
          {currentStep === 'prompt' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Descrição do Vídeo</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: produto flutuando em fundo clean, câmera zoom-in suave, cores vibrantes"
                  className="w-full px-4 py-3 bg-dark border border-dark-50 text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300 min-h-32"
                />
              </div>

              {suggestedPrompts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-dark-400 mb-2">Sugestões Inteligentes</p>
                  <div className="space-y-2">
                    {suggestedPrompts.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => selectSuggestedPrompt(suggestion)}
                        className="w-full text-left p-3 bg-brand-600/10 border border-brand-600/30 rounded-lg text-sm text-white hover:bg-brand-600/20 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep('upload')}
                  className="flex-1 px-6 py-2 border border-dark-50 text-dark-400 font-semibold rounded-lg transition-colors hover:border-dark-200 hover:text-white"
                >
                  Voltar
                </button>
                <button
                  onClick={handleStartGeneration}
                  className="flex-1 px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}

          {/* Etapa 3: Configurações */}
          {currentStep === 'config' && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-dark-400 mb-2">Duração</label>
                  <select
                    value={config.duration}
                    onChange={(e) => setConfig({ ...config, duration: e.target.value as any })}
                    className="w-full px-4 py-2 bg-dark border border-dark-50 text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="5">5 segundos</option>
                    <option value="10">10 segundos</option>
                    <option value="15">15 segundos</option>
                    <option value="30">30 segundos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-400 mb-2">Formato</label>
                  <select
                    value={config.format}
                    onChange={(e) => setConfig({ ...config, format: e.target.value as any })}
                    className="w-full px-4 py-2 bg-dark border border-dark-50 text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="9:16">9:16 (Stories/Reels)</option>
                    <option value="1:1">1:1 (Feed)</option>
                    <option value="16:9">16:9 (Horizontal)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-400 mb-2">Estilo</label>
                  <select
                    value={config.style}
                    onChange={(e) => setConfig({ ...config, style: e.target.value as any })}
                    className="w-full px-4 py-2 bg-dark border border-dark-50 text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  >
                    <option value="cinematographic">Cinematográfico</option>
                    <option value="dynamic">Dinâmico</option>
                    <option value="minimalist">Minimalista</option>
                    <option value="energetic">Energético</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep('prompt')}
                  className="flex-1 px-6 py-2 border border-dark-50 text-dark-400 font-semibold rounded-lg transition-colors hover:border-dark-200 hover:text-white"
                >
                  Voltar
                </button>
                <button
                  onClick={handleGenerateVideo}
                  disabled={loading}
                  className="flex-1 px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>⚡</span>
                  {loading ? 'Gerando...' : 'Gerar Vídeo'}
                </button>
              </div>
            </div>
          )}

          {/* Etapa 4: Gerando */}
          {currentStep === 'generating' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 bg-brand-600/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <span className="text-2xl">⚡</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">{generation.status}</h3>
                <p className="text-dark-400">Tempo estimado: ~{generation.estimatedTime}s</p>
              </div>
              <div className="w-full bg-dark rounded-full h-3 overflow-hidden">
                <div
                  className="bg-brand-600 h-full transition-all duration-300"
                  style={{ width: `${generation.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Etapa 5: Resultado */}
          {currentStep === 'result' && generatedVideoUrl && (
            <div className="space-y-6">
              <div className="bg-dark rounded-xl overflow-hidden">
                <video src={generatedVideoUrl} controls className="w-full" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <button
                  onClick={handleDownload}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-dark-50 hover:bg-dark-100 text-dark-600 font-semibold rounded-lg transition-colors"
                >
                  <span>💾</span>
                  <span className="hidden sm:inline">Baixar</span>
                </button>
                <button
                  onClick={handleRefineVideo}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-dark-50 hover:bg-dark-100 text-dark-600 font-semibold rounded-lg transition-colors"
                >
                  <span>🔄</span>
                  <span className="hidden sm:inline">Refinar</span>
                </button>
                <button
                  onClick={() => setCurrentStep('publish')}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors col-span-2"
                >
                  <span>📤</span>
                  Publicar
                </button>
              </div>
            </div>
          )}

          {/* Etapa 6: Publicar */}
          {currentStep === 'publish' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Tipo de Publicação</label>
                <div className="grid grid-cols-3 gap-3">
                  {['feed', 'reels', 'stories'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setPublishData({ ...publishData, type: type as any })}
                      className={`py-2 px-4 rounded-lg font-semibold transition-colors ${
                        publishData.type === type
                          ? 'bg-brand-600 text-white'
                          : 'bg-dark-50 text-dark-600 hover:bg-dark-100'
                      }`}
                    >
                      {type === 'feed' && 'Feed'}
                      {type === 'reels' && 'Reels'}
                      {type === 'stories' && 'Stories'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Legenda</label>
                <textarea
                  value={publishData.caption}
                  onChange={(e) => setPublishData({ ...publishData, caption: e.target.value })}
                  placeholder="Escreva a legenda do seu vídeo..."
                  className="w-full px-4 py-3 bg-dark border border-dark-50 text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300 min-h-24"
                />
                <p className="text-xs text-dark-400 mt-1">{publishData.caption.length} caracteres</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-400 mb-2">Hashtags (sugestões)</label>
                <input
                  type="text"
                  value={publishData.hashtags}
                  onChange={(e) => setPublishData({ ...publishData, hashtags: e.target.value })}
                  placeholder="#adstudioai #marketing #automação"
                  className="w-full px-4 py-2 bg-dark border border-dark-50 text-white rounded-lg focus:ring-2 focus:ring-brand-500 focus:outline-none placeholder-dark-300"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setCurrentStep('result')}
                  className="flex-1 px-6 py-2 border border-dark-50 text-dark-400 font-semibold rounded-lg transition-colors hover:border-dark-200 hover:text-white"
                >
                  Voltar
                </button>
                <button
                  onClick={() => alert('Agendar para depois (feature em breve)')}
                  className="flex-1 px-6 py-2 border border-brand-600 text-brand-400 font-semibold rounded-lg transition-colors hover:bg-brand-600/10 flex items-center justify-center gap-2"
                >
                  <span>📅</span>
                  Agendar
                </button>
                <button
                  onClick={handlePublish}
                  disabled={loading}
                  className="flex-1 px-6 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>📤</span>
                  Publicar Agora
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
