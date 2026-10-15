/* Based on Currency Transfer by @dorianbaffier - https://kokonutui.com (MIT) */

import { ArrowUpDown, Check, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

const draw = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (i) => ({
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { delay: i * 0.2, type: 'spring', duration: 1.4, bounce: 0.2 },
      opacity: { delay: i * 0.2, duration: 0.3 },
    },
  }),
}

export function Checkmark({ size = 88, strokeWidth = 2, className = '' }) {
  return (
    <motion.svg animate="visible" className={className} height={size} initial="hidden" viewBox="0 0 100 100" width={size}>
      <title>Confirmed</title>
      <motion.circle
        custom={0}
        cx="50"
        cy="50"
        r="42"
        stroke="currentColor"
        style={{ strokeWidth, strokeLinecap: 'round', fill: 'transparent' }}
        variants={draw}
      />
      <motion.path
        custom={1}
        d="M32 50L45 63L68 35"
        stroke="currentColor"
        style={{ strokeWidth: strokeWidth + 0.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'transparent' }}
        variants={draw}
      />
    </motion.svg>
  )
}

function Dial({ state }) {
  return (
    <div className="relative flex h-[92px] w-[92px] items-center justify-center">
      {state === 'settled' && (
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="text-[var(--text)]"
          initial={{ opacity: 0, scale: 0.85 }}
          key="settled"
          transition={{ duration: 0.4 }}
        >
          <Checkmark />
        </motion.div>
      )}

      {state === 'blocked' && (
        <motion.div
          animate={{ opacity: 1 }}
          className="flex h-[92px] w-[92px] items-center justify-center rounded-full border border-[var(--border-strong)] text-[var(--text-dim)]"
          initial={{ opacity: 0 }}
          key="blocked"
          transition={{ duration: 0.35 }}
        >
          <TriangleAlert className="h-8 w-8" strokeWidth={1.4} />
        </motion.div>
      )}

      {state === 'pending' && (
        <motion.div
          animate={{ opacity: 1 }}
          className="relative flex h-[92px] w-[92px] items-center justify-center"
          initial={{ opacity: 0 }}
          key="pending"
          transition={{ duration: 0.35 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            className="absolute inset-0 rounded-full border border-transparent"
            style={{ borderLeftColor: 'var(--text)', borderTopColor: 'var(--border)' }}
            transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          />
          <div className="relative z-10 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[var(--text-muted)]">
            <ArrowUpDown className="h-7 w-7" strokeWidth={1.5} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

function Line({ label, value, mono = true }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] py-2.5 last:border-b-0">
      <span className="font-[var(--font-mono)] text-[9.5px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
        {label}
      </span>
      <span
        className={cn(
          'min-w-0 break-all text-right text-[12.5px] text-[var(--text)]',
          mono && 'font-[var(--font-mono)]',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export default function CurrencyTransfer({
  state = 'pending',
  title,
  caption,
  fiat,
  crypto,
  rate,
  lines = [],
  footer,
}) {
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-center py-2">
        <Dial state={state} />
      </div>

      <div className="mt-2 text-center">
        <motion.h3
          animate={{ opacity: 1, y: 0 }}
          className="font-[var(--font-display)] text-[20px] font-normal tracking-[-0.02em] text-[var(--text)]"
          initial={{ opacity: 0, y: 8 }}
          key={title}
          transition={{ duration: 0.35 }}
        >
          {title}
        </motion.h3>
        {caption && <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-relaxed text-[var(--text-muted)]">{caption}</p>}
      </div>

      {(fiat || crypto) && (
        <div className="mt-6 flex items-stretch gap-3">
          <div className="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] p-3">
            <div className="font-[var(--font-mono)] text-[9px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              You pay
            </div>
            <div className="mt-1.5 font-[var(--font-display)] text-[22px] font-light tracking-[-0.03em] text-[var(--text)]">
              {crypto ?? '—'}
            </div>
          </div>
          <div className="flex items-center text-[var(--text-faint)]">
            <ArrowUpDown className="h-4 w-4 rotate-90" />
          </div>
          <div className="flex-1 rounded-[var(--r-sm)] border border-[var(--border)] p-3">
            <div className="font-[var(--font-mono)] text-[9px] uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Billed as
            </div>
            <div className="mt-1.5 font-[var(--font-display)] text-[22px] font-light tracking-[-0.03em] text-[var(--text)]">
              {fiat ?? '—'}
            </div>
          </div>
        </div>
      )}

      {rate && (
        <p className="mt-3 text-center font-[var(--font-mono)] text-[9.5px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
          {rate}
        </p>
      )}

      {lines.length > 0 && (
        <div className="mt-5 border-t border-[var(--hairline)]">
          {lines.map((line) => (
            <Line key={line.label} label={line.label} mono={line.mono !== false} value={line.value} />
          ))}
        </div>
      )}

      {footer && <div className="mt-5">{footer}</div>}
    </div>
  )
}
