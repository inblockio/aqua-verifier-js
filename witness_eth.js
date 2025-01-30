import * as ethers from "ethers"
import * as http from "http"

const port = 8420
const host = "localhost"
const serverUrl = `http://${host}:${port}`

const witnessMetamaskHtml = `
<html>
  <script type="module">
const witnessNetwork = "WITNESSNETWORK"
const smart_contract_address = "SMARTCONTRACTADDRESS"
const witness_event_verification_hash = "WITNESSEVENTVERIFICATIONHASH"
const localServerUrl= window.location.href;
const ethChainIdMap = {
  'mainnet': '0x1',
  'sepolia': '0xaa36a7',
  'holesky': '0x4268',
}
const doWitness = async (wallet_address) => {
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
  await window.ethereum.enable()
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
  console.log(accounts)
  await doWitness(accounts[0])
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

const witnessMetamask = async (
  witnessEventVerificationHash,
  witnessNetwork,
  smartContractAddress,
) => {
  console.log("Witness event tx hash: ", witnessEventVerificationHash)
  const html = witnessMetamaskHtml
    .replace("WITNESSNETWORK", witnessNetwork)
    .replace("SMARTCONTRACTADDRESS", smartContractAddress)
    .replace("WITNESSEVENTVERIFICATIONHASH", witnessEventVerificationHash.replace(/^0x/, ""))
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

export const witnessCli = async (walletPrivateKey, witness_event_verification_hash, smart_contract_address, ethNetwork, providerUrl) => {
  try {
    // const provider = new ethers.JsonRpcProvider(providerUrl);
    const provider = ethers.getDefaultProvider(ethNetwork)

    // Create a wallet from private key
    const wallet = new ethers.Wallet(walletPrivateKey, provider);
    const sender = wallet.address;

    console.log(`Using wallet: ${sender}`);

    // Validate witness hash format
    if (!witness_event_verification_hash.startsWith("0x")) {
      throw new Error("Invalid witness verification hash: must start with '0x'");
    }

    const tx = {
      from: sender,
      to: smart_contract_address,
      data: "0x9cef4ea1" + witness_event_verification_hash.slice(2),
    };

    // Get sender balance
    const balance = await provider.getBalance(sender);
    const balanceInEth = ethers.formatEther(balance);
    console.log(`Sender Balance: ${balanceInEth} ETH`);

    // Estimate gas
    const estimatedGas = await provider.estimateGas(tx);
    console.log(`Estimated Gas: ${estimatedGas.toString()} units`);

    // Get gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    console.log(`Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);

    // Calculate total gas fee
    const gasCost = estimatedGas * gasPrice;
    const gasCostInEth = ethers.formatEther(gasCost);
    console.log(`Estimated Gas Fee: ${gasCostInEth} ETH`);

    // Check if sender has enough balance
    if (balance < gasCost) {
      throw new Error("Insufficient balance for gas fee.");
    }

    // Sign and send transaction
    const signedTx = await wallet.sendTransaction({
      ...tx,
      gasLimit: estimatedGas,
      gasPrice: gasPrice
    });

    console.log(`Transaction sent! Hash: ${signedTx.hash}`);

    return { error: null, transactionHash: signedTx.hash };

  } catch (error) {
    console.error("Error sending transaction:", error);
    return { error: error.message };
  }
};


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
  const mrSans0x = expectedMR.slice(0, 2) === "0x" ? expectedMR.slice(2) : expectedMR
  return `${actual === mrSans0x}`
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

export { commonPrepareListener, witnessMetamask, verify }
