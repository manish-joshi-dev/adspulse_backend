import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { config } from "../config/env.js";
import User from "../models/User.model.js";

const success = (res, data, status = 200) =>
  res.status(status).json({
    success: true,
    data
  });

const failure = (res, status, code, message, details = null) =>
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details
    }
  });

const validationFailure = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  failure(res, 422, "VALIDATION_ERROR", "Validation failed", errors.array());
  return true;
};

const publicUser = (user) => ({
  userId: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  plan: user.plan,
  analysisCount: user.analysisCount,
  lastLogin: user.lastLogin,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const signToken = (user) =>
  jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );

export const register = async (req, res) => {
  try {
    if (validationFailure(req, res)) return;

    const existingUser = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (existingUser) {
      failure(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists");
      return;
    }

    const user = await User.create({
      email: req.body.email,
      passwordHash: req.body.password,
      name: req.body.name
    });

    success(
      res,
      {
        token: signToken(user),
        user: publicUser(user)
      },
      201
    );
  } catch (error) {
    failure(res, 500, "REGISTER_FAILED", "Unable to register user", error.message);
  }
};

export const login = async (req, res) => {
  try {
    if (validationFailure(req, res)) return;

    const user = await User.findByEmail(req.body.email);
    if (!user) {
      failure(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
      return;
    }

    const isMatch = await user.comparePassword(req.body.password);
    if (!isMatch) {
      failure(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
      return;
    }

    user.lastLogin = new Date();
    await user.save();

    success(res, {
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    failure(res, 500, "LOGIN_FAILED", "Unable to log in", error.message);
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-passwordHash");
    if (!user) {
      failure(res, 404, "USER_NOT_FOUND", "Current user was not found");
      return;
    }

    success(res, { user: publicUser(user) });
  } catch (error) {
    failure(res, 500, "ME_FAILED", "Unable to load current user", error.message);
  }
};

export const logout = async (req, res) => {
  try {
    success(res, {
      message: "Logged out successfully"
    });
  } catch (error) {
    failure(res, 500, "LOGOUT_FAILED", "Unable to log out", error.message);
  }
};

