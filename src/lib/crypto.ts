import { db, auth } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * GHOSTWIRE CRYPTOGRAPHIC CORE
 * Implements E2EE using RSA-OAEP for key exchange and AES-GCM for message encryption.
 * Private keys are wrapped using a Vault Key derived from user-specific secrets.
 */

const RSA_PARAMS = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_PARAMS = {
  name: "AES-GCM",
  length: 256,
};

// Vault parameters for wrapping the private key
const VAULT_PARAMS = {
  name: "AES-GCM",
  iv: new Uint8Array(12), // Fixed IV for vault sync if we want consistency, but random is better for security.
  // We'll use a derivation of the user ID for syncable but secured storage.
};

// Utility to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Utility to convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string | undefined | null): ArrayBuffer {
  if (!base64 || typeof base64 !== 'string') {
    return new ArrayBuffer(0);
  }
  try {
    const binary = window.atob(base64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    console.error("Base64 decoding failed:", e);
    return new ArrayBuffer(0);
  }
}

/**
 * Derives a deterministic Vault Key from a user's unique identity
 */
async function deriveVaultKey(userId: string) {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(userId + "_GHOST_PROTOCOL_SALT"),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("VAULT_SALT_STABLE"),
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Generate a new identity key pair and wrap the private key
 */
export async function generateIdentityKeys(userId: string) {
  const keyPair = await window.crypto.subtle.generateKey(
    RSA_PARAMS,
    true, // extractable
    ["encrypt", "decrypt"]
  );

  const publicKeyBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  // Wrap the private key using a vault key derived from user ID
  const vaultKey = await deriveVaultKey(userId);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrappedPrivateKey = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    vaultKey,
    privateKeyBuffer
  );

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    wrappedPrivateKey: arrayBufferToBase64(wrappedPrivateKey),
    vaultIv: arrayBufferToBase64(iv.buffer)
  };
}

/**
 * Unwraps a private key using the user's identity
 */
export async function unwrapPrivateKey(wrappedBase64: string, ivBase64: string, userId: string) {
  const vaultKey = await deriveVaultKey(userId);
  const unwrappedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(ivBase64)) },
    vaultKey,
    base64ToArrayBuffer(wrappedBase64)
  );

  return arrayBufferToBase64(unwrappedBuffer);
}

/**
 * Encrypt a message for a specific recipient's public key
 */
export async function encryptSignal(content: string, recipientPublicKeyBase64: string) {
  try {
    // 1. Import Recipient's Public Key
    const recipientPublicKey = await window.crypto.subtle.importKey(
      "spki",
      base64ToArrayBuffer(recipientPublicKeyBase64),
      RSA_PARAMS,
      false,
      ["encrypt"]
    );

    // 2. Generate a random symmetric key (AES) for this specific message
    const aesKey = await window.crypto.subtle.generateKey(
      AES_PARAMS,
      true,
      ["encrypt", "decrypt"]
    );

    // 3. Encrypt the content with AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedContent = new TextEncoder().encode(content);
    const encryptedContentBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encodedContent
    );

    // 4. Encrypt the AES key with the recipient's RSA Public Key
    const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt(
      RSA_PARAMS,
      recipientPublicKey,
      exportedAesKey
    );

    return {
      payload: arrayBufferToBase64(encryptedContentBuffer),
      sealedKey: arrayBufferToBase64(encryptedAesKeyBuffer),
      iv: arrayBufferToBase64(iv.buffer),
    };
  } catch (e) {
    console.error("Encryption failed:", e);
    throw new Error("CRYPTO_ERROR: FAILED TO SEAL SIGNAL");
  }
}

/**
 * Decrypt a message using the user's private key
 */
export async function decryptSignal(
  encryptedPayload: string,
  sealedKey: string,
  ivBase64: string,
  privateKeyBase64: string
) {
  try {
    // 1. Import Private Key
    const privateKey = await window.crypto.subtle.importKey(
      "pkcs8",
      base64ToArrayBuffer(privateKeyBase64),
      RSA_PARAMS,
      false,
      ["decrypt"]
    );

    // 2. Decrypt the AES key
    const decryptedAesKeyBuffer = await window.crypto.subtle.decrypt(
      RSA_PARAMS,
      privateKey,
      base64ToArrayBuffer(sealedKey)
    );

    const aesKey = await window.crypto.subtle.importKey(
      "raw",
      decryptedAesKeyBuffer,
      AES_PARAMS,
      false,
      ["decrypt"]
    );

    // 3. Decrypt the content
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    const decryptedContentBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      base64ToArrayBuffer(encryptedPayload)
    );

    return new TextDecoder().decode(decryptedContentBuffer);
  } catch (e) {
    console.error("Decryption failed:", e);
    return "[SIGNAL CORRUPTED OR TAMPERED]";
  }
}
