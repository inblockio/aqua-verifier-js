import { RevisionTree } from "aquafier-js-sdk";
export declare function findHashWithLongestPath(tree: RevisionTree): {
    paths: {
        [key: string]: string[];
    };
    latestHash: string;
};
export declare function createAquaObjectTree(aquaObject: any): RevisionTree;
export declare function createAquaTree(aquaObject: any): any;
export declare function logAquaTree(node: RevisionTree, prefix?: string, isLast?: boolean): void;
