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


  // The main function
(async function () {

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


  })()
