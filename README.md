# data-accounting-external-verifier
JS Client for external verifier. 
Goal: A shared library supports a commandline execution and a chrome-extension which is implementation independent. So the verifier.js will support not only the mediawiki integration but potentially other third party integrations of the verification procedure.

Functional description:
* configure remote domain (by defaul use localhost as domoain) to query REST API to verify page
* configure title name to select which page to verify

Requires:
* [Node.js](https://nodejs.org/en/) 10, or later. (with [npm](https://nodejs.org/en/download/package-manager/))
