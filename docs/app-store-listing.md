# App Store listing for 1.0 (draft, November 13, 2026)

Copy these into App Store Connect. Anything marked **(you)** is a choice only the owner can make or confirm.

## App information

| Field | Value |
| --- | --- |
| Name | Cubing Comp Sim |
| Subtitle (30 chars max) | Practice competition rounds |
| Bundle ID | com.cubingcompsim.app |
| Primary category | Utilities |
| Age rating | 4+. Questionnaire: answer "None" to every content question; no unrestricted web access; no user-generated content shared with others; no gambling, contests or medical content |
| Content rights | Does not contain, show or access third-party content |
| Price | Free |
| Copyright | 2026 Brandon True |
| Support URL | https://github.com/Brandonius813/cubing-comp-sim/issues |
| Marketing URL (optional) | https://cubingcompsim.com |
| Privacy policy URL | https://cubingcompsim.com/privacy/ |

## Version 1.0 text

**Promotional text:** Simulate a cubing competition

**Description** (owner's wording, plus the non-affiliation line):
> Practice like it's an official WCA competition!
>
> This is a speed cubing timer app, but set up to track times and "flow" like a competition round. You can add forced waiting time between solves, like you're waiting for your puzzle at a competition, the app tracks your times by ao5 or mo3, depending on the event, and will generate a BPA/WPA for each round.
>
> It also has a cloud save feature, so that you can solve on your phone or laptop, then pick up where you left off on either device.
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

Required: **iPhone 6.9"** (1320 × 2868 or 1290 × 2796). 1.0 is iPhone-only, so no iPad screenshots. Uploaded: scramble, round in progress, round complete, All Stats. Take 3–5 each on a real device, with no personal account details on screen:

1. Practice with a 3x3 or 4x4 scramble and its drawing
2. Timer running (or inspection countdown)
3. Completed round scorecard with an average
4. Settings
