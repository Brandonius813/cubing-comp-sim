# Mobile UI review

The preview uses a three-page horizontal pager: Scorecard, Practice (initial), Settings. No header or bottom navigation. Navigation remains available; leaving an active inspection/solve records an interrupted DNF for review. Leaving a stopped solve preserves it. Stationary stop gestures use the touch-down timestamp, while swipes are not timer presses.

Practice has a plain scramble, centered timer/manual entry, optional scramble drawing, three loading dots, and Continue after a result. It does not scroll. Active timing hides the scramble and drawing. Scorecard has the event selector, desktop result boxes, editable penalties/times, and an event-filtered history sheet. Settings use one background, inline controls, system/light/dark appearance, fixed 550 ms hold, random-wait range slider, four voice styles and a 0–100 volume slider.

Validation: TypeScript passed; 102 mobile domain tests and 3 engine bundler tests passed; iOS export passed. Actual Scorecard and Settings components were rendered using a temporary React Native Web harness at 390×844 in light/dark mode with no runtime errors. Those checks do not establish native pager, keyboard, sound or touch behavior. Native simulator/device testing was unavailable locally.

Still requiring physical-device acceptance: timer and swipe discrimination, stopped-result preservation across settings changes, inspection audio, iPad/landscape sizing, slider/pager interaction, email login and explicit cloud upload/download. No authenticated cloud round trip was claimed.

Desktop parity limits: interface translations and bundled Geist fonts are not yet ported; native font choices are available. Hardware-keyboard shortcut customization is absent. Voice style is currently one global preference rather than remembered separately per language. JSON transfer still uses sharing and pasted JSON. End-round/back gesture scheme remains deferred as requested. Native telemetry is not configured, so browser telemetry controls are not shown. Shared timing, scoring, scramble generation, history validation, event formats and goal/bounds calculations remain reused.
