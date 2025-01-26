T = $(wildcard tests/test-*.sh)

test: $(T)
	@$(MAKE) --silent clean

$(T): clean
	./$@ $(TEST_OPTS) -v

clean:
	@rm -fr test-results

.PHONY: test $(T) clean
