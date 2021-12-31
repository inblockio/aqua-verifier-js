#!/usr/bin/env node

const fs = require("fs")
const main = require("./index")

const opts = {}
const argv = require("minimist")(process.argv.slice(2), opts)
if (argv._.length < 1) {
  main.log_red("ERROR: You must specify the page title")
  process.exit(1)
}

const title = argv._[0]
const server = argv.server ?? "http://localhost:9352"

if (title.includes("_")) {
  main.log_red("INVALID TITLE: Do not use underscore in title.")
  process.exit(1)
}

;(async function () {
  const token = null
  // TODO check API version compatibility
  const apiURL = main.getApiURL(server)
  const [status, res] = await main.getRevisionHashes(apiURL, title, token)
  if (status === main.ERROR_VERIFICATION_STATUS) {
    main.log_red(res.error)
    process.exit(1)
  }
  const verificationHashes = res
  let output = {
    version: main.apiVersion,
    title: title,
    revisions: {},
  }
  let count = 1
  // See https://stackoverflow.com/questions/32938213/is-there-a-way-to-erase-the-last-line-of-output
  const magicWord = "\r\x1b[K"

  console.log()
  for (const verificationHash of verificationHashes) {
    process.stdout.write(
      `${magicWord}Downloading revision ${count} / ${verificationHashes.length}`
    )
    const response = await main.fetchWithToken(
      `${apiURL}/get_revision/${verificationHash}`,
      token
    )
    let data = await response.json()
    if (!response.ok) {
      main.log_red(
        "get_revision: " + main.formatHTTPError(response, " " + data.message)
      )
      process.exit(1)
    }
    output.revisions[verificationHash] = data
    count += 1
  }
  fs.writeFileSync(`./pkc_${title}.json`, JSON.stringify(output))
  console.log("\nDone!")
})()
