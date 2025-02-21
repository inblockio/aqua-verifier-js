#!/usr/bin/env node

import minimist from "minimist";
import * as formatter from "./formatter.js";
import * as verifyCommand from "./verify.js";
import * as notarizeCommand from "./notarize.js";


// Define an interface for command modules
interface CommandModule {
    execute: (args: minimist.ParsedArgs) => Promise<void>;
}

// Define a type for the commands object
type Commands = {
    [key in 'verify' | 'notarize']: CommandModule;
};

// Create the commands object with proper typing
const commands: Commands = {
    'verify': {
        async execute(args: minimist.ParsedArgs) {
            await verifyCommand.run(args);
        },
    },
    'notarize':  {
        async execute(args: minimist.ParsedArgs) {
            await notarizeCommand.run(args);
        },
    },
};

function globalUsage() {
    console.log(`Usage: aqua <command> [options]
  
  Available Commands:
    verify     Verify an AQUA file
    notarize   Notarize a file and generate AQUA data
  
  Run 'aqua <command> --help' for more information about a specific command.`);
}

async function main() {
    const argv = minimist(process.argv.slice(2));
    const command = argv._[0] as keyof Commands | undefined;
    const remainingArgs = process.argv.slice(3);

    if (!command) {
        formatter.log_red("ERROR: You must specify a command");
        globalUsage();
        process.exit(1);
    }

    // Now TypeScript knows that command must be 'verify' or 'notarize'
    if (!commands[command]) {
        formatter.log_red(`ERROR: Unknown command '${command}'`);
        globalUsage();
        process.exit(1);
    }

    // Remove the command from argv._ so subcommands can process their own args
    argv._.shift();

    try {
        await commands[command].execute(argv);
    } catch (error) {
        formatter.log_red(`Error executing ${command}: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
}

main().catch((error) => {
    formatter.log_red(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});