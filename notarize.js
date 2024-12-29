#!/usr/bin/env node

import * as fs from "fs"
import { randomBytes } from 'crypto'

import * as ethers from "ethers"
import minimist from "minimist"
import * as http from "http"
import { MerkleTree } from "merkletreejs"

import * as main from "./index.js"
import * as formatter from "./formatter.js"

import * as did from "./did.js"
// Witness support for nostr network
import * as witnessNostr from "./witness_nostr.js"
import * as witnessEth from "./witness_eth.js"
import * as witnessTsa from "./witness_tsa.js"

const opts = {
  // This is required so that -v is position independent.
  boolean: ["v", "witness-eth", "witness-nostr", "witness-tsa", "scalar", "content"],
  string: ["sign", "link"]
}

const usage = () => {
  console.log(`Usage:
notarize.js [OPTIONS] <filename>
which generates filename.aqua.json

Options:
  --sign [cli|metamask|did]
    Sign with either of:
    1. the Ethereum seed phrase provided in mnemonic.txt
    2. MetaMask
    3. DID key
  --witness-eth      Witness to Ethereum on-chain with MetaMask
  --witness-nostr    Witness to Nostr network
  --witness-tsa      Witness to TSA DigiCert
  --link <filename.aqua.json>
    Add a link to an AQUA chain as a dependency
  --scalar
    Use this flag to use a more lightweight, "scalar" aquafication
  --content
    Use this flag to include the content file instead of just its hash and name
`)
}

const argv = minimist(process.argv.slice(2), opts)
const filename = argv._[0]

if (!filename) {
  formatter.log_red("ERROR: You must specify a file")
  usage()
  process.exit(1)
}

const signMethod = argv["sign"]
const enableSignature = !!signMethod
const enableWitnessEth = argv["witness-eth"]
const enableWitnessNostr = argv["witness-nostr"]
const enableWitnessTsa = argv["witness-tsa"]
const enableScalar = argv["scalar"]
const enableWitness = enableWitnessEth || enableWitnessNostr || enableWitnessTsa
const enableContent = argv["content"]
const linkURI = argv["link"]
const enableLink = !!linkURI

const port = 8420
const host = "localhost"
const serverUrl = `http://${host}:${port}`

const doSign = async (wallet, verificationHash) => {
  const message =
    "I sign the following page verification_hash: [0x" + verificationHash + "]"
  const signature = await wallet.signMessage(message)
  return signature
}

const signMetamaskHtml = `
<html>
  <script>
const message = "MESSAGETOBESIGNED";
const localServerUrl= window.location.href;
const doSignProcess = async () => {
  const wallet_address = window.ethereum.selectedAddress
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, window.ethereum.selectedAddress],
  })
  document.getElementById("signature").innerHTML = \`Signature of your file: \${signature} (you may close this tab)\`
  await fetch(localServerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({signature, wallet_address})
  })
}
if (window.ethereum && window.ethereum.isMetaMask) {
  if (window.ethereum.isConnected() && window.ethereum.selectedAddress) {
    doSignProcess()
  } else {
    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(doSignProcess)
      .catch((error) => {
        console.error(error);
        alert(error.message);
      })
  }
} else {
  alert("Metamask not detected")
}
  </script>
<body>
    <div id="signature"></div>
</body>
</html>
`

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const doSignMetamask = async (verificationHash) => {
  const messageToBeSigned =
    "I sign the following page verification_hash: [0x" + verificationHash + "]"
  const html = signMetamaskHtml.replace("MESSAGETOBESIGNED", messageToBeSigned)
  const requestListener = witnessEth.commonPrepareListener(html)
  const server = http.createServer(requestListener)
  server.listen(port, host, () => {
    console.log(`Server is running on ${serverUrl}`)
  })
  let response, content
  while (true) {
    response = await fetch(serverUrl + "/result")
    content = await response.json()
    if (content.signature) {
      const signature = content.signature
      const walletAddress = content.wallet_address
      const publicKey = ethers.SigningKey.recoverPublicKey(
        ethers.hashMessage(messageToBeSigned),
        signature,
      )
      console.log(`The signature has been retrieved: ${signature}`)
      server.close()
      return [signature, walletAddress, publicKey]
    }
    console.log("Waiting for the signature...")
    await sleep(5000)
  }
}

const prepareNonce = () => {
  const seed = randomBytes(32)
  return new Buffer.from(seed).toString("base64url")
}

const prepareWitness = async (verificationHash) => {
  const merkle_root = verificationHash
  let witness_network,
    smart_contract_address,
    transactionHash,
    publisher,
    witnessTimestamp
  if (enableWitnessNostr) {
    // publisher is a public key used for nostr
    // transaction hash is an event identifier for nostr
    ;[transactionHash, publisher, witnessTimestamp] = await witnessNostr.witness(merkle_root)
    witness_network = "nostr"
    smart_contract_address = "N/A"
  } else if (enableWitnessTsa) {
    const tsaUrl = "http://timestamp.digicert.com" // DigiCert's TSA URL
      ;[transactionHash, publisher, witnessTimestamp] = await witnessTsa.witness(merkle_root, tsaUrl)
    witness_network = "TSA_RFC3161"
    smart_contract_address = tsaUrl
  } else {
    witness_network = "sepolia"
    smart_contract_address = "0x45f59310ADD88E6d23ca58A0Fa7A55BEE6d2a611"
      ;[transactionHash, publisher] = await witnessEth.witnessMetamask(
        merkle_root,
        witness_network,
        smart_contract_address,
      )
    witnessTimestamp = Date.now() / 1000
  }
  const witness = {
    witness_merkle_root: merkle_root,
    witness_timestamp: witnessTimestamp,
    // Where is it stored: ChainID for ethereum, btc, nostr
    witness_network,
    // Required for the the publishing of the hash
    witness_smart_contract_address: smart_contract_address,
    // Transaction hash to locate the verification hash
    witness_transaction_hash: transactionHash,
    // Publisher / Identifier for publisher
    witness_sender_account_address: publisher,
    // Optional for aggregated witness hashes
    witness_merkle_proof: [
      {
        depth: "0",
        left_leaf: verificationHash,
        right_leaf: null,
        successor: merkle_root,
      },
    ],
  }
  return witness
}

const createNewMetaData = () => {
  return { revisions: {} }
}

function formatMwTimestamp(ts) {
  // Format timestamp into the timestamp format found in Mediawiki outputs
  return ts
    .replace(/-/g, "")
    .replace(/:/g, "")
    .replace("T", "")
    .replace("Z", "")
}

const getFileTimestamp = (filename) => {
  const fileStat = fs.statSync(filename)
  // Last modified time
  const mtime = JSON.stringify(fileStat.mtime)
  const timestamp = formatMwTimestamp(mtime.slice(1, mtime.indexOf(".")))
  return timestamp
}

const getWallet = (mnemonic) => {
  // Always trim the last new line
  const wallet = ethers.Wallet.fromPhrase(mnemonic.trim())
  const walletAddress = wallet.address.toLowerCase()
  console.log("Wallet address", walletAddress)
  return [wallet, walletAddress, wallet.publicKey]
}

const readCredentials = () => {
  return JSON.parse(
    fs.readFileSync("credentials.json", "utf8"),
  )
}

const prepareSignature = async (previousVerificationHash) => {
  let signature, walletAddress, publicKey, signature_type
  switch (signMethod) {
    case "metamask":
      ;[signature, walletAddress, publicKey] = await doSignMetamask(
        previousVerificationHash,
      )
      signature_type = "ethereum:eip-191"
      break
    case "cli":
      try {
        const credentials = readCredentials()
        let wallet
          ;[wallet, walletAddress, publicKey] = getWallet(credentials.mnemonic)
        signature = await doSign(wallet, previousVerificationHash)
      } catch (error) {
        console.error("Failed to read mnemonic:", error)
        process.exit(1)
      }
      signature_type = "ethereum:eip-191"
      break
    case "did":
      const credentials = readCredentials()
      const { jws, key } = await did.signature.sign(previousVerificationHash, Buffer.from(credentials["did:key"], "hex"))
      signature = jws
      walletAddress = key
      publicKey = key
      signature_type = "did:key"
      break
  }
  return {
    signature,
    signature_public_key: publicKey,
    signature_wallet_address: walletAddress,
    signature_type,
  }
}

const getLatestVH = (uri) => {
  const metadata = JSON.parse(fs.readFileSync(uri))
  const verificationHashes = Object.keys(metadata.revisions)
  return verificationHashes[verificationHashes.length - 1]
}

const createNewRevision = async (
  previousVerificationHash,
  timestamp,
  revision_type,
  enableScalar,
) => {
  let verificationData = {
    previous_verification_hash: previousVerificationHash,
    nonce: prepareNonce(),
    domain_id: "5e5a1ec586", // TODO
    local_timestamp: timestamp,
    revision_type,
  }

  switch (revision_type) {
    case "content":
      const fileContent = fs.readFileSync(filename, "utf8")
      verificationData["content"] = fileContent
      break
    case "file_hash":
      const fileHash = main.getFileHashSum(filename)
      verificationData["file_hash"] = fileHash
      verificationData["file_name"] = filename
      break
    case "signature":
      const sigData = await prepareSignature(previousVerificationHash)
      verificationData = { ...verificationData, ...sigData }
      break
    case "witness":
      const witness = await prepareWitness(previousVerificationHash)
      verificationData = { ...verificationData, ...witness }
      verificationData.witness_merkle_proof = JSON.stringify(
        verificationData.witness_merkle_proof,
      )
      break
    case "link":
      const linkVH = getLatestVH(linkURI)
      const linkData = {
        "link_type": "aqua",
        "link_require_indepth_verification": true,
        "link_verification_hash": linkVH,
        "link_uri": linkURI,
      }
      verificationData = { ...verificationData, ...linkData }
  }

  if (enableScalar) {
    // A simpler version of revision -- scalar
    const scalarData = JSON.stringify(verificationData)
    return {
      verification_hash: "0x" + main.getHashSum(scalarData),
      data: scalarData,
    }
  }

  // Merklelize the dictionary
  const leaves = main.dict2Leaves(verificationData)
  const tree = new MerkleTree(leaves, main.getHashSum)
  verificationData.leaves = leaves
  return {
    verification_hash: tree.getHexRoot(),
    data: verificationData,
  }
}

  // The main function
  ; (async function() {
    const metadataFilename = filename + ".aqua.json"
    // const timestamp = getFileTimestamp(filename)
    // We use "now" instead of the modified time of the file
    const now = new Date().toISOString()
    const timestamp = formatMwTimestamp(now.slice(0, now.indexOf(".")))
    let metadata, revisions
    if (!fs.existsSync(metadataFilename)) {
      metadata = createNewMetaData()
      revisions = metadata.revisions
      const revisionType = enableContent ? "content" : "file_hash"
      const genesis = await createNewRevision("", timestamp, revisionType, false)
      revisions[genesis.verification_hash] = genesis.data
      console.log(`Writing new revision ${genesis.verification_hash} to ${filename}.aqua.json`)
      fs.writeFileSync(metadataFilename, JSON.stringify(metadata, null, 2), "utf8")
      return
    }

    // TODO: replace this with checking if the signature already exists in the last revision
    //if (lastRevision && timestamp == lastRevision.metadata.local_timestamp) {
    //  console.log(
    //    `The file ${filename} hasn't been modified since it was last notarized`
    //  )
    //  process.exit()
    //}

    metadata = JSON.parse(fs.readFileSync(metadataFilename))
    revisions = metadata.revisions
    const verificationHashes = Object.keys(revisions)
    const lastRevisionHash = verificationHashes[verificationHashes.length - 1]

    if (enableSignature && enableWitness) {
      formatter.log_red("ERROR: you cannot sign & witness at the same time")
      process.exit(1)
    }

    let revisionType = "file_hash"
    if (enableSignature) {
      revisionType = "signature"
    } else if (enableWitness) {
      revisionType = "witness"
    } else if (enableLink) {
      revisionType = "link"
    } else if (enableContent) {
      revisionType = "content"
    }

    const verificationData = await createNewRevision(
      lastRevisionHash,
      timestamp,
      revisionType,
      enableScalar,
    )
    const verificationHash = verificationData.verification_hash
    revisions[verificationHash] = verificationData.data
    console.log(`Writing new revision ${verificationHash} to ${filename}.aqua.json`)

    fs.writeFileSync(metadataFilename, JSON.stringify(metadata, null, 2), "utf8")
  })()
