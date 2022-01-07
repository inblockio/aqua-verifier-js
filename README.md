# data-accounting-external-verifier
A JS Client for the external verifier. 

Goal: A shared library supports a commandline execution and a chrome-extension which is implementation independent. So the verify.js will support not only the mediawiki integration, but potentially other third party integrations using the verification procedure.

Functional description:
* Configure remote domain (by default, use localhost) to query REST API to verify page
* Configure title name to select which page to verify

Requires:
* [Node.js](https://nodejs.org/en/) 10, or later. (with [npm](https://nodejs.org/en/download/package-manager/))
