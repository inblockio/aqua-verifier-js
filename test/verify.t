#!/bin/sh

test_description='Show basic features of Sharness'

. /home/kamau/share/sharness/sharness.sh

test_expect_success 'Setup test environment' '
	ln -s $(git rev-parse --show-toplevel) ./repo
	cp repo/README.md README.md
'

test_expect_success 'We generate a geneis revision and check if LICENCE.md.aqua.json exists ' '
    repo/notarize.js LICENCE &&
    test -f LICENCE.md.aqua.json
'

test_expect_success 'Verify the output of verify.js' '
    repo/verify.js LICENCE > actual_output &&
    cat > expected_output <<EOF &&
        Status: VERIFIED
    EOF
        test_cmp expected_output actual_output
    '



test_done
