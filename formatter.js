// Compatibility with browsers.
// We use "http-status-codes" instead of STATUS_CODES in the "http" library
// because we need to use this file in the browser.
import getReasonPhrase from "http-status-codes"

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
const WATCH = "⌚"
const BRANCH = "🌿"
const FILE_GLYPH = "📄"

// Verification status
const INVALID_VERIFICATION_STATUS = "INVALID"
const VERIFIED_VERIFICATION_STATUS = "VERIFIED"
const ERROR_VERIFICATION_STATUS = "ERROR"

function cliRedify(content) {
  return FgRed + content + Reset
}

function cliYellowfy(content) {
  return FgYellow + content + Reset
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

function shortenHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-6)
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

function formatHTTPError(response, message = "") {
  // We use status code mapping mapping instead of response.statusText because
  // apparently in HTTP/2, the statusText is removed. See
  // https://stackoverflow.com/questions/41632077/why-is-the-statustext-of-my-xhr-empty
  return `HTTP ${response.status}: ${getReasonPhrase(
    response.status
  )}.${message}`
}

function printWitnessInfo(detail) {
  if (detail.revision_type !== "witness") {
    return
  }
  const _space2 = "  "
  const _space4 = _space2 + _space2
  const wr = detail.witness_result
  const wmr = shortenHash(wr.merkle_root)
  let witOut = `${_space2}Witness event ${wmr} detected`
  if (wr.witness_network !== "TSA_RFC3161") {
    // Show it to user
    witOut += `\n${_space4}Transaction hash: ${wr.tx_hash}`
  }
  const isoTimestamp = (new Date(wr.witness_timestamp * 1000)).toISOString();
  witOut += `\n${_space4}Timestamp: ${isoTimestamp}`
  const suffix = ` on ${wr.witness_network}`
  if (wr.isValid) {
    witOut += `\n${_space4}${CHECKMARK}${WATCH}Merkle root has been verified${suffix}`
  } else {
    witOut += cliRedify(
      `\n${_space4}${CROSSMARK}${WATCH}Merkle root does not match${suffix}`
    )
  }
  // TODO
  // else {
  //   witOut += cliRedify(
  //     `\n${_space4}${CROSSMARK}${WATCH}${wr.etherscan_error_message}${suffix}`
  //   )
  //   witOut += cliRedify(`\n${_space4}Error code: ${wr.etherscan_result}`)
  //   witOut += cliRedify(
  //     `\n${_space4}Verify manually: ${wr.merkle_root}`
  //   )
  // }

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

function displayVHStatus(status) {
  if (status === INVALID_VERIFICATION_STATUS) {
    log_red(`  ${CROSSMARK}` + " Verification hash doesn't match")
  } else {
    console.log(`  ${CHECKMARK} Verification hash matches`)
  }
}

function printRevisionInfo(detail, verbose) {
  if ("error_message" in detail) {
    log_red(detail.error_message)
    return
  }
  if (!("verification_hash" in detail)) {
    console.log("  no verification hash")
    return
  }

  if (detail.scalar) {
    console.log("  Scalar revision detected")
    displayVHStatus(detail.status.verification)
    return
  }

  console.log(`  Elapsed: ${detail.elapsed} s`)
  console.log(
    `  Timestamp: ${formatDBTimestamp(detail.data.local_timestamp)}`
  )
  console.log(`  Domain ID: ${detail.data.domain_id}`)
  displayVHStatus(detail.status.verification)
  if (detail.status.verification === INVALID_VERIFICATION_STATUS) {
    return
  }

  if (verbose) {
    delete detail.data.witness
    console.log("  VERBOSE backend", detail)
  }

  const emoji = {
    "file_hash": "📄",
    "content": "📄",
    "link": "🔗",
    "signature": "🔏",
    "witness": "⌚",
  }[detail.revision_type]

  let additionalInfo = ""
  if (detail.revision_type === "signature") {
    additionalInfo = `, ${detail.data.signature_type}, address ${detail.data.signature_wallet_address}`
  }
  if (detail.status.type_ok === "valid") {
    console.log(`    ${CHECKMARK}${emoji}${detail.status.type_ok}: ${detail.revision_type}${additionalInfo}`)
  } else {
    log_red(`    ${CROSSMARK}${emoji}${detail.status.type_ok}: ${detail.revision_type}${additionalInfo}`)
  }

  printWitnessInfo(detail)
}

function checkmarkCrossmark(isCorrect) {
  return isCorrect ? CHECKMARK : CROSSMARK
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

    if (isCorrect === null) {
      console.log("Exiting loop 2.")
      process.exit(1)
    }

    details.revision_details.push(detail)
    if (!isCorrect) {
      return [INVALID_VERIFICATION_STATUS, details]
    }
    count += 1
  }
  verificationStatus = calculateStatus(count, verificationHashes.length)
  return [verificationStatus, details]
}
export {
  log_red,
  getApiURL,
  getRevisionHashes,
  fetchWithToken,
  validateTitle,
  printRevisionInfo,
}
