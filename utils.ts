
import { Mnemonic } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url"
import { dirname } from "path"
import crypto from 'crypto';
import * as fs from "fs"
import Aquafier, { AquaTree, LogType, printLogs, SignType, WitnessNetwork, WitnessPlatformType } from "aqua-js-sdk";
import * as formatter from "./formatter.js"


export function readCredentials(createWallet = true) {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    let filePath = `${__dirname}/credentials.json`;

    if (existsSync(filePath)) {
        return JSON.parse(readFileSync(filePath, "utf8"))
    } else {

        if (createWallet) {

            // Generate random entropy (128 bits for a 12-word mnemonic)
            const entropy = crypto.randomBytes(16);

            // Convert entropy to a mnemonic phrase
            const mnemonic = Mnemonic.fromEntropy(entropy);

            let credentialsObject = {
                mnemonic: mnemonic.phrase, nostr_sk: "", 
                did_key: "",
                alchemy_key: "ZaQtnup49WhU7fxrujVpkFdRz4JaFRtZ",
                witness_eth_network: "sepolia",
                witness_meth: "metamask"
            };
            try {
                writeFileSync(filePath, JSON.stringify(credentialsObject, null, 4), "utf8")
                return credentialsObject;
            } catch (error) {
                console.error("Failed to write mnemonic:", error)
                process.exit(1)
            }
        } else {
            console.error("An error occured")
            process.exit(1)
        }

    }
}


export const serializeAquaTree = (aquaFilename: fs.PathOrFileDescriptor, aquaTree: AquaTree) => {
    try {
        // Convert the object to a JSON string
        const jsonString = JSON.stringify(aquaTree, null, 2);
        fs.writeFileSync(aquaFilename, jsonString, "utf8");
    } catch (error) {
        console.error("Error writing file:", error);
        process.exit(1);
    }
}

export const createGenesisRevision = async (aquaFilename: string, form_file_name: any, enableScalar: boolean, enableContent: boolean, aquafier: Aquafier) => {



    let revisionType = "file"
    if (form_file_name) {

        revisionType = "form"

        if (form_file_name != aquaFilename.replace(/\.aqua\.json$/, "")) {
            formatter.log_red(
                `⛔ First Revision  : Form file name is not the same as the aqua file name `);
            console.log(`Form : ${form_file_name}  File : ${aquaFilename}`,
            )

            process.exit(1)
        }
    }

    if (!fs.existsSync(aquaFilename.replace(".aqua.json", ""))) {
        formatter.log_red(`file ${aquaFilename.replace(".aqua.json", "")} does not exist`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(aquaFilename.replace(".aqua.json", ""), { encoding: "utf-8" });
    let fileObject = {
        fileName: aquaFilename.replace(".aqua.json", ""),
        fileContent: fileContent,
        path: "./"
    }
    const genesisRevision = await aquafier.createGenesisRevision(fileObject, revisionType == "form" ? true : false, enableContent, enableScalar)

    if (genesisRevision.isOk()) {
        let aquaTree = genesisRevision.data.aquaTree
        console.log(
            `- Writing new ${revisionType} revision ${Object.keys(aquaTree!.revisions)[0]} to ${aquaFilename}`,
        )
        serializeAquaTree(aquaFilename, aquaTree!)
    }
}


export function readAndCreateAquaTreeAndAquaTreeWrapper(fileName: string, revisionHashSpecified: string) {

    if (!fileName) {
        console.log("Pass in filename")
        process.exit(1)
    }

    let fileNameOnly = fileName.endsWith(".aqua.json") ? fileName.replace(".aqua.json", "") : fileName
    let aquaFilename = fileName.endsWith(".aqua.json") ? fileName : `${fileName}.aqua.json`

    const fileContent = fs.readFileSync(fileNameOnly, { encoding: "utf-8" });
    const _aquaObject = fs.readFileSync(aquaFilename, { encoding: "utf-8" });
    const parsedAquaTree = JSON.parse(_aquaObject)

    let fileObject = {
        fileName: fileNameOnly,
        fileContent: fileContent,
        path: "./"
    }

    // if (!revisionHashSpecified || revisionHashSpecified.length == 0) {
    //     console.log(`Revision hash error ${revisionHashSpecified}`);
    //     process.exit(1);
    // }

    let aquaTreeWrapper = {
        aquaTree: parsedAquaTree,
        fileObject: fileObject,
        revision: revisionHashSpecified,
    }

    return {
        aquaTree: parsedAquaTree,
        aquaTreeWrapper: aquaTreeWrapper
    }

}


export const revisionWithMultipleAquaChain = async (revisionType: string, filename: string, aquafier: Aquafier, linkURIs: any, enableVerbose: any, enableScalar: any, witness_platform_type: string | undefined, network: string | undefined, witnessMethod: any, signMethod: string) => {

    if (!filename.includes(",")) {
        console.error("Multiple files must be separated by commas");
        process.exit(1);
    }

    // read files
    let all_aqua_files = filename.split(",");
    let aquaObjectWrapperList = [];
    let logs = [];

    for (const file_item of all_aqua_files) {

        let fileNameOnly = ""
        let revisionHashSpecified = ""

        logs.push({
            log: `File name: ${file_item}`,
            logType: LogType.DEBUGDATA
        })

        if (file_item.includes("@")) {

            const filenameParts = file_item.split("@");
            if (filenameParts.length > 2) {
                logs.push({
                    log: `Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`,
                    logType: LogType.ERROR
                })
                process.exit(1);
            }
            fileNameOnly = filenameParts[0];

            revisionHashSpecified = filenameParts[1];

            if (revisionHashSpecified.length == 0) {
                logs.push({
                    log: "Revision hash is empty.  Please provide a valid revision hash.",
                    logType: LogType.DEBUGDATA
                })
                process.exit(1);
            }

            // revisionSPecifiedMap.set(fileNameOnly, revisionSpecified);
        } else {
            fileNameOnly = file_item;

        }

        let fileContentOfFileNameOnly = "";

        try {
            fileContentOfFileNameOnly = fs.readFileSync(fileNameOnly, "utf-8");


        } catch (error) {
            logs.push({
                log: `Error reading ${fileNameOnly}: ${error}`,
                logType: LogType.ERROR
            })
            printLogs(logs, enableVerbose);
            process.exit(1);
        }


        
        const filePath = `${fileNameOnly}.aqua.json`;

        if (!fs.existsSync(filePath)) {
            logs.push({
                log: `File does not exist: ${filePath}`,
                logType: LogType.ERROR
            })
            printLogs(logs, enableVerbose);
            process.exit(1);
        }

        try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const aquaTree = JSON.parse(fileContent);

            logs.push({
                log: `Successfully read: ${filePath}`,
                logType: LogType.SUCCESS
            })

            if (revisionHashSpecified.length == 0) {
                const revisions = aquaTree.revisions;
                const verificationHashes = Object.keys(revisions);
                revisionHashSpecified = verificationHashes[verificationHashes.length - 1];
            }

            let fileObject = {
                fileName: fileNameOnly,
                fileContent: fileContentOfFileNameOnly,
                path: "./"
            }

            let aquaObjectWrapper = {
                aquaTree: aquaTree,
                fileObject: fileObject,
                revision: revisionHashSpecified,
            }

            aquaObjectWrapperList.push(aquaObjectWrapper)
        } catch (error) {
            logs.push({
                log: `Error reading ${filePath}: ${error}`,
                logType: LogType.ERROR
            })
            printLogs(logs, enableVerbose);
            process.exit(1);
        }
    }

    logs.push({
        log: "All files read successfully \n",
        logType: LogType.INFO
    })


    if (revisionType == "witness") {
        let creds = readCredentials()

        if (witness_platform_type === undefined) {
            witness_platform_type = creds.witness_meth
            if (creds.witness_meth.length == 0) {
                witness_platform_type = "eth"
            }

        }
        if (network == undefined) {
            network = creds.witness_eth_network
            if (creds.witness_eth_network.length == 0) {
                network = "sepolia"
            }
        }
        let witnessResult = await aquafier.witnessMultipleAquaTrees(aquaObjectWrapperList, witnessMethod, network as WitnessNetwork, witness_platform_type as WitnessPlatformType, creds, enableScalar);

        if (witnessResult.isOk()) {
            // serializeAquaTree(aquaFilename, witnessResult.data.aquaTree)
            const aquaTreesResults = witnessResult.data
            const aquaTrees = aquaTreesResults.aquaTrees

            if (aquaTrees.length > 0) {
                for (let i = 0; i < aquaTrees.length; i++) {
                    const aquaTree = aquaTrees[i];
                    const hashes = Object.keys(aquaTree.revisions)
                    const aquaTreeFilename = aquaTree.file_index[hashes[0]]
                    serializeAquaTree(`${aquaTreeFilename}.aqua.json`, aquaTree)
                }
            }

            let logs_result = witnessResult.data.logData
            logs.push(...logs_result)
            // logAquaTree(signatureResult.data.aquaTree.tree)
        } else {
            let witnesslogs = witnessResult.data
            logs.push(...witnesslogs)
        }
    } else if (revisionType == "signing") {
        let creds = readCredentials()
        const signatureResult = await aquafier.signMultipleAquaTrees(aquaObjectWrapperList, signMethod as SignType, creds)

        if (signatureResult.isOk()) {
            let logs_result = signatureResult.data.logData
            logs.push(...logs_result)
        } else {
            let logs_result = signatureResult.data
            logs.push(...logs_result)
            // logs.map(log => console.log(log.log))
        }

    } else {
        console.log("Linking")

        let aquaTreeWrappers = aquaObjectWrapperList

        const fileToLink = linkURIs;
        const revisionHashSpecified = ""


        const linkAquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(fileToLink, revisionHashSpecified).aquaTreeWrapper

        // // console.log(`Witness Aqua object  witness_platform_type : ${witness_platform_type}, network : ${network} , witnessMethod : ${witnessMethod}   , enableScalar : ${enableScalar} \n creds ${JSON.stringify(creds)} `)
        const linkResult = await aquafier.linkMultipleAquaTrees(aquaTreeWrappers, linkAquaTreeWrapper, enableScalar)

        if (linkResult.isOk()) {
            const aquaTreesResults = linkResult.data
            const aquaTrees = aquaTreesResults.aquaTrees

            if (aquaTrees.length > 0) {
                for (let i = 0; i < aquaTrees.length; i++) {
                    const aquaTree = aquaTrees[i];
                    const hashes = Object.keys(aquaTree.revisions)
                    const aquaTreeFilename = aquaTree.file_index[hashes[0]]
                    serializeAquaTree(`${aquaTreeFilename}.aqua.json`, aquaTree)
                }
            }
            let logs_result = aquaTreesResults.logData
            logs.push(...logs_result)
        } else {
            let logs_result = linkResult.data
            logs.push(...logs_result)
            // logs.map(log => console.log(log.log))
        }
    }

    printLogs(logs, enableVerbose);

}

export async function readExportFile(filename: string) : Promise<string | AquaTree>{
    if (!fs.existsSync(filename)) {
        formatter.log_red(`ERROR: The file ${filename} does not exist.`)
        process.exit(1)
    }
    const fileContent = fs.readFileSync(filename, "utf-8")
    if (!filename.endsWith("aqua.json")) {
        //   formatter.log_red("The file must have a .json extension")
        //   process.exit(1)
        return fileContent
    }
    const offlineData = JSON.parse(fileContent)
    if (!("revisions" in offlineData)) {
        formatter.log_red("The json file doesn't contain 'revisions' key.")
        process.exit(1)
    }
    return offlineData
}