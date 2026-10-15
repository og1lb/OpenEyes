import { useState } from 'react'

const ITEMS = [
  {
    q: 'What is OpenEyes, in one line?',
    a: 'An OSINT forensics toolkit. Twenty-three investigation modules across social, network, finance, email and archive work, one shared target field, and exports that hold up in a case file. We build the tooling. You bring the sources and the keys.',
  },
  {
    q: 'Is this a data broker?',
    a: 'No. There is no index behind this and nothing is resold. The toolkit runs whatever sources you plug into it. Point a module at nothing and it tells you it has nothing, instead of filling the gap with a guess.',
  },
  {
    q: 'How does paying actually work?',
    a: 'Sign in with Discord, pick monthly or lifetime, and the server derives a receiving address for that one invoice. It watches the chain itself and waits for the confirmations. When they land, the role goes on your account. Nothing in that path touches a card.',
  },
  {
    q: 'What happens when the month runs out?',
    a: 'The role comes off and the panel stops answering. We hold nothing that could charge you a second time, which means renewing is a deliberate act. Pay before the end and the new days stack on top of what is left.',
  },
  {
    q: 'Why is access tied to a Discord role?',
    a: 'One place for you to see where you stand, one thing for us to check. Every panel request is checked against the role on the server. Pull the role and the next request fails.',
  },
  {
    q: 'Where do my queries and keys go?',
    a: 'Module runs go through the server, which is where the provider keys sit. Targets and history stay local to your session. On our side we hold a Discord id, what you bought and when it expires.',
  },
  {
    q: 'Is running this legal?',
    a: 'The passive modules read public records. Port Sweep and the SMTP probe touch the target directly, and both carry a label in the panel saying so. Run those two only against systems you own or were given written permission to test.',
  },
  {
    q: 'When does it open?',
    a: 'When the provider layer holds up across every module. No date from us: a missed one costs more than no date at all. The waitlist hears first.',
  },
]

export default function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <div className="faq-list">
      {ITEMS.map((item, i) => (
        <div className={`faq-item${open === i ? ' open' : ''}`} key={item.q}>
          <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <span className="t">{item.q}</span>
            <span className="sign">{open === i ? '−' : '+'}</span>
          </button>
          {open === i && <div className="faq-a">{item.a}</div>}
        </div>
      ))}
    </div>
  )
}
