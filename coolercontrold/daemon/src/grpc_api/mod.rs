// SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

mod cc_device_service;

use crate::api::actor::{DeviceHandle, StatusHandle};
use crate::grpc_api::cc_device_service::CCDeviceService;
use crate::grpc_api::device_service::v1::device_service_server::DeviceServiceServer;
use anyhow::Result;
use std::net::SocketAddr;
use tokio_util::sync::CancellationToken;
use tonic::transport::Server;

// Note: the rust module relational hierarchy MUST follow the proto package hierarchy
pub mod models {
    pub mod v1 {
        #![allow(clippy::pedantic)]
        tonic::include_proto!("coolercontrol.models.v1");
    }
}
pub mod device_service {
    pub mod v1 {
        #![allow(clippy::pedantic)]
        tonic::include_proto!("coolercontrol.device_service.v1");
    }
}

pub async fn create_grpc_api_server(
    addr: SocketAddr,
    device_handle: DeviceHandle,
    status_handle: StatusHandle,
    calibration_handle: crate::api::actor::CalibrationHandle,
    cancel_token: CancellationToken,
) -> Result<()> {
    let service = CCDeviceService::new(device_handle, status_handle, calibration_handle);
    let (health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<DeviceServiceServer<CCDeviceService>>()
        .await;
    // Server reflection is deliberately not registered. This port is unauthenticated, and
    // nothing in the project consumes reflection: the protos are published in the
    // cc-plugins repository, which is where a plugin author gets the service definition.
    Server::builder()
        .add_service(health_service)
        .add_service(DeviceServiceServer::new(service))
        .serve_with_shutdown(addr, cancel_token.cancelled())
        .await?;
    Ok(())
}
