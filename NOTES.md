# Race Results share cards (offline package)

Gregg asked for this as an offline build. Nothing here was deployed. No growth switch was turned on. Do not copy this onto the live site until you stamp it.

## What players see while Challenges is off

Race Results stays the screen they have now.

- Position and points
- How many on-demand races are left today (or the daily limit line, if that count is missing)
- Play the next race
- Close

There is no Challenge a friend button and no Share this race button. Nothing new to tap, and nothing that leads to a dead end.

## What players see after you later turn Challenges on

The buttons show up on that same dark Race Results screen, under the races-left line. They do not use up a play. A player can ignore both and just press Close or Play the next race.

| Finish | Challenge a friend | Share this race |
| --- | --- | --- |
| 1st to 5th | Yes | Yes |
| 6th to 10th | No | Yes |
| 11th to 15th | No | No |
| Shown as 10+ (did not place) | No | No |

**Challenge a friend** opens a list of people they follow and their friends.

- They can send to at most 3 people they follow.
- Until they have a friend, 3 is also the total.
- Once they have a friend, they can send 5 in total. The extra places are friends only, not a 4th or 5th person they only follow.

**Share this race** makes a public link on this site, shaped like `https://pinballrace.com/c/…`. They can use the phone share sheet or copy the link.

The card itself only says their username and their place, for example: “Beat Ada — finished 3rd.” The world card adds “win a free race.” It does not say which ball they picked, and it does not say which race video it was. Players still pick balls 1–15. The card does not call them pins.

## The file to drop later

`ui-dist-post-race-share-cards.tar.gz`

- SHA-256: `0ba51fbeb7e3a3d4ad7646a041c84dc39698e8ab80dc535ee7649b3c9cd3f508`
- Size: 2,951,685 bytes
- Script file inside it: `assets/index-a4545ed7.js`

This is the current dark site, plus the hidden share buttons. It is not a from-scratch rebuild of the older source tree.

When you do stamp a drop onto the website folder, keep the existing `robots.txt`, `sitemap.xml`, and `demo.mp4`. This package does not include those, and unpacking it will not delete them.

## If a send fails after Challenges is on

The player service already has the two create routes (`/challenges/bets` for a friend, `/challenges/public` for the world link). This package does not change that service and does not add a new server.

The site sends the signed-in player, the finish place, and (for a friend) who it is for. It does not send a ball number or a race id.

If the service refuses the card, the screen says so and does not pretend the card was made. Close and Play the next race still work.

## How to check after a future stamp

1. Leave Challenges off. Finish an on-demand race. Race Results should look as it does today, with no share buttons.
2. Only after you decide to turn Challenges on: 1st–5th shows both buttons, 6th–10th shows only Share this race, 11th or worse shows neither.
