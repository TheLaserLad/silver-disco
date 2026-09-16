import { Request, Response } from "express";
import User from "../../models/User";
import createJwt from "../../helpers/auth/createJwt";
import cookieDomain from "../../helpers/auth/cookieDomain";

export async function signUp(req: Request, res: Response): Promise<void> {
  const body = req.body;

  try {
    if ("token" in req.body) {
      res.status(400).json({ error: "Can't authenticate with TikTok" });
    } else {
      if ("email" in req.body && "user" in req.body) {
        const email = req.body.email;
        const user = req.body.user;

        if ("_id" in user) {
          const currentUser = await User.findOne({
            _id: user._id,
            consented: false,
          });

          if (currentUser) {
            const response = await fetch(
              "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
              {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${currentUser.clientToken}`,
                },
              }
            )
              .then((response) => {
                return response.json();
              })
              .then(async (data) => {
                if (data.error.code === "ok") {
                  await User.findOneAndUpdate(
                    {
                      _id: currentUser._id,
                    },
                    {
                      email: email,
                      consented: true,
                    }
                  );

                  const jwt = await createJwt(currentUser._id.toString());

                  res.cookie("token", jwt, {
                    httpOnly: false,
                    ...cookieDomain(),
                  });

                  res.json({ msg: "Signed up." });
                } else {
                  res.status(400).json({ error: "Something went wrong." });
                }
              });
          } else {
            res.status(400).json({ error: "Enter valid data." });
          }
        } else {
          res.status(400).json({ error: "Enter valid data." });
        }
      } else {
        res.status(400).json({ error: "Enter full data." });
      }
    }
  } catch (e) {
    console.error(e);
  }
}
