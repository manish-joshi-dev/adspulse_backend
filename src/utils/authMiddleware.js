import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { getPublicUserById } from "../services/auth.service.js";
import { ApiError } from "./http.js";

const readToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
};

export const authenticate = async (req, res, next) => {
  try {
    const token = readToken(req);
    if (!token) {
      throw new ApiError(401, "Authentication token is required");
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getPublicUserById(payload.sub);
    if (!user) {
      throw new ApiError(401, "Authenticated user was not found");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(new ApiError(401, "Authentication token is invalid or expired"));
  }
};

export const optionalAuthenticate = async (req, res, next) => {
  const token = readToken(req);
  if (!token) {
    next();
    return;
  }
  await authenticate(req, res, next);
};

