export type LinkState = 'LINKED' | 'BLACKOUT'
export type PacketType = 'TELEMETRY' | 'SCIENCE' | 'HEALTH' | 'IMAGE' | 'EMERGENCY'
export type PacketStatus = 'QUEUED' | 'IN_TRANSIT' | 'DELIVERED' | 'RETRY'

export interface Packet {
  id: string
  type: PacketType
  priority: number
  size: number
  status: PacketStatus
  retries: number
  createdAt: number
}

export interface MissionEvent {
  id: number
  time: string
  category: 'MISSION' | 'NETWORK' | 'PACKET' | 'EARTH' | 'SYSTEM'
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL'
  description: string
}

export interface TelemetryPoint { time: string; battery: number; temperature: number; cpu: number; queue: number; link: number; bandwidth: number }

export interface MissionState {
  link: LinkState
  contact: boolean
  packets: Packet[]
  events: MissionEvent[]
  telemetry: TelemetryPoint[]
  totalGenerated: number
  retransmissions: number
  linkLossCount: number
  lossNext: boolean
}

export const packetWeight: Record<PacketType, number> = {
  EMERGENCY: 100, SCIENCE: 72, IMAGE: 58, HEALTH: 46, TELEMETRY: 32,
}

export function scorePacket(packet: Packet) {
  const ageBonus = Math.min(20, (Date.now() - packet.createdAt) / 60000)
  return packet.priority + ageBonus - packet.retries * 2
}

export function rankedPackets(packets: Packet[]) {
  return [...packets].filter(p => p.status !== 'DELIVERED').sort((a, b) => scorePacket(b) - scorePacket(a))
}
