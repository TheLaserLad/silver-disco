import { Request, Response } from "express";
import User from "../../models/User";
import createJwt from "../../helpers/auth/createJwt";
import cookieDomain from "../../helpers/auth/cookieDomain";

export async function redirect(req: Request, res: Response): Promise<void> {
  try {
    const { error, code, state } = req.query;

    if (error || !code || !state) {
      res.status(400).json({ msg: "Missing required query params" });
      console.log("TikTok redirect query:", req.query);
      return;
    }

    // Step 1: Exchange code for access token
    const tokenBody = new URLSearchParams();
    tokenBody.append("code", code as string);
    tokenBody.append("client_key", process.env.clientKey || "empty");
    tokenBody.append("client_secret", process.env.clientSecret || "empty");
    tokenBody.append("grant_type", "authorization_code");
    tokenBody.append(
      "redirect_uri",
      process.env.TIKTOK_REDIRECT_URI || "https://pinballrace.com:8080/redirect"
    );

    const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error("TikTok token error:", tokenData);
      res.status(400).json({ msg: "Failed to obtain TikTok token" });
      return;
    }

    // Step 2: Fetch TikTok user info
    const userResponse = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );

    const userDataResp = await userResponse.json();

    if (!userDataResp.data || !userDataResp.data.user) {
      console.error("TikTok user fetch error:", userDataResp);
      res.status(400).json({ msg: "Failed to fetch TikTok user info" });
      return;
    }

    const userInfo = userDataResp.data.user;

    // Step 3: Check if user exists
    let user = await User.findOne({ username: userInfo.display_name });

    if (user) {
      user.clientToken = tokenData.access_token;
      user.refreshToken = tokenData.refresh_token;
      user.tiktokId = userInfo.id;
      user.connectedAccounts = { ...user.connectedAccounts, tiktok: true };
      await user.save();
    } else {
      user = await User.create({
        csrfToken: state,
        clientToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        consented: false,
        username: userInfo.display_name,
        pfp: userInfo.avatar_url,
        tiktokId: userInfo.id,
        connectedAccounts: { google: false, twitch: false, tiktok: true },
      });
    }

    // Step 4: Generate JWT and set cookies
    const jwtToken = await createJwt(user._id.toString());
    res.cookie("token", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      ...cookieDomain(),
    });

    res.cookie("userId", user._id.toString(), { httpOnly: false });

    // Step 5: Redirect
    res.redirect(`${process.env.CLIENT_URL}${user ? "/home" : "/signUp"}`);
  } catch (err) {
    console.error("TikTok OAuth error:", err);
    res.status(500).json({ msg: "Server error during TikTok OAuth" });
  }
}




// import { Response } from "express";
// import User from "../../models/User";
// import createJwt from "../../helpers/auth/createJwt";

// export async function redirect(req: any, res: Response): Promise<void> {
//   if (
//     !("error" in req.query) &&
//     "code" in req.query &&
//     "scopes" in req.query &&
//     "state" in req.query
//   ) {
//     const content = new URLSearchParams();
//     content.append("code", req.query.code);
//     content.append(
//       "client_key",
//       process.env.clientKey ? process.env.clientKey : "empty"
//     );
//     content.append(
//       "client_secret",
//       process.env.clientSecret ? process.env.clientSecret : "empty"
//     );
//     content.append("grant_type", "authorization_code");
//     content.append("redirect_uri", "https://pinballrace.com:8080/redirect");

//     await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       body: content,
//     })
//       .then((response) => {
//         return response.json();
//       })
//       .then(async (data) => {
//         if (!("error" in data)) {
//           try {
//             await fetch(
//               "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
//               {
//                 method: "GET",
//                 headers: {
//                   Authorization: `Bearer ${data.access_token}`,
//                 },
//               }
//             )
//               .then((response) => {
//                 return response.json();
//               })
//               .then(async (userData) => {
//                 if (userData.error.code === "ok") {
//                   const existingUser = await User.findOne({
//                     username: userData.data.user.display_name,
//                   });

//                   if (existingUser) {
//                     const user = await User.findOneAndUpdate(
//                       { _id: existingUser._id },
//                       {
//                         clientToken: data.access_token,
//                         refreshToken: data.refresh_token,
//                       },
//                       { new: true }
//                     );

//                     if (user) {
//                       const token = await createJwt(user._id.toString());

//                       res.cookie("token", token, {
//                         httpOnly: false,
//                       });

//                       if (process.env.CLIENT_URL)
//                         res.redirect(process.env.CLIENT_URL);
//                     }
//                   } else {
//                     const user = await User.create({
//                       csrfToken: req.query.state,
//                       clientToken: data.access_token,
//                       refreshToken: data.refresh_token,
//                       consented: false,
//                       username: userData.data.user.display_name,
//                       pfp: userData.data.user.avatar_url,
//                     });

//                     res.cookie("userId", user._id.toString(), {
//                       httpOnly: false,
//                     });

//                     res.redirect(process.env.CLIENT_URL + "/signUp");
//                   }
//                 } else {
//                   console.error(userData);
//                 }
//               })
//               .catch((e) => {
//                 console.error(e);
//               });
//           } catch (e) {
//             console.error(e);
//           }
//         } else {
//           res.status(400).json({ msg: "Something went wrong in the data." });
//         }
//       })
//       .catch((err) => {
//         console.error(err);
//         res.status(400).json({ msg: "Something went wrong." });
//       });
//   } else {
//     res.status(400).json({ msg: "hi" });
//   }
// }











