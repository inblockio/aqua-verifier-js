import * as formatter from "./formatter.js";
declare const apiVersion = "0.3.0";
declare const ERROR_VERIFICATION_STATUS = "ERROR";
declare const dict2Leaves: (obj: any) => any[];
declare function getHashSum(content: string): any;
declare function sha256Hasher(data: string): any;
declare const getFileHashSum: (filename: any) => any;
declare function readExportFile(filename: any): Promise<any>;
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
declare function generateVerifyPage(verificationHashes: any, aquaObject: any, verbose: boolean | undefined, doVerifyMerkleProof: boolean): AsyncGenerator<(boolean | {
    scalar: boolean;
    verification_hash: string;
    status: {
        verification: string;
        type_ok: boolean;
    };
    witness_result: {};
    file_hash: string;
    data: any;
    revision_type: any;
})[], void, unknown>;
declare function verifyPage(input: any, verbose: any, doVerifyMerkleProof: any): Promise<any[]>;
declare function checkAPIVersionCompatibility(server: any): Promise<any[]>;
export { generateVerifyPage, verifyPage, apiVersion, ERROR_VERIFICATION_STATUS, dict2Leaves, getHashSum, sha256Hasher, getFileHashSum, formatter, checkAPIVersionCompatibility, readExportFile, };
