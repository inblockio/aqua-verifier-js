#!/bin/sh

test_description='Test file linking functionality'

. ./tests/sharness/sharness.sh

notarize="repo/notarize.js"
verify="repo/verify.js"

test_expect_success 'Setup test environment' '
    ln -s $(git rev-parse --show-toplevel) ./repo &&
    cp repo/README.md README.md &&
    cp repo/LICENSE LICENSE &&
    cp repo/notarize.js notarize.js
'

test_expect_success 'Create AQUA file for README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Create AQUA file for LICENSE' '
    $notarize LICENSE &&
    test -f LICENSE.aqua.json
'

test_expect_success 'Create AQUA file for notarize.js' '
    $notarize notarize.js &&
    test -f notarize.js.aqua.json
'

test_expect_success 'Create link between files' '
    $notarize --link LICENSE,notarize.js README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Verify linked README.md' '
    $verify README.md
'

# Cleanup
test_expect_success 'Cleanup test files' '
    rm -f README.md.aqua.json &&
    rm -f LICENSE.aqua.json &&
    rm -f notarize.js.aqua.json &&
    rm -f README.md &&
    rm -f LICENSE &&
    rm -f notarize.js
'

test_done 
