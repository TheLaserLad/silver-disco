# Challenge inbox (offline package)

Gregg asked for this as the next player screen after share cards. Nothing here was deployed. Challenges stays off. Do not copy this onto the live site until you stamp it.

This file replaces the earlier share-card note. The share buttons are still in this same package.

## What players see while Challenges is off

The site looks as it does today.

- Home stays the dark on-demand page. There is no Challenges block, no Accept, and no Decline.
- Race Results still has no Challenge a friend button and no Share this race button.
- A link such as `https://pinballrace.com/c/…` says the challenge is not open, and sends the person back to Pinball Race. It does not start a race.

Nothing new to tap, and nothing that leads to a dead end.

## What players see after you later turn Challenges on

Signed-in players get a Challenges notice on the home screen only when someone has sent them an open bet. If there is nothing waiting, the notice stays hidden.

Each row shows who sent it and their finish place, for example: “Beat Ada — finished 3rd.” It does not show which ball they picked, and it does not show which race video it was. Players still pick balls 1–15. The card does not call them pins.

- **Accept** opens that on-demand race. They pick a ball from 1–15, watch the race, and see results when it finishes. That uses one normal daily play when the play counter is on.
- **Decline** closes that send.
- They can also ignore it. An open send lasts 7 days.

If the race that created the challenge is no longer available, the screen says so and offers another on-demand race. It does not send them to Live Events or to “No Current Game.”

A public link `https://pinballrace.com/c/…` shows the same kind of line, with “win a free race” on the world card. **Play** follows the same on-demand rules.

Share cards on Race Results are unchanged: 1st–5th can challenge a friend and share, 6th–10th can only share, 11th or worse sees neither. Those buttons still do not use a play.

## The file to drop later

`ui-dist-challenge-inbox.tar.gz`

- SHA-256: `58f6ace7fca802f0092b833e44a8a2588acc7c2ce0d7f061b2bd6d1a9b27077c`
- Size: 2,953,654 bytes
- Script file inside it: `assets/index-2a9b0780.js`

This is the current dark site, plus the hidden share buttons, plus the hidden challenge inbox. It is not a from-scratch rebuild.

When you do stamp a drop onto the website folder, keep the existing `robots.txt`, `sitemap.xml`, and `demo.mp4`. This package does not include those, and unpacking it will not delete them.

## If a button fails after Challenges is on

The player service already has the inbox and the buttons. This package does not change that service and does not add a new server.

- Home reads open bets from the inbox.
- Accept and Decline use the existing bet routes.
- Play uses the existing challenge play route, and if that race is gone it uses the same on-demand play route as Play On-Demand Race.

The card never sends a ball number or a race id to the screen. If the service refuses the action, the screen says so and does not pretend it worked.

## How to check after a future stamp

1. Leave Challenges off. Home should look as it does today. Open a `/c/…` link: it should say the challenge is not open, with no Play button.
2. Only after you decide to turn Challenges on: a signed-in player with an open bet sees the sender’s name and finish place, and can Accept or Decline. Accept picks a ball and plays an on-demand race. If that race is gone, they get another on-demand race, not Live Events.
