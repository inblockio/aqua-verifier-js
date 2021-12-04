const fetch = require("node-fetch")

const re = /<span id='rawinput'.*<\/span>/

const witnessNetworkMap = {
  'mainnet': 'https://etherscan.io/tx',
  'ropsten': 'https://ropsten.etherscan.io/tx',
  'kovan': 'https://kovan.etherscan.io/tx',
  'rinkeby': 'https://rinkeby.etherscan.io/tx',
  'goerli': 'https://goerli.etherscan.io/tx',
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Checks if the witness verification hash matches the hash timestamped on an
 * Ethereum blockchain, via etherscan.io.
 * Steps:
 * - Determines the etherscan.io witness url from the witness network passed
 *   in.
 * - Does a lookup of a hash from the witness url combined with the transaction
 *   hash.
 * - Returns true if witnessVerificationHash equals the hash value returned
 *   from the previous step, false otherwise.
 * @param {string} witnessNetwork see the keys of witnessNetworkMap for
 *     possible values.
 * @param {string} txHash the Ethereum transaction hash.
 * @param {string} witnessVerificationHash SHA3 verification hash
 * @returns {boolean} whether the hash in the lookup matches witnessVerificationHash
 */
async function checkEtherScan(witnessNetwork, txHash, witnessVerificationHash) {
  try {
    const witnessURL = witnessNetworkMap[witnessNetwork]
    const options = {
      timeout: 10000  // 10 seconds
    }
    const response = await fetch(`${witnessURL}/${txHash}`, options)
    if (!response.ok) {
      return `ERROR HTTP ${response.status} ${response.statusText}`
    }
    const body = await response.text()
    const outArray = re.exec(body)
    let status = ''
    if (!!outArray) {
      let result = outArray[0].split('0x9cef4ea1')[1]
      result = result.slice(0, 128)
      //console.log(result == witnessVerificationHash)
      status = `${result == witnessVerificationHash}`
    } else {
      status = 'Transaction hash not found'
    }
    // To avoid IP banning by etherscan.io
    await sleep(300)
    return status
  }
	catch(e) {
    return e.toString()
	}
}

async function testCheckEtherScan() {
  let out = await checkEtherScan('goerli', 'stuff', '9e518db9cfdcf9854bb7e5097ef15a77e3409c6ed3e26171ec62a075c4ef179a1651560e11b8bdd3e2ed70a1097afd4744b1dbf07c3c68884b1ebaca3026764d')
  console.log(out)
  out = await checkEtherScan('goerli', '0x1b35843949a90869a7f79a132afcda0271799afd766140da1b13ae984beb6a80', 'stuff')
  console.log(out)
  out = await checkEtherScan('goerli', '0x1b35843949a90869a7f79a132afcda0271799afd766140da1b13ae984beb6a80', '9e518db9cfdcf9854bb7e5097ef15a77e3409c6ed3e26171ec62a075c4ef179a1651560e11b8bdd3e2ed70a1097afd4744b1dbf07c3c68884b1ebaca3026764d')
  console.log(out)
}

// testCheckEtherScan()
module.exports = {
  checkEtherScan: checkEtherScan,
  witnessNetworkMap: witnessNetworkMap
}
