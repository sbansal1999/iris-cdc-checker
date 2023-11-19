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

async function getCurrentListedCompanies() {
  try {
    const websiteData = await axios.get(
      "https://iris.nitk.ac.in/hrms/placement/dashboard",
      {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language":
            "en-IN,en;q=0.9,hi-IN;q=0.8,hi;q=0.7,en-GB;q=0.6,en-US;q=0.5,ar;q=0.4,ru;q=0.3",
          "cache-control": "no-cache",
          pragma: "no-cache",
          "sec-ch-ua":
            '"Chromium";v="110", "Not A(Brand";v="24", "Google Chrome";v="110"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Linux"',
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          cookie: process.env.IRIS_COOKIE,
          Referer: "https://iris.nitk.ac.in/hrms/",
          "Referrer-Policy": "strict-origin-when-cross-origin",
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

    return currentCompanies;
  } catch (error) {
    return error;
  }
}

async function getCompaniesFromDB() {
  try {
    const data = await (await supabase.from("companies").select()).data;
    const companies = data.map((obj) => obj.name);
    return companies;
  } catch (error) {
    console.log("some error" + error);
    return error;
  }
}

async function setCompaniesToDB(companies) {
  //delete existing data
  await supabase.from("companies").delete().select().like("name", "*");

  //add new companies
  await supabase
    .from("companies")
    .insert(companies.map((company) => ({ name: company })));
}

async function getEmailsFromDB() {
  try {
    const data = await (await supabase.from("emails").select()).data;
    const emails = data.map((obj) => obj.email);
    return emails;
  }
  catch (error) {
    console.log("some error" + error);
    return error;
  }
}

app.get("/scrape", async (req, res) => {
  try {
    const currentListedCompanies = await getCurrentListedCompanies();
    const storedCompanies = await getCompaniesFromDB();

    const newCompanies = currentListedCompanies.filter(
      (company) => !storedCompanies.includes(company)
    );

    console.log(currentListedCompanies);
    console.log(storedCompanies);
    console.log(newCompanies);

    if (newCompanies.length > 0) {
      await setCompaniesToDB(currentListedCompanies);
      const emails = await getEmailsFromDB();
      console.log(emails);
      for (const email of emails) {
        await resend.emails.send({
          from: "Iris-CDC-Checker <iris-cdc-checker@mindfuelclub.tech>",
          to: [email],
          subject: "Yoo IRIS has new companies!",
          text: `Check out the new companies at IRIS: ${newCompanies}`,
        });
      };
    }
    res.json(newCompanies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export { app };
