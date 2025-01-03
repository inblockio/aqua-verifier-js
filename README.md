# data-accounting-external-verifier
JS Client for external verifier.
Goal: A shared library supports a commandline execution and a chrome-extension which is implementation independent. So the verify.js will support not only the mediawiki integration but potentially other third party integrations of the verification procedure.

## Minimum Requirements
Node.js 14.x+

```sh
-sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
```
But it is recommended to run the latest Node.js.

## Functional description
* configure remote domain (by default use localhost as domoain) to query REST API to verify page
* configure title name to select which page to verify


## Usage

### 1. Notarizing / Signing / Witnessing a file

To notarize a file use the following command

```bash 
./notarize.js <FILE_PATH>
```

ie 

```bash 
./notarize.js ./LICENSE
```


To sign a file use the following command

```bash
./notarize.js --sign [cli|metamask|did] <FILE_PATH>
```

ie 

```bash
./notarize.js --sign cli ./LICENSE
```


To witness a file, use the following command

```bash
./notarize.js [--witness-eth|--witness-nostr|--witness-tsa] <FILE_PATH>
```

ie

```bash
./notarize.js --witness-eth ./LICENSE
```

### 1.1. Notarizing / Signing / Witnessing Options

There are some options to facilitate the above actions ie lightweight aquafication ie using `--scalar` flag, and `--content` to include file content when doing aquafication

ie

```bash
./notarize.js --scalar ./LICENSE
```

ie

```bash
./notarize.js --content ./LICENSE
```

### 2. Aqua chain verification

To verify an aqua chain use the following command

```bash
./verify.js <AQUA_CHAIN_FILE_PATH>
```

ie

```bash
./verify.js LICENSE.aqua.json
```

#### 2.1. Verification Options

##### 2.1.1. `-v` - Outputting verbose results

Use the `-v` for result versboseness ie

```bash
./verify.js LICENSE.aqua.json -v
```

##### 2.1.2. `--ignore-merkle-proof` - Ignore verifying the witness merkle proof of each revision

Use the `--ignore-merkle-proof` for ignore verifying merkle proof of each revision. Verification is faster ie

```bash
./verify.js LICENSE.aqua.json --ignore-merkle-proof
```

### 3. Deleting a revision from Aqua Chain

This will delete the last revision from an aqua chain

```bash
./notarize.js --remove <FILE_PATH>
```

ie

```bash
./notarize.js --remove ./LICENSE
```


### 4. Linking an Aqua chain to another

To link an Aqua chain to another use the `--link` option as follows

```bash
./notarize.js --link <FILE_PATH.aqua.json> <FILE_PATH>
```

ie

```bash
./notarize.js --link ./README.md.aqua.json ./LICENSE
```

This will link `README.md.aqua.json` to `LICENSE` file and it will be written into `LICENSE.aqua.json` file



