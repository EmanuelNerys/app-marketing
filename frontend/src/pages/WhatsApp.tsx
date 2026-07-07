import { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, Clock, UserCheck, Send, Power, MessageSquare, Check, CheckCheck } from 'lucide-react'
import api from '../services/api'

interface Conversation {
  id: string
  customer_id: string | null
  atendente_id: string | null
  atendimento_status: string
  status: string
  unread_count: number
  bot_active: boolean
  customer_name: string | null
  last_updated: string
}

interface Message {
  id: number
  conversation_id: string
  sender: string
  text: string | null
  direction: string
  status: string
  created_at: string
}

type Queue = 'bot' | 'espera' | 'minhas'

const QUEUES: { id: Queue; label: string; icon: typeof Bot; color: string }[] = [
  { id: 'bot', label: 'Bot', icon: Bot, color: 'text-emerald-400' },
  { id: 'espera', label: 'Espera', icon: Clock, color: 'text-amber-400' },
  { id: 'minhas', label: 'Minhas', icon: UserCheck, color: 'text-indigo-400' },
]

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function MsgStatus({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck size={13} className="text-sky-400" />
  if (status === 'delivered') return <CheckCheck size={13} className="text-white/40" />
  if (status === 'failed') return <span className="text-red-400 text-[10px]">falhou</span>
  return <Check size={13} className="text-white/40" />
}

export default function WhatsApp() {
  const myId = localStorage.getItem('user_id') || ''

  const [convs, setConvs] = useState<Conversation[]>([])
  const [queue, setQueue] = useState<Queue>('espera')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const threadRef = useRef<HTMLDivElement>(null)
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const selected = convs.find((c) => c.id === selectedId) || null

  function queueOf(c: Conversation): Queue {
    if (c.atendente_id && c.atendente_id === myId) return 'minhas'
    if (c.bot_active) return 'bot'
    return 'espera'
  }

  const counts: Record<Queue, number> = { bot: 0, espera: 0, minhas: 0 }
  convs.forEach((c) => { counts[queueOf(c)]++ })
  const visible = convs.filter((c) => queueOf(c) === queue)

  const loadConvs = useCallback(async () => {
    try {
      const { data } = await api.get('/conversations', { params: { status: 'active', limit: 200 } })
      setConvs(data)
    } catch { /* ignore */ }
  }, [])

  const loadMessages = useCallback(async (id: string) => {
    setLoadingMsgs(true)
    try {
      const { data } = await api.get(`/conversations/${id}/messages`, { params: { limit: 200 } })
      setMessages(data)
    } catch {
      setMessages([])
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => { loadConvs() }, [loadConvs])

  useEffect(() => {
    if (selectedId) loadMessages(selectedId)
    else setMessages([])
  }, [selectedId, loadMessages])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages])

  // Real-time updates via WebSocket
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${token}`)

    ws.onmessage = (ev) => {
      try {
        const { event, data } = JSON.parse(ev.data)
        if (event === 'new_message') {
          if (data.conversation_id === selectedIdRef.current) {
            setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))
          }
          loadConvs()
        } else if (event === 'conversation_updated' || event === 'conversation_created') {
          loadConvs()
        }
      } catch { /* ignore */ }
    }

    const ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping') }, 25000)
    return () => { clearInterval(ping); ws.close() }
  }, [loadConvs])

  async function sendReply() {
    const t = text.trim()
    if (!t || !selected || sending) return
    setSending(true)
    setText('')
    try {
      const { data } = await api.post(`/conversations/${selected.id}/messages`, {
        text: t,
        direction: 'outbound',
      })
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]))
      loadConvs()
    } catch {
      setText(t)
      alert('Erro ao enviar mensagem.')
    } finally {
      setSending(false)
    }
  }

  async function toggleBot() {
    if (!selected) return
    try {
      await api.patch(`/conversations/${selected.id}`, { bot_active: !selected.bot_active })
      loadConvs()
    } catch { /* ignore */ }
  }

  async function assumir() {
    if (!selected) return
    try {
      await api.patch(`/conversations/${selected.id}`, {
        atendente_id: myId,
        atendimento_status: 'em_atendimento',
        bot_active: false,
      })
      loadConvs()
    } catch { /* ignore */ }
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-4rem)]">
      {/* ---------- Coluna esquerda: filas + lista ---------- */}
      <div className="w-80 shrink-0 flex flex-col bg-[#0d0d13] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
          <h1 className="text-sm font-semibold text-[#e2e2e8] flex items-center gap-2">
            <MessageSquare size={16} className="text-emerald-400" />
            WhatsApp
          </h1>
        </div>

        {/* Filas */}
        <div className="flex gap-1 p-2 border-b border-white/[0.06]">
          {QUEUES.map((q) => {
            const Icon = q.icon
            const active = queue === q.id
            return (
              <button
                key={q.id}
                onClick={() => setQueue(q.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                  active ? 'bg-white/[0.06] text-[#e2e2e8]' : 'text-[#5a5a6e] hover:bg-white/[0.03]'
                }`}
              >
                <Icon size={15} className={active ? q.color : ''} />
                <span className="flex items-center gap-1">
                  {q.label}
                  <span className={`px-1 rounded ${active ? 'bg-white/10 text-[#c0c0d0]' : 'text-[#444]'}`}>
                    {counts[q.id]}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Lista de conversas */}
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-6 text-center text-[#4a4a5a] text-xs mt-8">
              Nenhuma conversa nesta fila.
            </div>
          ) : (
            visible.map((c) => {
              const isSel = c.id === selectedId
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 border-b border-white/[0.03] text-left transition-colors ${
                    isSel ? 'bg-indigo-600/10' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-bold text-[#8a8a9e] shrink-0">
                    {(c.customer_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#e2e2e8] truncate">
                      {c.customer_name || 'Sem nome'}
                    </p>
                    <p className="text-[11px] text-[#5a5a6e] truncate">{c.atendimento_status}</p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="bg-emerald-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shrink-0">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ---------- Coluna direita: thread ---------- */}
      <div className="flex-1 flex flex-col bg-[#0d0d13] border border-white/[0.06] rounded-xl overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-emerald-400/70" />
            </div>
            <p className="text-[#e2e2e8] font-medium mb-1">Selecione uma conversa</p>
            <p className="text-[#5a5a6e] text-sm max-w-xs">
              As conversas aparecem aqui quando um lead manda mensagem no WhatsApp.
            </p>
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
              <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-xs font-bold text-[#8a8a9e] shrink-0">
                {(selected.customer_name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e2e2e8] truncate">
                  {selected.customer_name || 'Sem nome'}
                </p>
                <p className="text-[11px] text-[#5a5a6e]">{selected.atendimento_status}</p>
              </div>

              {/* Assumir */}
              {selected.atendente_id !== myId && (
                <button
                  onClick={assumir}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                >
                  <UserCheck size={13} />
                  Assumir
                </button>
              )}

              {/* Toggle bot */}
              <button
                onClick={toggleBot}
                title={selected.bot_active ? 'Bot ligado — clique para desligar' : 'Bot desligado — clique para ligar'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  selected.bot_active
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-[#5a5a6e]'
                }`}
              >
                <Power size={13} />
                Bot {selected.bot_active ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Thread */}
            <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loadingMsgs ? (
                <p className="text-center text-[#4a4a5a] text-xs mt-8">Carregando…</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-[#4a4a5a] text-xs mt-8">Nenhuma mensagem ainda.</p>
              ) : (
                messages.map((m) => {
                  const out = m.direction === 'outbound'
                  return (
                    <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl px-3.5 py-2 ${
                          out
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-white/[0.06] text-[#e2e2e8] rounded-bl-sm'
                        }`}
                      >
                        <p className="text-[13px] whitespace-pre-wrap break-words">{m.text}</p>
                        <div className={`flex items-center gap-1 justify-end mt-0.5 ${out ? 'text-white/60' : 'text-[#5a5a6e]'}`}>
                          <span className="text-[10px]">{fmtTime(m.created_at)}</span>
                          {out && <MsgStatus status={m.status} />}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Caixa de resposta */}
            <div className="p-3 border-t border-white/[0.06]">
              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
                  }}
                  rows={1}
                  placeholder="Escreva uma mensagem…  (Enter envia, Shift+Enter quebra linha)"
                  className="flex-1 resize-none max-h-32 px-3.5 py-2.5 bg-[#0a0a0f] border border-white/[0.08] text-[#e2e2e8] text-[13px] rounded-xl outline-none focus:border-indigo-500/60 placeholder-[#3a3a4a]"
                />
                <button
                  onClick={sendReply}
                  disabled={!text.trim() || sending}
                  className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
