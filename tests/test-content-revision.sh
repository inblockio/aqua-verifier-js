
test_description='Test file modifications and notarization with index updates'

echo "Current Path: $(pwd)"
. ./tests/sharness/sharness.sh

notarize="repo/notarize.js"
verify="repo/verify.js"

test_expect_success 'Setup test environment' '
	ln -s $(git rev-parse --show-toplevel) ./repo
	cp repo/README.md README.md
'

