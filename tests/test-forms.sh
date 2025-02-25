#!/usr/bin/env bash

test_description='Test form notarization, verification, and updates'
. ./tests/sharness/sharness.sh

# Get the project root directory
project_root=$(git rev-parse --show-toplevel)

# Set up paths relative to the project root
notarize="${project_root}/notarize.js"
verify="${project_root}/verify.js"
form_updater="${project_root}/form_updater.js"
example_form="${project_root}/tests/form_testdata/example-form.json"
example_form_attestation="${project_root}/tests/form_testdata/example-form-attestation.json"

test_expect_success 'Setup test environment' '
    mkdir -p ${project_root}/tests/form_testdata 
'

test_expect_success 'Verify test files exist' '
    test -f ${example_form} &&
    test -f ${example_form_attestation}
'

test_expect_success 'Notarize initial form' '
    ${notarize} ${example_form} --form ${example_form} &&
    test -f ${example_form}.aqua.json
'

test_expect_success 'Notarize attestation form' '
    ${notarize} ${example_form} --form ${example_form_attestation}
'

test_expect_success 'Verify initial form' '
    ${verify} ${example_form}.aqua.json
'

test_expect_success 'Delete date_of_birth field' '
    ${form_updater} ${example_form}.aqua.json --delete date_of_birth
'

test_expect_success 'Verify after deletion' '
    ${verify} ${example_form}.aqua.json -v
'

test_expect_success 'Update date_of_birth field' '
    ${form_updater} ${example_form}.aqua.json --update date_of_birth "1995-10-15"
'

test_expect_success 'Final verification' '
    ${verify} ${example_form} -v'

test_expect_success 'Cleanup test files' '
    rm -f ${example_form}.aqua.json
'

test_done
