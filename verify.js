#!/usr/bin/env node

const opts = {
  // This is required so that -v and -m are position independent.
  boolean: ["v", "m"],
}
const argv = require("minimist")(process.argv.slice(2), opts)
const main = require("./index")
const transformer = require("./transform")

function usage() {
  console.log(`Usage:
verify.js [OPTIONS] <page title>
or
verify.js [OPTIONS] --file <offline file.json or file.xml>

Options:
  -v                     Verbose
  --server               <The url of the server, e.g. https://pkc.inblock.io>
  --ignore-merkle-proof  Ignore verifying the witness merkle proof of each revision
  --token                (Optional) OAuth2 access token to access the API
If the --server is not specified, it defaults to http://localhost:9352
  --file                 (If present) The file to read from for the data`
  )
}

// This should be a commandline argument for specifying the title of the page
// which should be verified.
if (!argv.file && argv._.length < 1) {
  main.log_red("ERROR: You must specify the page title")
  usage()
  process.exit(1)
}
const title = argv._[0]

const verbose = argv.v

const ignoreMerkleProof = argv["ignore-merkle-proof"] ?? false

const server = argv.server ?? "http://localhost:9352"

const token = argv.token

// For offline JSON file verification
const file = argv.file
;
(async function() {
  let input
  if (file) {
    const fs = require('fs')
    const fileContent = fs.readFileSync(file)
    let offline_data
    if (file.endsWith(".json")) {
      offline_data = JSON.parse(fileContent)
    } else {
      if (!file.endsWith(".xml")) {
        main.log_red("Only JSON or XML files are supported.")
        process.exit(1)
      }
      offline_data = await transformer.parseMWXmlString(fileContent)
    }
    console.log(`Verifying ${offline_data.title}`)
    input = {offline_data}
  } else {
    console.log(`Verifying ${title}`);
    input = {title, server, token}
  }
  main.verifyPageCLI(input, verbose, !ignoreMerkleProof)
})()
