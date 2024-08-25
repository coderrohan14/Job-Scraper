const express = require("express");
const crypto = require("crypto");
const puppeteer = require("puppeteer");
const app = express();
const nodemailer = require("nodemailer");
const axios = require("axios");
require("dotenv").config();
const connectDB = require("./db/connect");
const Company = require("./models/Company");
const User = require("./models/User");
const newJobsList = {};

const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER.toString(),
    pass: process.env.GMAIL_PASSWORD.toString(),
  },
});

app.get("/", (req, res) => {
  res.send("Welcome to the server...");
});

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

app.get("/fetch-html", async (req, res) => {
  const allUsers = await User.find({});
  const companies = await Company.find({});
  try {
    for (let company of companies) {
      const url = company.url;
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" }); // Ensures all network requests are finished

      const text = await page.evaluate(() => {
        const walk = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        let node;
        let textContent = "";

        while ((node = walk.nextNode())) {
          if (
            node.parentElement &&
            getComputedStyle(node.parentElement).display !== "none" &&
            node.textContent.trim().length > 0
          ) {
            textContent += node.textContent.trim() + " ";
          }
        }
        return textContent;
      });

      await browser.close();
      let hash = hashContent(text);

      if (company.hash === "") {
        // first call for this link, no email should be sent.
        console.log("First Time!");
        company.hash = hash;
        const jobTitles = await llmCall(text);
        company.jobs.push(...jobTitles);
        await company.save();
      } else if (company.hash !== hash) {
        // something has been changed, make the llm call.
        console.log("Has a previous entry!");
        company.hash = hash;
        const jobTitles = await llmCall(text);
        const newlyAddedJobs = compareJobs(company.jobs, jobTitles);
        company.jobs = jobTitles;
        await company.save();
        if (newlyAddedJobs.length === 0) continue;
        if (company.common) {
          updateNewJobsList(
            allUsers,
            newlyAddedJobs,
            company.companyName,
            company.url
          );
        } else {
          updateNewJobsList(
            company.subscribers,
            newlyAddedJobs,
            company.companyName,
            company.url
          );
        }
      }
    }
    res.send("AC");
    sendConsolidatedEmails(newJobsList);
  } catch (error) {
    console.error("Error fetching HTML:", error);
    res.status(500).send("Error fetching HTML");
  }
});

function updateNewJobsList(userList, newlyAddedJobs, companyName, url) {
  userList.forEach((user) => {
    if (!newJobsList[user.email]) {
      newJobsList[user.email] = {
        name: user.name,
        jobs: {},
      };
    }
    if (!newJobsList[user.email].jobs[companyName]) {
      newJobsList[user.email].jobs[companyName] = { url, jobs: [] };
    }

    newJobsList[user.email].jobs[companyName].jobs.push(...newlyAddedJobs);
  });
}

async function llmCall(text) {
  // should return an array of job title strings
  const prompt =
    "Extract the job titles from the following text with following rules : 1. only consider the job titles which are in English Language 2. Consider each job titles as unique even if the name is same 3. Don't consider anything apart from job titles. 4. Only consider the job titles that align with Software Engineering, Hardware Engineering, and Embedded Coding domains 5. At last return them as a Python list without any additional text:";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.GPT_API_KEY.toString()}`,
  };

  const payload = {
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: prompt + text,
      },
    ],
  };

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      payload,
      { headers }
    );
    if (response.status === 200) {
      const responseText = response.data.choices[0].message.content;
      const jobList = processLLMResponse(responseText);
      return jobList;
    } else {
      console.error("Error:", response.status);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

function processLLMResponse(response) {
  const jobTitles = response.slice(1, -1).split("', '");

  jobTitles[0] = jobTitles[0].substring(1);
  jobTitles[jobTitles.length - 1] = jobTitles[jobTitles.length - 1].slice(
    0,
    -1
  );

  return jobTitles;
}

function compareJobs(prevJobs, newJobs) {
  const previousJobsSet = new Set(prevJobs);
  const newUniqueJobs = [];

  newJobs.forEach((job) => {
    if (!previousJobsSet.has(job)) {
      newUniqueJobs.push(job);
    }
  });

  return newUniqueJobs;
}

function sendConsolidatedEmails(userJobs) {
  Object.keys(userJobs).forEach((email) => {
    const user = userJobs[email];
    let emailHtml = `Hi ${user.name},<br><br>Here are your new job opportunities:<br>`;

    Object.keys(user.jobs).forEach((companyName) => {
      emailHtml += `<br><a href="${user.jobs[companyName].url}" target="_blank"><strong>${companyName}</strong></a>:<br>`;
      user.jobs[companyName].jobs.forEach((job) => {
        emailHtml += `• ${job}<br>`;
      });
    });

    emailHtml += `<br>Best Regards,<br>Cypress Job Hunt Team 🫡`;

    sendEmail(email, "Your daily job updates!", emailHtml);
    console.log(`Email sent to ${user.name}`);
  });
}

function sendEmail(to, subject, htmlContent) {
  const mailOptions = {
    from: process.env.GMAIL_USER.toString(),
    to,
    subject,
    html: htmlContent,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log("Error sending email:", error);
    } else {
      console.log("Email sent:", info.response);
    }
  });
}

const port = process.env.PORT || 4000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(port, () => {
      console.log(`Server started on port ${port}...`);
    });
  } catch (err) {
    console.log(err);
  }
};

start();
