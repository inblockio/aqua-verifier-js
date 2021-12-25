#!/usr/bin/env node

const opts = {
  // This is required so that -v and -m are position independent.
  boolean: ["v", "m"],
}
const argv = require("minimist")(process.argv.slice(2), opts)
const main = require("./index")

function usage() {
  console.log(`Usage:
verify.js [OPTIONS] <page title>

Options:
  -v                     Verbose
  --server               <The url of the server, e.g. https://pkc.inblock.io>
  --ignore-merkle-proof  Ignore verifying the witness merkle proof of each revision
  --token                (Optional) OAuth2 access token to access the API
If the --server is not specified, it defaults to http://localhost:9352`)
}

// This should be a commandline argument for specifying the title of the page
// which should be verified.
if (argv._.length < 1) {
  main.log_red("ERROR: You must specify the page title")
  usage()
  process.exit(1)
}
const title = argv._[0]

const verbose = argv.v

const ignoreMerkleProof = argv["ignore-merkle-proof"] ?? false

const server = argv.server ?? "http://localhost:9352"

const token = argv.token

console.log(`Verifying ${title}`)
main.verifyPageCLI(title, server, verbose, !ignoreMerkleProof, token)