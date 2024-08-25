const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema({
  companyName: {
    type: String,
    required: [true, "Please provide the company name."],
    minLength: 1,
  },
  url: {
    type: String,
    required: [true, "Please provide the career page's URL."],
    minLength: 1,
  },
  hash: {
    type: String,
    default: "",
  },
  common: {
    type: Boolean,
    default: true,
  },
  subscribers: {
    type: [
      {
        type: mongoose.Types.ObjectId,
        ref: "User",
      },
    ],
    default: [],
  },
  jobs: {
    type: [
      {
        type: String,
        required: [true, "Please provide the job name."],
        minLength: 1,
      },
    ],
    default: [],
  },
});

module.exports = new mongoose.model("Company", CompanySchema);
