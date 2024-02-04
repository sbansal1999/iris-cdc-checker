import express from "express";
import axios from "axios";
import cheerio from "cheerio";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

dotenv.config();

const app = express();
const port = 3000;
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON
);
const resend = new Resend(process.env.RESEND_API_KEY);

const placementCompaniesTable = "placement_companies";
const internshipCompaniesTable = "internship_companies";

async function getCurrentListedCompanies(internship = false) {
  try {
    const websiteData = await axios.get(
      "https://iris.nitk.ac.in/hrms/placement/dashboard",
      {
        headers: {
          cookie: internship
            ? process.env.IRIS_INTERNSHIP_COOKIE
            : process.env.IRIS_PLACEMENT_COOKIE,
        },
        body: null,
        method: "GET",
      }
    );

    const html = websiteData.data;
    const $ = cheerio.load(html);
    const data = $("#upcoming tbody tr");
    const currentCompanies = [];
    data.each((_, element) => {
      const company = $(element).find("td:nth-child(1) strong").text();
      currentCompanies.push(company);
    });

    console.log(currentCompanies);

    return currentCompanies;
  } catch (error) {
    console.log(error);
    return error;
  }
}

async function getCompaniesFromDB(internship = false) {
  try {
    const tableName = internship
      ? internshipCompaniesTable
      : placementCompaniesTable;
    const data = await (await supabase.from(tableName).select()).data;
    const companies = data.map((obj) => obj.name);
    return companies;
  } catch (error) {
    console.log("some error" + error);
    return error;
  }
}

async function setCompaniesToDB(companies, internship = false) {
  const tableName = internship
    ? internshipCompaniesTable
    : placementCompaniesTable;
  //delete existing data
  await supabase.from(tableName).delete().select().like("name", "*");

  //add new companies
  await supabase
    .from(tableName)
    .insert(companies.map((company) => ({ name: company })));
}

async function getEmailsFromDB() {
  try {
    const data = await (await supabase.from("emails").select()).data;
    const emails = data.map((obj) => obj.email);
    return emails;
  } catch (error) {
    console.log("some error" + error);
    return error;
  }
}

app.get("/scrape", async (req, res) => {
  try {
    const currentListedPlacementCompanies = await getCurrentListedCompanies();
    const storedPlacementCompanies = await getCompaniesFromDB();
    const newPlacementCompanies = currentListedPlacementCompanies.filter(
      (company) => !storedPlacementCompanies.includes(company)
    );

    console.log(currentListedPlacementCompanies);
    console.log(storedPlacementCompanies);
    console.log(newPlacementCompanies);
    console.log(process.env.IRIS_PLACEMENT_COOKIE);

    const currentListedInternshipCompanies = await getCurrentListedCompanies(
      true
    );
    const storedInternshipCompanies = await getCompaniesFromDB(true);
    const newInternshipCompanies = currentListedInternshipCompanies.filter(
      (company) => !storedInternshipCompanies.includes(company)
    );

    console.log(currentListedInternshipCompanies);
    console.log(storedInternshipCompanies);
    console.log(newInternshipCompanies);
    console.log(process.env.IRIS_INTERNSHIP_COOKIE);

    if (newPlacementCompanies.length > 0 || newInternshipCompanies.length > 0) {
      const placementMessage = `
      New placement companies: ${newPlacementCompanies}
      `;
      const internshipMessage = `
      New internship companies: ${newInternshipCompanies}
      `;

      const finalMessage = `
      ${newPlacementCompanies.length > 0 ? placementMessage : ""}
      ${newInternshipCompanies.length > 0 ? internshipMessage : ""}
      `;

      await setCompaniesToDB(currentListedPlacementCompanies);
      await setCompaniesToDB(currentListedInternshipCompanies, true);
      const emails = await getEmailsFromDB();
      console.log(emails);
      const arr = emails.map((email) => {
        return {
          from: "Iris-CDC-Checker <iris-cdc-checker@mindfuelclub.tech>",
          to: [email],
          subject: "Yoo IRIS has new companies!",
          text: finalMessage,
        };
      });

      const data = await resend.batch.send(arr);
      console.log(data);
    }
    res.json(newPlacementCompanies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export { app };
