import { isIP } from 'node:net';

/**
 * Is this address safe for the server to connect to? (spec §22.4)
 *
 * The enrichment pipeline fetches company websites from inside our perimeter, in
 * a process holding the service-role key. A hostname that resolves to a private
 * address — or 169.254.169.254, the cloud metadata endpoint that hands out
 * credentials — would turn "research this prospect's company" into a request to
 * our own infrastructure. This decides, for one resolved IP, whether that risk
 * exists.
 *
 * Deliberately a DENY list over the public internet rather than an allow list:
 * every range reserved for private, local, documentation, multicast or
 * translation use is refused, and anything we cannot parse is refused too.
 *
 * PURE. No DNS, no sockets — exhaustively unit-tested.
 */

type Cidr4 = readonly [base: number, bits: number];

/** IPv4 ranges that are never a public web server. */
const BLOCKED_V4: readonly Cidr4[] = [
  [ip4('0.0.0.0'), 8], // "this network", including 0.0.0.0
  [ip4('10.0.0.0'), 8], // private
  [ip4('100.64.0.0'), 10], // carrier-grade NAT
  [ip4('127.0.0.0'), 8], // loopback
  [ip4('169.254.0.0'), 16], // link-local, including the 169.254.169.254 metadata service
  [ip4('172.16.0.0'), 12], // private
  [ip4('192.0.0.0'), 24], // IETF protocol assignments
  [ip4('192.0.2.0'), 24], // TEST-NET-1
  [ip4('192.88.99.0'), 24], // 6to4 relay anycast
  [ip4('192.168.0.0'), 16], // private
  [ip4('198.18.0.0'), 15], // benchmarking
  [ip4('198.51.100.0'), 24], // TEST-NET-2
  [ip4('203.0.113.0'), 24], // TEST-NET-3
  [ip4('224.0.0.0'), 4], // multicast
  [ip4('240.0.0.0'), 4], // reserved, including 255.255.255.255
];

function ip4(address: string): number {
  const parts = address.split('.').map(Number);
  return (((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0) as number;
}

function inCidr4(address: number, [base, bits]: Cidr4): boolean {
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (address & mask) >>> 0 === (base & mask) >>> 0;
}

export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const value = ip4(address);
  return !BLOCKED_V4.some((cidr) => inCidr4(value, cidr));
}

/** Expands an IPv6 address to its eight 16-bit groups, or null if malformed. */
export function parseIPv6(address: string): number[] | null {
  if (isIP(address) !== 6) return null;

  // Strip a zone index ("fe80::1%eth0") — it never makes an address public.
  let text = address.split('%')[0]!.toLowerCase();

  // An embedded dotted IPv4 tail ("::ffff:1.2.3.4") becomes two groups.
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ip4(dotted[1]!);
    text =
      text.slice(0, -dotted[1]!.length) +
      `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const [head, tail] = text.split('::') as [string, string | undefined];
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;

  if (tail === undefined && headGroups.length !== 8) return null;
  if (missing < 0) return null;

  const groups = [
    ...headGroups,
    ...Array<string>(tail === undefined ? 0 : missing).fill('0'),
    ...tailGroups,
  ];
  if (groups.length !== 8) return null;

  const values = groups.map((g) => parseInt(g, 16));
  return values.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffff) ? values : null;
}

function embeddedV4(high: number, low: number): string {
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

export function isPublicIPv6(address: string): boolean {
  const g = parseIPv6(address);
  if (!g) return false;

  const [a, b, c, d, e, f, h7, h8] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const allZeroPrefix = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;

  // :: unspecified and ::1 loopback.
  if (allZeroPrefix && f === 0 && h7 === 0 && (h8 === 0 || h8 === 1)) return false;

  // IPv4-mapped (::ffff:a.b.c.d) and the deprecated IPv4-compatible (::a.b.c.d)
  // forms reach the embedded IPv4 address, so that is what gets judged.
  if (allZeroPrefix && (f === 0xffff || f === 0)) return isPublicIPv4(embeddedV4(h7, h8));

  // NAT64 (64:ff9b::/96) likewise reaches an embedded IPv4 address.
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return isPublicIPv4(embeddedV4(h7, h8));
  }

  // 6to4 (2002::/16) embeds an IPv4 address in the next 32 bits.
  if (a === 0x2002) return isPublicIPv4(embeddedV4(b, c));

  if ((a & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local — includes AWS fd00:ec2::254
  if ((a & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return false; // 2001:db8::/32 documentation
  if (a === 0x2001 && b === 0x0000) return false; // 2001::/32 Teredo — tunnels to arbitrary IPv4
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return false; // 100::/64 discard

  return true;
}

/** The single entry point: true only for an address on the public internet. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address.split('%')[0]!);
  if (version === 4) return isPublicIPv4(address);
  if (version === 6) return isPublicIPv6(address);
  return false;
}
