#!/usr/bin/env node

// import * as fs from 'fs'
// import * as ethers from 'ethers'
// import minimist from 'minimist'
// import * as main from './index.js'

const opts = {
  // This is required so that -v is position independent.
  boolean: ["v", "sign-metamask"],
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
  const port = 8420
  const host = "localhost"
  const serverUrl = `http://${host}:${port}`
  const messageToBeSigned =
    "I sign the following page verification_hash: [0x" + verificationHash + "]"
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
      const html = signMetamaskHtml.replace(
        "MESSAGETOBESIGNED",
        messageToBeSigned
      )
      res.end(html)
    }
  }
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
      server.close()
      return [signature, walletAddress, publicKey]
    }
    console.log("Waiting for the signature...")
    await sleep(5000)
  }
}

const createNewPage = () => {
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
  let page
  let revisions
  let lastRevision
  if (fs.existsSync(metadataFilename)) {
    page = JSON.parse(fs.readFileSync(metadataFilename))
    revisions = page.pages[0].revisions
    const verificationHashes = Object.keys(revisions)
    lastRevision = revisions[verificationHashes[verificationHashes.length - 1]]
  } else {
    page = createNewPage()
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

  fs.writeFileSync(metadataFilename, JSON.stringify(page), "utf8")
})()
