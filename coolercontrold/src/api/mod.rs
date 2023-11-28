/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2023  Guy Boldon
 * |
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * |
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * |
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

use std::sync::Arc;

use actix_cors::Cors;
use actix_web::{App, get, HttpResponse, HttpServer, post, put, Responder, web};
use actix_web::dev::{RequestHead, Server};
use actix_web::http::header::HeaderValue;
use actix_web::http::StatusCode;
use actix_web::middleware::{Compat, Condition, Logger};
use actix_web::web::{Data, Json};
use anyhow::Result;
use derive_more::{Display, Error};
use log::{error, LevelFilter, warn};
use nix::sys::signal;
use nix::sys::signal::Signal;
use nix::unistd::Pid;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::AllDevices;
use crate::config::Config;
use crate::processors::SettingsProcessor;

mod devices;
mod status;
mod settings;
mod profiles;
mod functions;
mod utils;

const API_SERVER_PORT: u16 = 11987;
const API_SERVER_ADDR_V4: &str = "127.0.0.1";
const API_SERVER_ADDR_V6: &str = "[::1]:11987";
const API_SERVER_WORKERS: usize = 1;

include!(concat!(env!("OUT_DIR"), "/generated.rs"));

/// Returns a simple handshake to verify established connection
#[get("/handshake")]
async fn handshake() -> Result<impl Responder, CCError> {
    Ok(Json(json!({"shake": true})))
}

#[post("/shutdown")]
async fn shutdown() -> Result<impl Responder, CCError> {
    signal::kill(Pid::this(), Signal::SIGQUIT)
        .map(|_| HttpResponse::Ok().finish())
        .map_err(|err| CCError::InternalError { msg: err.to_string() })
}

// DEPRECATED. To be removed in a future release.
#[post("/thinkpad_fan_control")]
async fn thinkpad_fan_control(
    fan_control_request: Json<ThinkPadFanControlRequest>,
    settings_processor: Data<Arc<SettingsProcessor>>,
) -> Result<impl Responder, CCError> {
    handle_simple_result(
        settings_processor.thinkpad_fan_control(&fan_control_request.enable).await
    )
}

/// Enables or disables ThinkPad Fan Control
#[put("/thinkpad-fan-control")]
async fn thinkpad_fan_control_new(
    fan_control_request: Json<ThinkPadFanControlRequest>,
    settings_processor: Data<Arc<SettingsProcessor>>,
) -> Result<impl Responder, CCError> {
    handle_simple_result(
        settings_processor.thinkpad_fan_control(&fan_control_request.enable).await
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ThinkPadFanControlRequest {
    enable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ErrorResponse {
    error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Display, Error)]
pub enum CCError {
    #[display(fmt = "Internal Error: {}", msg)]
    InternalError { msg: String },

    #[display(fmt = "Error with external library: {}", msg)]
    ExternalError { msg: String },

    #[display(fmt = "Resource not found: {}", msg)]
    NotFound { msg: String },

    #[display(fmt = "{}", msg)]
    UserError { msg: String },
}

impl actix_web::error::ResponseError for CCError {
    fn status_code(&self) -> StatusCode {
        match *self {
            CCError::InternalError { .. } => StatusCode::INTERNAL_SERVER_ERROR,
            CCError::ExternalError { .. } => StatusCode::BAD_GATEWAY,
            CCError::NotFound { .. } => StatusCode::NOT_FOUND,
            CCError::UserError { .. } => StatusCode::BAD_REQUEST,
        }
    }

    fn error_response(&self) -> HttpResponse {
        error!("{:?}", self.to_string());
        HttpResponse::build(self.status_code())
            .json(Json(ErrorResponse { error: self.to_string() }))
    }
}

impl From<std::io::Error> for CCError {
    fn from(err: std::io::Error) -> Self {
        CCError::InternalError { msg: err.to_string() }
    }
}

impl From<anyhow::Error> for CCError {
    fn from(err: anyhow::Error) -> Self {
        if let Some(underlying_error) = err.downcast_ref::<CCError>() {
            underlying_error.clone()
        } else {
            CCError::InternalError { msg: err.to_string() }
        }
    }
}

fn handle_error(err: anyhow::Error) -> CCError { err.into() }

fn handle_simple_result(result: Result<()>) -> Result<impl Responder, CCError> {
    result
        .map(|_| HttpResponse::Ok().finish())
        .map_err(handle_error)
}

fn config_server(
    cfg: &mut web::ServiceConfig,
    all_devices: AllDevices,
    settings_processor: Arc<SettingsProcessor>,
    config: Arc<Config>,
) {
    cfg
        // .app_data(web::JsonConfig::default().limit(5120)) // <- limit size of the payload
        .app_data(Data::new(all_devices))
        .app_data(Data::new(settings_processor))
        .app_data(Data::new(config))
        .service(handshake)
        .service(shutdown)
        .service(thinkpad_fan_control)
        .service(devices::get_devices)
        .service(status::get_status)
        .service(devices::get_device_settings)
        .service(devices::apply_device_settings)
        .service(devices::apply_device_setting_manual)
        .service(devices::apply_device_setting_profile)
        .service(devices::apply_device_setting_lcd)
        .service(devices::get_device_lcd_images)
        .service(devices::apply_device_setting_lcd_images)
        .service(devices::process_device_lcd_images)
        .service(devices::apply_device_setting_lighting)
        .service(devices::apply_device_setting_pwm)
        .service(devices::apply_device_setting_reset)
        .service(devices::asetek)
        .service(profiles::get_profiles)
        .service(profiles::save_profiles_order)
        .service(profiles::save_profile)
        .service(profiles::update_profile)
        .service(profiles::delete_profile)
        .service(functions::get_functions)
        .service(functions::save_functions_order)
        .service(functions::save_function)
        .service(functions::update_function)
        .service(functions::delete_function)
        .service(settings::get_cc_settings)
        .service(settings::apply_cc_settings)
        .service(settings::get_cc_settings_for_all_devices)
        .service(settings::get_cc_settings_for_device)
        .service(settings::save_cc_settings_for_device)
        .service(settings::save_ui_settings)
        .service(settings::get_ui_settings)
        .service(actix_web_static_files::ResourceFiles::new("/", generate()));
}

fn config_logger() -> Condition<Compat<Logger>> {
    Condition::new(
        log::max_level() == LevelFilter::Trace,
        Compat::new(Logger::default()),
    )
}

fn config_cors() -> Cors {
    Cors::default()
        .allow_any_method()
        .allow_any_header()
        .allowed_origin_fn(|origin: &HeaderValue, _req_head: &RequestHead| {
            if let Ok(str) = origin.to_str() {
                str.contains("//localhost:")
                    || str.contains("//127.0.0.1:")
                    || str.contains("//[::1]:")
            } else {
                false
            }
        })
}

pub async fn init_server(
    all_devices: AllDevices,
    settings_processor: Arc<SettingsProcessor>,
    config: Arc<Config>,
) -> Result<Server> {
    let move_all_devices = all_devices.clone();
    let move_settings_processor = settings_processor.clone();
    let move_config = config.clone();
    let server = HttpServer::new(move || {
        App::new()
            .wrap(config_logger())
            .wrap(config_cors())
            .configure(|cfg| config_server(
                cfg,
                move_all_devices.clone(),
                move_settings_processor.clone(),
                move_config.clone())
            )
    })
        .workers(API_SERVER_WORKERS)
        .bind((API_SERVER_ADDR_V4, API_SERVER_PORT))?;
    // we attempt to bind to the standard ipv4 and ipv6 loopback addresses
    // but will fallback to ipv4 only if ipv6 is not enabled
    match server.bind(API_SERVER_ADDR_V6) {
        Ok(ipv6_bound_server) => Ok(ipv6_bound_server.run()),
        Err(err) => {
            warn!("Failed to bind to loopback ipv6 address: {err}");
            Ok(
                HttpServer::new(move || {
                    App::new()
                        .wrap(config_logger())
                        .wrap(config_cors())
                        .configure(|cfg|
                            config_server(
                                cfg,
                                all_devices.clone(),
                                settings_processor.clone(),
                                config.clone(),
                            )
                        )
                })
                    .workers(API_SERVER_WORKERS)
                    .bind((API_SERVER_ADDR_V4, API_SERVER_PORT))?
                    .run()
            )
        }
    }
}