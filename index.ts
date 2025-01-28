// @ts-nocheck
import { Buffer } from "buffer"
// End of compatibility with browsers.

import * as fs from "fs"
import hrtime from "browser-process-hrtime"
import { MerkleTree } from "merkletreejs"

// utilities for verifying signatures
import * as ethers from "ethers"

import * as formatter from "./formatter.js"
import * as witnessNostr from "./witness_nostr.js"
import * as witnessEth from "./witness_eth.js"
import * as witnessTsa from "./witness_tsa.js"
import * as did from "./did.js"
import crypto from "crypto"

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

const dict2Leaves = (obj) => {
  return Object.keys(obj)
    .sort()  // MUST be sorted for deterministic Merkle tree
    .map((key) => getHashSum(`${key}:${obj[key]}`))
}

// TODO in the Rust version, you should infer what the hashing algorithm
// and the digest size are from the multihash itself. Instead of assuming that
// it is SHA2-256
function getHashSum(content: string) {
  return crypto.createHash("sha256").update(content).digest('hex')
}

const getFileHashSum = (filename) => {
  const content = fs.readFileSync(filename)
  return getHashSum(content)
}

async function readExportFile(filename) {
  if (!fs.existsSync(filename)) {
    formatter.log_red(`ERROR: The file ${filename} does not exist.`)
    process.exit(1)
  }
  const fileContent = fs.readFileSync(filename)
  if (!filename.endsWith(".json")) {
    formatter.log_red("The file must have a .json extension")
    process.exit(1)
  }
  const offlineData = JSON.parse(fileContent)
  if (!("revisions" in offlineData)) {
    formatter.log_red("The json file doesn't contain 'revisions' key.")
    process.exit(1)
  }
  return offlineData
}

const getUnixPathFromAquaPath = (aquaPath: string) => {
  const arr = aquaPath.split("/")
  return arr.slice(3).join("/")
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
  const result = {
    tx_hash: witnessData.witness_transaction_hash,
    witness_network: witnessData.witness_network,
    result: "",
    error_message: "",
    merkle_root: witnessData.witness_merkle_root,
    witness_timestamp: witnessData.witness_timestamp,
    doVerifyMerkleProof: doVerifyMerkleProof,
    merkle_proof_status: "",
  }

  let isValid: boolean
  if (witnessData.witness_network === "nostr") {
    isValid = await witnessNostr.verify(
      witnessData.witness_transaction_hash,
      witnessData.witness_merkle_root,
      witnessData.witness_timestamp,
    )
  } else if (witnessData.witness_network === "TSA_RFC3161") {
    isValid = await witnessTsa.verify(
      witnessData.witness_transaction_hash,
      witnessData.witness_merkle_root,
      witnessData.witness_timestamp,
    )
  } else {
    // Verify the transaction hash via the Ethereum blockchain
    const _result = await witnessEth.verify(
      witnessData.witness_network,
      witnessData.witness_transaction_hash,
      witnessData.witness_merkle_root,
      witnessData.witness_timestamp,
    )
    result.result = _result

    if (_result !== "true" && _result !== "false") {
      result.error_message = _result
    }
    isValid = _result === "true"
  }
  result.isValid = isValid

  // At this point, we know that the witness matches.
  if (doVerifyMerkleProof) {
    // Only verify the witness merkle proof when verifyWitness is successful,
    // because this step is expensive.

    //todo this will improved
    // const merkleProofIsOK = verifyMerkleIntegrity(
    //   JSON.parse(witnessData.witness_merkle_proof),
    //   verification_hash,
    // )
    // result.merkle_proof_status = merkleProofIsOK ? "VALID" : "INVALID"
    // if (!merkleProofIsOK) {
    //   return ["INVALID", result]
    // }
  }
  return [isValid ? "VALID" : "INVALID", result]
}

const verifySignature = async (data: object, verificationHash: string) => {
  // TODO enforce that the verificationHash is a correct SHA3 sum string
  // Specify signature correctness
  let signatureOk = false
  if (verificationHash === "") {
    // The verificationHash MUST NOT be empty. This also implies that a genesis revision cannot
    // contain a signature.
    return [signatureOk, "INVALID"]
  }

  // Signature verification
  switch (data.signature_type) {
    case "did:key":
      signatureOk = await did.signature.verify(data.signature, data.signature_public_key, verificationHash)
      break
    case "ethereum:eip-191":
      // The padded message is required
      const paddedMessage = `I sign this revision: [${verificationHash}]`
      try {
        const recoveredAddress = ethers.recoverAddress(
          ethers.hashMessage(paddedMessage),
          data.signature,
        )
        signatureOk =
          recoveredAddress.toLowerCase() ===
          data.signature_wallet_address.toLowerCase()
      } catch (e) {
        // continue regardless of error
      }
      break
  }

  const status = signatureOk ? "VALID" : "INVALID"
  return [signatureOk, status]
}

function verifyRevisionMerkleTreeStructure(input, result: VerificationResult, verificationHash: string) {
  let ok: boolean = true
  let vhOk: boolean = true

  // Ensure mandatory claims are present
  const mandatory = {
    file: ["file_hash", "file_nonce"],
    link: ["link_verification_hashes"],
    signature: ["signature"],
    witness: ["witness_merkle_root"],
    form: [],
  }[input.revision_type]

  const mandatoryClaims = ["previous_verification_hash", "local_timestamp", ...mandatory]

  for (const claim of mandatoryClaims) {
    if (!(claim in input)) {
      return [false, { error_message: `mandatory field ${claim} is not present` }]
    }
  }



  const leaves = input.leaves
  delete input.leaves
  const actualLeaves = []
  let fieldsWithPartialVerification: string[] = []
  let fieldsWithVerification: string[] = []

  if (input.revision_type === 'form') {
    let contains_deleted_fields = false

    Object.keys(input).sort().forEach((field, i: number) => {
      let new_hash = getHashSum(`${field}:${input[field]}`)

      if (!field.endsWith('.deleted')) {
        if (field.startsWith('forms_')) {
          fieldsWithVerification.push(`${field}: ${input[field]}`)
        }
        if (new_hash !== leaves[i]) {
          ok = false
          console.log(`🚫 New hash does not match existing hash ${leaves[i]}:${new_hash} at index: ${i}`)
        }
      } else {
        contains_deleted_fields = true
        fieldsWithPartialVerification.push(field)
      }
    })

    if (contains_deleted_fields) {
      console.warn(`\n  🚨 Warning: The following fields cannot be verified:`)
      fieldsWithPartialVerification.forEach((field, i: number) => console.log(`   ${i + 1}. ${field.replace('.deleted', '')}\n`))
    }

    console.log("\n  The following fields were verified successfully: ")
    fieldsWithVerification.forEach(field => console.log(`   ✅${field}\n`))

  }
  else {

    // Verify leaves
    for (const [i, claim] of Object.keys(input).sort().entries()) {
      const actual = getHashSum(`${claim}:${input[claim]}`)
      const claimOk = leaves[i] === actual
      result.status[claim] = claimOk
      ok = ok && claimOk
      actualLeaves.push(actual)
    }

    // Verify verification hash
    const tree = new MerkleTree(leaves, getHashSum, {
      duplicateOdd: false,
    })
    const hexRoot = tree.getHexRoot()
    vhOk = hexRoot === verificationHash
  }


  ok = ok && vhOk
  return [ok, result]
}


interface Status {
  verification: string;
  type_ok: boolean;
}

interface WitnessResult {
  [key: string]: any
}

interface Input {
  revision_type: string;
}

interface VerificationResult {
  scalar: boolean;
  verification_hash: string;
  status: Status;
  witness_result: WitnessResult;
  file_hash: string;
  data: Input;
  revision_type: string;
}

/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies a revision from a page.
 * Steps:
 * - Calls verify_page API passing revision id.
 * - Calls function verifyWitness using data from the verify_page API call.
 * - Calculates the verification hash using content hash,
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
  doVerifyMerkleProof: boolean,
  aquaObject,
) {

  let ok: boolean = true

  // We use fast scalar verification if input does not have leaves property
  const isScalar = !input.hasOwnProperty('leaves');

  let result: VerificationResult = {
    scalar: false,
    verification_hash: verificationHash,
    status: {
      verification: INVALID_VERIFICATION_STATUS,
      type_ok: false,
    },
    witness_result: {},
    file_hash: "",
    data: input,
    revision_type: input.revision_type,
  }

  if (isScalar) {

    result.scalar = true
    const actualVH = "0x" + getHashSum(JSON.stringify(input))
    ok = actualVH === verificationHash
  } else {
    [ok, result] = verifyRevisionMerkleTreeStructure(input, result, verificationHash)
    if (!ok) {
      return [ok, result]
    }
  }

  let typeOk: boolean, _
  switch (input.revision_type) {
    case "form":
      typeOk = true;
      break
    case "file":
      let fileContent: Buffer
      if (!!input.content) {
        fileContent = Buffer.from(input.content, "utf8")
      } else {
        fileContent = fs.readFileSync(aquaObject.file_index[verificationHash])
      }
      const fileHash = getHashSum(fileContent)
      typeOk = fileHash === input.file_hash
      break
    case "signature":
      // Verify signature
      [typeOk, _] = await verifySignature(
        input,
        input.previous_verification_hash,
      )
      break
    case "witness":
      // Verify witness
      const [witnessStatus, witnessResult] = await verifyWitness(
        input,
        input.previous_verification_hash,
        doVerifyMerkleProof,
      )
      result.witness_result = witnessResult

      // Specify witness correctness
      typeOk = (witnessStatus === "VALID")
      break
    case "link":
      let linkOk: boolean = true
      for (const [idx, vh] of input.link_verification_hashes.entries()) {
        // const fileUri = getUnixPathFromAquaPath(aquaObject.file_index[fileHash])
        const fileUri = aquaObject.file_index[vh];
        const aquaFileUri = `${fileUri}.aqua.json`
        const linkAquaObject = await readExportFile(aquaFileUri)
        let linkStatus: string
        [linkStatus, _] = await verifyPage(linkAquaObject, false, doVerifyMerkleProof)
        const expectedVH = input.link_verification_hashes[idx]
        const linkVerificationHashes = Object.keys(linkAquaObject.revisions)
        const actualVH = linkVerificationHashes[linkVerificationHashes.length - 1]
        linkOk = linkOk && (linkStatus === VERIFIED_VERIFICATION_STATUS) && (expectedVH == actualVH)
      }
      typeOk = linkOk
      break
  }
  result.status.type_ok = typeOk ? "valid" : "invalid"
  result.status.verification = ok ? VERIFIED_VERIFICATION_STATUS : INVALID_VERIFICATION_STATUS

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

let seenRevisions = []

async function* generateVerifyPage(
  verificationHashes,
  aquaObject,
  verbose: boolean | undefined,
  doVerifyMerkleProof: boolean,
) {
  VERBOSE = verbose

  let elapsed
  let totalElapsed = 0.0
  for (const vh of verificationHashes) {

    if (seenRevisions.length > 0) {
      let exists = seenRevisions.find(item => item === vh);
      if (exists !== undefined) {
        yield (null, {})
        return
      }
    }

    seenRevisions.push(vh)

    const elapsedStart = hrtime()

    const [isCorrect, detail] = await verifyRevision(
      vh,
      aquaObject.revisions[vh],
      doVerifyMerkleProof,
      aquaObject,
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
  verificationHashes = Object.keys(input.revisions)
  console.log("Page Verification Hashes: ", verificationHashes)
  let verificationStatus

  // Secure feature to detect detached chain, missing genesis revision
  const firstRevision =
    input.revisions[verificationHashes[verificationHashes.length - 1]]
  if (!firstRevision.previous_verification_hash === "") {
    verificationStatus = INVALID_VERIFICATION_STATUS
    console.log(`Status: ${verificationStatus}`)
    return [verificationStatus, null]
  }

  let count = 0
  if (verificationHashes.length > 0) {
    // Print out the verification hash of the first one.
    console.log(`${count + 1}. Verification of Revision ${verificationHashes[0]}`)
  }
  const details = {
    verification_hashes: verificationHashes,
    revision_details: [],
  }
  for await (const value of generateVerifyPage(
    verificationHashes,
    input,
    verbose,
    doVerifyMerkleProof,
  )) {
    const [isCorrect, detail] = value

    if (isCorrect === null) {
      console.log("Exiting loop 1.")
      process.exit(1)
    }

    formatter.printRevisionInfo(detail, verbose)
    details.revision_details.unshift(detail)
    if (!isCorrect) {
      verificationStatus = INVALID_VERIFICATION_STATUS
      break
    }
    count += 1
    console.log(
      `  Progress: ${count} / ${verificationHashes.length} (${(
        (100 * count) /
        verificationHashes.length
      ).toFixed(1)}%)`,
    )
    if (count < verificationHashes.length) {
      console.log(
        `${count + 1}. Verification of Revision ${verificationHashes[count]}`,
      )
    }
  }
  verificationStatus = calculateStatus(count, verificationHashes.length)
  console.log(`Status: ${verificationStatus}`)
  return [verificationStatus, details]
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

export {
  generateVerifyPage,
  verifyPage,
  apiVersion,
  // For verified_import.js
  ERROR_VERIFICATION_STATUS,
  // For notarize.js
  dict2Leaves,
  getHashSum,
  getFileHashSum,
  // For the VerifyPage Chrome extension and CLI
  formatter,
  checkAPIVersionCompatibility,
  readExportFile,
}
