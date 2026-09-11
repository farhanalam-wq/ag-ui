import dns from "node:dns/promises";
import net from "node:net";

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

/**
 * Checks if an IPv4 address is in a private, reserved, or loopback range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid format considered unsafe
  }

  // 0.0.0.0/8
  if (parts[0] === 0) return true;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;

  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;

  // 169.254.0.0/16 (Link-local & cloud metadata 169.254.169.254)
  if (parts[0] === 169 && parts[1] === 254) return true;

  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;

  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, or unique local range.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  return false;
}

/**
 * Validates a URL against SSRF vulnerabilities by parsing and checking resolved IPs.
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new SSRFError(`Invalid URL format: ${rawUrl}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SSRFError(`Unsupported protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Immediate block for obvious localhost or internal names
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SSRFError(`Access to internal host '${hostname}' is prohibited.`);
  }

  // Check if hostname is an explicit IP
  const ipType = net.isIP(hostname);
  if (ipType === 4 && isPrivateIPv4(hostname)) {
    throw new SSRFError(`Access to private IPv4 address '${hostname}' is prohibited.`);
  }
  if (ipType === 6 && isPrivateIPv6(hostname)) {
    throw new SSRFError(`Access to private IPv6 address '${hostname}' is prohibited.`);
  }

  // Resolve DNS to verify the resolved address is not in private range
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const record of addresses) {
      if (record.family === 4 && isPrivateIPv4(record.address)) {
        throw new SSRFError(`Hostname '${hostname}' resolved to private IP: ${record.address}`);
      }
      if (record.family === 6 && isPrivateIPv6(record.address)) {
        throw new SSRFError(`Hostname '${hostname}' resolved to private IPv6: ${record.address}`);
      }
    }
  } catch (err: any) {
    if (err instanceof SSRFError) throw err;
    throw new SSRFError(`DNS lookup failed for '${hostname}': ${err.message}`);
  }

  return parsedUrl;
}
