# Later stamp — dark growth screens, switches still off

Do not do this until you say so. This note is only the checklist for that later copy. Nothing here turns a switch on, sends email, or merges the pull request.

## What you are copying

The new public site files are the built `ui/dist` folder from this branch. They are the same dark Pinball Race site, plus growth screens that stay hidden while the switches are off.

Copy those built files onto the live site folder `/var/www/html`.

## What you must keep

When you copy, do not wipe these. They are not inside `ui/dist`, and a careless replace will drop them:

- `robots.txt`
- `sitemap.xml`
- `demo.mp4` (the homepage background video)

Leave the player API on port 8080 alone. Leave the race desk alone. Do not restart those services for this UI copy.

## Switches stay off

Play ledger, invites, challenges, friends, and share day stay off. With them off, players still see the current on-demand race: pick a ball, “Watching the race”, no close and no skip, results open on their own.

The new screens (plays left, invite, challenge, friends, share day, follow) do not show until you turn the matching switch on later, from the race-desk Growth page, in a separate step.

## After the copy

Open the site and play one on-demand race. You should still get “Watching the race” and then results, with no skip button. You should not see invite, friends, challenges, or share day.
