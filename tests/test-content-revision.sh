
test_description='Test file modifications and notarization with index updates'

echo "Current Path: $(pwd)"
. ./tests/sharness/sharness.sh

notarize="repo/notarize.js"
verify="repo/verify.js"

test_expect_success 'Setup test environment' '
	ln -s $(git rev-parse --show-toplevel) ./repo
	cp repo/README.md README.md
'

test_expect_success 'Create initial AQUA file for README with content parameter' '
    $notarize README.md --content &&
    test -f README.md.aqua.json
'

test_expect_success 'Check README.md.aqua.json contains a content' '
   test -n "$(cat README.md.aqua.json | grep \"content\")"
'

# experimenttation
test_expect_success 'Check README.md.aqua.json contains a content' '
    cat README.md.aqua.json && grep \"content\" README.md.aqua.json
'

test_done