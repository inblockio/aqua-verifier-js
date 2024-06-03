// Compatibility with browsers.
// We use "http-status-codes" instead of STATUS_CODES in the "http" library
// because we need to use this file in the browser.
const { getReasonPhrase } = require("http-status-codes")
const Buffer = require("buffer/").Buffer
// End of compatibility with browsers.

const fetch = require("node-fetch")
const sha3 = require("js-sha3")
const hrtime = require("browser-process-hrtime")

// utilities for verifying signatures
const ethers = require("ethers")

const cES = require("./checkEtherScan.js")

// Currently supported API version.
const apiVersion = "0.3.0"

let VERBOSE = undefined

// https://stackoverflow.com/questions/9781218/how-to-change-node-jss-console-font-color
const Reset = "\x1b[0m"
const Dim = "\x1b[2m"
const FgRed = "\x1b[31m"
const FgYellow = "\x1b[33m"
const FgWhite = "\x1b[37m"
const BgGreen = "\x1b[42m"
const WARN = "⚠️"
const CROSSMARK = "❌"
const CHECKMARK = "✅"
const LOCKED_WITH_PEN = "🔏"
const WATCH = "⌚"
const BRANCH = "🌿"
const FILE_GLYPH = "📄"

// Verification status
const INVALID_VERIFICATION_STATUS = "INVALID"
const VERIFIED_VERIFICATION_STATUS = "VERIFIED"
const ERROR_VERIFICATION_STATUS = "ERROR"

function formatHTTPError(response, message = "") {
  // We use status code mapping mapping instead of response.statusText because
  // apparently in HTTP/2, the statusText is removed. See
  // https://stackoverflow.com/questions/41632077/why-is-the-statustext-of-my-xhr-empty
  return `HTTP ${response.status}: ${getReasonPhrase(
    response.status
  )}.${message}`
}

function cliRedify(content) {
  return FgRed + content + Reset
}

function cliYellowfy(content) {
  return FgYellow + content + Reset
}

function htmlRedify(content) {
  return '<div style="color:Crimson;">' + content + "</div>"
}

function htmlDimify(content) {
  return '<div style="color:Gray;">' + content + "</div>"
}

function log_red(content) {
  console.log(cliRedify(content))
}

function log_yellow(content) {
  console.log(cliYellowfy(content))
}

function log_dim(content) {
  console.log(Dim + content + Reset)
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
  // Format 20210927075124 into 'Sep 27, 2021, 7:51:24 AM UTC'
  const year = ts.slice(0, 4)
  const month = ts.slice(4, 6)
  const day = ts.slice(6, 8)
  const hour = ts.slice(8, 10)
  const minute = ts.slice(10, 12)
  const second = ts.slice(12, 14)
  // We convert it to string first, because js has a confusing API of the month
  // being the monthIndex, hence, '09' is interpreted as October!
  const _date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
  return (
    _date.toLocaleString("en-us", {
      dateStyle: "medium",
      timeStyle: "medium",
    }) + " UTC"
  )
  //return dayjs(ts, "YYYYMMDDHHmmss").format("D MMM YYYY, h:mm:ss A") + " UTC"
}

function getElapsedTime(start) {
  const precision = 2 // 2 decimal places
  const elapsed = hrtime(start)
  // elapsed[1] is in nanosecond, so we divide by a billion to get nanosecond
  // to second.
  return (elapsed[0] + elapsed[1] / 1e9).toFixed(precision)
}

function shortenHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-6)
}

function clipboardifyHash(hash) {
  // We use clipboard.js in the frontend side so that when clicked, the hash is
  // copied to clipboard.
  const shortened = shortenHash(hash)
  return `<button class="clipboard-button" data-clipboard-text="${hash}">${shortened}</button>`
}

function makeHref(content, url) {
  const newTabString = ' target="_blank"'
  return `<a href="${url}"${newTabString}>${content}</a>`
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
  previousVerificationHash = "",
  mergeHash = ""
) {
  return getHashSum(domainId + timestamp + previousVerificationHash + mergeHash)
}

function calculateSignatureHash(signature, publicKey) {
  return getHashSum(signature + publicKey)
}

function calculateWitnessHash(
  domain_snapshot_genesis_hash,
  merkle_root,
  witness_network,
  witness_tx_hash
) {
  return getHashSum(
    domain_snapshot_genesis_hash +
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

function fetchWithToken(url, token) {
  if (!token) {
    return fetch(url)
  }
  return fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  })
}

function getApiURL(server) {
  return `${server}/rest.php/data_accounting`
}

async function getServerInfo(server) {
  const url = `${server}/rest.php/data_accounting/get_server_info`
  return fetch(url)
}

async function checkAPIVersionCompatibility(server) {
  const response = await getServerInfo(server)
  if (!response.ok) {
    return [formatHTTPError(response), false, ""]
  }
  const data = await response.json()
  if (data && data.api_version) {
    return ["FOUND", data.api_version === apiVersion, data.api_version]
  }
  return ["API endpoint found, but API version can't be retrieved", false, ""]
}

/**
 * Verifies the integrity of the merkle branch.
 * Steps:
 * - Traverses the nodes in the passed merkle branch.
 * - Returns false if the verification hash is not found in the first leaves pair.
 * - Returns false if the merkle branch hashes are inconsistent.
 * @param   {array} merkleBranch Array of merkle nodes.
 * @param   {string} verificationHash
 * @returns {boolean} Whether the merkle integrity is OK.
 */
function verifyMerkleIntegrity(merkleBranch, verificationHash) {
  if (merkleBranch.length === 0) {
    return false
  }

  let prevSuccessor = null
  for (const idx in merkleBranch) {
    const node = merkleBranch[idx]
    const leaves = [node.left_leaf, node.right_leaf]
    if (prevSuccessor) {
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

    let calculatedSuccessor
    if (!node.left_leaf) {
      calculatedSuccessor = node.right_leaf
    } else if (!node.right_leaf) {
      calculatedSuccessor = node.left_leaf
    } else {
      calculatedSuccessor = getHashSum(node.left_leaf + node.right_leaf)
    }
    if (calculatedSuccessor !== node.successor) {
      //console.log("Expected successor", calculatedSuccessor)
      //console.log("Actual successor", node.successor)
      return false
    }
    prevSuccessor = node.successor
  }
  return true
}

function verifyPreviousWitness(data, prev) {
  let prevWitnessHash = ""
  if (data.verification_context.has_previous_witness) {
    if (!prev.witness) {
      return [
        prevWitnessHash,
        { error_message: "Previous witness data not found" },
      ]
    }
    prevWitnessHash = calculateWitnessHash(
      prev.witness.domain_snapshot_genesis_hash,
      prev.witness.merkle_root,
      prev.witness.witness_network,
      prev.witness.witness_event_transaction_hash
    )
    if (prevWitnessHash !== prev.witness.witness_hash) {
      return [
        prevWitnessHash,
        { error_message: "Previous witness hash doesn't match" },
      ]
    }
  }
  return [prevWitnessHash, null]
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Analyses the witnessing steps for a revision of a page and builds a
 * verification log.
 * Steps:
 * - Calls get_witness_data API passing witness event ID.
 * - Calls function getHashSum passing domain_snapshot_genesis_hash and
 *   merkle_root from the get_witness_data API call.
 * - Writes witness event ID and transaction hash to the log.
 * - Calls function checkEtherScan (see the file checkEtherScan.js) passing
 *   witness network, witness event transaction hash and the actual  witness
 *   event verification hash.
 * - If checkEtherScan returns true, writes to the log that witness is
 *   verified.
 * - Else logs error from the checkEtherScan call.
 * - If doVerifyMerkleProof is set, calls function verifyMerkleIntegrity.
 * - Writes the teturned boolean value from verifyMerkleIntegrity to the
 *   log.
 * - Returns the structured data summary of the witness verification.
 * @param   {int} witness_event_id
 * @param   {string} verificationHash
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {string} The verification log.
 */
async function verifyWitness(
  witnessData,
  verification_hash,
  doVerifyMerkleProof
) {
  if (witnessData === null || witnessData === undefined) {
    return ["MISSING", null]
  }

  const actual_witness_event_verification_hash = getHashSum(
    witnessData.domain_snapshot_genesis_hash + witnessData.merkle_root
  )

  const result = {
    witness_hash: witnessData.witness_hash,
    tx_hash: witnessData.witness_event_transaction_hash,
    witness_network: witnessData.witness_network,
    etherscan_result: "",
    etherscan_error_message: "",
    actual_witness_event_verification_hash:
      actual_witness_event_verification_hash,
    witness_event_vh_matches: true,
    // `extra` is populated with useful info when the witness event verification
    // doesn't match.
    extra: null,
    doVerifyMerkleProof: doVerifyMerkleProof,
    merkle_proof_status: "",
  }

  // Do online lookup of transaction hash
  const etherScanResult = await cES.checkEtherScan(
    witnessData.witness_network,
    witnessData.witness_event_transaction_hash,
    actual_witness_event_verification_hash
  )
  result.etherscan_result = etherScanResult

  if (etherScanResult !== "true" && etherScanResult !== "false") {
    let errMsg
    if (etherScanResult === "Transaction hash not found") {
      errMsg = "Transaction hash not found"
    } else if (etherScanResult.includes("ENETUNREACH")) {
      errMsg = "Server is unreachable"
    } else {
      errMsg = "Online lookup failed"
    }
    result.etherscan_error_message = errMsg
  }
  if (
    actual_witness_event_verification_hash !=
    witnessData.witness_event_verification_hash
  ) {
    result.witness_event_vh_matches = false
    result.extra = {
      domain_snapshot_genesis_hash: witnessData.domain_snapshot_genesis_hash,
      merkle_root: witnessData.merkle_root,
      witness_event_verification_hash:
        witnessData.witness_event_verification_hash,
    }
    return ["INVALID", result]
  }
  // At this point, we know that the witness matches.
  if (doVerifyMerkleProof) {
    // Only verify the witness merkle proof when verifyWitness is successful,
    // because this step is expensive.
    if (verification_hash === witnessData.domain_snapshot_genesis_hash) {
      // Corner case when the page is a Domain Snapshot.
      result.merkle_proof_status = "DOMAIN_SNAPSHOT"
    } else {
      const merkleProofIsOK = await verifyMerkleIntegrity(
        witnessData.structured_merkle_proof,
        verification_hash
      )
      result.merkle_proof_status = merkleProofIsOK ? "VALID" : "INVALID"
      if (!merkleProofIsOK) {
        return ["INVALID", result]
      }
    }
  }
  if (etherScanResult !== "true") {
    return ["INVALID", result]
  }
  return ["VALID", result]
}

function printWitnessInfo(detail) {
  if (detail.status.witness === "MISSING") {
    log_dim(`    ${WARN} Not witnessed`)
    return
  }
  const _space2 = "  "
  const _space4 = _space2 + _space2
  const wr = detail.witness_result
  const wh = shortenHash(wr.witness_hash)
  let witOut = `${_space2}Witness event ${wh} detected`
  witOut += `\n${_space4}Transaction hash: ${wr.tx_hash}`
  const suffix = ` on ${wr.witness_network} via etherscan.io`
  if (wr.etherscan_result === "true") {
    witOut += `\n${_space4}${CHECKMARK}${WATCH}Witness event verification hash has been verified${suffix}`
  } else if (wr.etherscan_result === "false") {
    witOut += cliRedify(
      `\n${_space4}${CROSSMARK}${WATCH}Witness event verification hash does not match${suffix}`
    )
  } else {
    witOut += cliRedify(
      `\n${_space4}${CROSSMARK}${WATCH}${wr.etherscan_error_message}${suffix}`
    )
    witOut += cliRedify(`\n${_space4}Error code: ${wr.etherscan_result}`)
    witOut += cliRedify(
      `\n${_space4}Verify manually: ${wr.actual_witness_event_verification_hash}`
    )
  }
  if (!wr.witness_event_vh_matches) {
    witOut += cliRedify(
      `\n${_space4}${CROSSMARK}` +
        "Witness event verification hash doesn't match"
    )
    witOut += cliRedify(
      `\n${_space4}Domain Snapshot genesis hash: ${wr.extra.domain_snapshot_genesis_hash}`
    )
    witOut += cliRedify(`\n${_space4}Merkle root: ${wr.extra.merkle_root}`)
    witOut += cliRedify(
      `\n${_space4}Expected: ${wr.extra.witness_event_verification_hash}`
    )
    witOut += cliRedify(
      `\n${_space4}Actual: ${wr.actual_witness_event_verification_hash}`
    )
  }

  if (wr.doVerifyMerkleProof && wr.merkle_proof_status !== "") {
    switch (wr.merkle_proof_status) {
      case "DOMAIN_SNAPSHOT":
        witOut += `\n${_space4}${CHECKMARK}Is a Domain Snapshot, hence not part of Merkle Proof`
        break
      case "VALID":
        witOut += `\n${_space4}${CHECKMARK}${BRANCH}Witness Merkle Proof is OK`
        break
      default:
        witOut += `\n${_space4}${CROSSMARK}${BRANCH}Witness Merkle Proof is corrupted`
    }
  }

  console.log(witOut)
}

function printRevisionInfo(detail) {
  // IMPORTANT! If you update this function, make sure to update
  // formatRevisionInfo2HTML as well.
  if ("error_message" in detail) {
    log_red(detail.error_message)
    return
  }
  if (!("verification_hash" in detail)) {
    console.log("  no verification hash")
    return
  }

  console.log(`  Elapsed: ${detail.elapsed} s`)
  console.log(
    `  Timestamp: ${formatDBTimestamp(detail.data.metadata.time_stamp)}`
  )
  console.log(`  Domain ID: ${detail.data.metadata.domain_id}`)
  if (detail.status.verification === INVALID_VERIFICATION_STATUS) {
    log_red(`  ${CROSSMARK}` + " Verification hash doesn't match")
    return
  }
  console.log(`  ${CHECKMARK} Verification hash matches`)

  if (detail.status.file === "VERIFIED") {
    // The alternative value of detail.status.file is "MISSING", where we don't
    // log anything extra in that situation.
    console.log(
      `    ${CHECKMARK}${FILE_GLYPH} File content hash matches (${detail.file_hash})`
    )
  } else if (detail.status.file === "INVALID") {
    console.log(`    ${CROSSMARK}${FILE_GLYPH} Invalid file content hash`)
  }

  printWitnessInfo(detail)

  if (VERBOSE) {
    delete detail.data.witness
    console.log("  VERBOSE backend", detail)
  }

  // Signature
  switch (detail.status.signature) {
    case "MISSING":
      log_dim(`    ${WARN} Not signed`)
      break
    case "VALID":
      console.log(
        `    ${CHECKMARK}${LOCKED_WITH_PEN} Valid signature from wallet: ${detail.data.signature.wallet_address}`
      )
      break
    default:
      log_red(`    ${CROSSMARK}${LOCKED_WITH_PEN} Invalid signature`)
  }
}

function checkmarkCrossmark(isCorrect) {
  return isCorrect ? CHECKMARK : CROSSMARK
}

function formatWitnessInfo2HTML(detail) {
  const _space2 = "&nbsp&nbsp"
  const _space4 = _space2 + _space2

  let witOut = `${_space2}Witness event detected`

  const wr = detail.witness_result
  const witnessTxUrl =
    cES.witnessNetworkMap[wr.witness_network] + "/" + wr.tx_hash

  const txHash = makeHref(shortenHash(wr.tx_hash), witnessTxUrl)
  witOut += `<br>${_space4}Transaction hash: ${txHash}`
  const suffix = ` on ${wr.witness_network} via etherscan.io`
  if (wr.etherscan_result === "true") {
    witOut += `<br>${_space4}${CHECKMARK}${WATCH}Witness event verification hash has been verified${suffix}`
  } else if (wr.etherscan_result === "false") {
    // We don't need <br> because redify already wraps the text inside a div.
    witOut += htmlRedify(
      `${_space4}${CROSSMARK}${WATCH}Witness event verification hash does not match${suffix}`
    )
  } else {
    witOut += htmlRedify(
      `${_space4}${CROSSMARK}${WATCH}${wr.etherscan_error_message}${suffix}`
    )
    witOut += htmlRedify(`${_space4}Error code: ${wr.etherscan_result}`)
    // We want the long hash to be shortened in the HTML output.
    const formattedWEVH = clipboardifyHash(
      wr.actual_witness_event_verification_hash
    )
    witOut += htmlRedify(`${_space4}Verify manually: ${formattedWEVH}`)
  }

  if (!wr.witness_event_vh_matches) {
    witOut += htmlRedify(
      `${_space4}${CROSSMARK}` + "Witness event verification hash doesn't match"
    )
    witOut += htmlRedify(
      `${_space4}Domain Snapshot genesis hash: ${wr.extra.domain_snapshot_genesis_hash}`
    )
    witOut += htmlRedify(
      `${_space4}Merkle root: ${clipboardifyHash(wr.extra.merkle_root)}`
    )
    witOut += htmlRedify(
      `${_space4}Expected: ${clipboardifyHash(
        wr.extra.witness_event_verification_hash
      )}`
    )
    witOut += htmlRedify(
      `${_space4}Actual: ${clipboardifyHash(
        wr.actual_witness_event_verification_hash
      )}`
    )
  }

  if (wr.doVerifyMerkleProof && wr.merkle_proof_status !== "") {
    switch (wr.merkle_proof_status) {
      case "DOMAIN_SNAPSHOT":
        witOut += `<br>${_space4}${CHECKMARK}Is a Domain Snapshot, hence not part of Merkle Proof`
        break
      case "VALID":
        witOut += `<br>${_space4}${CHECKMARK}${BRANCH}Witness Merkle Proof is OK`
        break
      default:
        witOut += `<br>${_space4}${CROSSMARK}${BRANCH}Witness Merkle Proof is corrupted`
    }
  }
  return witOut
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
  if (!("verification_hash" in detail)) {
    return `${_space2}no verification hash`
  }

  function makeDetail(detail) {
    return `<details>${detail}</details>`
  }

  let out = `${_space2}Elapsed: ${detail.elapsed} s<br>`
  out += `${_space2}${formatDBTimestamp(detail.data.metadata.time_stamp)}<br>`
  out += `${_space2}Domain ID: ${detail.data.metadata.domain_id}<br>`
  if (detail.status.verification === INVALID_VERIFICATION_STATUS) {
    out += htmlRedify(
      `${_space2}${CROSSMARK}` + " verification hash doesn't match"
    )
    return [CROSSMARK, makeDetail(out)]
  }
  out += `${_space2}${CHECKMARK} Verification hash matches<br>`
  let isCorrect = true

  let fileSummary = ""
  if (detail.status.file === "VERIFIED") {
    // The alternative value of detail.status.file is "MISSING", where we don't
    // log anything extra in that situation.
    out += `${_space4}${CHECKMARK}${FILE_GLYPH} File content hash matches (${clipboardifyHash(
      detail.file_hash
    )})<br>`
    fileSummary = FILE_GLYPH
  } else if (detail.status.file === "INVALID") {
    out += `${_space4}${CROSSMARK}${FILE_GLYPH} Invalid file content hash<br>`
    fileSummary = FILE_GLYPH
    isCorrect = false
  }

  let witnessSummary = ""
  if (detail.status.witness !== "MISSING") {
    const witOut = formatWitnessInfo2HTML(detail)
    out += witOut + "<br>"
    witnessSummary = WATCH
    if (detail.status.witness === "INVALID") {
      isCorrect = false
    }
  } else {
    out += htmlDimify(`${_space4}${WARN} Not witnessed<br>`)
  }
  if (verbose) {
    delete detail.witness_result
    out += `${_space2}VERBOSE backend ` + JSON.stringify(detail) + "<br>"
  }

  if (detail.status.signature === "MISSING") {
    out += htmlDimify(`${_space4}${WARN} Not signed<br>`)
    return [
      checkmarkCrossmark(isCorrect) + fileSummary + witnessSummary,
      makeDetail(out),
    ]
  }
  if (detail.status.signature === "VALID") {
    const walletURL = `${server}/index.php/User:${detail.data.signature.wallet_address}`
    const walletA = `<a href="${walletURL}" target="_blank">${detail.data.signature.wallet_address}</a>`
    out += `${_space4}${CHECKMARK}${LOCKED_WITH_PEN} Valid signature from wallet: ${walletA}<br>`
  } else {
    out += htmlRedify(
      `${_space4}${CROSSMARK}${LOCKED_WITH_PEN} Invalid signature`
    )
    isCorrect = false
  }
  return [
    checkmarkCrossmark(isCorrect) +
      fileSummary +
      witnessSummary +
      LOCKED_WITH_PEN,
    makeDetail(out),
  ]
}

function formatPageInfo2HTML(serverUrl, title, status, details, verbose) {
  if (status === "NORECORD") {
    return "No revision record"
  } else if (status === "N/A" || !details) {
    return ""
  } else if (status === ERROR_VERIFICATION_STATUS) {
    if (details && "error" in details) {
      return "ERROR: " + details.error
    }
    return "ERROR: Unknown cause"
  }
  const _space2 = "&nbsp&nbsp"
  const numRevisions = details.verification_hashes.length
  let finalOutput = `Number of Verified Page Revisions: ${numRevisions}<br>`
  let out = ""
  for (let i = 0; i < details.revision_details.length; i++) {
    let revisionOut = ""
    if (i % 2 == 0) {
      revisionOut += '<div style="background: LightCyan;">'
    } else {
      revisionOut += "<div>"
    }

    if ("error_message" in details.revision_details[i]) {
      revisionOut += htmlRedify(
        "ERROR: " + details.revision_details[i].error_message
      )
      revisionOut += "</div>"
      out = revisionOut + out
      break
    }

    const revid = details.revision_details[i].data.content.rev_id
    const revidURL = `${serverUrl}/index.php?title=${title}&oldid=${revid}`
    const [summary, formattedRevInfo] = formatRevisionInfo2HTML(
      serverUrl,
      details.revision_details[i],
      verbose
    )
    revisionOut += `${
      i + 1
    }. Verification of <a href='${revidURL}' target="_blank">Revision ID ${revid}<a>.${summary}<br>`
    revisionOut += formattedRevInfo
    const count = i + 1
    revisionOut += `${_space2}Progress: ${count} / ${numRevisions} (${(
      (100 * count) /
      numRevisions
    ).toFixed(1)}%)<br>`
    revisionOut += "</div>"
    // We order the output by the most recent revision shown first.
    out = revisionOut + out
  }
  finalOutput += out
  return finalOutput
}

function verifyFile(data) {
  const fileContentHash = data.content.content.file_hash || null
  if (fileContentHash === null) {
    return [
      false,
      { error_message: "Revision contains a file, but no file content hash" },
    ]
  }

  const rawFileContent = Buffer.from(data.content.file.data || "", "base64")
  if (fileContentHash !== getHashSum(rawFileContent)) {
    return [false, { error_message: "File content hash does not match" }]
  }

  return [true, { file_hash: fileContentHash }]
}

function verifyPreviousSignature(data, previousVerificationData) {
  if (!data.verification_context.has_previous_signature) {
    return null
  }
  if (!previousVerificationData) {
    return {
      error_message:
        "Revision has previous signature, but no previous revision provided to validate",
    }
  }
  const prevSignature = previousVerificationData.signature.signature
  const prevPublicKey = previousVerificationData.signature.public_key
  const signatureHash = calculateSignatureHash(prevSignature, prevPublicKey)
  if (signatureHash !== previousVerificationData.signature.signature_hash) {
    return { error_message: "Previous signature hash doesn't match" }
  }
  return null
}

function verifyCurrentSignature(data, verificationHash) {
  // TODO comparison with null is probably not needed. Needs testing.
  if (
    !("signature" in data) ||
    data.signature === null ||
    data.signature.signature === "" ||
    data.signature.signature === null
  ) {
    return [true, "MISSING"]
  }

  // Specify signature correctness
  let signatureIsCorrect = false
  // Signature verification
  // The padded message is required
  const paddedMessage =
    "I sign the following page verification_hash: [0x" + verificationHash + "]"
  try {
    const recoveredAddress = ethers.recoverAddress(
      ethers.hashMessage(paddedMessage),
      data.signature.signature
    )
    if (
      recoveredAddress.toLowerCase() ===
      data.signature.wallet_address.toLowerCase()
    ) {
      signatureIsCorrect = true
    }
  } catch (e) {
    // continue regardless of error
  }
  const status = signatureIsCorrect ? "VALID" : "INVALID"
  return [signatureIsCorrect, status]
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies a revision from a page.
 * Steps:
 * - Calls verify_page API passing revision id.
 * - Calculates metadata hash using previous verification hash.
 * - If previous revision id is set, calls verify_page API passing previous
 *   revision id, then determines witness hash for the previous revision.
 * - Calls function verifyWitness using data from the verify_page API call.
 * - Calculates the verification hash using content hash, metadata hash,
 *   signature hash and previous witness hash.
 * - If the calculated verification hash is different from the verification
 *   hash returned from the first verify_page API calls then logs a hash
 *   mismatch error, else sets verification status to VERIFIED.
 * - Does lookup on the Ethereum blockchain to find the recovered Address.
 * - If the recovered Address equals the current wallet address, sets valid
 *   signature to true.
 * - If witness status is inconsistent, sets witnessIsCorrect flag to false.
 * @param   {string} apiURL The URL for the API call.
 * @param   {Object} token The OAuth2 token required to make the API call.
 * @param   {string} revid The page revision id.
 * @param   {string} prevRevId The previous page revision id.
 * @param   {string} previousVerificationHash The previous verification hash string.
 * @param   {string} contentHash The page content hash string.
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {Array} An array containing verification data,
 *                  verification-is-correct flag, and an array of page revision
 *                  details.
 */
async function verifyRevision(
  verificationHash,
  input,
  previousVerificationData,
  doVerifyMerkleProof
) {
  let detail = {
    verification_hash: verificationHash,
    status: {
      content: false,
      metadata: false,
      signature: "MISSING",
      witness: "MISSING",
      verification: INVALID_VERIFICATION_STATUS,
      file: "MISSING",
    },
    witness_result: {},
    file_hash: "",
  }

  let data
  if ("apiURL" in input) {
    // Online verification
    const response = await fetchWithToken(
      `${input.apiURL}/get_revision/${verificationHash}`,
      input.token
    )
    data = await response.json()
    if (!response.ok) {
      const serverMessage = data.message
      return [
        false,
        {
          error_message:
            "get_revision: " + formatHTTPError(response, " " + serverMessage),
        },
      ]
    }
  } else {
    // Offline verification
    if (!("offline_data" in input)) {
      return [
        false,
        {
          error_message:
            "get_revision: Either apiURL or offline_data must be in the `input` argument.",
        },
      ]
    }
    data = input.offline_data
  }
  detail.data = data

  // TODO do sanity check on domain id
  const domainId = data.metadata.domain_id

  if ("file" in data.content) {
    // This is a file
    const [fileIsCorrect, fileOut] = verifyFile(data)
    if (!fileIsCorrect) {
      return [fileIsCorrect, fileOut]
    }
    detail.status.file = "VERIFIED"
    detail.file_hash = fileOut.file_hash
  }
  let content = ""
  for (const [slot, slotContent] of Object.entries(data.content.content)) {
    content += slotContent
  }
  const contentHash = getHashSum(content)
  if (contentHash !== data.content.content_hash) {
    return [false, { error_message: "Content hash doesn't match" }]
  }
  // Mark content as correct
  detail.status.content = true

  // To save storage for the cacher, e.g the Chrome extension.
  delete detail.data.content.content
  delete detail.data.content.file

  const metadataHash = calculateMetadataHash(
    domainId,
    data.metadata.time_stamp,
    data.metadata.previous_verification_hash ?? "",
      data.metadata.merge_hash ?? ""
  )
  if (metadataHash !== data.metadata.metadata_hash) {
    return [false, { error_message: "Metadata hash doesn't match" }]
  }
  // Mark metadata as correct
  detail.status.metadata = true

  // Signature verification
  const error = verifyPreviousSignature(data, previousVerificationData)
  if (error !== null) {
    return [false, error]
  }

  const [prevWitnessHash, err] = verifyPreviousWitness(
    data,
    previousVerificationData
  )
  if (err !== null) {
    return [false, err]
  }

  // WITNESS DATA HASH CALCULATOR
  const [witnessStatus, witnessResult] = await verifyWitness(
    data.witness,
    verificationHash,
    doVerifyMerkleProof
  )
  detail.witness_result = witnessResult
  detail.status.witness = witnessStatus

  let signatureHash = ""
  if (previousVerificationData && previousVerificationData.signature) {
    signatureHash = previousVerificationData.signature.signature_hash
  }
  const calculatedVerificationHash = calculateVerificationHash(
    contentHash,
    metadataHash,
    signatureHash,
    prevWitnessHash
  )

  if (calculatedVerificationHash !== verificationHash) {
    detail.status.verification = INVALID_VERIFICATION_STATUS
    if (VERBOSE) {
      log_red(`  Actual content hash: ${contentHash}`)
      log_red(`  Actual metadata hash: ${metadataHash}`)
      log_red(`  Actual signature hash: ${signatureHash}`)
      log_red(`  Witness event id: ${data.witness_event_id}`)
      log_red(`  Actual previous witness hash: ${prevWitnessHash}`)
      log_red(`  Expected verification hash: ${verificationHash}`)
      log_red(`  Actual verification hash: ${calculatedVerificationHash}`)
    }
    return [false, detail]
  } else {
    detail.status.verification = VERIFIED_VERIFICATION_STATUS
  }

  // Specify witness correctness
  let witnessIsCorrect = detail.status.witness !== "INVALID"

  const [signatureIsCorrect, sigStatus] = verifyCurrentSignature(
    data,
    verificationHash
  )
  detail.status.signature = sigStatus

  return [signatureIsCorrect && witnessIsCorrect, detail]
}

async function doPreliminaryAPICall(endpointName, url, token) {
  let response, errorMsg
  try {
    // We do a try block for our first ever fetch because the server might be
    // down, and we get a connection refused error.
    response = await fetchWithToken(url, token)
  } catch (e) {
    errorMsg = `${endpointName}: ` + e
    return [ERROR_VERIFICATION_STATUS, { error: errorMsg }]
  }
  if (!response.ok) {
    let status
    if (response.status === 404) {
      status = "404"
    } else {
      status = ERROR_VERIFICATION_STATUS
    }
    errorMsg = `${endpointName}: ` + formatHTTPError(response)
    return [status, { error: errorMsg }]
  }
  const content = await response.json()
  if ("error" in content) {
    return [ERROR_VERIFICATION_STATUS, content]
  }
  return ["OK", content]
}

async function getRevisionHashes(apiURL, title, token) {
  const hashChainUrl = `${apiURL}/get_hash_chain_info/title?identifier=${title}`
  const [status, info] = await doPreliminaryAPICall(
    "get_hash_chain_info",
    hashChainUrl,
    token
  )
  if (status !== "OK") {
    if (status === "404") {
      // Simply return empty array when get_hash_chain_info is 404.
      // Note: this means that the output when a page is hidden from the public
      // is indistinguishable from when it simply doesn't have a verification
      // data. We can't confirm nor deny of which is it.
      return ["OK", []]
    }
    return [status, info]
  }

  const revisionHashesUrl = `${apiURL}/get_revision_hashes/${info.genesis_hash}`
  const [statusHashes, hashes] = await doPreliminaryAPICall(
    "get_revision_hashes",
    revisionHashesUrl,
    token
  )
  if (statusHashes === "404") {
    // Same reasoning as the previous 404 handling.
    return ["OK", []]
  }
  return [statusHashes, hashes]
}

function calculateStatus(count, totalLength) {
  if (count == totalLength) {
    if (count === 0) {
      return "NORECORD"
    } else {
      return VERIFIED_VERIFICATION_STATUS
    }
  } else {
    return INVALID_VERIFICATION_STATUS
  }
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies all of the verified revisions of a page.
 * Steps:
 * - Loops through the revision IDs for the page.
 *   Calls function verifyRevision, if isCorrect flag is returned as true,
 *   yield true and the revision detail.
 * @param   {Array} verifiedRevIds Array of revision ids which have verification detail.
 * @param   {string} server The server URL for the API call.
 * @param   {boolean} verbose
 * @param   {boolean} doVerifyMerkleProof The flag for whether to do rigorous
 *                    verification of the merkle proof. TODO clarify this.
 * @param   {Object} token (Optional) The OAuth2 token required to make the API call.
 * @returns {Generator} Generator for isCorrect boolean and detail object of
 *                      each revisions.
 */
async function* generateVerifyPage(
  verificationHashes,
  input,
  verbose,
  doVerifyMerkleProof
) {
  let revisionInput

  if ("server" in input) {
    // Online verification
    const apiURL = getApiURL(input.server)
    revisionInput = {
      apiURL,
      token: input.token,
    }
  }
  VERBOSE = verbose

  let elapsed
  let totalElapsed = 0.0
  let previousVerificationData
  for (const vh of verificationHashes) {
    const elapsedStart = hrtime()

    // For offline verification, we simply pass in the data.
    if ("offline_data" in input) {
      revisionInput = {
        offline_data: input.offline_data.revisions[vh],
      }
    }

    const [isCorrect, detail] = await verifyRevision(
      vh,
      revisionInput,
      previousVerificationData,
      doVerifyMerkleProof
    )
    elapsed = getElapsedTime(elapsedStart)
    detail.elapsed = elapsed
    totalElapsed += elapsed
    if (!isCorrect) {
      yield [false, detail]
      return
    }
    previousVerificationData = {
      witness: detail.data.witness,
      signature: detail.data.signature,
      verification_hash: detail.verification_hash,
    }
    yield [true, detail]
  }
}

// Used by the Chrome extension. Will be removed once we migrate to the
// generator version.
async function verifyPage(input, verbose, doVerifyMerkleProof, token) {
  let verificationHashes
  if ("server" in input && "title" in input) {
    const apiURL = getApiURL(input.server)
    const [status, res] = await getRevisionHashes(apiURL, input.title, token)
    if (status !== "OK") {
      return [status, res]
    }
    verificationHashes = res
  } else {
    if (!("offline_data" in input)) {
      return [
        ERROR_VERIFICATION_STATUS,
        { error: "Input must contain 'server' & 'title', or 'offline_data'" },
      ]
    }
    verificationHashes = Object.keys(input.offline_data.revisions)
  }

  let count = 0
  const details = {
    verification_hashes: verificationHashes,
    revision_details: [],
  }
  let verificationStatus
  for await (const value of generateVerifyPage(
    verificationHashes,
    input,
    verbose,
    doVerifyMerkleProof
  )) {
    const [isCorrect, detail] = value
    details.revision_details.push(detail)
    if (!isCorrect) {
      return [INVALID_VERIFICATION_STATUS, details]
    }
    count += 1
  }
  verificationStatus = calculateStatus(count, verificationHashes.length)
  return [verificationStatus, details]
}

function validateTitle(title) {
  if (title.includes("_")) {
    title = title.replace(/_/g, " ")
    // TODO it's not just underscore, catch all potential errors in page title.
    // This error should not happen in Chrome-Extension because the title has been
    // sanitized.
    log_yellow("Warning: Underscores in title are converted to spaces.")
  }
  if (title.includes(": ")) {
    log_yellow(
      "Warning: Space after ':' detected. You might need to remove it to match MediaWiki title."
    )
  }
  return title
}

async function verifyPageCLI(input, verbose, doVerifyMerkleProof) {
  let verificationHashes
  if ("server" in input && "title" in input) {
    // Online verification
    input.title = validateTitle(input.title)
    let status, versionMatches, serverVersion
    try {
      ;[status, versionMatches, serverVersion] =
        await checkAPIVersionCompatibility(input.server)
    } catch (e) {
      log_red("Error checking API version: " + e)
      return
    }
    if (status !== "FOUND") {
      log_red("Error checking API version: " + status)
      return
    }
    if (!versionMatches) {
      log_red("Incompatible API version:")
      log_red(`Current supported version: ${apiVersion}`)
      log_red(`Server version: ${serverVersion}`)
      return
    }

    const apiURL = getApiURL(input.server)
    const [statusHashes, res] = await getRevisionHashes(
      apiURL,
      input.title,
      input.token
    )
    if (statusHashes !== "OK") {
      log_red(res.error)
      return
    }
    verificationHashes = res
  } else {
    // Offline verification
    if (!("offline_data" in input)) {
      log_red(
        "verifyPageCLI: `input` must contain either 'server' and 'title', or 'offline_data'"
      )
      return
    }
    verificationHashes = Object.keys(input.offline_data.revisions)
  }
  console.log("Page Verification Hashes: ", verificationHashes)

  let count = 0
  if (verificationHashes.length > 0) {
    // Print out the verification hash of the first one.
    console.log(`${count + 1}. Verification of ${verificationHashes[0]}.`)
  }
  let verificationStatus
  for await (const value of generateVerifyPage(
    verificationHashes,
    input,
    verbose,
    false,
    doVerifyMerkleProof
  )) {
    const [isCorrect, detail] = value
    printRevisionInfo(detail)
    if (!isCorrect) {
      verificationStatus = INVALID_VERIFICATION_STATUS
      break
    }
    count += 1
    console.log(
      `  Progress: ${count} / ${verificationHashes.length} (${(
        (100 * count) /
        verificationHashes.length
      ).toFixed(1)}%)`
    )
    if (count < verificationHashes.length) {
      console.log(
        `${count + 1}. Verification of Revision ${verificationHashes[count]}.`
      )
    }
  }
  verificationStatus = calculateStatus(count, verificationHashes.length)
  console.log(`Status: ${verificationStatus}`)
}

module.exports = {
  verifyPage: verifyPage,
  generateVerifyPage: generateVerifyPage,
  verifyPageCLI: verifyPageCLI,
  log_red: log_red,
  formatRevisionInfo2HTML: formatRevisionInfo2HTML,
  formatPageInfo2HTML: formatPageInfo2HTML,
  apiVersion: apiVersion,
  // For verified_import.js
  ERROR_VERIFICATION_STATUS,
  formatHTTPError,
  getApiURL,
  getRevisionHashes,
  fetchWithToken,
  validateTitle,
  // For notarize.js
  getHashSum,
  calculateMetadataHash,
  calculateVerificationHash,
  calculateSignatureHash,
  formatMwTimestamp,
}
