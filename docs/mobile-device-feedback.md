# Device feedback fixes, October 23, 2026

## Cloud history compatibility

Web history permits its selected `activeRoundId` to refer to a completed round. Native uses that field only for unfinished rounds. Native import previously rejected the otherwise valid save after the user approved Download. Normalize a completed selected round to a null active pointer, preserving every round, solve and provenance field. The selected event follows the imported round. Keep the recovery copy and read back the committed history before reporting success.

All Stats now lists every event with event labels. Upload and Download are adjacent; Cloud Save has an accessible refresh icon. Confirmations show solve/round counts and one overwrite sentence. Account deletion and password entry live behind a red action and popup.

## Practice

No-wait practice has an optional Ready Screen, off by default. With it off, scramble confirmation enters inspection immediately when enabled. Without inspection, the armed timer displays 0.00, then uses the configured hold/release behavior. Existing explicit Ready and nonzero waiting flows remain available.

Long scramble notation scrolls at the selected font size, without automatic shrinking, line truncation or fixed percentage text height. This keeps the scramble confirmation control accessible with long 6×6 and 7×7 notation.

## Verification before binary build

- Mobile TypeScript and 116 domain/bridge/bundler tests passed before engine performance changes.
- Regression fixture downloads a multi-event web save with a completed active round through the real transfer and storage logic, verifies replacement/reopening and retention of the recovery copy.
- An isolated headless rendering harness exercised the actual App and AccountPanel with native-service adapters: direct inspection, optional Ready, 0.00 timer start/stop, download into All Stats, upload of the resulting state, hidden deletion popup, and exact 16/40 px sizing for both 6×6 and 7×7. No page runtime errors. This is not native-device testing.
- The reported real cloud save was inspected read-only; its stored checksum passed and its completed active pointer confirmed the compatibility issue. No user save was modified by diagnosis.

Engine timing work and the next native build remain in progress. No new build or device acceptance is claimed here.
