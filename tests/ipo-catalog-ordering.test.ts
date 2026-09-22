import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getPublishedIPOs, getIPOUniverseCounts } from "../features/ipo/services/ipoService";
import { getTodayIST } from "../features/ipo/services/ipoLifecycle";

describe("IPO Catalog Ordering and Lifecycle Filtering Tests", { concurrency: 1 }, () => {
  const todayIST = getTodayIST();

  test("1. Default catalog orders OPEN IPOs before UPCOMING IPOs", async () => {
    const { ipos } = await getPublishedIPOs({ pageSize: 50 });
    assert.ok(ipos.length > 0, "Expected published IPOs");

    let seenUpcoming = false;
    for (const ipo of ipos) {
      if (ipo.status === "upcoming") {
        seenUpcoming = true;
      }
      if (seenUpcoming) {
        // Once upcoming has started, we should NEVER see an open IPO
        assert.notEqual(
          ipo.status,
          "open",
          `OPEN IPO ${ipo.company_name} appeared after UPCOMING IPOs in default catalog`
        );
      }
    }
  });

  test("2. Default catalog orders OPEN IPOs by earliest closing first (close_date ASC)", async () => {
    const { ipos } = await getPublishedIPOs({ pageSize: 50 });
    const openIpos = ipos.filter((i) => i.status === "open");

    if (openIpos.length > 1) {
      for (let i = 0; i < openIpos.length - 1; i++) {
        const currClose = openIpos[i].close_date || "9999-12-31";
        const nextClose = openIpos[i + 1].close_date || "9999-12-31";
        assert.ok(
          currClose <= nextClose,
          `Expected close_date ASC for OPEN IPOs: ${openIpos[i].company_name} (${currClose}) vs ${openIpos[i + 1].company_name} (${nextClose})`
        );
      }
    }
  });

  test("3. Default catalog orders UPCOMING IPOs by nearest opening first (open_date ASC)", async () => {
    const { ipos } = await getPublishedIPOs({ pageSize: 50 });
    const upcomingIpos = ipos.filter((i) => i.status === "upcoming");

    if (upcomingIpos.length > 1) {
      for (let i = 0; i < upcomingIpos.length - 1; i++) {
        const currOpen = upcomingIpos[i].open_date || "9999-12-31";
        const nextOpen = upcomingIpos[i + 1].open_date || "9999-12-31";
        assert.ok(
          currOpen <= nextOpen,
          `Expected open_date ASC for UPCOMING IPOs: ${upcomingIpos[i].company_name} (${currOpen}) vs ${upcomingIpos[i + 1].company_name} (${nextOpen})`
        );
      }
    }
  });

  test("4. Current tab contains ONLY actively open IPOs (open_date <= todayIST && close_date >= todayIST)", async () => {
    const { ipos: currentIpos } = await getPublishedIPOs({ status: "current", pageSize: 50 });

    for (const ipo of currentIpos) {
      assert.equal(
        ipo.status,
        "open",
        `Current tab contained non-open IPO: ${ipo.company_name} with status ${ipo.status}`
      );
      assert.ok(
        ipo.open_date && ipo.open_date <= todayIST,
        `Expected open_date <= ${todayIST}, got ${ipo.open_date}`
      );
      assert.ok(
        ipo.close_date && ipo.close_date >= todayIST,
        `Expected close_date >= ${todayIST}, got ${ipo.close_date}`
      );
    }
  });

  test("5. Upcoming tab contains ONLY upcoming IPOs (open_date > todayIST) sorted open_date ASC", async () => {
    const { ipos: upcomingIpos } = await getPublishedIPOs({ status: "upcoming", pageSize: 50 });

    for (let i = 0; i < upcomingIpos.length; i++) {
      const ipo = upcomingIpos[i];
      assert.equal(
        ipo.status,
        "upcoming",
        `Upcoming tab contained non-upcoming IPO: ${ipo.company_name} with status ${ipo.status}`
      );
      assert.ok(
        ipo.open_date && ipo.open_date > todayIST,
        `Expected open_date > ${todayIST}, got ${ipo.open_date}`
      );

      if (i < upcomingIpos.length - 1) {
        const next = upcomingIpos[i + 1];
        assert.ok(
          (ipo.open_date || "") <= (next.open_date || ""),
          `Upcoming tab must sort open_date ASC: ${ipo.open_date} vs ${next.open_date}`
        );
      }
    }
  });

  test("6. Past tab contains ONLY listed IPOs sorted listing_date DESC", async () => {
    const { ipos: pastIpos } = await getPublishedIPOs({ status: "past", pageSize: 50 });

    for (let i = 0; i < pastIpos.length; i++) {
      const ipo = pastIpos[i];
      assert.equal(
        ipo.status,
        "listed",
        `Past tab contained non-listed IPO: ${ipo.company_name} with status ${ipo.status}`
      );

      if (i < pastIpos.length - 1) {
        const next = pastIpos[i + 1];
        const currListing = ipo.listing_date || "";
        const nextListing = next.listing_date || "";
        assert.ok(
          currListing >= nextListing,
          `Past tab must sort listing_date DESC: ${currListing} vs ${nextListing}`
        );
      }
    }
  });

  test("7. Deterministic catalog tie-breaking across repeated requests", async () => {
    const run1 = await getPublishedIPOs({ pageSize: 30 });
    const run2 = await getPublishedIPOs({ pageSize: 30 });

    assert.equal(run1.ipos.length, run2.ipos.length);
    for (let i = 0; i < run1.ipos.length; i++) {
      assert.equal(
        run1.ipos[i].id,
        run2.ipos[i].id,
        `Mismatch at index ${i}: ${run1.ipos[i].company_name} vs ${run2.ipos[i].company_name}`
      );
    }
  });

  test("8. Mathematical Invariant: Page-by-page queries match unpaginated query 1:1 with zero duplicates", async () => {
    const pageSize = 5;
    const { ipos: baseline, totalCount } = await getPublishedIPOs({ pageSize: 50 });
    const baselineSlice = baseline.slice(0, 25); // Test across 5 pages
    const baselineIds = baselineSlice.map((i) => i.id);

    const paginatedIds: string[] = [];
    const numPages = Math.ceil(baselineSlice.length / pageSize);

    for (let p = 1; p <= numPages; p++) {
      const { ipos: pageIpos, totalCount: pageTotal } = await getPublishedIPOs({
        page: p,
        pageSize,
      });
      assert.equal(pageTotal, totalCount, "totalCount invariant failed across pages");
      for (const item of pageIpos) {
        paginatedIds.push(item.id);
      }
    }

    // Assert exact 1:1 match
    assert.deepEqual(
      paginatedIds,
      baselineIds,
      "Paginated IDs must match baseline IDs in exact sequential order"
    );

    // Assert zero duplicate IDs across pages
    const uniquePaginatedIds = new Set(paginatedIds);
    assert.equal(
      uniquePaginatedIds.size,
      paginatedIds.length,
      "Zero duplicates invariant violated across pages"
    );
  });

  test("9. getIPOUniverseCounts correctly counts active open issues as current", async () => {
    const counts = await getIPOUniverseCounts();
    const { totalCount: actualCurrentCount } = await getPublishedIPOs({ status: "current" });

    assert.equal(
      counts.current,
      actualCurrentCount,
      `Universe count for current (${counts.current}) must match actual active open IPOs count (${actualCurrentCount})`
    );
  });
});
