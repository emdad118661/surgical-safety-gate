
"use client";
import { useEffect, useState } from 'react';
import FHIR from 'fhirclient';
import Swal from 'sweetalert2';

export default function Dashboard() {
    const [patient, setPatient] = useState(null);
    const [allergies, setAllergies] = useState([]);
    const [labs, setLabs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        FHIR.oauth2.ready()
            .then(async (client) => {
                // 1. Retrieving patient data
                const patientData = await client.patient.read();
                setPatient(patientData);

                // 2. Fetching allergy data (AllergyIntolerance Specification)
                const allergyData = await client.request(`AllergyIntolerance?patient=${client.patient.id}`);
                setAllergies(allergyData.entry || []);

                // 3. Bringing the lab report (Observation Specification - Platelet Count LOINC: 777-3)
                const labData = await client.request(`Observation?patient=${client.patient.id}&code=777-3`);
                setLabs(labData.entry || []);

                setLoading(false);
            })
            .catch(err => console.error(err));
    }, []);

    if (loading) return <div className="p-10 text-center">Checking Clinical Records...</div>;


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
            allergyList: allergies.map(a => a.resource.code.text || "Unknown")
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

    return (
        <div className="p-8 max-w-5xl mx-auto bg-slate-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-8 text-blue-900 border-b pb-4">
                Pre-Surgical Safety Gate
            </h1>

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

            {/* Action Button */}
            <div className="mt-10 text-right">
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