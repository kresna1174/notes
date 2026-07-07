import { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { sqlite } from '../lib/db'

const messageSync = 0
const messageAwareness = 1

// Cookie parsing helper
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const list: Record<string, string> = {}
  if (!cookieHeader) return list
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=')
    list[parts.shift()!.trim()] = decodeURI(parts.join('='))
  })
  return list
}

export function verifySession(cookieHeader: string | undefined): boolean {
  const cookies = parseCookies(cookieHeader)
  const sessionToken = cookies['session']
  if (!sessionToken) return false
  try {
    const row = sqlite.prepare('SELECT user_id FROM sessions WHERE token = ?').get(sessionToken)
    return !!row
  } catch (err) {
    console.error('[Yjs Auth error]', err)
    return false
  }
}

export class SharedDoc extends Y.Doc {
  noteId: string
  conns: Map<WebSocket, Set<number>>
  awareness: awarenessProtocol.Awareness

  constructor(noteId: string) {
    super()
    this.noteId = noteId
    this.conns = new Map()
    this.awareness = new awarenessProtocol.Awareness(this)

    this.on('update', (update, origin) => {
      if (origin === this) return
      // Broadcast update to all active connections
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageSync)
      syncProtocol.writeUpdate(encoder, update)
      const message = encoding.toUint8Array(encoder)
      this.conns.forEach((_, conn) => {
        if (conn.readyState === 1) { // OPEN
          conn.send(message, { binary: true })
        }
      })
    })

    this.awareness.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, _origin: any) => {
      const changedClients = added.concat(updated, removed)
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, messageAwareness)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients))
      const message = encoding.toUint8Array(encoder)
      this.conns.forEach((_, conn) => {
        if (conn.readyState === 1) { // OPEN
          conn.send(message, { binary: true })
        }
      })
    })
  }
}

const sharedDocs = new Map<string, SharedDoc>()

export function handleYjsConnection(ws: WebSocket, noteId: string) {
  let doc = sharedDocs.get(noteId)
  if (!doc) {
    doc = new SharedDoc(noteId)
    sharedDocs.set(noteId, doc)
  }

  doc.conns.set(ws, new Set())

  // Send sync step 1
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, doc)
  ws.send(encoding.toUint8Array(encoder), { binary: true })

  // Send awareness states
  const awarenessStates = doc.awareness.getStates()
  if (awarenessStates.size > 0) {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, messageAwareness)
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())))
    ws.send(encoding.toUint8Array(encoder), { binary: true })
  }

  ws.on('message', (message: Buffer) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(message))
      const messageType = decoding.readVarUint(decoder)
      if (messageType === messageSync) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, messageSync)
        syncProtocol.readSyncMessage(decoder, encoder, doc!, ws)
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder), { binary: true })
        }
      } else if (messageType === messageAwareness) {
        awarenessProtocol.applyAwarenessUpdate(doc!.awareness, decoding.readVarUint8Array(decoder), ws)
      }
    } catch (err) {
      console.error('[Yjs WS message error]', err)
    }
  })

  ws.on('close', () => {
    if (doc) {
      const clientIds = doc.conns.get(ws)
      doc.conns.delete(ws)
      if (clientIds) {
        clientIds.forEach(clientId => {
          awarenessProtocol.removeAwarenessStates(doc!.awareness, [clientId], ws)
        })
      }
      if (doc.conns.size === 0) {
        sharedDocs.delete(noteId)
      }
    }
  })
}
