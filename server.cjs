/**
 * PetitionDesk Backend (PDPS-2.5 PRO)
 * Stable – Secure – Production Ready
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

//
// IMPORT CORRECT FUNCTIONS
//
const {
    generatePetition, 
    detectSector,
    getInstitutionsForSector
} = require("./core/aiRouting");

const {
    applyWatchdogs,
    applySectorSupervisors
} = require("./core/watchdogs");

const {
    detectSector: detectSectorLegacy,
    refinePoliceInstitutions
} = require("./core/police");

const { buildPetition } = require("./core/petitions");

const {
    startFlutterwavePayment,
    verifyFlutterwavePayment,
    isVerified
} = require("./core/payments");

const { isOpenAIReady } = require("./core/openaiClient");


//
// EXPRESS SETUP
//
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());


// ========================================================
// BASIC ROUTES
// ========================================================
app.get("/", (req, res) => {
    res.send("PetitionDesk PDPS-2.5 PRO Backend is running.");
});

app.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});


// ========================================================
// GENERATE PETITION (MAIN ENDPOINT)
// ========================================================
app.post("/generate-petition", async (req, res) => {
    console.log("Incoming:", req.body);

    const description = req.body.description || "";

    if (!description.trim()) {
        return res.status(200).json({
            ok: false,
            error: "Please describe your complaint.",
            petitionId: null,
            verified: false,
        });
    }

    const complainant = {
        fullName: req.body.fullName || "",
        email: req.body.email || "",
        phone: req.body.phone || "",
        address: req.body.address || "",
        description
    };

    try {
        //
        // 1. DETECT SECTOR USING AI ROUTING
        //
        const sector = detectSector(description);

        //
        // 2. GET BASE ROUTES FOR THE SECTOR
        //
        let inst = {
            primary: null,
            through: null,
            ccList: []
        };

        const institutions = getInstitutionsForSector(sector, complainant.address);
        if (institutions.length > 0) {
            inst.primary = institutions[0];
            inst.through = institutions[1] || null;
            inst.ccList = institutions.slice(2);
        }

        //
        // 3. APPLY WATCHDOGS & SUPERVISORS
        //
        inst = applyWatchdogs(description, inst);
        inst = applySectorSupervisors(description, inst);

        //
        // 4. SPECIAL RULES FOR POLICE SECTOR
        //
        if (sector === "police") {
            inst = refinePoliceInstitutions(description, inst);
        }

        //
        // 5. FILTER CC LIST
        //
        inst.ccList = inst.ccList.filter(c => c?.org?.trim());

        //
        // 6. GENERATE PETITION TEXT VIA OPENAI
        //
        const aiResult = await generatePetition(
            complainant.fullName,
            complainant.email,
            complainant.phone,
            complainant.address,
            description
        );

        const petitionText = aiResult.petition;

        //
        // 7. BUILD PETITION ID
        //
        const petitionId = "PD-" + Date.now() + "-" + Math.floor(Math.random() * 9999);

        //
        // 8. SEND RESPONSE
        //
        return res.status(200).json({
            ok: true,
            petitionText,
            primaryInstitution: inst.primary,
            throughInstitution: inst.through,
            ccList: inst.ccList,
            petitionId,
            verified: false,
        });

    } catch (err) {
        console.error("Error generating petition:", err);
        return res.status(500).json({
            ok: false,
            error: "Internal error.",
            verified: false,
        });
    }
});


// ========================================================
// PAYMENT – requires petitionId
// ========================================================
app.post("/pay", async (req, res) => {
    try {
        const { amount, fullName, email, petitionId } = req.body;

        if (!petitionId) {
            return res.status(400).json({
                ok: false,
                error: "Missing petitionId.",
            });
        }

        if (!amount || amount < 1000) {
            return res.status(400).json({
                ok: false,
                error: "Minimum petition fee is ₦1000.",
            });
        }

        const redirectUrl = `${process.env.FLW_REDIRECT_URL}?petitionId=${petitionId}`;

        const result = await startFlutterwavePayment({
            amount,
            currency: "NGN",
            fullName,
            email,
            description: "PetitionDesk – Petition Payment",
            redirect_url: redirectUrl,
        });

        if (!result.ok) {
            return res.status(500).json({ ok: false, error: result.error });
        }

        return res.json({
            ok: true,
            paymentLink: result.paymentLink,
            txRef: result.txRef,
            petitionId,
        });

    } catch (err) {
        console.error("Payment error:", err);
        return res.status(500).json({ ok: false, error: "Payment failed." });
    }
});


// ========================================================
// VERIFY PAYMENT
// ========================================================
app.get("/verify-payment", async (req, res) => {
    const txRef = req.query.txRef;
    if (!txRef) return res.status(400).json({ verified: false });

    try {
        if (isVerified(txRef)) return res.json({ verified: true });

        const v = await verifyFlutterwavePayment(txRef);
        return res.json({ verified: v.verified || false });

    } catch (err) {
        return res.status(500).json({ verified: false });
    }
});


// ========================================================
// START SERVER
// ========================================================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`PDPS-2.5 PRO Backend running on port ${PORT}`);
});
