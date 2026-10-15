import Logo from '../Logo.jsx'
import Icon from '../Icon.jsx'

const groups = [
  ['Identity', 'user', ['Email Intel', 'Username Sweep', 'Phone Lookup']],
  ['Social Intelligence', 'message', ['Discord Lookup', 'TikTok Lookup', 'Telegram Lookup']],
  ['Network Intelligence', 'radar', ['IP Lookup', 'ASN Lookup', 'Domain Recon']],
  ['Email Intelligence', 'mail', ['Email Intel', 'Breach Search', 'Mail Posture']],
  ['OSINT', 'branch', ['OSINT Map', 'Wayback Snapshots']],
]

export default function PanelMock() {
  return <div className="mock-wrap" aria-label="Static OpenEyes dashboard preview">
    <div className="mock dashboard-preview-v4">
      <aside className="mock-sidebar">
        <div className="mock-logo"><Logo size={20} withWordmark/></div>
        <div className="mock-nav-title">WORKSPACE</div>
        <div className="mock-nav active"><Icon name="grid" size={11}/>Dashboard</div>
        <div className="mock-nav"><Icon name="clock" size={11}/>History</div>
        <div className="mock-nav"><Icon name="branch" size={11}/>OSINT Map</div>
        {groups.map(([name, icon, tools]) => <div key={name} className="mock-group"><div className="mock-nav-title"><Icon name={icon} size={9}/> {name}</div>{tools.map(tool => <div className="mock-nav" key={tool}><Icon name={icon} size={10}/>{tool}</div>)}</div>)}
      </aside>
      <div className="mock-main">
        <div className="mock-top"><div><span className="eyebrow">OPEN EYES / LIVE WORKSPACE</span><b>Dashboard</b><small>Welcome researcher. Your workspace updates without a full reload.</small></div><span className="live-dot">● LIVE</span></div>
        <div className="mock-kpis"><div><small>SEARCHES TODAY</small><b>18 / 35</b></div><div><small>REMAINING</small><b>17</b></div><div><small>PLAN</small><b>Premium</b></div><div><small>ROLE</small><b>User</b></div></div>
        <div className="mock-grid"><section className="mock-card mock-console"><div className="mock-card-head"><span>LIVE CONSOLE</span><em>near-live</em></div><p><b>Email Intel</b><span>t••••••••••@example.com</span><small>success</small></p><p><b>Domain Recon</b><span>e••••••.com</span><small>success</small></p><p><b>IP Lookup</b><span>1••.••.••.8</span><small>success</small></p></section><section className="mock-card"><div className="mock-card-head"><span>ACTIVITY</span><em>7 DAYS</em></div><div className="fake-bars">{[30,55,40,78,48,66,90,52,72,61,82,44,70,96].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div></section></div>
        <section className="mock-card mock-modules"><div className="mock-card-head"><span>START A MODULE</span><em>24 modules</em></div><div className="mock-module-grid">{groups.slice(0,4).map(([name,icon,tools])=><div key={name}><h4><Icon name={icon} size={10}/>{name}</h4>{tools.map(t=><span key={t}>{t}</span>)}</div>)}</div></section>
      </div>
    </div>
  </div>
}
