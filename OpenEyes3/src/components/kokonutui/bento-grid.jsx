/* Based on Bento Grid by @dorianbaffier - https://kokonutui.com (MIT) */

import { ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const bentoItems = [
  {
    id: 'surfaces',
    title: 'One target, every surface',
    description:
      'Type the domain once. Every module that takes one picks it up, and the forensic trail comes back in a single shape you can export.',
    href: '#register',
    feature: 'spotlight',
    spotlightItems: [
      'Social: Discord, Snapchat, TikTok, handles',
      'Network: IP, WiFi, ASN, domains, ports',
      'Finance: wallets, BINs, IBANs',
      'Email: validation, breaches, spoofability',
      'Archives: captures, stack, pastes',
    ],
  },
  {
    id: 'providers',
    title: 'Bring your own source',
    description: 'No index sits behind this. A module is an empty slot. Filling one looks like this.',
    href: '#answers',
    feature: 'typing',
    typingText:
      "registerProvider('ip-lookup', async ({ values, settings }) => {\n  const res = await fetch(\n    `https://api.example.com/ip/${values.ip}`,\n    { headers: { Authorization: settings.keys.example } }\n  )\n  const data = await res.json()\n\n  return {\n    blocks: {\n      network: { asn: data.asn, org: data.org },\n      geo: { country: data.country, city: data.city },\n    },\n  }\n})",
  },
  {
    id: 'kept',
    title: 'What we keep on you',
    description:
      'A Discord id, what you bought and when it runs out. No card details, because nothing in the payment path touches a card.',
    href: '#answers',
    feature: 'metrics',
    metrics: [
      { label: 'Card details', value: '0' },
      { label: 'Stored queries', value: '0' },
      { label: 'Fields at signup', value: '0' },
    ],
  },
  {
    id: 'order',
    title: 'Build order',
    description: 'What is finished and what is next. The waitlist decides the order of the rest.',
    href: '#entry',
    feature: 'timeline',
    timeline: [
      { year: 'Done', event: 'Panel, module registry, result renderer' },
      { year: 'Done', event: 'Provider layer and JSON / CSV export' },
      { year: 'Done', event: 'Discord sign in, on-chain billing, role gate' },
      { year: 'Next', event: 'Saved cases and scheduled re-runs' },
    ],
  },
]

const fadeInUp = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
}

const SpotlightFeature = ({ items }) => (
  <ul className="mt-3 space-y-2">
    {items.map((item, index) => (
      <motion.li
        animate={{ opacity: 1, x: 0 }}
        className="flex items-start gap-2.5"
        initial={{ opacity: 0, x: -8 }}
        key={item}
        transition={{ delay: 0.08 * index }}
      >
        <CheckCircle2 className="mt-[3px] h-3.5 w-3.5 flex-shrink-0 text-[var(--text-dim)]" />
        <span className="text-[13px] leading-snug text-[var(--text-muted)]">{item}</span>
      </motion.li>
    ))}
  </ul>
)

const MetricsFeature = ({ metrics }) => (
  <div className="mt-4 grid grid-cols-3 gap-4">
    {metrics.map((metric) => (
      <div className="border-t border-[var(--hairline)] pt-2.5" key={metric.label}>
        <div className="font-[var(--font-display)] text-2xl font-light tracking-tight text-[var(--text)]">
          {metric.value}
        </div>
        <div className="mt-1 font-[var(--font-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {metric.label}
        </div>
      </div>
    ))}
  </div>
)

const TimelineFeature = ({ timeline }) => (
  <div className="mt-3 space-y-0">
    {timeline.map((entry, index) => (
      <motion.div
        animate={{ opacity: 1, x: 0 }}
        className="flex items-baseline gap-4 border-b border-[var(--hairline)] py-2.5 last:border-b-0"
        initial={{ opacity: 0, x: -8 }}
        key={entry.event}
        transition={{ delay: 0.08 * index }}
      >
        <span className="w-10 flex-none font-[var(--font-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {entry.year}
        </span>
        <span className="text-[12.5px] leading-snug text-[var(--text-muted)]">{entry.event}</span>
      </motion.div>
    ))}
  </div>
)

const TypingFeature = ({ text }) => {
  const [shown, setShown] = useState('')
  const [started, setStarted] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStarted(true)
      },
      { threshold: 0.25 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text)
      return
    }
    let i = 0
    const timer = setInterval(() => {
      i += 2
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, 18)
    return () => clearInterval(timer)
  }, [started, text])

  return (
    <div
      className="mt-3 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
      ref={ref}
    >
      <pre className="whitespace-pre-wrap break-words font-[var(--font-mono)] text-[10.5px] leading-[1.7] text-[var(--text-muted)]">
        {shown}
        <span className="ml-px inline-block h-[1.1em] w-[5px] translate-y-[2px] bg-[var(--text-dim)] align-middle" />
      </pre>
    </div>
  )
}

function BentoCard({ item, className }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-100, 100], [1.5, -1.5])
  const rotateY = useTransform(x, [-100, 100], [-1.5, 1.5])

  function handleMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    x.set((event.clientX - rect.left) / rect.width - 0.5)
    y.set((event.clientY - rect.top) / rect.height - 0.5)
    x.set(((event.clientX - rect.left) / rect.width - 0.5) * 100)
    y.set(((event.clientY - rect.top) / rect.height - 0.5) * 100)
  }

  function handleMouseLeave() {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      className={cn('h-full', className)}
      onHoverEnd={handleMouseLeave}
      onMouseMove={handleMouseMove}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      variants={fadeInUp}
      whileHover={{ y: -4 }}
    >
      <a
        aria-label={`${item.title}. ${item.description}`}
        className="group relative flex h-full flex-col gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] p-5 transition-colors duration-300 hover:border-[var(--border-strong)]"
        href={item.href}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-[var(--font-display)] text-[19px] font-normal leading-tight tracking-[-0.02em] text-[var(--text)]">
            {item.title}
          </h3>
          <ArrowUpRight className="mt-1 h-4 w-4 flex-none text-[var(--text-faint)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </div>

        <p className="max-w-[46ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{item.description}</p>

        {item.feature === 'spotlight' && <SpotlightFeature items={item.spotlightItems} />}
        {item.feature === 'metrics' && <MetricsFeature metrics={item.metrics} />}
        {item.feature === 'timeline' && <TimelineFeature timeline={item.timeline} />}
        {item.feature === 'typing' && <TypingFeature text={item.typingText} />}
      </a>
    </motion.div>
  )
}

export default function BentoGrid() {
  return (
    <motion.div
      className="grid gap-4 md:grid-cols-3"
      initial="hidden"
      variants={staggerContainer}
      viewport={{ once: true, amount: 0.15 }}
      whileInView="visible"
    >
      <BentoCard className="md:col-span-1" item={bentoItems[0]} />
      <BentoCard className="md:col-span-2" item={bentoItems[1]} />
      <BentoCard className="md:col-span-2" item={bentoItems[2]} />
      <BentoCard className="md:col-span-1" item={bentoItems[3]} />
    </motion.div>
  )
}
