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
import Aquafier, { printLogs, AquaTree, FileObject, LogType } from "aquafier-js-sdk"
import { readExportFile } from "./utils.js"

export async function verifyAquaTreeData(fileName: string, verboseOption: boolean = false) {
  const aquafier = new Aquafier();
  const filenameToRead = fileName.endsWith(".aqua.json") ? fileName : fileName + ".aqua.json"
  // console.log(`-> reading file  ${fileName}`)
  const aquaTree = await readExportFile(fileName)

  let fileObjectsArray = []

  // the file that has been aquafied

  let pureFileName = fileName.replace(".aqua.json", "")
  let fileContents = await readExportFile(pureFileName, false);
  fileObjectsArray.push({
    fileName: pureFileName,
    fileContent: fileContents,
    path: ""
  });


  // if aqua tree contains link all the linked aqua files must be read into the fileObjects Array
  let filesToBeRead = aquafier.fetchFilesToBeRead(aquaTree);

  for (let item of filesToBeRead) {
    if (fileObjectsArray.find((e) => e.fileName == item)) {
      // console.log(` File ${item} has been read`)
    } else {
      console.log("file to be read "+item);
      let aquaFile = item.endsWith(".aqua.json") ? item : item + ".aqua.json"
      if (fs.existsSync(aquaFile)) {
        //aqua file
        // console.log(`-> reading file  ${aquaFile}`)
        let fileContentsAquaFile = await readExportFile(aquaFile, false);
        fileObjectsArray.push({
          fileName: aquaFile,
          fileContent: fileContentsAquaFile,
          path: ""
        });
      }

      // raw file
      let pureFileNameItem = item.replace(".aqua.json", "");
      // console.log(`-> reading file  ${pureFileNameItem}`)
      let fileContentsItem = await readExportFile(pureFileNameItem, false);
      fileObjectsArray.push({
        fileName: pureFileNameItem,
        fileContent: fileContentsItem,
        path: ""
      });
    }
  }

  let result = await aquafier.verifyAquaTree(aquaTree, fileObjectsArray);

  // console.log("Data " + JSON.stringify(result, null, 4))
  if (result!.isOk()) {
    // result.data.logData.push({
    //   log: `\n`,
    //   logType: LogType.EMPTY
    // });
    result.data.logData.push({
      log: "AquaTree verified successfully",
      logType: LogType.SUCCESS
    })
    printLogs(result.data.logData, verboseOption)
  } else {
    // result.data.push({
    //   log: `\n`,
    //   logType: LogType.EMPTY
    // });
    result.data.push({
      log: "AquaTree verification failed",
      logType: LogType.FINAL_ERROR
    })
    printLogs(result.data, verboseOption)
  }
}
