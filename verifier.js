#!/usr/bin/env node

const argv = require('minimist')(process.argv.slice(2));
const main = require('./index')

//This should be a commandline argument for specifying the title of the page which should be verified 
if (argv._.length < 1) {
  main.log_red("ERROR: You must specify the page title")
  process.exit(1)
}
const title = argv._[0]

const verbose = argv.v

const server = argv.server ?? 'http://localhost:9352'

console.log(`Verifying ${title}`)
main.verifyPage(title, server, verbose)
