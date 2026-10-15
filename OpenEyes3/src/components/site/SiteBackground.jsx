import { useEffect, useRef } from 'react'

export default function SiteBackground() {
  const rootRef = useRef(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const target = { x: 0.5, y: 0.34 }
    const eased = { x: 0.5, y: 0.34 }
    let raf = 0
    let running = false

    function tick() {
      const dx = target.x - eased.x
      const dy = target.y - eased.y
      eased.x += dx * 0.06
      eased.y += dy * 0.06
      root.style.setProperty('--mx', `${(eased.x * 100).toFixed(2)}%`)
      root.style.setProperty('--my', `${(eased.y * 100).toFixed(2)}%`)

      if (Math.abs(dx) < 0.0004 && Math.abs(dy) < 0.0004) {
        running = false
        return
      }
      raf = requestAnimationFrame(tick)
    }

    function wake() {
      if (running || document.hidden) return
      running = true
      raf = requestAnimationFrame(tick)
    }

    function onPointer(e) {
      target.x = e.clientX / window.innerWidth
      target.y = e.clientY / window.innerHeight
      wake()
    }

    function onLeave() {
      target.x = 0.5
      target.y = 0.34
      wake()
    }

    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const depth = Math.min(1, window.scrollY / (window.innerHeight * 1.2))
        root.style.setProperty('--depth', depth.toFixed(3))
        ticking = false
      })
    }

    onScroll()
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className="site-bg" ref={rootRef} aria-hidden="true">
      <div className="bg-field">
        <span className="mass-a" />
        <span className="mass-b" />
        <span className="mass-c" />
        <span className="mass-d" />
        <span className="mass-e" />
      </div>
      <div className="bg-sheen" />
      <div className="bg-spot" />
      <div className="site-vignette" />
      <div className="site-grain" />
    </div>
  )
}
