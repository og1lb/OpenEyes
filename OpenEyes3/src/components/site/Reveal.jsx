import { motion, useReducedMotion } from 'motion/react'

const EASE = [0.22, 0.61, 0.36, 1]

export function Reveal({ children, as = 'div', className, delay = 0, y = 20, once = true, ...rest }) {
  const still = useReducedMotion()
  const M = motion[as] ?? motion.div
  if (still) {
    const Tag = as
    return (
      <Tag className={className} {...rest}>
        {children}
      </Tag>
    )
  }
  return (
    <M
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-70px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </M>
  )
}

export function Stagger({ children, className, gap = 0.08, delay = 0, once = true }) {
  const still = useReducedMotion()
  if (still) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hide"
      whileInView="show"
      viewport={{ once, margin: '-70px' }}
      transition={{ staggerChildren: gap, delayChildren: delay }}
    >
      {children}
    </motion.div>
  )
}

const ITEM = {
  hide: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}

export function Item({ children, as = 'div', className }) {
  const still = useReducedMotion()
  const M = motion[as] ?? motion.div
  if (still) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }
  return (
    <M className={className} variants={ITEM}>
      {children}
    </M>
  )
}

// A headline that rises line by line from behind a mask.
export function Headline({ lines, className }) {
  const still = useReducedMotion()
  if (still) {
    return (
      <h1 className={className}>
        {lines.map((line, i) => (
          <span className="hl-line" key={i}>
            {line}
          </span>
        ))}
      </h1>
    )
  }
  return (
    <h1 className={className}>
      {lines.map((line, i) => (
        <span className="hl-mask" key={i}>
          <motion.span
            className="hl-line"
            initial={{ y: '110%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 + i * 0.12 }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </h1>
  )
}
