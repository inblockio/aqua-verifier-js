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
import Aquafier from "aquafier-js-sdk"

import { fileURLToPath } from "url"
import { dirname } from "path"

// import { Wallet, Mnemonic } from 'ethers';
import { readCredentials, getWallet, estimateWitnessGas, formatMwTimestamp, createGenesisRevision, serializeAquaTree, readAndCreateAquaTreeAndAquaTreeWrapper, printLogs, revisionWithMultipleAquaChain } from "./utils.js"
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

const signMethod = argv["sign"];
const enableSignature = !!signMethod;
// all revisions are scalar by default other than the forms revisions
// to reduce comput cost and time
let enableScalar = argv["scalar"];
let vTree = argv["vtree"];
const witnessMethod = argv["witness"];
const enableWitness = !!witnessMethod;
const enableContent = argv["content"];

const enableVerbose = argv["v"];
const enableRemoveRevision = argv["rm"];
const linkURIs = argv["link"];
const enableLink = !!linkURIs;
const form_file_name = argv["form"];
let network = argv["network"];
let witness_platform_type = argv["type"];


(async function () {

  let fileNameOnly = "";
  let revisionHashSpecified = "";
  let logs = [];


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
    if (filename.includes(".aqua.json")) {
      fileNameOnly = filename.replace(".aqua.json", "")
    } else {
      fileNameOnly = filename;
    }
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
      revisionWithMultipleAquaChain(revisionType, fileNameOnly, aquafier, linkURIs, enableVerbose, enableScalar, witness_platform_type, network, witnessMethod);
      return
    } else {
      console.log("❌ only revision type witness and link work with multiple aqua chain as the file name")
      process.exit(1)
    }
  }

  if (!fs.existsSync(aquaFilename)) {
    createGenesisRevision(aquaFilename, form_file_name, enableScalar, aquafier)
    return
  }



  const aquaTree = JSON.parse(fs.readFileSync(aquaFilename))
  if (!aquaTree) {
    console.error(`❌  Fatal Error! Aqua Tree does not exist`);

    // TODO: Check whether this procedure is okay
    // We create a new object and proceed
    createGenesisRevision(aquaFilename, form_file_name, enableScalar, aquafier)
    // process.exit(1);
  }
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

  const creds = readCredentials()

  const aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified)

  if (revisionType == "file") {
    let alreadyNotarized = aquafier.checkIfFileAlreadyNotarized(aquaTreeWrapper.aquaTree, aquaTreeWrapper.aquaTreeWrapper.fileObject)
    if (alreadyNotarized) {
      formatter.log_red(`❌ file ${fileNameOnly} has already been notarized`)
      process.exit(1)
    }
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

    let aquaTreeWrapper = {
      aquaTree: JSON.parse(_aquaObject),
      fileObject: fileObject,
      revision: "",
    }

    const aquaObjectResultForContent = await aquafier.createContentRevision(aquaTreeWrapper, fileObject, enableScalar)
    if (aquaObjectResultForContent.isOk()) {
      serializeAquaTree(aquaFilename, aquaObjectResultForContent.data.aquaTree)
      logs.push(...aquaObjectResultForContent.data.logData)
    } else {
      let enableContentlogs = aquaObjectResultForContent.data
      logs.push(...enableContentlogs)
    }

    printLogs(logs, enableVerbose);
    return
  }


  // console.log(`Revision data ${JSON.stringify(parsedAquaTree)}`)

  if (enableSignature) {


    const signatureResult = await aquafier.signAquaTree(aquaTreeWrapper.aquaTreeWrapper, signMethod, creds, enableScalar)

    if (signatureResult.isOk()) {
      console.log(JSON.stringify(signatureResult.data, null, 4))
      serializeAquaTree(aquaFilename, signatureResult.data.aquaTree)
      let logs_result = signatureResult.data.logData
      logs.push(...logs_result)
    } else {
      let logs_result = signatureResult.data
      logs.push(...logs_result)
    }
    printLogs(logs, enableVerbose);
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
    const witnessResult = await aquafier.witnessAquaTree(aquaTreeWrapper.aquaTree, witnessMethod, network, witness_platform_type, creds, enableScalar)

    if (witnessResult.isOk()) {
      serializeAquaTree(aquaFilename, witnessResult.data.aquaTree)
      let logs_result = witnessResult.data.logData
      logs.push(...logs_result)
      // logs.map(log => console.log(log.log))
      // logAquaTree(signatureResult.data.aquaTree.tree)
    } else {
      let logs_result = witnessResult.data
      logs.push(...logs_result)
      // logs.map(log => console.log(log.log))
    }

    printLogs(logs, enableVerbose);

    return
  }

  if (enableLink) {

    let linkResult = null //: Result<AquaOperationData, LogData[]> | null = null;
    if (linkURIs.includes(",") && fileNameOnly.includes(",")) {
      console.log("➡️   Link many to many not allowed, specify either multiple link URI or multiple files but not both.");
      process.exit(1)

    } else if (linkURIs.includes(",") && !fileNameOnly.includes(",")) {


      let containsNameInLink = linkURIs.split(",").find((e) => e == fileNameOnly);
      if (containsNameInLink) {
        console.error("⛔   aqua file name also find in link, possible cyclic linking found");
        process.exit(1)
      }
      console.log("➡️   Linking an AquaTree to multiple AquaTrees")
      let linkAquaTreeWrappers = []
      linkURIs.split(",").map((file) => {
        let _aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(file, "").aquaTreeWrapper
        linkAquaTreeWrappers.push(_aquaTreeWrapper)
      })
      let _singAquaTree = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified).aquaTreeWrapper


      linkResult = await aquafier.linkAquaTreesToMultipleAquaTrees(_singAquaTree, linkAquaTreeWrappers, enableScalar)


    } else {


      let containsNameInLink = fileNameOnly.split(",").find((e) => e == linkURIs);
      if (containsNameInLink) {
        console.error("aqua file name also find in link, possible cyclic linking found");
        process.exit(1)
      }
      console.log("Linking multiple AquaTree to a single AquaTrees")


      let aquaTreeWrappers = []
      if (fileNameOnly.includes(",")) {
        fileNameOnly.split(",").map((file) => {
          let _aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(file, "").aquaTreeWrapper
          aquaTreeWrappers.push(_aquaTreeWrapper)
        })
      } else {
        let _singAquaTree = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified).aquaTreeWrapper
        aquaTreeWrappers.push(_singAquaTree)
      }

      const linkAquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(linkURIs, revisionHashSpecified).aquaTreeWrapper
      linkResult = await aquafier.linkMultipleAquaTrees(aquaTreeWrappers, linkAquaTreeWrapper, enableScalar)

    }
    if (linkResult == null) {
      console.error("A critical erroroccured linking aquatrees");
      process.exit(1)
    }

    if (linkResult.isOk()) {
      const aquaTreesResults = linkResult.data
      const aquaTrees = aquaTreesResults.aquaTrees

      if (aquaTreesResults.aquaTree != null && aquaTreesResults.aquaTree != undefined) {

        let aquaTree = aquaTreesResults.aquaTree
        const hashes = Object.keys(aquaTree.revisions)
        const aquaTreeFilename = aquaTree.file_index[hashes[0]]
        serializeAquaTree(`${aquaTreeFilename}.aqua.json`, aquaTree)
      }
      if (aquaTrees.length > 0) {
        for (let i = 0; i < aquaTrees.length; i++) {
          const aquaTree = aquaTrees[i];
          const hashes = Object.keys(aquaTree.revisions)
          const aquaTreeFilename = aquaTree.file_index[hashes[0]]
          serializeAquaTree(`${aquaTreeFilename}.aqua.json`, aquaTree)
        }
      }

      // serializeAquaTree(aquaFilename, linkResult.data.aquaTree)
      let logs_result = aquaTreesResults.logData
      logs.push(...logs_result)
      // logs.map(log => console.log(log.log))
      // logAquaTree(signatureResult.data.aquaTree.tree)
    } else {
      let logs_result = linkResult.data
      logs.push(...logs_result)
      // logs.map(log => console.log(log.log))
    }

    printLogs(logs, enableVerbose);

    return
  }


})()
