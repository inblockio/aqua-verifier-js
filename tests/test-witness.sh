#!/bin/sh

test_description='Test file verification functionality'

notarize="repo/notarize.js"
verify="repo/verify.js"

## ensure to install sharness
. ~/share/sharness/sharness.sh


test_expect_success 'Setup test environment' '
    ln -s $(git rev-parse --show-toplevel) ./repo &&
    cp repo/README.md README.md &&
    cp repo/LICENSE LICENSE &&
    cp repo/notarize.js notarize.js
    cp repo/formatter.js formatter.js
    cp repo/index.js index.js
'

test_expect_success 'Check README.md'  '
    test -f README.md
'

test_expect_success 'Create AQUA file for README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Witness README.md' '
    $notarize README.md  --witness nostr &&
    test -f README.md.aqua.json
'

test_expect_success 'Verify witnessed README.md' '
    $verify README.md
'

test_expect_success 'Remove revision from README.md' '
    $notarize README.md --rm
'

test_expect_success 'Check notarize.js'  '
    test -f notarize.js
'

test_expect_success 'Create AQUA file for notarize.js' '
    $notarize notarize.js &&
    test -f notarize.js.aqua.json
'

test_expect_success 'Witness notarize.js' '
    $notarize notarize.js  --witness tsa &&
    test -f notarize.js.aqua.json
'

test_expect_success 'Verify linked notarize.js' '
    $verify notarize.js
'

test_expect_success 'Check LICENSE'  '
    test -f LICENSE
'

test_expect_success 'Create AQUA file for LICENSE' '
    $notarize LICENSE &&
    test -f LICENSE.aqua.json
'

test_expect_success 'Create AQUA file for formatter.js' '
    $notarize formatter.js &&
    test -f formatter.js.aqua.json
'

test_expect_success 'Witness LICENSE' '
    $notarize README.md,LICENSE,formatter.js --witness eth --type cli &&
    test -f LICENSE.aqua.json
'

test_expect_success 'Verify witnessed README.md' '
    $verify LICENSE
'

test_expect_success 'Verify witnessed index.js' '
    $verify README.md
'

test_expect_success 'Verify witnessed formatter.js' '
    $verify formatter.js
'
# Cleanup
test_expect_success 'Cleanup test files' '
    rm -f README.md.aqua.json &&
    rm -f LICENSE.aqua.json &&
    rm -f notarize.js.aqua.json &&
    rm -f README.md &&
    rm -f LICENSE &&
    rm -f notarize.js &&
    rm -f actual_output
'

test_done 
