import * as ethers from "ethers"

const port = 8420
const host = "localhost"
const serverUrl = `http://${host}:${port}`

const witnessMetamaskHtml = `
<html>
  <script>
const witnessNetwork = "WITNESSNETWORK"
const smart_contract_address = "SMARTCONTRACTADDRESS"
const witness_event_verification_hash = "WITNESSEVENTVERIFICATIONHASH"
const localServerUrl= window.location.href;
const ethChainIdMap = {
  'mainnet': '0x1',
  'sepolia': '0xaa36a7',
  'holesky': '0x4268',
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

const witnessMetamask = async (
  witnessEventVerificationHash,
  witnessNetwork,
  smartContractAddress,
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

const verify = async (
  ethNetwork,
  transactionHash,
  expectedMR,
  expectedTimestamp,
) => {
  const provider = ethers.getDefaultProvider(ethNetwork)
  // const provider = new ethers.JsonRpcProvider(endpoint)
  const tx = await provider.getTransaction(transactionHash)
  if (!tx) return "NOT FOUND"
  // TODO verify
  // tx.from
  // tx.signature

  // Timestamp checking is disabled because too expensive
  // const block = await tx.getBlock()
  // if (block.timestamp !== expectedTimestamp)
  //   return `TIMESTAMP MISMATCH: ${block.timestamp} vs ${expectedTimestamp}`
  let actual = tx.data.split("0x9cef4ea1")[1]
  actual = actual.slice(0, 128)
  sleep(200)  // just in case so as not to overload the free endpoint
  return `${actual === expectedMR}`
}

async function testVerify() {
  let out = await verify(
    "sepolia",
    // intentionally wrong
    "0x1603cc3501c8b02b5a2a4905ddea3517d7fa58dec228d0e1b600000000000000",
    "5ec55ac90f546a1348417ef0e07f86ed644dfac7b5a33c7437c70feba499f19ae28ca45bb2d7b1cc2a838e6d7d8f36c83511a5696ee323437884d897ceaacc84",
    1720788312,
  )
  console.log(out)
  out = await verify(
    "sepolia",
    "0x1603cc3501c8b02b5a2a4905ddea3517d7fa58dec228d0e1b6f4b552efdd2c74",
    // intentionally wrong
    "stuff",
    1720788312,
  )
  console.log(out)
  out = await verify(
    "sepolia",
    "0x1603cc3501c8b02b5a2a4905ddea3517d7fa58dec228d0e1b6f4b552efdd2c74",
    "5ec55ac90f546a1348417ef0e07f86ed644dfac7b5a33c7437c70feba499f19ae28ca45bb2d7b1cc2a838e6d7d8f36c83511a5696ee323437884d897ceaacc84",
    1720788312,
  )
  console.log(out)
}

// testVerify()

export { witnessMetamask, verify }
