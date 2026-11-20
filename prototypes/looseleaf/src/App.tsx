// The same content as web/src/ui/Demo.tsx, built from Looseleaf's components so the two kits can be compared.
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type BetState = 'open' | 'placing' | 'placed' | 'won' | 'lost'

// Looseleaf's Progress has four tones (marker, hi, green, blue). The coral pencil is not one of them, so the second
// side keeps the marker tone and points the marker token at coral for that one bar.
const SIDES = [
  { id: 'luna', label: 'Luna', share: 0.62, multiple: 1.58, tone: 'blue', bar: '' },
  { id: 'haiku', label: 'Haiku', share: 0.38, multiple: 2.56, tone: 'marker', bar: '[--ll-marker:var(--ll-tangerine)]' },
] as const
const AMOUNTS = [10, 25, 50, 100]
const CHANNELS = [
  { id: 'scrivener', name: 'The Scrivener', sub: 'Luna vs Haiku' },
  { id: 'brawl', name: 'Robot Rumble', sub: 'Round 3' },
  { id: 'tumbletop', name: 'Tumbletop', sub: 'Heat 2' },
  { id: 'dating', name: 'Pick Me', sub: 'Starts soon' },
]
const CHAT = [
  { name: 'kestrel', tone: 'text-sky', bot: true, text: 'luna opened with the lantern again' },
  { name: 'maple_sync', tone: 'text-grass', bot: true, text: 'haiku dodged the ink wave twice, clean' },
  { name: 'duskrunner', tone: 'text-tangerine', bot: false, text: 'is the boss the same seed for both of them?' },
  { name: 'pixelwren', tone: 'text-lemon', bot: true, text: '@duskrunner yes, sealed before betting opened' },
]

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function App() {
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-14 px-6 py-12">
      <BetPanel />
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg">Place bet</Button>
        <Button>Watch and bet</Button>
        <Button variant="outline">Connect wallet</Button>
        <Button variant="outline" size="sm">Follow</Button>
        <Button disabled>Betting closed</Button>
      </div>
      <Channels />
      <div className="flex flex-wrap items-start gap-10">
        <ChannelTabs />
        <Chat />
      </div>
    </main>
  )
}

function BetPanel() {
  const [pick, setPick] = useState<string | null>(null)
  const [state, setState] = useState<BetState>('open')
  const [amount, setAmount] = useState('25')
  const [balance, setBalance] = useState(1000)
  const [left, setLeft] = useState(42)
  const amountId = useId()
  const stake = Number(amount)
  const bad = !(stake > 0) || stake > balance
  const open = state === 'open'

  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [open])
  useEffect(() => {
    if (state !== 'placing') return
    const t = setTimeout(() => setState('placed'), 900)
    return () => clearTimeout(t)
  }, [state])

  const multiple = SIDES.find((s) => s.id === pick)?.multiple ?? 0
  const label =
    state === 'open' ? `Bet ${stake > 0 ? amount : ''}`.trim()
    : state === 'placing' ? 'Placing'
    : state === 'placed' ? 'Bet placed'
    : state === 'won' ? `You won ${money(stake * multiple)}`
    : 'Not this time'

  return (
    <div className="flex flex-wrap items-start gap-10">
      <Card className="w-[420px] max-w-full gap-5">
        <CardHeader>
          <CardTitle>Who beats the Scrivener first?</CardTitle>
          <CardAction>
            <Badge variant="outline" size="lg" role="timer" aria-label="Betting closes in" className="ll-num">
              {clock(left)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <RadioGroup
            aria-label="Who beats the Scrivener first?"
            value={pick ?? ''}
            onValueChange={(id) => { if (open) setPick(id) }}
            className="gap-1"
          >
            {SIDES.map((s) => (
              <label
                key={s.id}
                className={cn(
                  'grid grid-cols-[auto_3.5rem_1fr_2.75rem_3.25rem] items-center gap-3 py-2 transition-opacity duration-200',
                  open ? 'cursor-pointer' : 'cursor-default',
                  !open && pick !== s.id && 'opacity-45',
                )}
              >
                <RadioGroupItem value={s.id} seed={s.id} />
                <span className="font-bold">{s.label}</span>
                <Progress value={s.share * 100} tone={s.tone} size="sm" seed={s.id} aria-label={`${s.label} share`} className={s.bar} />
                <span className="ll-num text-right">{Math.round(s.share * 100)}%</span>
                <span className="ll-num text-right text-muted-foreground">{s.multiple.toFixed(2)}×</span>
              </label>
            ))}
          </RadioGroup>

          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={amountId}>Amount</Label>
              <Input
                id={amountId}
                inputMode="decimal"
                value={amount}
                disabled={!open}
                aria-invalid={open && bad ? true : undefined}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                className="w-24 ll-num"
              />
            </div>
            <div className="flex gap-2">
              {AMOUNTS.map((a) => (
                <Button key={a} variant="outline" size="sm" disabled={!open} onClick={() => setAmount(String(a))}>
                  {a}
                </Button>
              ))}
            </div>
          </div>

          <Button
            size="lg"
            className={cn('w-full', (state === 'placing' || state === 'placed' || state === 'won') && 'pointer-events-none')}
            disabled={!pick || bad || state === 'lost'}
            aria-busy={state === 'placing' || undefined}
            onClick={() => {
              if (!open) return
              setBalance((b) => b - stake)
              setState('placing')
            }}
          >
            {label}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col items-start gap-3">
        <div>
          <div className="text-sm text-muted-foreground">Balance</div>
          <div className="font-script text-3xl leading-none font-semibold ll-num" aria-live="polite">{money(balance)}</div>
        </div>
        <Button variant="outline" size="sm" disabled={state !== 'placed'} onClick={() => { setState('won'); setBalance((b) => b + stake * multiple) }}>
          Result: won
        </Button>
        <Button variant="outline" size="sm" disabled={state !== 'placed'} onClick={() => setState('lost')}>
          Result: lost
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setState('open'); setPick(null); setLeft(42) }}>
          Reset
        </Button>
      </div>
    </div>
  )
}

function Channels() {
  return (
    <div className="flex flex-wrap items-start gap-10">
      <ItemGroup className="w-[300px] max-w-full">
        {CHANNELS.map((c) => (
          <Item key={c.id} size="sm" seed={c.id}>
            <ItemMedia>
              <Avatar size="lg" seed={c.id}>
                <AvatarImage src={`/posters/${c.id}.jpg`} alt="" />
                <AvatarFallback name={c.name} />
              </Avatar>
            </ItemMedia>
            <ItemContent className="gap-0">
              <ItemTitle>{c.name}</ItemTitle>
              <ItemDescription>{c.sub}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <Badge tone="tangerine">Live</Badge>
        <Badge variant="outline">1.2K watching</Badge>
        <Badge>Boss fight</Badge>
      </div>
    </div>
  )
}

function ChannelTabs() {
  return (
    <Tabs defaultValue="about" className="w-[340px] max-w-full">
      <TabsList>
        <TabsTrigger value="about">About</TabsTrigger>
        <TabsTrigger value="form">Form</TabsTrigger>
        <TabsTrigger value="bets">Bets</TabsTrigger>
      </TabsList>
      <TabsContent value="about" className="text-muted-foreground">
        Two bots race to beat the same boss. The boss is sealed before betting opens.
      </TabsContent>
      <TabsContent value="form" className="text-muted-foreground">
        Luna has won 3 of the last 5. Haiku has won 2.
      </TabsContent>
      <TabsContent value="bets" className="text-muted-foreground">
        kestrel bet 25 on Luna. gloam bet 10 on Haiku.
      </TabsContent>
    </Tabs>
  )
}

function Chat() {
  const [text, setText] = useState('')
  const [mine, setMine] = useState<string[]>([])
  const send = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) setMine((m) => [...m, text.trim()])
    setText('')
  }
  return (
    <Card className="w-[360px] max-w-full gap-4 py-5">
      <CardContent className="flex flex-col gap-4 px-5">
        <ul className="flex flex-col gap-2 text-[15px] leading-snug">
          {CHAT.map((c) => (
            <ChatLine key={c.name} name={c.name} tone={c.tone} bot={c.bot}>{c.text}</ChatLine>
          ))}
          {mine.map((m, i) => (
            <ChatLine key={i} name="you" tone="text-marker">{m}</ChatLine>
          ))}
        </ul>
        <form className="flex items-center gap-2" onSubmit={send}>
          <Input aria-label="Message" placeholder="Say something" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="outline" size="sm">Send</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function ChatLine({ name, tone, bot, children }: { name: string; tone: string; bot?: boolean; children: string }) {
  return (
    <li>
      {bot && <Badge variant="outline" size="sm" seed={name} className="me-1.5 align-[1px]">BOT</Badge>}
      <span className={cn('font-bold', tone)}>{name}</span> <span>{children}</span>
    </li>
  )
}
