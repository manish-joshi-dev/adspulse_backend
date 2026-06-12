import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config/env.js";
import { isDatabaseConnected } from "../config/database.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/http.js";

const memoryUsersByEmail = new Map();
const memoryUsersById = new Map();

const toPublicUser = (user) => {
  if (!user) {
    return null;
  }

  const source = typeof user.toObject === "function" ? user.toObject() : user;
  return {
    id: String(source._id || source.id),
    name: source.name,
    email: source.email,
    createdAt: source.createdAt
  };
};

const signToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );

export const registerUser = async ({ name, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(password, 12);

  if (isDatabaseConnected()) {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new ApiError(409, "An account already exists for this email");
    }

    const created = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash
    });
    const user = toPublicUser(created);
    return { user, token: signToken(user) };
  }

  if (memoryUsersByEmail.has(normalizedEmail)) {
    throw new ApiError(409, "An account already exists for this email");
  }

  const user = {
    id: uuidv4(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  memoryUsersByEmail.set(normalizedEmail, user);
  memoryUsersById.set(user.id, user);
  const publicUser = toPublicUser(user);
  return { user: publicUser, token: signToken(publicUser) };
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const user = isDatabaseConnected()
    ? await User.findOne({ email: normalizedEmail })
    : memoryUsersByEmail.get(normalizedEmail);

  if (!user) {
    throw new ApiError(401, "Email or password is incorrect");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new ApiError(401, "Email or password is incorrect");
  }

  const publicUser = toPublicUser(user);
  return { user: publicUser, token: signToken(publicUser) };
};

export const getPublicUserById = async (id) => {
  if (!id) {
    return null;
  }

  if (isDatabaseConnected()) {
    const user = await User.findById(id);
    return toPublicUser(user);
  }

  return toPublicUser(memoryUsersById.get(id));
};

