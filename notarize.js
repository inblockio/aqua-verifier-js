#!/usr/bin/env node

// import * as fs from 'fs'
// import * as ethers from 'ethers'
// import minimist from 'minimist'
// import * as main from './index.js'

const opts = {
  // This is required so that -v is position independent.
  boolean: ["v", "sign-metamask", "witness-eth"],
}

const fs = require("fs")
const argv = require("minimist")(process.argv.slice(2), opts)
// utilities for signing and witnessing
const ethers = require("ethers")
const http = require("http")
const fetch = require("node-fetch")
const main = require("./index")

const filename = argv._[0]
const signMetamask = argv["sign-metamask"]
const enableWitnessEth = argv["witness-eth"]

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

const witnessMetamaskHtml = `
<html>
  <script>
const witnessNetwork = "WITNESSNETWORK"
const smart_contract_address = "SMARTCONTRACTADDRESS"
const witness_event_verification_hash = "WITNESSEVENTVERIFICATIONHASH"
const localServerUrl= window.location.href;
const ethChainIdMap = {
  'mainnet': '0x1',
  'ropsten': '0x3',
  'rinkeby': '0x4',
  'goerli': '0x5',
  'kotti': '0x6',
  'kovan': '0x42',
}
const doWitness = async () => {
  const chainId = await window.ethereum.request({ method: 'eth_chainId' })
  const requestedChainId = ethChainIdMap[witnessNetwork]
  if (requestedChainId !== chainId) {
    console.log(requestedChainId, chainId)
    // Switch network if the Wallet network does not match DA
    // requested network.
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{
        chainId: requestedChainId,
      }],
    })
  }
  // Now we do the actual witness process
  const wallet_address = window.ethereum.selectedAddress
  const params = [
    {
      from: wallet_address,
      to: smart_contract_address,
      // gas and gasPrice are optional values which are
      // automatically set by MetaMask.
      // gas: '0x7cc0', // 30400
      // gasPrice: '0x328400000',
      data: '0x9cef4ea1' + witness_event_verification_hash,
    },
  ]
  const transaction_hash = await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: params,
  })
  document.getElementById("transaction_hash").innerHTML = \`Transaction hash of the witness network: \${transaction_hash} (you may close this tab)\`
  await fetch(localServerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({transaction_hash, wallet_address})
  })
}
if (window.ethereum && window.ethereum.isMetaMask) {
  if (window.ethereum.isConnected() && window.ethereum.selectedAddress) {
    doWitness()
  } else {
    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(doWitness)
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
  <div id="transaction_hash"></div>
</body>
</html>
`

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const commonPrepareListener = (htmlContent) => {
  let output = "{}"
  const requestListener = async (req, res) => {
    if (req.method == "POST") {
      let data = ""
      req.on("data", (chunk) => {
        data += chunk
      })
      await new Promise((resolve) => {
        req.on("end", resolve)
      })
      output = data
      res.writeHead(200)
      res.end()
    } else {
      if (req.url === "/result") {
        res.writeHead(200)
        res.end(output)
        return
      }
      res.setHeader("Content-Type", "text/html")
      res.writeHead(200)
      res.end(htmlContent)
    }
  }
  return requestListener
}

const doSignMetamask = async (verificationHash) => {
  const messageToBeSigned =
    "I sign the following page verification_hash: [0x" + verificationHash + "]"
  const html = signMetamaskHtml.replace("MESSAGETOBESIGNED", messageToBeSigned)
  const requestListener = commonPrepareListener(html)
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
        signature
      )
      console.log(`The signature has been retrieved: ${signature}`)
      server.close()
      return [signature, walletAddress, publicKey]
    }
    console.log("Waiting for the signature...")
    await sleep(5000)
  }
}

const doWitnessMetamask = async (
  witnessEventVerificationHash,
  witnessNetwork,
  smartContractAddress
) => {
  const html = witnessMetamaskHtml
    .replace("WITNESSNETWORK", witnessNetwork)
    .replace("SMARTCONTRACTADDRESS", smartContractAddress)
    .replace("WITNESSEVENTVERIFICATIONHASH", witnessEventVerificationHash)
  const requestListener = commonPrepareListener(html)
  const server = http.createServer(requestListener)
  server.listen(port, host, () => {
    console.log(`Server is running on ${serverUrl}`)
  })
  let response, content
  while (true) {
    response = await fetch(serverUrl + "/result")
    content = await response.json()
    if (content.transaction_hash) {
      const transactionHash = content.transaction_hash
      const walletAddress = content.wallet_address
      console.log(`The witness tx hash has been retrieved: ${transactionHash}`)
      server.close()
      return [transactionHash, walletAddress]
    }
    console.log("Waiting for the witness...")
    await sleep(10000)
  }
}

const prepareWitness = async (verificationHash, domainId) => {
  const merkle_root = main.getHashSum(verificationHash + verificationHash)
  const witness_network = "goerli"
  const smart_contract_address = "0x45f59310ADD88E6d23ca58A0Fa7A55BEE6d2a611"
  const domain_snapshot_genesis_hash =
    "305ca37488e0d1e20535f08f073290c564040f6574a84ab73fd5d4c6def175bc02260585bae9f6fc4a584a8367881ef5257c364692ff07378b6caa28d1450d9e" // TODO
  const witness_event_verification_hash = main.getHashSum(
    domain_snapshot_genesis_hash + merkle_root
  )

  const [transactionHash, walletAddress] = await doWitnessMetamask(
    witness_event_verification_hash,
    witness_network,
    smart_contract_address
  )
  const witness_hash = main.getHashSum(
    domain_snapshot_genesis_hash +
      merkle_root +
      witness_network +
      transactionHash
  )
  const witness = {
    witness_event_id: "0",
    domain_id: domainId,
    domain_snapshot_title:
      `Data Accounting:DomainSnapshot:${domain_snapshot_genesis_hash}`,
    witness_hash,
    domain_snapshot_genesis_hash,
    merkle_root,
    witness_event_verification_hash,
    witness_network,
    smart_contract_address,
    witness_event_transaction_hash: transactionHash,
    sender_account_address: walletAddress,
    source: "default",
    structured_merkle_proof: [
      {
        witness_event_id: "0",
        depth: "0",
        left_leaf: verificationHash,
        right_leaf: verificationHash,
        successor: merkle_root,
      },
    ],
  }
  return witness
}

const createNewMetaData = () => {
  return {
    pages: [{ revisions: {} }],
    siteInfo: {
      sitename: "Personal Knowledge Container",
      dbname: "my_wiki",
      base: "http://localhost:9352/index.php/Main_Page",
      generator: "MediaWiki 1.37.1",
      case: "first-letter",
      namespaces: {
        0: {
          case: true,
          title: "",
        },
      },
    },
  }
}

const getFileTimestamp = (filename) => {
  const fileStat = fs.statSync(filename)
  // Last modified time
  const mtime = JSON.stringify(fileStat.mtime)
  const timestamp = main.formatMwTimestamp(mtime.slice(1, mtime.indexOf(".")))
  return timestamp
}

const getWallet = (mnemonic) => {
  const wallet = ethers.Wallet.fromPhrase(mnemonic)
  const walletAddress = wallet.address.toLowerCase()
  console.log("Wallet address", walletAddress)
  return [wallet, walletAddress, wallet.publicKey]
}

const createNewRevision = async (previousRevision, timestamp) => {
  let verificationData = {
    verification_context: {
      has_previous_signature: false,
      has_previous_witness: false,
    },
    content: { rev_id: 0 },
  }

  let previousVerificationHash = ""
  let previousSignatureHash = ""
  let previousWitnessHash = ""
  if (previousRevision) {
    previousVerificationHash = previousRevision.metadata.verificationHash
    if (previousRevision.signature && previousRevision.signature.signature) {
      verificationData.verification_context.has_previous_signature = true
      previousSignatureHash = previousRevision.signature.signature_hash
    }
    if (previousRevision.witness) {
      verificationData.verification_context.hast_previous_witness = true
      previousWitnessHash = previousRevision.witness.witness_hash
    }
  }

  const fileContent = fs.readFileSync(filename, "utf8")
  const contentHash = main.getHashSum(fileContent)
  verificationData.content.content = {
    main: fileContent,
  }
  verificationData.content.content_hash = contentHash

  const domainId = "5e5a1ec586" // TODO

  const metadataHash = main.calculateMetadataHash(
    domainId,
    timestamp,
    previousVerificationHash
  )

  const verificationHash = main.calculateVerificationHash(
    contentHash,
    metadataHash,
    previousSignatureHash,
    previousWitnessHash
  )
  verificationData.metadata = {
    domain_id: domainId,
    time_stamp: timestamp,
    previous_verification_hash: previousVerificationHash,
    metadata_hash: metadataHash,
    verification_hash: verificationHash,
  }

  let signature, walletAddress, publicKey
  if (signMetamask) {
    ;[signature, walletAddress, publicKey] = await doSignMetamask(
      verificationHash
    )
  } else {
    const mnemonic = fs.readFileSync("mnemonic.txt", "utf8")
    let wallet
    ;[wallet, walletAddress, publicKey] = getWallet(mnemonic)
    signature = await doSign(wallet, verificationHash)
  }
  const signatureHash = main.calculateSignatureHash(signature, publicKey)

  if (enableWitnessEth) {
    const witness = await prepareWitness(verificationHash, domainId)
    verificationData.witness = witness
  }

  verificationData.signature = {
    signature,
    public_key: publicKey,
    wallet_address: walletAddress,
    signature_hash: signatureHash,
  }
  return verificationData
}

// The main function
;(async function () {
  const metadataFilename = filename + ".aqua.json"
  let metadata
  let revisions
  let lastRevision
  if (fs.existsSync(metadataFilename)) {
    metadata = JSON.parse(fs.readFileSync(metadataFilename))
    revisions = metadata.pages[0].revisions
    const verificationHashes = Object.keys(revisions)
    lastRevision = revisions[verificationHashes[verificationHashes.length - 1]]
  } else {
    metadata = createNewMetaData()
    revisions = {}
    lastRevision = null
  }

  const timestamp = getFileTimestamp(filename)
  if (lastRevision && timestamp == lastRevision.metadata.time_stamp) {
    console.log(
      `The file ${filename} hasn't been modified since it was last notarized`
    )
    process.exit()
  }

  const verificationData = await createNewRevision(lastRevision, timestamp)
  const verificationHash = verificationData.metadata.verification_hash
  revisions[verificationHash] = verificationData
  console.log(`Writing new revision ${verificationHash}`)

  fs.writeFileSync(metadataFilename, JSON.stringify(metadata), "utf8")
})()
