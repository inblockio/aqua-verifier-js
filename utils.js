
import { Wallet, Mnemonic } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url"
import { dirname } from "path"
import crypto from 'crypto';
import { ethers } from "ethers";

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

// Example Usage
// const wallet = "0xYourWalletAddress";
// const verificationHash = "abcd1234"; // Replace with actual hash
// const providerUrl = "https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID"; // Replace with your provider

// estimateWitnessGas(wallet, verificationHash, providerUrl).then(console.log);

