import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import {
  Activity, Antenna, BarChart3, ChevronLeft, ChevronRight,
  Clock3, Database, Gauge, Menu, Radio, RefreshCcw, Satellite, Settings,
  ShieldAlert, TerminalSquare, WifiOff
} from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, AreaChart, Area, BarChart, Bar, CartesianGrid } from 'recharts'
import { type MissionState, type Packet, type PacketType, type MissionEvent, packetWeight, rankedPackets } from './simulation'
import './App.css'

const nav = [
  ['/', 'Mission Overview', Gauge], ['/packets', 'Packet Operations', Database], ['/scheduler', 'Priority Scheduler', Activity],
  ['/link', 'Communication Link', Radio], ['/blackout', 'Blackout Simulator', WifiOff], ['/earth', 'Earth Station', Antenna],
  ['/analytics', 'Analytics', BarChart3], ['/events', 'Mission Event Log', TerminalSquare], ['/config', 'System Configuration', Settings],
] as const

let packetCounter = 1
let eventCounter = 1

function utcTime() { return new Date().toISOString().slice(11, 19) + ' UTC' }
function packetId() { const id = packetCounter++; return `AR07-PKT-${String(id).padStart(6, '0')}` }

function addEvent(state: MissionState, description: string, category: MissionEvent['category'], severity: MissionEvent['severity'] = 'INFO'): MissionState {
  const event: MissionEvent = { id: eventCounter++, time: utcTime(), category, severity, description }
  return { ...state, events: [event, ...state.events].slice(0, 100) }
}

function makePacket(type: PacketType = 'TELEMETRY'): Packet {
  const types: PacketType[] = ['TELEMETRY', 'TELEMETRY', 'HEALTH', 'SCIENCE', 'IMAGE']
  const packetType = type === 'TELEMETRY' && Math.random() > .75 ? types[Math.floor(Math.random()*types.length)] : type
  return { id: packetId(), type: packetType, priority: packetWeight[packetType], size: packetType === 'IMAGE' ? 384 : packetType === 'SCIENCE' ? 128 : 48, status: 'QUEUED', retries: 0, createdAt: Date.now() }
}

function initialState(): MissionState {
  let state: MissionState = {
    link: 'LINKED', contact: true, packets: [], events: [], telemetry: [], totalGenerated: 0, retransmissions: 0, linkLossCount: 0, lossNext: false,
  }
  state = addEvent(state, 'Mission AR-07 initialised', 'MISSION', 'SUCCESS')
  state = addEvent(state, 'Autonomous relay system online', 'SYSTEM', 'SUCCESS')
  state = addEvent(state, 'Earth station network connected', 'EARTH', 'SUCCESS')
  for (let i = 0; i < 18; i++) {
    const p = makePacket()
    state.packets.push(p)
  }
  state.totalGenerated = 18
  for (let i = 24; i >= 0; i--) {
    state.telemetry.push({ time: `${i}s`, battery: 28.2 + Math.sin(i/4)*.12, temperature: 17.4 + Math.sin(i/3)*1.1, cpu: 61 + Math.cos(i/5)*4, queue: 18 + i/8, link: 94, bandwidth: 42 })
  }
  return state
}

function AppShell() {
  const [state, setState] = useState(initialState)
  const [paused, setPaused] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [demoActive, setDemoActive] = useState(false)
  const [demoPhase, setDemoPhase] = useState('STANDBY')
  const demoTimers = useRef<number[]>([])

  const clearTimers = () => { demoTimers.current.forEach(window.clearTimeout); demoTimers.current = [] }

  useEffect(() => {
    if (paused) return
    const tick = window.setInterval(() => {
      setState(prev => {
        let next = prev
        const p = makePacket()
        next = { ...next, packets: [p, ...next.packets], totalGenerated: next.totalGenerated + 1 }
        next = addEvent(next, `${p.id} generated and stored`, 'PACKET')
        if (next.contact && next.link === 'LINKED') {
          const ranked = rankedPackets(next.packets)
          const send = ranked[0]
          if (send) {
            const lose = next.lossNext
            next = { ...next, lossNext: false }
            if (lose) {
              const updated = next.packets.map(x => x.id === send.id ? { ...x, retries: x.retries + 1, status: 'RETRY' as const } : x)
              next = { ...next, packets: updated, retransmissions: next.retransmissions + 1 }
              next = addEvent(next, `Packet loss detected; ${send.id} retry scheduled`, 'NETWORK', 'WARNING')
            } else {
              const updated = next.packets.map(x => x.id === send.id ? { ...x, status: 'DELIVERED' as const } : x)
              next = { ...next, packets: updated }
              next = addEvent(next, `${send.id} acknowledged by Earth station`, 'EARTH', 'SUCCESS')
            }
          }
        }
        const last = next.telemetry.at(-1)
        const queue = next.packets.filter(p => p.status !== 'DELIVERED').length
        const point = { time: utcTime().slice(0, 5), battery: 28.2 + Math.sin(Date.now()/25000)*.12, temperature: 17.4 + Math.sin(Date.now()/18000)*1.1, cpu: 61 + Math.cos(Date.now()/22000)*4, queue, link: next.link === 'LINKED' ? 94 : 0, bandwidth: next.contact ? 42 : 0 }
        next = { ...next, telemetry: [...next.telemetry, point].slice(-40) }
        void last
        return next
      })
    }, 1800)
    return () => window.clearInterval(tick)
  }, [paused])

  const delivered = state.packets.filter(p => p.status === 'DELIVERED').length
  const queue = state.packets.filter(p => p.status !== 'DELIVERED').length
  const deliveryRate = state.totalGenerated ? Math.round(delivered / state.totalGenerated * 100) : 0

  const setBlackout = () => setState(prev => addEvent({ ...prev, link: 'BLACKOUT', contact: false }, 'Communication blackout detected; autonomous mode active', 'NETWORK', 'CRITICAL'))
  const restoreLink = () => setState(prev => addEvent({ ...prev, link: 'LINKED', contact: true }, 'Communication link restored; contact window open', 'NETWORK', 'SUCCESS'))

  const reset = () => { clearTimers(); packetCounter = 1; eventCounter = 1; setState(initialState()); setPaused(false); setDemoActive(false); setDemoPhase('STANDBY') }

  const startDemo = () => {
    clearTimers(); setDemoActive(true); setPaused(false)
    const later = (ms: number, fn: () => void) => { const id = window.setTimeout(fn, ms); demoTimers.current.push(id) }
    setDemoPhase('PHASE 1 · MISSION INITIALISATION')
    later(1800, () => { setDemoPhase('PHASE 2 · DATA GENERATION'); setState(p => addEvent(p, 'Mission data generation sequence started', 'MISSION', 'SUCCESS')) })
    later(3800, () => { setDemoPhase('PHASE 3 · NORMAL TRANSMISSION'); restoreLink(); setState(p => addEvent(p, 'Contact window opened; normal transmission begun', 'NETWORK', 'SUCCESS')) })
    later(7000, () => { setDemoPhase('PHASE 4 · COMMUNICATION BLACKOUT'); setBlackout() })
    later(10000, () => { setDemoPhase('PHASE 5 · EMERGENCY EVENT'); setState(p => { const e = makePacket('EMERGENCY'); e.id = `AR07-PKT-${String(++packetCounter).padStart(6, '0')}`; let n = { ...p, packets: [e, ...p.packets], totalGenerated: p.totalGenerated + 1 }; n = addEvent(n, 'Emergency thermal anomaly packet generated', 'PACKET', 'CRITICAL'); return n } ) })
    later(12500, () => { setDemoPhase('PHASE 6 · LINK RESTORATION'); restoreLink() })
    later(14500, () => { setDemoPhase('PHASE 7 · PACKET LOSS'); setState(p => ({ ...p, lossNext: true })) })
    later(18500, () => { setDemoPhase('PHASE 8 · ACK CONFIRMATION'); setState(p => addEvent(p, 'Retransmission acknowledged by Earth station', 'EARTH', 'SUCCESS')) })
    later(23500, () => { setDemoPhase('PHASE 9 · QUEUE RECOVERY'); setState(p => addEvent(p, 'Store-and-forward queue recovery in progress', 'SYSTEM', 'SUCCESS')) })
    later(30000, () => { setDemoPhase('PHASE 10 · MISSION SUMMARY'); setDemoActive(false); setState(p => addEvent(p, 'Live demonstration completed successfully', 'MISSION', 'SUCCESS')) })
  }

  const pauseDemo = () => setPaused(v => !v)

  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Satellite size={23}/></div><div className="brand-copy"><strong>ASTRA RELAY</strong><span>MISSION OPERATIONS</span></div><button className="collapse" onClick={() => setCollapsed(v => !v)}>{collapsed ? <ChevronRight/> : <ChevronLeft/>}</button></div>
        <nav>{nav.map(([path, label, Icon]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMobileOpen(false)}><Icon size={17}/><span>{label}</span></NavLink>)}</nav>
        <div className="side-status"><small>SYSTEM STATUS</small><div><span className="dot green"/>Network <b>CONNECTED</b></div><div><span className="dot green"/>MQTT <b>SIMULATED</b></div><div><span className={state.link === 'LINKED' ? 'dot green' : 'dot red'}/>Earth station <b>{state.link === 'LINKED' ? 'ONLINE' : 'OFFLINE'}</b></div><div><span className="dot cyan"/>Mode <b>{state.link === 'LINKED' ? 'AUTONOMOUS' : 'BLACKOUT'}</b></div></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(v => !v)}><Menu size={19}/></button>
          <div className="mission-id"><span>MISSION ID</span><strong>AR-07</strong></div>
          <div className="mission-status"><span>MISSION STATUS</span><strong>{state.link === 'LINKED' ? '● ACTIVE / AUTONOMOUS' : '● COMMUNICATION BLACKOUT'}</strong></div>
          <div className="top-spacer"/><div className="utc"><Clock3 size={14}/>{utcTime()}</div>
          <div className="health"><span className="dot green"/>ALL SYSTEMS {state.link === 'LINKED' ? 'OPERATIONAL' : 'NOMINAL · AUTONOMY ACTIVE'}</div>
        </header>
        <main>
          <div className="demo-bar"><div><span className={`dot ${demoActive ? 'amber pulse' : 'cyan'}`}/>{demoActive ? demoPhase : 'SIMULATION ENGINE · LIVE'}</div><div className="demo-actions"><button className="secondary" onClick={pauseDemo}>{paused ? 'RESUME' : 'PAUSE'}</button><button className="primary" onClick={startDemo}>{demoActive ? 'RESTART DEMONSTRATION' : 'START LIVE DEMONSTRATION'}</button><button className="icon-btn" title="Reset simulation" onClick={reset}><RefreshCcw size={15}/></button></div></div>
          <Routes>
            <Route path="/" element={<Overview state={state} delivered={delivered} queue={queue} deliveryRate={deliveryRate} setBlackout={setBlackout} restoreLink={restoreLink}/>} />
            <Route path="/packets" element={<PacketOperations state={state}/>} />
            <Route path="/scheduler" element={<SchedulerPage state={state}/>} />
            <Route path="/link" element={<LinkPage state={state} setBlackout={setBlackout} restoreLink={restoreLink}/>} />
            <Route path="/blackout" element={<LinkPage state={state} setBlackout={setBlackout} restoreLink={restoreLink}/>} />
            <Route path="/earth" element={<EarthPage state={state}/>} />
            <Route path="/analytics" element={<AnalyticsPage state={state}/>} />
            <Route path="/events" element={<EventsPage state={state}/>} />
            <Route path="/config" element={<ConfigPage/>} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Panel({ title, children, className = '' }: { title?: string, children: any, className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-head"><h3>{title}</h3><span className="live-dot"><i/>LIVE</span></div>}<div className="panel-body">{children}</div></section>
}

function Overview({ state, delivered, queue, deliveryRate, setBlackout, restoreLink }: { state: MissionState, delivered: number, queue: number, deliveryRate: number, setBlackout: ()=>void, restoreLink: ()=>void }) {
  const retrans = state.retransmissions
  return <>
    <div className="page-title"><div><span>MISSION CONTROL / AR-07</span><h1>Mission Overview</h1></div><div className="operational"><ShieldAlert size={16}/><span>{state.link === 'LINKED' ? 'NOMINAL OPERATIONS' : 'AUTONOMOUS RECOVERY'}</span></div></div>
    <div className="kpis">
      <Kpi label="PACKETS GENERATED" value={state.totalGenerated.toLocaleString()} detail="Mission total"/>
      <Kpi label="PACKETS DELIVERED" value={delivered.toLocaleString()} detail="Earth ACK" positive/>
      <Kpi label="PENDING QUEUE" value={queue.toLocaleString()} detail="Persistent store" warning={queue > 25}/>
      <Kpi label="DELIVERY RATE" value={`${deliveryRate}%`} detail="Ack / generated" positive/>
      <Kpi label="RETRANSMISSIONS" value={retrans.toString()} detail="Retry attempts" warning={retrans > 0}/>
      <Kpi label="LINK AVAILABILITY" value={state.link === 'LINKED' ? '98.4%' : '0.0%'} detail="Current contact"/>
    </div>
    <div className="overview-grid">
      <Panel title="COMMUNICATION ARCHITECTURE" className="architecture">
        <div className={`architecture-map ${state.link === 'BLACKOUT' ? 'blackout' : ''}`}>
          <Node icon={<Satellite/>} title="LANDER / ROVER" subtitle="SURFACE UNIT" status="ACTIVE · AUTONOMOUS"/>
          <div className="link-path"><div className="orbit-line"/><span>{state.link === 'LINKED' ? 'RELAY LINK · 42 MBPS' : 'LINK LOST · BLACKOUT'}</span>{state.link === 'LINKED' && <div className="packet-flow"><i/><i/><i/></div>}</div>
          <Node icon={<Radio/>} title="COMMUNICATION RELAY" subtitle="ORBITAL RELAY" status={state.link === 'LINKED' ? 'LINK AVAILABLE' : 'LINK UNAVAILABLE'}/>
          <div className="link-path"><div className="orbit-line"/><span>{state.link === 'LINKED' ? 'X-BAND · LOCKED' : 'NO CARRIER'}</span>{state.link === 'LINKED' && <div className="packet-flow"><i/><i/></div>}</div>
          <Node icon={<Antenna/>} title="EARTH STATION" subtitle="DSN ARRAY 14" status={state.link === 'LINKED' ? 'RECEIVING · ACK' : 'WAITING'}/>
        </div>
        <div className="architecture-actions"><button className="danger" onClick={setBlackout}>TRIGGER BLACKOUT</button><button className="success" onClick={restoreLink}>RESTORE LINK</button></div>
      </Panel>
      <Panel title="ONBOARD QUEUE" className="queue-panel"><div className="queue-ring"><div><strong>{queue}</strong><span>PACKETS</span></div></div><div className="queue-bars">{state.packets.filter(p=>p.status!=='DELIVERED').slice(0,8).map(p=><div key={p.id}><span style={{width:`${Math.min(100,p.priority)}%`}} className={p.type==='EMERGENCY'?'critical':''}/></div>)}</div></Panel>
    </div>
    <div className="telemetry-grid">
      <Panel title="LIVE TELEMETRY"><ResponsiveContainer width="100%" height={180}><LineChart data={state.telemetry}><CartesianGrid stroke="#1b2735"/><XAxis dataKey="time" hide/><YAxis domain={[27,30]} tick={{fill:'#64758a',fontSize:10}}/><Tooltip contentStyle={{background:'#111a26',border:'1px solid #263448'}}/><Line type="monotone" dataKey="battery" stroke="#45d6ff" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer><div className="chart-label"><span>BATTERY VOLTAGE</span><strong>{state.telemetry.at(-1)?.battery.toFixed(2)} V</strong></div></Panel>
      <Panel title="THERMAL & SYSTEM"><ResponsiveContainer width="100%" height={180}><AreaChart data={state.telemetry}><CartesianGrid stroke="#1b2735"/><XAxis dataKey="time" hide/><YAxis tick={{fill:'#64758a',fontSize:10}}/><Tooltip contentStyle={{background:'#111a26',border:'1px solid #263448'}}/><Area type="monotone" dataKey="temperature" stroke="#ffb84d" fill="#ffb84d20"/><Area type="monotone" dataKey="cpu" stroke="#4f83ff" fill="#4f83ff20"/></AreaChart></ResponsiveContainer><div className="chart-label"><span>CPU / THERMAL</span><strong>{state.telemetry.at(-1)?.temperature.toFixed(1)} °C</strong></div></Panel>
      <Panel title="QUEUE & LINK"><ResponsiveContainer width="100%" height={180}><BarChart data={state.telemetry.slice(-18)}><CartesianGrid stroke="#1b2735"/><XAxis dataKey="time" hide/><YAxis tick={{fill:'#64758a',fontSize:10}}/><Tooltip contentStyle={{background:'#111a26',border:'1px solid #263448'}}/><Bar dataKey="queue" fill="#37d996"/><Bar dataKey="link" fill="#45d6ff"/></BarChart></ResponsiveContainer><div className="chart-label"><span>PENDING / LINK QUALITY</span><strong>{queue} / {state.link==='LINKED'?'94%':'0%'}</strong></div></Panel>
    </div>
  </>
}

function Kpi({label,value,detail,positive,warning}:{label:string,value:string,detail:string,positive?:boolean,warning?:boolean}) { return <div className="kpi"><span>{label}</span><strong className={positive?'positive':warning?'warning':''}>{value}</strong><small>{detail}</small></div> }
function Node({icon,title,subtitle,status}:{icon:any,title:string,subtitle:string,status:string}) { return <div className="node"><div className="node-icon">{icon}</div><strong>{title}</strong><span>{subtitle}</span><b><i/> {status}</b></div> }


function PacketOperations({ state }: { state: MissionState }) {
  const packets = [...state.packets].sort((a,b) => b.priority-a.priority).slice(0,30)
  return <><PageTitle title="Packet Operations"/><div className="operations-grid"><Panel title="MISSION PACKET QUEUE"><div className="packet-table"><div className="packet-row table-head"><span>ID</span><span>TYPE</span><span>PRIORITY</span><span>SIZE</span><span>STATUS</span></div>{packets.map(p=><div className="packet-row" key={p.id}><span>{p.id}</span><span>{p.type}</span><span className={p.type==='EMERGENCY'?'critical-text':''}>P{Math.round(p.priority/10)}</span><span>{p.size} KB</span><span className={`status ${p.status.toLowerCase()}`}>{p.status}</span></div>)}</div></Panel></div></>
}

function SchedulerPage({ state }: { state: MissionState }) {
  const ranked = rankedPackets(state.packets).slice(0,12)
  return <><PageTitle title="Mission-Aware Priority Scheduler"/><div className="operations-grid"><Panel title="CURRENT TRANSMISSION RANK"><div className="scheduler-list">{ranked.map((p,i)=><div key={p.id}><b>{String(i+1).padStart(2,'0')}</b><span><strong>{p.id}</strong><small>{p.type} · retry {p.retries}</small></span><em>{Math.round(p.priority)} pts</em></div>)}</div></Panel><Panel title="SCHEDULER POLICY"><div className="policy"><div><span>MISSION CRITICAL</span><b>100%</b></div><div><span>SCIENCE PRIORITY</span><b>72%</b></div><div><span>IMAGE DATA</span><b>58%</b></div><div><span>HEALTH TELEMETRY</span><b>46%</b></div><div><span>ROUTINE TELEMETRY</span><b>32%</b></div></div></Panel></div></>
}

function LinkPage({ state, setBlackout, restoreLink }: { state:MissionState,setBlackout:()=>void,restoreLink:()=>void }) { return <><PageTitle title="Communication Link"/><div className="operations-grid"><Panel title="LINK TELEMETRY"><div className="big-status"><span className={state.link==='LINKED'?'dot green':'dot red'}/>{state.link==='LINKED'?'CONTACT AVAILABLE':'COMMUNICATION BLACKOUT'}<b>{state.link==='LINKED'?'+14.2 dBm':'NO CARRIER'}</b></div><ResponsiveContainer width="100%" height={220}><LineChart data={state.telemetry}><CartesianGrid stroke="#1b2735"/><XAxis dataKey="time" hide/><YAxis/><Tooltip contentStyle={{background:'#111a26',border:'1px solid #263448'}}/><Line dataKey="link" stroke="#45d6ff" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></Panel><Panel title="LINK CONTROL"><div className="link-controls"><button className="success" onClick={restoreLink}>OPEN CONTACT WINDOW</button><button className="danger" onClick={setBlackout}>INITIATE BLACKOUT</button><div><span>Bandwidth</span><b>42 Mbps</b></div><div><span>Latency</span><b>1.24 s</b></div><div><span>Packet loss</span><b>{state.lossNext?'ARMED':'0.8%'}</b></div></div></Panel></div></> }

function EarthPage({ state }: { state:MissionState }) { return <><PageTitle title="Earth Station"/><div className="operations-grid"><Panel title="GROUND SEGMENT · DSN ARRAY 14"><div className="earth-map"><Antenna size={74}/><div><span>STATION STATE</span><b>{state.link==='LINKED'?'RECEIVING':'AWAITING CONTACT'}</b><span>ACKNOWLEDGEMENT BUS</span><b>{state.link==='LINKED'?'OPERATIONAL':'STANDBY'}</b></div></div></Panel><Panel title="LAST RECEIVED"><div className="earth-list">{state.packets.filter(p=>p.status==='DELIVERED').slice(0,8).map(p=><div key={p.id}><CircleIcon/><span>{p.id}<small>{p.type}</small></span><b>ACK</b></div>)}</div></Panel></div></> }

function CircleIcon(){return <span className="received-dot"/>}

function AnalyticsPage({ state }: { state:MissionState }) { const data=state.telemetry.slice(-24); return <><PageTitle title="Mission Analytics"/><div className="operations-grid"><Panel title="TELEMETRY HISTORY"><ResponsiveContainer width="100%" height={280}><LineChart data={data}><CartesianGrid stroke="#1b2735"/><XAxis dataKey="time" hide/><YAxis/><Tooltip contentStyle={{background:'#111a26',border:'1px solid #263448'}}/><Line dataKey="battery" stroke="#45d6ff" dot={false}/><Line dataKey="temperature" stroke="#ffb84d" dot={false}/><Line dataKey="cpu" stroke="#4f83ff" dot={false}/></LineChart></ResponsiveContainer></Panel><Panel title="DATA GENERATION"><div className="metric-tiles"><div><span>TOTAL PACKETS</span><b>{state.totalGenerated}</b></div><div><span>DELIVERED</span><b>{state.packets.filter(p=>p.status==='DELIVERED').length}</b></div><div><span>RETRIES</span><b>{state.retransmissions}</b></div></div></Panel></div></> }

function EventsPage({ state }: { state:MissionState }) { return <><PageTitle title="Mission Event Log"/><div className="operations-grid"><Panel title="TIMESTAMPED EVENT STREAM"><div className="event-list">{state.events.map(e=><div key={e.id}><time>{e.time}</time><span className={`severity ${e.severity.toLowerCase()}`}>{e.severity}</span><b>{e.category}</b><p>{e.description}</p></div>)}</div></Panel></div></> }

function ConfigPage(){return <><PageTitle title="System Configuration"/><div className="operations-grid"><Panel title="SIMULATION PARAMETERS"><div className="config-list"><label>Packet generation rate<select defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label><label>Packet loss probability<select defaultValue="0.8%"><option>0%</option><option>0.8%</option><option>5%</option><option>15%</option></select></label><label>Transmission bandwidth<select defaultValue="42 Mbps"><option>10 Mbps</option><option>42 Mbps</option><option>100 Mbps</option></select></label><label>Retry limit<select defaultValue="3"><option>1</option><option>3</option><option>5</option></select></label></div></Panel><Panel title="BACKEND"><div className="backend-info"><b>SIMULATION MODE</b><p>Frontend simulation engine active</p><span>SQLite / MQTT ready for integration</span></div></Panel></div></>}

function PageTitle({title}:{title:string}){return <div className="page-title"><div><span>MISSION CONTROL / AR-07</span><h1>{title}</h1></div></div>}

function App() { return <BrowserRouter><AppShell/></BrowserRouter> }
export default App
