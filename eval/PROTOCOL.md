# Study protocol: guided UI vs basic workflow

**Status:** draft. Before running, check with Prof. Li whether ethics approval or a consent form is needed for classmates.

## Design
- Within-subjects. Each participant does the **same 6 tasks** (`truth.json`) in both conditions.
- Counterbalance: odd-numbered P (P01, P03, ...) do baseline first; even-numbered P do guided first.
- Target 5–8 participants (exploratory). Report this as a limitation.
- One device (laptop or phone browser) and the same room for every participant.

## Conditions
- **Baseline:** phone camera, then copy photos into a folder, then fill `baseline-template.csv` in Excel/Numbers (same fields, same allowed values listed in the header comment). No validation.
- **Guided:** this app (`src/index.html`), then export the ZIP.

## Procedure (≈25 min per participant)
1. Consent + 1-minute explanation of the fields (same script for both conditions).
2. Condition A: hand over the 6 task cards. Start the stopwatch at the first card and stop it when the export or save is done. Record the seconds.
3. SUS questionnaire for condition A.
4. Repeat steps 2–3 for condition B.
5. Two open questions: "What was hardest?" and "What would you change?"

## Files to collect per participant
`results/P01-baseline.csv`, `results/P01-guided.zip`, and one row in `timing-sus.csv` per condition.

## Analysis
```
node eval/score.mjs eval/truth.json eval/results
node eval/sus.mjs eval/timing-sus.csv
```
Report the means per condition, per-participant tables, the time cost, and limitations: small n, simulated tasks, a learning effect partly controlled by counterbalancing, and that validation guarantees format, not truth.

## SUS items (Brooke, 1996), each rated 1 = strongly disagree to 5 = strongly agree
1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to be able to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.
