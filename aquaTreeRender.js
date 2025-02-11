#!/usr/bin/env node

import { logAquaTree } from "./aquavhtree.js"

import * as fs from "fs"

function renderTree(){
    const aquaObject = JSON.parse(fs.readFileSync("./LICENSE.aqua.json"))
    logAquaTree(aquaObject?.tree)
}

renderTree()