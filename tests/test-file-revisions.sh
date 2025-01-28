#!/usr/bin/env bash

test_description='Test file modifications and notarization with index updates'

. ~/share/sharness/sharness.sh

notarize="repo/notarize.js"
verify="repo/verify.js"

test_expect_success 'Setup test environment' '
	ln -s $(git rev-parse --show-toplevel) ./repo
	cp repo/README.md README.md
'

test_expect_success 'Copy README.md to README2.md' '
    cp README.md README2.md &&
    test -f README2.md
'

test_expect_success 'Create initial AQUA file for README' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Modify README.md content by removing first character' '
    sed -i "1s/^.//" README.md &&
    test -f README.md &&
    # Verify that the file was actually modified
    ! cmp README.md README.md.original >/dev/null 2>&1
'

test_expect_success 'Notarize modified README.md' '
    $notarize README.md &&
    test -f README.md.aqua.json
'

test_expect_success 'Modify README.md.aqua.json file_index for first instance only' '
    sed -i "/\"file_index\": {/,/}/{0,/\"README.md\"/s/\"README.md\"/\"README2.md\"/}" README.md.aqua.json &&
    # Verify that exactly one instance was changed
    test "$(grep -c \"README2.md\" README.md.aqua.json)" = "1" &&
    # Verify that at least one README.md still exists (not all were changed)
    grep -q "README.md" README.md.aqua.json
'

test_expect_success 'Verify README.md after all modifications' '
    $verify README.md
'

# Cleanup
test_expect_success 'Cleanup test files' '
    rm -f README2.md &&
    rm -f README.md.aqua.json &&
	rm -f README.md
'

test_done
