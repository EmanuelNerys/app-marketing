import { useNavigate } from 'react-router-dom'
import { motion, type Variants } from 'motion/react'
import {
  Camera, MessageSquare, Megaphone, Clock,
  Building2, Users, Check, ArrowRight, Sparkles, Flame,
} from 'lucide-react'

/** Destaque sólido (sem gradiente) com uma barra "marca-texto" atrás — no
 * tom indigo que o resto do app já usa (ConexaoMeta, Sidebar, Dashboard). */
function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="absolute inset-x-0 bottom-0.5 h-[0.32em] bg-indigo-500/25 rounded-sm -z-10" />
      {children}
    </span>
  )
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-70px' }}
      variants={stagger}
    >
      {children}
    </motion.div>
  )
}

export default function Landing() {
  const navigate = useNavigate()

  const integrations = [
    {
      icon: Camera, accent: '#e1306c', name: 'Instagram',
      desc: 'Publique e agende posts, Reels e Stories. Responda o Direct pelo painel e crie funis de comentário → DM automáticos.',
      points: ['Publicar & agendar', 'Direct unificado', 'Automação comentário→DM', 'Métricas e insights'],
    },
    {
      icon: MessageSquare, accent: '#25D366', name: 'WhatsApp Business',
      desc: 'Atendimento com filas (bot, espera, humano), envio de mídia, templates aprovados e disparo em massa — tudo na janela oficial da Meta.',
      points: ['Inbox com 3 filas', 'Templates + custo', 'Disparo em massa', 'Bot por palavra-chave'],
    },
    {
      icon: Megaphone, accent: '#818cf8', name: 'Meta Ads',
      desc: 'Crie campanhas, conjuntos e anúncios (imagem, vídeo, carrossel ou impulsionar um post). Veja resultados, CPA, ROAS e leads por anúncio.',
      points: ['Campanhas completas', 'Segmentação + interesses', 'Resultados, CPA e ROAS', 'Atribuição de leads'],
    },
  ]

  const features = [
    { n: '01', title: 'IA treinada no SEU negócio (RAG)', text: 'Suba seus PDFs (catálogo, FAQ, políticas) e a IA responde no WhatsApp com as informações reais da sua empresa — inclusive áudios, que ela transcreve. Se ficar indisponível, a conversa cai na fila humana na hora.' },
    { n: '02', title: 'Disparo & Follow-ups', text: 'Importe leads por CSV, dispare templates para listas segmentadas e recupere quem não respondeu com follow-ups automáticos (3 a 14 dias).' },
    { n: '03', title: 'Cronograma de conteúdo', text: 'Agende posts do Instagram com data e hora e acompanhe o que está publicado, agendado ou falhou — num calendário só.' },
    { n: '04', title: 'Leads unificados', text: 'A mesma pessoa no Instagram e no WhatsApp vira um lead só. Histórico dos dois canais junto, atribuído ao anúncio de origem.' },
  ]

  const metaVsUs = [
    { need: 'Postar, responder DM, rodar anúncio', meta: true, us: true },
    { need: 'IA que responde com o conhecimento do SEU negócio', meta: false, us: true },
    { need: 'Mesma pessoa do Insta + WhatsApp num lead só', meta: false, us: true },
    { need: 'Custo por LEAD real de cada anúncio (não por clique)', meta: false, us: true },
    { need: 'Disparo em massa + follow-up de quem não respondeu', meta: false, us: true },
    { need: 'Vários clientes num painel só, com automações prontas', meta: false, us: true },
  ]

  const agencyPerks = [
    'Contas-filhas: gerencie cada empresa-cliente num tenant isolado',
    'Troque de cliente pelo seletor, sem relogar',
    'Acesso compartilhado com o dono da empresa (login próprio)',
    'Controle de acesso por membro da equipe',
    'Ofereça as automações prontas para cada cliente',
    'Conecte Instagram, WhatsApp e Ads dentro da conta do cliente',
  ]

  const inboxPreview = [
    { name: 'Marina Souza', snippet: 'Quero saber o valor do plano anual', score: 92, channel: 'ig' as const },
    { name: 'Rafael Lima', snippet: 'Vocês entregam em BH?', score: 74, channel: 'wa' as const },
    { name: 'Ana Paula', snippet: 'Perfeito, vou fechar hoje!', score: 98, channel: 'wa' as const },
  ]
  const channelDot: Record<string, string> = { ig: '#e1306c', wa: '#25D366' }

  return (
    <div className="min-h-screen bg-[#07070c] text-[#f4f2fb] antialiased selection:bg-indigo-500/30">
      {/* glow ambiente — um único tom (indigo/violeta), nada de arco-íris */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-[10%] w-[820px] h-[480px] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="absolute top-40 right-[-8%] w-[500px] h-[420px] rounded-full bg-violet-500/[0.06] blur-[120px]" />
      </div>

      {/* nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-md bg-[#07070c]/85 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 grid place-items-center text-white font-black">A</span>
            <span className="font-semibold tracking-tight text-[#e2e2e8]">adStudioAI</span>
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/login')} className="px-4 py-2 text-sm text-[#8a8a9e] hover:text-white transition-colors">
              Entrar
            </button>
            <button onClick={() => navigate('/login')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">
              Criar conta
            </button>
          </div>
        </div>
      </nav>

      {/* hero — assimétrico: texto + mockup real do produto (não só texto centralizado) */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="aurora-blob aurora-a absolute -top-32 left-[4%] w-[520px] h-[420px] bg-indigo-600/20" />
          <div className="aurora-blob aurora-b absolute -top-16 right-[2%] w-[480px] h-[400px] bg-violet-500/10" />
          <div className="hero-grid absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#07070c]" />
        </div>

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center px-6 pt-20 pb-24">
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs text-[#8a8a9e] mb-7">
              <Sparkles size={13} className="text-indigo-400" />
              Instagram · WhatsApp · Meta Ads em um só painel
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl md:text-[3.4rem] font-extrabold leading-[1.08] tracking-tight text-balance mb-6">
              Todo o seu marketing digital <Highlight>num sistema só</Highlight>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg text-[#8a8a9e] max-w-xl mb-10">
              Conecte suas redes, atenda e dispare mensagens, rode anúncios e deixe a IA qualificar seus leads —
              para autônomos e para agências que gerenciam vários clientes.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-3">
              <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/login')}
                className="group px-6 py-3 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-2">
                Criar conta grátis
                <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" />
              </motion.button>
              <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/login')}
                className="px-6 py-3 rounded-xl font-semibold border border-white/[0.12] text-[#f4f2fb] hover:border-indigo-400/60 transition-colors">
                Já tenho conta
              </motion.button>
            </motion.div>
          </motion.div>

          {/* mockup do produto — inbox unificado com lead score, reflete a UI real do app */}
          <motion.div
            initial={{ opacity: 0, y: 26, rotate: -1.5 }}
            animate={{ opacity: 1, y: 0, rotate: -1.5 }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
            className="relative"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="rounded-2xl border border-white/[0.08] bg-[#0b0c12] shadow-2xl shadow-black/50 overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06] bg-[#111118]">
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="ml-3 text-[11px] text-[#5c5f70] font-mono">adsstudio.com.br/app/leads</span>
              </div>
              <div className="flex">
                <div className="flex flex-col items-center gap-3 px-3.5 py-4 border-r border-white/[0.06] bg-[#0d0e14]">
                  <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: '#e1306c1f', border: '1px solid #e1306c47' }}>
                    <Camera size={15} style={{ color: '#e1306c' }} />
                  </span>
                  <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: '#25D3661f', border: '1px solid #25D36647' }}>
                    <MessageSquare size={15} style={{ color: '#25D366' }} />
                  </span>
                  <span className="w-8 h-8 rounded-lg grid place-items-center bg-indigo-500/15 border border-indigo-500/30">
                    <Megaphone size={15} className="text-indigo-400" />
                  </span>
                </div>
                <div className="flex-1 p-3 space-y-1.5">
                  {inboxPreview.map((lead, i) => (
                    <motion.div
                      key={lead.name}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.12, duration: 0.4 }}
                      className={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${i === 0 ? 'bg-indigo-500/[0.08] border border-indigo-500/20' : ''}`}
                    >
                      <span className="relative w-8 h-8 shrink-0 rounded-full bg-[#1a1b24] grid place-items-center text-xs font-bold text-[#c9c9d6]">
                        {lead.name.split(' ').map((p) => p[0]).join('')}
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0b0c12]" style={{ background: channelDot[lead.channel] }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[#e2e2e8] truncate">{lead.name}</p>
                        <p className="text-[11px] text-[#6b6b7d] truncate">{lead.snippet}</p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5 shrink-0">{lead.score}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.9, type: 'spring', stiffness: 200, damping: 16 }}
              className="absolute -bottom-4 -left-5 flex items-center gap-1.5 bg-[#111118] border border-white/[0.1] rounded-xl px-3 py-2 shadow-xl"
            >
              <Flame size={14} className="text-amber-400" />
              <span className="text-xs font-semibold text-[#e2e2e8]">Lead quente detectado</span>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* integrações */}
      <section className="relative max-w-6xl mx-auto px-6 py-20">
        <Reveal className="text-center mb-12">
          <motion.p variants={fadeUp} className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-3">Integrações</motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold tracking-tight text-balance">Cada canal, com tudo o que ele precisa</motion.h2>
        </Reveal>
        <Reveal className="grid md:grid-cols-3 gap-5">
          {integrations.map((it) => {
            const Icon = it.icon
            return (
              <motion.div key={it.name} variants={fadeUp}
                className="relative rounded-xl bg-[#111118] border border-white/[0.07] hover:border-white/[0.14] transition-colors p-6 overflow-hidden">
                <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: it.accent }} />
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-9 h-9 shrink-0 rounded-lg grid place-items-center"
                    style={{ background: `${it.accent}1f`, border: `1px solid ${it.accent}47` }}>
                    <Icon size={17} style={{ color: it.accent }} />
                  </span>
                  <h3 className="text-base font-bold">{it.name}</h3>
                </div>
                <p className="text-sm text-[#8a8a9e] leading-relaxed mb-4">{it.desc}</p>
                <ul className="space-y-2">
                  {it.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-sm text-[#c9c9d6]">
                      <Check size={14} style={{ color: it.accent }} className="shrink-0" /> {p}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )
          })}
        </Reveal>
      </section>

      {/* features — lista editorial numerada, sem badge-gradiente */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        <Reveal className="grid md:grid-cols-2 gap-x-10 gap-y-9">
          {features.map((f) => (
            <motion.div key={f.title} variants={fadeUp} className="flex gap-5 border-t border-white/[0.07] pt-5">
              <span className="text-2xl font-black text-indigo-500/40 tabular-nums shrink-0 w-9">{f.n}</span>
              <div>
                <h3 className="font-bold mb-1.5 text-[#e2e2e8]">{f.title}</h3>
                <p className="text-sm text-[#8a8a9e] leading-relaxed">{f.text}</p>
              </div>
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* por que não só a Meta grátis? */}
      <section className="relative max-w-4xl mx-auto px-6 py-16">
        <Reveal className="text-center mb-10">
          <motion.p variants={fadeUp} className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-3">A pergunta certa</motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold tracking-tight text-balance">
            "Por que não usar só as ferramentas <Highlight>grátis da Meta</Highlight>?"
          </motion.h2>
          <motion.p variants={fadeUp} className="text-[#8a8a9e] mt-4 max-w-2xl mx-auto">
            Publicar e anunciar, a Meta já faz. O que ela não faz é a <b className="text-[#c9c9d6]">operação</b> que
            transforma seguidor em cliente — é essa camada que entregamos.
          </motion.p>
        </Reveal>
        <Reveal>
          <motion.div variants={fadeUp} className="rounded-xl border border-white/[0.08] bg-[#111118] overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] text-sm">
              <div className="px-5 py-3 text-[#5c5f70] text-xs font-bold uppercase tracking-wider border-b border-white/[0.06]">O que você precisa</div>
              <div className="px-5 py-3 text-[#5c5f70] text-xs font-bold uppercase tracking-wider border-b border-white/[0.06] text-center">Meta grátis</div>
              <div className="px-5 py-3 text-xs font-bold uppercase tracking-wider border-b border-white/[0.06] text-center bg-indigo-500/[0.06] text-indigo-300">adStudioAI</div>
              {metaVsUs.map((row) => (
                <div key={row.need} className="contents">
                  <div className="px-5 py-3.5 text-[#c9c9d6] border-b border-white/[0.04]">{row.need}</div>
                  <div className="px-5 py-3.5 text-center border-b border-white/[0.04]">
                    {row.meta ? <Check size={16} className="inline text-[#4a4a5a]" /> : <span className="text-[#3a3a45]">—</span>}
                  </div>
                  <div className="px-5 py-3.5 text-center border-b border-white/[0.04] bg-indigo-500/[0.04]">
                    {row.us && <Check size={16} className="inline text-indigo-400" />}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </Reveal>
      </section>

      {/* agência */}
      <section className="relative max-w-6xl mx-auto px-6 py-16">
        <Reveal>
          <motion.div variants={fadeUp} className="rounded-2xl border border-white/[0.08] bg-[#0b0c12] p-8 md:p-12 overflow-hidden relative">
            <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-indigo-600/15 blur-[90px]" />
            <div className="relative grid md:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-3 flex items-center gap-2">
                  <Building2 size={14} /> Para agências
                </p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-balance mb-4">
                  Gerencie <Highlight>vários clientes</Highlight> lado a lado com o dono
                </h2>
                <p className="text-[#8a8a9e] leading-relaxed mb-6">
                  Cada empresa-cliente vira uma conta-filha isolada. Você opera tudo pela agência e o dono
                  acompanha com o login dele — e você ainda entrega as automações prontas para cada um.
                </p>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/login')}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">
                  Começar como agência
                </motion.button>
              </div>
              <ul className="grid gap-3">
                {agencyPerks.map((p) => (
                  <li key={p} className="flex items-start gap-3 text-sm text-[#c9c9d6]">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-indigo-500/15 border border-indigo-500/40 grid place-items-center mt-0.5">
                      <Check size={12} className="text-indigo-300" />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </Reveal>
      </section>

      {/* CTA final */}
      <section className="relative max-w-3xl mx-auto text-center px-6 py-20">
        <Reveal>
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 text-[#8a8a9e] text-sm mb-5">
            <Users size={15} className="text-indigo-400" /> Autônomos e agências
          </motion.div>
          <motion.h2 variants={fadeUp} className="text-3xl md:text-5xl font-extrabold tracking-tight text-balance mb-5">
            Pronto pra centralizar <Highlight>tudo</Highlight>?
          </motion.h2>
          <motion.p variants={fadeUp} className="text-[#8a8a9e] mb-9 max-w-xl mx-auto">
            Crie sua conta em minutos, conecte suas redes e comece a atender, publicar e anunciar do mesmo lugar.
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-3">
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/login')}
              className="px-7 py-3.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-2">
              Criar conta grátis <ArrowRight size={18} />
            </motion.button>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/login')}
              className="px-7 py-3.5 rounded-xl font-semibold border border-white/[0.12] hover:border-indigo-400/60 transition-colors">
              Entrar
            </motion.button>
          </motion.div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="border-t border-white/[0.06] mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#5c5f70]">
          <span className="font-semibold text-[#8a8a9e]">adStudioAI</span>
          <div className="flex items-center gap-5">
            <button onClick={() => navigate('/pricing')} className="hover:text-[#c9c9d6] transition-colors flex items-center gap-1.5">
              <Clock size={13} /> Planos
            </button>
            <button onClick={() => navigate('/privacy')} className="hover:text-[#c9c9d6] transition-colors">Privacidade</button>
            <button onClick={() => navigate('/login')} className="hover:text-[#c9c9d6] transition-colors">Entrar</button>
          </div>
        </div>
      </footer>
    </div>
  )
}
