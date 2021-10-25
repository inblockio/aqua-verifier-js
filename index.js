const http = require("http")
const https = require("https")

const sha3 = require("js-sha3")
const moment = require("moment")

// utilities for verifying signatures
const ethers = require("ethers")

const cES = require("./checkEtherScan.js")

let VERBOSE = undefined

// https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
const Reset = "\x1b[0m"
const Dim = "\x1b[2m"
const FgRed = "\x1b[31m"
const FgWhite = "\x1b[37m"
const BgGreen = "\x1b[42m"
const WARN = "⚠️"
const CROSSMARK = "❌"
const CHECKMARK = "✅"
const LOCKED_WITH_PEN = "🔏"
const WATCH = "⌚"

// Verification status
const INVALID = "INVALID"
const VERIFIED = "VERIFIED"

function adaptiveGet(url) {
  return url.startsWith("https://") ? https.get : http.get
}

function cliRedify(content) {
  return FgRed + content + Reset
}

function htmlRedify(content) {
  return '<div style="color:Crimson;">' + content + "</div>"
}

function redify(isHtml, content) {
  return isHtml ? htmlRedify(content) : cliRedify(content)
}

function htmlDimify(content) {
  return '<div style="color:Gray;">' + content + "</div>"
}

function log_red(content) {
  console.log(cliRedify(content))
}

function log_dim(content) {
  console.log(Dim + content + Reset)
}

function maybeLog(doLog, ...args) {
  if (doLog) {
    console.log(...args)
  }
}

function formatMwTimestamp(ts) {
  // Format timestamp into the timestamp format found in Mediawiki outputs
  return ts
    .replace(/-/g, "")
    .replace(/:/g, "")
    .replace("T", "")
    .replace("Z", "")
}

function formatDBTimestamp(ts) {
  // Format 20210927075124 into '27 Sep 2021, 7:51:24 AM'
  return moment(ts, "YYYYMMDDHHmmss").format("D MMM YYYY, h:mm:ss A")
}

function shortenHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-6)
}

function hrefifyHash(hash, newTab = false) {
  const shortened = shortenHash(hash)
  newTabString = newTab ? ' target="_blank"' : ""
  return `<a href="${hash}"${newTabString}>${shortened}</a>`
}

function getHashSum(content) {
  if (content === "") {
    return ""
  }
  return sha3.sha3_512(content)
}

function calculateMetadataHash(
  domainId,
  timestamp,
  previousVerificationHash = ""
) {
  return getHashSum(domainId + timestamp + previousVerificationHash)
}

function calculateSignatureHash(signature, publicKey) {
  return getHashSum(signature + publicKey)
}

function calculateWitnessHash(
  domain_manifest_verification_hash,
  merkle_root,
  witness_network,
  witness_tx_hash
) {
  return getHashSum(
    domain_manifest_verification_hash +
      merkle_root +
      witness_network +
      witness_tx_hash
  )
}

function calculateVerificationHash(
  contentHash,
  metadataHash,
  signature_hash,
  witness_hash
) {
  return getHashSum(contentHash + metadataHash + signature_hash + witness_hash)
}

/**
 * Calls the witness data API, parses the result
 * and then builds the witness hash, which is returned to the calling program
 * Steps:
 * - Calls get_witness_data API passing witness event ID
 * - The response from the API call is used to calculate the witness hash using witness_event_verification_hash,
 *   merkle_root, witness_network and the witness_event_transaction_hash
 * - The witness hash is returned to the calling program
 * @param   {string} apiURL - the URL for the API call
 * @param   {string} witness_event_id - the key for the witness event
 * @returns {string} witnessHash - the witness hash
 */
async function getWitnessHash(apiURL, witness_event_id) {
  if (witness_event_id === null) {
    return ""
  }
  const [witnessResponse, statusCode] = await synchronousGet(
    `${apiURL}/standard/get_witness_data?var1=${witness_event_id}`
  )
  if (witnessResponse !== '{"value":""}') {
    witnessData = JSON.parse(witnessResponse)
    witnessHash = calculateWitnessHash(
      witnessData.witness_event_verification_hash,
      witnessData.merkle_root,
      witnessData.witness_network,
      witnessData.witness_event_transaction_hash
    )
    return witnessHash
  }
  return ""
}

/**
 * Verifies the integrity of the merkle branch passed to the function
 * Steps:
 * - The code traverses the nodes in the merkle branch passed in
 * - False is returned to the calling program if an inconsistency is found in the merkle branch nodes
 * - False is returned to the calling program if an inconsistency is found in the hash sum between linked nodes
 * @param   {array} merkleBranch - array of merkle nodes
 * @param   {string} merkleBranch - verification hash string
 * @returns {boolean} determined merkle integrity
 */
function verifyMerkleIntegrity(merkleBranch, verificationHash) {
  let prevSuccessor = null
  for (const idx in merkleBranch) {
    const node = merkleBranch[idx]
    const leaves = [node.left_leaf, node.right_leaf]
    if (!!prevSuccessor) {
      if (!leaves.includes(prevSuccessor)) {
        //console.log("Expected leaf", prevSuccessor)
        //console.log("Actual leaves", leaves)
        return false
      }
    } else {
      // This means we are at the beginning of the loop.
      if (!leaves.includes(verificationHash)) {
        // In the beginning, either the left or right leaf must match the
        // verification hash.
        return false
      }
    }

    const calculatedSuccessor = getHashSum(node.left_leaf + node.right_leaf)
    if (calculatedSuccessor !== node.successor) {
      //console.log("Expected successor", calculatedSuccessor)
      //console.log("Actual successor", node.successor)
      return false
    }
    prevSuccessor = node.successor
  }
  return true
}

/**
 * Verifies the Merkle proof via an API call
 * Steps:
 * - Calls API request_merkle_proof passing the witness event id and the verification Hash
 * - Calls function verifyMerkleIntegrity using witnessMerkleProof from API request_merkle_proof
 * - Returns boolean value from function verifyMerkleIntegrity
 * @param   {string} apiURL - the URL for the API call
 * @param   {string} witness_event_id - the witness event key 
 * @param   {string} verificationHash - the verification hash string
 * @returns {boolean} determined merkle integrity
 */
async function verifyWitnessMerkleProof(
  apiURL,
  witness_event_id,
  verificationHash
) {
  const [witnessMerkleProofStr, statusCode] = await synchronousGet(
    `${apiURL}/standard/request_merkle_proof?var1=${witness_event_id}&var2=${verificationHash}`
  )
  if (witnessMerkleProofStr === "[]") {
    return false
  }
  const witnessMerkleProof = JSON.parse(witnessMerkleProofStr)
  return verifyMerkleIntegrity(witnessMerkleProof, verificationHash)
}

/**
 * Analyses the witnessing steps for a page and builds a validation log
 * Steps:
 * - Calls get_witness_data API passing witness event ID
 * - Calls function getHashSum passing domain_manifest_verification_hash and merkle_root from the get_witness_data API call
 * - The witness event ID and transaction hash are written into the log
 * - Calls function checkEtherScan (file checkEtherScan.js) passing witness network, witness event transaction hash and the actual  *   witness event verification hash
 * - If checkEtherScan returns true, Witness event verification hash verified is written into the log
 * - Else the errors from the checkEtherScan call are written to the log
 * - If the Verify Merkle Proof flag is set, call function verifyWitnessMerkleProof using the api URL,
 *   the witness event id and the verification hash
 * - The boolean value returned from verifyWitnessMerkleProof is written into the log
 * - The log is returned to the calling program as HTML if the is Html flag is set, otherwise text
 * @param   {string} apiURL - the URL for the API call
 * @param   {string} witness_event_id - the witness event key 
 * @param   {string} verificationHash - the verification hash string
 * @param   {boolean} doVerifyMerkleProof - flag for do Verify Merkle Proof
 * @param   {boolean} isHtml - flag to return Html based log
 * @returns {string} detail - validation log
 */
async function verifyWitness(
  apiURL,
  witness_event_id,
  verification_hash,
  doVerifyMerkleProof,
  isHtml
) {
  let detail = ""
  const newline = isHtml ? "<br>" : "\n"
  // We don't need <br> because redify already wraps the text inside a div.
  const newlineRed = isHtml ? "" : "\n"
  const _space2 = isHtml ? "&nbsp&nbsp" : "  "
  const _space4 = _space2 + _space2
  const maybeHrefify = (hash) => (isHtml ? hrefifyHash(hash) : hash)
  const [witnessResponse, statusCode] = await synchronousGet(
    `${apiURL}/standard/get_witness_data?var1=${witness_event_id}`
  )
  if (witnessResponse !== '{"value":""}') {
    witnessData = JSON.parse(witnessResponse)
    actual_witness_event_verification_hash = getHashSum(
      witnessData.domain_manifest_verification_hash + witnessData.merkle_root
    )

    detail += `${_space2}Witness event ${witness_event_id} detected`
    detail += `${newline}${_space4}Transaction hash: ${witnessData.witness_event_transaction_hash}`
    // Do online lookup of transaction hash
    const etherScanResult = await cES.checkEtherScan(
      witnessData.witness_network,
      witnessData.witness_event_transaction_hash,
      actual_witness_event_verification_hash
    )
    const suffix = `${witnessData.witness_network} via etherscan.io`
    if (etherScanResult == "true") {
      detail += `${newline}${_space4}${CHECKMARK}${WATCH}Witness event verification hash has been verified on ${suffix}`
    } else if (etherScanResult == "false") {
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}${CROSSMARK}${WATCH}Witness event verification hash does not match on ${suffix}`
      )
    } else {
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}${CROSSMARK}${WATCH}Online lookup failed on ${suffix}`
      )
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}Error code: ${etherScanResult}`
      )
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}Verify manually: ${actual_witness_event_verification_hash}`
      )
    }
    if (
      actual_witness_event_verification_hash !=
      witnessData.witness_event_verification_hash
    ) {
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}${CROSSMARK}` +
          "Witness event verification hash doesn't match"
      )
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}Page manifest verification hash: ${witnessData.domain_manifest_verification_hash}`
      )
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}Merkle root: ${maybeHrefify(
          witnessData.merkle_root
        )}`
      )
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}Expected: ${maybeHrefify(
          witnessData.witness_event_verification_hash
        )}`
      )
      detail += redify(
        isHtml,
        `${newlineRed}${_space4}Actual: ${maybeHrefify(
          actual_witness_event_verification_hash
        )}`
      )
      return ["INCONSISTENT", detail]
    }
    // At this point, we know that the witness matches.
    if (doVerifyMerkleProof) {
      // Only verify the witness merkle proof when verifyWitness is successful,
      // because this step is expensive.
      if (verification_hash === witnessData.domain_manifest_verification_hash) {
        // Corner case when the page is a domain manifest.
        detail += `${newline}${_space4}${CHECKMARK}Domain Manifest; therefore does not require Merkle Proof`
      } else {
        const merkleProofIsOK = await verifyWitnessMerkleProof(
          apiURL,
          witness_event_id,
          verification_hash
        )
        if (merkleProofIsOK) {
          detail += `${newline}${_space4}${CHECKMARK}Witness Merkle Proof is OK`
        } else {
          detail += `${newline}${_space4}${CROSSMARK}Witness Merkle Proof is corrupted`
          return ["INCONSISTENT", detail]
        }
      }
    }
    return ["MATCHES", detail]
  }
  return ["NO_WITNESS", detail]
}

function printRevisionInfo(detail) {
  if ("error_message" in detail) {
    console.log(detail.error_message)
    return
  }
  if (!detail.hasOwnProperty("verification_hash")) {
    console.log("  no verification hash")
    return
  }

  console.log(`  ${formatDBTimestamp(detail.time_stamp)}`)
  console.log(`  Domain ID: ${detail.domain_id}`)
  if (detail.verification_status === INVALID) {
    log_red(`  ${CROSSMARK}` + " verification hash doesn't match")
    return
  }
  console.log(
    `  ${CHECKMARK} Verification hash matches (${detail.verification_hash})`
  )
  if (!detail.is_witnessed) {
    log_dim(`    ${WARN} Not witnessed`)
  }
  if (detail.witness_detail !== "") {
    console.log(detail.witness_detail)
  }
  if (VERBOSE) {
    delete detail.witness_detail
    console.log("  VERBOSE backend", detail)
  }
  if (!detail.is_signed) {
    log_dim(`    ${WARN} Not signed`)
    return
  }
  if (detail.valid_signature) {
    console.log(
      `    ${CHECKMARK}${LOCKED_WITH_PEN} Valid signature from wallet: ${detail.wallet_address}`
    )
  } else {
    log_red(`    ${CROSSMARK}${LOCKED_WITH_PEN} Invalid signature`)
  }
}

function formatRevisionInfo2HTML(server, detail, verbose = false) {
  // Format the info into HTML nicely. Used in VerifyPage Chrome extension, but
  // could be used elsewhere too.
  const _space = "&nbsp"
  const _space2 = _space + _space
  const _space4 = _space2 + _space2
  if ("error_message" in detail) {
    return _space2 + detail.error_message
  }
  if (!detail.hasOwnProperty("verification_hash")) {
    return `${_space2}no verification hash`
  }
  let out = `${_space2}${formatDBTimestamp(detail.time_stamp)}<br>`
  out += `${_space2}Domain ID: ${detail.domain_id}<br>`
  if (detail.verification_status === INVALID) {
    out += htmlRedify(
      `${_space2}${CROSSMARK}` + " verification hash doesn't match"
    )
    return out
  }
  out += `${_space2}${CHECKMARK} Verification hash matches (${hrefifyHash(
    detail.verification_hash,
    true
  )})<br>`
  if (!detail.is_witnessed) {
    out += htmlDimify(`${_space4}${WARN} Not witnessed<br>`)
  }
  if (detail.witness_detail !== "") {
    out += detail.witness_detail + "<br>"
  }
  if (verbose) {
    delete detail.witness_detail
    out += `${_space2}VERBOSE backend ` + JSON.stringify(detail) + "<br>"
  }
  if (!detail.is_signed) {
    out += htmlDimify(`${_space4}${WARN} Not signed<br>`)
    return out
  }
  if (detail.valid_signature) {
    const walletURL = `${server}/index.php/User:${detail.wallet_address}`
    const walletA = `<a href='${walletURL}' target="_blank">${detail.wallet_address}</a>`
    out += `${_space4}${CHECKMARK}${LOCKED_WITH_PEN} Valid signature from wallet: ${walletA}<br>`
  } else {
    out += htmlRedify(
      `${_space4}${CROSSMARK}${LOCKED_WITH_PEN} Invalid signature`
    )
  }
  return out
}

/**
 * Verifies the page revisions
 * Steps:
 * - Calls verify_page API passing revision id
 * - Calculates Meta data hash using previous verification hash
 * - If previous revision id is set, call verify_page API passing previous revision id, 
 *   then determine witness hash for the previous revision
 * - Call function verifyWitness using data from the verify_page API call
 * - Calculate the verification hash using content hash, metadata hash, signature hash and previous witness hash
 * - If the calculated verification hash is different from the verification hash returned from the first verify_page API
 *   call then log a hash mismatch error, else set verification status to VERIFIED
 * - Do lookup on ethereum blockchain to find the recovered Address
 * - If the recovered Address equals the current wallet address, set valid signature to true
 * - If witness status is inconsistent set is correct flag to false
 * @param   {string} apiURL - the URL for the API call
 * @param   {string} revid - the page revision id
 * @param   {string} prevRevId - the previous page revision id
 * @param   {string} previousVerificationHash - the previous verification hash string
 * @param   {string} contentHash - the page content hash string 
 * @param   {boolean} isHtml - flag to return Html based log
 * @param   {boolean} doVerifyMerkleProof - flag for do Verify Merkle Proof
 * @returns {array} containing verification hash, isCorrect flag and an array of page revision details
 */
async function verifyRevision(
  apiURL,
  revid,
  prevRevId,
  previousVerificationHash,
  contentHash,
  isHtml,
  doVerifyMerkleProof
) {
  let detail = {
    rev_id: revid,
    verification_status: null,
    is_witnessed: null,
    is_signed: false,
    valid_signature: false,
    witness_detail: null,
  }
  const [response, statusCode] = await synchronousGet(`${apiURL}/verify_page/${revid}`)
  // TODO we should handle the various status codes for all of the
  // synchronousGet calls.
  if (statusCode === 400) {
    return [null, false, {"error_message": "Bad API request"}]
  }
  if (response === "[]") {
    return [null, false, detail]
  }
  let data = JSON.parse(response)
  detail = Object.assign(detail, data)

  // TODO do sanity check on domain id
  const domainId = data.domain_id

  const metadataHash = calculateMetadataHash(
    domainId,
    data.time_stamp,
    previousVerificationHash
  )

  // SIGNATURE DATA HASH CALCULATOR
  let prevSignature = ""
  let prevPublicKey = ""
  let prevWitnessHash = ""
  if (prevRevId !== "") {
    const [responsePrevious, statusCode2] = await synchronousGet(
      `${apiURL}/verify_page/${prevRevId}`
    )
    const dataPrevious = JSON.parse(responsePrevious)
    // TODO just use signature and public key from previous element in the loop inside verifyPage
    // We have to do these ternary operations because sometimes the signature
    // and public key are nulls, not empty strings.
    prevSignature = !!dataPrevious.signature ? dataPrevious.signature : ""
    prevPublicKey = !!dataPrevious.public_key ? dataPrevious.public_key : ""
    prevWitnessHash = await getWitnessHash(
      apiURL,
      dataPrevious.witness_event_id
    )
  }
  const signatureHash = calculateSignatureHash(prevSignature, prevPublicKey)

  // WITNESS DATA HASH CALCULATOR
  const [witnessStatus, witness_detail] = await verifyWitness(
    apiURL,
    data.witness_event_id,
    data.verification_hash,
    doVerifyMerkleProof,
    isHtml
  )
  detail.witness_detail = witness_detail

  const calculatedVerificationHash = calculateVerificationHash(
    contentHash,
    metadataHash,
    signatureHash,
    prevWitnessHash
  )

  if (calculatedVerificationHash !== data.verification_hash) {
    detail.verification_status = INVALID
    if (VERBOSE) {
      log_red(`  Actual content hash: ${contentHash}`)
      log_red(`  Actual metadata hash: ${metadataHash}`)
      log_red(`  Actual signature hash: ${signatureHash}`)
      log_red(`  Witness event id: ${data.witness_event_id}`)
      log_red(`  Actual previous witness hash: ${prevWitnessHash}`)
      log_red(`  Expected verification hash: ${data.verification_hash}`)
      log_red(`  Actual verification hash: ${calculatedVerificationHash}`)
    }
    return [null, false, detail]
  } else {
    detail.verification_status = VERIFIED
  }
  detail.is_witnessed = witnessStatus !== "NO_WITNESS"

  if (data.signature === "" || data.signature === null) {
    detail.is_signed = false
    return [data.verification_hash, true, detail]
  }
  detail.is_signed = true

  // Signature verification
  let isCorrect = false
  // The padded message is required
  const paddedMessage =
    "I sign the following page verification_hash: [0x" +
    data.verification_hash +
    "]"
  try {
    const recoveredAddress = ethers.utils.recoverAddress(
      ethers.utils.hashMessage(paddedMessage),
      data.signature
    )
    if (recoveredAddress.toLowerCase() === data.wallet_address.toLowerCase()) {
      detail.valid_signature = true
      isCorrect = true
    }
  } catch (e) {}

  // Update isCorrect based on witness status
  if (detail.is_witnessed && witnessStatus === "INCONSISTENT") {
    isCorrect = false
  }

  return [data.verification_hash, isCorrect, detail]
}

async function synchronousGet(url) {
  try {
    http_promise = new Promise((resolve, reject) => {
      adaptiveGet(url)(url, (response) => {
        let chunks_of_data = []

        response.on("data", (fragments) => {
          chunks_of_data.push(fragments)
        })

        response.on("end", () => {
          let response_body = Buffer.concat(chunks_of_data)

          // promise resolved on success
          resolve([response_body.toString(), response.statusCode])
        })

        response.on("error", (error) => {
          // promise rejected on error
          reject(error)
        })
      })
    })
    return await http_promise
  } catch (e) {
    // if the Promise is rejected
    console.error(e)
  }
}

/**
 * Verifies the Page including all revisions
 * Steps:
 * - Check if title includes an underscore, if yes, throw error
 * - Calls page_all_rev API passing page title
 * - Loop at the revision IDs for the page
 *   If no wiki text exists for the revision, throw error
 *   Call function verifyRevision, if isCorrect flag is returned as true, add 1 to count
 * - Outside of loop, check count against number of revisions
 * - If all revisions verified, set return status to verified
 * @param   {string} title - the page title
 * @param   {string} server - the server for API call 
 * @param   {string} verbose - verbose
 * @param   {string} doLog - do log flag
 * @param   {string} doVerifyMerkleProof - check flag for call to verifyRevision
 * @returns {object} status string and page details array
 */
async function verifyPage(title, server, verbose, doLog, doVerifyMerkleProof) {
  const apiURL = `${server}/rest.php/data_accounting/v1`
  if (title.includes("_")) {
    // TODO it's not just underscore, catch all potential errors in page title.
    // This error can not happen in Chrome-Extension because the title has been
    // sanitized.
    errorMsg = "INVALID TITLE: Do not use underscore in title."
    maybeLog(doLog, cliRedify(errorMsg))
    return [errorMsg, {}]
  }
  VERBOSE = verbose
  try {
    http_promise = new Promise((resolve, reject) => {
      const url = `${apiURL}/get_page_all_revs/${title}`
      adaptiveGet(url)(url, (resp) => {
        if (resp.statusCode === 400) {
          reject(["Bad API request", {}])
          return
        }
        let body = ""
        resp.on("data", (chunk) => {
          body += chunk
        })
        resp.on("end", async () => {
          const allRevInfo = JSON.parse(body)
          if (allRevInfo.hasOwnProperty("error")) {
            throw body
          }
          verifiedRevIds = allRevInfo.map((x) => x.rev_id)
          maybeLog(doLog, "Verified Page Revisions: ", verifiedRevIds)

          let previousVerificationHash = ""
          let previousRevId = ""
          let count = 0
          const details = {
            verified_ids: verifiedRevIds,
            revision_details: [],
          }
          for (const idx in verifiedRevIds) {
            const revid = verifiedRevIds[idx]
            maybeLog(
              doLog,
              `${parseInt(idx) + 1}. Verification of Revision ${revid}.`
            )

            // CONTENT DATA HASH CALCULATOR
            const [bodyRevid, statusCode] = await synchronousGet(
              `${server}/api.php?action=parse&oldid=${revid}&prop=wikitext&formatversion=2&format=json`
            )
            const jsonBody = JSON.parse(bodyRevid)
            if (!jsonBody.parse || !jsonBody.parse.wikitext) {
              throw `No wikitext found for revid ${revid}`
            }
            const content = jsonBody.parse.wikitext
            const contentHash = getHashSum(content)

            const isHtml = !doLog // TODO: generalize this later
            const [verificationHash, isCorrect, detail] = await verifyRevision(
              apiURL,
              revid,
              previousRevId,
              previousVerificationHash,
              contentHash,
              isHtml,
              doVerifyMerkleProof
            )
            details.revision_details.push(detail)
            if (doLog) {
              printRevisionInfo(detail)
            }
            if (isCorrect) {
              count += 1
            } else {
              resolve([INVALID, details])
              return
            }
            maybeLog(
              doLog,
              `  Progress: ${count} / ${verifiedRevIds.length} (${(
                (100 * count) /
                verifiedRevIds.length
              ).toFixed(1)}%)`
            )
            previousVerificationHash = verificationHash
            previousRevId = revid
          }
          let status
          if (count == verifiedRevIds.length) {
            if (count === 0) {
              status = "NORECORD"
            } else {
              status = VERIFIED
            }
          } else {
            status = INVALID
          }
          resolve([status, details])
        })
        resp.on("error", (err) => {
          reject([err, {}])
        })
      }).on("error", (err) => {
        maybeLog(doLog, "Error: " + err.message)
        reject([err, {}])
      })
    })
    return await http_promise
  } catch (e) {
    // if the Promise is rejected
    console.error(e)
    return e
  }
}

module.exports = {
  verifyPage: verifyPage,
  log_red: log_red,
  formatRevisionInfo2HTML: formatRevisionInfo2HTML,
}
