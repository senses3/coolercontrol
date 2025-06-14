FROM ubuntu:22.04

LABEL maintainer=codifryed
# Image for standard pipeline tests

ENV DEBIAN_FRONTEND=noninteractive
# Use C.UTF-8 locale to avoid issues with ASCII encoding
ENV LC_ALL=C.UTF-8
ENV LANG=C.UTF-8
ENV CI=true
ENV PYTHONFAULTHANDLER=1 \
    PYTHONUNBUFFERED=1 \
    # pip
    PIP_DISABLE_PIP_VERSION_CHECK=on \
    PIP_DEFAULT_TIMEOUT=100
# Using 22.04 LTS rust version, currently 1.70 - not supported by many libs now
# on 2024-03-01 22.04 updated rust to 1.75, so we can use that.
# on 2024-09-17 22.04 updated rust to 1.80, and likely will be updated to 1.81 soon.
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH \
    RUST_VERSION=1.82.0
ENV PATH=/root/.cargo/bin:$PATH

# 22.04 comes with v12, 23.04/Lunar comes with v18.
# todo: update when 24.04 LTS comes out, then we can use the official nodejs package
ENV NODE_MAJOR=18


# install most deps beforehand to keep this pipeline fast:
RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
        # for standard appstream checks:
        desktop-file-utils appstream-util \
        # rust
        cargo \
        jq \
        # python
        python3-pip \
        python3-venv \
        # needed deps for building liquidctl deps:
        python3-dev \
        libusb-1.0-0 \
        # build essentials:
        curl \
        git \
        build-essential \
        dbus \
        # nodejs from nodesource:
        ca-certificates \
        gnupg \
        # qt build deps: (for fast testing)
        # already used above:  build-essential \
        cmake \
        xvfb \
        libgl1-mesa-dev \
        libqt6opengl6-dev \
        qt6-base-dev \
        qt6-webengine-dev \
        qt6-webengine-dev-tools \
        libdrm-dev \
        # debian package helper
        debhelper

# rust toolchain
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --no-modify-path --profile minimal --default-toolchain $RUST_VERSION && \
    chmod -R a+w $RUSTUP_HOME $CARGO_HOME

# needed until ubuntu updates to nodejs from v12 to v18
RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && apt-get install -y --no-install-recommends nodejs

RUN pip3 install --upgrade pip

# for our conversion to gitlib test results
RUN rustup component add clippy && \
    cargo install cargo-audit gitlab-report nixpkgs-fmt --locked

RUN apt-get -y autoclean
