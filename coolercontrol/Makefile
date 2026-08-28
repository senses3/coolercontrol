# CoolerControl Makefile
.DEFAULT_GOAL := build

.PHONY: build test ci-test clean install uninstall

# Where `install` lands: GNUInstallDirs maps the configured prefix of / to usr/bin.
prefix := '/usr'
executable := 'coolercontrol'

build:
	@cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/ 
	@$(MAKE) -C build -j8

test:
	@echo "success"

ci-test: build
	@echo "success"

clean:
	@-$(RM) -rf build

install:
	@$(MAKE) -C build $@

# CMake generates no uninstall target, so delegating to the build dir fails even
# when it exists, and taking the whole recipe down with it. Remove the installed
# binary directly, the way the daemon does.
uninstall:
	@-$(RM) -f $(DESTDIR)$(prefix)/bin/$(executable)

