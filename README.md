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

Requires:
* [Node.js](https://nodejs.org/en/) 10, or later. (with [npm](https://nodejs.org/en/download/package-manager/))
