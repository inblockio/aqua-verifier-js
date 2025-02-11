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

import { createAquaTree, logAquaTree } from "./aquavhtree.js"
import Aquafier from "aqua-protocol"

import { fileURLToPath } from "url"
import { dirname } from "path"

// import { Wallet, Mnemonic } from 'ethers';
import { readCredentials, getWallet, estimateWitnessGas } from "./utils.js"
// import { isOk } from "rustic"

import rusticPkg from 'rustic';
const { isOk } = rusticPkg;

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
  --v
    To print all the logs
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

const enableVerbose = argv["v"]
const enableRemoveRevision = argv["rm"]
const linkURIs = argv["link"]
const enableLink = !!linkURIs
const form_file_name = argv["form"]
let network = argv["network"]
let witness_platform_type = argv["type"]

const port = 8420
const host = "localhost"
const serverUrl = `http://${host}:${port}`




const prepareNonce = () => {
  return randomBytes(32).toString('base64url');
}

const printLogs = (logs) => {
  if (enableVerbose) {
    logs.forEach(element => {
      console.log(element.log)
    });
  } else {

    logs.forEach(element => {
      if (element.logType == "error") {
        console.log(element.log)
      }
    });

  }
}

const revisionWithMultipleAquaChain = async (timestamp, revisionType, aquaFileName, aquafier) => {


  if (!filename.includes(",")) {
    console.error("Multiple files must be separated by commas");
    process.exit(1);
  }

  // read files
  let all_aqua_files = filename.split(",");
  // let all_file_aqua_objects = [];

  // ie filename.aqua.json => "specified revision"
  // if specified revision is empty use last revision
  // const all_file_aqua_objects_map = new Map();
  // let all_file_aqua_objects_list = [];
  // const revisionSPecifiedMap = new Map();

  let aquaObjectWrapperList = [];
  let logs = [];

  for (const file_item of all_aqua_files) {

    let fileNameOnly = ""
    let revisionHashSpecified = ""

    console.log("File name loop ", file_item);
    if (file_item.includes("@")) {

      const filenameParts = file_item.split("@");
      if (filenameParts.length > 2) {
        console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
        process.exit(1);
      }
      fileNameOnly = filenameParts[0];

      revisionHashSpecified = filenameParts[1];

      if (revisionHashSpecified.length == 0) {
        console.error("Revision hash is empty.  Please provide a valid revision hash.");
        process.exit(1);
      }

      // revisionSPecifiedMap.set(fileNameOnly, revisionSpecified);
    } else {
      fileNameOnly = file_item;

    }

    let fileContentOfFileNameOnly = "";

    try {
      fileContentOfFileNameOnly = await fs.readFileSync(fileNameOnly, "utf-8");


    } catch (error) {
      console.error(`Error reading ${fileNameOnly}:`, error);
      process.exit(1);
    }



    const filePath = `${fileNameOnly}.aqua.json`;

    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      process.exit(1);
    }

    try {
      const fileContent = await fs.readFileSync(filePath, "utf-8");
      const aquaTree = JSON.parse(fileContent);
      console.log(`Successfully read: ${filePath}`);

      if (revisionHashSpecified.length == 0) {
        const revisions = aquaTree.revisions;
        const verificationHashes = Object.keys(revisions);
        revisionHashSpecified = verificationHashes[verificationHashes.length - 1];
      }

      let fileObject = {
        fileName: fileNameOnly,
        fileContent: fileContentOfFileNameOnly,
        path: "./"
      }

      let aquaObjectWrapper = {
        aquaTree: aquaTree,
        fileObject: fileObject,
        revision: revisionHashSpecified,
      }


      aquaObjectWrapperList.push(aquaObjectWrapper)
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
  }
  console.log("All files read successfully \n",);

  if (revisionType == "witness") {


    if (witness_platform_type == undefined) {
      witness_platform_type = creds.witness_eth_platform
      if (creds.witness_eth_platform.length == 0) {
        witness_platform_type = "eth"
      }

    }
    if (network == undefined) {
      network = creds.witness_eth_network
      if (creds.witness_eth_network.length == 0) {
        network = "sepolia"
      }
    }
    let witnessResult = aquafier.witnessMultipleAquaTrees(aquaObjectWrapperList, witnessMethod, network, witness_platform_type, creds, enableScalar);

    if (witnessResult.isOk()) {
      // serializeAquaTree(aquaFilename, witnessResult.data.aquaTree)
      let logs = witnessResult.data.logData
      logs.map(log => console.log(log.log))
      // logAquaTree(signatureResult.data.aquaTree.tree)
    } else {
      let logs = witnessResult.data
      logs.map(log => console.log(log.log))
    }


  } else if (revisionType == "signing") {

    const signatureResult = await aquafier.signMultipleAquaTrees(aquaObjectWrapper, signMethod, creds, enableScalar)

    if (signatureResult.isOk()) {
      // serializeAquaTree(aquaFilename, signatureResult.data.aquaTree)
      let logs_result = signatureResult.data.logData
      logs.concat(logs_result)
      // logs.map(log => console.log(log.log))
      // logAquaTree(signatureResult.data.aquaTree.tree)
    } else {
      let logs_result = signatureResult.data
      logs.concat(logs_result)
      // logs.map(log => console.log(log.log))
    }

  } else {
    console.log(`Revision of type ${revisionType} not allowed`);
    process.exit(1)
  }


  printLogs(logs);

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

    console.log("File name loop ", file_item);
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
      const aquaTree = JSON.parse(fileContent);
      console.log(`Successfully read: ${filePath}`);
      // all_file_aqua_objects.push(aquaTree);
      all_file_aqua_objects_map.set(fileNameOnly, aquaTree);
      all_file_aqua_objects_list.push(aquaTree)
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
      process.exit(1);
    }
  }
  console.log("All files read successfully \n",);
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

  console.log("All last revision hashes  \n", lastRevisionOrSpecifiedHashes);


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
    console.log("Current file ", current_file);
    const filenameParts = current_file.split("@");
    if (filenameParts.length > 2) {
      console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
      process.exit(1);
    }
    let fileNameOnly = filenameParts[0];

    let latestRevisionKey = ""
    console.log("All revisions map ", JSON.stringify(revisionSPecifiedMap))
    if (revisionSPecifiedMap.has(fileNameOnly)) {
      console.log()


      latestRevisionKey = revisionSPecifiedMap.get(fileNameOnly);

      console.log("Setting previous revision to a specific on ", latestRevisionKey);

    } else {
      latestRevisionKey = revisionKeys.pop(); // Get the last key

    }
    console.log("Latest revision key:", latestRevisionKey);

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
      console.log("Create revision with multiple aqua chain.")
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
    serializeAquaTree(filePath, current_file_aqua_object)
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

        console.log("Wallet address: ", walletAddress)

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

        console.log("cli signing result: ", witnessCliResult)

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





const getLatestVH = (uri) => {
  const aquaTree = JSON.parse(fs.readFileSync(uri))
  const verificationHashes = Object.keys(aquaTree.revisions)
  return verificationHashes[verificationHashes.length - 1]
}

const serializeAquaTree = (aquaFilename, aquaTree) => {
  try {
    // Convert the object to a JSON string
    const jsonString = JSON.stringify(aquaTree, null, 2);
    fs.writeFileSync(aquaFilename, jsonString, "utf8");
  } catch (error) {
    console.error("Error writing file:", error);
    process.exit(1);
  }
}

const checkFileHashAlreadyNotarized = (fileHash, aquaTree) => {
  // Check if this file hash already exists in any revision
  const existingRevision = Object.values(aquaTree.revisions).find(
    (revision) => revision.file_hash && revision.file_hash === fileHash,
  )

  if (existingRevision) {
    console.log(
      `Abort. No new revision created.\n \nA new content revision is obsolete as a content revision with the same file hash (${fileHash}) already exists. `,
    )
    process.exit(1)
  }
}

const maybeUpdateFileIndex = (aquaTree, verificationData, revisionType, aquaFileName) => {
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
      aquaTree.file_index[verificationHash] = form_file_name
      break
    case "file":
      verificationHash = verificationData.verification_hash
      // fileHash = verificationData.data.file_hash
      aquaTree.file_index[verificationHash] = aquaFileName //filename
      break
    case "link":

      const linkURIsArray = linkURIs.split(",")
      const linkVHs = verificationData.data.link_verification_hashes
      for (const [idx, vh] of linkVHs.entries()) {
        aquaTree.file_index[vh] = `${linkURIsArray[idx]}`
      }
  }
}

const removeRevision = (aquaTree, lastRevisionHash, aquaFilename) => {
  const lastRevision = aquaTree.revisions[lastRevisionHash]
  switch (lastRevision.revision_type) {
    case "file":
      delete aquaTree.file_index[lastRevision.file_hash]
      break
    case "link":
      for (const vh of lastRevision.link_verification_hashes) {
        delete aquaTree.file_index[vh]
      }
  }

  delete aquaTree.revisions[lastRevisionHash]
  console.log(`Most recent revision ${lastRevisionHash} has been removed`)


  if (Object.keys(aquaTree.revisions).length === 0) {
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
    let aquaObjectWithTree = createAquaTree(aquaTree)

    serializeAquaTree(aquaFilename, aquaObjectWithTree)
  }
}

const createNewRevision = async (
  fileNameOnly,
  targetHash,
  timestamp,
  revision_type,
  enableScalar,
  aquaTree,
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

        checkFileHashAlreadyNotarized(fileHash, aquaTree)

        verificationData["content"] = fileContent.toString("utf8")

        console.log("📄 content flag detected  file  :", enableContent);
      } else {
        const fileContent = fs.readFileSync(fileNameOnly); //filename)
        fileHash = main.getHashSum(fileContent)

        checkFileHashAlreadyNotarized(fileHash, aquaTree)
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
      checkFileHashAlreadyNotarized(fileHash, aquaTree)
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
        if (!(fh in aquaTree.file_index)) return
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

const createGenesisRevision = async (aquaFilename, timestamp, fileNameOnly,aquafier ) => {

  if (enableRemoveRevision) {
    // Don't serialize if you do --rm during genesis creation
    console.log("There is nothing delete.")
    return
  }

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

 
  const fileContent = fs.readFileSync(aquaFilename.replace(".aqua.json", ""), { encoding: "utf-8" });
  let fileObject = {
    fileName: aquaFilename.replace(".aqua.json", ""),
    fileContent: fileContent,
    path: "./"
  }
  const genesisRevision = await aquafier.createGenesisRevision(fileObject, false, false, enableScalar)

  if (genesisRevision.isOk()) {
    let aquaTree = genesisRevision.data.aquaTree
    console.log(
      `- Writing new ${revisionType} revision ${Object.keys(aquaTree.revisions)[0]} to ${filename}.aqua.json`,
    )
    serializeAquaTree(aquaFilename, aquaTree)
  }

  // const aquaTree = createNewAquaTree()
  // const revisions = aquaTree.revisions

  // const genesis = await createNewRevision(
  //   fileNameOnly,
  //   "",
  //   timestamp,
  //   revisionType,
  //   enableScalar,
  //   aquaTree,
  // )


  // revisions[genesis.verification_hash] = genesis.data


  // maybeUpdateFileIndex(aquaTree, genesis, revisionType, fileNameOnly)

}

  // The main function
  ; (async function () {

    let fileNameOnly = "";
    let revisionHashSpecified = "";


    if (filename.includes("@") && !filename.includes(",")) {
      const filenameParts = filename.split("@");
      if (filenameParts.length > 2) {
        console.error("-> Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash.");
        process.exit(1);
      }
      fileNameOnly = filenameParts[0];

      revisionHashSpecified = filenameParts[1];

      if (revisionHashSpecified.length == 0) {
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

    // Instantiate the Aquafier class
    const aquafier = new Aquafier()

    if (filename.includes(",")) {
      if (revisionType == "witness" || revisionType == "link") {
        // createRevisionWithMultipleAquaChain(timestamp, revisionType, aquaFilename)
        revisionWithMultipleAquaChain(timestamp, revisionType, aquaFilename, aquafier);
        return
      } else {
        console.log("❌ only revision type witness and link work with multiple aqua chain as the file name")
        process.exit(1)
      }
    }

    if (!fs.existsSync(aquaFilename)) {
      createGenesisRevision(aquaFilename, timestamp, fileNameOnly, aquafier)
      return
    }



    const aquaTree = JSON.parse(fs.readFileSync(aquaFilename))
    const revisions = aquaTree.revisions
    const verificationHashes = Object.keys(revisions)
    const lastRevisionHash = verificationHashes[verificationHashes.length - 1]

    if (enableRemoveRevision) {
      // console.log(aquaTree)
      let result = aquafier.removeLastRevision(aquaTree)

      if (result.isOk()) {
        const resultData = result.data
        console.log(JSON.stringify(resultData, null, 4))
        if (resultData.aquaTree === null || !resultData.aquaTree) {
          try {
            fs.unlinkSync(aquaFilename)
          } catch (e) {
            console.log(`❌ Unable to delete file. ${e}`)
          }
        }
        else {
          serializeAquaTree(aquaFilename, resultData.aquaTree)
        }
      }
      else {
        console.log("❌ Unable to remove last revision")
      }
      return
    }


    if (revisionHashSpecified.length > 0) {
      console.log("📍  Revision specified: ", revisionHashSpecified)

      if (!verificationHashes.includes(revisionHashSpecified)) {
        console.error(`❌  Revision hash ${revisionHashSpecified} not found in ${aquaFilename}`);
        process.exit(1);
      }
    } else {
      revisionHashSpecified = verificationHashes[verificationHashes.length - 1]
    }


    if (enableSignature && enableWitness) {
      formatter.log_red("❌ you cannot sign & witness at the same time")
      process.exit(1)
    }

    console.log("➡️   Revision type: ", revisionType)


    if (enableContent) {
      const fileContent = fs.readFileSync(fileNameOnly, { encoding: "utf-8" });
      const _aquaObject = fs.readFileSync(aquaFilename, { encoding: "utf-8" });
      let fileObject = {
        fileName: fileNameOnly,
        fileContent: fileContent,
        path: "./"
      }

      let aquaObjectWrapper = {
        aquaTree: JSON.parse(_aquaObject),
        fileObject: fileObject,
        revision: "",
      }

      const aquaObjectResultForContent = await aquafier.createContentRevision(aquaObjectWrapper, fileObject, enableScalar)
      if (aquaObjectResultForContent.isOk()) {
        serializeAquaTree(aquaFilename, aquaObjectResultForContent.data.aquaTree)
      } else {
        let logs = aquaObjectResultForContent.data
        logs.map(log => console.log(log.log))

      }
      return
    }

    let logs = [];
    const creds = readCredentials()

    const fileContent = fs.readFileSync(fileNameOnly, { encoding: "utf-8" });
    const _aquaObject = fs.readFileSync(aquaFilename, { encoding: "utf-8" });
    const parsedAquaTree = JSON.parse(_aquaObject)

    let fileObject = {
      fileName: fileNameOnly,
      fileContent: fileContent,
      path: "./"
    }

    if (!revisionHashSpecified || revisionHashSpecified.length == 0) {
      console.log(`Revision hash error ${revisionHashSpecified}`);
      process.exit(1);
    }

    let aquaObjectWrapper = {
      aquaTree: parsedAquaTree,
      fileObject: fileObject,
      revision: revisionHashSpecified,
    }

    // console.log(`Revision data ${JSON.stringify(parsedAquaTree)}`)

    if (enableSignature) {


      const signatureResult = await aquafier.signAquaTree(aquaObjectWrapper, signMethod, creds, enableScalar)

      if (signatureResult.isOk()) {
        serializeAquaTree(aquaFilename, signatureResult.data.aquaTree)
        let logs_result = signatureResult.data.logData
        logs.concat(logs_result)
        // logs.map(log => console.log(log.log))
        // logAquaTree(signatureResult.data.aquaTree.tree)
      } else {
        let logs_result = signatureResult.data
        logs.concat(logs_result)
        // logs.map(log => console.log(log.log))
      }


      printLogs(logs);
      return
    }

    if (enableWitness) {



      if (witness_platform_type == undefined) {
        witness_platform_type = creds.witness_eth_platform
        if (creds.witness_eth_platform.length == 0) {
          witness_platform_type = "eth"
        }

      }
      if (network == undefined) {
        network = creds.witness_eth_network
        if (creds.witness_eth_network.length == 0) {
          network = "sepolia"
        }
      }



      // console.log(`Witness Aqua object  witness_platform_type : ${witness_platform_type}, network : ${network} , witnessMethod : ${witnessMethod}   , enableScalar : ${enableScalar} \n creds ${JSON.stringify(creds)} `)
      const witnessResult = await aquafier.witnessAquaTree(parsedAquaTree, witnessMethod, network, witness_platform_type, creds, enableScalar)

      if (witnessResult.isOk()) {
        serializeAquaTree(aquaFilename, witnessResult.data.aquaTree)
        let logs_result = witnessResult.data.logData
        logs.concat(logs_result)
        // logs.map(log => console.log(log.log))
        // logAquaTree(signatureResult.data.aquaTree.tree)
      } else {
        let logs_result = witnessResult.data
        logs.concat(logs_result)
        // logs.map(log => console.log(log.log))
      }

      printLogs(logs);

      return
    }


    // const verificationHash = verificationData.verification_hash
    // revisions[verificationHash] = verificationData.data
    // console.log(`1. Writing new revision ${verificationHash} to ${aquaFilename}`)

    // let theIndexFileName = fileNameOnly;
    // if (enableContent != undefined && enableContent.length > 0) {
    //   theIndexFileName = enableContent
    //   maybeUpdateFileIndex(aquaTree, verificationData, revisionType, enableContent)
    // } else {
    //   maybeUpdateFileIndex(aquaTree, verificationData, revisionType, fileNameOnly)
    // }

    // serializeAquaTree(aquaFilename, aquaTree)

    // // Tree creation
    // let aquaObjectWithTree = createAquaTree(aquaTree)

    // serializeAquaTree(aquaFilename, aquaObjectWithTree)
  })()
