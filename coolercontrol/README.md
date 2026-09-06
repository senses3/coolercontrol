# Qt Desktop Application

The desktop application is written in C++ and uses the [Qt6](https://www.qt.io/product/qt6)
framework to create a native desktop application which renders the UI assets using QtWebEngine,
which is based on the [chromium](https://www.chromium.org/) browser engine.

## Saved daemon connections

The app remembers a list of daemons and switches between them from the **Daemons** submenu in the
system tray, which appears once more than one is saved. Connections are added and edited in **Daemon
Connection...**, where each can be given an optional name (blank shows `host:port`).

One daemon is connected at a time. Switching drops the old connection, brings the window up, and
loads the new daemon's UI. Certificate pins, tray pinned sensors and access tokens are all stored
per `host:port`, so each daemon keeps its own.

**Known limitation:** cookies are not scoped by port, so two daemons on the _same host_ with
different ports overwrite each other's session cookie and the UI has to log in again on every
switch. The tray keeps working either way, since it uses a per-daemon access token. Daemons on
different hosts are unaffected.

## Package Requirements RPM

### Runtime RPM

- qt6-qtbase
- qt6-qtwebengine
- qt6-qtwebchannel

### Development RPM

- make automake gcc gcc-c++
- cmake
- qt6-qtbase-devel
- qt6-qtwebengine-devel
- qt6-qtwebchannel-devel

## Package Requirements DEB

### Runtime DEB

- qt6-base-dev (not 100% accurate - many smaller non-dev deps)
- qt6-qpa-plugins
- libqt6webenginewidgets6
- libqt6webenginecore6-bin
- libxcb-cursor0 (for X11)

### Development DEB

- build-essential
- cmake
- qt6-base-dev
- qt6-webengine-dev
- qt6-webengine-dev-tools

## Installation

```bash
make build
sudo make install
```

**Alternatively:**  
One can use the build and dev-install steps below.

## Development

The Standard debugger is helpful for C++ development. Also, it's quite common to use a npm dev
server when testing Web & Qt changes. To use that properly, one needs to comment out the
`// url.setPort(DEFAULT_DAEMON_PORT);` line on line 226 of `main_window.cpp`. (subject to change in
the future)

Also note, that compilation is relatively quick, so testing with the release build is ok for most
things.

```bash
make
./build/coolercontrol
```

**Alternatively:**  
You can also build the daemon and desktop release binaries:

```bash
cd .. && make build
```

Install the build daemon and desktop binaries to the system:

```bash
cd .. && make dev-install
```

Run all tests for the UI assets, daemon, and desktop application:

```bash
cd .. && make test
```

## Formatting

CoolerControl uses [Trunk.io](https://github.com/trunk-io) to format all files for the entire
repository. The first time you run this, it may take a while as it downloads all the tools and
formatters needed for the project.

This will check if there are formatting or linting issues:

```bash
# cd to repository root directory
cd ..
make ci-check
```

This will auto-format all files. Afterward, commit any changes:

```bash
# cd to repository root directory
cd ..
make ci-fmt
```
