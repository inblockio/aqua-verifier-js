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
  boolean: ["v", "witness-eth", "witness-nostr", "witness-tsa", "scalar", "content", "rm"],
  string: ["sign", "link", "witness"]
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
  --witness [eth|nostr|tsa]
    Witness with either of:
    1. Ethereum on-chain with MetaMask
    2. Nostr network
    3. TSA DigiCert
  --link <filename.aqua.json>
    Add a link to an AQUA chain as a dependency
  --scalar
    Use this flag to use a more lightweight, "scalar" aquafication
  --content
    Use this flag to include the content file instead of just its hash and name
  --rm
    Remove the most recent revision of the AQUA file
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
const enableScalar = argv["scalar"]
const witnessMethod = argv["witness"]
const enableWitness = !!witnessMethod
const enableContent = argv["content"]
const enableRemoveRevision = argv["rm"]
const linkURIs = argv["link"]
const enableLink = !!linkURIs

const port = 8420
const host = "localhost"
const serverUrl = `http://${host}:${port}`

const doSign = async (wallet, verificationHash) => {
  const message =
    "I sign this revision: [" + verificationHash + "]"
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
    "I sign this revision: [" + verificationHash + "]"
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
  switch (witnessMethod) {
    case "nostr":
      // publisher is a public key used for nostr
      // transaction hash is an event identifier for nostr
      ;[transactionHash, publisher, witnessTimestamp] = await witnessNostr.witness(merkle_root)
      witness_network = "nostr"
      smart_contract_address = "N/A"
      break
    case "tsa":
      const tsaUrl = "http://timestamp.digicert.com" // DigiCert's TSA URL
        ;[transactionHash, publisher, witnessTimestamp] = await witnessTsa.witness(merkle_root, tsaUrl)
      witness_network = "TSA_RFC3161"
      smart_contract_address = tsaUrl
      break
    case "eth":
      witness_network = "sepolia"
      smart_contract_address = "0x45f59310ADD88E6d23ca58A0Fa7A55BEE6d2a611"
        ;[transactionHash, publisher] = await witnessEth.witnessMetamask(
          merkle_root,
          witness_network,
          smart_contract_address,
        )
      witnessTimestamp = Math.floor(Date.now() / 1000)
      break
    default:
      console.error(`Unknown witness method: ${witnessMethod}`)
      process.exit(1)
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
    // witness_merkle_proof: [
    //   {
    //     depth: "0",
    //     left_leaf: verificationHash,
    //     right_leaf: null,
    //     successor: merkle_root,
    //   },
    // ],
  }
  return witness
}

const createNewAquaObject = () => {
  return { revisions: {}, file_index: {} }
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
  const aquaObject = JSON.parse(fs.readFileSync(uri))
  const verificationHashes = Object.keys(aquaObject.revisions)
  return verificationHashes[verificationHashes.length - 1]
}

const serializeAquaObject = (metadataFilename, aquaObject) => {
  // fs.writeFileSync(metadataFilename, JSON.stringify(aquaObject, null, 2), "utf8")
  //
  try {
    // First convert the object to a JSON string
    const jsonString = JSON.stringify(aquaObject, null, 2);

    // Verify we got a valid string
    if (typeof jsonString !== 'string') {
      throw new Error('Failed to serialize object to JSON string');
    }

    // Write the string to file
    fs.writeFileSync(metadataFilename, jsonString, "utf8");
  } catch (error) {
    console.error('Error serializing object:', error);
    throw error; // Re-throw to handle it in the calling code
  }
}

const checkFileHashAlreadyNotarized = (fileHash, aquaObject) => {
  // Check if this file hash already exists in any revision
  const existingRevision = Object.values(aquaObject.revisions).find(revision =>
    (revision.file_hash && revision.file_hash === fileHash)
  );

  if (existingRevision) {
    console.log(`Abort. No new revision created.\n \nA new content revision is obsolete as a content revision with the same file hash (${fileHash}) already exists. `);
    process.exit(1)
  }
}

const maybeUpdateFileIndex = (aquaObject, verificationData, revisionType) => {
  // Update file_index if revision_type is file
  if (revisionType === "file") {
    const fileHash = verificationData.data.file_hash
    if (enableContent) {
      const verificationHash = verificationData.verification_hash
      aquaObject.file_index[fileHash] = `/aqua/${verificationHash}/${filename}`
    } else {
      aquaObject.file_index[fileHash] = filename
    }
  }
}

const createNewRevision = async (
  previousVerificationHash,
  timestamp,
  revision_type,
  enableScalar,
  aquaObject,
) => {
  let verificationData = {
    previous_verification_hash: previousVerificationHash,
    nonce: prepareNonce(),
    local_timestamp: timestamp,
    revision_type,
  }

  switch (revision_type) {
    case "file":
      const fileContent = fs.readFileSync(filename)
      const fileHash = main.getHashSum(fileContent)
      checkFileHashAlreadyNotarized(fileHash, aquaObject)
      if (enableContent) {
        verificationData["content"] = fileContent.toString("utf8")
      }
      verificationData["file_hash"] = fileHash
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
      const linkURIsArray = linkURIs.split(",")
      const linkVHs = linkURIsArray.map(getLatestVH)
      const linkData = {
        "link_type": "aqua",
        "link_require_indepth_verification": true,
        "link_verification_hashes": linkVHs,
        "link_uris": linkURIsArray,
      }
      verificationData = { ...verificationData, ...linkData }
  }

  if (enableScalar) {
    // A simpler version of revision -- scalar
    const scalarData = verificationData; //JSON.stringify(verificationData)
    return {
      verification_hash: "0x" + main.getHashSum(JSON.stringify(verificationData)),
      data: scalarData,
    }
  }

  // Merklelize the dictionary
  const leaves = main.dict2Leaves(verificationData);
  const tree = new MerkleTree(leaves, main.getHashSum, {
    duplicateOdd: false,
  });

  verificationData.leaves = leaves
  return {
    verification_hash: tree.getHexRoot(),
    data: verificationData,
  }
}

  // The main function
  ; (async function () {
    const metadataFilename = filename + ".aqua.json"
    // const timestamp = getFileTimestamp(filename)
    // We use "now" instead of the modified time of the file
    const now = new Date().toISOString()
    const timestamp = formatMwTimestamp(now.slice(0, now.indexOf(".")))
    let aquaObject, revisions
    if (!fs.existsSync(metadataFilename)) {
      aquaObject = createNewAquaObject()
      revisions = aquaObject.revisions
      const revisionType = "file"
      const genesis = await createNewRevision("", timestamp, revisionType, false, aquaObject)
      if (enableRemoveRevision) {
        // Don't serialize if you do --rm during genesis creation
        console.log("There is nothing delete.")
        return
      }
      revisions[genesis.verification_hash] = genesis.data
      console.log(`Writing new revision ${genesis.verification_hash} to ${filename}.aqua.json`)
      maybeUpdateFileIndex(aquaObject, genesis, revisionType)
      serializeAquaObject(metadataFilename, aquaObject)
      return
    }

    aquaObject = JSON.parse(fs.readFileSync(metadataFilename))
    revisions = aquaObject.revisions
    const verificationHashes = Object.keys(revisions)
    const lastRevisionHash = verificationHashes[verificationHashes.length - 1]

    if (enableRemoveRevision) {
      const lastRevision = aquaObject.revisions[lastRevisionHash]
      if (lastRevision.revision_type === "file") {
        delete aquaObject.file_index[lastRevision.file_hash]
      }
      delete aquaObject.revisions[lastRevisionHash]
      console.log(`Most recent revision ${lastRevisionHash} has been removed`)
      if (Object.keys(aquaObject.revisions).length === 0) {
        // If there are no revisions left, delete the .aqua.json file
        try {
          fs.unlinkSync(metadataFilename)
          console.log(`${metadataFilename} has been deleted because there are no revisions left.`)
          // Since we've deleted the file, there's no need to return here; the script should end.
        } catch (err) {
          console.error(`Failed to delete ${metadataFilename}:`, err)
        }
      } else {
        serializeAquaObject(metadataFilename, aquaObject)
      }
      return
    }

    if (enableSignature && enableWitness) {
      formatter.log_red("ERROR: you cannot sign & witness at the same time")
      process.exit(1)
    }

    let revisionType = "file"
    if (enableSignature) {
      revisionType = "signature"
    } else if (enableWitness) {
      revisionType = "witness"
    } else if (enableLink) {
      revisionType = "link"
    }    

    const verificationData = await createNewRevision(
      lastRevisionHash,
      timestamp,
      revisionType,
      enableScalar,
      aquaObject,
    )
    const verificationHash = verificationData.verification_hash
    revisions[verificationHash] = verificationData.data
    console.log(`Writing new revision ${verificationHash} to ${filename}.aqua.json`)
    maybeUpdateFileIndex(aquaObject, verificationData, revisionType)
    serializeAquaObject(metadataFilename, aquaObject)
  })()
