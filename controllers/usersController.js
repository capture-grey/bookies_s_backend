const mongoose = require("mongoose");
const JWT = require("jsonwebtoken");
const bcrypt = require("bcrypt");
//const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

const User = require("../models/user");
const Book = require("../models/book");

const getOwnInfo = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const getUserInfo = async (req, res, next) => {
  const session = await mongoose.startSession();
};
const editOwnInfo = async (req, res, next) => {
  const session = await mongoose.startSession();
};

module.exports = {
  getOwnInfo,
  getUserInfo,
  editOwnInfo,
};
