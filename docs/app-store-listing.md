# App Store listing for 1.0 (draft, November 13, 2026)

Copy these into App Store Connect. Anything marked **(you)** is a choice only the owner can make or confirm.

## App information

| Field | Value |
| --- | --- |
| Name | Cubing Comp Sim |
| Subtitle (30 chars max) | Practice competition rounds |
| Bundle ID | com.cubingcompsim.app |
| Primary category | Sports **(you: or Utilities)** |
| Age rating | 4+. Questionnaire: answer "None" to every content question; no unrestricted web access; no user-generated content shared with others; no gambling, contests or medical content |
| Content rights | Does not contain, show or access third-party content |
| Price | Free |
| Copyright | 2026 Brandon True |
| Support URL | https://github.com/Brandonius813/cubing-comp-sim/issues |
| Marketing URL (optional) | https://cubingcompsim.com |
| Privacy policy URL | https://cubingcompsim.com/privacy/ |

## Version 1.0 text

**Promotional text (170 chars max):**
> Practice like it's competition day: official-style scrambles, 15-second inspection with callouts, and a scorecard that averages your round the way the WCA does.

**Description:**
> Cubing Comp Sim turns practice into a competition round.
>
> Pick an event and get a fresh, random-state scramble with a drawing of the scrambled puzzle. Scrambles are generated on your phone by TNoodle, the same scramble program used at official competitions, and work offline.
>
> • Hold-and-release timer with optional 15-second inspection and spoken 8- and 12-second callouts
> • +2 and DNF penalties, including inspection penalties
> • Round scorecards with averages and means calculated like an official round
> • Typed time entry if you use a separate timer
> • 2x2 through 7x7, blindfolded, one-handed, Megaminx, Pyraminx, Skewb, Square-1, Clock and more
> • Optional account (Apple, Google, WCA or email) to back up your history to the cloud. Uploads and downloads only happen when you tap them.
>
> Practice as a guest: no account needed. Cubing Comp Sim is free and open source (GPL-3.0).
>
> Cubing Comp Sim is an independent project and is not affiliated with or endorsed by the World Cube Association.

**Keywords (100 chars max):**
`cubing,speedcubing,rubiks,cube,timer,scramble,wca,competition,inspection,average,3x3,practice`

**What's New:** First release.

## App Privacy ("nutrition label")

Tracking: **No**. The app does not track users across other companies' apps or websites.

Data collected, all used only for **App Functionality** and **linked to the user** (only when they create an account):

| Apple category | What it is |
| --- | --- |
| Contact Info › Email Address | Account email (can be an Apple private relay address) |
| Identifiers › User ID | Account ID; Apple/Google/WCA account identifier |
| User Content › Other User Content | Cloud save of practice history, only after tapping Upload |

Probably also declare, **not linked** to the user, purpose App Functionality: **Diagnostics › Other Diagnostic Data** (the cloud API keeps request outcomes, timing and error codes). **(you: confirm.)** Apple counts server logs kept longer than needed to answer the request.

Not collected: location, contacts, photos, health, financial info, browsing history, search history, purchases, usage data/analytics, crash data (the iPhone app has no PostHog/Sentry).

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false`: the app only uses the encryption built into iOS (HTTPS, Keychain). Answer "None of the algorithms mentioned above" / exempt.

## Notes for App Review

> No account is needed: the app opens on the Practice screen as a guest. Swipe right for the Scorecard and left for Settings.
>
> To try a solve: tap the scramble to confirm you've scrambled the cube, then hold your finger on the screen and release to start the timer, then tap to stop.
>
> Accounts are optional (Settings › Account & cloud save) and support Sign in with Apple, Google, WCA and email. To delete an account: Settings › Account & cloud save › Delete account and cloud save. Apple/Google/WCA users confirm by signing in again with that provider; email users enter their password. Deletion revokes the app's Sign in with Apple authorization.
>
> Scrambles are generated on the device by TNoodle (GPL-3.0). The app's source code is public at https://github.com/Brandonius813/cubing-comp-sim under GPL-3.0.

If Apple asks for a demo account, create a throwaway email account and enter it only in App Store Connect's private "Sign-in information" fields, never in GitHub.

## Screenshots (you)

Required: **iPhone 6.9"** (1320 × 2868 or 1290 × 2796) and, because the app runs on iPad, **iPad 13"** (2064 × 2752 or 2048 × 2732). Take 3–5 each on a real device, with no personal account details on screen:

1. Practice with a 3x3 or 4x4 scramble and its drawing
2. Timer running (or inspection countdown)
3. Completed round scorecard with an average
4. Settings
