
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

    if(!fileName){
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

    if (!revisionHashSpecified || revisionHashSpecified.length == 0) {
        console.log(`Revision hash error ${revisionHashSpecified}`);
        process.exit(1);
    }

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