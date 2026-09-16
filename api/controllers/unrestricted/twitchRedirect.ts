import { Request, Response } from "express";
import User from "../../models/User";
import createJwt from "../../helpers/auth/createJwt";
import cookieDomain from "../../helpers/auth/cookieDomain";

export async function twitchRedirect(req: Request, res: Response): Promise<void> {
  try {
    // Check if redirect has correct parameters
    if ("error" in req.query || !("code" in req.query) || !("state" in req.query)) {
      res.status(400).json({ msg: "Missing required query params" });
      console.log("Twitch redirect query:", req.query);
      return;
    }

    // Step 1: Exchange authorization code for access token
    const content = new URLSearchParams();
    content.append("client_id", process.env.TWITCH_CLIENT_ID!);
    content.append("client_secret", process.env.TWITCH_CLIENT_SECRET!);
    content.append("code", req.query.code as string);
    content.append("grant_type", "authorization_code");
    content.append("redirect_uri", process.env.TWITCH_REDIRECT_URI!);

    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: content,
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error("Twitch token error:", tokenData);
      res.status(400).json({ msg: "Failed to obtain Twitch token" });
      return;
    }

    // Step 2: Fetch Twitch user info
    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID!,
      },
    });

    const userDataResp = await userResponse.json();
    const userData = userDataResp.data?.[0];

    if (!userData || !userData.email) {
      console.error("Invalid Twitch user data:", userDataResp);
      res.status(400).json({ msg: "Failed to fetch Twitch user info" });
      return;
    }

    // Step 3: Check if user exists
    let user = await User.findOne({ email: userData.email });

    if (user) {
      // Update tokens and mark Twitch connected
      user.clientToken = tokenData.access_token;
      user.refreshToken = tokenData.refresh_token;
      user.twitchId = userData.id;
      user.connectedAccounts = {
        ...user.connectedAccounts,
        twitch: true,
      };
      await user.save();
    } else {
      // Create new user if not exists
      user = await User.create({
        csrfToken: req.query.state,
        clientToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        consented: false,
        username: userData.display_name,
        email: userData.email,
        pfp: userData.profile_image_url,
        twitchId: userData.id,
        connectedAccounts: { google: false, tiktok: false, twitch: true },
      });
    }

    // Step 4: Generate JWT and set cookies
    const token = await createJwt(user._id.toString());

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      ...cookieDomain(),
    });

    res.cookie("userId", user._id.toString(), { httpOnly: false });

    // Step 5: Redirect to client
    res.redirect(`${process.env.CLIENT_URL}/home`);
  } catch (error) {
    console.error("Twitch OAuth error:", error);
    res.status(500).json({ msg: "Server error during Twitch OAuth" });
  }
}










// import { Request, Response } from "express";
// import User from "../../models/User";
// import createJwt from "../../helpers/auth/createJwt";

// export async function twitchRedirect(req: Request, res: Response): Promise<void> {
//   if (!("error" in req.query) && "code" in req.query && "state" in req.query) {
//     try {
//       const content = new URLSearchParams();
//       content.append("client_id", process.env.TWITCH_CLIENT_ID!);
//       content.append("client_secret", process.env.TWITCH_CLIENT_SECRET!);
//       content.append("code", req.query.code as string);
//       content.append("grant_type", "authorization_code");
//       content.append("redirect_uri", process.env.TWITCH_REDIRECT_URI!);

//       // 1. Exchange code for tokens
//       const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
//         method: "POST",
//         headers: { "Content-Type": "application/x-www-form-urlencoded" },
//         body: content,
//       });

//       const tokenData = await tokenResponse.json();

//       if (!tokenData.error && tokenData.access_token) {
//         try {
//           // 2. Fetch user info
//           const userResponse = await fetch("https://api.twitch.tv/helix/users", {
//             method: "GET",
//             headers: {
//               Authorization: `Bearer ${tokenData.access_token}`,
//               "Client-Id": process.env.TWITCH_CLIENT_ID!,
//             },
//           });

//           const userDataResp = await userResponse.json();
//           const userData = userDataResp.data?.[0];

//           if (userData && userData.email) {
//             // 3. Check if user exists
//             const existingUser = await User.findOne({ email: userData.email });

//             if (existingUser) {
//               const user = await User.findOneAndUpdate(
//                 { _id: existingUser._id },
//                 {
//                   clientToken: tokenData.access_token,
//                   refreshToken: tokenData.refresh_token,
//                 },
//                 { new: true }
//               );

//               if (user) {
//                 const token = await createJwt(user._id.toString());
//                 res.cookie("token", token, { httpOnly: false });

//                 if (process.env.CLIENT_URL) {
//                   res.redirect(process.env.CLIENT_URL);
//                 }
//               }
//             } else {
//               const user = await User.create({
//                 csrfToken: req.query.state,
//                 clientToken: tokenData.access_token,
//                 refreshToken: tokenData.refresh_token,
//                 consented: false,
//                 username: userData.display_name,
//                 email: userData.email,
//                 pfp: userData.profile_image_url,
//               });

//               const token = await createJwt(user._id.toString());

//               res.cookie("token", token, {
//                 httpOnly: true,
//                 secure: process.env.NODE_ENV === "production",
//                 sameSite: "lax",
//               });

//               res.cookie("userId", user._id.toString(), { httpOnly: false });

//               res.redirect(process.env.CLIENT_URL + "/home");
//             }
//           } else {
//             console.error("Twitch userData error:", userDataResp);
//             res.status(400).json({ msg: "Failed to fetch Twitch user info" });
//           }
//         } catch (e) {
//           console.error("Twitch user fetch error:", e);
//           res.status(400).json({ msg: "Error while fetching Twitch user" });
//         }
//       } else {
//         console.error("Twitch token error:", tokenData);
//         res.status(400).json({ msg: "Something went wrong in Twitch token" });
//       }
//     } catch (err) {
//       console.error("Twitch OAuth error:", err);
//       res.status(400).json({ msg: "Twitch OAuth failed" });
//     }
//   } else {
//     res.status(400).json({ msg: "Missing required query params" });
//     console.log("Twitch redirect query:", req.query);
//   }
// }
