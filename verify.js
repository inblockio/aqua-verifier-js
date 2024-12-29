#!/usr/bin/env node

import * as main from "./index.js"
import minimist from "minimist"
import * as formatter from "./formatter.js"

const opts = {
  // This is required so that -v and -m are position independent.
  boolean: ["v", "m"],
}
const argv = minimist(process.argv.slice(2), opts)

function usage() {
  console.log(`Usage:
verify.js [OPTIONS] <page title>
or
verify.js [OPTIONS] --file <offline file.json or file.xml>

Options:
  -v                     Verbose
  --server               <The url of the server, e.g. https://pkc.inblock.io>
  --ignore-merkle-proof  Ignore verifying the witness merkle proof of each revision
  --api                 (If present) The title to read from for the data
If the --server is not specified, it defaults to http://localhost:9352`)
}

// This should be a commandline argument for specifying the title of the page
// which should be verified.
if (argv.api && argv._.length < 1) {
  formatter.log_red("ERROR: You must specify the page title")
  usage()
  process.exit(1)
}

const verbose = argv.v

const ignoreMerkleProof = argv["ignore-merkle-proof"] ?? false

const server = argv.server ?? "http://localhost:9352"


// The main function
;(async function () {
  if (!argv.api) {
    let filename = argv._[0]
    // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
    // file corresponding with the file
    filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json"
    const offlineData = await main.readExportFile(filename)
    await main.verifyPage(offlineData, verbose, !ignoreMerkleProof)
    console.log()
  } else {
    const title = argv.api
    console.log(`Verifying ${title}`)
    let APIstatus, versionMatches, serverVersion
    try {
      ;[APIstatus, versionMatches, serverVersion] =
        await main.checkAPIVersionCompatibility(server)
    } catch (e) {
      formatter.log_red("Error checking API version: " + e)
      return
    }
    if (APIstatus !== "FOUND") {
      formatter.log_red("Error checking API version: " + APIstatus)
      return
    }
    if (!versionMatches) {
      formatter.log_red("Incompatible API version:")
      formatter.log_red(`Current supported version: ${main.apiVersion}`)
      formatter.log_red(`Server version: ${serverVersion}`)
      return
    }
    await main.verifyPageFromMwAPI(server, title, verbose, !ignoreMerkleProof)
  }
})()
