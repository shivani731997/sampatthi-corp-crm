import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";
import fs from "fs";
import csv from "csv-parser";

// TODO: paste your exact firebase config here
const firebaseConfig = {
  apiKey: "AIzaSyANF6E8bCMGzsSE3-I98kFb96svS5iz3P4",
  authDomain: "real-estate-crm-8888.firebaseapp.com",
  projectId: "real-estate-crm-8888",
  storageBucket: "real-estate-crm-8888.firebasestorage.app",
  messagingSenderId: "614281380702",
  appId: "1:614281380702:web:619a7eec7d888f0e4005cf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadLeads() {
  const leads = [];

  fs.createReadStream("leads.csv")
    .pipe(csv())
    .on("data", (row) => {
      leads.push(row);
    })
    .on("end", async () => {
      console.log(`Uploading ${leads.length} leads...`);

      for (const lead of leads) {
        await addDoc(collection(db, "leads"), {
          date_time: lead.date_time,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          pincode: lead.pincode,
          assigned_to: lead.assigned_to,
          status: lead.status,
          notes: lead.notes
        });
      }

      console.log("Upload complete!");
      process.exit();
    });
}

uploadLeads();
