// client/src/app/launch/page.js
"use client";
import { useEffect } from 'react';
import FHIR from 'fhirclient';

export default function Launch() {
  useEffect(() => {
    // ১. পুরনো FHIR টোকেন রিমুভ করুন (পুরো স্টোরেজ ক্লিয়ার করবেন না)
    window.localStorage.removeItem('fhirjs');
    window.sessionStorage.removeItem('fhirjs');

    // . SMART on FHIR অথরাইজেশন শুরু করুন
    FHIR.oauth2.authorize({
      clientId: "my_web_app",
      scope: "patient/*.read patient/*.write openid profile fhirUser",
      redirectUri: "http://localhost:3000/dashboard",
      // ফলব্যাক URL (যদি লঞ্চার থেকে iss না আসে)
      fhirServiceUrl: "https://hapi.fhir.org/baseR4", 
    }).catch(err => {
      console.error("Launch error:", err);
    });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-blue-600 font-semibold">Launching SMART App...</p>
      </div>
    </div>
  );
}