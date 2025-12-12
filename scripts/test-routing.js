const { detectHybrid } = require("../core/aiRouting");

const tests = [
  {
    name: "POLICE – extortion (state routing)",
    desc: "Police extorted money from me at a checkpoint",
    addr: "Uyo, Akwa Ibom",
    expect: {
      sector: "police",
      mustHave: ["Public Complaints Commission", "National Human Rights Commission"],
    },
  },

  {
    name: "POWER – DISCO overbilling",
    desc: "PHED is overbilling me with estimated billing",
    addr: "Port Harcourt",
    expect: {
      sector: "power",
      mustHave: [
        "Public Complaints Commission",
        "Federal Competition and Consumer Protection Commission",
      ],
    },
  },

  {
    name: "BANKING – unauthorized debit",
    desc: "Facebook charged my card without consent",
    addr: "Lagos, Nigeria",
    expect: {
      sector: "banking",
      mustHave: [
        "Public Complaints Commission",
        "Central Bank of Nigeria",
        "Nigeria Deposit Insurance Corporation",
      ],
    },
  },

  {
    name: "HOUSING – demolition",
    desc: "Task force demolished my shop without notice",
    addr: "Abuja",
    expect: {
      sector: "housing",
      mustHave: ["Public Complaints Commission"],
    },
  },
];

(async () => {
  let failed = 0;

  for (const t of tests) {
    try {
      const r = await detectHybrid(t.desc, t.addr);

      console.log("\n==============================");
      console.log("TEST:", t.name);
      console.log("SECTOR:", r.sector);
      console.log("PRIMARY:", r.primary?.org);
      console.log("THROUGH:", r.through?.org);
      console.log("CC:", r.ccList.map(x => x.org));

      // hard assertions
      if (r.sector !== t.expect.sector) {
        throw new Error(`Sector mismatch (expected ${t.expect.sector})`);
      }

      for (const must of t.expect.mustHave) {
        if (!r.ccList.some(x => x.org.includes(must))) {
          throw new Error(`Missing mandatory CC: ${must}`);
        }
      }

      console.log("✅ PASS:", t.name);
    } catch (e) {
      failed++;
      console.error("❌ FAIL:", t.name);
      console.error("   ", e.message);
    }
  }

  console.log("\n==============================");
  if (failed === 0) {
    console.log("🎉 ALL REGRESSION TESTS PASSED");
  } else {
    console.error(`❌ ${failed} TEST(S) FAILED`);
    process.exit(1);
  }
})();
