import { describe, expect, it } from 'vitest';
import { isPublicAddress, parseIPv6 } from '@/lib/http/ip';

describe('isPublicAddress — refused (§22.4)', () => {
  it.each([
    ['169.254.169.254', 'cloud metadata service — hands out credentials'],
    ['169.254.0.1', 'link-local'],
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback, end of range'],
    ['0.0.0.0', 'unspecified'],
    ['10.0.0.1', 'private 10/8'],
    ['172.16.0.1', 'private 172.16/12, start'],
    ['172.31.255.255', 'private 172.16/12, end'],
    ['192.168.1.1', 'private 192.168/16'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['192.0.2.10', 'documentation'],
    ['198.18.0.1', 'benchmarking'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local'],
    ['fe80::1%eth0', 'IPv6 link-local with a zone'],
    ['fc00::1', 'IPv6 unique local'],
    ['fd00:ec2::254', 'AWS IPv6 metadata endpoint'],
    ['ff02::1', 'IPv6 multicast'],
    ['2001:db8::1', 'IPv6 documentation'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', 'Teredo tunnel'],
  ])('%s (%s)', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata service'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex form'],
    ['::ffff:a9fe:a9fe', 'IPv4-mapped metadata service, hex form'],
    ['::127.0.0.1', 'IPv4-compatible loopback'],
    ['64:ff9b::a9fe:a9fe', 'NAT64 to the metadata service'],
    ['2002:a9fe:a9fe::1', '6to4 wrapping the metadata service'],
    ['2002:0a00:0001::1', '6to4 wrapping 10.0.0.1'],
  ])('%s (%s) — the disguised forms', (address) => {
    // An attacker who controls DNS for a "company website" will reach for these
    // first: the same internal address, spelled so a naive check misses it.
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['', 'localhost', 'example.com', '1.2.3', '256.1.1.1', '1.2.3.4.5', 'gg::1', ':::1'])(
    'refuses %j — not an IP address at all',
    (input) => {
      expect(isPublicAddress(input)).toBe(false);
    },
  );
});

describe('isPublicAddress — allowed', () => {
  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '172.15.255.255', // just below 172.16/12
    '172.32.0.1', // just above 172.16/12
    '100.63.255.255', // just below carrier-grade NAT
    '169.253.255.255', // just below link-local
    '2606:4700:4700::1111',
    '2a00:1450:4009:81f::200e',
    '::ffff:8.8.8.8', // IPv4-mapped PUBLIC address
    '2002:0808:0808::1', // 6to4 wrapping a public address
  ])('%s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

describe('parseIPv6', () => {
  it('expands every compressed form to eight groups', () => {
    expect(parseIPv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('fe80::')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseIPv6('2001:db8::1:2')).toEqual([0x2001, 0xdb8, 0, 0, 0, 0, 1, 2]);
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
  });

  it('returns null for anything malformed', () => {
    expect(parseIPv6('1.2.3.4')).toBeNull();
    expect(parseIPv6('1::2::3')).toBeNull();
    expect(parseIPv6('not an address')).toBeNull();
  });
});
