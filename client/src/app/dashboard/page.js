
// client/src/app/dashboard/page.js
"use client";
import { useEffect, useState } from 'react';
import FHIR from 'fhirclient';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';

export default function Dashboard() {
    const [patient, setPatient] = useState(null);
    const [allergies, setAllergies] = useState([]);
    const [labs, setLabs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState(false); // নতুন স্টেট যোগ করুন
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