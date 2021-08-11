#!/usr/bin/env node

const main = require('./index')

//This should be a commandline argument for specifying the title of the page which should be verified 
if (process.argv.length < 3) {
  main.log_red("ERROR: You must specify the page title")
  process.exit(1)
}
let title = process.argv[2] !== '-v' ? process.argv[2]: process.argv[3]

VERBOSE = process.argv.includes('-v')

console.log(`Verifying ${title}`)
main.verifyPage(title)
