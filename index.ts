// @ts-nocheck
import { Buffer } from "buffer"
// End of compatibility with browsers.

import sha3 from "js-sha3"
import hrtime from "browser-process-hrtime"
import fetch from "node-fetch"

// utilities for verifying signatures
import * as ethers from "ethers"

import * as cES from "./checkEtherScan.js"
import * as formatter from "./formatter.js"

// Currently supported API version.
const apiVersion = "0.3.0"

let VERBOSE = undefined

// Verification status
const INVALID_VERIFICATION_STATUS = "INVALID"
const VERIFIED_VERIFICATION_STATUS = "VERIFIED"
const ERROR_VERIFICATION_STATUS = "ERROR"

function getElapsedTime(start) {
  const precision = 2 // 2 decimal places
  const elapsed = hrtime(start)
  // elapsed[1] is in nanosecond, so we divide by a billion to get nanosecond
  // to second.
  return (elapsed[0] + elapsed[1] / 1e9).toFixed(precision)
}

function getHashSum(content: string) {
  return content === "" ? "" : sha3.sha3_512(content)
}

function calculateMetadataHash(
  domainId: string,
  timestamp: string,
  previousVerificationHash: string = "",
  mergeHash: string = ""
) {
  return getHashSum(domainId + timestamp + previousVerificationHash + mergeHash)
}

function calculateSignatureHash(signature: string, publicKey: string) {
  return getHashSum(signature + publicKey)
}

function calculateWitnessHash(
  domain_snapshot_genesis_hash: string,
  merkle_root: string,
  witness_network: string,
  witness_tx_hash: string,
) {
  return getHashSum(
    domain_snapshot_genesis_hash +
    merkle_root +
    witness_network +
    witness_tx_hash
  )
}

function calculateVerificationHash(
  contentHash: string,
  metadataHash: string,
  signature_hash: string,
  witness_hash: string,
) {
  return getHashSum(contentHash + metadataHash + signature_hash + witness_hash)
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
function verifyMerkleIntegrity(merkleBranch, verificationHash: string) {
  if (merkleBranch.length === 0) {
    return false
  }

  let prevSuccessor = null
  for (const idx in merkleBranch) {
    const node = merkleBranch[idx]
    const leaves = [node.left_leaf, node.right_leaf]
    if (prevSuccessor) {
      if (!leaves.includes(prevSuccessor)) {
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

    let calculatedSuccessor: string
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
 * @returns {Promise<string>} The verification log.
 */
async function verifyWitness(
  witnessData,
  verification_hash: string,
  doVerifyMerkleProof: boolean,
) {
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
      const merkleProofIsOK = verifyMerkleIntegrity(
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

function verifySignature(data: object, verificationHash: string) {
  // Specify signature correctness
  let signatureOk = false
  // Signature verification
  // The padded message is required
  const paddedMessage =
    `I sign the following page verification_hash: [0x${verificationHash}]`
  try {
    const recoveredAddress = ethers.recoverAddress(
      ethers.hashMessage(paddedMessage),
      data.signature.signature
    )
    signatureOk = recoveredAddress.toLowerCase() === data.signature.wallet_address.toLowerCase()
  } catch (e) {
    // continue regardless of error
  }
  const status = signatureOk ? "VALID" : "INVALID"
  return [signatureOk, status]
}

function verifyContent(data) {
  let content = ""
  for (const slotContent of Object.values(data.content.content)) {
    content += slotContent
  }
  const contentHash = getHashSum(content)
  return [contentHash === data.content.content_hash, contentHash]
}

function verifyMetadata(data) {
  const metadataHash = calculateMetadataHash(
    data.metadata.domain_id,
    data.metadata.time_stamp,
    data.metadata.previous_verification_hash ?? "",
    data.metadata.merge_hash ?? ""
  )
  return [metadataHash === data.metadata.metadata_hash, metadataHash]
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies a revision from a page.
 * Steps:
 * - Calls verify_page API passing revision id.
 * - Calculates metadata hash using previous verification hash.
 * - Calls function verifyWitness using data from the verify_page API call.
 * - Calculates the verification hash using content hash, metadata hash,
 *   signature hash and witness hash.
 * - If the calculated verification hash is different from the verification
 *   hash returned from the first verify_page API calls then logs a hash
 *   mismatch error, else sets verification status to VERIFIED.
 * - Does lookup on the Ethereum blockchain to find the witness_verification hash for digital timestamping
 *   stored in a smart contract to verify.
 * - If the recovered Address equals the current wallet address, sets valid
 *   signature to true.
 * - If witness status is inconsistent, sets witnessOk flag to false.
 * @param   {string} apiURL The URL for the API call.
 * @param   {Object} token The OAuth2 token required to make the API call or PKC must allow any request (LocalSettings.php).
 * @param   {string} revid The page revision id.
 * @param   {string} prevRevId The previous page revision id.
 * @param   {string} previousVerificationHash The previous verification hash string.
 * @param   {string} contentHash The page content hash string.
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {Promise<Array>} An array containing verification data,
 *                  verification-is-correct flag, and an array of page revision
 *                  details.
 */
async function verifyRevision(
  verificationHash: string,
  input,
  doVerifyMerkleProof: boolean
) {
  let result = {
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
    data: input.offline_data
  }
  const data = result.data

  // File
  if ("file" in data.content) {
    // This is a file
    const [fileIsCorrect, fileOut] = verifyFile(data)
    if (!fileIsCorrect) {
      return [fileIsCorrect, fileOut]
    }
    result.status.file = "VERIFIED"
    result.file_hash = fileOut.file_hash
  }

  // Content
  let [ok, contentHash] = verifyContent(data)
  if (!ok) {
    return [false, { error_message: "Content hash doesn't match" }]
  }
  // Mark content as correct
  result.status.content = true
  // To save storage for the cacher, e.g the Chrome extension.
  delete result.data.content.content
  delete result.data.content.file

  // Metadata
  let metadataHash
  [ok, metadataHash] = verifyMetadata(data)
  if (!ok) {
    return [false, { error_message: "Metadata hash doesn't match" }]
  }
  // Mark metadata as correct
  result.status.metadata = true

  // TODO comparison with null is probably not needed. Needs testing.
  const hasSignature = !(
    !("signature" in data) ||
    data.signature === null ||
    data.signature.signature === "" ||
    data.signature.signature === null
  )
  const hasWitness = !(data.witness === null || data.witness === undefined)

  if (hasSignature && hasWitness) {
    return [false, { error_message: "Signature and witness must not both be present"}]
  }

  let signatureHash = ""
  if (hasSignature) {
    let sigStatus
    [ok, sigStatus] = verifySignature(
      data,
      data.metadata.previous_verification_hash
    )
    result.status.signature = sigStatus
    signatureHash = data.signature.signature_hash
  } else if (hasWitness) {
    // Witness
    const [witnessStatus, witnessResult] = await verifyWitness(
      data.witness,
      //as of version v1.2 Aqua protocol it takes always the previous verification hash
      //as a witness and a signature MUST create a new revision of the Aqua-Chain
      data.metadata.previous_verification_hash,
      doVerifyMerkleProof
    )
    result.witness_result = witnessResult
    result.status.witness = witnessStatus

    // Specify witness correctness
    ok = result.status.witness !== "INVALID"
  }

  const calculatedVerificationHash = calculateVerificationHash(
    contentHash,
    metadataHash,
    signatureHash,
    data.witness ? data.witness.witness_hash : ""
  )

  if (calculatedVerificationHash !== verificationHash) {
    result.status.verification = INVALID_VERIFICATION_STATUS
    return [false, result]
  } else {
    result.status.verification = VERIFIED_VERIFICATION_STATUS
  }

  return [ok, result]
}

function calculateStatus(count: number, totalLength: number) {
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
  verbose: boolean | undefined,
  doVerifyMerkleProof: boolean
) {
  let revisionInput

  VERBOSE = verbose

  let elapsed
  let totalElapsed = 0.0
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
      doVerifyMerkleProof
    )
    elapsed = getElapsedTime(elapsedStart)
    detail.elapsed = elapsed
    totalElapsed += elapsed
    if (!isCorrect) {
      yield [false, detail]
      return
    }
    yield [true, detail]
  }
}

async function verifyPage(input, verbose, doVerifyMerkleProof) {
  let verificationHashes
  verificationHashes = Object.keys(input.offline_data.revisions)
  console.log("Page Verification Hashes: ", verificationHashes)

  let count = 0
  if (verificationHashes.length > 0) {
    // Print out the verification hash of the first one.
    console.log(`${count + 1}. Verification of ${verificationHashes[0]}.`)
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
    formatter.printRevisionInfo(detail, verbose)
    details.revision_details.push(detail)
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
  return [verificationStatus, details]
}

async function readFromMediaWikiAPI(server, title) {
  let response, data
  response = await fetch(
    `${server}/rest.php/data_accounting/get_page_last_rev?page_title=${title}`,
  )
  data = await response.json()
  if (!response.ok) {
    formatter.log_red(`Error: get_page_last_rev: ${data.message}`)
  }
  const verificationHash = data.verification_hash
  response = await fetch(
    `${server}/rest.php/data_accounting/get_branch/${verificationHash}`
  )
  data = await response.json()
  const hashes = data.hashes
  const revisions = {}
  for (const vh of hashes) {
    response = await fetch(
      `${server}/rest.php/data_accounting/get_revision/${vh}`
    )
    revisions[vh] = await response.json()
  }
  return { revisions }
}

async function verifyPageFromMwAPI(server, title, verbose, ignoreMerkleProof) {
  const verifiedContent = await readFromMediaWikiAPI(server, title)
  const input = { offline_data: verifiedContent}
  return await verifyPage(input, verbose, !ignoreMerkleProof)
}

export {
  generateVerifyPage,
  verifyPage,
  apiVersion,
  // For verified_import.js
  ERROR_VERIFICATION_STATUS,
  // For notarize.js
  getHashSum,
  calculateMetadataHash,
  calculateVerificationHash,
  calculateSignatureHash,
  // For the VerifyPage Chrome extension and CLI
  verifyPageFromMwAPI,
  formatter,
}
