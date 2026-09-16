import { Request, Response } from "express";
import User from "../../models/User";
import createJwt from "../../helpers/auth/createJwt";
import cookieDomain from "../../helpers/auth/cookieDomain";

export async function googleRedirect(req: Request, res: Response): Promise<void> {
  if (!("error" in req.query) && "code" in req.query && "state" in req.query) {
    try {
      const content = new URLSearchParams();
      content.append("code", req.query.code as string);
      content.append("client_id", process.env.GOOGLE_CLIENT_ID || "empty");
      content.append("client_secret", process.env.GOOGLE_CLIENT_SECRET || "empty");
      content.append("grant_type", "authorization_code");
      content.append(
        "redirect_uri",
        process.env.GOOGLE_REDIRECT_URI ||
          "https://pinballrace.com:8080/unrestricted/auth/google"
      );

      // 1️⃣ Exchange code for access token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: content,
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error || !tokenData.access_token) {
        console.error("Google token error:", tokenData);
        res.status(400).json({ msg: "Failed to obtain Google token" });
        return;
      }

      // 2️⃣ Fetch user info from Google
      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      const userData = await userResponse.json();

      if (!userData || !userData.email) {
        res.status(400).json({ msg: "Failed to fetch Google user info" });
        return;
      }

      // 3️⃣ Check if user exists
      let user = await User.findOne({ email: userData.email });

      if (user) {
        // Update existing user
        user.googleId = userData.id;
        user.clientToken = tokenData.access_token;
        user.refreshToken = tokenData.refresh_token;
        user.connectedAccounts = {
          ...(user.connectedAccounts || {}),
          google: true,
        };
        await user.save();
      } else {
        // Create a new user
        user = await User.create({
          googleId: userData.id,
          csrfToken: req.query.state,
          clientToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          consented: false,
          username: userData.name,
          email: userData.email,
          pfp: userData.picture,
          connectedAccounts: { google: true, tiktok: false, twitch: false },
        });
      }

      // 4️⃣ Generate JWT and set cookie
      const jwt = await createJwt(user._id.toString());

      res.cookie("token", jwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        ...cookieDomain(),
      });

      res.cookie("userId", user._id.toString(), { httpOnly: false });

      // 5️⃣ Redirect to client
      res.redirect(process.env.CLIENT_URL + "/home");
    } catch (err) {
      console.error("Google OAuth error:", err);
      res.status(500).json({ msg: "Google OAuth failed" });
    }
  } else {
    console.log("Google redirect query:", req.query);
    res.status(400).json({ msg: "Missing required query params" });
  }
}











// import { Request, Response } from "express";
// import User from "../../models/User";
// import createJwt from "../../helpers/auth/createJwt";

// export async function googleRedirect(req: Request, res: Response): Promise<void> {
//   if (!("error" in req.query) && "code" in req.query && "state" in req.query) {
//     try {
//       const content = new URLSearchParams();
//       content.append("code", req.query.code as string);
//       content.append("client_id", process.env.GOOGLE_CLIENT_ID || "empty");
//       content.append("client_secret", process.env.GOOGLE_CLIENT_SECRET || "empty");
//       content.append("grant_type", "authorization_code");
//       content.append(
//         "redirect_uri",
//         process.env.GOOGLE_REDIRECT_URI ||
//           "https://pinballrace.com:8080/unrestricted/auth/google"
//       );

//       // 1. Exchange code for tokens
//       const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
//         method: "POST",
//         headers: { "Content-Type": "application/x-www-form-urlencoded" },
//         body: content,
//       });

//       const tokenData = await tokenResponse.json();

//       if (!tokenData.error && tokenData.access_token) {
//         try {
//           // 2. Fetch user info
//           const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
//             method: "GET",
//             headers: { Authorization: `Bearer ${tokenData.access_token}` },
//           });

//           const userData = await userResponse.json();

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
//                 username: userData.name,
//                 email: userData.email,
//                 pfp: userData.picture,
//               });

//               // Generate JWT
//               const token = await createJwt(user._id.toString());

//               // Set JWT in cookie
//               res.cookie("token", token, {
//                 httpOnly: true,   // more secure
//                 secure: process.env.NODE_ENV === "production",
//                 sameSite: "lax",
//               });

//               // Optional: also keep userId in a JS-accessible cookie
//               res.cookie("userId", user._id.toString(), { httpOnly: false });

//               // Redirect to home page
//               res.redirect(process.env.CLIENT_URL + "/home");

//             }
//           } else {
//             console.error("Google userData error:", userData);
//             res.status(400).json({ msg: "Failed to fetch Google user info" });
//           }
//         } catch (e) {
//           console.error("Google user fetch error:", e);
//           res.status(400).json({ msg: "Error while fetching Google user" });
//         }
//       } else {
//         console.error("Google token error:", tokenData);
//         res.status(400).json({ msg: "Something went wrong in Google token" });
//       }
//     } catch (err) {
//       console.error("Google OAuth error:", err);
//       res.status(400).json({ msg: "Google OAuth failed" });
//     }
//   } else {
//     res.status(400).json({ msg: "Missing required query params" });
//     console.log("Google redirect query:", req.query);

//   }
// }
