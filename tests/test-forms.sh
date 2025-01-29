#!/usr/bin/env bash

test_description='Test form notarization, verification, and updates'

. ~/share/sharness/sharness.sh

# Get the project root directory
project_root=$(git rev-parse --show-toplevel)

# Set up paths relative to the project root
notarize="${project_root}/notarize.js"
verify="${project_root}/verify.js"
form_updater="${project_root}/form_updater.ts"
example_form="${project_root}/tests/form_testdata/example-form.json"
example_form_attestation="${project_root}/tests/form_testdata/example-form-attestation.json"

test_expect_success 'Setup test environment' '
    mkdir -p ${project_root}/tests/form_testdata &&
    cp ${example_form} ${project_root}/tests/form_testdata/ &&
    cp ${example_form} ${project_root}/tests/form_testdata/example-form-attestation.json
'

test_expect_success 'Verify test files exist' '
    test -f ${example_form} &&
    test -f ${example_form_attestation}
'

test_expect_success 'Notarize initial form' '
    ${notarize} ${example_form} --form ${example_form} &&
    test -f ${example_form}.aqua.json
'

test_expect_success 'Sign initial form' '
    ${notarize} ${example_form} --sign cli
'

test_expect_success 'Notarize attestation form' '
    ${notarize} ${example_form} --form ${example_form_attestation}
'

test_expect_success 'Verify initial form' '
    ${verify} ${example_form}.aqua.json
'

test_expect_success 'Delete age field' '
    ${form_updater} ${example_form}.aqua.json --delete age
'

test_expect_success 'Verify after deletion' '
    ${verify} ${example_form}.aqua.json
'

test_expect_success 'Update age field' '
    ${form_updater} ${example_form}.aqua.json --update age 200
'

test_expect_success 'Final verification' '
    ${verify} ${example_form}.aqua.json
'

test_expect_success 'Cleanup test files' '
    rm -f ${example_form}.aqua.json &&
'

test_done
