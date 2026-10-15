import { useCallback, useState } from 'react'
import { useStore } from '../../state/store.jsx'
import { submitEarlyAccess, isEmail } from '../../lib/earlyAccess.js'

export function useSignup() {
  const { settings } = useStore()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState({ state: 'idle' })

  const submit = useCallback(async () => {
    if (!isEmail(email)) {
      setStatus({ state: 'invalid', message: 'That address does not look right' })
      return false
    }

    setStatus({ state: 'sending' })
    try {
      const res = await submitEarlyAccess(email, settings)
      setStatus({ state: 'done', ...res })
      return true
    } catch (err) {
      setStatus({ state: 'failed', message: err.message || 'Could not send that' })
      return false
    }
  }, [email, settings])

  const reset = useCallback(() => {
    setEmail('')
    setStatus({ state: 'idle' })
  }, [])

  return { email, setEmail, status, submit, reset }
}
