import { Request, Response } from "express";
import User from "../../models/User";
import createJwt from "../../helpers/auth/createJwt";
import cookieDomain from "../../helpers/auth/cookieDomain";
import { hash } from "bcrypt";

export async function demoSignUp(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;

    if (username != "" && email != "" && password != "") {
      const hashedPassword = await hash(password, 12);

      const user = await User.create({
        email: email,
        username: username,
        password: hashedPassword,
      });

      if (user) {
        const jwt = await createJwt(user._id.toString());

        res.cookie("token", jwt, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "none",
          ...cookieDomain(),
        });

        // ✅ Send user info back to frontend
        res.status(200).json({ user: { id: user._id, username: user.username, email: user.email }, });
      } else {
        res.status(400).json({ error: "Something went wrong, please try again later." });
      }

    } else {
      res.status(400).json({ error: "Please fill out the form completely." });
    }
  } catch (e) {
    console.error(e);
  }
}
