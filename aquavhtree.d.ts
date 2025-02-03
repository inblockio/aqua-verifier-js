import { RevisionTree } from "./model.js";
export declare function findHashWithLongestPath(tree: RevisionTree): {
    paths: {
        [key: string]: string[];
    };
    latestHash: string;
};
export declare function createAquaObjectTree(aquaObject: any): RevisionTree;
export declare function createAquaTree(aquaObject: any): any;
export declare function logTree(node: RevisionTree, prefix?: string, isLast?: boolean): void;
