

export interface RevisionTree {
    hash: string
    children: RevisionTree[]
}


export interface Revision {
    previous_verification_hash: string;
    local_timestamp: string;
    revision_type: "file" | "witness";
    file_hash?: string;
    file_nonce?: string;
    witness_merkle_root?: string;
    witness_timestamp?: number;
    witness_network?: string;
    witness_smart_contract_address?: string;
    witness_transaction_hash?: string;
    witness_sender_account_address?: string;
    witness_merkle_proof?: string[];
}

export interface Revisions {
    [key: string]: Revision;
}

export interface FileIndex {
    [key: string]: string;
}

export interface RevisionData {
    revisions: Revisions;
    file_index: FileIndex;
}
