# liqctld

is a CoolerControl service daemon written in Python for interacting with `liquidctl` devices on a
system level, and is embedded in the `coolercontrold` daemon. It wraps the underlying `liquidctl`
library providing an API that the main daemon interacts with using IPC over a Unix domain socket.

Functionally, it enables parallel device communication and access to specific underlying device
properties that are otherwise not exposed. It tries to be as generic as possible, but specific
driver handling is often required due to differences in the underlying devices. Resiliency and
device delay handling are also taken into account.

## Requirements

Requirements for `liqctld` are checked before the service is started, and the daemon will start
without the required libraries if not found.

### Runtime - optional for liquidctl device support

- A python3 interpreter >= 3.8
- `liquidctl` Python system package

### Build

- None

## Installation

See the [coolercontrold](../../README.md) installation instructions.

## Testing

### Unit tests

Run with the daemon's own suite, `make test` in `coolercontrold/`, or on their own:

```bash
python3 -m unittest discover -s daemon/resources/liqctld -t daemon/resources/liqctld
```

They need `liquidctl` and `Pillow` installed, since they compare against liquidctl's own
implementations. Building the daemon never requires them: without them the suite says so and skips.
The `test_all` pipeline job installs the current liquidctl and sets `LIQCTLD_TESTS_REQUIRED`, which
makes that skip an error, so a liquidctl release that moves what these patch is caught there.

### Endpoint testing

Changes to these files are embedded in the `coolercontrold` daemon at build time, and are largely
tested as part of that process. For specific endpoint testing:

#### Prerequisites

- `coolercontrold` and `liqctld` services are running
- `curl` is installed
- `sudo` is installed

#### Endpoints

Tests are run using `curl` to the `liqctld` UDS API.

- Handshake example:

  ```bash
  sudo curl --no-buffer -XGET --unix-socket /run/coolercontrold-liqctld.sock http://localhost/handshake
  ```

- Get all devices example:

  ```bash
  sudo curl --no-buffer -XGET --unix-socket /run/coolercontrold-liqctld.sock http://localhost/devices
  ```

- Endpoints: (`device_id` is the liqctld internal device_id, not the UID)
  - GET `/handshake`
  - GET `/devices`
  - POST `/devices/{device_id}/initialize`
  - PUT `/devices/{device_id}/legacy690`
  - GET `/devices/{device_id}/status`
  - PUT `/devices/{device_id}/speed/fixed`
  - PUT `/devices/{device_id}/speed/profile`
  - PUT `/devices/{device_id}/color`
  - PUT `/devices/{device_id}/screen`
  - POST `/quit`
