import { Revision, RevisionSignature, RevisionWitness } from "./models/models";
import { RevisionVerificationResult } from "./v1_2/models";
export interface VerificationOptions {
    version: number;
    strict?: boolean;
    allowNull?: boolean;
    customMessages?: Record<string, string>;
}
export declare class AquaVerifier {
    private options;
    constructor(options?: VerificationOptions);
    fetchVerificationOptions(): VerificationOptions;
    verifyRevision(revision: Revision): RevisionVerificationResult | null;
    verifySignature(signature: RevisionSignature, previous_hash: string): import("./v1_2/models").ResultStatus | null;
    verifyWitness(witness: RevisionWitness, verification_hash: string, doVerifyMerkleProof: boolean): Promise<import("./v1_2/models").ResultStatus> | null;
    signFile(): void;
    witnessFile(): void;
    verifyMerkleTree(): void;
    verifyAquaChain(): void;
}