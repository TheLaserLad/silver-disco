import express from "express";
import { getMe } from "../controllers/user/getMe";
import {
  changePassword,
  getPasswordStatus,
} from "../controllers/user/changePassword";

const router = express.Router();
router.get("/me", getMe);
router.get("/password", getPasswordStatus);
router.post("/password", changePassword);

export default router;
