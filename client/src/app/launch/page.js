"use client";
import { useEffect } from 'react';
import FHIR from 'fhirclient';

export default function Launch() {
  useEffect(() => {
    FHIR.oauth2.authorize({
      clientId: "my_web_app", 
      scope: "patient/*.read patient/*.write openid profile fhirUser", 
      // adding new redirecturi
      redirectUri: "http://localhost:3000/dashboard", 
    });
  }, []);

  return <div className="p-10 text-center text-blue-500 font-bold">Initializing SMART Launch...</div>;
}