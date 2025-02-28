#!/usr/bin/env node
import * as main from "./index.js";
import minimist from "minimist";
import * as formatter from "./formatter.js";
const opts = {
    // This is required so that -v and -m are position independent.
    boolean: ["v", "m", "graph"],
};
const argv = minimist(process.argv.slice(2), opts);
function usage() {
    console.log(`Usage:
verify.js [OPTIONS] <file name>
or
verify.js [OPTIONS] --api <page title>

Options:
  -v                     Verbose
  --server               <The url of the server, e.g. https://pkc.inblock.io>
  --api                 (If present) The title to read from for the data
  --graph                To show the graph data
If the --server is not specified, it defaults to http://localhost:9352`);
}
// This should be a commandline argument for specifying the title of the page
// which should be verified.
if (argv._.length < 1) {
    formatter.log_red("ERROR: You must specify the file name or page title (if --api)");
    usage();
    process.exit(1);
}
const verbose = argv.v;
const server = argv.server ? argv.server : "http://localhost:9352";
export async function run(argvData = argv) {
    if (argvData.graph) {
        console.log("The graph");
        let filename = argvData._[0];
        // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
        // file corresponding with the file
        filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json";
        await main.verifyAndGetGraphData(filename, verbose);
        // await main.verifyPage(offlineData, verbose)
        console.log();
    }
    else {
        let filename = argvData._[0];
        // If the file is an AQUA file, we read it directly, otherwise, we read the AQUA
        // file corresponding with the file
        filename = filename.endsWith(".aqua.json") ? filename : filename + ".aqua.json";
        await main.verifyAquaTreeData(filename, verbose);
        // await main.verifyPage(offlineData, verbose)
        console.log();
    }
}
// The main function
;
(async function () {
    await run();
})();
