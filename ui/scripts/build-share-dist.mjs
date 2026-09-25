/**
 * Build a www-drop tarball from the current dark player site, with Race Results
 * share cards injected. Does not deploy. Does not turn growth flags on.
 *
 * The live bundle is the results-balls screen. Rebuilding ui/ from this repo's
 * older source would replace that screen, so the drop is a patched copy of the
 * site that is already on pinballrace.com.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const sourceJs = join(here, "..", "src", "helpers", "growth", "shareCards.js");
const liveOrigin = "https://pinballrace.com";
const outDir = join(root, "dist-share-cards");
const tarball = join(root, "ui-dist-post-race-share-cards.tar.gz");

const ARE = "Are=({onClose:e,challengeId:t})=>{";
const BRE = "d.jsx(bre,{result:f,landingCap:y,noneLeft:b})";

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return buf;
}

function injection(source) {
  const body = source.replace(/^export /gm, "");
  return (
    "PostRaceShareCards=(()=>{\n" +
    body +
    "\nreturn createPostRaceShareCards({useState:w.useState,useEffect:w.useEffect,jsx:d.jsx,jsxs:d.jsxs,loadChallengesEnabled:function(base){return cb(base).then(function(s){return !!(s&&s.challenges&&s.challenges.enabled)})},readUsername:function(base){return xu(base).then(function(u){return (u&&u.username)||\"\"})},toast:Qe,pageOrigin:function(){return typeof window!==\"undefined\"&&window.location&&window.location.origin?window.location.origin:\"https://pinballrace.com\"}});\n})(),"
  );
}

async function main() {
  const shareSource = await readFile(sourceJs, "utf8");
  const snippet = injection(shareSource);
  const liveJs = await (await fetch(`${liveOrigin}/assets/index-tYF3MzOV.js`)).text();
  if (!liveJs.includes(ARE) || liveJs.split(BRE).length !== 2) {
    throw new Error("Live Race Results bundle did not match the expected modal");
  }
  if (liveJs.includes("Challenge a friend")) {
    throw new Error("Live bundle already has the share button");
  }
  const patched = liveJs.replace(ARE, `${snippet}${ARE}`).replace(
    BRE,
    `${BRE},d.jsx(PostRaceShareCards,{apiBase:R,userId:u,position:f?.user_position})`
  );
  if (!patched.includes("PostRaceShareCards") || patched === liveJs) {
    throw new Error("Patch did not apply");
  }
  if (patched.includes("oe=()=>{const shareOn") || patched.includes("Da().challenges")) {
    throw new Error("Patch must not add a Challenges hook inside the results function");
  }
  const checkPath = join(outDir, "check.mjs");
  await mkdir(outDir, { recursive: true });
  await writeFile(checkPath, patched);
  execFileSync(process.execPath, ["--check", checkPath], { stdio: "inherit" });

  const hash = createHash("sha256").update(patched).digest("hex").slice(0, 8);
  const jsName = `index-${hash}.js`;
  const site = join(outDir, "site");
  await rm(site, { recursive: true, force: true });
  await mkdir(join(site, "assets"), { recursive: true });
  await writeFile(join(site, "assets", jsName), patched);

  const html = await (await fetch(`${liveOrigin}/`)).text();
  if (!html.includes("/assets/index-tYF3MzOV.js")) {
    throw new Error("Live html does not point at the results bundle");
  }
  await writeFile(
    join(site, "index.html"),
    html.replace("/assets/index-tYF3MzOV.js", `/assets/${jsName}`)
  );

  const assetNames = [
    "index-DtlVaCtA.css",
    "1-Bn5AscYC.png",
    "1-DykyTY5P.svg",
    "10-DFJAJQWR.png",
    "11-XjaeYaSL.png",
    "12-BmmO9UAE.png",
    "13-ClgfplEi.png",
    "14-B0RBAky4.png",
    "15-BheU-Wqa.png",
    "2-BsA7E9zC.png",
    "2-Cy6v1rmW.svg",
    "3-CQOhuuZZ.png",
    "3-DgeeURTI.svg",
    "4-DofKcbfe.svg",
    "4-GHscA2QJ.png",
    "5-BbfMdHz9.svg",
    "5-BnefARQ-.png",
    "6-ZLKoaEac.png",
    "7-C-FAEQS2.png",
    "8-CKMl62d3.png",
    "9-DGVxNIl_.png",
    "logo-BjS8wTWH.png",
    "orilogo-oPFOkHYV.png",
  ];
  await Promise.all([
    ...assetNames.map((name) => download(`${liveOrigin}/assets/${name}`, join(site, "assets", name))),
    ...Array.from({ length: 15 }, (_, index) =>
      download(`${liveOrigin}/ball${index + 1}.png`, join(site, `ball${index + 1}.png`))
    ),
    download(`${liveOrigin}/favicon.png`, join(site, "favicon.png")),
    download(`${liveOrigin}/TwemojiCountryFlags.woff2`, join(site, "TwemojiCountryFlags.woff2")),
  ]);

  await rm(tarball, { force: true });
  execFileSync("tar", ["-czf", tarball, "-C", site, "."], { stdio: "inherit" });
  const packed = await readFile(tarball);
  const sum = createHash("sha256").update(packed).digest("hex");
  const summary = {
    file: "ui-dist-post-race-share-cards.tar.gz",
    bytes: packed.length,
    sha256: sum,
    bundle: `assets/${jsName}`,
    flags: "Challenges stays off until the existing player-service flag says so",
  };
  await writeFile(join(root, "ui-dist-post-race-share-cards.sha256"), `${sum}  ui-dist-post-race-share-cards.tar.gz\n`);
  await rm(outDir, { recursive: true, force: true });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
