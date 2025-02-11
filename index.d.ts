import * as formatter from "./formatter.js";
declare const apiVersion = "0.3.0";
declare const ERROR_VERIFICATION_STATUS = "ERROR";
declare const dict2Leaves: (obj: any) => string[];
declare function getHashSum(content: string): string;
declare const getFileHashSum: (filename: any) => string;
declare function readExportFile(filename: any): Promise<any>;
declare function generateVerifyPage(verificationHashes: any, aquaObject: any, verbose: boolean | undefined, doVerifyMerkleProof: boolean): AsyncGenerator<{}, void, unknown>;
declare function verifyPage(input: any, verbose: any, doVerifyMerkleProof: any): Promise<any[]>;
declare function checkAPIVersionCompatibility(server: any): Promise<any[]>;
export { generateVerifyPage, verifyPage, apiVersion, ERROR_VERIFICATION_STATUS, dict2Leaves, getHashSum, getFileHashSum, formatter, checkAPIVersionCompatibility, readExportFile, };
