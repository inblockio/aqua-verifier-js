
import { Wallet, Mnemonic } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url"
import { dirname } from "path"
import crypto from 'crypto';
import { ethers } from "ethers";
import * as fs from "fs"

export function getWallet(mnemonic) {
    // Always trim the last new line
    const wallet = Wallet.fromPhrase(mnemonic.trim())
    const walletAddress = wallet.address.toLowerCase()
    console.log("Wallet address", wallet.privateKey)
    return [wallet, walletAddress, wallet.publicKey]
}


export function readCredentials() {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    let filePath = `${__dirname}/credentials.json`;

    if (existsSync(filePath)) {
        return JSON.parse(readFileSync(filePath, "utf8"))
    } else {
        console.log('Credential file  does not exist.Creating wallet');

        // Generate random entropy (128 bits for a 12-word mnemonic)
        const entropy = crypto.randomBytes(16);

        // Convert entropy to a mnemonic phrase
        const mnemonic = Mnemonic.fromEntropy(entropy);

        let credentialsObject = {
            mnemonic: mnemonic.phrase, nostr_sk: "", "did:key": "",
            alchemy_key: "ZaQtnup49WhU7fxrujVpkFdRz4JaFRtZ",
            witness_eth_network: "sepolia",
            witness_eth_platform: "metamask"
        };
        try {
            writeFileSync(filePath, JSON.stringify(credentialsObject, null, 4), "utf8")
            return credentialsObject;
        } catch (error) {
            console.error("Failed to write mnemonic:", error)
            process.exit(1)

        }

    }
}

export const estimateWitnessGas = async (wallet_address, witness_event_verification_hash, ethNetwork, smart_contract_address, providerUrl) => {
    try {
        // Connect to Ethereum provider
        // const provider = new ethers.JsonRpcProvider(providerUrl);
        const provider = ethers.getDefaultProvider(ethNetwork)

        console.log("Replace :", witness_event_verification_hash)

        // Define the transaction
        const tx = {
            from: ethers.getAddress(wallet_address),
            to: ethers.getAddress(smart_contract_address), // Replace with actual contract address
            data: '0x9cef4ea1' + witness_event_verification_hash.replace("0x", ""), // Function selector + hash
        };

        // Get sender's balance
        const balance = await provider.getBalance(wallet_address);
        const balanceInEth = ethers.formatEther(balance);
        console.log(`Sender Balance: ${balanceInEth} ETH`);

        // Estimate gas
        const estimatedGas = await provider.estimateGas(tx);
        console.log(`Estimated Gas: ${estimatedGas.toString()} units`);

        // Get current gas price
        const feeData = await provider.getFeeData();
        console.log("Fee data: ", feeData)
        const gasPrice = feeData.gasPrice; // This replaces getGasPrice()
        console.log(`Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);

        // Calculate total gas fee
        const gasCost = estimatedGas * gasPrice;
        const gasCostInEth = ethers.formatEther(gasCost);
        console.log(`Estimated Gas Fee: ${gasCostInEth} ETH`);

        // Check if balance is sufficient
        const hasEnoughBalance = balance >= gasCost;

        return { error: null, gasEstimate: estimatedGas.toString(), gasFee: gasCostInEth, balance: balanceInEth, hasEnoughBalance };

    } catch (error) {
        console.error("Error estimating gas:", error);
        return { error: error.message };
    }
};

export function formatMwTimestamp(ts) {
    // Format timestamp into the timestamp format found in Mediawiki outputs
    return ts
        .replace(/-/g, "")
        .replace(/:/g, "")
        .replace("T", "")
        .replace("Z", "")
}

export const serializeAquaTree = (aquaFilename, aquaTree) => {
    try {
        // Convert the object to a JSON string
        const jsonString = JSON.stringify(aquaTree, null, 2);
        fs.writeFileSync(aquaFilename, jsonString, "utf8");
    } catch (error) {
        console.error("Error writing file:", error);
        process.exit(1);
    }
}

export const createGenesisRevision = async (aquaFilename, form_file_name, enableScalar, aquafier) => {

    // if (enableRemoveRevision) {
    //     // Don't serialize if you do --rm during genesis creation
    //     console.log("There is nothing delete.")
    //     return
    // }

    let revisionType = "file"
    if (form_file_name) {
        revisionType = "form"

        if (form_file_name != aquaFilename.replace(/\.aqua\.json$/, "")) {
            console.log(
                `First Revision  : Form file name is not the same as the aqua file name \n  Form : ${form_file_name}  File : ${aquaFilename}`,
            )
            process.exit(1)
        }
    }


    const fileContent = fs.readFileSync(aquaFilename.replace(".aqua.json", ""), { encoding: "utf-8" });
    let fileObject = {
        fileName: aquaFilename.replace(".aqua.json", ""),
        fileContent: fileContent,
        path: "./"
    }
    const genesisRevision = await aquafier.createGenesisRevision(fileObject, false, false, enableScalar)

    if (genesisRevision.isOk()) {
        let aquaTree = genesisRevision.data.aquaTree
        console.log(
            `- Writing new ${revisionType} revision ${Object.keys(aquaTree.revisions)[0]} to ${aquaFilename}`,
        )
        serializeAquaTree(aquaFilename, aquaTree)
    }

    // const aquaTree = createNewAquaTree()
    // const revisions = aquaTree.revisions

    // const genesis = await createNewRevision(
    //   fileNameOnly,
    //   "",
    //   timestamp,
    //   revisionType,
    //   enableScalar,
    //   aquaTree,
    // )


    // revisions[genesis.verification_hash] = genesis.data


    // maybeUpdateFileIndex(aquaTree, genesis, revisionType, fileNameOnly)

}
// Example Usage
// const wallet = "0xYourWalletAddress";
// const verificationHash = "abcd1234"; // Replace with actual hash
// const providerUrl = "https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"; // Replace with your provider

// estimateWitnessGas(wallet, verificationHash, providerUrl).then(console.log);


export function readAndCreateAquaTreeAndAquaTreeWrapper(fileName, revisionHashSpecified) {

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


export const createRevisionWithMultipleAquaChain = async (timestamp, revisionType, filename) => {
    if (!filename.includes(",")) {
        console.error("Multiple files must be separated by commas");
        process.exit(1);
    }

    // read files
    let all_aqua_files = filename.split(",");
    // let all_file_aqua_objects = [];

    // ie filename.aqua.json => "specified revision"
    // if specified revision is empty use last revision
    const all_file_aqua_objects_map = new Map();
    let all_file_aqua_objects_list = [];
    const revisionSPecifiedMap = new Map();

    for (const file_item of all_aqua_files) {

        let fileNameOnly = ""
        let revisionSpecified = ""

        console.log("File name loop ", file_item);
        if (file_item.includes("@")) {

            const filenameParts = file_item.split("@");
            if (filenameParts.length > 2) {
                console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
                process.exit(1);
            }
            fileNameOnly = filenameParts[0];

            revisionSpecified = filenameParts[1];

            if (revisionSpecified.length == 0) {
                console.error("Revision hash is empty.  Please provide a valid revision hash.");
                process.exit(1);
            }

            revisionSPecifiedMap.set(fileNameOnly, revisionSpecified);
        } else {
            fileNameOnly = file_item;
        }
        const filePath = `${fileNameOnly}.aqua.json`;

        if (!fs.existsSync(filePath)) {
            console.error(`File does not exist: ${filePath}`);
            process.exit(1);
        }

        try {
            const fileContent = await fs.readFileSync(filePath, "utf-8");
            const aquaTree = JSON.parse(fileContent);
            console.log(`Successfully read: ${filePath}`);
            // all_file_aqua_objects.push(aquaTree);
            all_file_aqua_objects_map.set(fileNameOnly, aquaTree);
            all_file_aqua_objects_list.push(aquaTree)
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error);
            process.exit(1);
        }
    }
    console.log("All files read successfully \n",);
    // get the last verification hash
    let lastRevisionOrSpecifiedHashes = [];

    for (const [key, value] of all_file_aqua_objects_map) {

        // console.log(`key ${key}  and value ${value}`);

        const verificationHashes = Object.keys(value.revisions);
        // if aqua filname has specified revision use it instead of the last revision

        if (revisionSPecifiedMap.has(key)) {
            let revisionSpecified = revisionSPecifiedMap.get(key);
            if (verificationHashes.includes(revisionSpecified)) {
                lastRevisionOrSpecifiedHashes.push(revisionSpecified)
            } else {
                console.error(`Error revision  ${revisionSpecified} in  file ${key}.aqua.json not found`);
                process.exit(1);
            }
        } else {

            lastRevisionOrSpecifiedHashes.push(verificationHashes[verificationHashes.length - 1]);
        }

        // 
    }

    console.log("All last revision hashes  \n", lastRevisionOrSpecifiedHashes);


    let revisionResult = {};

    if (revisionType == "witness") {
        const tree2 = new MerkleTree(lastRevisionOrSpecifiedHashes, main.getHashSum, {
            duplicateOdd: false,
        })

        let merkleRoot = tree2.getHexRoot();
        let merkleProofArray = [];

        lastRevisionOrSpecifiedHashes.forEach((hash) => {
            let merkleProof = tree2.getHexProof(hash);
            merkleProofArray.push(merkleProof);
        });

        console.log("Merkle proof: ", merkleProofArray);



        revisionResult = await prepareWitness(merkleRoot);

        revisionResult.witness_merkle_proof = lastRevisionOrSpecifiedHashes;
    } else {


        // console.log(`linkURIs ${linkURIs}`)
        let linkURIsArray = [];
        if (linkURIs.includes(",")) {
            linkURIsArray = linkURIs.split(",")
        } else {
            linkURIsArray.push(linkURIs);
        }

        const linkAquaFiles = linkURIsArray.map((e) => `${e}.aqua.json`)
        const linkVerificationHash = linkAquaFiles.map(getLatestVH)
        const linkFileHashes = linkURIsArray.map(main.getFileHashSum)


        revisionResult = {
            link_type: "aqua",
            //link_require_indepth_verification: true,
            link_verification_hashes: linkVerificationHash,
            link_file_hashes: linkFileHashes,
        }

    }


    for (let index = 0; index < all_aqua_files.length; index++) {
        const current_file = all_aqua_files[index];
        const current_file_aqua_object = all_file_aqua_objects_list[index];
        // console.log("current_file_aqua_object ", JSON.stringify(current_file_aqua_object))

        const revisionKeys = Object.keys(current_file_aqua_object.revisions);
        // if no specified revision use the last one 
        // if one is specified use the last one 
        console.log("Current file ", current_file);
        const filenameParts = current_file.split("@");
        if (filenameParts.length > 2) {
            console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
            process.exit(1);
        }
        let fileNameOnly = filenameParts[0];

        let latestRevisionKey = ""
        console.log("All revisions map ", JSON.stringify(revisionSPecifiedMap))
        if (revisionSPecifiedMap.has(fileNameOnly)) {
            console.log()


            latestRevisionKey = revisionSPecifiedMap.get(fileNameOnly);

            console.log("Setting previous revision to a specific on ", latestRevisionKey);

        } else {
            latestRevisionKey = revisionKeys.pop(); // Get the last key

        }
        console.log("Latest revision key:", latestRevisionKey);

        let verificationData = {};

        if (revisionType == "witness") {
            verificationData = {
                previous_verification_hash: latestRevisionKey,
                local_timestamp: timestamp,
                revision_type: revisionType,
                ...revisionResult
            }
        } else if (revisionType == "link") {

            // console.log("Array 1 of revision results " + JSON.stringify(revisionResult.link_file_hashes));
            // console.log("Array 2 of current_file_aqua_object " + JSON.stringify(current_file_aqua_object));
            // for (let item in current_file_aqua_object.file_index) {
            //   console.log("item  ", item);
            //   if (revisionResult.link_file_hashes.includes(item)){
            //     console.error(
            //       `${fh} detected in file index. You are not allowed to interlink Aqua files of the same file`,
            //     )
            //   process.exit(1)
            //   }
            // }

            verificationData = {
                previous_verification_hash: latestRevisionKey,
                local_timestamp: timestamp,
                revision_type: revisionType,
                ...revisionResult
            }
        } else {
            console.log("Create revision with multiple aqua chain.")
            process.exit(1)
        }


        const revisions = current_file_aqua_object.revisions
        // Merklelize the dictionary
        const leaves = main.dict2Leaves(verificationData)
        if (enableScalar == false || vTree == true) {
            verificationData.leaves = leaves;
        }
        const tree = new MerkleTree(leaves, main.getHashSum, {
            duplicateOdd: false,
        })
        const verificationHash = tree.getHexRoot()
        revisions[verificationHash] = verificationData
        // console.log(`\n\n Writing new revision ${verificationHash} to ${current_file} current file current_file_aqua_object ${JSON.stringify(current_file_aqua_object)} \n\n `)
        maybeUpdateFileIndex(current_file_aqua_object, {
            verification_hash: verificationHash,
            data: verificationData
        }, revisionType, fileNameOnly);
        const filePath = `${fileNameOnly}.aqua.json`;
        serializeAquaTree(filePath, current_file_aqua_object)
    }
    return true;
}

export const revisionWithMultipleAquaChain = async (revisionType, filename, aquafier, linkURIs, enableVerbose, enableScalar, witness_platform_type, network, witnessMethod) => {

    if (!filename.includes(",")) {
        console.error("Multiple files must be separated by commas");
        process.exit(1);
    }

    // read files
    let all_aqua_files = filename.split(",");
    // let all_file_aqua_objects = [];

    // ie filename.aqua.json => "specified revision"
    // if specified revision is empty use last revision
    // const all_file_aqua_objects_map = new Map();
    // let all_file_aqua_objects_list = [];
    // const revisionSPecifiedMap = new Map();

    let aquaObjectWrapperList = [];
    let logs = [];

    for (const file_item of all_aqua_files) {

        let fileNameOnly = ""
        let revisionHashSpecified = ""

        console.log("File name loop ", file_item);
        if (file_item.includes("@")) {

            const filenameParts = file_item.split("@");
            if (filenameParts.length > 2) {
                console.error(`Invalid filename format.  Please use only one '@' symbol to separate the filename from the revision hash. file name ${filenameParts}`);
                process.exit(1);
            }
            fileNameOnly = filenameParts[0];

            revisionHashSpecified = filenameParts[1];

            if (revisionHashSpecified.length == 0) {
                console.error("Revision hash is empty.  Please provide a valid revision hash.");
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
            console.error(`Error reading ${fileNameOnly}:`, error);
            process.exit(1);
        }



        const filePath = `${fileNameOnly}.aqua.json`;

        console.log("File path: ", filePath)

        if (!fs.existsSync(filePath)) {
            console.error(`File does not exist: ${filePath}`);
            process.exit(1);
        }

        try {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const aquaTree = JSON.parse(fileContent);
            console.log(`Successfully read: ${filePath}`);

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
            console.error(`Error reading ${filePath}:`, error);
            process.exit(1);
        }
    }

    console.log("All files read successfully \n",);

    if (revisionType == "witness") {
        let creds = readCredentials()

        if (witness_platform_type === undefined) {
            witness_platform_type = creds.witness_eth_platform
            if (creds.witness_eth_platform.length == 0) {
                witness_platform_type = "eth"
            }

        }
        if (network == undefined) {
            network = creds.witness_eth_network
            if (creds.witness_eth_network.length == 0) {
                network = "sepolia"
            }
        }
        let witnessResult = await aquafier.witnessMultipleAquaTrees(aquaObjectWrapperList, witnessMethod, network, witness_platform_type, creds, enableScalar);

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
            let logs = witnessResult.data
            logs.map(log => console.log(log.log))
        }
    } else if (revisionType == "signing") {

        const signatureResult = await aquafier.signMultipleAquaTrees(aquaObjectWrapperList, signMethod, creds, enableScalar)

        if (signatureResult.isOk()) {
            // serializeAquaTree(aquaFilename, signatureResult.data.aquaTree)
            let logs_result = signatureResult.data.logData
            logs.concat(logs_result)
            // logs.map(log => console.log(log.log))
            // logAquaTree(signatureResult.data.aquaTree.tree)
        } else {
            let logs_result = signatureResult.data
            logs.concat(logs_result)
            // logs.map(log => console.log(log.log))
        }

    } else {
        console.log("Linking")

        let aquaTreeWrappers = aquaObjectWrapperList

        // if (fileNameOnly.includes(",")) {
        //     fileNameOnly.split(",").map((file) => {
        //         let _aquaTreeWrapper = readAndCreateAquaTreeAndAquaTreeWrapper(file, "").aquaTreeWrapper
        //         aquaTreeWrappers.push(_aquaTreeWrapper)
        //     })
        // } else {
        //     let _singAquaTree = readAndCreateAquaTreeAndAquaTreeWrapper(fileNameOnly, revisionHashSpecified).aquaTreeWrapper
        //     aquaTreeWrappers.push(_singAquaTree)
        // }

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

            // serializeAquaTree(aquaFilename, linkResult.data.aquaTree)
            let logs_result = aquaTreesResults.logData
            logs.push(...logs_result)
            // logs.map(log => console.log(log.log))
            // logAquaTree(signatureResult.data.aquaTree.tree)
        } else {
            let logs_result = linkResult.data
            logs.push(...logs_result)
            // logs.map(log => console.log(log.log))
        }
    }

    printLogs(logs, enableVerbose);

}


export function printLogs(logs, enableVerbose) {
    console.log("Logs", logs)
    if (enableVerbose) {
        logs.forEach(element => {
            console.log(element.log)
        });
    } else {
        let containsError = logs.filter((element) => element.logType == "error");
        if (containsError.length > 0) {
            logs.forEach(element => {
                if (element.logType == "error") {
                    console.log(element.log)
                }
            });
        } else {
            // if(logs.length > 0){}
            let lastLog = logs[logs.length - 1];
            console.log(lastLog.log)
        }

    }
}