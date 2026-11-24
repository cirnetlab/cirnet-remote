use cirnet_contracts_native::hardware_v2;
use prost::Message;
use prost_types::FileDescriptorSet;
use std::error::Error;

fn main() -> Result<(), Box<dyn Error>> {
    tonic_prost_build::configure()
        .build_client(true)
        .build_server(false)
        .extern_path(
            ".cirnet.hardware.v2",
            "::cirnet_contracts_native::hardware_v2",
        )
        .compile_fds(FileDescriptorSet::decode(hardware_v2::FILE_DESCRIPTOR_SET)?)?;
    Ok(())
}
