#!/usr/bin/env node

import * as fs from 'fs'

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { finalizeEvent } from 'nostr-tools/pure'
import { Relay, useWebSocketImplementation } from 'nostr-tools/relay'
import { hexToBytes } from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from 'nostr-tools/nip19'

import WebSocket from 'ws'

useWebSocketImplementation(WebSocket)

const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf8"))
const skHex = credentials.nostr_sk

const doWitnessNostr = async (witnessEventVerificationHash) => {
  const sk = hexToBytes(skHex)
  const pk = getPublicKey(sk)
  const npub = nip19.npubEncode(pk)
  console.log(`https://snort.social/${npub}`)

  let event = finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: witnessEventVerificationHash,
  }, sk)
  const url = 'wss://relay.damus.io'
  const relay = await Relay.connect(url)
  console.log(`connected to ${relay.url}`)

  const waitForEvent = async (relay, pk) => {
    return new Promise((resolve) => {
      relay.subscribe([
        {
          kinds: [1],
          authors: [pk],
        },
      ], {
        onevent(event) {
          resolve(event); // Resolve the promise when the event is received
        }
      });
    });
  }
  await relay.publish(event)
  const publishEvent = await waitForEvent(relay, pk);
  relay.close()
  const nevent = nip19.neventEncode(publishEvent)
  console.log(`got event https://snort.social/${nevent}`)
  return [npub, nevent]
}

export {
  doWitnessNostr,
}
