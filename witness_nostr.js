import * as fs from 'fs'

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure'
import { finalizeEvent } from 'nostr-tools/pure'
import { Relay, useWebSocketImplementation } from 'nostr-tools/relay'
import { hexToBytes } from '@noble/hashes/utils' // already an installed dependency
import * as nip19 from 'nostr-tools/nip19'

import WebSocket from 'ws'

import { fileURLToPath } from 'url';
import { dirname } from 'path';


useWebSocketImplementation(WebSocket)

const credentials_func = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  return JSON.parse(fs.readFileSync(`${__dirname}/credentials.json`, "utf8"))
}
const credentials = credentials_func()
// const credentials = JSON.parse(fs.readFileSync(`${import.meta.dirname}/credentials.json`, "utf8"))
const skHex = credentials.nostr_sk
const relayUrl = 'wss://relay.damus.io'

const waitForEventAuthor = async (relay, pk) => {
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

const waitForEventId = async (relay, id) => {
  return new Promise((resolve) => {
    relay.subscribe([
      {
        ids: [id],
      },
    ], {
      onevent(event) {
        resolve(event); // Resolve the promise when the event is received
      }
    });
  });
}

const witness = async (witnessEventVerificationHash) => {
  const sk = hexToBytes(skHex)
  const pk = getPublicKey(sk)
  const npub = nip19.npubEncode(pk)
  console.log("npub: ", npub)
  console.log("Witness event verification hash: ", witnessEventVerificationHash)
  console.log(`https://snort.social/${npub}`)

  let event = finalizeEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: witnessEventVerificationHash,
  }, sk)
  const relay = await Relay.connect(relayUrl)
  console.log(`connected to ${relay.url}`)

  await relay.publish(event)
  const publishEvent = await waitForEventAuthor(relay, pk);
  relay.close()
  const nevent = nip19.neventEncode(publishEvent)
  const witnessTimestamp = publishEvent.created_at
  console.log(`got event https://snort.social/${nevent}`)
  return [nevent, npub, witnessTimestamp]
}

const verify = async (transactionHash, expectedMR, expectedTimestamp) => {
  const { type, data } = nip19.decode(transactionHash)
  if (type !== "nevent") {
    return false
  }
  const relay = await Relay.connect(relayUrl)
  const publishEvent = await waitForEventId(relay, data.id)
  relay.close()
  if (expectedTimestamp !== publishEvent.created_at) {
    return false
  }
  const merkleRoot = publishEvent.content
  return merkleRoot === expectedMR
}

export {
  witness,
  verify,
}
