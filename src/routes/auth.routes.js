import { Router } from "express";
import { body } from "express-validator";
import { login, logout, me, register } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("name")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters")
  ],
  register
);

router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("password").isString().notEmpty().withMessage("Password is required")
  ],
  login
);

router.get("/me", authenticate, me);
router.post("/logout", authenticate, logout);

export default router;

