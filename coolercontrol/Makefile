# CoolerControl Makefile
.DEFAULT_GOAL := build

.PHONY: build test clean install uninstall

build:
	@cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/ 
	@$(MAKE) -C build -j8

test:
	@echo "success"

ci-test:
	@echo "success"

clean:
	@-$(RM) -rf build

install:
	@$(MAKE) -C build $@

uninstall:
	@$(MAKE) -C build $@

