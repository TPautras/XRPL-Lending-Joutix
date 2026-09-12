import { Client } from 'xrpl'
import { NETWORK } from './env.js'

let client: Client | undefined

export async function getClient(): Promise<Client> {
  if (client?.isConnected()) return client
  client = new Client(NETWORK.wss)
  await client.connect()
  return client
}

export async function disconnectClient(): Promise<void> {
  if (client?.isConnected()) await client.disconnect()
}
