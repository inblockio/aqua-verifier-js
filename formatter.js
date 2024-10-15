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
const LOCKED_WITH_PEN = "🔏"
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
  if (detail.status.witness === "MISSING") {
    log_dim(`    ${WARN} Not witnessed`)
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
  witOut += `\n${_space4}Timestamp: ${wr.witness_timestamp}`
  const suffix = ` on ${wr.witness_network}`
  if (wr.isValid) {
    witOut += `\n${_space4}${CHECKMARK}${WATCH}Witness event verification hash has been verified${suffix}`
  } else {
    witOut += cliRedify(
      `\n${_space4}${CROSSMARK}${WATCH}Witness event verification hash does not match${suffix}`
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

function printRevisionInfo(detail, verbose) {
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
    `  Timestamp: ${formatDBTimestamp(detail.data.local_timestamp)}`
  )
  console.log(`  Domain ID: ${detail.data.domain_id}`)
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

  if (verbose) {
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
  const witnessTxUrl = `${wr.witness_network}/${wr.tx_hash}`

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
    const formattedMR = clipboardifyHash(
      wr.merkle_root
    )
    witOut += htmlRedify(`${_space4}Verify manually: ${formattedMR}`)
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
  out += `${_space2}${formatDBTimestamp(detail.data.time_stamp)}<br>`
  out += `${_space2}Domain ID: ${detail.data.domain_id}<br>`
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
  formatRevisionInfo2HTML,
  formatPageInfo2HTML,
  getApiURL,
  getRevisionHashes,
  fetchWithToken,
  validateTitle,
  printRevisionInfo,
}
