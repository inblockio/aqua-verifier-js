#!/usr/bin/env node

const http = require( 'http' )
const sha3 = require('js-sha3')

// utilities for verifying signatures
const ethers = require('ethers')

const cES = require('./checkEtherScan.js')

let VERBOSE = undefined

const apiURL = 'http://localhost:9352/rest.php/data_accounting/v1/standard'

// https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
const Reset = "\x1b[0m"
const Dim = "\x1b[2m"
const FgRed = "\x1b[31m"
const FgWhite = "\x1b[37m"
const BgGreen = "\x1b[42m"
const WARN = '⚠️'
const CROSSMARK = '❌'

function log_red(content) {
  console.log(FgRed + content + Reset)
}

function log_dim(content) {
  console.log(Dim + content + Reset)
}

function formatMwTimestamp(ts) {
  // Format timestamp into the timestamp format found in Mediawiki outputs
  return ts.replace(/-/g, '').replace(/:/g, '').replace('T', '').replace('Z', '')
}

function getHashSum(content) {
  if (content === '') {
    return ''
  }
  return sha3.sha3_512(content)
}

function calculateMetadataHash(domainId, timestamp, previousVerificationHash = "") {
    return getHashSum(domainId + timestamp + previousVerificationHash)
}

function calculateSignatureHash(signature, publicKey) {
    return getHashSum(signature + publicKey)
}

function calculateWitnessHash(page_manifest_verification_hash, merkle_root, witness_network, witness_tx_hash) {
    return getHashSum(page_manifest_verification_hash + merkle_root + witness_network + witness_tx_hash)
}

function calculateVerificationHash(contentHash, metadataHash, signature_hash, witness_hash) {
    return getHashSum(contentHash + metadataHash + signature_hash + witness_hash)
}

async function getWitnessHash(witness_event_id) {
  if (witness_event_id === null) {
    return ''
  }
  const witnessResponse = await synchronousGet(`${apiURL}/get_witness_data?var1=${witness_event_id}`)
  if (witnessResponse !== '{"value":""}') {
    witnessData = JSON.parse(witnessResponse)
    witnessHash = calculateWitnessHash(
      witnessData.witness_event_verification_hash,
      witnessData.merkle_root,
      witnessData.witness_network,
      witnessData.witness_event_transaction_hash,
    )
    return witnessHash
  }
  return ''
}

async function verifyWitness(witness_event_id) {
  const witnessResponse = await synchronousGet(`${apiURL}/get_witness_data?var1=${witness_event_id}`)
  if (witnessResponse !== '{"value":""}') {
    witnessData = JSON.parse(witnessResponse)
    actual_witness_event_verification_hash = getHashSum(
      witnessData.page_manifest_verification_hash + witnessData.merkle_root
    )

    console.log(`  Witness event ${witness_event_id} detected`)
    console.log(`    Transaction hash: ${witnessData.witness_event_transaction_hash}`)
    // Do online lookup of transaction hash
    const etherScanResult = await cES.checkEtherScan(
      witnessData.witness_network,
      witnessData.witness_event_transaction_hash,
      actual_witness_event_verification_hash
    )
    const suffix = `${witnessData.witness_network} via etherscan.io`
    if (etherScanResult == 'true') {
      console.log(`    ✅ witness_verification_hash has been verified on ${suffix}`)
    } else if (etherScanResult == 'false') {
      log_red(`    witness_verification_hash does not match on ${suffix}`)
    } else {
      log_red(`    Online lookup failed on ${suffix}`)
      log_red(`    Error code: ${etherScanResult}`)
      log_red(`    Verify manually: ${actual_witness_event_verification_hash}`)
    }
    if (actual_witness_event_verification_hash != witnessData.witness_event_verification_hash) {
      console.log("    Witness event verification hash doesn't match")
      console.log(`    Page manifest verification hash: ${witnessData.page_manifest_verification_hash}`)
      console.log(`    Merkle root: ${witnessData.merkle_root}`)
      console.log(`    Expected: ${witnessData.witness_event_verification_hash}`)
      console.log(`    Actual: ${actual_witness_event_verification_hash}`)
      return 'INCONSISTENT'
    }
    return 'MATCHES'
  }
  return 'NO_WITNESS'
}

async function verifyRevision(revid, prevRevId, previousVerificationHash, contentHash) {
  const response = await synchronousGet(`${apiURL}/verify_page?var1=${revid}`)
  if (response === '[]') {
    console.log('  no verification hash')
    return [null, false]
  }
  let data = JSON.parse(response)

  // TODO do sanity check on domain id
  const domainId = data.domain_id

  const metadataHash = calculateMetadataHash(domainId, data.time_stamp, previousVerificationHash)

  // SIGNATURE DATA HASH CALCULATOR
  let prevSignature = ''
  let prevPublicKey = ''
  let prevWitnessHash = ''
  if (prevRevId !== '') {
    const responsePrevious = await synchronousGet(`${apiURL}/verify_page?var1=${prevRevId}`)
    const dataPrevious = JSON.parse(responsePrevious)
    // TODO just use signature and public key from previous element in the loop inside verifyPage
    // We have to do these ternary operations because sometimes the signature
    // and public key are nulls, not empty strings.
    prevSignature = !!dataPrevious.signature ? dataPrevious.signature: ''
    prevPublicKey = !!dataPrevious.public_key ? dataPrevious.public_key: ''
    prevWitnessHash = await getWitnessHash(dataPrevious.witness_event_id)
  }
  const signatureHash = calculateSignatureHash(prevSignature, prevPublicKey)

  // WITNESS DATA HASH CALCULATOR
  const witnessStatus = await verifyWitness(data.witness_event_id)

  const calculatedVerificationHash = calculateVerificationHash(
    contentHash, metadataHash, signatureHash, prevWitnessHash)

  if (calculatedVerificationHash !== data.verification_hash) {
    log_red(`  ${CROSSMARK}` + " verification hash doesn't match")
    if (VERBOSE) {
      log_red(`  Actual content hash: ${contentHash}`)
      log_red(`  Actual metadata hash: ${metadataHash}`)
      log_red(`  Actual signature hash: ${signatureHash}`)
      log_red(`  Witness event id: ${data.witness_event_id}`)
      log_red(`  Actual previous witness hash: ${prevWitnessHash}`)
      log_red(`  Expected verification hash: ${data.verification_hash}`)
      log_red(`  Actual verification hash: ${calculatedVerificationHash}`)
    }
    return [null, false]
  } else {
    console.log(`  ✅ Verification hash matches`)
  }
  if (data.signature === '') {
    log_dim(`    ${WARN} Not signed`)
  }

  if (witnessStatus === 'NO_WITNESS') {
    log_dim(`    ${WARN} Not witnessed`)
  }

  if (data.signature === '' || data.signature === null) {
    return [data.verification_hash, true]
  }

  if (VERBOSE) {
    console.log('VERBOSE backend', revid, data)
  }
  // The padded message is required
  const paddedMessage = 'I sign the following page verification_hash: [0x' + data.verification_hash + ']'
  const recoveredAddress = ethers.utils.recoverAddress(ethers.utils.hashMessage(paddedMessage), data.signature)
  if (recoveredAddress.toLowerCase() === data.wallet_address.toLowerCase()) {
    console.log('  signature is valid')
  }
  return [data.verification_hash, true]
}

async function synchronousGet(url) {
  try {
    http_promise = new Promise((resolve, reject) => {
      http.get(url, (response) => {
        let chunks_of_data = [];

        response.on('data', (fragments) => {
          chunks_of_data.push(fragments);
        });

        response.on('end', () => {
          let response_body = Buffer.concat(chunks_of_data);

          // promise resolved on success
          resolve(response_body.toString())
        });

        response.on('error', (error) => {
          // promise rejected on error
          reject(error)
        });
      });
    });
    return await http_promise;
  }
	catch(e) {
		// if the Promise is rejected
		console.error(e)
	}
}

function verifyPage(title) {
  http.get(`${apiURL}/page_all_rev?var1=${title}`, (resp) => {
    let body = ""
    resp.on('data', (chunk) => {
      body += chunk
    })
    resp.on('end', async () => {
      allRevInfo = JSON.parse(body)
      verifiedRevIds = allRevInfo.map(x => x.rev_id)
      console.log('Verified IDs:', verifiedRevIds)

      let previousVerificationHash = ''
      let previousRevId = ''
      let count = 0
      for (const idx in verifiedRevIds) {
        const revid = verifiedRevIds[idx]
        console.log(`${parseInt(idx) + 1}. Verification of Revision ${revid}.`)

        // CONTENT DATA HASH CALCULATOR
        const bodyRevid = await synchronousGet(`http://localhost:9352/api.php?action=parse&oldid=${revid}&prop=wikitext&formatversion=2&format=json`)
        const content = JSON.parse(bodyRevid).parse.wikitext
        const contentHash = getHashSum(content)

        const [verificationHash, isCorrect] = await verifyRevision(revid, previousRevId, previousVerificationHash, contentHash)
        if (isCorrect) {
          count += 1
        }
        console.log(`  Validated revisions: ${count} / ${verifiedRevIds.length} (${(100 * count / verifiedRevIds.length).toFixed(1)}%)`)
        previousVerificationHash = verificationHash
        previousRevId = revid
      }
    })
  }).on("error", (err) => {
    console.log("Error: " + err.message);
  })
}

if (require.main === module) {
  //This should be a commandline argument for specifying the title of the page which should be verified 
  if (process.argv.length < 3) {
    console.log("You must specify the page title")
    exit(1)
  }
  let title = process.argv[2] !== '-v' ? process.argv[2]: process.argv[3]

  VERBOSE = process.argv.includes('-v')

  console.log(`Verifying ${title}`)
  verifyPage(title)
}

module.exports = {
  verifyPage: verifyPage
}
