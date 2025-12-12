const { detectHybrid } = require("../core/aiRouting");

async function runTest(title, desc, addr, mustHave) {
  const r = await detectHybrid(desc, addr);
  const cc = r.ccList.map(x => x.org);

  for (const org of mustHave) {
    if (!cc.includes(org)) {
      console.error("❌ TEST FAILED:", title);
      console.error("Missing CC:", org);
      console.error("Actual CC:", cc);
      process.exit(1);
    }
  }

  console.log("✅ PASS:", title);
}

(async () => {
  await runTest(
    "BANKING – unauthorized debit",
    "Bank debited my account without authorization",
    "Lagos",
    [
      "Public Complaints Commission",
      "Central Bank of Nigeria (CBN)",
      "Nigeria Deposit Insurance Corporation (NDIC)",
      "Federal Competition and Consumer Protection Commission (FCCPC)",
    ]
  );

  await runTest(
    "POWER – estimated billing",
    "DISCO issued estimated billing repeatedly",
    "Abuja",
    [
      "Public Complaints Commission",
      "Federal Ministry of Power",
      "Federal Competition and Consumer Protection Commission (FCCPC)",
    ]
  );

  await runTest(
    "POLICE – extortion",
    "Police officers extorted money at checkpoint",
    "Enugu",
    [
      "Public Complaints Commission",
      "National Human Rights Commission",
    ]
  );

  await runTest(
    "HOUSING – demolition",
    "Task force demolished my shop without notice",
    "Abuja",
    [
      "Public Complaints Commission",
      "National Human Rights Commission",
    ]
  );

  console.log("\n🎉 ALL ENFORCEMENT TESTS PASSED");
})();
