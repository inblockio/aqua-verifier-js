// import { randomBytes } from 'crypto'

import { DID } from 'dids'
import { Ed25519Provider } from 'key-did-provider-ed25519'
import * as KeyResolver from 'key-did-resolver'

const signature = {
  verify: async (jws, key, hash) => {
    const expected = {message: `I sign the following page verification_hash: [0x${hash}]`}
    try {
      const resolver = KeyResolver.getResolver()
      const result = await (new DID({ resolver })).verifyJWS(jws)
      if (expected.message !== result.payload.message) return false
      if (key !== result.kid.split("#")[0]) return false
    } catch (e) {
      console.log(e)
      return false
    }
    return true
  },
  sign: async (verificationHash, privateKey) => {
    const payload = {message: `I sign the following page verification_hash: [0x${verificationHash}]`}

    // const seed = randomBytes(32)
    // console.log(new Buffer.from(seed).toString("hex"))
    const provider = new Ed25519Provider(privateKey)
    const resolver = KeyResolver.getResolver()
    const did = new DID({ provider, resolver })
    await did.authenticate()

    const jws = await did.createJWS(payload)
    return { jws, key: did.id }
  }
}

export {
  signature
}
