# Scripting Examples

CoolerControl has an extensive REST API that the UI uses to communicate with the Daemon.

Scripts and other programs can also use this API to extend or automate certain flows as the user
sees fit. In the future, there may be more official CLI helpers and an official OpenAPI
specification, but until then this directory contains some basic scripts to help users get started
with writing their own.

## Python script examples

You need to have the Python3 `requests` library installed. It might already be installed, but if not
then there are several ways to do this depending on your distribution.

1. Install the system package, which is often called: `python3-requests`
2. Install using pip: `python3 -m pip install requests`

List all devices, channels, and modes:

```bash
./cc.py -l
```

Set LCD screen image:

```bash
./cc.py -m kraken -c lcd --image /home/user/pictures/images.gif
```

View the `cc.py` script for examples and information.

## Icon generation

The app icons, the notification icons and the animated logo are generated, not hand-drawn. Re-run
these after changing the mark, and commit what they write. They need `cairosvg`, `pillow` and
`numpy` (`python3 -m pip install cairosvg pillow numpy`).

```bash
./gen-app-icons.py             # symbolic + colour SVGs, PNGs, PWA icons, favicon
./gen-notification-icons.py    # shutdown, information, alert-*
./make-animated-icon.py        # coolercontrol-animated.gif, from the colour SVG
```

Run `gen-app-icons.py` before `make-animated-icon.py`: the GIF is rendered from the colour SVG the
first one writes. `gen-app-icons.py --check` renders everything without writing, which catches an
SVG that a renderer silently drops.

Follow any of them with `make ci-fmt` from the repo root. They write plain PNGs, and CI runs oxipng
over the tree, so a generated icon fails `make ci-check` until it has been optimised. Optimisation
is lossless, so it never changes what the icon looks like.
