//! src/identity.rs — the daemon's Ed25519 device identity: generated on
//! first run, persisted under the state dir (docs/e2e-protocol.md §5).
//! The device_id derived from it is BOTH the pairing address (API) and
//! the relay dial-out address.

use std::fs;
use std::io;
use std::path::PathBuf;

use ed25519_dalek::SigningKey;
use rand::{rng, RngCore};

use crate::e2e::device_id_from_pubkey;

pub struct Identity {
    pub signing_key: SigningKey,
    pub pubkey: [u8; 32],
    pub device_id: String,
}

/// ROOTZD_STATE_DIR override, else /data/local/tmp/rootzd (the traditional
/// root-daemon scratch dir).
pub fn state_dir() -> PathBuf {
    match std::env::var("ROOTZD_STATE_DIR") {
        Ok(dir) if !dir.is_empty() => PathBuf::from(dir),
        _ => PathBuf::from("/data/local/tmp/rootzd"),
    }
}

/// Load `device.key` (raw 32-byte seed) or generate + persist it (mode
/// 0600). Also (re)writes the informational `device_id` text file.
pub fn load_or_generate() -> io::Result<Identity> {
    let dir = state_dir();
    fs::create_dir_all(&dir)?;
    let key_path = dir.join("device.key");

    let seed: [u8; 32] = match fs::read(&key_path) {
        Ok(bytes) => {
            let seed: [u8; 32] = bytes
                .try_into()
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "device.key is not 32 bytes"))?;
            eprintln!("rootzd: identity loaded from {}", key_path.display());
            seed
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            let mut seed = [0u8; 32];
            rng().fill_bytes(&mut seed);
            fs::write(&key_path, seed)?;
            // The key IS the device identity — owner-only, like an SSH host key.
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&key_path, fs::Permissions::from_mode(0o600))?;
            }
            eprintln!("rootzd: identity generated at {}", key_path.display());
            seed
        }
        Err(e) => return Err(e),
    };

    let signing_key = SigningKey::from_bytes(&seed);
    let pubkey = signing_key.verifying_key().to_bytes();
    let device_id = device_id_from_pubkey(&pubkey);
    // `cat`-able copy for the operator pairing flow (the id is logged too).
    fs::write(dir.join("device_id"), format!("{device_id}\n"))?;

    Ok(Identity { signing_key, pubkey, device_id })
}
