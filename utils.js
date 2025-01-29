
import { Wallet, Mnemonic } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url"
import { dirname } from "path"
import crypto from 'crypto';

export function getWallet  (mnemonic) {
    // Always trim the last new line
    const wallet = Wallet.fromPhrase(mnemonic.trim())
    const walletAddress = wallet.address.toLowerCase()
    console.log("Wallet address", walletAddress)
    return [wallet, walletAddress, wallet.publicKey]
}


export function readCredentials  ()  {
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

            let credentialsObject = { mnemonic: mnemonic.phrase, nostr_sk: "", "did:key": "", alchemy_key: "ZaQtnup49WhU7fxrujVpkFdRz4JaFRtZ" };
            try {
                writeFileSync(filePath, JSON.stringify(credentialsObject), "utf8")
                return credentialsObject;
            } catch (error) {
                console.error("Failed to write mnemonic:", error)
                process.exit(1)

            }

        }


    }