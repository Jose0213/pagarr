import { describe, expect, it } from "vitest";
import { isCgnatIpAddress, isLocalAddress } from "../ipAddressExtensions.js";

describe("isLocalAddress", () => {
  it("recognizes loopback (IPv4 and IPv6)", () => {
    expect(isLocalAddress("127.0.0.1")).toBe(true);
    expect(isLocalAddress("::1")).toBe(true);
  });

  it("recognizes IPv4-mapped-to-IPv6 loopback", () => {
    expect(isLocalAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("recognizes private IPv4 ranges (Class A/B/C, link-local)", () => {
    expect(isLocalAddress("10.0.0.5")).toBe(true);
    expect(isLocalAddress("172.16.0.1")).toBe(true);
    expect(isLocalAddress("172.31.255.255")).toBe(true);
    expect(isLocalAddress("172.32.0.1")).toBe(false); // just outside 172.16-31
    expect(isLocalAddress("192.168.10.9")).toBe(true);
    expect(isLocalAddress("169.254.1.1")).toBe(true);
  });

  it("rejects public IPv4 addresses", () => {
    expect(isLocalAddress("8.8.8.8")).toBe(false);
    expect(isLocalAddress("1.1.1.1")).toBe(false);
  });

  it("recognizes IPv6 unique-local (fc00::/7) and link-local (fe80::/10)", () => {
    expect(isLocalAddress("fd12:3456:789a::1")).toBe(true);
    expect(isLocalAddress("fe80::1")).toBe(true);
  });

  it("returns false for undefined/null/empty input", () => {
    expect(isLocalAddress(undefined)).toBe(false);
    expect(isLocalAddress(null)).toBe(false);
    expect(isLocalAddress("")).toBe(false);
  });
});

describe("isCgnatIpAddress", () => {
  it("recognizes the 100.64.0.0/10 CGNAT range", () => {
    expect(isCgnatIpAddress("100.64.0.1")).toBe(true);
    expect(isCgnatIpAddress("100.127.255.255")).toBe(true);
  });

  it("rejects addresses outside the CGNAT range", () => {
    expect(isCgnatIpAddress("100.63.255.255")).toBe(false);
    expect(isCgnatIpAddress("100.128.0.0")).toBe(false);
    expect(isCgnatIpAddress("10.0.0.1")).toBe(false);
  });

  it("returns false for non-IPv4 input", () => {
    expect(isCgnatIpAddress("::1")).toBe(false);
    expect(isCgnatIpAddress(undefined)).toBe(false);
  });
});
