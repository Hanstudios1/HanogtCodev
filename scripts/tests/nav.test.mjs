// Run: node --test scripts/tests/
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./setup.mjs";

const { fitNavItems, NAV_LABELS, PRIMARY_NAV } = await load("lib/nav.ts");

test("the Panel is the first top-bar item and only for signed-in people", () => {
    assert.equal(PRIMARY_NAV[0].href, "/dashboard");
    assert.equal(PRIMARY_NAV[0].auth, true);
    assert.equal(PRIMARY_NAV.filter((item) => item.auth).length, 1);
    assert.equal(NAV_LABELS.more.TR, "Daha fazla");
});

test("the bar shows every item that fits and moves the rest into More", () => {
    const widths = [70, 100, 90, 80, 110, 90, 70, 80, 120];
    const total = widths.reduce((sum, width) => sum + width, 0);
    assert.equal(fitNavItems(widths, total, 90), widths.length, "everything fits: no More button");
    // 810 px of items in 800: More (90) and the first eight (690) take 780.
    assert.equal(fitNavItems(widths, total - 10, 90), 8);
    // 400 px: More (90) and 70 + 100 + 90 = 350.
    assert.equal(fitNavItems(widths, 400, 90), 3);
    // However narrow the bar gets, the first item (the Panel) stays.
    assert.equal(fitNavItems(widths, 50, 90), 1);
    assert.equal(fitNavItems([], 500, 90), 0);
});
