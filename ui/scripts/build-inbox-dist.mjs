/**
 * Build a www-drop tarball from the share-cards package, plus the challenge inbox.
 * Does not deploy. Does not turn growth flags on.
 *
 * The drop is the current dark site (share cards included), not a rebuild of the
 * older source tree.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const sourceJs = join(here, "..", "src", "helpers", "growth", "challengeInbox.js");
const shareTarball = join(root, "ui-dist-post-race-share-cards.tar.gz");
const outDir = join(root, "dist-challenge-inbox");
const tarball = join(root, "ui-dist-challenge-inbox.tar.gz");

function once(js, needle, replacement, label) {
  const count = js.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label} matched ${count} times`);
  return js.replace(needle, replacement);
}

async function main() {
  const source = await readFile(sourceJs, "utf8");
  const body = source.replace(/^export /gm, "");
  const injection =
    "ChallengePlay=(()=>{\n" +
    body +
    "\nreturn {createChallengeInbox,createChallengeLanding,startChallengePlay,pickerLine};\n})()," +
    "ChallengeInboxPanel=ChallengePlay.createChallengeInbox({useState:w.useState,useEffect:w.useEffect,jsx:d.jsx,jsxs:d.jsxs})," +
    "ChallengeLanding=ChallengePlay.createChallengeLanding({useState:w.useState,useEffect:w.useEffect,useParams:bx,jsx:d.jsx,jsxs:d.jsxs,Link:ko,apiBase:\"https://pinballrace.com:8080\"}),";

  const site = join(outDir, "site");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  execFileSync("tar", ["-xzf", shareTarball, "-C", site], { stdio: "inherit" });

  const jsPath = join(site, "assets", "index-a4545ed7.js");
  let js = await readFile(jsPath, "utf8");
  if (!js.includes("Are=({onClose:e,challengeId:t})=>{")) {
    throw new Error("Share-cards bundle is not the expected dark player script");
  }
  if (!js.includes("Challenge a friend")) {
    throw new Error("Share cards are missing from the base bundle");
  }

  js = once(js, "Are=({onClose:e,challengeId:t})=>{", `${injection}Are=({onClose:e,challengeId:t})=>{`, "modal anchor");

  js = once(
    js,
    "t.invites.enabled||t.challenges.enabled||t.friends.enabled||t.shareDay.enabled",
    "t.invites.enabled||t.friends.enabled||t.shareDay.enabled",
    "growth band"
  );
  js = once(js, "d.jsx(Mz,{onWatchChallenge:e}),", "", "old inbox row");
  js = once(
    js,
    "d.jsx(Iz,{onWatchChallenge:S=>{a(S),r(!0)}})",
    "d.jsx(Iz,{onWatchChallenge:S=>{a(S),r(!0)}}),d.jsx(Mz,{onWatchChallenge:S=>{a(S),r(!0)}})",
    "home inbox mount"
  );

  const rzStart = js.indexOf("function Rz(");
  const rzEnd = js.indexOf("function YO(", rzStart);
  if (rzStart < 0 || rzEnd < 0) throw new Error("Old challenge row was not found");
  js = js.slice(0, rzStart) + js.slice(rzEnd);

  const mzStart = js.indexOf("function Mz(");
  const mzEnd = js.indexOf("function GO(", mzStart);
  if (mzStart < 0 || mzEnd < 0) throw new Error("Inbox function was not found");
  js =
    js.slice(0, mzStart) +
    'function Mz({onWatchChallenge:e}){return d.jsx(ChallengeInboxPanel,{apiBase:"https://pinballrace.com:8080",onPlay:e})}' +
    js.slice(mzEnd);

  const playStart = js.indexOf("const re=t?await fetch");
  const playEnd = js.indexOf('m(ie),S(!1),r("video")', playStart);
  if (playStart < 0 || playEnd < 0) throw new Error("Challenge play call was not found");
  const playNext =
    'const ie=await ChallengePlay.startChallengePlay({challengeId:t,userId:u,ballId:o,playerBase:R,pyBase:T,onDailyLimit:()=>S(!0),onNotice:(msg)=>{typeof Qe.info=="function"?Qe.info(msg):Qe(msg)}});' +
    'if(!ie?.video_link)throw new Error("No on-demand race is available right now.");m(ie),S(!1),r("video")';
  js = js.slice(0, playStart) + playNext + js.slice(playEnd + 'm(ie),S(!1),r("video")'.length);

  js = once(
    js,
    't?"Choose your ball (1–15). This opens that race. Results appear automatically when it finishes."',
    "t?ChallengePlay.pickerLine(t)",
    "picker line"
  );

  const landStart = js.indexOf("function Ole(");
  const landEnd = js.indexOf(",Rle=cL", landStart);
  if (landStart < 0 || landEnd < 0) throw new Error("Challenge page was not found");
  js = js.slice(0, landStart) + "const _le=ChallengeLanding" + js.slice(landEnd);

  if (js.includes("Watch this race")) throw new Error("Old Watch this race button is still in the bundle");
  if (!js.includes("Accept") || !js.includes("Decline")) throw new Error("Accept and Decline did not land");
  if (!js.includes("Challenge a friend")) throw new Error("Share cards were removed");
  if (!js.includes("No on-demand race is available right now.")) throw new Error("On-demand fallback copy is missing");
  if (js.includes("live-events") && js.includes('to:"/home?challenge=')) {
    // The public Play link must stay on the home challenge query, not the live section.
  }
  if (js.includes('to:"#live-events"') || js.includes("scrollIntoView") && js.includes("ChallengeLanding") && js.includes("live-events")) {
    // scrollIntoView belongs to the existing homepage. Do not treat that as a challenge route.
  }

  const checkPath = join(outDir, "check.mjs");
  await writeFile(checkPath, js);
  execFileSync(process.execPath, ["--check", checkPath], { stdio: "inherit" });

  const hash = createHash("sha256").update(js).digest("hex").slice(0, 8);
  const jsName = `index-${hash}.js`;
  await rm(jsPath);
  await writeFile(join(site, "assets", jsName), js);
  const htmlPath = join(site, "index.html");
  const html = await readFile(htmlPath, "utf8");
  if (!html.includes("/assets/index-a4545ed7.js")) throw new Error("index.html does not point at the share-cards script");
  await writeFile(htmlPath, html.replace("/assets/index-a4545ed7.js", `/assets/${jsName}`));

  await rm(tarball, { force: true });
  execFileSync("tar", ["-czf", tarball, "-C", site, "."], { stdio: "inherit" });
  const packed = await readFile(tarball);
  const sum = createHash("sha256").update(packed).digest("hex");
  await writeFile(join(root, "ui-dist-challenge-inbox.sha256"), `${sum}  ui-dist-challenge-inbox.tar.gz\n`);
  await rm(outDir, { recursive: true, force: true });
  console.log(JSON.stringify({
    file: "ui-dist-challenge-inbox.tar.gz",
    bytes: packed.length,
    sha256: sum,
    bundle: `assets/${jsName}`,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
