//! src/e2e.rs — E2E session cryptography (docs/e2e-protocol.md v1):
//! Ed25519 transcript signing, X25519+HKDF-SHA256 key derivation, and the
//! ChaCha20-Poly1305 frame cipher. Cross-implementation parity with the
//! web client (apps/web/src/lib/e2e.ts) is pinned by
//! tests/fixtures/e2e-vector.json (see the tests module below).

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use ed25519_dalek::{Signer, SigningKey};
use hkdf::Hkdf;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};

/// Domain-separation label for the transcript signature AND the HKDF info
/// (docs/e2e-protocol.md §2.2, §2.4).
pub const PROTOCOL_INFO: &[u8] = b"rootz-e2e-v1";

/// The signed transcript: PROTOCOL_INFO || sid || client_eph || daemon_eph
/// (13 + 16 + 32 + 32 = 93 bytes).
pub fn transcript(sid: &[u8; 16], client_eph: &[u8; 32], daemon_eph: &[u8; 32]) -> Vec<u8> {
    let mut t = Vec::with_capacity(PROTOCOL_INFO.len() + 16 + 32 + 32);
    t.extend_from_slice(PROTOCOL_INFO);
    t.extend_from_slice(sid);
    t.extend_from_slice(client_eph);
    t.extend_from_slice(daemon_eph);
    t
}

pub fn sign_transcript(
    signing_key: &SigningKey,
    sid: &[u8; 16],
    client_eph: &[u8; 32],
    daemon_eph: &[u8; 32],
) -> [u8; 64] {
    signing_key
        .sign(&transcript(sid, client_eph, daemon_eph))
        .to_bytes()
}

/// Session key: HKDF-SHA256(ikm = X25519 shared, salt = client_eph ||
/// daemon_eph, info = PROTOCOL_INFO, L = 32).
pub fn derive_key(shared: &[u8; 32], client_eph: &[u8; 32], daemon_eph: &[u8; 32]) -> [u8; 32] {
    let mut salt = Vec::with_capacity(64);
    salt.extend_from_slice(client_eph);
    salt.extend_from_slice(daemon_eph);
    let hk = Hkdf::<Sha256>::new(Some(&salt), shared);
    let mut key = [0u8; 32];
    hk.expand(PROTOCOL_INFO, &mut key)
        .expect("32 bytes is within the HKDF-SHA256 expansion limit");
    key
}

/// device_id: lowercase hex of SHA-256(raw pubkey) — the API's pairing
/// derivation (handoff §1).
pub fn device_id_from_pubkey(pubkey: &[u8; 32]) -> String {
    hex(&Sha256::digest(pubkey))
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Per-session frame cipher. Random 12-byte nonce per message; empty AAD
/// (docs/e2e-protocol.md §2.4). Lives on the daemon's single WS pump
/// thread — never shared across threads.
pub struct SessionCipher {
    cipher: ChaCha20Poly1305,
}

impl SessionCipher {
    pub fn new(key: &[u8; 32]) -> SessionCipher {
        SessionCipher {
            cipher: ChaCha20Poly1305::new(&Key::from(*key)),
        }
    }

    pub fn seal(&self, plaintext: &[u8]) -> ([u8; 12], Vec<u8>) {
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        (nonce, self.seal_with_nonce(&nonce, plaintext))
    }

    /// Deterministic variant — used by `seal`, and by the cross-
    /// implementation fixture tests where the nonce is pinned.
    pub fn seal_with_nonce(&self, nonce: &[u8; 12], plaintext: &[u8]) -> Vec<u8> {
        self.cipher
            .encrypt(&Nonce::from(*nonce), plaintext)
            .expect("encryption cannot fail for in-range inputs")
    }

    /// None on authentication failure (docs/e2e-protocol.md §2.4: abort
    /// the session).
    pub fn open(&self, nonce: &[u8; 12], ciphertext: &[u8]) -> Option<Vec<u8>> {
        self.cipher.decrypt(&Nonce::from(*nonce), ciphertext).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    fn hex_decode(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    // RFC 8032 §7.1 TEST 1 — validates the exact SigningKey::from_bytes +
    // sign path the daemon uses for the transcript.
    #[test]
    fn rfc8032_ed25519_test1() {
        let seed: [u8; 32] = hex_decode("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
            .try_into()
            .unwrap();
        let key = SigningKey::from_bytes(&seed);
        assert_eq!(
            key.verifying_key().to_bytes(),
            hex_decode("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")[..]
        );
        let sig = key.sign(b"");
        assert_eq!(
            sig.to_bytes(),
            hex_decode("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")[..]
        );
    }

    // RFC 5869 §A.1 Test Case 1 — validates the exact Hkdf::new +
    // expand pattern derive_key uses (SHA-256, salt, ikm, info).
    #[test]
    fn rfc5869_hkdf_case1() {
        let ikm = [0x0bu8; 22];
        let salt = hex_decode("000102030405060708090a0b0c");
        let info = hex_decode("f0f1f2f3f4f5f6f7f8f9");
        let hk = Hkdf::<Sha256>::new(Some(&salt), &ikm);
        let mut okm = [0u8; 42];
        hk.expand(&info, &mut okm).unwrap();
        assert_eq!(
            okm[..],
            hex_decode("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865")[..]
        );
    }

    // RFC 8439 §2.8.2 — validates the exact ChaCha20Poly1305::new +
    // encrypt path SessionCipher uses (AAD variant; sessions use empty
    // AAD, which is the same call with b"").
    #[test]
    fn rfc8439_chacha20poly1305() {
        let key: [u8; 32] = hex_decode("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f")
            .try_into()
            .unwrap();
        let nonce: [u8; 12] = hex_decode("070000004041424344454647").try_into().unwrap();
        let aad = hex_decode("50515253c0c1c2c3c4c5c6c7");
        let plaintext = b"Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.";
        let cipher = ChaCha20Poly1305::new(&Key::from(key));
        let ct = cipher
            .encrypt(
                &Nonce::from(nonce),
                chacha20poly1305::aead::Payload { msg: plaintext, aad: &aad },
            )
            .unwrap();
        assert_eq!(
            ct[..],
            hex_decode(concat!(
                "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d63dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b3692ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3ff4def08e4b7a9de576d26586cec64b6116",
                "1ae10b594f09e26a7e902ecbd0600691"
            ))[..]
        );
    }

    #[test]
    fn session_cipher_roundtrip() {
        let key = [7u8; 32];
        let cipher = SessionCipher::new(&key);
        let (nonce, ct) = cipher.seal(b"hello rootz");
        assert_eq!(cipher.open(&nonce, &ct).unwrap(), b"hello rootz");
        // Authentication failure -> None (docs/e2e-protocol.md §2.4).
        let mut bad = ct.clone();
        bad[0] ^= 1;
        assert_eq!(cipher.open(&nonce, &bad), None);
    }

    #[test]
    fn transcript_layout() {
        let t = transcript(&[1u8; 16], &[2u8; 32], &[3u8; 32]);
        assert_eq!(t.len(), 13 + 16 + 32 + 32);
        assert_eq!(&t[..13], PROTOCOL_INFO);
        assert_eq!(&t[13..29], &[1u8; 16]);
        assert_eq!(&t[29..61], &[2u8; 32]);
        assert_eq!(&t[61..], &[3u8; 32]);
    }

    // Cross-implementation fixture: generated by
    // apps/web/tools/gen-e2e-vector.mjs and mirrored at
    // apps/web/src/lib/fixtures/e2e-vector.json. The web client's vitest
    // suite asserts the CLIENT-side operations against the same file, so
    // a byte-level drift between the implementations fails on BOTH sides.
    #[test]
    fn cross_impl_vector() {
        #[derive(serde::Deserialize)]
        struct Vector {
            sid_b64: String,
            client_eph_seed_b64: String,
            daemon_seed_b64: String,
            daemon_eph_seed_b64: String,
            nonce_b64: String,
            plaintext_inner_json: String,
            expect: Expect,
        }
        #[derive(serde::Deserialize)]
        struct Expect {
            client_eph_pub_b64: String,
            daemon_pubkey_b64: String,
            device_id: String,
            daemon_eph_pub_b64: String,
            welcome_sig_b64: String,
            session_key_hex: String,
            ciphertext_b64: String,
        }
        let v: Vector = serde_json::from_str(include_str!("../tests/fixtures/e2e-vector.json"))
            .expect("fixture parses");
        let dec = |s: &str| crate::proto::b64d(s).expect("fixture base64");

        let sid: [u8; 16] = dec(&v.sid_b64).try_into().unwrap();
        let client_seed: [u8; 32] = dec(&v.client_eph_seed_b64).try_into().unwrap();
        let daemon_seed: [u8; 32] = dec(&v.daemon_seed_b64).try_into().unwrap();
        let daemon_eph_seed: [u8; 32] = dec(&v.daemon_eph_seed_b64).try_into().unwrap();
        let nonce: [u8; 12] = dec(&v.nonce_b64).try_into().unwrap();

        // Identity + device_id.
        let signing_key = SigningKey::from_bytes(&daemon_seed);
        let pubkey = signing_key.verifying_key().to_bytes();
        assert_eq!(crate::proto::b64e(&pubkey), v.expect.daemon_pubkey_b64);
        assert_eq!(device_id_from_pubkey(&pubkey), v.expect.device_id);

        // Ephemerals (X25519 pubkeys from seeds).
        let client_eph_secret = x25519_dalek::StaticSecret::from(client_seed);
        let client_eph = x25519_dalek::PublicKey::from(&client_eph_secret).to_bytes();
        assert_eq!(crate::proto::b64e(&client_eph), v.expect.client_eph_pub_b64);
        let daemon_eph_secret = x25519_dalek::StaticSecret::from(daemon_eph_seed);
        let daemon_eph = x25519_dalek::PublicKey::from(&daemon_eph_secret).to_bytes();
        assert_eq!(crate::proto::b64e(&daemon_eph), v.expect.daemon_eph_pub_b64);

        // Transcript signature (deterministic Ed25519 -> cross-impl equal).
        let sig = sign_transcript(&signing_key, &sid, &client_eph, &daemon_eph);
        assert_eq!(crate::proto::b64e(&sig), v.expect.welcome_sig_b64);
        let vk = VerifyingKey::from_bytes(&pubkey).unwrap();
        vk.verify(&transcript(&sid, &client_eph, &daemon_eph), &Signature::from_bytes(&sig))
            .unwrap();

        // Session key from the DAEMON's DH view (client pub * daemon secret);
        // the web test does it from the client's view — same X25519 output.
        let shared = daemon_eph_secret.diffie_hellman(&x25519_dalek::PublicKey::from(client_eph));
        let key = derive_key(shared.as_bytes(), &client_eph, &daemon_eph);
        assert_eq!(hex(&key), v.expect.session_key_hex);

        // Frame cipher.
        let cipher = SessionCipher::new(&key);
        let ct = cipher.seal_with_nonce(&nonce, v.plaintext_inner_json.as_bytes());
        assert_eq!(crate::proto::b64e(&ct), v.expect.ciphertext_b64);
        assert_eq!(cipher.open(&nonce, &ct).unwrap(), v.plaintext_inner_json.as_bytes());
    }
}
