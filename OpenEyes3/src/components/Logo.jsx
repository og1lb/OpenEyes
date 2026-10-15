import { useState } from 'react'

export default function Logo({ size = 26, withWordmark = false }) {
  const [broken, setBroken] = useState(false)

  if (broken) {
    return (
      <span className="logo-fallback" style={{ width: size, height: size }} aria-label="OpenEyes">
        <span />
      </span>
    )
  }

  if (withWordmark) {
    return (
      <img
        className="openeyes-logo-full"
        src="/logo.png"
        alt="OpenEyes"
        onError={() => setBroken(true)}
      />
    )
  }

  return (
    <img
      className="openeyes-logo-mark"
      src="/logo-mark.png"
      width={size}
      height={size}
      alt="OpenEyes"
      onError={() => setBroken(true)}
    />
  )
}
