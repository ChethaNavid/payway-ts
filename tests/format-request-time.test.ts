import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { formatRequestTime } from "../src/index.js";

/**
 * `formatRequestTime` replaced date-fns' `format(d, "yyyyMMddHHmmss")` so the
 * package ships with zero runtime dependencies. date-fns is kept as a
 * devDependency purely so these tests can prove the two agree.
 */
describe("formatRequestTime", () => {
  const cases: Array<[string, Date]> = [
    ["start of year", new Date(2024, 0, 1, 0, 0, 0)],
    ["end of year", new Date(2024, 11, 31, 23, 59, 59)],
    ["leap day, single-digit fields", new Date(2024, 1, 29, 9, 5, 3)],
    ["midday", new Date(2025, 6, 4, 12, 0, 0)],
    ["from an ISO instant", new Date("2024-03-10T07:30:00Z")],
    ["DST transition instant", new Date(2024, 9, 6, 1, 30, 0)],
    ["three-digit year", new Date(999, 0, 1, 0, 0, 0)],
    ["single-digit month and day", new Date(2024, 2, 5, 8, 7, 6)],
  ];

  for (const [name, date] of cases) {
    it(`matches date-fns for ${name}`, () => {
      expect(formatRequestTime(date)).toBe(format(date, "yyyyMMddHHmmss"));
    });
  }

  it("matches date-fns for the current time", () => {
    const now = new Date();
    expect(formatRequestTime(now)).toBe(format(now, "yyyyMMddHHmmss"));
  });

  it("always returns 14 characters", () => {
    for (const [, date] of cases) {
      expect(formatRequestTime(date)).toHaveLength(14);
    }
  });

  it("returns digits only", () => {
    expect(formatRequestTime(new Date(2024, 1, 29, 9, 5, 3))).toMatch(/^\d{14}$/);
  });

  it("zero-pads single-digit components", () => {
    expect(formatRequestTime(new Date(2024, 2, 5, 8, 7, 6))).toBe("20240305080706");
  });

  it("uses local time, not UTC", () => {
    // Documented behaviour: PayWay's spec says UTC but this SDK has always sent
    // local time. Locking it in so a timezone change is a deliberate decision.
    const date = new Date(2024, 5, 15, 14, 30, 0);
    expect(formatRequestTime(date)).toBe("20240615143000");
    expect(formatRequestTime(date)).toBe(format(date, "yyyyMMddHHmmss"));
  });
});
