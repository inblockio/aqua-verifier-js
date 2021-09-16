const https = require( 'https' )

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

async function checkEtherScan(witnessNetwork, txHash, witnessVerificationHash) {
  try {
    promise = new Promise((resolve, reject) => {
      const witnessURL = witnessNetworkMap[witnessNetwork]
      https.get(`${witnessURL}/${txHash}`, (resp) => {
        let chunks_of_data = [];

        resp.on('data', (fragments) => {
          chunks_of_data.push(fragments);
        });

        resp.on('end', () => {
          let response_body = Buffer.concat(chunks_of_data);
          const outArray = re.exec(response_body.toString())
          let status = ''
          if (!!outArray) {
            let result = outArray[0].split('0x9cef4ea1')[1]
            result = result.slice(0, 128)
            //console.log(result == witnessVerificationHash)
            status = `${result == witnessVerificationHash}`
          } else {
            status = 'Online lookup failed'
          }
          resolve(status)
        })
        resp.on('error', reject)
      }).on('error', (error) => {
        reject(error.message)
      })
    })
    const out = await promise
    // To avoid IP banning by etherscan.io
    await sleep(300)
    return out
  }
	catch(e) {
		// if the Promise is rejected
    return e
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
  checkEtherScan: checkEtherScan
}
