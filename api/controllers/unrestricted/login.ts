import { Request, Response } from "express";
import verifyJwt from "../../helpers/auth/verifyJwt";
import User from "../../models/User";
import createJwt from "../../helpers/auth/createJwt";
import cookieDomain from "../../helpers/auth/cookieDomain";

export async function login(req: Request, res: Response): Promise<void> {
  let user;

  if ("token" in req.cookies) {
    const token = req.cookies["token"];
    const loggedIn = await verifyJwt(token);

    if (!loggedIn) {
      user = await User.findOne({}, null, { sort: { _id: -1 }, limit: 1 });
      if (user) {
        const jwt = await createJwt(user._id.toString());
        res.cookie("token", jwt, { httpOnly: false, ...cookieDomain() });
      }
    } else {
      user = await User.findOne({}, null, { sort: { _id: -1 }, limit: 1 });
    }
  } else {
    user = await User.findOne({}, null, { sort: { _id: -1 }, limit: 1 });
    if (user) {
      const jwt = await createJwt(user._id.toString());
      res.cookie("token", jwt, { httpOnly: false, ...cookieDomain() });
    }
  }

  if (user) {
    res.json({
      msg: "welcome back",
      user: {
        username: user.username,
        email: user.email,
        pfp: user.pfp, // ✅ Send profile picture to frontend
      },
    });
  } else {
    res.status(400).json({ msg: "User not found" });
  }
}



