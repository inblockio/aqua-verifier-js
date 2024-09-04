import * as formatter from "./formatter.js";
declare const apiVersion = "0.3.0";
declare const ERROR_VERIFICATION_STATUS = "ERROR";
declare function getHashSum(content: string): any;
declare function calculateMetadataHash(domainId: string, timestamp: string, previousVerificationHash?: string, mergeHash?: string): any;
declare function calculateSignatureHash(signature: string, publicKey: string): any;
declare function calculateVerificationHash(contentHash: string, metadataHash: string, signature_hash: string, witness_hash: string): any;
/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies all of the verified revisions of a page.
 * Steps:
 * - Loops through the revision IDs for the page.
 *   Calls function verifyRevision, if isCorrect flag is returned as true,
 *   yield true and the revision detail.
 * @param   {Array} verifiedRevIds Array of revision ids which have verification detail.
 * @param   {string} server The server URL for the API call.
 * @param   {boolean} verbose
 * @param   {boolean} doVerifyMerkleProof The flag for whether to do rigorous
 *                    verification of the merkle proof. TODO clarify this.
 * @param   {Object} token (Optional) The OAuth2 token required to make the API call.
 * @returns {Generator} Generator for isCorrect boolean and detail object of
 *                      each revisions.
 */
declare function generateVerifyPage(verificationHashes: any, input: any, verbose: boolean | undefined, doVerifyMerkleProof: boolean): AsyncGenerator<any[], void, unknown>;
declare function verifyPage(input: any, verbose: any, doVerifyMerkleProof: any): Promise<void>;
declare function verifyPageFromMwAPI(server: any, title: any, verbose: any, ignoreMerkleProof: any): Promise<void>;
export { generateVerifyPage, verifyPage, apiVersion, ERROR_VERIFICATION_STATUS, getHashSum, calculateMetadataHash, calculateVerificationHash, calculateSignatureHash, verifyPageFromMwAPI, formatter, };
