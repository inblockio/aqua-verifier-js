import { RevisionTree } from "./model.js";

function findNode(tree: RevisionTree, hash: string): RevisionTree | null {
    if (tree.hash === hash) {
        return tree;
    }
    for (let i = 0; i < tree.children.length; i++) {
        const child = tree.children[i];
        const result = findNode(child, hash);
        if (result) {
            return result;
        }
    }
    return null;
}

function findPaths(tree: RevisionTree, path: string[]): { [key: string]: string[] } {
    let paths: { [key: string]: string[] } = {};
    path.push(tree.hash);
    if (tree.children.length === 0) {
        paths[tree.hash] = path;
    } else {
        for (let i = 0; i < tree.children.length; i++) {
            const child = tree.children[i];
            const childPaths = findPaths(child, [...path]);
            paths = { ...paths, ...childPaths };
        }
    }
    return paths;
}

export function findHashWithLongestPath(tree: RevisionTree) {
    let paths = findPaths(tree, []);
    let hash = "";
    let longestPathLength = 0;
    for (let key in paths) {
        if (paths[key].length > longestPathLength) {
            hash = key;
            longestPathLength = paths[key].length;
        }
    }
    return {
        paths,
        latestHash: hash,
    };
}

export function createAquaObjectTree(aquaObject: any) {
    let obj = aquaObject;
    // Create a tree given such revision data
    let revisionTree: RevisionTree = {} as RevisionTree;

    for (let revisionHash in obj.revisions) {
        const revision = obj.revisions[revisionHash];
        const parentHash = revision.previous_verification_hash;
        if (parentHash === "") {
            // This is the root node
            revisionTree.hash = revisionHash;
            revisionTree.children = [];
        } else {
            // Find the parent node
            const parentNode = findNode(revisionTree, parentHash);
            if (parentNode) {
                // Add the current node as a child of the parent node
                parentNode.children.push({
                    hash: revisionHash,
                    children: []
                });
            }
        }
    }

    return revisionTree;

}

export function createAquaTree(aquaObject: any) {
    let tree = createAquaObjectTree(aquaObject)
    let pathResult = findHashWithLongestPath(tree)

    return {
        ...aquaObject,
        tree,
        treeMapping: pathResult
    }
}

export function logAquaTree(node: RevisionTree, prefix: string = "", isLast: boolean = true): void {
    // Log the current node's hash
    console.log(prefix + (isLast ? "└── " : "├── ") + node.hash);

    // Update the prefix for children
    const newPrefix = prefix + (isLast ? "    " : "│   ");

    // Recursively log each child
    node.children.forEach((child, index) => {
        const isChildLast = index === node.children.length - 1;
        logAquaTree(child, newPrefix, isChildLast);
    });
}