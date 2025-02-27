#!/usr/bin/env node

import * as fs from "fs"

import minimist from "minimist"

import * as formatter from "./formatter.js"

import Aquafier, { printLogs } from "aquafier-js-sdk"


import {
  readCredentials,
  createGenesisRevision,
  serializeAquaTree,
  readAndCreateAquaTreeAndAquaTreeWrapper,
  revisionWithMultipleAquaChain
} from "./utils.js"



const opts = {
  // This is required so that -v is position independent.
  boolean: ["v", "scalar", "rm", "graph", "content"],
  string: ["sign", "link", "witness" ],
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
  --tree
    Use this flag to use to create a verification tree.
    This option is slower than scalar but provides a better garantee.
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
  --graph 
    Use this flag to generate a graph of the aqua tree in the console/terminal

Example :
  1. Notarize a file
     -> using --tree option to have verification hash leaves
      ./notarize.js README.md --tree
     -> create a gensis revision tha is a form 
       ./notarize.js README.md --form  README.md

  2. verify an aqua tree 
      ./verify README.md

  3. Witness
    -> multple aqua trees using eth option  
      ./notarize.js LICENSE,README.md --witness eth --tree --type sepolia

  4. Signing 
    -> using metemask 
      ./notarize.js --sign metamask <FILE_PATH>
    -> using cli 
      ./notarize.js --sign cli <FILE_PATH>

  5. Linking 
    -> Linking a single aqua tree to another single aqua tree 
      ./notarize.js  <FILE_PATH>  --link  <FILE_PATH>
    -> Linking a multiple aqua tree to another single aqua tree 
      ./notarize.js  <FILE_PATH>,<FILE_PATH>  --link  <FILE_PATH>
    -> Linking a single aqua tree to another multiple aqua tree 
      ./notarize.js  <FILE_PATH> --link  <FILE_PATH>,<FILE_PATH> 
   
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
let vTree = argv["tree"];
const witnessMethod = argv["witness"];
const enableWitness = !!witnessMethod;
const enableContent = argv["content"];

const enableVerbose = argv["v"];
const enableRemoveRevision = argv["rm"];
const linkURIs = argv["link"];
const enableLink = !!linkURIs;
const enableForm = argv["form"];
let network = argv["network"];
let witness_platform_type = argv["type"];
let showGraph = argv["graph"];



(async function () {

  await run();
})()


export async function run(argvData: minimist.ParsedArgs = argv) {

  let fileNameOnly = "";
  let revisionHashSpecified = "";
  let logs = [];


  if (filename.includes("@") && !filename.includes(",")) {
    const filenameParts = filename.split("@");
    if (filenameParts.length > 2) {
      formatter.log_red("-> Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash.");
      process.exit(1);
    }
    fileNameOnly = filenameParts[0];

    revisionHashSpecified = filenameParts[1];

    if (revisionHashSpecified.length == 0) {
      formatter.log_red("Revision hash is empty.  Please provide a valid revision hash.");
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
  // const now = new Date().toISOString()
  // const timestamp = formatMwTimestamp(now.slice(0, now.indexOf(".")))
  if (!enableForm) {
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
  } else if (enableForm) {
    revisionType = "form"
    enableScalar = false
  }

  // Instantiate the Aquafier class
  const aquafier = new Aquafier()

  if (filename.includes(",")) {
   
    if (revisionType == "witness" || revisionType == "link") {
      revisionWithMultipleAquaChain(revisionType, fileNameOnly, aquafier, linkURIs, enableVerbose, enableScalar, witness_platform_type, network, witnessMethod, signMethod);
      return
    } else {
      console.log("❌ only revision type witness and link work with multiple aqua chain as the file name")
      process.exit(1)
    }
  }

  if (!fs.existsSync(aquaFilename)) {
    // console.log("🔥  Creating a new Aqua Tree")
    createGenesisRevision(aquaFilename, enableForm, enableScalar, enableContent, aquafier)
    return
  }



  const aquaTree = JSON.parse(fs.readFileSync(aquaFilename, 'utf8'));

  if (!aquaTree) {
    formatter.log_red(`❌  Fatal Error! Aqua Tree does not exist`);

    // TODO: Check whether this procedure is okay
    // We create a new object and proceed
    createGenesisRevision(aquaFilename, enableForm, enableScalar, enableContent, aquafier)
    // process.exit(1);
  }
  const revisions = aquaTree.revisions
  const verificationHashes = Object.keys(revisions)
  const lastRevisionHash = verificationHashes[verificationHashes.length - 1]

  if (showGraph) {
    console.log("Rendering the aqua tree\n")
    aquafier.renderTree(aquaTree)
    return
  }

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
      formatter.log_red(`❌  Revision hash ${revisionHashSpecified} not found in ${aquaFilename}`);
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
      serializeAquaTree(aquaFilename, aquaObjectResultForContent.data.aquaTree!)
      logs.push(...aquaObjectResultForContent.data.logData)
    } else {
      let enableContentlogs = aquaObjectResultForContent.data
      logs.push(...enableContentlogs)
    }

    printLogs(logs, enableVerbose);
    return
  }


  if (enableForm) {

    if (!fs.existsSync(enableForm)) {
      formatter.log_red(`ERROR: The file ${enableForm} does not exist.`)
      process.exit(1)
    }

    const fileContent = fs.readFileSync(enableForm, { encoding: "utf-8" });

    try {
      const offlineData = JSON.parse(fileContent)
    } catch (e) {
      formatter.log_red(`ERROR: The  form file ${enableForm} does not contain valid json.`)
      process.exit(1)
    }

    let fileObject = {
      fileName: enableForm,
      fileContent: fileContent,
      path: "./"
    }

    const aquaObjectResultForForm = await aquafier.createFormRevision(aquaTreeWrapper.aquaTreeWrapper, fileObject, enableScalar)
    if (aquaObjectResultForForm.isOk()) {
      serializeAquaTree(aquaFilename, aquaObjectResultForForm.data.aquaTree!)
      logs.push(...aquaObjectResultForForm.data.logData)
    } else {
      let enableContentlogs = aquaObjectResultForForm.data
      logs.push(...enableContentlogs)
    }

    printLogs(logs, enableVerbose);
    return
  }

  if (enableSignature) {

    let options_array = ["metamask", "cli", "did"];
    if (!options_array.includes(signMethod)) {
      console.log(`❌ An invalid sign method provided ${signMethod}.\n💡 Hint use on of  ${options_array.join(",")}`);
      process.exit(1);
    }

    const signatureResult = await aquafier.signAquaTree(aquaTreeWrapper.aquaTreeWrapper, signMethod, creds, enableScalar)

    if (signatureResult.isOk()) {
      // console.log(JSON.stringify(signatureResult.data, null, 4))
      serializeAquaTree(aquaFilename, signatureResult.data.aquaTree!)
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
      witness_platform_type = creds.witness_method
      if (creds.witness_method == undefined || creds.witness_method.length == 0) {
        witness_platform_type = "eth"
      }

    }
    if (network == undefined) {
      network = creds.witness_eth_network
      if (creds.witness_eth_network == undefined || creds.witness_eth_network.length == 0) {
        network = "sepolia"
      }
    }




    // console.log(`Witness Aqua object  witness_platform_type : ${witness_platform_type}, network : ${network} , witnessMethod : ${witnessMethod}   , enableScalar : ${enableScalar} \n creds ${JSON.stringify(creds)} `)
    const witnessResult = await aquafier.witnessAquaTree(aquaTreeWrapper.aquaTreeWrapper, witnessMethod, network, witness_platform_type, creds, enableScalar)

    if (witnessResult.isOk()) {
      serializeAquaTree(aquaFilename, witnessResult.data.aquaTree!)
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


      let containsNameInLink = linkURIs.split(",").find((e: string) => e == fileNameOnly);
      if (containsNameInLink) {
        formatter.log_red("⛔   aqua file name also find in link, possible cyclic linking found");
        process.exit(1)
      }
      console.log("➡️   Linking an AquaTree to multiple AquaTrees")
      let linkAquaTreeWrappers: { aquaTree: any; fileObject: { fileName: string; fileContent: string; path: string }; revision: string }[] = []
      linkURIs.split(",").map((file: string) => {
        let _aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(file, "").aquaTreeWrapper
        linkAquaTreeWrappers.push(_aquaTreeWrapper)
      })
      let _singAquaTree = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified).aquaTreeWrapper


      linkResult = await aquafier.linkAquaTreesToMultipleAquaTrees(_singAquaTree, linkAquaTreeWrappers, enableScalar)


    } else {


      let containsNameInLink = fileNameOnly.split(",").find((e) => e == linkURIs);
      if (containsNameInLink) {
        formatter.log_red("aqua file name also find in link, possible cyclic linking found");
        process.exit(1)
      }
    


      let aquaTreeWrappers = []
      if (fileNameOnly.includes(",")) {
        console.log("✨ Linking multiple AquaTree to a single AquaTrees")
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
      formatter.log_red("A critical erroroccured linking aquatrees");
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

}