import { SignJWT } from "jose";
import { Octokit } from "octokit";

const APP_ID = process.env.NEXT_PUBLIC_GITHUB_APP_ID!;
const PRIVATE_KEY_B64 = process.env.NEXT_PUBLIC_GITHUB_PRIVATE_KEY!;
const INSTALLATION_ID = process.env.NEXT_PUBLIC_GITHUB_INSTALLATION_ID!;

function getPrivateKeyPem(): string {
  return atob(PRIVATE_KEY_B64);
}

/** Convert a PEM (PKCS#1 or PKCS#8) to a CryptoKey via Web Crypto */
async function importPrivateKey(): Promise<CryptoKey> {
  const pem = getPrivateKeyPem();
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");

  const header = isPkcs1
    ? "-----BEGIN RSA PRIVATE KEY-----"
    : "-----BEGIN PRIVATE KEY-----";
  const footer = isPkcs1
    ? "-----END RSA PRIVATE KEY-----"
    : "-----END PRIVATE KEY-----";

  const b64 = pem.replace(header, "").replace(footer, "").replace(/\s/g, "");
  const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    isPkcs1 ? "pkcs8" : "pkcs8",
    isPkcs1 ? wrapPkcs1InPkcs8(binary) : binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"],
  );
}

/** Wrap a PKCS#1 RSAPrivateKey DER inside a PKCS#8 envelope */
function wrapPkcs1InPkcs8(pkcs1Der: Uint8Array): ArrayBuffer {
  // PKCS#8 wraps PKCS#1 as:
  //   SEQUENCE {
  //     INTEGER 0
  //     SEQUENCE { OID rsaEncryption, NULL }
  //     OCTET STRING { <pkcs1 DER> }
  //   }
  const rsaOid = new Uint8Array([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const octetString = wrapAsn1(0x04, pkcs1Der);
  const inner = concatBytes(version, rsaOid, octetString);
  return wrapAsn1(0x30, inner).buffer as ArrayBuffer;
}

function wrapAsn1(tag: number, content: Uint8Array): Uint8Array {
  const len = encodeAsn1Length(content.length);
  const result = new Uint8Array(1 + len.length + content.length);
  result[0] = tag;
  result.set(len, 1);
  result.set(content, 1 + len.length);
  return result;
}

function encodeAsn1Length(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  let temp = length;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

async function createAppJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPrivateKey();

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(APP_ID)
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 10 * 60)
    .sign(privateKey);
}

let cachedToken: { token: string; expiresAt: Date } | null = null;

async function getInstallationToken(): Promise<string> {
  if (cachedToken && new Date(cachedToken.expiresAt) > new Date()) {
    return cachedToken.token;
  }

  const jwt = await createAppJwt();

  const response = await fetch(
    `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to get installation token: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  cachedToken = { token: data.token, expiresAt: new Date(data.expires_at) };
  return data.token;
}

export async function getOctokit(): Promise<Octokit> {
  const token = await getInstallationToken();
  return new Octokit({ auth: token });
}
