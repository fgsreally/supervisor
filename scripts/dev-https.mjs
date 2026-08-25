import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { X509Certificate } from "node:crypto";
import { hostname, networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const certificateDir = resolve(root, "playground", ".supervisor", "dev-https");
const certificatePath = resolve(certificateDir, "certificate.pem");
const privateKeyPath = resolve(certificateDir, "private-key.pem");
const caCertificatePath = resolve(certificateDir, "development-ca.pem");
const caPrivateKeyPath = resolve(certificateDir, "development-ca-private-key.pem");
const metadataPath = resolve(certificateDir, "hosts.json");
const CERTIFICATE_VERSION = 2;

function devHosts() {
  const dns = new Set(["localhost", hostname(), `${hostname()}.local`]);
  const ips = new Set(["127.0.0.1", "::1"]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal) ips.add(entry.address.split("%")[0]);
    }
  }
  return { dns: [...dns].sort(), ips: [...ips].sort() };
}

export async function ensureDevHttpsCertificate() {
  const hosts = devHosts();
  await fs.mkdir(certificateDir, { recursive: true });

  let caCert;
  let caKey;
  try {
    [caCert, caKey] = await Promise.all([
      fs.readFile(caCertificatePath, "utf8"),
      fs.readFile(caPrivateKeyPath, "utf8"),
    ]);
    if (Date.parse(new X509Certificate(caCert).validTo) <= Date.now() + 24 * 60 * 60 * 1000) {
      throw new Error("Development CA is expired");
    }
  } catch {
    const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notAfterDate = new Date(notBeforeDate);
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
    const ca = await selfsigned.generate(
      [{ name: "commonName", value: "Pi Supervisor Development CA" }],
      {
        algorithm: "sha256",
        keySize: 2048,
        notBeforeDate,
        notAfterDate,
        extensions: [
          { name: "basicConstraints", cA: true, critical: true },
          { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
        ],
      },
    );
    caCert = ca.cert;
    caKey = ca.private;
    await Promise.all([
      fs.writeFile(caCertificatePath, caCert, { mode: 0o600 }),
      fs.writeFile(caPrivateKeyPath, caKey, { mode: 0o600 }),
    ]);
  }

  let cert;
  let key;
  try {
    const [storedCert, storedKey, storedMetadata] = await Promise.all([
      fs.readFile(certificatePath, "utf8"),
      fs.readFile(privateKeyPath, "utf8"),
      fs.readFile(metadataPath, "utf8"),
    ]);
    if (
      storedMetadata === JSON.stringify({ version: CERTIFICATE_VERSION, hosts }) &&
      Date.parse(new X509Certificate(storedCert).validTo) > Date.now() + 24 * 60 * 60 * 1000
    ) {
      cert = storedCert;
      key = storedKey;
    }
  } catch {
    // Generate below when the certificate is missing or its network names changed.
  }

  if (!cert || !key) {
    const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notAfterDate = new Date(notBeforeDate);
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 1);
    const pems = await selfsigned.generate([{ name: "commonName", value: hostname() }], {
      algorithm: "sha256",
      keySize: 2048,
      notBeforeDate,
      notAfterDate,
      ca: { key: caKey, cert: caCert },
      extensions: [
        { name: "basicConstraints", cA: false, critical: true },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
        { name: "extKeyUsage", serverAuth: true },
        {
          name: "subjectAltName",
          altNames: [
            ...hosts.dns.map((value) => ({ type: 2, value })),
            ...hosts.ips.map((ip) => ({ type: 7, ip })),
          ],
        },
      ],
    });
    cert = pems.cert;
    key = pems.private;

    await Promise.all([
      fs.writeFile(certificatePath, cert, { mode: 0o600 }),
      fs.writeFile(privateKeyPath, key, { mode: 0o600 }),
      fs.writeFile(metadataPath, JSON.stringify({ version: CERTIFICATE_VERSION, hosts }), {
        mode: 0o600,
      }),
    ]);
  }

  let trusted = process.platform !== "win32";
  if (process.platform === "win32") {
    const rootResult = spawnSync(
      "certutil.exe",
      ["-user", "-f", "-addstore", "Root", caCertificatePath],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    trusted = rootResult.status === 0;
  }

  return {
    cert,
    key,
    certificatePath,
    privateKeyPath,
    caCertificatePath,
    hosts,
    trusted,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const certificate = await ensureDevHttpsCertificate();
  console.log(`Development HTTPS certificate: ${certificate.certificatePath}`);
  if (certificate.trusted) {
    console.log(`Trusted development CA: ${certificate.caCertificatePath}`);
  } else if (process.platform === "win32") {
    const cerPath = resolve(certificateDir, "development-ca.cer");
    await fs.copyFile(certificate.caCertificatePath, cerPath);
    const wizard = spawn("rundll32.exe", ["cryptext.dll,CryptExtAddCER", cerPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    wizard.unref();
    console.warn("Confirm the Windows certificate import wizard once to trust local HTTPS.");
  }
}
