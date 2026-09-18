// client/src/app/dashboard/page.js
"use client";
import { useEffect, useState } from 'react';
import FHIR from 'fhirclient';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';

// ============================================================
// TASK 2: Verify Diagnosis and Surgery (CPT vs SNOMED CT)
// ============================================================
// NOTE: This is a small, illustrative CPT <-> SNOMED crosswalk for demo
// purposes only, keyed by actual code values (not display text). A
// production system would call a licensed terminology/crosswalk service
// (e.g. a UMLS-backed CPT-SNOMED crosswalk) instead of a hardcoded table,
// and these example SNOMED codes should be re-verified against a live
// terminology server (e.g. the SNOMED CT Browser) before real use.
const CPT_SNOMED_CROSSWALK = [
    { cptCode: "47562", cptLabel: "Laparoscopic Cholecystectomy", expectedSnomedCodes: ["235919008"] }, // Cholelithiasis
    { cptCode: "44970", cptLabel: "Laparoscopic Appendectomy", expectedSnomedCodes: ["74400008"] }, // Acute appendicitis
    { cptCode: "27447", cptLabel: "Total Knee Arthroplasty", expectedSnomedCodes: ["239873007"] }, // Osteoarthritis of knee
    { cptCode: "33533", cptLabel: "Coronary Artery Bypass Graft", expectedSnomedCodes: ["53741008"] }, // Coronary arteriosclerosis
    { cptCode: "19303", cptLabel: "Mastectomy", expectedSnomedCodes: ["254837009"] }, // Malignant neoplasm of breast
    { cptCode: "43775", cptLabel: "Laparoscopic Sleeve Gastrectomy", expectedSnomedCodes: ["414915002", "238136002"] }, // Obesity / morbid obesity
    { cptCode: "63030", cptLabel: "Lumbar Discectomy", expectedSnomedCodes: ["202968009"] }, // Displacement of lumbar intervertebral disc
    { cptCode: "66984", cptLabel: "Cataract Surgery", expectedSnomedCodes: ["193570009"] }, // Age-related cataract
];

// Compares the scheduled procedure's CPT code against the patient's diagnosis
// SNOMED CT code (not display text) and returns a verification status:
// match | mismatch | unmapped | insufficient-data
function verifyProcedureAgainstDiagnosis(procedureCode, diagnosisCode) {
    if (!procedureCode || !diagnosisCode) {
        return { status: "insufficient-data", crosswalkEntry: null };
    }

    const crosswalkEntry = CPT_SNOMED_CROSSWALK.find(row => row.cptCode === procedureCode);

    if (!crosswalkEntry) {
        return { status: "unmapped", crosswalkEntry: null };
    }

    const diagnosisMatches = crosswalkEntry.expectedSnomedCodes.includes(diagnosisCode);
    return { status: diagnosisMatches ? "match" : "mismatch", crosswalkEntry };
}

// Extracts a code from a CodeableConcept ONLY if it's coded under one of the
// expected terminology systems (e.g. SNOMED CT, CPT). Unlike a naive
// "take coding[0]" fallback, this never silently mislabels a code from a
// different system (e.g. showing a SNOMED code as if it were CPT) --
// if no coding matches the expected system, `code` comes back null and the
// UI shows that explicitly instead of a misleading value.
function getCodedValue(codeableConcept, systemUrlHints) {
    if (!codeableConcept) return { code: null, text: "", matchedSystem: null };
    const text = codeableConcept.text || codeableConcept.coding?.[0]?.display || "";
    const coding = codeableConcept.coding?.find(c =>
        systemUrlHints.some(hint => c.system?.toLowerCase().includes(hint))
    );
    return {
        code: coding?.code || null,
        text,
        matchedSystem: coding?.system || null,
    };
}

const SNOMED_SYSTEM_HINTS = ["snomed.info/sct", "snomed"];
const CPT_SYSTEM_HINTS = ["ama-assn.org/go/cpt", "cpt"];


// ============================================================
// TASK 4: Standardized Document Export (USCDI via FHIR Document Bundle)
// ============================================================
// Packages the verified pre-op checklist into a FHIR "document" Bundle
// containing a Composition (the clinical note) plus the underlying
// resources for each required USCDI data class used by this app:
// Patient, AllergyIntolerance, Laboratory (Observation), Problems (Condition),
// Procedures. Ref: HealthIT.gov USCDI data classes.
function buildUscdiDocument({ patient, allergies, labs, conditions, procedures, verifiedBy, safetyStatus }) {
    const now = new Date().toISOString();
    const compositionId = `pre-op-summary-${patient.id}-${Date.now()}`;

    const composition = {
        resourceType: "Composition",
        id: compositionId,
        status: "final",
        type: {
            coding: [{ system: "http://loinc.org", code: "11504-8", display: "Surgical operation note" }],
        },
        subject: { reference: `Patient/${patient.id}` },
        date: now,
        author: [{ display: verifiedBy || "Unverified Provider" }],
        title: "Pre-Surgical Safety Gate Summary",
        section: [
            {
                title: "Allergies and Intolerances",
                code: { coding: [{ system: "http://loinc.org", code: "48765-2" }] },
                entry: allergies.map(a => ({ reference: `AllergyIntolerance/${a.resource.id}` })),
            },
            {
                title: "Laboratory Results",
                code: { coding: [{ system: "http://loinc.org", code: "30954-2" }] },
                entry: labs.map(l => ({ reference: `Observation/${l.resource.id}` })),
            },
            {
                title: "Problems / Conditions",
                code: { coding: [{ system: "http://loinc.org", code: "11450-4" }] },
                entry: conditions.map(c => ({ reference: `Condition/${c.resource.id}` })),
            },
            {
                title: "Procedures",
                code: { coding: [{ system: "http://loinc.org", code: "47519-4" }] },
                entry: procedures.map(p => ({ reference: `Procedure/${p.resource.id}` })),
            },
            {
                title: "Safety Gate Result",
                code: { coding: [{ system: "http://loinc.org", code: "72133-2", display: "Assessment note" }] },
                text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${safetyStatus}</div>` },
            },
        ],
    };

    return {
        resourceType: "Bundle",
        type: "document",
        identifier: { system: "urn:dna-health:pre-op-summary", value: compositionId },
        timestamp: now,
        entry: [
            { resource: composition },
            { resource: patient },
            ...allergies.map(a => ({ resource: a.resource })),
            ...labs.map(l => ({ resource: l.resource })),
            ...conditions.map(c => ({ resource: c.resource })),
            ...procedures.map(p => ({ resource: p.resource })),
        ],
    };
}

export default function Dashboard() {
    const [patient, setPatient] = useState(null);
    const [allergies, setAllergies] = useState([]);
    const [labs, setLabs] = useState([]);
    const [conditions, setConditions] = useState([]); // Task 2: diagnosis (SNOMED)
    const [procedures, setProcedures] = useState([]); // Task 2: scheduled surgery (CPT)
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(false); // নতুন স্টেট যোগ করুন
    const [uscdiExported, setUscdiExported] = useState(false); // Task 4: tracks whether the USCDI doc was actually downloaded
    const router = useRouter();

    useEffect(() => {
        FHIR.oauth2.ready()
            .then(async (client) => {
                // চেক করুন ক্লায়েন্ট বা পেশেন্ট আইডি আছে কি না
                if (!client || !client.patient || !client.patient.id) {
                    console.warn("Patient context lost.");
                    setAuthError(true); // রিডাইরেক্ট না করে এরর স্টেট সেট করুন
                    setLoading(false);
                    return;
                }

                // ১. পেশেন্ট ডাটা আনা
                const patientData = await client.patient.read();
                setPatient(patientData);

                // ২. অ্যালার্জি ডাটা আনা
                const allergyData = await client.request(`AllergyIntolerance?patient=${client.patient.id}`);
                setAllergies(allergyData.entry || []);

                // ৩. ল্যাব রিপোর্ট আনা (Platelet Count LOINC: 777-3)
                const labData = await client.request(`Observation?patient=${client.patient.id}&code=777-3`);
                setLabs(labData.entry || []);

                // ৪. [Task 2] ডায়াগনসিস (Condition, SNOMED CT) আনা
                try {
                    const conditionData = await client.request(`Condition?patient=${client.patient.id}`);
                    setConditions(conditionData.entry || []);
                } catch (e) {
                    console.warn("Condition fetch failed (sandbox may not have data for this patient):", e);
                    setConditions([]);
                }

                // ৫. [Task 2] শিডিউলড সার্জারি (Procedure, CPT) আনা
                try {
                    const procedureData = await client.request(`Procedure?patient=${client.patient.id}`);
                    setProcedures(procedureData.entry || []);
                } catch (e) {
                    console.warn("Procedure fetch failed (sandbox may not have data for this patient):", e);
                    setProcedures([]);
                }

                setLoading(false);
            })
            .catch(err => {
                console.error("FHIR Auth Error:", err);
                setAuthError(true); // রিডাইরেক্ট না করে এরর স্টেট সেট করুন
                setLoading(false);
            });
    }, []); // Router ডিপেন্ডেন্সি রিমুভ করুন

    // লোডিং স্টেট
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-blue-600 font-semibold">Loading Patient Data...</p>
                </div>
            </div>
        );
    }

    // অথরাইজেশন এরর হলে এই স্ক্রিন দেখাবে (লুপ বন্ধ করবে)
    if (authError || !patient) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="text-center bg-white p-8 rounded-xl shadow-lg">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Session Expired</h2>
                    <p className="text-slate-600 mb-6">Your FHIR session has expired or is invalid.</p>
                    <button
                        onClick={() => window.location.href = '/launch'}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700"
                    >
                        Relaunch App
                    </button>
                    <button
                        onClick={() => window.open('https://launch.smarthealthit.org/', '_blank')}
                        className="ml-4 bg-slate-200 text-slate-700 px-6 py-3 rounded-lg font-bold hover:bg-slate-300"
                    >
                        Open SMART Launcher
                    </button>
                </div>
            </div>
        );
    }

    // ... (বাকি কোড এবং JSX একই থাকবে)

    // [Task 2] প্রথম Condition ও Procedure রিসোর্স থেকে ডায়াগনসিস/প্রসিডিউর বের করা
    const primaryCondition = conditions[0]?.resource;
    const primaryProcedure = procedures[0]?.resource;
    const diagnosisInfo = getCodedValue(primaryCondition?.code, SNOMED_SYSTEM_HINTS);
    const procedureInfo = getCodedValue(primaryProcedure?.code, CPT_SYSTEM_HINTS);
    const procedureVerification = verifyProcedureAgainstDiagnosis(procedureInfo.code, diagnosisInfo.code);

    // [Task 4] USCDI ডকুমেন্ট এক্সপোর্ট করা (JSON ফাইল ডাউনলোড)
    const handleExportUscdiDocument = () => {
        const plateletVal = labs[0]?.resource?.valueQuantity?.value;
        const safetyStatus = (plateletVal > 150 && allergies.length === 0) ? "Safe for Surgery" : "Requires Review";

        const uscdiDoc = buildUscdiDocument({
            patient,
            allergies,
            labs,
            conditions,
            procedures,
            verifiedBy: "Dr. Albertine Orn", // TODO: replace with real fhirUser once SMART identity claim is wired in
            safetyStatus,
        });

        const blob = new Blob([JSON.stringify(uscdiDoc, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pre-op-summary-${patient.id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setUscdiExported(true); // mark as exported so the audit payload reflects reality

        Swal.fire({
            icon: "success",
            title: "USCDI Document Exported",
            html: `A FHIR Document Bundle (Composition) with the required USCDI data classes<br/>(demographics, allergies, labs, problems, procedures) has been downloaded.`,
            confirmButtonColor: "#2563eb",
        });
    };

    const handleVerify = async () => {
        // 1. Fancy prompt or confirmation (optional but looks professional)
        const confirm = await Swal.fire({
            title: 'Final Safety Review',
            text: "Are you sure you want to clear this patient for surgery?",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#2563eb', // Blue-600
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Yes, Proceed'
        });

        if (!confirm.isConfirmed) return;

        // 2. Showing the loading state
        Swal.fire({
            title: 'Saving Audit Trail...',
            html: 'Synchronizing with Hospital Records',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const auditData = {
            patientId: patient.id,
            patientName: `${patient.name[0].given.join(' ')} ${patient.name[0].family}`,
            plateletCount: labs[0]?.resource?.valueQuantity?.value || 0,
            isPlateletSafe: labs[0]?.resource?.valueQuantity?.value > 150,
            hasAllergies: allergies.length > 0,
            allergyList: allergies.map(a => a.resource.code.text || "Unknown"),
            // [Task 2] CPT vs SNOMED procedure/diagnosis verification result
            procedureVerification: {
                status: procedureVerification.status,
                diagnosisText: diagnosisInfo.text,
                diagnosisCode: diagnosisInfo.code,
                procedureText: procedureInfo.text,
                procedureCode: procedureInfo.code,
            },
            // [Task 4] whether a USCDI document had already been exported this session
            uscdiDocumentExported: uscdiExported
        };

        try {
            const response = await fetch('http://localhost:5001/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(auditData),
            });

            const result = await response.json();

            if (result.success) {
                // 3. Fancy Success Message
                Swal.fire({
                    icon: 'success',
                    title: 'Patient Cleared for Surgery!',
                    html: `
          <div class="text-left mt-4 p-3 bg-slate-50 rounded border text-sm">
            <p><strong>Log ID:</strong> <span class="text-blue-600">${result.logId}</span></p>
            <p class="mt-2 text-green-700 font-bold">✓ Compliance Check Passed</p>
            <p class="text-slate-500 italic mt-1 text-xs">Data has been synced with Audit Trail (MongoDB).</p>
          </div>
        `,
                    confirmButtonColor: '#2563eb',
                    timer: 5000
                });
            } else {
                Swal.fire('Error', 'Failed to save audit log.', 'error');
            }
        } catch (error) {
            Swal.fire('Connection Error', 'Backend server is not responding.', 'error');
        }
    };

    const handleRelaunch = () => {
    if (window.confirm("Are you sure you want to select a new patient? Current session will be reset.")) {
        // শুধু FHIR টোকেন ক্লিয়ার করুন
        window.localStorage.removeItem('fhirjs');
        window.sessionStorage.removeItem('fhirjs');
        
        // পুরো পেজ রিলোড দিন (এটি Next.js রাউটারের চেয়ে বেশি কার্যকর)
        window.location.href = '/launch';
    }
};

    return (
        <div className="p-8 max-w-5xl mx-auto bg-slate-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-8 text-blue-900 border-b pb-4">
                Pre-Surgical Safety Gate
            </h1>

            <button
                onClick={handleRelaunch}
                className="mt-6 text-sm text-red-600 hover:text-red-800 underline"
            >
                Logout / Select New Patient
            </button>

            {/* Patient Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm mb-6 border border-slate-200">
                <h2 className="text-lg font-bold text-slate-500 uppercase tracking-wider mb-4">Patient Profile</h2>
                <div className="grid grid-cols-3 gap-6">
                    <div><p className="text-sm text-slate-400">Name</p><p className="font-semibold text-lg">{patient.name[0].given.join(' ')} {patient.name[0].family}</p></div>
                    <div><p className="text-sm text-slate-400">Gender</p><p className="font-semibold text-lg capitalize">{patient.gender}</p></div>
                    <div><p className="text-sm text-slate-400">DOB</p><p className="font-semibold text-lg">{patient.birthDate}</p></div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Allergy Check */}
                <div className={`p-6 rounded-xl shadow-sm border ${allergies.length > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                    <h3 className="text-xl font-bold mb-4 flex items-center">
                        {allergies.length > 0 ? '⚠️ Allergy Alert' : '✅ No Known Allergies'}
                    </h3>
                    <ul className="list-disc ml-5">
                        {allergies.map((a, i) => (
                            <li key={i} className="text-red-700 font-medium">
                                {a.resource.code.text || "Unknown Allergy"}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Lab Safety Check (Platelets) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-xl font-bold mb-4">Safety Labs (Platelet Count)</h3>
                    {labs.length > 0 ? (
                        labs.map((l, i) => {
                            const val = l.resource.valueQuantity.value;
                            const isSafe = val > 150; // A minimum of 150,000 or 150 units is required for the surgery.
                            return (
                                <div key={i} className={`p-4 rounded-lg ${isSafe ? 'bg-blue-50' : 'bg-orange-50'}`}>
                                    <p className="text-sm text-slate-500 underline">LOINC: 777-3 (Platelets)</p>
                                    <p className="text-2xl font-black">{val} {l.resource.valueQuantity.unit}</p>
                                    <p className={isSafe ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                                        {isSafe ? "✓ Safe for Surgery" : "✕ Low Count - Consult Hematologist"}
                                    </p>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-slate-500 italic">No recent platelet records found.</p>
                    )}
                </div>
            </div>

            {/* [Task 2] Procedure Verification: CPT (scheduled surgery) vs SNOMED CT (diagnosis) */}
            <div className={`mt-6 p-6 rounded-xl shadow-sm border ${
                procedureVerification.status === "match" ? "bg-green-50 border-green-200"
                : procedureVerification.status === "mismatch" ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200"
            }`}>
                <h3 className="text-xl font-bold mb-4">Procedure Verification (CPT vs SNOMED CT)</h3>
                <div className="grid grid-cols-2 gap-6 mb-4">
                    <div>
                        <p className="text-sm text-slate-400">Diagnosis (SNOMED CT)</p>
                        <p className="font-semibold">{diagnosisInfo.text || "Not found in FHIR record"}</p>
                        {diagnosisInfo.code
                            ? <p className="text-xs text-slate-400">Code: {diagnosisInfo.code}</p>
                            : diagnosisInfo.text && <p className="text-xs text-amber-600 italic">Not coded with SNOMED CT in this record</p>
                        }
                    </div>
                    <div>
                        <p className="text-sm text-slate-400">Scheduled Procedure (CPT)</p>
                        <p className="font-semibold">{procedureInfo.text || "Not found in FHIR record"}</p>
                        {procedureInfo.code
                            ? <p className="text-xs text-slate-400">Code: {procedureInfo.code}</p>
                            : procedureInfo.text && <p className="text-xs text-amber-600 italic">Not coded with CPT in this record</p>
                        }
                    </div>
                </div>
                {procedureVerification.status === "match" && (
                    <p className="text-green-700 font-bold">✓ Procedure matches diagnosis (crosswalk verified)</p>
                )}
                {procedureVerification.status === "mismatch" && (
                    <p className="text-red-700 font-bold">✕ Procedure does NOT match diagnosis &mdash; manual review required</p>
                )}
                {procedureVerification.status === "unmapped" && (
                    <p className="text-amber-700 font-bold">⚠ No crosswalk entry for this procedure &mdash; manual review required (demo crosswalk covers a limited set of procedures)</p>
                )}
                {procedureVerification.status === "insufficient-data" && (
                    <p className="text-amber-700 font-bold">
                        ⚠ {(!diagnosisInfo.text || !procedureInfo.text)
                            ? "Diagnosis or procedure data not available in this FHIR sandbox for this patient"
                            : "Diagnosis and/or procedure name found, but not coded with the expected SNOMED CT / CPT terminology system in this record"}
                        {" "}&mdash; manual review required
                    </p>
                )}
            </div>

            {/* Action Buttons */}
            <div className="mt-10 flex justify-end gap-4">
                <button
                    onClick={handleExportUscdiDocument} // [Task 4] USCDI document export
                    className="bg-slate-700 text-white px-6 py-3 rounded-lg font-bold hover:bg-slate-800 shadow-lg active:transform active:scale-95 transition"
                >
                    Export USCDI Pre-Op Summary
                </button>
                <button
                    onClick={handleVerify} // এখানে ফাংশনটি কল করুন
                    className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg active:transform active:scale-95 transition"
                >
                    Verify & Proceed to OT
                </button>
            </div>
        </div>
    );
}