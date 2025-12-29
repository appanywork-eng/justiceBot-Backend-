export async function generatePetition(text) {
  try {
    const sectorMap = {
      aviation: "aviation",
      police: "security",
      bank: "banking",
      school: "education",
      hospital: "health",
      hospital: "health",
      network: "telecoms",
      airtime: "telecoms",
      court: "judiciary"
    };

    let detected = "international_escalation";
    for (const key in sectorMap) {
      if (text.toLowerCase().includes(key)) {
        detected = sectorMap[key];
        break;
      }
    }

    return {
      sector: detected,
      template: \`public/templates/\${detected}.txt\`,
      complaint: text
    };
  } catch (err) {
    return { error: "Error generating petition" };
  }
}
