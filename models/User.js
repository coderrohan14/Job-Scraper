const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide the name."],
    minLength: 1,
  },
  email: {
    type: String,
    required: [true, "Please provide the email."],
    minLength: 1,
  },
});

module.exports = new mongoose.model("User", UserSchema);
