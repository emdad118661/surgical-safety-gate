# 🏥 Surgical Safety Gate (Case 2)

A specialized clinical decision support tool built for surgical teams. This application integrates directly with EHR systems via the **SMART on FHIR** framework to ensure patient safety before surgery.

## 🚀 Key Features
- **SMART on FHIR Launch:** Seamlessly authenticates and launches within the EHR context (OAuth 2.0).
- **Clinical Validation:** Automatically fetches and checks patient data using **LOINC (777-3)** for Platelet counts and checks **AllergyIntolerance** records.
- **Audit Trail:** Every clearance is logged into a **MongoDB Atlas** cloud database for HIPAA compliance and legal auditing.
- **Professional UI:** Built with **Next.js**, **Tailwind CSS**, and **SweetAlert2** for high-priority clinical alerts.

## 🛠️ Tech Stack
- **Frontend:** Next.js (App Router), Tailwind CSS, fhirclient.js
- **Backend:** Node.js, Express.js, Mongoose
- **Database:** MongoDB Atlas (Cloud)
- **Standards:** HL7 FHIR R4, LOINC, USCDI

## ⚙️ Setup Instructions
1. **Clone the repo:** `git clone https://github.com/YOUR_USERNAME/surgical-safety-gate.git`
2. **Server Setup:** 
   - `cd server`
   - `npm install`
   - Create a `.env` file and add your `MONGODB_URI`.
   - Start: `node index.js`
3. **Client Setup:** 
   - `cd client`
   - `npm install`
   - Start: `npm run dev`
4. **Launch:** Use the [SMART App Launcher](https://launch.smarthealthit.org/) with `http://localhost:3000/launch`

---
*Developed as a Technical Task for DNA Health (Vibe Coder Position).*
