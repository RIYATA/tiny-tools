import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampPercent,
  demoQuota,
  formatCountdown,
  formatResetAt,
  formatUpdatedAt,
  quotaMood,
  sourceLabel,
} from './lib/quota.js'

const STAR_FIELD = Array.from({ length: 42 }, (_, index) => ({
  id: index,
  x: (index * 37 + 11) % 101,
  y: (index * 61 + 19) % 97,
  size: 1 + ((index * 7) % 4),
  delay: (index % 9) * -0.71,
  opacity: 0.17 + ((index * 13) % 54) / 100,
}))

const ORBIT_MARKS = Array.from({ length: 24 }, (_, index) => index)
const DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1'
const COMPACT_MODE = new URLSearchParams(window.location.search).get('compact') === '1'

function MeterIcon({ kind }) {
  if (kind === 'primary') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v8l4.4 2.5M3.2 10a6.8 6.8 0 1 0 13.6 0 6.8 6.8 0 0 0-13.6 0Z" /></svg>
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4.2h12v11.6H4zM4 8h12M8 4v4m4-4v4M7 12h2m2 0h2" /></svg>
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h12m-4-4 4 4-4 4" /></svg>
}

function SparkIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 1 1.6 6.4L18 10l-6.4 1.6L10 18l-1.6-6.4L2 10l6.4-2.6L10 1Z" /></svg>
}

function OrbitMeter({ quota, kind, now, active, onSelect }) {
  const available = Boolean(quota)
  const remaining = available ? clampPercent(quota.remainingPercent) : 0
  const countdown = available ? formatCountdown(quota.resetsAt, now) : '—'
  const resetAt = available ? formatResetAt(quota.resetsAt) : '暂不可用'
  const title = kind === 'primary' ? '近程气压' : '长程蓄水'
  const unit = kind === 'primary' ? '5 小时' : '每周'

  return (
    <button
      type="button"
      className={`orbit-meter orbit-meter--${kind}${active ? ' is-active' : ''}${available ? '' : ' is-offline'}`}
      onClick={() => onSelect(kind)}
      aria-pressed={active}
      style={{ '--amount': `${remaining * 3.6}deg` }}
    >
      <span className="orbit-meter__glow" />
      <span className="orbit-meter__ring ring-base" />
      <span className="orbit-meter__ring ring-progress" />
      <span className="orbit-meter__inside">
        <span className="orbit-meter__topline"><MeterIcon kind={kind} /> {title}</span>
        <strong>{available ? `${remaining}` : '—'}<i>%</i></strong>
        <span className="orbit-meter__unit">{unit} 剩余</span>
      </span>
      <span className="orbit-meter__detail">
        <span><i>下一次潮汐</i><b>{countdown}</b></span>
        <span><i>具体时间</i><b>{resetAt}</b></span>
      </span>
    </button>
  )
}

function StarField({ quiet }) {
  return (
    <div className={`star-field${quiet ? ' is-quiet' : ''}`} aria-hidden="true">
      {STAR_FIELD.map((star) => (
        <span
          key={star.id}
          className="star-field__star"
          style={{
            '--x': `${star.x}%`,
            '--y': `${star.y}%`,
            '--size': `${star.size}px`,
            '--delay': `${star.delay}s`,
            '--opacity': star.opacity,
          }}
        />
      ))}
      <span className="star-field__horizon" />
      <span className="star-field__mist mist-one" />
      <span className="star-field__mist mist-two" />
    </div>
  )
}

function RhythmRibbon({ primary, secondary, selected }) {
  const primaryAmount = clampPercent(primary?.remainingPercent)
  const secondaryAmount = clampPercent(secondary?.remainingPercent)
  const bars = useMemo(() => Array.from({ length: 18 }, (_, index) => {
    const source = index < 8 ? primaryAmount : secondaryAmount
    const offset = ((index * 19) % 23) - 11
    return Math.max(16, Math.min(96, source + offset))
  }), [primaryAmount, secondaryAmount])

  return (
    <div className={`rhythm-ribbon rhythm-ribbon--${selected}`} aria-label="额度节奏图">
      <div className="rhythm-ribbon__caption"><span>FLOW OF ATTENTION</span><em>实时余量，不代表消耗历史</em></div>
      <div className="rhythm-ribbon__bars">
        {bars.map((height, index) => <i key={index} style={{ '--height': `${height}%`, '--index': index }} />)}
      </div>
      <div className="rhythm-ribbon__legend"><span>近程窗口</span><span>长程窗口</span></div>
    </div>
  )
}

function CompactCompanion({ quota, status, message, mood, now, onRefresh }) {
  const primary = quota?.primary ?? null
  const secondary = quota?.secondary ?? null
  const primaryRemaining = primary ? clampPercent(primary.remainingPercent) : null
  const secondaryRemaining = secondary ? clampPercent(secondary.remainingPercent) : null

  return (
    <main className={`compact-tide mood-${mood.name}`} aria-live="polite">
      <div className="compact-tide__sheen" aria-hidden="true" />
      <header className="compact-tide__header">
        <span className="compact-tide__mark"><SparkIcon /></span>
        <div><b>QUOTA TIDE</b><small>{status === 'offline' ? 'WAITING FOR CODEX' : 'ATTACHED COMPANION'}</small></div>
        <span className={`compact-tide__live${status === 'offline' ? ' is-offline' : ''}`} />
      </header>
      <section className="compact-tide__meters">
        <div className="compact-tide__metric">
          <p>5H</p>
          <strong>{primaryRemaining === null ? '—' : `${primaryRemaining}%`}</strong>
          <span>{primary ? formatCountdown(primary.resetsAt, now) : '等待信号'}</span>
        </div>
        <div className="compact-tide__split" />
        <div className="compact-tide__metric">
          <p>WEEK</p>
          <strong>{secondaryRemaining === null ? '—' : `${secondaryRemaining}%`}</strong>
          <span>{secondary ? formatCountdown(secondary.resetsAt, now) : '等待信号'}</span>
        </div>
        <div className="compact-tide__split" />
        <div className="compact-tide__credits">
          <p>RESET</p>
          <strong>{quota?.resetCredits ?? '—'}</strong>
        </div>
      </section>
      <footer className="compact-tide__footer">
        <span>{message || (quota ? mood.sentence : '打开 Codex 并完成一次请求。')}</span>
        <button type="button" onClick={() => onRefresh(true)} disabled={status === 'refreshing'} aria-label="刷新额度">
          <ArrowIcon />
        </button>
      </footer>
    </main>
  )
}

export default function App() {
  const [quota, setQuota] = useState(DEMO_MODE ? demoQuota : null)
  const [status, setStatus] = useState(DEMO_MODE ? 'ready' : 'loading')
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState('primary')
  const [quiet, setQuiet] = useState(() => window.localStorage.getItem('quota-tide-quiet') === '1')
  const [showAbout, setShowAbout] = useState(false)
  const pageRef = useRef(null)

  const refresh = useCallback(async (force = true) => {
    if (DEMO_MODE) {
      setQuota({ ...demoQuota, observedAt: new Date().toISOString() })
      setStatus('ready')
      return
    }
    setStatus('refreshing')
    try {
      const response = await fetch(`/api/quota${force ? '?force=1' : ''}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!payload.available) throw new Error(payload.message || '暂时没有收到 Codex 的额度信号。')
      setQuota(payload)
      setMessage(payload.warning || '')
      setStatus('ready')
    } catch (error) {
      setQuota(null)
      setMessage(error instanceof Error ? error.message : '暂时无法读取额度。')
      setStatus('offline')
    }
  }, [])

  useEffect(() => {
    if (!DEMO_MODE) refresh(false)
    const clock = window.setInterval(() => setNow(Date.now()), 1_000)
    const poll = window.setInterval(() => !DEMO_MODE && refresh(false), 45_000)
    return () => {
      window.clearInterval(clock)
      window.clearInterval(poll)
    }
  }, [refresh])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        refresh(true)
      }
      if (event.code === 'Space') {
        event.preventDefault()
        setQuiet((value) => !value)
      }
      if (event.key === 'Escape') setShowAbout(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [refresh])

  useEffect(() => {
    window.localStorage.setItem('quota-tide-quiet', quiet ? '1' : '0')
  }, [quiet])

  const primary = quota?.primary ?? null
  const secondary = quota?.secondary ?? null
  const mood = quotaMood(primary?.remainingPercent ?? 0)
  const activeQuota = selected === 'primary' ? primary : secondary
  const activeRemaining = activeQuota ? clampPercent(activeQuota.remainingPercent) : null
  const activeCountdown = activeQuota ? formatCountdown(activeQuota.resetsAt, now) : '等待信号'
  const freshness = quota?.freshness

  const handlePointerMove = (event) => {
    const element = pageRef.current
    if (!element || quiet) return
    const rect = element.getBoundingClientRect()
    element.style.setProperty('--pointer-x', `${((event.clientX - rect.left) / rect.width) * 100}%`)
    element.style.setProperty('--pointer-y', `${((event.clientY - rect.top) / rect.height) * 100}%`)
  }

  if (COMPACT_MODE) {
    return <CompactCompanion quota={quota} status={status} message={message} mood={mood} now={now} onRefresh={refresh} />
  }

  return (
    <div ref={pageRef} className={`quota-tide mood-${mood.name}${quiet ? ' is-quiet' : ''}`} onPointerMove={handlePointerMove}>
      <StarField quiet={quiet} />
      <div className="noise" aria-hidden="true" />

      <header className="topbar">
        <a className="mark" href="#observatory" aria-label="回到 Quota Tide 主面板">
          <span className="mark__glyph"><SparkIcon /></span>
          <span><b>QUOTA TIDE</b><small>CODEX LOCAL COMPANION</small></span>
        </a>
        <div className="topbar__status">
          <span className={`status-light status-light--${status === 'offline' ? 'offline' : mood.name}`} />
          <span>{status === 'refreshing' ? '正在校准' : sourceLabel(quota?.source, freshness)}</span>
          <i>·</i>
          <span>{quota ? formatUpdatedAt(quota.observedAt, now) : '等候本机服务'}</span>
        </div>
        <div className="topbar__actions">
          <button type="button" className="quiet-button" onClick={() => setQuiet((value) => !value)} aria-pressed={quiet}>
            {quiet ? '唤醒环境' : '安静模式'}
          </button>
          <button type="button" className="about-button" onClick={() => setShowAbout(true)}>本地读取</button>
        </div>
      </header>

      <main id="observatory" className="observatory">
        <section className="manifesto">
          <p className="eyebrow">01 / THE RITUAL OF FOCUS</p>
          <h1>让使用的<br /><em>节奏</em>，变得可见。</h1>
          <p className="manifesto__copy">这不是绩效看板。它只是提醒你：注意力是一种会涨潮、也需要退潮的天气。</p>
          <div className="mood-note">
            <span className="mood-note__line" />
            <div><b>{mood.label}</b><p>{quota ? mood.sentence : '服务还在远处。打开 Codex 并完成一次请求，潮汐会回来。'}</p></div>
          </div>
          <div className="keyboard-hints"><span><kbd>R</kbd> 刷新</span><span><kbd>Space</kbd> 静音环境</span></div>
        </section>

        <section className="instrument" aria-live="polite">
          <div className="instrument__halo halo-one" />
          <div className="instrument__halo halo-two" />
          <div className="instrument__constellation" aria-hidden="true">
            {ORBIT_MARKS.map((mark) => <i key={mark} style={{ '--mark': mark }} />)}
          </div>
          <div className="instrument__axis axis-horizontal" />
          <div className="instrument__axis axis-vertical" />
          <p className="instrument__number">{activeRemaining === null ? '—' : String(activeRemaining).padStart(2, '0')}</p>
          <div className="instrument__center">
            <span>{selected === 'primary' ? '近程余量' : '长程余量'}</span>
            <strong>{activeCountdown}</strong>
            <small>{selected === 'primary' ? '距离近程窗口重开' : '距离长程窗口重开'}</small>
          </div>
          <div className="instrument__north">USE WITH INTENTION</div>
          <div className="instrument__south">THE NEXT CLEAR THOUGHT</div>
          <button
            type="button"
            className={`refresh-orbit${status === 'refreshing' ? ' is-refreshing' : ''}`}
            onClick={() => refresh(true)}
            disabled={status === 'refreshing'}
            aria-label="立即刷新 Codex 额度"
          >
            <span><ArrowIcon /></span>
            <b>{status === 'refreshing' ? '校准中' : '刷新潮汐'}</b>
          </button>
        </section>

        <section className="metric-stack">
          <OrbitMeter quota={primary} kind="primary" now={now} active={selected === 'primary'} onSelect={setSelected} />
          <OrbitMeter quota={secondary} kind="secondary" now={now} active={selected === 'secondary'} onSelect={setSelected} />
          <div className="credits-card">
            <span className="credits-card__orbit" />
            <p>RESET CREDITS</p>
            <strong>{quota?.resetCredits ?? '—'}</strong>
            <span>{quota?.resetCredits === null || quota?.resetCredits === undefined ? '未返回重置次数' : '可用重置次数'}</span>
          </div>
        </section>
      </main>

      <section className="lower-deck">
        <RhythmRibbon primary={primary} secondary={secondary} selected={selected} />
        <div className="signal-readout">
          <span className="signal-readout__glyph">✦</span>
          <div>
            <p>LOCAL SIGNAL</p>
            <strong>{quota ? `${sourceLabel(quota.source, freshness)} · 只读` : '未连接到额度服务'}</strong>
            <small>{message || (quota ? '不会读取、保存或上传你的账号密码、令牌或对话内容。' : '请确认 Codex 可在终端运行，并已经登录。')}</small>
          </div>
        </div>
      </section>

      <footer className="footer"><span>BUILT FOR MAC · LOCALHOST ONLY</span><span>额度不是倒计时，是给思考留下的边界。</span></footer>

      {showAbout && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowAbout(false)}>
          <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="about-modal__close" onClick={() => setShowAbout(false)} aria-label="关闭说明">×</button>
            <p className="eyebrow">READ-ONLY BY DESIGN</p>
            <h2 id="about-title">它只看潮水，<br />不碰你的航海日志。</h2>
            <ul>
              <li>通过本机 Codex 服务读取 5 小时、每周额度与重置次数。</li>
              <li>网页只运行在 <code>127.0.0.1</code>，不上传任何账号、对话或令牌。</li>
              <li>服务暂不可用时，界面会明确说明，不用演示数据冒充真实状态。</li>
            </ul>
            <button type="button" className="modal-confirm" onClick={() => setShowAbout(false)}>知道了 <ArrowIcon /></button>
          </section>
        </div>
      )}
    </div>
  )
}
