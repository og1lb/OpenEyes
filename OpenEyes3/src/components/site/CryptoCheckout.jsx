import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import CurrencyTransfer from '@/components/kokonutui/currency-transfer.jsx'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { ASSET_LABELS, ASSET_TICKERS, loginUrl, openInvoice, readInvoice } from '../../lib/session.js'
import { useAuth } from '../../state/auth.jsx'

const POLL_MS = 6000

function CopyRow({ value }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      className="flex w-full items-center gap-3 rounded-[var(--r-sm)] border border-[var(--border)] p-3 text-left transition-colors hover:border-[var(--border-strong)]"
      onClick={copy}
      type="button"
    >
      <span className="min-w-0 flex-1 break-all font-[var(--font-mono)] text-[11.5px] text-[var(--text)]">{value}</span>
      {copied ? (
        <Check className="h-4 w-4 flex-none text-[var(--text)]" />
      ) : (
        <Copy className="h-4 w-4 flex-none text-[var(--text-faint)]" />
      )}
    </button>
  )
}

function AssetPicker({ assets, value, onChange, disabled }) {
  return (
    <div className="mt-3 flex gap-2">
      {assets.map((asset) => (
        <button
          className={`flex-1 rounded-[var(--r-sm)] border px-3 py-2 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] transition-colors ${
            value === asset
              ? 'border-[var(--border-strong)] text-[var(--text)]'
              : 'border-[var(--border)] text-[var(--text-faint)] hover:border-[var(--border-strong)]'
          }`}
          disabled={disabled}
          key={asset}
          onClick={() => onChange(asset)}
          type="button"
        >
          {ASSET_LABELS[asset] ?? asset}
        </button>
      ))}
    </div>
  )
}

export default function CryptoCheckout({ plan, assets = ['btc', 'ltc'] }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [asset, setAsset] = useState(assets[0] ?? 'btc')
  const [phase, setPhase] = useState('idle')
  const [invoice, setInvoice] = useState(null)
  const [reason, setReason] = useState(null)
  const pollRef = useRef(null)

  const stop = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setPhase('creating')
    setReason(null)
    setInvoice(null)
    try {
      const res = await openInvoice(plan.id, asset)
      setInvoice(res.invoice)
      setPhase(res.invoice.status === 'settled' ? 'settled' : 'awaiting')
    } catch (err) {
      setReason(err.message)
      setPhase(err.code === 'unauthenticated' ? 'signedout' : 'failed')
    }
  }, [plan.id, asset])

  useEffect(() => {
    if (!open) {
      stop()
      setPhase('idle')
      return
    }
    start()
    return stop
  }, [open, start, stop])

  useEffect(() => {
    if (phase !== 'awaiting' || !invoice?.id) return
    pollRef.current = setInterval(async () => {
      try {
        const res = await readInvoice(invoice.id)
        setInvoice(res.invoice)
        if (res.invoice.status === 'settled') {
          setPhase('settled')
          stop()
          auth.reload()
        }
        if (res.invoice.status === 'expired') {
          setPhase('expired')
          stop()
        }
      } catch {}
    }, POLL_MS)
    return stop
  }, [phase, invoice?.id, stop, auth])

  const fiat = `$${(plan.usdCents / 100).toFixed(2)}`
  const ticker = ASSET_TICKERS[asset] ?? asset.toUpperCase()

  if (!auth.authenticated) {
    return (
      <a className="stamp-btn" href={loginUrl('/#terms')}>
        Sign in to pay
      </a>
    )
  }

  let view
  if (phase === 'creating' || phase === 'idle') {
    view = <CurrencyTransfer caption="Deriving a fresh address for this invoice." state="pending" title="One moment" />
  } else if (phase === 'signedout') {
    view = (
      <CurrencyTransfer
        caption="The session expired before the invoice was opened. Sign in again and nothing is lost."
        state="blocked"
        title="Signed out"
      />
    )
  } else if (phase === 'failed') {
    view = (
      <CurrencyTransfer
        caption="No invoice was opened, so nothing has been charged."
        lines={[{ label: 'Reason', value: reason || 'unknown' }]}
        state="blocked"
        title="Could not open an invoice"
      />
    )
  } else if (phase === 'expired') {
    view = (
      <CurrencyTransfer
        caption="The quoted rate ran out before a payment arrived. Close this and open a fresh invoice."
        state="blocked"
        title="Invoice expired"
      />
    )
  } else if (phase === 'settled' && invoice) {
    view = (
      <CurrencyTransfer
        caption="Confirmed on chain. The role is being assigned to your Discord account."
        crypto={`${invoice.amount} ${ASSET_TICKERS[invoice.asset] ?? invoice.asset.toUpperCase()}`}
        fiat={`$${invoice.amountUsd}`}
        lines={[
          { label: 'Invoice', value: invoice.id },
          { label: 'Settled', value: invoice.settledAt ? new Date(invoice.settledAt).toLocaleString() : 'just now' },
        ]}
        state="settled"
        title="Payment received"
      />
    )
  } else if (invoice) {
    view = (
      <>
        <CurrencyTransfer
          caption="Send at least the amount shown to the address below. The page follows the chain itself and updates when the transaction confirms."
          crypto={`${invoice.amount} ${ASSET_TICKERS[invoice.asset] ?? invoice.asset.toUpperCase()}`}
          fiat={`$${invoice.amountUsd}`}
          footer={<CopyRow value={invoice.address} />}
          lines={[
            { label: 'Invoice', value: invoice.id },
            { label: 'Received', value: `${invoice.received} ${ticker}` },
            { label: 'Confirmations needed', value: String(invoice.confirmationsRequired) },
            { label: 'Rate held until', value: new Date(invoice.expiresAt).toLocaleTimeString() },
          ]}
          rate={`1 ${ticker} = $${Number(invoice.rateUsd).toLocaleString('en-US')}`}
          state="pending"
          title="Waiting for your transfer"
        />
      </>
    )
  } else {
    view = <CurrencyTransfer caption="Opening an invoice." state="pending" title="One moment" />
  }

  const locked = phase === 'awaiting' || phase === 'settled'

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerTrigger asChild>
        <button className="stamp-btn" type="button">
          Pay {fiat} in crypto
        </button>
      </DrawerTrigger>

      <DrawerContent className="mx-auto max-w-[440px] border-[var(--border)] bg-[var(--bg)]">
        <div className="px-5 pb-2 pt-1">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="font-[var(--font-display)] text-[17px] font-normal tracking-[-0.02em] text-[var(--text)]">
              {plan.name}
            </DrawerTitle>
            <DrawerDescription className="text-[12.5px] text-[var(--text-muted)]">{plan.blurb}</DrawerDescription>
          </DrawerHeader>

          <AssetPicker assets={assets} disabled={locked} onChange={setAsset} value={asset} />

          {view}

          <DrawerFooter className="px-0 pb-5">
            <DrawerClose asChild>
              <button className="stamp-btn w-full" type="button">
                Close
              </button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
