#!/usr/bin/env node

import * as fs from "fs"
import { randomBytes } from "crypto"

import * as ethers from "ethers"
import minimist from "minimist"
import * as http from "http"
import { MerkleTree } from "merkletreejs"

import * as main from "./index.js"
import * as formatter from "./formatter.js"

import * as did from "./did.js"
// Witness support for nostr network
import * as witnessNostr from "./witness_nostr.js"
import * as witnessEth from "./witness_eth.js"
import * as witnessTsa from "./witness_tsa.js"

import { createAquaTree } from "./aquavhtree.js"

import { fileURLToPath } from "url"
import { dirname } from "path"

// import { Wallet, Mnemonic } from 'ethers';
import { readCredentials, getWallet, estimateWitnessGas } from "./utils.js"

const opts = {
  // This is required so that -v is position independent.
  boolean: ["v", "scalar", "rm"],
  string: ["sign", "link", "witness", "content"],
}

const usage = () => {
  console.log(`Usage:
notarize.js [OPTIONS] <filename>
which generates filename.aqua.json

Options:
  --sign [cli|metamask|did]
    Sign with either of:
    1. the Ethereum seed phrase provided in mnemonic.txt
    2. MetaMask
    3. DID key
  --witness [eth|nostr|tsa]
    Witness with either of:
    1. Ethereum on-chain with MetaMask
    2. Nostr network
    3. TSA DigiCert
  --link <filename.aqua.json>
    Add a link to an AQUA chain as a dependency
  --scalar
    Use this flag to use a more lightweight, "scalar" aquafication.
    This is the default option.
  --content
    Use this flag to include the content file instead of just its hash and name
  --rm
    Remove the most recent revision of the AQUA file
  --form
    Use this flag to include the json file with form data
  --network
    Use this flag to switch between 'mainnet' and 'sepolia' when witnessing
  --type 
    Use this flag to switch between metamask and cli wallet when witnessing 
`)
}

const argv = minimist(process.argv.slice(2), opts)
const filename = argv._[0]

if (!filename) {
  formatter.log_red("ERROR: You must specify a file")
  usage()
  process.exit(1)
}

const signMethod = argv["sign"]
const enableSignature = !!signMethod
// all revisions are scalar by default other than the forms revisions
// to reduce comput cost and time
let enableScalar = argv["scalar"]
let vTree = argv["vtree"]
const witnessMethod = argv["witness"]
const enableWitness = !!witnessMethod
const enableContent = argv["content"]

const enableRemoveRevision = argv["rm"]
const linkURIs = argv["link"]
const enableLink = !!linkURIs
const form_file_name = argv["form"]
const network = argv["network"]
const witness_platform_type = argv["type"]

const port = 8420
const host = "localhost"
const serverUrl = `http://${host}:${port}`

const doSign = async (wallet, verificationHash) => {
  const message = "I sign this revision: [" + verificationHash + "]"
  const signature = await wallet.signMessage(message)
  return signature
}

const signMetamaskHtml = `
<html>
  <script>
const message = "MESSAGETOBESIGNED";
const localServerUrl= window.location.href;
const doSignProcess = async () => {
  const wallet_address = window.ethereum.selectedAddress
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, window.ethereum.selectedAddress],
  })
  document.getElementById("signature").innerHTML = \`Signature of your file: \${signature} (you may close this tab)\`
  await fetch(localServerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({signature, wallet_address})
  })
}
if (window.ethereum && window.ethereum.isMetaMask) {
  if (window.ethereum.isConnected() && window.ethereum.selectedAddress) {
    doSignProcess()
  } else {
    window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(doSignProcess)
      .catch((error) => {
        console.error(error);
        alert(error.message);
      })
  }
} else {
  alert("Metamask not detected")
}
  </script>
<body>
    <div id="signature"></div>
</body>
</html>
`

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const doSignMetamask = async (verificationHash) => {
  const maxAttempts = 24; // 2 minute timeout (12 * 5 seconds)
  let attempts = 0;

  const messageToBeSigned = "I sign this revision: [" + verificationHash + "]"
  const html = signMetamaskHtml.replace("MESSAGETOBESIGNED", messageToBeSigned)
  const requestListener = witnessEth.commonPrepareListener(html)
  const server = http.createServer(requestListener)
  try {
    server.listen(port, host, () => {
      console.log(`Server is running on ${serverUrl}`)
    })
    let response, content
    while (attempts < maxAttempts) {
      response = await fetch(serverUrl + "/result")
      content = await response.json()
      if (content.signature) {
        const signature = content.signature
        const walletAddress = content.wallet_address
        const publicKey = ethers.SigningKey.recoverPublicKey(
          ethers.hashMessage(messageToBeSigned),
          signature,
        )
        console.log(`The signature has been retrieved: ${signature}`)
        server.close()
        return [signature, walletAddress, publicKey]
      }
      console.log("Waiting for the signature...")
      attempts++;
      await sleep(5000);
    }

    console.error("Signature timeout: No response from MetaMask");
    server.close();
    process.exit(1);
  } catch (error) {
    server.close();
    throw error;
  }
}

const prepareNonce = () => {
  return randomBytes(32).toString('base64url');
}

const createRevisionWithMultipleAquaChain = async (timestamp, revisionType, aquaFileName) => {
  if (!filename.includes(",")) {
    console.error("Multiple files must be separated by commas");
    process.exit(1);
  }

  // read files
  let all_aqua_files = filename.split(",");
  // let all_file_aqua_objects = [];

  // ie filename.aqua.json => "specified revision"
  // if specified revision is empty use last revision
  const all_file_aqua_objects_map = new Map();
  let all_file_aqua_objects_list = [];
  const revisionSPecifiedMap = new Map();

  for (const file_item of all_aqua_files) {

    let fileNameOnly = ""
    let revisionSpecified = ""

    // console.log("File name loop ", file_item);
    if (file_item.includes("@")) {

      const filenameParts = file_item.split("@");
      if (filenameParts.length > 2) {
        console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
        process.exit(1);
      }
      fileNameOnly = filenameParts[0];

      revisionSpecified = filenameParts[1];

      if (revisionSpecified.length == 0) {
        console.error("Revision hash is empty.  Please provide a valid revision hash.");
        process.exit(1);
      }

      revisionSPecifiedMap.set(fileNameOnly, revisionSpecified);
    } else {
      fileNameOnly = file_item;
    }
    const filePath = `${fileNameOnly}.aqua.json`;

    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      process.exit(1);
    }

    try {
      const fileContent = await fs.readFileSync(filePath, "utf-8");
      const aquaObject = JSON.parse(fileContent);
      // console.log(`Successfully read: ${filePath}`);
      // all_file_aqua_objects.push(aquaObject);
      all_file_aqua_objects_map.set(fileNameOnly, aquaObject);
      all_file_aqua_objects_list.push(aquaObject)
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
  }
  // console.log("All files read successfully \n",);
  // get the last verification hash
  let lastRevisionOrSpecifiedHashes = [];

  for (const [key, value] of all_file_aqua_objects_map) {

    // console.log(`key ${key}  and value ${value}`);

    const verificationHashes = Object.keys(value.revisions);
    // if aqua filname has specified revision use it instead of the last revision

    if (revisionSPecifiedMap.has(key)) {
      let revisionSpecified = revisionSPecifiedMap.get(key);
      if (verificationHashes.includes(revisionSpecified)) {
        lastRevisionOrSpecifiedHashes.push(revisionSpecified)
      } else {
        console.error(`Error revision  ${revisionSpecified} in  file ${key}.aqua.json not found`);
        process.exit(1);
      }
    } else {

      lastRevisionOrSpecifiedHashes.push(verificationHashes[verificationHashes.length - 1]);
    }

    // 
  }

  // console.log("All last revision hashes  \n", lastRevisionOrSpecifiedHashes);


  let revisionResult = {};

  if (revisionType == "witness") {
    const tree2 = new MerkleTree(lastRevisionOrSpecifiedHashes, main.getHashSum, {
      duplicateOdd: false,
    })

    let merkleRoot = tree2.getHexRoot();
    let merkleProofArray = [];

    lastRevisionOrSpecifiedHashes.forEach((hash) => {
      let merkleProof = tree2.getHexProof(hash);
      merkleProofArray.push(merkleProof);
    });

    console.log("Merkle proof: ", merkleProofArray);



    revisionResult = await prepareWitness(merkleRoot);

    revisionResult.witness_merkle_proof = lastRevisionOrSpecifiedHashes;
  } else {


    // console.log(`linkURIs ${linkURIs}`)
    let linkURIsArray = [];
    if (linkURIs.includes(",")) {
      linkURIsArray = linkURIs.split(",")
    } else {
      linkURIsArray.push(linkURIs);
    }

    const linkAquaFiles = linkURIsArray.map((e) => `${e}.aqua.json`)
    const linkVerificationHash = linkAquaFiles.map(getLatestVH)
    const linkFileHashes = linkURIsArray.map(main.getFileHashSum)


    revisionResult = {
      link_type: "aqua",
      //link_require_indepth_verification: true,
      link_verification_hashes: linkVerificationHash,
      link_file_hashes: linkFileHashes,
    }

  }


  for (let index = 0; index < all_aqua_files.length; index++) {
    const current_file = all_aqua_files[index];
    const current_file_aqua_object = all_file_aqua_objects_list[index];
    // console.log("current_file_aqua_object ", JSON.stringify(current_file_aqua_object))

    const revisionKeys = Object.keys(current_file_aqua_object.revisions);
    // if no specified revision use the last one 
    // if one is specified use the last one 
    // console.log("Current file ", current_file);
    const filenameParts = current_file.split("@");
    if (filenameParts.length > 2) {
      console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
      process.exit(1);
    }
    let fileNameOnly = filenameParts[0];

    let latestRevisionKey = ""
    // console.log("All revisions map ", JSON.stringify(revisionSPecifiedMap))
    if (revisionSPecifiedMap.has(fileNameOnly)) {
      // console.log()


      latestRevisionKey = revisionSPecifiedMap.get(fileNameOnly);

      // console.log("Setting previous revision to a specific on ", latestRevisionKey);

    } else {
      latestRevisionKey = revisionKeys.pop(); // Get the last key

    }
    // console.log("Latest revision key:", latestRevisionKey);

    let verificationData = {};

    if (revisionType == "witness") {
      verificationData = {
        previous_verification_hash: latestRevisionKey,
        local_timestamp: timestamp,
        revision_type: revisionType,
        ...revisionResult
      }
    } else if (revisionType == "link") {

      // console.log("Array 1 of revision results " + JSON.stringify(revisionResult.link_file_hashes));
      // console.log("Array 2 of current_file_aqua_object " + JSON.stringify(current_file_aqua_object));
      // for (let item in current_file_aqua_object.file_index) {
      //   console.log("item  ", item);
      //   if (revisionResult.link_file_hashes.includes(item)){
      //     console.error(
      //       `${fh} detected in file index. You are not allowed to interlink Aqua files of the same file`,
      //     )
      //   process.exit(1)
      //   }
      // }

      verificationData = {
        previous_verification_hash: latestRevisionKey,
        local_timestamp: timestamp,
        revision_type: revisionType,
        ...revisionResult
      }
    } else {
      // console.log("Create revision with multiple aqua chain.")
      process.exit(1)
    }


    const revisions = current_file_aqua_object.revisions
    // Merklelize the dictionary
    const leaves = main.dict2Leaves(verificationData)
    if (enableScalar == false || vTree == true) {
      verificationData.leaves = leaves;
    }
    const tree = new MerkleTree(leaves, main.getHashSum, {
      duplicateOdd: false,
    })
    const verificationHash = tree.getHexRoot()
    revisions[verificationHash] = verificationData
    // console.log(`\n\n Writing new revision ${verificationHash} to ${current_file} current file current_file_aqua_object ${JSON.stringify(current_file_aqua_object)} \n\n `)
    maybeUpdateFileIndex(current_file_aqua_object, {
      verification_hash: verificationHash,
      data: verificationData
    }, revisionType, fileNameOnly);
    const filePath = `${fileNameOnly}.aqua.json`;
    serializeAquaObject(filePath, current_file_aqua_object)
  }
  return true;
}

const prepareWitness = async (verificationHash) => {
  if (!witnessMethod) {
    console.error("Witness method must be specified");
    process.exit(1);
  }

  let options_array = ["nostr", "tsa", "eth"];
  if (!options_array.includes(witnessMethod)) {
    console.log(`❌ An invalid witness method provided ${witnessMethod}.\n💡 Hint use on of  ${options_array.join(",")}`);
    process.exit(1);
  }

  const merkle_root = verificationHash
  let witness_network,
    smart_contract_address,
    transactionHash,
    publisher,
    witnessTimestamp;

  switch (witnessMethod) {
    case "nostr":
      // publisher is a public key used for nostr
      // transaction hash is an event identifier for nostr
      ;[transactionHash, publisher, witnessTimestamp] =
        await witnessNostr.witness(merkle_root)
      witness_network = "nostr"
      smart_contract_address = "N/A"
      break
    case "tsa":
      const tsaUrl = "http://timestamp.digicert.com" // DigiCert's TSA URL
        ;[transactionHash, publisher, witnessTimestamp] =
          await witnessTsa.witness(merkle_root, tsaUrl)
      witness_network = "TSA_RFC3161"
      smart_contract_address = tsaUrl
      break
    case "eth":
      let useNetwork = "sepolia"
      if (network === "mainnet") {
        useNetwork = "mainnet"
      }
      witness_network = useNetwork
      smart_contract_address = "0x45f59310ADD88E6d23ca58A0Fa7A55BEE6d2a611";

      if (witness_platform_type === "cli") {
        let creds = readCredentials();
        let [wallet, walletAddress, publicKey] = getWallet(creds.mnemonic);

        // console.log("Wallet address: ", walletAddress)

        let gasEstimateResult = await estimateWitnessGas(walletAddress, merkle_root, witness_network, smart_contract_address, null);

        console.log("Gas estimate result: ", gasEstimateResult)

        if (gasEstimateResult.error !== null) {
          console.log(`Unable to Estimate gas fee: ${gasEstimateResult?.error}`)
          process.exit(1)
        }

        if (!gasEstimateResult.hasEnoughBalance) {
          console.log(`You do not have enough balance to cater for gas fees`)
          console.log(`Add some faucets to this wallet address: ${walletAddress}\n`)
          process.exit(1)
        }


        // = async (walletPrivateKey, witness_event_verification_hash, smart_contract_address, providerUrl) 
        let witnessCliResult = await witnessEth.witnessCli(
          wallet.privateKey,
          merkle_root,
          smart_contract_address,
          witness_network,
          null
        )

        // console.log("cli signing result: ", witnessCliResult)

        if (witnessCliResult.error !== null) {
          console.log(`Unable to witnesss: ${witnessCliResult.error}`,)
          process.exit(1)
        }

        transactionHash = witnessCliResult.transactionHash
        publisher = walletAddress
      } else {
        [transactionHash, publisher] = await witnessEth.witnessMetamask(
          merkle_root,
          witness_network,
          smart_contract_address,
        )
      }

      witnessTimestamp = Math.floor(Date.now() / 1000)
      break
    default:
      console.error(`Unknown witness method: ${witnessMethod}`)
      process.exit(1)
  }
  const witness = {
    witness_merkle_root: merkle_root,
    witness_timestamp: witnessTimestamp,
    // Where is it stored: ChainID for ethereum, btc, nostr
    witness_network,
    // Required for the the publishing of the hash
    witness_smart_contract_address: smart_contract_address,
    // Transaction hash to locate the verification hash
    witness_transaction_hash: transactionHash,
    // Publisher / Identifier for publisher
    witness_sender_account_address: publisher,
    // Optional for aggregated witness hashes
    witness_merkle_proof: [
      verificationHash
      // {
      //   depth: "0",
      //   left_leaf: verificationHash,
      //   right_leaf: null,
      //   successor: merkle_root,
      // },
    ],
  }
  return witness
}

const createNewAquaObject = () => {
  return { revisions: {}, file_index: {} }
}

function formatMwTimestamp(ts) {
  // Format timestamp into the timestamp format found in Mediawiki outputs
  return ts
    .replace(/-/g, "")
    .replace(/:/g, "")
    .replace("T", "")
    .replace("Z", "")
}

const getFileTimestamp = (filename) => {
  const fileStat = fs.statSync(filename)
  // Last modified time
  const mtime = JSON.stringify(fileStat.mtime)
  const timestamp = formatMwTimestamp(mtime.slice(1, mtime.indexOf(".")))
  return timestamp
}




const prepareSignature = async (previousVerificationHash) => {
  let signature, walletAddress, publicKey, signature_type
  let options_array = ["metamask", "cli", "did"];
  if (!options_array.includes(signMethod)) {
    console.log(`❌ An invalid sign method provided ${signMethod}.\n💡 Hint use on of  ${options_array.join(",")}`);
    process.exit(1);
  }
  switch (signMethod) {
    case "metamask":
      ;[signature, walletAddress, publicKey] = await doSignMetamask(
        previousVerificationHash,
      )
      signature_type = "ethereum:eip-191"
      break
    case "cli":
      try {
        const credentials = readCredentials()
        let wallet
          ;[wallet, walletAddress, publicKey] = getWallet(credentials.mnemonic)
        signature = await doSign(wallet, previousVerificationHash)
      } catch (error) {
        console.error("Failed to read mnemonic:", error)
        process.exit(1)
      }
      signature_type = "ethereum:eip-191"
      break
    case "did":
      const credentials = readCredentials()
      if (credentials['did:key'].length === 0 || !credentials['did:key']) {

        console.log("DID key is required.  Please get a key from https://hub.ebsi.eu/tools/did-generator")

        process.exit(1)
      }

      const { jws, key } = await did.signature.sign(
        previousVerificationHash,
        Buffer.from(credentials["did:key"], "hex"),
      )
      signature = jws //jws.payload
      walletAddress = key
      publicKey = key
      signature_type = "did:key"
      break
  }
  return {
    signature,
    signature_public_key: publicKey,
    signature_wallet_address: walletAddress,
    signature_type,
  }
}

const getLatestVH = (uri) => {
  const aquaObject = JSON.parse(fs.readFileSync(uri))
  const verificationHashes = Object.keys(aquaObject.revisions)
  return verificationHashes[verificationHashes.length - 1]
}

const serializeAquaObject = (aquaFilename, aquaObject) => {
  try {
    // Convert the object to a JSON string
    const jsonString = JSON.stringify(aquaObject, null, 2);
    fs.writeFileSync(aquaFilename, jsonString, "utf8");
  } catch (error) {
    console.error("Error writing file:", error);
    process.exit(1);
  }
}

const checkFileHashAlreadyNotarized = (fileHash, aquaObject) => {
  // Check if this file hash already exists in any revision
  const existingRevision = Object.values(aquaObject.revisions).find(
    (revision) => revision.file_hash && revision.file_hash === fileHash,
  )

  if (existingRevision) {
    console.log(
      `Abort. No new revision created.\n \nA new content revision is obsolete as a content revision with the same file hash (${fileHash}) already exists. `,
    )
    process.exit(1)
  }
}

const maybeUpdateFileIndex = (aquaObject, verificationData, revisionType, aquaFileName) => {
  const validRevisionTypes = ["file", "form", "link"];
  //if (!validRevisionTypes.includes(revisionType)) {
  //  console.error(`Invalid revision type for file index: ${revisionType}`);
  //  return;
  //}
  let verificationHash = "";
 
  switch (revisionType) {
    case "form":
      verificationHash = verificationData.verification_hash
      // fileHash = verificationData.data.file_hash
      aquaObject.file_index[verificationHash] = form_file_name
      break
    case "file":
      verificationHash = verificationData.verification_hash
      // fileHash = verificationData.data.file_hash
      aquaObject.file_index[verificationHash] = aquaFileName //filename
      break
    case "link":

      const linkURIsArray = linkURIs.split(",")
      const linkVHs = verificationData.data.link_verification_hashes
      for (const [idx, vh] of linkVHs.entries()) {
        aquaObject.file_index[vh] = `${linkURIsArray[idx]}`
      }
  }
}

const removeRevision = (aquaObject, lastRevisionHash, aquaFilename) => {
  const lastRevision = aquaObject.revisions[lastRevisionHash]
  switch (lastRevision.revision_type) {
    case "file":
      delete aquaObject.file_index[lastRevision.file_hash]
      break
    case "link":
      for (const vh of lastRevision.link_verification_hashes) {
        delete aquaObject.file_index[vh]
      }
  }

  delete aquaObject.revisions[lastRevisionHash]
  console.log(`Most recent revision ${lastRevisionHash} has been removed`)


  if (Object.keys(aquaObject.revisions).length === 0) {
    // If there are no revisions left, delete the .aqua.json file
    try {
      fs.unlinkSync(aquaFilename)
      console.log(
        `${aquaFilename} has been deleted because there are no revisions left.`,
      )
      // Since we've deleted the file, there's no need to return here; the script should end.
    } catch (err) {
      console.error(`Failed to delete ${aquaFilename}:`, err)
    }
  } else {
    let aquaObjectWithTree = createAquaTree(aquaObject)

    serializeAquaObject(aquaFilename, aquaObjectWithTree)
  }
}

const createNewRevision = async (
  fileNameOnly,
  targetHash,
  timestamp,
  revision_type,
  enableScalar,
  aquaObject,
) => {
  const validRevisionTypes = ["file", "signature", "witness", "form", "link"];
  if (!validRevisionTypes.includes(revision_type)) {
    console.error(`Invalid revision type: ${revision_type}`);
    process.exit(1);
  }

  let verificationData = {
    previous_verification_hash: targetHash, //previousVerificationHash,
    local_timestamp: timestamp,
    revision_type,
  }

  let fileHash
  switch (revision_type) {
    case "file":


      if (enableContent != undefined && enableContent.length > 0) {

        const fileContent = fs.readFileSync(enableContent); //filename)
        fileHash = main.getHashSum(fileContent)

        checkFileHashAlreadyNotarized(fileHash, aquaObject)

        verificationData["content"] = fileContent.toString("utf8")

        console.log("📄 content flag detected  file  :", enableContent);
      } else {
        const fileContent = fs.readFileSync(fileNameOnly); //filename)
        fileHash = main.getHashSum(fileContent)

        checkFileHashAlreadyNotarized(fileHash, aquaObject)
      }
      verificationData["file_hash"] = fileHash
      verificationData["file_nonce"] = prepareNonce()
      break
    case "signature":
      const sigData = await prepareSignature(targetHash)
      verificationData = { ...verificationData, ...sigData }
      break
    case "witness":
      const witness = await prepareWitness(targetHash)
      verificationData = { ...verificationData, ...witness }
      // verificationData.witness_merkle_proof = JSON.stringify(
      //   verificationData.witness_merkle_proof,
      // )
      break
    case "form":
      let form_data
      try {
        // Read the file
        form_data = fs.readFileSync(form_file_name)
      } catch (readError) {
        // Handle file read errors (e.g., file not found, permission issues)
        console.error(
          "Error: Unable to read the file. Ensure the file exists and is accessible.",
        )
        process.exit(1)
      }

      // Calculate the hash of the file
      fileHash = main.getHashSum(form_data)
      checkFileHashAlreadyNotarized(fileHash, aquaObject)
      verificationData["file_hash"] = fileHash
      verificationData["file_nonce"] = prepareNonce()

      let form_data_json
      try {
        // Attempt to parse the JSON data
        form_data_json = JSON.parse(form_data)
      } catch (parseError) {
        // Handle invalid JSON data
        console.error("Error: The file does not contain valid JSON data.")
        process.exit(1)
      }

      // Sort the keys
      let form_data_sorted_keys = Object.keys(form_data_json)
      let form_data_sorted_with_prefix = {}
      for (let key of form_data_sorted_keys) {
        form_data_sorted_with_prefix[`forms_${key}`] = form_data_json[key]
      }

      verificationData = {
        ...verificationData,
        ...form_data_sorted_with_prefix,
      }
      break

    case "link":
      // console.log(" linkURIs ", linkURIs);
      const linkURIsArray = linkURIs.split(",")
      // Validation
      linkURIsArray.map((uri) => {
        if (!uri.endsWith(".aqua.json")) return
        console.error(`${uri} is an Aqua file hence not applicable`)
        process.exit(1)
      })

      // console.log(" linkURIsArray ", JSON.stringify(linkURIsArray));
      const linkAquaFiles = linkURIsArray.map((e) => `${e}.aqua.json`)
      const linkVHs = linkAquaFiles.map(getLatestVH)

      // console.log("linkVHs ", linkVHs);

      const linkFileHashes = linkURIsArray.map(main.getFileHashSum)
      // Validation again
      linkFileHashes.map((fh) => {
        if (!(fh in aquaObject.file_index)) return
        console.error(
          `${fh} detected in file index. You are not allowed to interlink Aqua files of the same file`,
        )
        process.exit(1)
      })

      const linkData = {
        link_type: "aqua",
        //link_require_indepth_verification: true,
        link_verification_hashes: linkVHs,
        link_file_hashes: linkFileHashes,
      }
      verificationData = { ...verificationData, ...linkData }
  }

  if (enableScalar) {
    // A simpler version of revision -- scalar
    const scalarData = verificationData //JSON.stringify(verificationData)
    return {
      verification_hash:
        "0x" + main.getHashSum(JSON.stringify(verificationData)),
      data: scalarData,
    }
  }


  // Merklelize the dictionary
  const leaves = main.dict2Leaves(verificationData)
  const tree = new MerkleTree(leaves, main.getHashSum, {
    duplicateOdd: false,
  })

  verificationData.leaves = leaves
  return {
    verification_hash: tree.getHexRoot(),
    data: verificationData,
  }


}

const createGenesisRevision = async (aquaFilename, timestamp, fileNameOnly) => {
  let revisionType = "file"
  if (form_file_name) {
    revisionType = "form"

    if (form_file_name != aquaFilename.replace(/\.aqua\.json$/, "")) {
      console.log(
        `First Revision  : Form file name is not the same as the aqua file name \n  Form : ${form_file_name}  File : ${aquaFilename}`,
      )
      process.exit(1)
    }
  }

  const aquaObject = createNewAquaObject()
  const revisions = aquaObject.revisions

  const genesis = await createNewRevision(
    fileNameOnly,
    "",
    timestamp,
    revisionType,
    enableScalar,
    aquaObject,
  )
  if (enableRemoveRevision) {
    // Don't serialize if you do --rm during genesis creation
    console.log("There is nothing delete.")
    return
  }
  revisions[genesis.verification_hash] = genesis.data
  console.log(
    `- Writing new ${revisionType} revision ${genesis.verification_hash} to ${filename}.aqua.json`,
  )
  maybeUpdateFileIndex(aquaObject, genesis, revisionType, fileNameOnly)
  serializeAquaObject(aquaFilename, aquaObject)
}

  // The main function
  ; (async function () {

    let fileNameOnly = "";
    let revisionSpecified = "";


    if (filename.includes("@") && !filename.includes(",")) {
      const filenameParts = filename.split("@");
      if (filenameParts.length > 2) {
        console.error("-> Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash.");
        process.exit(1);
      }
      fileNameOnly = filenameParts[0];

      revisionSpecified = filenameParts[1];

      if (revisionSpecified.length == 0) {
        console.error("Revision hash is empty.  Please provide a valid revision hash.");
        process.exit(1);
      }
    } else {
      fileNameOnly = filename;
    }

    const aquaFilename = fileNameOnly + ".aqua.json"
    // const timestamp = getFileTimestamp(filename)
    // We use "now" instead of the modified time of the file
    const now = new Date().toISOString()
    const timestamp = formatMwTimestamp(now.slice(0, now.indexOf(".")))
    if (!form_file_name) {
      enableScalar = true
    }
    if (vTree) {
      enableScalar = false
    }


    let revisionType = "file"
    if (enableSignature) {
      revisionType = "signature"
    } else if (enableWitness) {
      revisionType = "witness"
    } else if (enableLink) {
      revisionType = "link"
    } else if (form_file_name) {
      revisionType = "form"
      enableScalar = false
    }

    if (filename.includes(",")) {
      if (revisionType == "witness" || revisionType == "link") {
        createRevisionWithMultipleAquaChain(timestamp, revisionType, aquaFilename)
        return
      } else {
        console.log("❌ only revision type witness and link work with multiple aqua chain as the file name")
        process.exit(1)
      }
    }

    if (!fs.existsSync(aquaFilename)) {
      createGenesisRevision(aquaFilename, timestamp, fileNameOnly)
      return
    }

    const aquaObject = JSON.parse(fs.readFileSync(aquaFilename))
    const revisions = aquaObject.revisions
    const verificationHashes = Object.keys(revisions)
    const lastRevisionHash = verificationHashes[verificationHashes.length - 1]

    if (enableRemoveRevision) {
      removeRevision(aquaObject, lastRevisionHash, aquaFilename)

      return
    }

    let revisionHashSpecified = ""

    if (revisionSpecified.length > 0) {
      console.log("📍  Revision specified: ", revisionSpecified)

      if (!verificationHashes.includes(revisionSpecified)) {
        console.error(`❌  Revision hash ${revisionSpecified} not found in ${aquaFilename}`);
        process.exit(1);
      }
      revisionHashSpecified = revisionSpecified
    } else {
      revisionHashSpecified = verificationHashes[verificationHashes.length - 1]
    }


    if (enableSignature && enableWitness) {
      formatter.log_red("❌ you cannot sign & witness at the same time")
      process.exit(1)
    }

    console.log("➡️   Revision type: ", revisionType)

    const verificationData = await createNewRevision(
      fileNameOnly,
      revisionHashSpecified,
      timestamp,
      revisionType,
      enableScalar,
      aquaObject,
    )
    const verificationHash = verificationData.verification_hash
    revisions[verificationHash] = verificationData.data
    console.log(`1. Writing new revision ${verificationHash} to ${aquaFilename}`)

    let theIndexFileName = fileNameOnly;
    if (enableContent != undefined && enableContent.length > 0) {
      theIndexFileName = enableContent
      maybeUpdateFileIndex(aquaObject, verificationData, revisionType, enableContent)
    } else {
      maybeUpdateFileIndex(aquaObject, verificationData, revisionType, fileNameOnly)
    }

    serializeAquaObject(aquaFilename, aquaObject)

    // Tree creation
    let aquaObjectWithTree = createAquaTree(aquaObject)

    serializeAquaObject(aquaFilename, aquaObjectWithTree)
  })()
